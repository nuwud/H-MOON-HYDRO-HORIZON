#!/usr/bin/env python3
"""
Build category-scoped WooCommerce grouped-parent update CSV waves.

Purpose
-------
Generate NON-DESTRUCTIVE, category-based update CSVs that only touch grouped
parent relationships (`Grouped products`) using a known-good local Woo export.

Usage
-----
  # Dry-run summary for all categories (default)
  python scripts/build_woo_grouping_waves.py

  # Dry-run for one category
  python scripts/build_woo_grouping_waves.py --category "Air & Filtration"

  # Write wave CSV(s)
  python scripts/build_woo_grouping_waves.py --category "Air & Filtration" --confirm
  python scripts/build_woo_grouping_waves.py --all --confirm
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple


WORKSPACE = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = WORKSPACE / "CSVs" / "WooExport" / "Products-Export-2025-Dec-31-180709.csv"
DEFAULT_OUTPUT_DIR = WORKSPACE / "outputs" / "woo_grouping_waves"

WAVE_COLUMNS = ["ID", "Type", "SKU", "Name", "Categories", "Grouped products"]

CHILD_NAME_ALIASES = {
    '6" flange': '6" can filter flange',
    '8" flange': '8" can filter flange',
    '10" flange': '10" can filter flange',
    '12" flange': '12" can filter flange',
}


def normalize_text(value: str) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    value = value.replace("\u201c", '"').replace("\u201d", '"')
    value = value.replace("\u2033", '"').replace("\u2032", "'")
    value = value.lower().strip()
    value = re.sub(r"\s*-\s*", " - ", value)
    value = re.sub(r"\s*\(\s*", " (", value)
    value = re.sub(r"\s*\)\s*", ") ", value)
    value = re.sub(r"\s+", " ", value)
    return value


def normalize_flange_key(value: str) -> str:
    normalized = normalize_text(value)
    normalized = re.sub(r"\b(can|filter|profilter)\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def parse_category_root(categories_raw: str) -> str:
    if not categories_raw:
        return "Uncategorized"
    first_cat = categories_raw.split(",")[0].strip()
    root = first_cat.split(">")[0].strip()
    return root or "Uncategorized"


def safe_slug(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "uncategorized"


def normalize_category_text(value: str) -> str:
    value = (value or "").lower()
    value = value.replace("&amp;", " and ")
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    tokens = [t for t in value.split(" ") if t and t not in {"and"}]
    value = " ".join(tokens)
    return value


def category_matches(filter_value: str, categories_raw: str, category_root: str) -> bool:
    f = normalize_category_text(filter_value)
    c_all = normalize_category_text(categories_raw)
    c_root = normalize_category_text(category_root)
    return f in c_all or f in c_root


def resolve_grouped_children(
    grouped_field: str,
    by_exact_name: Dict[str, str],
    by_normalized_name: Dict[str, str],
    by_flange_key: Dict[str, str],
) -> Tuple[List[str], List[str]]:
    resolved: List[str] = []
    missing: List[str] = []

    if not grouped_field:
        return resolved, missing

    parts = [p.strip() for p in grouped_field.split("|~|") if p.strip()]
    seen = set()
    for child_name in parts:
        sku = by_exact_name.get(child_name)
        normalized_child = normalize_text(child_name)
        if not sku:
            sku = by_normalized_name.get(normalized_child)

        if not sku:
            alias = CHILD_NAME_ALIASES.get(normalized_child)
            if alias:
                sku = by_normalized_name.get(alias)

        if not sku and "flange" in normalized_child:
            sku = by_flange_key.get(normalize_flange_key(child_name))

        if sku:
            if sku not in seen:
                resolved.append(sku)
                seen.add(sku)
        else:
            missing.append(child_name)

    return resolved, missing


def load_rows(source_csv: Path) -> List[Dict[str, str]]:
    with source_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def build_name_lookup(rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    by_exact_name: Dict[str, str] = {}
    by_normalized_name: Dict[str, str] = {}
    by_flange_key: Dict[str, str] = {}

    for row in rows:
        name = (row.get("Product Name") or "").strip()
        sku = (row.get("Sku") or "").strip()
        if not name or not sku:
            continue
        by_exact_name[name] = sku
        by_normalized_name[normalize_text(name)] = sku
        if "flange" in normalize_text(name):
            by_flange_key[normalize_flange_key(name)] = sku

    return by_exact_name, by_normalized_name, by_flange_key


def build_grouped_wave_rows(
    rows: List[Dict[str, str]],
    category_filter: str | None,
) -> Tuple[List[Dict[str, str]], Dict[str, int], List[Dict[str, str]]]:
    by_exact_name, by_normalized_name, by_flange_key = build_name_lookup(rows)

    out_rows: List[Dict[str, str]] = []
    unresolved_log: List[Dict[str, str]] = []

    stats = {
        "grouped_parents_seen": 0,
        "grouped_parents_selected": 0,
        "grouped_parents_with_children": 0,
        "grouped_parents_skipped_no_children": 0,
        "resolved_children": 0,
        "missing_children": 0,
    }

    for row in rows:
        ptype = (row.get("Type") or "").strip().lower()
        if ptype != "grouped":
            continue

        stats["grouped_parents_seen"] += 1
        categories_raw = (row.get("Product categories") or "").strip()
        category_root = parse_category_root(categories_raw)
        if category_filter:
            if not category_matches(category_filter, categories_raw, category_root):
                continue

        stats["grouped_parents_selected"] += 1
        parent_name = (row.get("Product Name") or "").strip()
        parent_id = (row.get("ID") or "").strip()
        parent_sku = (row.get("Sku") or "").strip()
        grouped_field = (row.get("Grouped products") or "").strip()

        resolved, missing = resolve_grouped_children(grouped_field, by_exact_name, by_normalized_name, by_flange_key)
        stats["resolved_children"] += len(resolved)
        stats["missing_children"] += len(missing)

        if resolved:
            stats["grouped_parents_with_children"] += 1
        else:
            stats["grouped_parents_skipped_no_children"] += 1
            continue

        if missing:
            unresolved_log.extend(
                {
                    "parent_id": parent_id,
                    "parent_sku": parent_sku,
                    "parent_name": parent_name,
                    "missing_child_name": child_name,
                }
                for child_name in missing
            )

        out_rows.append(
            {
                "ID": parent_id,
                "Type": "grouped",
                "SKU": parent_sku,
                "Name": parent_name,
                "Categories": categories_raw,
                "Grouped products": ", ".join(resolved),
            }
        )

    return out_rows, stats, unresolved_log


def write_csv(path: Path, rows: List[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=WAVE_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, data: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build category-scoped grouped-parent Woo waves")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Known-good Woo export CSV source")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Wave output directory")
    parser.add_argument("--category", type=str, help="Category root filter (e.g. 'Air & Filtration')")
    parser.add_argument("--all", action="store_true", help="Generate one wave file per category")
    parser.add_argument("--confirm", action="store_true", help="Actually write files (dry-run otherwise)")
    return parser.parse_args()


def build_all_categories(rows: List[Dict[str, str]]) -> List[str]:
    cats = set()
    for row in rows:
        if (row.get("Type") or "").strip().lower() != "grouped":
            continue
        cats.add(parse_category_root((row.get("Product categories") or "").strip()))
    return sorted(cats)


def main() -> int:
    args = parse_args()
    source_csv = args.source
    output_dir = args.output_dir

    if not source_csv.exists():
        print(f"ERROR: source CSV not found: {source_csv}")
        return 1

    rows = load_rows(source_csv)
    print("=" * 72)
    print("WOO GROUPING WAVE BUILDER")
    print("=" * 72)
    print(f"Source: {source_csv}")
    print(f"Mode:   {'CONFIRM (write files)' if args.confirm else 'DRY-RUN (summary only)'}")
    print()

    category_targets: List[str | None]
    if args.all:
        category_targets = build_all_categories(rows)
    elif args.category:
        category_targets = [args.category]
    else:
        category_targets = [None]

    run_manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_csv": str(source_csv),
        "mode": "confirm" if args.confirm else "dry-run",
        "waves": [],
    }

    for category in category_targets:
        wave_rows, stats, unresolved = build_grouped_wave_rows(rows, category)
        label = category or "all_grouped"
        slug = safe_slug(label)

        print(f"--- Wave: {label} ---")
        print(f"Grouped parents seen:      {stats['grouped_parents_seen']}")
        print(f"Grouped parents selected:  {stats['grouped_parents_selected']}")
        print(f"Parents with children:     {stats['grouped_parents_with_children']}")
        print(f"Skipped (no children):     {stats['grouped_parents_skipped_no_children']}")
        print(f"Resolved child references: {stats['resolved_children']}")
        print(f"Missing child references:  {stats['missing_children']}")
        print()

        wave_meta = {
            "label": label,
            "slug": slug,
            "stats": stats,
            "output_csv": None,
            "unresolved_csv": None,
        }

        if args.confirm:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            wave_csv = output_dir / f"grouping_wave_{slug}_{timestamp}.csv"
            unresolved_csv = output_dir / f"grouping_wave_{slug}_{timestamp}_unresolved.csv"

            write_csv(wave_csv, wave_rows)

            if unresolved:
                with unresolved_csv.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(
                        handle,
                        fieldnames=["parent_id", "parent_sku", "parent_name", "missing_child_name"],
                        quoting=csv.QUOTE_ALL,
                    )
                    writer.writeheader()
                    writer.writerows(unresolved)

            wave_meta["output_csv"] = str(wave_csv)
            wave_meta["unresolved_csv"] = str(unresolved_csv) if unresolved else None
            print(f"Wrote wave CSV: {wave_csv}")
            if unresolved:
                print(f"Wrote unresolved refs: {unresolved_csv}")
            print()

        run_manifest["waves"].append(wave_meta)

    if args.confirm:
        manifest_path = output_dir / "grouping_wave_manifest.json"
        write_json(manifest_path, run_manifest)
        print(f"Manifest: {manifest_path}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
