#!/usr/bin/env python3
"""
audit_product_integrity.py

Cross-references:
  1. Dec 31 WooCommerce export (ground truth for original image URLs and groupings)
  2. Feb 12 WooCommerce export (current live state)
  3. Local uploads folder (hmoonhydro.com/wp-content/uploads/)

Outputs:
  - outputs/audit/image_regressions.csv    — SKUs with image lost or changed
  - outputs/audit/missing_images.csv       — SKUs still needing images
  - outputs/audit/grouping_issues.csv      — Grouped products with pattern mismatches
  - outputs/audit/local_image_restores.csv — SKUs where local file can restore image
  - outputs/audit/product_integrity_report.md — summary

Usage:
  python scripts/audit_product_integrity.py
  python scripts/audit_product_integrity.py --verbose
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import json
from collections import defaultdict
from pathlib import Path
from datetime import datetime

WORKSPACE = Path(__file__).resolve().parent.parent

DEC31_EXPORT = WORKSPACE / "CSVs" / "WooExport" / "Products-Export-2025-Dec-31-180709.csv"
FEB12_EXPORT = WORKSPACE / "CSVs" / "wc-product-export-12-2-2026-1770920945601.csv"
LOCAL_UPLOADS = WORKSPACE / "hmoonhydro.com" / "wp-content" / "uploads"
OUTPUT_DIR = WORKSPACE / "outputs" / "audit"

# Sub-product-line patterns: if a child's name matches, it belongs in a SEPARATE group
SUBLINE_PATTERNS = [
    # (suffix_pattern, suggested_parent_name)
    (re.compile(r'\bmax\b', re.I), "Max"),
    (re.compile(r'\bpro\b', re.I), "Pro"),
    (re.compile(r'\blite\b', re.I), "Lite"),
    (re.compile(r'\bplus\b|\+', re.I), "Plus"),
    (re.compile(r'\bpowder\b', re.I), "Powder"),
    (re.compile(r'\bliquid\b', re.I), "Liquid"),
    (re.compile(r'\bsoluble\b', re.I), "Soluble"),
]


def normalize_sku(sku: str) -> str:
    return (sku or "").strip().lower()


def load_dec31() -> dict:
    rows = {}
    with open(DEC31_EXPORT, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sku = normalize_sku(row.get("Sku", ""))
            if sku:
                rows[sku] = row
    return rows


def load_feb12() -> dict:
    rows = {}
    with open(FEB12_EXPORT, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            # Handle both export formats
            sku = normalize_sku(row.get("SKU") or row.get("Sku") or "")
            if sku:
                rows[sku] = row
    return rows


def build_local_image_index() -> dict[str, list[Path]]:
    """Index local uploads by basename stem (lowercase, no extension, no size suffix)."""
    index: dict[str, list[Path]] = defaultdict(list)
    size_re = re.compile(r'-\d+x\d+$')
    
    for root, dirs, files in os.walk(LOCAL_UPLOADS):
        # Skip scaled/cropped subdirs
        dirs[:] = [d for d in dirs if d not in ('scaled', 'resized')]
        for fname in files:
            if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
                continue
            stem = Path(fname).stem
            # Remove size suffix e.g. -300x300
            base = size_re.sub('', stem).lower()
            full_path = Path(root) / fname
            index[base].append(full_path)
    
    return index


def url_to_basename(url: str) -> str:
    """Extract stem from URL for local matching."""
    if not url:
        return ""
    path = url.rstrip('/').split('/')[-1]
    stem = Path(path).stem
    # Remove size suffix
    stem = re.sub(r'-\d+x\d+$', '', stem).lower()
    return stem


def detect_subline_issues(dec31_rows: dict) -> list[dict]:
    """
    Find grouped products that mix different sub-product-lines.
    E.g., "Can Filter Flanges" grouping both regular flanges AND Flange Max.
    """
    issues = []
    
    # Build name -> sku lookup for resolving grouped product references
    name_to_sku = {}
    for sku, row in dec31_rows.items():
        name = row.get("Product Name", "").strip()
        if name:
            name_to_sku[name.lower()] = sku

    for sku, row in dec31_rows.items():
        if row.get("Type", "").lower() != "grouped":
            continue
        
        parent_name = row.get("Product Name", "").strip()
        grouped_str = row.get("Grouped products", "").strip()
        if not grouped_str:
            continue
        
        # Parse child names (WC export uses |~| delimiter; may also be HTML-decoded)
        import html as html_module
        grouped_str = html_module.unescape(grouped_str)
        child_names = [c.strip() for c in re.split(r'\|~\||\|', grouped_str) if c.strip()]
        
        # Check each child for sub-line patterns
        subline_children: dict[str, list[str]] = defaultdict(list)
        regular_children: list[str] = []
        
        for child_name in child_names:
            matched_subline = None
            for pattern, subline_label in SUBLINE_PATTERNS:
                # Only flag if the PARENT name does NOT already contain the subline keyword
                if pattern.search(child_name) and not pattern.search(parent_name):
                    matched_subline = subline_label
                    break
            
            if matched_subline:
                subline_children[matched_subline].append(child_name)
            else:
                regular_children.append(child_name)
        
        if subline_children:
            for subline_label, children in subline_children.items():
                issues.append({
                    "parent_sku": sku,
                    "parent_name": parent_name,
                    "subline": subline_label,
                    "subline_children_count": len(children),
                    "subline_children": " | ".join(children),
                    "regular_children_count": len(regular_children),
                    "suggested_action": f'Split "{subline_label}" children into separate grouped parent "{parent_name} {subline_label}"',
                })
    
    return issues


def find_local_image(stem: str, local_index: dict) -> str:
    """Return best local image path for a stem, or empty string."""
    matches = local_index.get(stem, [])
    if not matches:
        return ""
    # Prefer the full-size file (no dimension suffix) or largest
    no_size = [p for p in matches if not re.search(r'-\d+x\d+', p.name)]
    if no_size:
        return str(no_size[0].relative_to(WORKSPACE))
    return str(matches[0].relative_to(WORKSPACE))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Loading Dec 31 export...")
    dec31 = load_dec31()
    print(f"  {len(dec31)} SKUs")
    
    print("Loading Feb 12 export...")
    feb12 = load_feb12()
    print(f"  {len(feb12)} SKUs")
    
    print("Indexing local uploads...")
    local_index = build_local_image_index()
    print(f"  {len(local_index)} unique image stems")
    
    # ---- 1. Image regressions: SKU in both exports, image changed/lost ----
    print("\nAnalyzing image regressions...")
    
    regressions = []
    missing_in_feb12 = []
    local_restores = []
    
    def get_img(row: dict) -> str:
        return (row.get("Image URL") or row.get("Images") or "").strip()
    
    def get_name(row: dict) -> str:
        return (row.get("Product Name") or row.get("Name") or "").strip()
    
    def get_type(row: dict) -> str:
        return (row.get("Type") or row.get("post_type") or "").strip()
    
    for sku, old_row in dec31.items():
        old_img = get_img(old_row)
        old_name = get_name(old_row)
        old_type = get_type(old_row)
        
        if sku not in feb12:
            if old_img:
                # Product entirely absent from current export - image lost
                stem = url_to_basename(old_img)
                local_path = find_local_image(stem, local_index)
                missing_in_feb12.append({
                    "sku": sku,
                    "name": old_name,
                    "type": old_type,
                    "dec31_image": old_img,
                    "local_file": local_path,
                    "status": "PRODUCT_ABSENT_FROM_FEB12",
                })
            continue
        
        new_row = feb12[sku]
        new_img = get_img(new_row)
        new_name = get_name(new_row)
        new_type = get_type(new_row)
        
        if old_img and not new_img:
            # Had image, now missing
            stem = url_to_basename(old_img)
            local_path = find_local_image(stem, local_index)
            regressions.append({
                "sku": sku,
                "name": new_name or old_name,
                "type": new_type,
                "dec31_image": old_img,
                "feb12_image": "",
                "local_file": local_path,
                "status": "IMAGE_LOST",
            })
            if local_path:
                local_restores.append({
                    "sku": sku,
                    "name": new_name or old_name,
                    "local_image_path": local_path,
                    "original_url": old_img,
                    "action": "restore_from_local",
                })
        elif old_img and new_img and old_img != new_img:
            # Image changed - flag for review
            regressions.append({
                "sku": sku,
                "name": new_name or old_name,
                "type": new_type,
                "dec31_image": old_img,
                "feb12_image": new_img,
                "local_file": "",
                "status": "IMAGE_CHANGED",
            })
    
    # ---- 2. Products in Feb12 with no image at all ----
    print("Finding products missing images in current store...")
    
    genuinely_missing = []
    for sku, row in feb12.items():
        if not get_img(row):
            name = get_name(row)
            ptype = get_type(row)
            # Check if this SKU was in dec31 and had an image (already caught above)
            if sku not in dec31 or not get_img(dec31[sku]):
                # New product with no image - check local
                # Try to find by slug/name
                slug_stem = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
                local_path = find_local_image(slug_stem, local_index)
                genuinely_missing.append({
                    "sku": sku,
                    "name": name,
                    "type": ptype,
                    "slug_stem_tried": slug_stem,
                    "local_file": local_path,
                    "status": "NO_IMAGE_EVER",
                })
    
    # ---- 3. Grouped product sub-line issues ----
    print("Detecting grouped product sub-line mixing...")
    subline_issues = detect_subline_issues(dec31)
    
    # ---- Write outputs ----
    
    # Image regressions
    reg_path = OUTPUT_DIR / "image_regressions.csv"
    with open(reg_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=["sku","name","type","dec31_image","feb12_image","local_file","status"])
        w.writeheader()
        w.writerows(regressions)
    print(f"\nWrote {len(regressions)} image regressions → {reg_path.relative_to(WORKSPACE)}")
    
    # Missing images
    miss_path = OUTPUT_DIR / "missing_images.csv"
    miss_fieldnames = ["sku", "name", "type", "dec31_image", "local_file", "status", "slug_stem_tried"]
    with open(miss_path, 'w', newline='', encoding='utf-8') as f:
        all_missing = missing_in_feb12 + genuinely_missing
        w = csv.DictWriter(f, fieldnames=miss_fieldnames, extrasaction='ignore', restval='')
        w.writeheader()
        w.writerows(all_missing)
    print(f"Wrote {len(missing_in_feb12)} absent + {len(genuinely_missing)} no-image-ever → {miss_path.relative_to(WORKSPACE)}")
    
    # Grouping issues
    grp_path = OUTPUT_DIR / "grouping_issues.csv"
    with open(grp_path, 'w', newline='', encoding='utf-8') as f:
        if subline_issues:
            w = csv.DictWriter(f, fieldnames=list(subline_issues[0].keys()))
            w.writeheader()
            w.writerows(subline_issues)
    print(f"Wrote {len(subline_issues)} grouping sub-line issues → {grp_path.relative_to(WORKSPACE)}")
    
    # Local restores
    restore_path = OUTPUT_DIR / "local_image_restores.csv"
    with open(restore_path, 'w', newline='', encoding='utf-8') as f:
        if local_restores:
            w = csv.DictWriter(f, fieldnames=list(local_restores[0].keys()))
            w.writeheader()
            w.writerows(local_restores)
    print(f"Wrote {len(local_restores)} local restore candidates → {restore_path.relative_to(WORKSPACE)}")
    
    # Summary report
    report_path = OUTPUT_DIR / "product_integrity_report.md"
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(f"# Product Integrity Report\n\n")
        f.write(f"Generated: {ts}\n\n")
        f.write(f"## Sources Compared\n")
        f.write(f"- **Ground truth**: Dec 31, 2025 WooCommerce export ({len(dec31)} SKUs)\n")
        f.write(f"- **Current state**: Feb 12, 2026 WooCommerce export ({len(feb12)} SKUs)\n")
        f.write(f"- **Local images**: {len(local_index)} unique stems in `hmoonhydro.com/wp-content/uploads/`\n\n")
        
        f.write(f"## Image Issues\n\n")
        lost = [r for r in regressions if r['status'] == 'IMAGE_LOST']
        changed = [r for r in regressions if r['status'] == 'IMAGE_CHANGED']
        f.write(f"| Issue | Count |\n|-------|-------|\n")
        f.write(f"| Images LOST (had in Dec31, missing now) | {len(lost)} |\n")
        f.write(f"| Images CHANGED (different URL) | {len(changed)} |\n")
        f.write(f"| Products absent from Feb12 export | {len(missing_in_feb12)} |\n")
        f.write(f"| New products with no image ever | {len(genuinely_missing)} |\n")
        f.write(f"| **Restorable from local files** | **{len(local_restores)}** |\n\n")
        
        if lost:
            f.write(f"### SKUs with Lost Images (showing first 20)\n\n")
            f.write(f"| SKU | Name | Local Available? |\n|-----|------|------------------|\n")
            for r in lost[:20]:
                f.write(f"| {r['sku']} | {r['name'][:50]} | {'✅' if r['local_file'] else '❌'} |\n")
            f.write("\n")
        
        f.write(f"## Grouping Sub-line Issues\n\n")
        f.write(f"Found **{len(subline_issues)}** grouped products mixing distinct sub-product-lines:\n\n")
        if subline_issues:
            f.write(f"| Parent | Sub-line | Mixed Children | Suggested Fix |\n")
            f.write(f"|--------|----------|----------------|---------------|\n")
            for issue in subline_issues:
                f.write(f"| {issue['parent_name'][:35]} | {issue['subline']} | {issue['subline_children_count']} children | {issue['suggested_action'][:60]} |\n")
        f.write("\n")
        
        f.write(f"## Next Steps\n\n")
        f.write(f"1. **Restore images**: Run image restore for {len(local_restores)} products that have local files\n")
        f.write(f"2. **Fix grouping**: Split {len(subline_issues)} grouped products that mix sub-product-lines\n")
        f.write(f"3. **Source missing images**: {len(genuinely_missing)} products still need images scraped/sourced\n")
        f.write(f"\n### See also\n")
        f.write(f"- `outputs/audit/image_regressions.csv`\n")
        f.write(f"- `outputs/audit/grouping_issues.csv`\n")
        f.write(f"- `outputs/audit/local_image_restores.csv`\n")
        f.write(f"- `outputs/audit/missing_images.csv`\n")
    
    print(f"\nReport → {report_path.relative_to(WORKSPACE)}")
    
    # Quick summary to stdout
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"  Image regressions (lost/changed): {len(regressions)}")
    print(f"    - Lost: {len(lost)}")
    print(f"    - Changed URL: {len(changed)}")
    print(f"  Products absent from Feb12 (with old images): {len(missing_in_feb12)}")
    print(f"  New products no image ever: {len(genuinely_missing)}")
    print(f"  Restorable from local files: {len(local_restores)}")
    print(f"  Grouping sub-line issues: {len(subline_issues)}")
    
    if subline_issues:
        print(f"\n  Grouping issues found:")
        for issue in subline_issues:
            print(f"    [{issue['parent_sku']}] {issue['parent_name']} → {issue['subline_children_count']} {issue['subline']} children mixed in")


if __name__ == "__main__":
    main()
