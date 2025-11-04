#!/usr/bin/env python3
"""Build a consolidated import CSV for the remaining "create" variant groups.

The script reads the potential variant grouping report produced by
``consolidate_variants.py`` and the most recent Shopify backup export. It then
collects metadata for legacy single-product handles that should be merged into
new multi-variant products and emits a CSV compatible with
``import_consolidated_products.py``.

Example::

    python generate_new_variant_specs.py \
        --groups outputs/variant_consolidation/potential_variant_groups.csv \
        --backup outputs/shopify_backup_20251103.csv \
        --output outputs/variant_consolidation/new_variant_consolidation.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

CSV_HEADER: Sequence[str] = (
    "Handle",
    "Product_Name",
    "Product_Type",
    "Status",
    "Published_Date",
    "Tags",
    "Vendor",
    "Description",
    "SEO_Title",
    "SEO_Description",
    "Variant_Title",
    "Variant_SKU",
    "Variant_Price",
    "Variant_Compare_Price",
    "Variant_Inventory",
    "Variant_Weight",
    "Variant_Weight_Unit",
    "Variant_Requires_Shipping",
    "Variant_Taxable",
    "Variant_Option1_Name",
    "Variant_Option1",
    "Variant_Fulfillment_Service",
    "Variant_Inventory_Policy",
    "Variant_Inventory_Tracker",
    "Variant_Barcode",
    "Image_URL",
)

SIZE_TOKENS = {
    "oz",
    "ounce",
    "ounces",
    "g",
    "gram",
    "grams",
    "kg",
    "kilogram",
    "kilograms",
    "lb",
    "lbs",
    "pound",
    "pounds",
    "gal",
    "gallon",
    "gallons",
    "qt",
    "quart",
    "quarts",
    "pt",
    "pint",
    "pints",
    "ml",
    "milliliter",
    "milliliters",
    "l",
    "liter",
    "liters",
    "mm",
    "cm",
    "inch",
    "inches",
    "in",
    "ft",
    "foot",
    "feet",
    "cfm",
    "psi",
    "amp",
    "amps",
    "k",
    "lumens",
    "lumen",
    "pack",
    "packs",
    "bag",
    "bags",
    "roll",
    "rolls",
    "pair",
    "pairs",
    "set",
    "sets",
    "kit",
    "kits",
}

TRAILING_EXCLUDE = SIZE_TOKENS | {"default", "title"}
GENERAL_EXCLUDE = SIZE_TOKENS | {"default", "title", "with", "w", "and", "per"}
OPTION_UNIT_MARKERS = SIZE_TOKENS | {"small", "medium", "large", "xl", "xxl"}
UNIT_MAP = {
    "lbs": "lb",
    "pounds": "lb",
    "pound": "lb",
    "ounces": "oz",
    "ounce": "oz",
    "oz.": "oz",
    "grams": "g",
    "gram": "g",
    "gms": "g",
    "kgs": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "litre": "l",
    "litres": "l",
    "l.": "l",
}


@dataclass
class VariantRecord:
    legacy_handle: str
    product_name: str
    variant_title: str
    sku: str
    price: str
    compare_price: str
    inventory: str
    weight: str
    weight_unit: str
    requires_shipping: str
    taxable: str
    barcode: str
    tags: str
    description: str
    seo_title: str
    seo_description: str
    vendor: str
    product_type: str
    status: str
    published_date: str
    image_urls: List[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate consolidated variant specs for remaining groups")
    parser.add_argument("--groups", type=Path, default=Path("outputs/variant_consolidation/potential_variant_groups.csv"), help="Path to potential variant groups report")
    parser.add_argument("--backup", type=Path, default=Path("outputs/shopify_backup_20251103.csv"), help="Path to latest Shopify product export CSV")
    parser.add_argument("--output", type=Path, default=Path("outputs/variant_consolidation/new_variant_consolidation.csv"), help="Output path for the consolidated CSV")
    return parser.parse_args()


def read_groups(path: Path) -> List[Tuple[str, List[str]]]:
    groups: List[Tuple[str, List[str]]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            category = (row.get("category") or "").strip().lower()
            if category != "create":
                continue
            base_key = (row.get("base_key") or "").strip()
            handles_raw = (row.get("handles") or "").strip()
            handles = [segment.strip() for segment in handles_raw.split("|") if segment.strip()]
            if not base_key or not handles:
                continue
            groups.append((base_key, handles))
    return groups


def load_backup_rows(path: Path) -> Dict[str, List[Dict[str, str]]]:
    by_handle: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            normalised = {key: (value or "").strip() for key, value in row.items()}
            handle_value = normalised.get("Handle")
            if handle_value:
                by_handle[handle_value].append(normalised)
    return by_handle


def format_price(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return "0.00"
    try:
        return f"{float(raw):.2f}"
    except ValueError:
        return "0.00"


def format_inventory(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return "0"
    try:
        return str(int(round(float(raw))))
    except ValueError:
        return "0"


def format_weight(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return "0.00"
    try:
        return f"{float(raw):.2f}"
    except ValueError:
        return "0.00"


def normalise_unit(raw: str) -> str:
    raw = (raw or "").strip().lower()
    if raw in {"lb", "oz", "g", "kg"}:
        return raw
    return UNIT_MAP.get(raw, "lb")


def normalise_bool(raw: str, default: str = "True") -> str:
    raw = (raw or "").strip().lower()
    if raw in {"true", "1", "yes"}:
        return "True"
    if raw in {"false", "0", "no"}:
        return "False"
    return default


def dedupe_images(entries: Iterable[Tuple[Optional[float], str]]) -> List[str]:
    ordered: List[Tuple[float, str]] = []
    for position, url in entries:
        if not url:
            continue
        pos_value = position if position is not None else 9_999.0
        ordered.append((pos_value, url))
    ordered.sort(key=lambda item: (item[0], item[1]))
    seen: set[str] = set()
    urls: List[str] = []
    for _, url in ordered:
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def tokens_from_name(name: str) -> List[str]:
    return re.findall(r"[A-Za-z0-9]+", name or "")


def compute_base_name(names: Sequence[str]) -> str:
    if not names:
        return ""
    first = names[0]
    tokens = tokens_from_name(first)
    while tokens:
        tail = tokens[-1]
        if any(char.isdigit() for char in tail) or tail.lower() in TRAILING_EXCLUDE:
            tokens.pop()
            continue
        break
    base_tokens: List[str] = []
    for token in tokens:
        token_lower = token.lower()
        if any(char.isdigit() for char in token):
            continue
        if token_lower in GENERAL_EXCLUDE:
            continue
        if all(re.search(rf"\\b{re.escape(token)}\\b", name, re.IGNORECASE) for name in names[1:]):
            base_tokens.append(token)
    if not base_tokens:
        base_tokens = [token for token in tokens if not any(char.isdigit() for char in token)]
    base_name = " ".join(base_tokens).strip()
    return base_name or first.strip()


def extract_option_value(name: str, base_name: str, fallback: str) -> str:
    if not name:
        return fallback
    option_value = ""
    if base_name:
        pattern = re.compile(re.escape(base_name), re.IGNORECASE)
        option_value = pattern.sub("", name, count=1).strip(" -_,")
    if not option_value:
        option_tokens = tokens_from_name(name)
        base_tokens = {token.lower() for token in tokens_from_name(base_name)}
        leftover = [token for token in option_tokens if token.lower() not in base_tokens]
        option_value = " ".join(leftover)
    option_value = option_value.strip()
    if not option_value:
        return fallback
    if option_value.lower() in {"default title", "default"}:
        return fallback
    return option_value


def looks_like_size(value: str) -> bool:
    if not value:
        return False
    lower = value.lower()
    if any(char.isdigit() for char in lower):
        return True
    cleaned = re.sub(r"[^a-z0-9]+", " ", lower)
    tokens = set(cleaned.split())
    return any(token in tokens for token in OPTION_UNIT_MARKERS)


def summarise_variant(rows: Sequence[Dict[str, str]], legacy_handle: str) -> VariantRecord:
    primary = rows[0]
    images: List[Tuple[Optional[float], str]] = []
    for row in rows:
        url = row.get("Image_URL", "").strip()
        if not url:
            continue
        position_raw = (row.get("Image_Position") or "").strip()
        try:
            position_value: Optional[float] = float(position_raw) if position_raw else None
        except ValueError:
            position_value = None
        images.append((position_value, url))
    image_urls = dedupe_images(images)
    variant_title = (primary.get("Variant_Title") or "").strip()
    product_name = (primary.get("Product_Name") or "").strip()
    if not variant_title or variant_title.lower() == "default title":
        variant_title = product_name or legacy_handle.replace("-", " ").title()
    record = VariantRecord(
        legacy_handle=legacy_handle,
        product_name=product_name,
        variant_title=variant_title,
        sku=(primary.get("Variant_SKU") or "").strip(),
        price=format_price(primary.get("Variant_Price", "")),
        compare_price=format_price(primary.get("Variant_Compare_Price", "")) if primary.get("Variant_Compare_Price") else "",
        inventory=format_inventory(primary.get("Variant_Inventory", "")),
        weight=format_weight(primary.get("Variant_Weight", "")),
        weight_unit=normalise_unit(primary.get("Variant_Weight_Unit", "")),
        requires_shipping=normalise_bool(primary.get("Variant_Requires_Shipping", "True")),
        taxable=normalise_bool(primary.get("Variant_Taxable", "True")),
        barcode=(primary.get("Variant_Barcode") or "").strip(),
        tags=(primary.get("Tags") or "").strip(),
        description=(primary.get("Description") or "").strip(),
        seo_title=(primary.get("SEO_Title") or "").strip(),
        seo_description=(primary.get("SEO_Description") or "").strip(),
        vendor=(primary.get("Vendor") or "").strip(),
        product_type=(primary.get("Product_Type") or "").strip(),
        status=(primary.get("Status") or "draft").strip().lower() or "draft",
        published_date=(primary.get("Published_Date") or "").strip(),
        image_urls=image_urls,
    )
    return record


def collect_tags(values: Iterable[str]) -> str:
    tags: List[str] = []
    for value in values:
        for part in (value or "").split(","):
            part = part.strip()
            if part:
                tags.append(part)
    return ", ".join(sorted(set(tags)))


def choose_status(variants: Sequence[VariantRecord]) -> str:
    statuses = Counter(record.status for record in variants if record.status)
    if statuses.get("active"):
        return "active"
    for status, _ in statuses.most_common():
        return status
    return "draft"


def pick_longest(values: Iterable[str]) -> str:
    best = ""
    for value in values:
        if len(value) > len(best):
            best = value
    return best


def first_non_empty(values: Iterable[str]) -> str:
    for value in values:
        if value:
            return value
    return ""


def ensure_handle(base_key: str, base_name: str) -> str:
    desired = base_key.strip()
    if desired:
        return desired
    slug = re.sub(r"[^a-z0-9]+", "-", base_name.lower()).strip("-")
    return slug or "product"


def build_rows(groups: Sequence[Tuple[str, List[str]]], backup_rows: Dict[str, List[Dict[str, str]]]) -> Tuple[List[Dict[str, str]], List[str]]:
    rows: List[Dict[str, str]] = []
    missing_handles: List[str] = []
    now_timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")

    for base_key, handles in groups:
        variant_records: List[VariantRecord] = []
        for legacy_handle in handles:
            handle_rows = backup_rows.get(legacy_handle)
            if not handle_rows:
                missing_handles.append(f"{base_key}:{legacy_handle}")
                continue
            variant_records.append(summarise_variant(handle_rows, legacy_handle))
        if not variant_records:
            continue

        product_name_candidates = [record.product_name for record in variant_records if record.product_name]
        base_name = compute_base_name(product_name_candidates) if product_name_candidates else base_key.replace("-", " ").title()
        handle = ensure_handle(base_key, base_name)

        option_values: List[str] = []
        seen_option_keys: set[str] = set()
        for record in variant_records:
            fallback = record.variant_title or record.sku or record.legacy_handle
            option_value = extract_option_value(record.product_name or record.variant_title, base_name, fallback)
            option_value = re.sub(r"\s+", " ", option_value).strip()
            option_value = re.sub(r"^(\d+)\s*-\s*", r"\1 ", option_value)
            option_key = option_value.strip().lower()
            suffix = 2
            candidate = option_value
            while option_key in seen_option_keys:
                candidate = f"{option_value} ({suffix})"
                option_key = candidate.lower()
                suffix += 1
            option_values.append(candidate)
            seen_option_keys.add(option_key)

        option_name = "Size" if len(option_values) > 1 and all(looks_like_size(value) for value in option_values) else "Variant"

        product_tags = collect_tags(record.tags for record in variant_records)
        product_description = pick_longest(record.description for record in variant_records)
        product_vendor = first_non_empty(record.vendor for record in variant_records)
        product_type = first_non_empty(record.product_type for record in variant_records) or "grouped"
        if product_type.lower() == "simple":
            product_type = "grouped"
        product_status = choose_status(variant_records)
        product_seo_title = first_non_empty(record.seo_title for record in variant_records)
        product_seo_description = first_non_empty(record.seo_description for record in variant_records)
        published_date = first_non_empty(record.published_date for record in variant_records) or now_timestamp

        for record, option_value in zip(variant_records, option_values):
            images_field = "||".join(record.image_urls)
            rows.append({
                "Handle": handle,
                "Product_Name": base_name,
                "Product_Type": product_type,
                "Status": product_status,
                "Published_Date": published_date,
                "Tags": product_tags,
                "Vendor": product_vendor,
                "Description": product_description,
                "SEO_Title": product_seo_title,
                "SEO_Description": product_seo_description,
                "Variant_Title": record.variant_title,
                "Variant_SKU": record.sku,
                "Variant_Price": record.price,
                "Variant_Compare_Price": record.compare_price,
                "Variant_Inventory": record.inventory,
                "Variant_Weight": record.weight,
                "Variant_Weight_Unit": record.weight_unit,
                "Variant_Requires_Shipping": record.requires_shipping,
                "Variant_Taxable": record.taxable,
                "Variant_Option1_Name": option_name,
                "Variant_Option1": option_value,
                "Variant_Fulfillment_Service": "manual",
                "Variant_Inventory_Policy": "continue",
                "Variant_Inventory_Tracker": "shopify" if record.sku else "",
                "Variant_Barcode": record.barcode,
                "Image_URL": images_field,
            })

    return rows, missing_handles


def write_csv(path: Path, rows: Sequence[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_HEADER)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> int:
    args = parse_args()
    if not args.groups.exists():
        raise SystemExit(f"❌ Groups file not found: {args.groups}")
    if not args.backup.exists():
        raise SystemExit(f"❌ Backup file not found: {args.backup}")

    groups = read_groups(args.groups)
    if not groups:
        print("⚠️  No create-category groups found; nothing to do")
        return 0

    backup_rows = load_backup_rows(args.backup)
    rows, missing = build_rows(groups, backup_rows)

    if missing:
        print("⚠️  Missing legacy handles (skipped):")
        for entry in missing:
            print(f"   • {entry}")

    if not rows:
        print("⚠️  No rows generated; aborting without writing CSV")
        return 0

    rows.sort(key=lambda item: (item["Handle"], item["Variant_Option1"], item["Variant_SKU"]))
    write_csv(args.output, rows)

    handles = {row["Handle"] for row in rows}
    print("✅ Generated consolidated spec")
    print(f"   • Products: {len(handles)}")
    print(f"   • Variants: {len(rows)}")
    print(f"   • Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
