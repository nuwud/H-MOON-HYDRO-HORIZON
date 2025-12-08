#!/usr/bin/env python3
"""Repair Shopify variant mismatches for price, barcode, cost, and inventory.

Reads a deduped reference CSV and a fresh Shopify export, finds per-SKU
mismatches, and uses the Admin GraphQL API to push corrections. Supports a
--dry-run mode to preview work and an optional --set-qty flag to update
inventory quantities when the CSV supplies them.
"""

from __future__ import annotations

import argparse
import os
import re
import time
from collections import defaultdict
from typing import Dict, Iterable, Iterator, List, Optional

import pandas as pd
import requests

API_VERSION = "2024-07"
API_TIMEOUT = 60
MAX_ATTEMPTS = 5
RETRY_STATUS = {429, 502, 503, 504}
VARIANT_LOOKUP = """
query variantBySku($q:String!) {
  productVariants(first: 1, query: $q) {
    edges {
      node {
        id
        sku
        barcode
        price
        product { id }
        inventoryItem { id unitCost { amount currencyCode } }
      }
    }
  }
}
"""
BULK_UPDATE = """
mutation bulkVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: true) {
    productVariants { id price barcode }
    userErrors { field message code }
  }
}
"""
INV_COST = """
mutation invUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id unitCost { amount currencyCode } }
        userErrors { field message }
    }
}
"""
INV_SET = """
mutation setQty($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
        userErrors { field message }
    }
}
"""


