#!/usr/bin/env python3
"""Push variant pricing, cost, barcode, and inventory updates to Shopify.

Reads a Shopify-formatted CSV (e.g. the deduped export that was staged) and
applies the critical fields to the live store using the Admin GraphQL API.

Required environment variables:
    SHOPIFY_DOMAIN          e.g. "h-moon-hydro.myshopify.com"
    SHOPIFY_ACCESS_TOKEN    Admin API access token
    SHOPIFY_LOCATION_ID     Numeric location id for inventory writes

Example:
    export SHOPIFY_DOMAIN="h-moon-hydro.myshopify.com"
    export SHOPIFY_ACCESS_TOKEN="shpat_..."
    export SHOPIFY_LOCATION_ID="75941806154"
    python update_shopify_from_csv.py --csv CSVs/shopify_inventory_from_pos__DEDUP_20251103_211920.csv
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Dict, List, Optional

import pandas as pd
import requests

API_VERSION = "2024-07"
API_TIMEOUT = 30
RETRY_STATUS = {429, 502, 503}

FIELD_ALIASES = {
    "sku": ("Variant SKU", "SKU"),
    "barcode": ("Variant Barcode", "Barcode"),
    "price": ("Variant Price", "Price"),
    "compare_at_price": (
        "Variant Compare At Price",
        "Variant Compare At",
        "Compare At Price",
        "CompareAtPrice",
    ),
    "cost": ("Cost per item", "Cost", "Variant Cost"),
    "inventory": ("Variant Inventory Qty", "InventoryQuantity", "Inventory Qty", "Inventory"),
    "status": ("Product Status", "Status"),
}


@dataclass
class VariantRecord:
    variant_id: str
    inventory_item_id: str
    product_id: str
    sku: str
    barcode: Optional[str]


class ShopifyClient:
    def __init__(self, domain: str, token: str) -> None:
        self.endpoint = f"https://{domain}/admin/api/{API_VERSION}/graphql.json"
        self.session = requests.Session()
        self.session.headers.update(
            {
                "X-Shopify-Access-Token": token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        self.variant_cache: Dict[str, Optional[VariantRecord]] = {}

    def graphql(self, query: str, variables: Optional[Dict] = None) -> Dict:
        payload = {"query": query, "variables": variables or {}}
        attempt = 0
        while True:
            attempt += 1
            response = self.session.post(self.endpoint, json=payload, timeout=API_TIMEOUT)
            if response.status_code in RETRY_STATUS and attempt <= 5:
                retry_after = int(response.headers.get("Retry-After", 1))
                time.sleep(max(1, retry_after))
                continue
            if response.status_code != 200:
                raise RuntimeError(f"GraphQL request failed: {response.status_code} {response.text}")
            data = response.json()
            if "errors" in data and data["errors"]:
                raise RuntimeError(f"GraphQL errors: {json.dumps(data['errors'], indent=2)}")
            return data.get("data", {})

    def get_variant_by_sku(self, sku: str) -> Optional[VariantRecord]:
        sku = sku.strip()
        if not sku:
            return None
        if sku in self.variant_cache:
            return self.variant_cache[sku]
        query = """
        query variantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                sku
                barcode
                product { id }
                inventoryItem { id }
              }
            }
          }
        }
        """
        data = self.graphql(query, {"query": f"sku:{sku}"})
        edges = data.get("productVariants", {}).get("edges", [])
        if not edges:
            self.variant_cache[sku] = None
            return None
        node = edges[0]["node"]
        record = VariantRecord(
            variant_id=node["id"],
            inventory_item_id=node["inventoryItem"]["id"],
            product_id=node["product"]["id"],
            sku=node["sku"],
            barcode=node.get("barcode"),
        )
        self.variant_cache[sku] = record
        return record

    def product_variants_bulk_update(
        self,
        product_id: str,
        variants: List[Dict],
        allow_partial: bool = True,
    ) -> None:
        if not variants:
            return
        mutation = """
        mutation bulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $allowPartial: Boolean) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: $allowPartial) {
            userErrors { field message code }
          }
        }
        """
        variables = {
            "productId": product_id,
            "variants": variants,
            "allowPartial": allow_partial,
        }
        data = self.graphql(mutation, variables)
        errors = data.get("productVariantsBulkUpdate", {}).get("userErrors", [])
        if errors:
            raise RuntimeError(f"Variant update error: {errors}")

    def inventory_set_quantity(self, inventory_item_id: str, location_gid: str, quantity: int) -> None:
        mutation = """
        mutation setQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message code }
          }
        }
        """
        payload = {
            "name": "available",
            "reason": "correction",
            "ignoreCompareQuantity": True,
            "quantities": [
                {
                    "inventoryItemId": inventory_item_id,
                    "locationId": location_gid,
                    "quantity": quantity,
                }
            ],
        }
        data = self.graphql(mutation, {"input": payload})
        errors = data.get("inventorySetQuantities", {}).get("userErrors", [])
        if errors:
            raise RuntimeError(f"Inventory quantity update error: {errors}")

    def product_update(self, product_id: str, *, status: Optional[str] = None) -> None:
        if not status:
            return
        mutation = """
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            userErrors { field message }
          }
        }
        """
        payload = {"id": product_id, "status": status}
        data = self.graphql(mutation, {"input": payload})
        errors = data.get("productUpdate", {}).get("userErrors", [])
        if errors:
            raise RuntimeError(f"Product update error: {errors}")


def parse_decimal(value: str) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        decimal_value = Decimal(text)
    except InvalidOperation:
        return None
    quantized = decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return format(quantized, "f")


def parse_int(value: str) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def resolve_field(record: Dict[str, str], aliases: tuple[str, ...]) -> str:
    for name in aliases:
        if name in record:
            return record.get(name, "")
    return ""


def normalise_barcode(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def normalise_status(value: str) -> Optional[str]:
    text = str(value or "").strip().lower()
    mapping = {"active": "ACTIVE", "draft": "DRAFT", "archived": "ARCHIVED"}
    return mapping.get(text)


def build_location_gid(location_id: str) -> str:
    location_id = str(location_id).strip()
    if not location_id:
        raise ValueError("SHOPIFY_LOCATION_ID is required for inventory updates")
    if location_id.startswith("gid://"):
        return location_id
    return f"gid://shopify/Location/{location_id}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Update Shopify variants from CSV")
    parser.add_argument("--csv", default="CSVs/shopify_inventory_from_pos__DEDUP_20251103_211920.csv", help="Path to the Shopify-formatted CSV")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without calling the API")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of variant rows processed")
    args = parser.parse_args()

    domain = os.getenv("SHOPIFY_DOMAIN")
    token = os.getenv("SHOPIFY_ACCESS_TOKEN")
    location_id = os.getenv("SHOPIFY_LOCATION_ID")
    if not domain or not token:
        print("Missing SHOPIFY_DOMAIN or SHOPIFY_ACCESS_TOKEN environment variables", file=sys.stderr)
        sys.exit(1)
    location_gid = build_location_gid(location_id or "")

    df = pd.read_csv(args.csv, dtype=str).fillna("")
    client = ShopifyClient(domain, token)

    processed = 0
    updated = 0
    missing = []
    failures = []
    product_status_targets: Dict[str, str] = {}
    product_conflicts: List[str] = []
    product_failures: List[str] = []

    for record in df.to_dict("records"):
        sku = resolve_field(record, FIELD_ALIASES["sku"]).strip()
        if not sku:
            continue
        processed += 1
        if args.limit and processed > args.limit:
            break

        variant = client.get_variant_by_sku(sku)
        if variant is None:
            missing.append(sku)
            continue

        price = parse_decimal(resolve_field(record, FIELD_ALIASES["price"]))
        cost = parse_decimal(resolve_field(record, FIELD_ALIASES["cost"]))
        compare_price = parse_decimal(resolve_field(record, FIELD_ALIASES["compare_at_price"]))
        qty = parse_int(resolve_field(record, FIELD_ALIASES["inventory"]))
        barcode_raw = normalise_barcode(resolve_field(record, FIELD_ALIASES["barcode"]))
        barcode = barcode_raw if barcode_raw != "" else ""

        status_raw = resolve_field(record, FIELD_ALIASES["status"])
        status_normalised = normalise_status(status_raw)
        if status_normalised:
            existing_status = product_status_targets.get(variant.product_id)
            if existing_status and existing_status != status_normalised:
                product_conflicts.append(f"{variant.product_id}: {existing_status} vs {status_normalised}")
            else:
                product_status_targets[variant.product_id] = status_normalised

        try:
            if args.dry_run:
                print(
                    json.dumps(
                        {
                            "sku": sku,
                            "variant_id": variant.variant_id,
                            "product_id": variant.product_id,
                            "price": price,
                            "cost": cost,
                            "compareAtPrice": compare_price,
                            "inventoryQty": qty,
                            "barcode": barcode,
                        },
                        indent=2,
                    )
                )
                updated += 1
                continue

            variant_payload: Dict[str, object] = {"id": variant.variant_id}
            if price is not None:
                variant_payload["price"] = price
            if compare_price is not None:
                variant_payload["compareAtPrice"] = compare_price
            if barcode is not None:
                variant_payload["barcode"] = barcode
            if cost is not None:
                variant_payload["inventoryItem"] = {"cost": cost}

            made_change = False
            if len(variant_payload) > 1:
                client.product_variants_bulk_update(variant.product_id, [variant_payload])
                made_change = True
            if qty is not None:
                client.inventory_set_quantity(variant.inventory_item_id, location_gid, qty)
                made_change = True
            if made_change:
                updated += 1
        except Exception as exc:  # noqa: BLE001
            failures.append((sku, str(exc)))

    product_status_updated = 0
    for product_id, status in product_status_targets.items():
        try:
            if args.dry_run:
                print(json.dumps({"product_id": product_id, "status": status, "action": "productUpdate"}, indent=2))
                product_status_updated += 1
                continue
            client.product_update(product_id, status=status)
            product_status_updated += 1
        except Exception as exc:  # noqa: BLE001
            product_failures.append(f"{product_id}: {exc}")

    print(f"Processed variant rows: {processed}")
    print(f"Updated successfully: {updated}")
    if missing:
        print(f"Missing variants (SKU not found): {len(missing)}", file=sys.stderr)
        print(", ".join(missing[:20]), file=sys.stderr)
    if failures:
        print(f"Failures: {len(failures)}", file=sys.stderr)
        for sku, message in failures[:10]:
            print(f"  {sku}: {message}", file=sys.stderr)
    if product_conflicts:
        print(
            f"Product status conflicts detected (skipped): {len(product_conflicts)}",
            file=sys.stderr,
        )
        for conflict in product_conflicts[:5]:
            print(f"  {conflict}", file=sys.stderr)
    print(f"Product statuses updated: {product_status_updated}")
    if product_failures:
        print(f"Product update failures: {len(product_failures)}", file=sys.stderr)
        for entry in product_failures[:10]:
            print(f"  {entry}", file=sys.stderr)


if __name__ == "__main__":
    main()
