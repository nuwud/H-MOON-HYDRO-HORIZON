#!/usr/bin/env python3
"""
Synchronize Shopify inventory and metadata using WooCommerce export data.

This script performs three primary tasks:
 1. Loads WooCommerce and Shopify CSV exports.
 2. Generates an updated Shopify CSV with inventory, pricing, and metadata
    aligned to the Woo data (local synchronization).
 3. Optionally calls the Shopify Admin API to push inventory quantities to the
    online development store (remote synchronization).

It also reports Shopify fields that are empty while WooCommerce has usable
content so the merchandising team can back-fill them.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# Default locations relative to the repository root
DEFAULT_WOO_PATH = Path("CSVs/Products-Export-2025-Oct-29-171532.csv")
DEFAULT_SHOPIFY_PATH = Path("CSVs/products_export_1.csv")
DEFAULT_OUTPUT_PATH = Path("CSVs/shopify_inventory_synced.csv")
DEFAULT_REPORT_DIR = Path("reports")
SHOPIFY_API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2023-10")

# Map Shopify fields to WooCommerce equivalents for missing-info reporting
FIELD_MAP = [
    ("Body (HTML)", "Product description"),
    ("SEO Title", "SEO Title"),
    ("SEO Description", "SEO Meta Description"),
    ("Image Src", "Image URL"),
    ("Tags", "Product tags"),
    ("Vendor", "Brands"),
    ("Variant Barcode", "GTIN, UPC, EAN, or ISBN"),
]


def parse_int(raw: Optional[str]) -> Optional[int]:
    """Safely parse an integer value from WooCommerce exports."""
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    try:
        return int(round(float(value)))
    except ValueError:
        return None


def parse_float(raw: Optional[str]) -> Optional[float]:
    """Safely parse a float value."""
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def format_price(value: Optional[float]) -> str:
    """Format price values for Shopify imports."""
    if value is None:
        return ""
    return f"{value:.2f}"


def load_woo_products(path: Path) -> Dict[str, Dict[str, object]]:
    """Load WooCommerce export data keyed by SKU."""
    products: Dict[str, Dict[str, object]] = {}
    if not path.exists():
        raise FileNotFoundError(f"WooCommerce CSV not found: {path}")

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            sku = (row.get("Sku") or "").strip()
            if not sku:
                continue

            manage_stock = (row.get("Manage Stock") or "").strip().lower()
            stock_raw = row.get("Stock") or ""
            stock = parse_int(stock_raw)
            stock_status = (row.get("Stock Status") or "").strip().lower()
            if stock is None:
                # If WooCommerce is not tracking stock but the status is
                # explicitly out of stock we can safely treat it as zero.
                if manage_stock == "yes":
                    stock = 0
                elif stock_status == "outofstock":
                    stock = 0

            regular_price = parse_float(row.get("Regular Price"))
            price = parse_float(row.get("Price"))
            sale_price = parse_float(row.get("Sale Price"))
            # Woo often duplicates regular price into the Price column. Prefer
            # sale price when available, otherwise fall back to Price then
            # Regular Price.
            effective_price = sale_price if sale_price not in (None, 0) else (
                price if price not in (None, 0) else regular_price
            )

            products[sku] = {
                "sku": sku,
                "slug": (row.get("Slug") or "").strip(),
                "product_name": (row.get("Product Name") or "").strip(),
                "manage_stock": manage_stock,
                "stock_status": stock_status,
                "stock": stock,
                "regular_price": regular_price,
                "sale_price": sale_price,
                "effective_price": effective_price,
                "description_html": (row.get("Product description") or "").strip(),
                "short_description": (row.get("Product short description") or "").strip(),
                "seo_title": (row.get("SEO Title") or "").strip(),
                "seo_description": (row.get("SEO Meta Description") or "").strip(),
                "image_url": (row.get("Image URL") or "").strip(),
                "tags": (row.get("Product tags") or "").strip(),
                "vendor": (row.get("Brands") or "").strip(),
                "barcode": (row.get("GTIN, UPC, EAN, or ISBN") or "").strip(),
                "raw": row,
                "shopify_mapping": extract_shopify_mapping(row.get("_w2s_shopify_data")),
            }

    return products


def extract_shopify_mapping(raw: Optional[str]) -> Dict[str, Dict[str, str]]:
    """Parse the Woo sidecar metadata that records Shopify IDs."""
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    mapping: Dict[str, Dict[str, str]] = {}
    for key, payload in decoded.items():
        if not isinstance(payload, dict):
            continue
        mapping[key.strip()] = {
            "product_id": str(payload.get("_w2s_shopify_product_id", "")).strip(),
            "variant_id": str(payload.get("_w2s_shopify_variant_id", "")).strip(),
            "status": str(payload.get("status", "")).strip(),
        }
    return mapping


def load_shopify_rows(path: Path) -> Tuple[List[Dict[str, str]], List[str]]:
    """Load Shopify export rows preserving column order."""
    if not path.exists():
        raise FileNotFoundError(f"Shopify CSV not found: {path}")

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    return rows, fieldnames


def ensure_tracker(row: Dict[str, str]) -> None:
    """Default the inventory tracker to Shopify when empty."""
    tracker = (row.get("Variant Inventory Tracker") or "").strip()
    if not tracker:
        row["Variant Inventory Tracker"] = "shopify"


def update_shopify_rows(
    shopify_rows: List[Dict[str, str]],
    woo_products: Dict[str, Dict[str, object]],
) -> Tuple[int, int, List[Dict[str, str]], List[Dict[str, str]], List[Dict[str, str]]]:
    """Update Shopify rows in-place and collect reporting details."""
    inventory_updates = 0
    unknown_stock = 0
    missing_fields: List[Dict[str, str]] = []
    price_updates: List[Dict[str, str]] = []
    barcode_updates: List[Dict[str, str]] = []

    for row in shopify_rows:
        sku = (row.get("Variant SKU") or "").strip()
        handle = (row.get("Handle") or "").strip()
        if not sku:
            continue
        woo = woo_products.get(sku)
        if not woo:
            continue

        stock_value = woo.get("stock")
        if stock_value is None:
            unknown_stock += 1
            stock_value = 0

        ensure_tracker(row)
        row["Variant Inventory Qty"] = str(max(int(stock_value), 0))
        inventory_updates += 1

        # Maintain inventory policy aligned with Shopify best practice.
        policy = (row.get("Variant Inventory Policy") or "").strip() or "deny"
        row["Variant Inventory Policy"] = policy

        # Update prices based on Woo data
        sale_price: Optional[float] = woo.get("sale_price")  # type: ignore[arg-type]
        regular_price: Optional[float] = woo.get("regular_price")  # type: ignore[arg-type]
        effective_price: Optional[float] = woo.get("effective_price")  # type: ignore[arg-type]

        if effective_price is not None:
            formatted_price = format_price(effective_price)
            if (row.get("Variant Price") or "").strip() != formatted_price:
                price_updates.append({
                    "SKU": sku,
                    "Handle": handle,
                    "Old Price": row.get("Variant Price", ""),
                    "New Price": formatted_price,
                })
            row["Variant Price"] = formatted_price

        compare_at = ""
        if sale_price not in (None, 0) and regular_price and regular_price > sale_price:
            compare_at = format_price(regular_price)
        if (row.get("Variant Compare At Price") or "").strip() != compare_at:
            if compare_at:
                price_updates.append({
                    "SKU": sku,
                    "Handle": handle,
                    "Old Compare At": row.get("Variant Compare At Price", ""),
                    "New Compare At": compare_at,
                })
            row["Variant Compare At Price"] = compare_at

        # Copy barcode when missing in Shopify but present in Woo
        barcode = woo.get("barcode")
        if barcode and not (row.get("Variant Barcode") or "").strip():
            row["Variant Barcode"] = barcode  # type: ignore[assignment]
            barcode_updates.append({"SKU": sku, "Handle": handle, "Barcode": barcode})

        # Capture missing metadata fields
        woo_raw = woo.get("raw") or {}
        for shopify_field, woo_field in FIELD_MAP:
            shop_val = (row.get(shopify_field) or "").strip()
            woo_val = (woo_raw.get(woo_field) or "").strip()
            if not shop_val and woo_val:
                missing_fields.append({
                    "SKU": sku,
                    "Handle": handle,
                    "Field": shopify_field,
                    "Woo Field": woo_field,
                    "Suggested Value": woo_val,
                })

        # Ensure vendor/tag parity when Shopify is blank
        if not (row.get("Vendor") or "").strip():
            vendor_value = woo.get("vendor")
            if vendor_value:
                row["Vendor"] = vendor_value  # type: ignore[assignment]

        if not (row.get("Tags") or "").strip():
            tags_value = woo.get("tags")
            if tags_value:
                row["Tags"] = tags_value  # type: ignore[assignment]

        # Push long-form description when Shopify body empty
        if not (row.get("Body (HTML)") or "").strip():
            description_value = woo.get("description_html")
            if description_value:
                row["Body (HTML)"] = description_value  # type: ignore[assignment]

    return inventory_updates, unknown_stock, missing_fields, price_updates, barcode_updates


def write_csv(path: Path, fieldnames: List[str], rows: Iterable[Dict[str, str]]) -> None:
    """Write rows back out to CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_report(path: Path, rows: Iterable[Dict[str, str]], fieldnames: List[str]) -> None:
    """Persist a simple CSV report."""
    data = list(rows)
    if not data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)


