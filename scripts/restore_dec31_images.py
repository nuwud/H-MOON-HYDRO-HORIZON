#!/usr/bin/env python3
"""
restore_dec31_images.py

For products that:
 - Have no image in the current WooCommerce store (Feb 2026 state)
 - Had an image in the Dec 31 2025 export
 - Have the corresponding image file available locally in hmoonhydro.com/wp-content/uploads/

This script:
 1. Builds a match list (SKU -> local image path)
 2. For each match, uploads the local image via 'wp media import'
 3. Sets it as the product featured image via 'wp post meta update'
 4. Supports --dry-run (default) and --confirm

Usage:
  # See what would be done
  python scripts/restore_dec31_images.py

  # Apply (uploads images to live site)
  python scripts/restore_dec31_images.py --confirm

  # Single SKU
  python scripts/restore_dec31_images.py --sku hmh00012 --confirm
"""
from __future__ import annotations
import argparse
import csv
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

try:
    import paramiko
    from dotenv import load_dotenv
except ImportError:
    print("Missing deps: pip install paramiko python-dotenv")
    sys.exit(1)

WORKSPACE = Path(__file__).resolve().parent.parent
DEC31_EXPORT = WORKSPACE / "CSVs" / "WooExport" / "Products-Export-2025-Dec-31-180709.csv"
FEB12_EXPORT = WORKSPACE / "CSVs" / "wc-product-export-12-2-2026-1770920945601.csv"
NO_IMAGE_CSV = WORKSPACE / "outputs" / "audit" / "missing_images.csv"
LOCAL_UPLOADS = WORKSPACE / "hmoonhydro.com" / "wp-content" / "uploads"
OUTPUT_DIR = WORKSPACE / "outputs" / "audit"

load_dotenv(WORKSPACE / ".env")
SSH_HOST = os.getenv("HMOON_SSH_HOST", "")
SSH_USER = os.getenv("HMOON_SSH_USER", "")
SSH_PASS = os.getenv("HMOON_SSH_PASS", "")

SIZE_RE = re.compile(r"-\d+x\d+$")
HASH_RE = re.compile(r"^[0-9a-f]{8}__")


# ──────────────────────────── helpers ────────────────────────────

def build_local_index() -> dict[str, list[str]]:
    """Index local uploads by stem (lowercase). Strips hash prefix and size suffix."""
    idx: dict[str, list[str]] = defaultdict(list)
    for root, dirs, files in os.walk(LOCAL_UPLOADS):
        dirs[:] = [d for d in dirs if d not in ("scaled", "resized")]
        for fn in files:
            if not fn.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                continue
            stem = SIZE_RE.sub("", Path(fn).stem)
            full = str(Path(root) / fn)
            idx[stem.lower()].append(full)
            stripped = HASH_RE.sub("", stem).lower()
            if stripped != stem.lower():
                idx[stripped].append(full)
    return idx


def load_no_image_skus() -> set[str]:
    with open(NO_IMAGE_CSV, encoding="utf-8") as f:
        return {row["sku"] for row in csv.DictReader(f)}


def load_dec31() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    with open(DEC31_EXPORT, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sku = row.get("Sku", "").strip()
            if sku:
                rows[sku] = row
    return rows


def build_restore_list(no_image_skus: set[str], dec31: dict, local_idx: dict) -> list[dict]:
    """Find all restorable products: no current image, had Dec31 image, local file exists."""
    restorables = []
    for sku in no_image_skus:
        d31 = dec31.get(sku)
        if not d31:
            continue
        img_url = (d31.get("Image URL") or "").strip()
        if not img_url:
            continue
        fn = img_url.split("/")[-1]
        stem = SIZE_RE.sub("", Path(fn).stem)
        stem_lower = stem.lower()
        stem_stripped = HASH_RE.sub("", stem).lower()
        local_matches = local_idx.get(stem_lower) or local_idx.get(stem_stripped)
        if not local_matches:
            continue
        # Prefer full-size file
        no_size = [p for p in local_matches if not re.search(r"-\d+x\d+", Path(p).stem)]
        local_path = no_size[0] if no_size else local_matches[0]
        name = (d31.get("Product Name") or "").strip()
        restorables.append(
            {
                "sku": sku,
                "name": name,
                "dec31_url": img_url,
                "local_path": local_path,
            }
        )
    return restorables


def connect_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS, timeout=30)
    return ssh


def run_remote(ssh, cmd: str) -> tuple[str, str, int]:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    return out, err, code


def resolve_site_dir(ssh) -> str:
    raw = os.getenv("HMOON_SITE_DIR", "~/hmoonhydro.com")
    if re.match(r"^[A-Za-z]:[/\\]", raw):
        raw = "~/hmoonhydro.com"
    if "~" in raw:
        out, _, _ = run_remote(ssh, "echo $HOME")
        raw = raw.replace("~", out.strip())
    return raw