class ShopifyGraphQL:
    def __init__(self, domain: str, token: str) -> None:
        endpoint = f"https://{domain}/admin/api/{API_VERSION}/graphql.json"
        self.endpoint = endpoint
        self.session = requests.Session()
        self.session.headers.update(
            {
                "X-Shopify-Access-Token": token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def execute(self, query: str, variables: Optional[Dict] = None) -> Dict:
        attempt = 0
        while True:
            attempt += 1
            try:
                response = self.session.post(
                    self.endpoint,
                    json={"query": query, "variables": variables or {}},
                    timeout=API_TIMEOUT,
                )
            except requests.RequestException as exc:  # noqa: PERF203
                if attempt >= MAX_ATTEMPTS:
                    raise
                time.sleep(min(5, 2**attempt))
                continue

            if response.status_code in RETRY_STATUS and attempt < MAX_ATTEMPTS:
                retry_after = int(response.headers.get("Retry-After", "1") or "1")
                time.sleep(max(1, retry_after))
                continue

            response.raise_for_status()
            payload = response.json()
            if payload.get("errors"):
                raise RuntimeError(payload["errors"])
            return payload.get("data", {})


def detect_column(columns: Iterable[str], target: str) -> Optional[str]:
    lookup = {c.lower().strip(): c for c in columns}
    options = {
        "sku": ["variant sku", "sku", "variant_sku", "variant sku id", "variantid (sku)"],
        "price": ["variant price", "price", "variant_price"],
        "barcode": ["variant barcode", "barcode", "variant_barcode", "upc", "ean"],
        "cost": ["cost per item", "unit cost", "cost", "variant cost", "unit_cost"],
        "qty": [
            "variant inventory qty",
            "inventory quantity",
            "available",
            "inventoryquantity",
            "available quantity",
        ],
    }[target]
    for option in options:
        if option in lookup:
            return lookup[option]
    token = "sku" if target == "sku" else target
    for key, original in lookup.items():
        if re.search(rf"\b{re.escape(token)}\b", key):
            return original
    return None


def build_mismatch_frame(dedup: pd.DataFrame, prod: pd.DataFrame) -> tuple[pd.DataFrame, Dict[str, Optional[str]]]:
    map_d = {k: detect_column(dedup.columns, k) for k in ("sku", "price", "barcode", "cost", "qty")}
    map_s = {k: detect_column(prod.columns, k) for k in ("sku", "price", "barcode", "cost")}

    missing = [k for k in ("sku", "price", "barcode") if not map_d[k] or not map_s[k]]
    if missing:
        raise AssertionError(f"Unable to resolve required columns: {missing}")

    prod_unique = prod.drop_duplicates(subset=[map_s["sku"]], keep="first").copy()
    join_cols = [map_s["sku"], map_s["price"], map_s["barcode"]]
    if map_s["cost"]:
        join_cols.append(map_s["cost"])
    merged = dedup.merge(
        prod_unique[join_cols].rename(
            columns={
                map_s["sku"]: "SKU",
                map_s["price"]: "ShopPrice",
                map_s["barcode"]: "ShopBarcode",
                **({map_s["cost"]: "ShopCost"} if map_s["cost"] else {}),
            }
        ),
        left_on=map_d["sku"],
        right_on="SKU",
        how="left",
    )

    merged["CSVPrice"] = dedup[map_d["price"]].fillna("").astype(str)
    merged["CSVBarcode"] = dedup[map_d["barcode"]].fillna("").astype(str)
    if map_d["cost"]:
        merged["CSVCost"] = dedup[map_d["cost"]].fillna("").astype(str)
    else:
        merged["CSVCost"] = ""
    if map_d["qty"]:
        merged["CSVQty"] = dedup[map_d["qty"]].fillna("").astype(str)
    else:
        merged["CSVQty"] = ""
    if "ShopCost" not in merged:
        merged["ShopCost"] = ""

    def differs(a: pd.Series, b: pd.Series) -> pd.Series:
        return a.astype(str).str.strip().fillna("") != b.astype(str).str.strip().fillna("")

    price_diff = differs(merged["CSVPrice"], merged["ShopPrice"])
    barcode_diff = differs(merged["CSVBarcode"], merged["ShopBarcode"])
    cost_diff = differs(merged["CSVCost"], merged["ShopCost"]) if map_d["cost"] and map_s["cost"] else False

    mismatches = merged.loc[price_diff | barcode_diff | cost_diff].copy()
    mappings = {
        "dedup": map_d,
        "prod": map_s,
    }
    return mismatches, mappings


def chunked(items: Iterable, size: int) -> Iterator[List]:
    bucket: List = []
    for item in items:
        bucket.append(item)
        if len(bucket) == size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket


def infer_currency(node: Dict) -> str:
    cost_info = node.get("inventoryItem", {}).get("unitCost")
    if cost_info and cost_info.get("currencyCode"):
        return cost_info["currencyCode"]
    return "USD"


def coerce_quantity(value: str) -> Optional[int]:
    text = value.strip()
    if not text:
        return None
    if re.match(r"^-?\d+(\.\d+)?$", text):
        return int(float(text))
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair Shopify mismatches using GraphQL")
    parser.add_argument("--dedup", default="CSVs/shopify_inventory_from_pos__DEDUP_20251103_211920.csv")
    parser.add_argument("--prod", default="CSVs/shopify_export_after_prod.csv")
    parser.add_argument("--set-qty", action="store_true", help="Update inventory quantities when present")
    parser.add_argument("--dry-run", action="store_true", help="Plan updates without applying changes")
    args = parser.parse_args()

    dedup_csv = pd.read_csv(args.dedup, dtype=str, low_memory=False)
    prod_csv = pd.read_csv(args.prod, dtype=str, low_memory=False)
    mismatches, mapping = build_mismatch_frame(dedup_csv, prod_csv)
    print(f"Mismatched rows detected: {len(mismatches)}")
    if mismatches.empty:
        return

    if args.dry_run:
        preview = mismatches[[mapping["dedup"]["sku"], "CSVPrice", "CSVBarcode", "CSVCost"]].copy()
        preview = preview.rename(columns={mapping["dedup"]["sku"]: "SKU"})
        print("Dry run summary (first 10 rows):")
        print(preview.head(10).to_string(index=False))
        return

    domain = os.environ.get("SHOPIFY_DOMAIN", "").strip()
    token = os.environ.get("SHOPIFY_ACCESS_TOKEN", "").strip()
    if not domain or not token:
        raise EnvironmentError("SHOPIFY_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set")

    location_id = os.environ.get("SHOPIFY_LOCATION_ID", "").strip()
    location_gid = f"gid://shopify/Location/{location_id}" if location_id and not location_id.startswith("gid://") else location_id

    client = ShopifyGraphQL(domain, token)
    updates: List[Dict] = []
    cost_updates: List[Dict] = []
    qty_updates: List[Dict] = []

    for _, row in mismatches.iterrows():
        raw_sku = row[mapping["dedup"]["sku"]]
        if pd.isna(raw_sku):
            continue
        sku = str(raw_sku).strip()
        if not sku:
            continue
        search = client.execute(VARIANT_LOOKUP, {"q": f"sku:{sku}"})
        edges = search.get("productVariants", {}).get("edges", [])
        if not edges:
            print(f"SKU not found in Shopify: {sku}")
            continue
        node = edges[0]["node"]
        product_id = node["product"]["id"]
        variant_id = node["id"]
        inventory_item_id = node["inventoryItem"]["id"]

        entry = {
            "sku": sku,
            "productId": product_id,
            "variant": {
                "id": variant_id,
                "price": row["CSVPrice"],
                "barcode": row["CSVBarcode"],
            },
            "inventoryItemId": inventory_item_id,
            "currency": infer_currency(node),
            "cost": row["CSVCost"],
            "qty": row["CSVQty"],
        }
        updates.append(entry)

    if not updates:
        print("No Shopify records resolved for mismatched SKUs.")
        return

    product_batches: Dict[str, List[Dict]] = defaultdict(list)
    for item in updates:
        variant_payload = {"id": item["variant"]["id"]}
        if item["variant"]["price"]:
            variant_payload["price"] = item["variant"]["price"]
        variant_payload["barcode"] = item["variant"]["barcode"]
        product_batches[item["productId"]].append(variant_payload)
        if item["cost"]:
            cost_updates.append(item)
        qty_value = coerce_quantity(item["qty"])
        if args.set_qty and qty_value is not None and location_gid.endswith(tuple("0123456789")):
            qty_updates.append({
                "inventoryItemId": item["inventoryItemId"],
                "locationId": location_gid,
                "quantity": qty_value,
            })

    print("Plan summary:")
    print(f"- productVariantsBulkUpdate groups: {len(product_batches)}")
    print(f"- inventoryItemUpdate entries:      {len(cost_updates)}")
    print(f"- inventorySetQuantities entries:   {len(qty_updates)}")

    if args.dry_run:
        print("Dry run complete; no mutations sent.")
        return

    for product_id, variants in product_batches.items():
        for chunk in chunked(variants, 50):
            result = client.execute(BULK_UPDATE, {"productId": product_id, "variants": chunk})
            errors = result.get("productVariantsBulkUpdate", {}).get("userErrors", [])
            if errors:
                print("Bulk update errors:", errors)

    for item in cost_updates:
        payload = {
            "id": item["inventoryItemId"],
            "input": {
                "cost": item["cost"],
            },
        }
        result = client.execute(INV_COST, payload)
        errors = result.get("inventoryItemUpdate", {}).get("userErrors", [])
        if errors:
            print("Cost update errors for", item["sku"], errors)

    if qty_updates:
        template = {
            "name": "available",
            "reason": "correction",
            "ignoreCompareQuantity": True,
        }
        for chunk in chunked(qty_updates, 200):
            result = client.execute(
                INV_SET,
                {
                    "input": {**template, "quantities": chunk},
                },
            )
            errors = result.get("inventorySetQuantities", {}).get("userErrors", [])
            if errors:
                print("Quantity update errors:", errors)

    print("Repair run finished. Re-export from Shopify and rerun the verifier.")


if __name__ == "__main__":
    main()