def normalise_store_key(raw: str) -> str:
    """Normalise Shopify store identifiers for comparison."""
    cleaned = raw.lower().strip()
    for prefix in ("https://", "http://"):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
    cleaned = cleaned.strip('/')
    if cleaned.endswith(".myshopify.com"):
        cleaned = cleaned[: -len(".myshopify.com")]
    return cleaned


def resolve_variant_id(woo_product: Dict[str, object], store_domain: str) -> Optional[str]:
    """Find the Shopify variant ID from the Woo metadata."""
    mapping = woo_product.get("shopify_mapping")
    if not isinstance(mapping, dict) or not mapping:
        return None
    target = normalise_store_key(store_domain)
    for key, payload in mapping.items():
        if normalise_store_key(key) == target:
            variant_id = payload.get("variant_id")
            return variant_id or None
    # Fallback to the first available entry
    first = next(iter(mapping.values()), None)
    if first:
        return first.get("variant_id") or None
    return None


def update_shopify_remote(
    woo_products: Dict[str, Dict[str, object]],
    store_domain: str,
    access_token: str,
    location_id: str,
    *,
    include_zero: bool = True,
    delay: float = 0.8,
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> Tuple[int, int, List[str], List[Dict[str, str]]]:
    """Push inventory levels to Shopify via the Admin API."""
    try:
        import requests  # type: ignore import
    except ImportError as exc:  # pragma: no cover - helps users without requests installed
        raise RuntimeError(
            "The 'requests' library is required for --update-shopify. Install it via 'pip install requests'."
        ) from exc
    base_url = f"https://{store_domain}.myshopify.com/admin/api/{SHOPIFY_API_VERSION}"
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Shopify-Access-Token": access_token,
    })

    def perform_request(method: str, url: str, *, params=None, json=None, max_attempts: int = 3):
        attempts = 0
        while True:
            response = session.request(method.upper(), url, params=params, json=json, timeout=30)
            if response.status_code != 429 or attempts >= max_attempts - 1:
                return response
            wait_time = max(delay * (2 ** attempts), delay) + 0.5
            time.sleep(wait_time)
            attempts += 1

    success = 0
    skipped = 0
    missing_variant: List[str] = []
    failure_details: List[Dict[str, str]] = []
    processed = 0

    sku_items = sorted(woo_products.values(), key=lambda item: item.get("sku", ""))
    for product in sku_items:
        if limit is not None and processed >= limit:
            break
        sku = product.get("sku")
        stock = product.get("stock")
        if stock is None:
            if include_zero:
                stock = 0
            else:
                skipped += 1
                processed += 1
                continue

        variant_id = resolve_variant_id(product, store_domain)
        variant_payload: Optional[Dict[str, object]] = None

        if variant_id:
            variant_url = f"{base_url}/variants/{variant_id}.json"
            variant_resp = perform_request("get", variant_url)
            if variant_resp.status_code == 200:
                variant_payload = variant_resp.json().get("variant", {})
        
        if variant_payload is None:
            search_resp = perform_request("get", f"{base_url}/variants.json", params={"sku": sku})
            if search_resp.status_code == 200:
                variants = search_resp.json().get("variants", [])
                if variants:
                    variant_payload = variants[0]
                    variant_id = variant_payload.get("id")
                else:
                    failure_details.append({
                        "SKU": str(sku),
                        "Reason": "variant_not_found_by_sku",
                        "Status": str(search_resp.status_code),
                        "Details": search_resp.text[:200],
                    })
            else:
                failure_details.append({
                    "SKU": str(sku),
                    "Reason": "variant_lookup_http_error",
                    "Status": str(search_resp.status_code),
                    "Details": search_resp.text[:200],
                })

        if not variant_payload or not variant_id:
            missing_variant.append(str(sku))
            failure_details.append({
                "SKU": str(sku),
                "Reason": "variant_lookup_failed",
                "Status": "",
                "Details": "",
            })
            processed += 1
            time.sleep(delay)
            continue

        inventory_item_id = variant_payload.get("inventory_item_id")
        if not inventory_item_id:
            missing_variant.append(str(sku))
            failure_details.append({
                "SKU": str(sku),
                "Reason": "missing_inventory_item_id",
                "Status": "",
                "Details": "",
            })
            time.sleep(delay)
            continue

        inventory_management = variant_payload.get("inventory_management")
        if inventory_management != "shopify" and not dry_run:
            update_payload = {"variant": {"id": int(variant_id), "inventory_management": "shopify"}}
            update_resp = perform_request("put", f"{base_url}/variants/{variant_id}.json", json=update_payload)
            if update_resp.status_code not in (200, 201):
                missing_variant.append(str(sku))
                failure_details.append({
                    "SKU": str(sku),
                    "Reason": "enable_tracking_failed",
                    "Status": str(update_resp.status_code),
                    "Details": update_resp.text[:500],
                })
                time.sleep(delay)
                continue

        processed += 1
        if dry_run:
            print(f"DRY RUN: would set SKU {sku} (variant {variant_id}) to {stock}")
            success += 1
            time.sleep(delay)
            continue

        payload = {
            "inventory_item_id": int(inventory_item_id),
            "location_id": int(location_id),
            "available": int(stock),
        }
        level_url = f"{base_url}/inventory_levels/set.json"
        level_resp = perform_request("post", level_url, json=payload)
        if level_resp.status_code in (200, 201):
            success += 1
        else:
            missing_variant.append(str(sku))
            failure_details.append({
                "SKU": str(sku),
                "Reason": "inventory_set_failed",
                "Status": str(level_resp.status_code),
                "Details": level_resp.text[:500],
            })
        time.sleep(delay)

    return success, skipped, missing_variant, failure_details


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchronise Shopify inventory with WooCommerce exports")
    parser.add_argument("--woo-csv", type=Path, default=DEFAULT_WOO_PATH, help="Path to WooCommerce CSV export")
    parser.add_argument("--shopify-csv", type=Path, default=DEFAULT_SHOPIFY_PATH, help="Path to Shopify CSV export")
    parser.add_argument("--output-csv", type=Path, default=DEFAULT_OUTPUT_PATH, help="Path for the updated Shopify CSV")
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR, help="Directory for generated reports")
    parser.add_argument("--update-shopify", action="store_true", help="Push inventory updates to the Shopify dev store")
    parser.add_argument("--shopify-domain", default=os.environ.get("SHOPIFY_DOMAIN", "h-moon-hydro"), help="Shopify store domain (without .myshopify.com)")
    parser.add_argument("--location-id", default=os.environ.get("SHOPIFY_LOCATION_ID"), help="Shopify location ID for inventory updates")
    parser.add_argument("--access-token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN"), help="Shopify Admin API access token")
    parser.add_argument("--dry-run", action="store_true", help="Log intended Shopify updates without calling the API")
    parser.add_argument("--limit", type=int, help="Limit the number of Shopify API updates (for testing)")
    parser.add_argument("--skip-zero", action="store_true", help="Skip products with unknown/zero stock when updating Shopify")
    parser.add_argument(
        "--throttle",
        type=float,
        default=float(os.environ.get("SHOPIFY_THROTTLE", "0.8")),
        help="Delay between Shopify API calls in seconds (default 0.8)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    print("🛍️  Synchronising Shopify inventory")
    print("=" * 60)
    print(f"• WooCommerce CSV: {args.woo_csv}")
    print(f"• Shopify CSV:     {args.shopify_csv}")

    woo_products = load_woo_products(args.woo_csv)
    shopify_rows, fieldnames = load_shopify_rows(args.shopify_csv)

    print(f"\n📦 Loaded {len(woo_products):,} WooCommerce SKUs")
    print(f"🛒 Loaded {len(shopify_rows):,} Shopify variant rows")

    updated_count, unknown_stock, missing_fields, price_updates, barcode_updates = update_shopify_rows(shopify_rows, woo_products)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = args.output_csv if args.output_csv.suffix else args.output_csv.with_suffix(".csv")
    if output_path == args.shopify_csv:
        # Avoid accidental overwrite without an explicit flag by writing to a timestamped file.
        output_path = output_path.with_name(f"{output_path.stem}_{timestamp}{output_path.suffix}")
        print(f"⚠️  Output path matches source CSV; writing to {output_path} instead")

    write_csv(output_path, fieldnames, shopify_rows)
    print(f"\n✅ Updated Shopify CSV saved to {output_path}")
    print(f"   • Inventory rows updated: {updated_count:,}")
    print(f"   • Rows without explicit Woo stock: {unknown_stock:,} (set to 0 in CSV)")

    report_dir = args.report_dir
    report_dir.mkdir(parents=True, exist_ok=True)

    missing_report = report_dir / f"missing_shopify_fields_{timestamp}.csv"
    write_report(missing_report, missing_fields, ["SKU", "Handle", "Field", "Woo Field", "Suggested Value"])
    if missing_fields:
        print(f"📝 Missing field report: {missing_report} ({len(missing_fields)} entries)")
    else:
        print("📝 No missing Shopify fields detected — great job!")

    price_report = report_dir / f"price_updates_{timestamp}.csv"
    write_report(price_report, price_updates, ["SKU", "Handle", "Old Price", "New Price", "Old Compare At", "New Compare At"])
    if price_updates:
        print(f"💲 Price changes report: {price_report} ({len(price_updates)} entries)")

    barcode_report = report_dir / f"barcode_backfill_{timestamp}.csv"
    write_report(barcode_report, barcode_updates, ["SKU", "Handle", "Barcode"])
    if barcode_updates:
        print(f"🏷️  Barcode updates report: {barcode_report} ({len(barcode_updates)} entries)")

    if args.update_shopify:
        if not args.access_token or not args.location_id:
            print("❌ Missing Shopify credentials (access token or location ID). Skipping remote update.")
        else:
            print("\n🌐 Pushing inventory to Shopify dev store...")
            success, skipped, missing_variant, failure_details = update_shopify_remote(
                woo_products,
                args.shopify_domain,
                args.access_token,
                args.location_id,
                include_zero=not args.skip_zero,
                limit=args.limit,
                dry_run=args.dry_run,
                delay=args.throttle,
            )
            print(f"✅ Remote updates succeeded for {success:,} SKUs")
            if skipped:
                print(f"➖ Skipped {skipped:,} SKUs due to missing quantities")
            if missing_variant:
                missing_path = report_dir / f"shopify_api_failures_{timestamp}.csv"
                if failure_details:
                    write_report(
                        missing_path,
                        failure_details,
                        ["SKU", "Reason", "Status", "Details"],
                    )
                else:
                    rows = [{"SKU": sku} for sku in missing_variant]
                    write_report(missing_path, rows, ["SKU"])
                print(f"⚠️  {len(missing_variant)} SKUs could not be updated. See {missing_path}")

    print("\n🎯 Next steps:")
    print("   • Import the updated CSV into the Shopify dev store (if not using the API mode)")
    print("   • Review missing-field and price reports to enrich product data")
    print("   • Spot-check a few SKUs in the dev store to confirm inventory changes")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        raise SystemExit(1)