def upload_and_set_image(ssh, site_dir: str, row: dict, dry_run: bool) -> dict:
    """Upload a local image to WP media library and set it as product thumbnail."""
    sku = row["sku"]
    local_path = row["local_path"]
    name = row["name"]

    # Convert Windows path to a remote-uploadable path by SFTPing the file
    remote_tmp = f"/tmp/hmoon_img_{sku}_{Path(local_path).name}"
    result = {"sku": sku, "name": name, "status": "pending", "attachment_id": None}

    if dry_run:
        result["status"] = "dry-run"
        result["would_upload"] = local_path
        return result

    # Check the product exists on live
    out, err, code = run_remote(
        ssh,
        f"cd {site_dir} && wp post list --post_type=product --meta_key=_sku --meta_value={sku} "
        f"--fields=ID --format=csv --allow-root 2>&1",
    )
    lines = [l.strip() for l in out.strip().splitlines() if l.strip() and l != "ID"]
    if not lines:
        result["status"] = "SKIP_NOT_FOUND"
        return result
    product_id = lines[0]

    # Check product already has a thumbnail (race condition guard)
    out2, _, _ = run_remote(
        ssh,
        f"cd {site_dir} && wp post meta get {product_id} _thumbnail_id --allow-root 2>&1",
    )
    if out2.strip() and out2.strip().isdigit():
        result["status"] = "SKIP_ALREADY_HAS_IMAGE"
        result["existing_thumbnail_id"] = out2.strip()
        return result

    # SFTP upload local file to /tmp on remote
    try:
        sftp = ssh.open_sftp()
        sftp.put(local_path, remote_tmp)
        sftp.close()
    except Exception as e:
        result["status"] = f"SFTP_ERROR: {e}"
        return result

    # Import to WP media library
    out3, err3, code3 = run_remote(
        ssh,
        f"cd {site_dir} && wp media import {remote_tmp} --post_id={product_id} "
        f"--featured_image --porcelain --allow-root 2>&1",
    )
    run_remote(ssh, f"rm -f {remote_tmp}")  # cleanup

    attachment_id = out3.strip()
    if not attachment_id.isdigit():
        result["status"] = f"IMPORT_ERROR: {out3.strip()[:200]}"
        return result

    result["attachment_id"] = attachment_id
    result["status"] = "OK"
    return result


# ──────────────────────────── main ────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Restore Dec31 product images from local files")
    parser.add_argument("--confirm", action="store_true", help="Apply changes (default: dry-run)")
    parser.add_argument("--sku", default=None, help="Restore only a specific SKU")
    parser.add_argument("--limit", type=int, default=None, help="Max products to process")
    parser.add_argument("--batch-delay", type=float, default=0.5, help="Seconds between uploads (default 0.5)")
    args = parser.parse_args()

    dry_run = not args.confirm

    print("=== Restore Dec31 Product Images ===")
    print(f"Mode: {'DRY-RUN' if dry_run else 'CONFIRM'}")
    print()

    print("Loading data...")
    no_image_skus = load_no_image_skus()
    dec31 = load_dec31()
    print(f"  No-image products: {len(no_image_skus)}")
    print(f"  Dec31 export: {len(dec31)} products")

    print("Indexing local uploads...")
    local_idx = build_local_index()
    print(f"  {len(local_idx)} unique image stems")

    restore_list = build_restore_list(no_image_skus, dec31, local_idx)
    if args.sku:
        restore_list = [r for r in restore_list if r["sku"] == args.sku]
    if args.limit:
        restore_list = restore_list[: args.limit]

    print(f"\nRestorable products: {len(restore_list)}")
    if not restore_list:
        print("Nothing to restore.")
        return

    if dry_run:
        print("\nDRY-RUN — would restore:")
        for r in restore_list[:20]:
            print(f"  {r['sku']:15} {r['name'][:45]:45} <- {Path(r['local_path']).name}")
        if len(restore_list) > 20:
            print(f"  ... and {len(restore_list)-20} more")
        print(f"\nRun with --confirm to apply.")
        return

    print("\nConnecting to SSH...")
    ssh = connect_ssh()
    site_dir = resolve_site_dir(ssh)
    print(f"  Site dir: {site_dir}")

    results = []
    ok = skip = error = 0
    for i, row in enumerate(restore_list, 1):
        print(f"  [{i}/{len(restore_list)}] {row['sku']} {row['name'][:40]}", end=" ... ")
        result = upload_and_set_image(ssh, site_dir, row, dry_run)
        status = result["status"]
        print(status)
        results.append(result)
        if status == "OK":
            ok += 1
        elif status.startswith("SKIP"):
            skip += 1
        else:
            error += 1
        if i < len(restore_list):
            time.sleep(args.batch_delay)

    ssh.close()

    # Write results CSV
    results_path = OUTPUT_DIR / "image_restore_results.csv"
    with open(results_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = ["sku", "name", "status", "attachment_id", "would_upload", "existing_thumbnail_id"]
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(results)

    print(f"\n{'='*50}")
    print(f"Results: {ok} restored, {skip} skipped, {error} errors")
    print(f"Log written → {results_path.relative_to(WORKSPACE)}")


if __name__ == "__main__":
    main()
