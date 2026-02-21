#!/usr/bin/env python3
"""
audit_image_mismatches.py

Fetches every product from the live WooCommerce DB and scores how well
each product's image filename matches its product name using keyword overlap.

Products with low overlap scores are flagged as potential mismatches for review.

Usage:
  # Full site audit (exports CSV)
  python scripts/audit_image_mismatches.py

  # Only show flagged mismatches
  python scripts/audit_image_mismatches.py --flagged-only

  # Limit to specific category slug
  python scripts/audit_image_mismatches.py --category air-filtration

Output:
  outputs/audit/image_mismatch_audit.csv  — all products scored
  outputs/audit/image_mismatch_flagged.csv — only flagged mismatches
"""
from __future__ import annotations
import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

try:
    import paramiko
    from dotenv import load_dotenv
except ImportError:
    print("Missing deps: pip install paramiko python-dotenv")
    sys.exit(1)

WORKSPACE = Path(__file__).resolve().parent.parent
OUTPUT_DIR = WORKSPACE / "outputs" / "audit"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(WORKSPACE / ".env")
SSH_HOST = os.getenv("HMOON_SSH_HOST", "")
SSH_USER = os.getenv("HMOON_SSH_USER", "")
SSH_PASS = os.getenv("HMOON_SSH_PASS", "")

# ─── Keyword scoring config ───────────────────────────────────────────────────

# Words that are meaningless for matching (skip them)
STOPWORDS = {
    "the", "a", "an", "and", "or", "for", "with", "w", "of", "in", "to",
    "by", "from", "at", "is", "it", "on", "as", "be", "are", "was", "has",
    "have", "can", "only", "new", "size", "pack", "set", "case", "kit",
    "type", "model", "unit", "each", "lot", "per", "box", "pair",
    # Units
    "cfm", "gpm", "gph", "lph", "hp", "ft", "inch", "lbs", "lb",
    "kg", "gal", "gals", "gallon", "qt", "ml", "liter", "oz",
    # Image artifact words
    "jpg", "jpeg", "png", "webp", "gif", "sho", "website", "image",
    "print", "01", "02",
}

# Vendor image code patterns — filenames that are vendor catalog numbers.
# These images may be correct; we can't score them by keyword, skip scoring.
VENDOR_CODE_PATTERNS = [
    re.compile(r'^hgc\d+'),          # HydroFarm catalog: hgc700735-01.jpg
    re.compile(r'^\d{4,6}_[0-9a-f]'), # UUID-style numeric IDs: 11512_4afc.jpg
    re.compile(r'^[0-9a-f]{8}__'),    # Hash-prefixed: be557efb__storagebag.jpg (check the part after __)
]

# Image name patterns that are clearly "wrong category" regardless of score
WRONG_CATEGORY_RULES = [
    # (image_keyword, disallowed_product_keywords)
    (r"pre.?filter.?evol", r"fan.?combo|fan combo"),
    (r"pre.?filter.?evol", r"\bcombo\b"),
    (r"storagebag", r"filter|fan|pump|light|bulb"),
    (r"florablend|floragro|floramicro", r"light|fan|filter|pump"),
]

# Known acceptable "shared" image situations — grouped parents using child's image
KNOWN_OK_SHARED = {
    "profilter.jpg",        # All PROfilter products share this brand image
    "can-filters.jpg",      # CAN filter product line shares this
    "can-filters-flanges.jpg",  # Flange products share this
}

# Score threshold below which we flag as suspicious
FLAG_THRESHOLD = 0.15


# ─── Helpers ─────────────────────────────────────────────────────────────────

