#!/usr/bin/env python3
"""
apply_image_urls.py

Reads outputs/audit/images_needing_sourcing.csv (after you fill in
'replacement_image_url' for each product), downloads each URL, uploads
via SFTP, and sets it as the product featured image using wp media import.

Also works for any CSV with columns: product_id, replacement_image_url

Usage:
  # Dry-run: see what would be done
  python scripts/apply_image_urls.py

  # Apply changes
  python scripts/apply_image_urls.py --confirm

  # Use a different input CSV
  python scripts/apply_image_urls.py --csv outputs/audit/my_fixes.csv --confirm
"""
from __future__ import annotations
import argparse
import csv
import os
import re
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

try:
    import paramiko
    from dotenv import load_dotenv
except ImportError:
    print("Missing deps: pip install paramiko python-dotenv")
    sys.exit(1)

WORKSPACE = Path(__file__).resolve().parent.parent
DEFAULT_CSV = WORKSPACE / "outputs" / "audit" / "images_needing_sourcing.csv"
OUTPUT_LOG = WORKSPACE / "outputs" / "audit" / "apply_image_urls_log.csv"

load_dotenv(WORKSPACE / ".env")
SSH_HOST = os.getenv("HMOON_SSH_HOST", "")
SSH_USER = os.getenv("HMOON_SSH_USER", "")
SSH_PASS = os.getenv("HMOON_SSH_PASS", "")
SITE_DIR = "/home/wp_9dm4yz/hmoonhydro.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def connect_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS, timeout=30)
    return ssh


def run_remote(ssh: paramiko.SSHClient, cmd: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip()


def download_image(url: str, dest_path: str) -> bool:
    """Download image URL to local temp file. Returns True on success."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        if len(data) < 1000:
            print(f"    WARN: Downloaded file is very small ({len(data)} bytes)")
        with open(dest_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"    DOWNLOAD ERROR: {e}")
        return False


def apply_image(ssh: paramiko.SSHClient, product_id: str, local_file: str,
                filename: str) -> tuple[str, str]:
    """Upload local_file to server, set as featured image. Returns (status, attachment_id)."""
    remote_tmp = f"/tmp/hmoon_img_{product_id}_{filename}"
    sftp = ssh.open_sftp()
    sftp.put(local_file, remote_tmp)
    sftp.close()

    # Check if product has a thumbnail already (allow overwrite — this is a correction)
    out = run_remote(
        ssh,
        f"cd {SITE_DIR} && wp media import {remote_tmp} "
        f"--post_id={product_id} --featured_image --porcelain --allow-root 2>&1",
    )
    run_remote(ssh, f"rm -f {remote_tmp}")

    if out.isdigit():
        return ("OK", out)
    return ("ERROR", out[:200])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", action="store_true", help="Apply changes (default: dry-run)")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Input CSV file path")
    parser.add_argument("--batch-delay", type=float, default=1.0, help="Delay between uploads (s)")
    args = parser.parse_args()

    dry_run = not args.confirm
    input_csv = Path(args.csv)

    if not input_csv.exists():
        print(f"ERROR: CSV not found: {input_csv}")
        sys.exit(1)

    # Load rows with replacement URLs filled in
    all_rows = list(csv.DictReader(open(input_csv, encoding="utf-8")))
    rows = [r for r in all_rows if r.get("replacement_image_url", "").strip()]

    print(f"=== Apply Image URLs ===")
    print(f"Mode: {'DRY-RUN' if dry_run else 'CONFIRM'}")
    print(f"Input: {input_csv.name}")
    print(f"Total rows in CSV: {len(all_rows)}")
    print(f"Rows with replacement URL filled in: {len(rows)}")
    print()

    if not rows:
        print("No replacement URLs filled in. Open the CSV and add URLs in 'replacement_image_url' column.")
        return

    if dry_run:
        print("DRY-RUN — would process:")
        for r in rows:
            pid = r.get("product_id", "?")
            sku = r.get("sku", "")
            name = r.get("product_name", r.get("name", ""))
            url = r["replacement_image_url"]
            print(f"  [{pid}] {sku:12} {name[:40]:40} <- {url[:60]}")
        print(f"\nRun with --confirm to apply.")
        return

    ssh = connect_ssh()
    log_rows = []
    ok = error = skip = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        for i, row in enumerate(rows, 1):
            pid = row.get("product_id", "").strip()
            sku = row.get("sku", "").strip()
            name = row.get("product_name", row.get("name", "?"))
            url = row["replacement_image_url"].strip()

            if not pid or not url:
                print(f"  [{i}] SKIP: missing product_id or url")
                skip += 1
                continue

            print(f"  [{i}/{len(rows)}] {sku} {name[:40]}", end=" ... ", flush=True)

            # Derive filename from URL or SKU
            url_filename = re.sub(r"\?.*$", "", url).split("/")[-1]
            ext = Path(url_filename).suffix or ".jpg"
            safe_name = re.sub(r"[^a-z0-9._-]", "_", (sku or f"product_{pid}").lower()) + ext
            local_file = os.path.join(tmpdir, safe_name)

            # Download
            if not download_image(url, local_file):
                print("DOWNLOAD_FAILED")
                log_rows.append({"product_id": pid, "sku": sku, "name": name,
                                  "url": url, "status": "DOWNLOAD_FAILED", "attachment_id": ""})
                error += 1
                continue

            # Upload and set
            status, att_id = apply_image(ssh, pid, local_file, safe_name)
            print(status + (f" (att {att_id})" if status == "OK" else f": {att_id[:60]}"))
            log_rows.append({"product_id": pid, "sku": sku, "name": name,
                              "url": url, "status": status, "attachment_id": att_id})
            if status == "OK":
                ok += 1
            else:
                error += 1

            if i < len(rows):
                time.sleep(args.batch_delay)

    # Flush cache once at end
    run_remote(ssh, f"cd {SITE_DIR} && wp cache flush --allow-root")
    ssh.close()

    # Write log
    if log_rows:
        with open(OUTPUT_LOG, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["product_id","sku","name","url","status","attachment_id"])
            w.writeheader()
            w.writerows(log_rows)

    print(f"\n{'='*50}")
    print(f"Results: {ok} OK, {error} errors, {skip} skipped")
    if log_rows:
        print(f"Log: {OUTPUT_LOG.relative_to(WORKSPACE)}")


if __name__ == "__main__":
    main()
