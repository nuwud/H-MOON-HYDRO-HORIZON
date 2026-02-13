#!/usr/bin/env python3
"""
Delete all WooCommerce products via REST API.
Run: python delete_all_products.py

Before running:
1. Go to WooCommerce > Settings > Advanced > REST API
2. Add key with Read/Write permissions
3. Update CONSUMER_KEY and CONSUMER_SECRET below
"""

import requests
from requests.auth import HTTPBasicAuth
import time

# ============ UPDATE THESE ============
SITE_URL = "https://hmoonhydro.com"
CONSUMER_KEY = "ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  # Your API key
CONSUMER_SECRET = "cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  # Your API secret
# ======================================

API_URL = f"{SITE_URL}/wp-json/wc/v3"
AUTH = HTTPBasicAuth(CONSUMER_KEY, CONSUMER_SECRET)

def get_products(per_page=100):
    """Get all product IDs"""
    all_ids = []
    page = 1
    while True:
        resp = requests.get(
            f"{API_URL}/products",
            auth=AUTH,
            params={"per_page": per_page, "page": page}
        )
        if resp.status_code != 200:
            print(f"Error: {resp.status_code} - {resp.text}")
            break
        products = resp.json()
        if not products:
            break
        all_ids.extend([p["id"] for p in products])
        print(f"Page {page}: Found {len(products)} products (total: {len(all_ids)})")
        page += 1
    return all_ids

def delete_product(product_id):
    """Delete a single product permanently"""
    resp = requests.delete(
        f"{API_URL}/products/{product_id}",
        auth=AUTH,
        params={"force": True}  # Permanent delete, skip trash
    )
    return resp.status_code == 200

def batch_delete(ids, batch_size=100):
    """Batch delete products (faster)"""
    for i in range(0, len(ids), batch_size):
        batch = ids[i:i+batch_size]
        resp = requests.post(
            f"{API_URL}/products/batch",
            auth=AUTH,
            json={"delete": batch}
        )
        if resp.status_code == 200:
            print(f"Deleted batch {i//batch_size + 1}: {len(batch)} products")
        else:
            print(f"Error in batch: {resp.status_code}")
        time.sleep(0.5)  # Rate limit

def main():
    print("🔍 Fetching all products...")
    product_ids = get_products()
    print(f"\n📦 Found {len(product_ids)} products to delete")
    
    if not product_ids:
        print("No products to delete!")
        return
    
    confirm = input(f"\n⚠️  Delete ALL {len(product_ids)} products? (yes/no): ")
    if confirm.lower() != "yes":
        print("Cancelled.")
        return
    
    print("\n🗑️  Deleting products...")
    batch_delete(product_ids)
    
    # Verify
    remaining = get_products()
    print(f"\n✅ Done! Remaining products: {len(remaining)}")

if __name__ == "__main__":
    main()
