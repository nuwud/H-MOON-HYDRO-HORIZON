#!/usr/bin/env python3
"""Generate consolidated multi-variant Shopify products from WooCommerce grouped products.

This script implements the workflow described in ``specs/variant-consolidation.spec.md``:

* Read the WooCommerce CSV export to discover grouped product families, pricing, and metadata.
* Read the latest Shopify product export to understand existing handles and capture redirect data.
* Build a consolidated CSV with one Shopify product per Woo grouped family and one row per variant.
* Emit auxiliary reports for product retirement, redirects, and data follow-up.

Outputs are written to ``outputs/variant_consolidation`` by default. No files are overwritten in-place.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import html
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

DEFAULT_WOO_PATH = Path("CSVs/Products-Export-2025-Oct-29-171532.csv")
DEFAULT_SHOPIFY_PATH = Path("CSVs/products_export_1.csv")
DEFAULT_OUTPUT_DIR = Path("outputs/variant_consolidation")
DEFAULT_CONFIG_PATH = Path("config/variant_consolidation.json")

DEFAULT_CONFIG = {
    "option_value_map": {
        "1 qt": "1 qt",
        "1 gal": "1 gal",
        "2.5 gal": "2.5 gal",
        "6 gal": "6 gal",
        "bag of 10": "Bag of 10",
        "bag of 25": "Bag of 25",
        "bag of 50": "Bag of 50",
        "bag of 100": "Bag of 100",
        "replacement motor": "Replacement Motor",
        "replacement grate": "Replacement Grate",
    },
    "default_weight": {"value": 0.0, "unit": "lb"},
    "default_inventory_policy": "deny",
    "redirect_domain_prefixes": ["https://hmoonhydro.com"],
    "handle_suffixes": ["-bundle", "-set", "-kit"],
}

SHOPIFY_TRUE = "True"
SHOPIFY_FALSE = "False"

CSV_HEADER = [
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
]

RETIREMENT_HEADER = ["Handle", "Status", "Notes"]
REDIRECT_HEADER = ["source_url", "target_url", "notes"]
FOLLOWUP_HEADER = ["SKU", "Handle", "Reason", "Details"]
UNMATCHED_HEADER = ["Grouped_Handle", "Parent_Name", "Missing_Item"]
SHARED_HEADER = [
    "Grouped_Handle",
    "Parent_Name",
    "Requested_Item",
    "Existing_Handle",
    "Existing_Title",
    "SKU",
]


@dataclass
class WooRow:
    raw: Dict[str, str]
    sku: str
    product_name: str
    product_type: str
    slug: str
    permalink: str
    description: str
    short_description: str
    tags: str
    vendor: str
    manage_stock: str
    stock_status: str
    stock: Optional[int]
    regular_price: Optional[float]
    price: Optional[float]
    sale_price: Optional[float]
    weight: Optional[float]
    length: Optional[float]
    width: Optional[float]
    height: Optional[float]
    barcode: str
    grouped: List[str] = field(default_factory=list)
    shopify_mapping: Dict[str, Dict[str, str]] = field(default_factory=dict)


@dataclass
class ShopifyRow:
    row: Dict[str, str]
    handle: str
    product_id: str
    variant_id: str
    sku: str


def load_config(path: Path) -> Dict[str, object]:
    config = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy through json
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            user_config = json.load(handle)
        merge_dict(config, user_config)
    return config


def merge_dict(base: Dict[str, object], override: Dict[str, object]) -> None:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_dict(base[key], value)  # type: ignore[arg-type]
        else:
            base[key] = value


def parse_float(raw: str) -> Optional[float]:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_int(raw: str) -> Optional[int]:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return int(round(float(raw)))
    except ValueError:
        return None


def parse_grouped(raw: str) -> List[str]:
    if not raw:
        return []
    return [segment.strip() for segment in raw.split("|~|") if segment.strip()]


def normalise_name(value: str) -> str:
    """Normalise product names for comparison.

    Performs HTML entity decoding, strips unusual punctuation, and condenses
    whitespace so grouped entries line up with Woo child product names.
    """

    value = html.unescape(value or "")
    replacements = {
        "\u2019": "'",
        "\u2018": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2032": "'",  # prime symbol
        "\u2033": '"',
        "\u02bc": "'",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "&": " and ",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9\-\s]", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalise_base_name(value: str) -> str:
    """Return a comparison key with trailing size/qty descriptors removed."""

    base = normalise_name(value)
    if not base:
        return base
    tokens = base.split()
    size_tokens = {
        "oz",
        "g",
        "kg",
        "lb",
        "lbs",
        "gal",
        "gallon",
        "qt",
        "pt",
        "liter",
        "litre",
        "l",
        "lt",
        "ml",
        "mm",
        "cm",
        "inch",
        "in",
        "ft",
        "cfm",
        "w",
        "watts",
        "bag",
        "bags",
        "pack",
        "pair",
        "roll",
        "set",
        "x",
    }
    extra_tokens = {"of", "per", "with", "w", "and"}
    while tokens:
        tail = tokens[-1]
        if tail.isdigit() or tail.replace(".", "", 1).isdigit():
            tokens.pop()
            continue
        if tail in size_tokens:
            tokens.pop()
            continue
        if tail in extra_tokens:
            tokens.pop()
            continue
        break
    return " ".join(tokens)


def slugify(value: str) -> str:
    import re

    value = value.lower().strip()
    value = value.replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "product"


def parse_shopify_mapping(raw: str) -> Dict[str, Dict[str, str]]:
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    mapping: Dict[str, Dict[str, str]] = {}
    for key, payload in decoded.items():
        if isinstance(payload, dict):
            mapping[key] = {
                "product_id": str(payload.get("_w2s_shopify_product_id", "")),
                "variant_id": str(payload.get("_w2s_shopify_variant_id", "")),
                "status": str(payload.get("status", "")),
            }
    return mapping


def load_woo_rows(path: Path) -> Tuple[List[WooRow], List[WooRow]]:
    parents: List[WooRow] = []
    children: List[WooRow] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            product_type = (raw.get("Type") or "").strip().lower()
            sku = (raw.get("Sku") or "").strip()
            row = WooRow(
                raw=raw,
                sku=sku,
                product_name=(raw.get("Product Name") or "").strip(),
                product_type=product_type,
                slug=(raw.get("Slug") or "").strip(),
                permalink=(raw.get("Permalink") or "").strip(),
                description=(raw.get("Product description") or "").strip(),
                short_description=(raw.get("Product short description") or "").strip(),
                tags=(raw.get("Product tags") or "").strip(),
                vendor=(raw.get("Brands") or "").strip() or "H Moon Hydro",
                manage_stock=(raw.get("Manage Stock") or "").strip().lower(),
                stock_status=(raw.get("Stock Status") or "").strip().lower(),
                stock=parse_int(raw.get("Stock", "")),
                regular_price=parse_float(raw.get("Regular Price", "")),
                price=parse_float(raw.get("Price", "")),
                sale_price=parse_float(raw.get("Sale Price", "")),
                weight=parse_float(raw.get("Weight", "")),
                length=parse_float(raw.get("Length", "")),
                width=parse_float(raw.get("Width", "")),
                height=parse_float(raw.get("Height", "")),
                barcode=(raw.get("GTIN, UPC, EAN, or ISBN") or "").strip(),
                grouped=parse_grouped(raw.get("Grouped products", "")),
                shopify_mapping=parse_shopify_mapping(raw.get("_w2s_shopify_data", "")),
            )
            if product_type == "grouped":
                parents.append(row)
            else:
                children.append(row)
    return parents, children


def load_shopify_rows(path: Path) -> Tuple[List[ShopifyRow], Dict[str, ShopifyRow], Dict[str, List[ShopifyRow]]]:
    rows: List[ShopifyRow] = []
    by_sku: Dict[str, ShopifyRow] = {}
    by_handle: Dict[str, List[ShopifyRow]] = defaultdict(list)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            row = ShopifyRow(
                row=raw,
                handle=(raw.get("Handle") or "").strip(),
                product_id=(raw.get("Product_ID") or "").strip(),
                variant_id=(raw.get("Variant_ID") or "").strip(),
                sku=(raw.get("Variant_SKU") or "").strip(),
            )
            rows.append(row)
            if row.sku:
                by_sku[row.sku] = row
            if row.handle:
                by_handle[row.handle].append(row)
    return rows, by_sku, by_handle


def effective_price(row: WooRow) -> Optional[float]:
    if row.sale_price not in (None, 0):
        return row.sale_price
    if row.price not in (None, 0):
        return row.price
    if row.regular_price not in (None, 0):
        return row.regular_price
    return None


def format_price(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def choose_option_name(option_map: Dict[str, str], option_values: Sequence[str]) -> str:
    tokens = set()
    for value in option_values:
        norm = normalise_name(value)
        for key in option_map:
            if key in norm:
                tokens.add("size")
                break
    return "Size" if len(tokens) == len(option_values) and option_values else "Variant"


def normalise_option_value(option_map: Dict[str, str], base_name: str, value: str) -> str:
    base_norm = normalise_name(base_name)
    value_norm = normalise_name(value)
    if base_norm and value_norm.startswith(base_norm):
        remainder = value_norm[len(base_norm):].strip()
        if remainder:
            value = value[len(base_name):].strip(" -") or value
    for key, replacement in option_map.items():
        if key.lower() in value.lower():
            return replacement
    return value


def ensure_unique_handle(desired: str, existing: Iterable[str], suffixes: Sequence[str]) -> str:
    existing_set = set(existing)
    if desired not in existing_set:
        return desired
    for suffix in suffixes:
        candidate = f"{desired}{suffix}"
        if candidate not in existing_set:
            return candidate
    index = 2
    while True:
        candidate = f"{desired}-{index}"
        if candidate not in existing_set:
            return candidate
        index += 1


def collect_tags(*values: str) -> str:
    tags = []
    for value in values:
        if not value:
            continue
        parts = [part.strip() for part in value.split(",") if part.strip()]
        tags.extend(parts)
    deduped = sorted(set(tags))
    return ", ".join(deduped)


def build_outputs(
    parents: List[WooRow],
    children: List[WooRow],
    shopify_by_sku: Dict[str, ShopifyRow],
    shopify_by_handle: Dict[str, List[ShopifyRow]],
    config: Dict[str, object],
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]], List[Dict[str, str]], List[Dict[str, str]], List[Dict[str, str]]]:
    child_lookup: Dict[str, List[WooRow]] = defaultdict(list)
    child_lookup_base: Dict[str, List[WooRow]] = defaultdict(list)
    sku_lookup: Dict[str, WooRow] = {}
    for child in children:
        key = normalise_name(child.product_name)
        base_key = normalise_base_name(child.product_name)
        child_lookup[key].append(child)
        if base_key:
            child_lookup_base[base_key].append(child)
        if child.sku:
            sku_lookup[child.sku] = child

    used_children: set[str] = set()
    consolidated_rows: List[Dict[str, str]] = []
    retirement_rows: List[Dict[str, str]] = []
    redirect_rows: List[Dict[str, str]] = []
    followup_rows: List[Dict[str, str]] = []
    unmatched_rows: List[Dict[str, str]] = []
    shared_rows: List[Dict[str, str]] = []

    existing_handles = set(shopify_by_handle.keys())
    assigned_handles: set[str] = set()

    option_map = config.get("option_value_map", {})
    if not isinstance(option_map, dict):
        option_map = {}
    suffixes = config.get("handle_suffixes", [])
    if not isinstance(suffixes, list):
        suffixes = []

    default_weight_conf = config.get("default_weight", {"value": 0.0, "unit": "lb"})
    default_weight_value = float(default_weight_conf.get("value", 0.0))
    default_weight_unit = str(default_weight_conf.get("unit", "lb"))
    inventory_policy = str(config.get("default_inventory_policy", "deny"))

    now_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for parent in parents:
        if not parent.grouped:
            continue
        desired_handle = parent.slug or slugify(parent.product_name)
        handle = ensure_unique_handle(
            desired_handle,
            existing_handles | assigned_handles,
            suffixes,
        )
        assigned_handles.add(handle)

        resolved_children: List[WooRow] = []
        missing_items: List[str] = []
        for entry in parent.grouped:
            key = normalise_name(entry)
            base_key = normalise_base_name(entry)
            candidates = child_lookup.get(key, [])
            if not candidates and base_key:
                candidates = child_lookup_base.get(base_key, [])
            candidate: Optional[WooRow] = None
            candidate_used: Optional[WooRow] = None
            for row in candidates:
                if row.sku in used_children:
                    if candidate_used is None:
                        candidate_used = row
                    continue
                candidate = row
                break
            if candidate is None:
                # fallback: try exact SKU match if string looks like SKU
                entry_sku = entry.strip()
                if entry_sku in sku_lookup and entry_sku not in used_children:
                    candidate = sku_lookup[entry_sku]
                elif entry_sku in sku_lookup and candidate_used is None:
                    candidate_used = sku_lookup[entry_sku]
            if candidate is None and base_key:
                # final fallback: find first child whose name starts with entry or vice versa
                for child_row in children:
                    child_key = normalise_name(child_row.product_name)
                    child_base = normalise_base_name(child_row.product_name)
                    if child_row.sku in used_children:
                        if candidate_used is None and (
                            child_key.startswith(key)
                            or key.startswith(child_key)
                            or (base_key and (child_base == base_key or child_key.startswith(base_key) or base_key.startswith(child_key)))
                        ):
                            candidate_used = child_row
                        continue
                    if child_key.startswith(key) or key.startswith(child_key) or (
                        base_key and (child_base == base_key or child_key.startswith(base_key) or base_key.startswith(child_key))
                    ):
                        candidate = child_row
                        break
            if candidate is None:
                if candidate_used is not None:
                    shared_rows.append({
                        "Grouped_Handle": handle,
                        "Parent_Name": parent.product_name,
                        "Requested_Item": entry,
                        "Existing_Handle": shopify_by_sku.get(candidate_used.sku, ShopifyRow({}, '', '', '', '')).handle,
                        "Existing_Title": candidate_used.product_name,
                        "SKU": candidate_used.sku,
                    })
                missing_items.append(entry)
                continue
            resolved_children.append(candidate)
            used_children.add(candidate.sku)

        if missing_items:
            for item in missing_items:
                unmatched_rows.append({
                    "Grouped_Handle": handle,
                    "Parent_Name": parent.product_name,
                    "Missing_Item": item,
                })

        if not resolved_children:
            continue

        option_values = [normalise_option_value(option_map, parent.product_name, child.product_name) for child in resolved_children]
        option_name = choose_option_name(option_map, option_values)

        tags_combined = collect_tags(parent.tags, *(child.tags for child in resolved_children))
        publish_date = now_timestamp

        for child, option_value in zip(resolved_children, option_values):
            price = format_price(effective_price(child))
            compare_at = ""
            reg_price = child.regular_price
            if reg_price and price and float(price) < reg_price:
                compare_at = format_price(reg_price)

            stock_value = child.stock
            if stock_value is None:
                stock_value = 0
                if child.manage_stock == "yes":
                    followup_rows.append({
                        "SKU": child.sku,
                        "Handle": handle,
                        "Reason": "missing_stock",
                        "Details": "Woo stock missing but Manage Stock=yes",
                    })

            weight_value = child.weight
            weight_unit = default_weight_unit
            if weight_value is None or weight_value <= 0:
                followup_rows.append({
                    "SKU": child.sku,
                    "Handle": handle,
                    "Reason": "missing_weight",
                    "Details": "Weight missing; default applied",
                })
                weight_value = default_weight_value
            else:
                weight_unit = child.raw.get("Weight Unit", default_weight_unit) or default_weight_unit

            variant_title = child.product_name
            consolidated_rows.append({
                "Handle": handle,
                "Product_Name": parent.product_name,
                "Product_Type": "grouped",
                "Status": "active",
                "Published_Date": publish_date,
                "Tags": tags_combined,
                "Vendor": parent.vendor or child.vendor,
                "Description": parent.description or child.description,
                "SEO_Title": parent.raw.get("SEO Title", ""),
                "SEO_Description": parent.raw.get("SEO Meta Description", ""),
                "Variant_Title": variant_title,
                "Variant_SKU": child.sku,
                "Variant_Price": price,
                "Variant_Compare_Price": compare_at,
                "Variant_Inventory": str(stock_value),
                "Variant_Weight": f"{weight_value:.2f}",
                "Variant_Weight_Unit": weight_unit,
                "Variant_Requires_Shipping": SHOPIFY_TRUE if child.raw.get("Virtual", "no").lower() != "yes" else SHOPIFY_FALSE,
                "Variant_Taxable": SHOPIFY_TRUE if child.raw.get("Tax Status", "taxable").lower() != "none" else SHOPIFY_FALSE,
                "Variant_Option1_Name": option_name,
                "Variant_Option1": option_value,
                "Variant_Fulfillment_Service": "manual",
                "Variant_Inventory_Policy": inventory_policy,
                "Variant_Inventory_Tracker": "shopify",
                "Variant_Barcode": child.barcode,
                "Image_URL": parent.raw.get("Image URL") or child.raw.get("Image URL", ""),
            })

            # Redirect + retirement handling
            shopify_row = shopify_by_sku.get(child.sku)
            if shopify_row and shopify_row.handle and shopify_row.handle != handle:
                redirect_rows.append({
                    "source_url": f"/products/{shopify_row.handle}",
                    "target_url": f"/products/{handle}",
                    "notes": "legacy-shopify",
                })
                retirement_rows.append({
                    "Handle": shopify_row.handle,
                    "Status": "draft",
                    "Notes": f"Replaced by {handle}",
                })

            # Woo permalink redirects (child)
            if child.permalink:
                redirect_rows.append({
                    "source_url": child.permalink,
                    "target_url": f"/products/{handle}",
                    "notes": "woo-child",
                })

        # Woo parent permalink redirect
        if parent.permalink:
            redirect_rows.append({
                "source_url": parent.permalink,
                "target_url": f"/products/{handle}",
                "notes": "woo-parent",
            })

    # Deduplicate retirement + redirect rows
    retirement_unique: Dict[Tuple[str, str], Dict[str, str]] = {}
    for row in retirement_rows:
        key = (row["Handle"], row["Status"])
        retirement_unique[key] = row
    redirect_unique: Dict[Tuple[str, str], Dict[str, str]] = {}
    for row in redirect_rows:
        key = (row["source_url"], row["target_url"])
        redirect_unique[key] = row

    return (
        consolidated_rows,
        list(retirement_unique.values()),
        list(redirect_unique.values()),
        followup_rows,
        unmatched_rows,
        shared_rows,
    )


def write_csv(path: Path, header: Sequence[str], rows: Iterable[Dict[str, str]]) -> None:
    data = list(rows)
    if not data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=header)
        writer.writeheader()
        for row in data:
            writer.writerow(row)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Consolidate Woo grouped products into Shopify variants")
    parser.add_argument("--woo-csv", type=Path, default=DEFAULT_WOO_PATH, help="Path to WooCommerce CSV export")
    parser.add_argument("--shopify-csv", type=Path, default=DEFAULT_SHOPIFY_PATH, help="Path to Shopify CSV export")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for generated outputs")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Optional config file for overrides")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    if not args.woo_csv.exists():
        print(f"❌ Woo CSV not found: {args.woo_csv}", file=sys.stderr)
        return 1
    if not args.shopify_csv.exists():
        print(f"❌ Shopify CSV not found: {args.shopify_csv}", file=sys.stderr)
        return 1

    config = load_config(args.config)
    parents, children = load_woo_rows(args.woo_csv)
    _, shopify_by_sku, shopify_by_handle = load_shopify_rows(args.shopify_csv)

    (
        consolidated_rows,
        retirement_rows,
        redirect_rows,
        followup_rows,
        unmatched_rows,
        shared_rows,
    ) = build_outputs(parents, children, shopify_by_sku, shopify_by_handle, config)

    output_dir: Path = args.output_dir
    write_csv(output_dir / "variant_consolidation.csv", CSV_HEADER, consolidated_rows)
    write_csv(output_dir / "variant_retirements.csv", RETIREMENT_HEADER, retirement_rows)
    write_csv(output_dir / "redirect_mappings.csv", REDIRECT_HEADER, redirect_rows)
    write_csv(output_dir / "shipping_follow_up.csv", FOLLOWUP_HEADER, followup_rows)
    write_csv(output_dir / "unmatched_children.csv", UNMATCHED_HEADER, unmatched_rows)
    write_csv(output_dir / "shared_sku_recommendations.csv", SHARED_HEADER, shared_rows)

    print("✅ Consolidation complete")
    print(f"   • Consolidated variants: {len(consolidated_rows):,}")
    print(f"   • Retirement entries: {len(retirement_rows):,}")
    print(f"   • Redirects: {len(redirect_rows):,}")
    print(f"   • Follow-up rows: {len(followup_rows):,}")
    print(f"   • Unmatched entries: {len(unmatched_rows):,}")
    print(f"   • Shared SKU recommendations: {len(shared_rows):,}")
    print(f"📁 Output directory: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