def tokenize(text: str) -> set[str]:
    """Extract meaningful tokens from a product name or image filename."""
    text = text.lower()
    # Split compound words: 'storagebag' -> 'storage bag', 'prefilter' -> 'pre filter'
    text = re.sub(r"(storage)(bag)", r"\1 \2", text)
    text = re.sub(r"(pre)(filter)", r"\1 \2", text)
    text = re.sub(r"(fan)(combo)", r"\1 \2", text)
    text = re.sub(r"(air)(pump)", r"\1 \2", text)
    text = re.sub(r"(grow)(light)", r"\1 \2", text)
    text = re.sub(r"(\d+)([a-z])", r"\1 \2", text)  # '75cfm' -> '75 cfm'
    text = re.sub(r"([a-z])(\d+)", r"\1 \2", text)  # 'pro75' -> 'pro 75'
    text = re.sub(r"[_\-./]", " ", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    tokens = {t for t in text.split() if len(t) >= 2 and t not in STOPWORDS}
    tokens = {t for t in tokens if not re.fullmatch(r"\d+", t)}
    return tokens


def is_vendor_code_filename(img_filename: str) -> bool:
    """Returns True if the filename is a vendor catalog code (can't keyword-match)."""
    return any(p.search(img_filename.lower()) for p in VENDOR_CODE_PATTERNS)


def score_match(product_name: str, img_filename: str) -> tuple[float, set[str], set[str]]:
    """
    Returns (score, name_tokens, matching_tokens).
    Score = matching / name_tokens. 1.0 = perfect match.
    """
    name_tokens = tokenize(product_name)
    img_tokens = tokenize(img_filename)
    if not name_tokens:
        return (1.0, name_tokens, set())
    matching = name_tokens & img_tokens
    score = len(matching) / len(name_tokens)
    return (score, name_tokens, matching)


def is_wrong_category(img_filename: str, product_name: str) -> str:
    """Return a reason string if this is a known wrong-category mismatch, else ''."""
    img_lower = img_filename.lower()
    name_lower = product_name.lower()
    for img_pat, prod_pat in WRONG_CATEGORY_RULES:
        if re.search(img_pat, img_lower) and re.search(prod_pat, name_lower):
            return f"img_pattern={img_pat!r} conflicts with product_pattern={prod_pat!r}"
    return ""


def run_remote(ssh: paramiko.SSHClient, cmd: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode()


# ─── Fetch products from live DB ─────────────────────────────────────────────

FETCH_PHP = r"""<?php
// Fetch all products with their image filenames as JSON
$args = [
    'post_type'      => 'product',
    'posts_per_page' => -1,
    'post_status'    => 'publish',
    {CATEGORY_FILTER}
];
$products = get_posts($args);
$rows = [];
foreach ($products as $p) {
    $sku      = get_post_meta($p->ID, '_sku', true);
    $type     = get_post_meta($p->ID, '_type', true) ?: wp_get_object_terms($p->ID, 'product_type', ['fields'=>'names'])[0] ?? '';
    $thumb_id = get_post_thumbnail_id($p->ID);
    $img_url  = $thumb_id ? wp_get_attachment_url($thumb_id) : '';
    $img_file = $img_url  ? basename($img_url) : '';
    $cats     = wp_get_post_terms($p->ID, 'product_cat', ['fields'=>'names']);
    $rows[]   = [
        'id'       => $p->ID,
        'sku'      => $sku,
        'name'     => $p->post_title,
        'type'     => $type,
        'img_url'  => $img_url,
        'img_file' => $img_file,
        'cats'     => implode(' | ', $cats),
    ];
}
echo json_encode($rows);
"""


def fetch_products(ssh: paramiko.SSHClient, site_dir: str, category: str = "") -> list[dict]:
    cat_filter = ""
    if category:
        cat_filter = f"""'tax_query' => [['taxonomy'=>'product_cat','field'=>'slug','terms'=>'{category}']],"""

    php = FETCH_PHP.replace("{CATEGORY_FILTER}", cat_filter)
    remote_php = "/tmp/hmoon_img_audit.php"

    sftp = ssh.open_sftp()
    with sftp.open(remote_php, "w") as f:
        f.write(php)
    sftp.close()

    out = run_remote(ssh, f"cd {site_dir} && wp eval-file {remote_php} --allow-root 2>/dev/null")
    run_remote(ssh, f"rm -f {remote_php}")

    try:
        return json.loads(out)
    except json.JSONDecodeError:
        print(f"ERROR parsing JSON response:\n{out[:500]}")
        return []


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", default="", help="Limit to WC category slug")
    parser.add_argument("--flagged-only", action="store_true", help="Only print flagged rows")
    parser.add_argument("--threshold", type=float, default=FLAG_THRESHOLD,
                        help=f"Score below which to flag (default {FLAG_THRESHOLD})")
    args = parser.parse_args()

    print("=== Site-Wide Image Mismatch Audit ===")
    print(f"Flag threshold: score < {args.threshold}")
    if args.category:
        print(f"Category filter: {args.category}")
    print()

    print("Connecting to SSH...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS, timeout=30)

    out, _ = run_remote(ssh, "echo $HOME"), None
    site_dir = "/home/wp_9dm4yz/hmoonhydro.com"

    print("Fetching products from live DB...")
    products = fetch_products(ssh, site_dir, args.category)
    ssh.close()

    print(f"  {len(products)} products fetched")
    if not products:
        print("No products found.")
        return

    # Score each product
    all_rows = []
    flagged = []
    no_image = []

    for p in products:
        name = p["name"]
        img_file = p["img_file"]

        if not img_file:
            no_image.append(p)
            score = 0.0
            name_tokens = set()
            matching = set()
            flag_reason = "NO_IMAGE"
        elif img_file in KNOWN_OK_SHARED:
            score = 1.0
            name_tokens = set()
            matching = set()
            flag_reason = ""
        elif is_vendor_code_filename(img_file):
            # Vendor catalog image: strip hash prefix and re-check the meaningful part
            meaningful = re.sub(r'^[0-9a-f]{8}__', '', img_file)  # strip hash prefix
            if meaningful != img_file:  # was hash-prefixed -> score on meaningful part
                score, name_tokens, matching = score_match(name, meaningful)
            else:
                # Pure vendor code (hgc*, numeric ID) — assume correct, score neutral
                score = 0.5
                name_tokens = tokenize(name)
                matching = set()
            wrong_cat = is_wrong_category(img_file, name)
            if wrong_cat:
                flag_reason = f"WRONG_CATEGORY: {wrong_cat}"
            elif score < args.threshold:
                flag_reason = f"LOW_SCORE_VENDOR ({score:.2f})"
            else:
                flag_reason = ""
        else:
            score, name_tokens, matching = score_match(name, img_file)
            wrong_cat = is_wrong_category(img_file, name)
            if wrong_cat:
                flag_reason = f"WRONG_CATEGORY: {wrong_cat}"
            elif score < args.threshold:
                flag_reason = f"LOW_SCORE ({score:.2f})"
            else:
                flag_reason = ""

        row = {
            "id": p["id"],
            "sku": p["sku"],
            "name": name,
            "type": p["type"],
            "categories": p["cats"],
            "img_file": img_file,
            "img_url": p["img_url"],
            "score": f"{score:.3f}",
            "name_tokens": " ".join(sorted(name_tokens)),
            "matching_tokens": " ".join(sorted(matching)),
            "flag_reason": flag_reason,
        }
        all_rows.append(row)
        if flag_reason:
            flagged.append(row)

    # Sort flagged by score ascending (worst first), then wrong-category first
    flagged.sort(key=lambda r: (0 if r["flag_reason"].startswith("WRONG") else 1, float(r["score"])))

    # Write outputs
    fieldnames = ["id", "sku", "name", "type", "categories", "img_file", "img_url",
                  "score", "name_tokens", "matching_tokens", "flag_reason"]

    all_path = OUTPUT_DIR / "image_mismatch_audit.csv"
    with open(all_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(all_rows)

    flagged_path = OUTPUT_DIR / "image_mismatch_flagged.csv"
    with open(flagged_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(flagged)

    print(f"\nResults:")
    print(f"  Total products: {len(all_rows)}")
    print(f"  Flagged (mismatch/low score): {len(flagged)}")
    print(f"  No image: {len(no_image)}")
    print(f"\nAll → {all_path.relative_to(WORKSPACE)}")
    print(f"Flagged → {flagged_path.relative_to(WORKSPACE)}")

    if flagged:
        print(f"\n{'─'*80}")
        print(f"TOP FLAGGED PRODUCTS (showing up to 40):")
        print(f"{'─'*80}")
        print(f"{'Score':>6}  {'SKU':15} {'Image File':40} {'Name'}")
        print(f"{'─'*80}")
        for r in flagged[:40]:
            reason = r["flag_reason"].split(":")[0]
            print(f"{r['score']:>6}  {r['sku']:15} {r['img_file'][:38]:40} {r['name'][:55]}")
            print(f"         {'':15} ↑ {reason}")


if __name__ == "__main__":
    main()
