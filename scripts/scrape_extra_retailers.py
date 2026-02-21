#!/usr/bin/env python3
"""
Phase 3: Scrape additional retailers + targeted web lookups
Fetches product data from more hydro retailer sites.
"""
import json, re, os, sys, time, urllib.request, urllib.parse
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

# Additional Shopify-based hydro retailers to try
EXTRA_RETAILERS = {
    'htgsupply': 'https://htgsupply.com',
    'growgeneration': 'https://www.growgeneration.com',  
    'greengro': 'https://greengrotech.com',
    'zenhydro': 'https://zenhydro.com',
    'growace': 'https://growace.com',
    'growledwholesale': 'https://growledwholesale.com',
    'homegrowndepot': 'https://www.homegrowndepot.com',
    'growersnetwork': 'https://store.growersnetwork.org',
    'getgrowing': 'https://www.getgrowing.com',
}

def fetch_shopify_catalog(base_url, name, max_pages=20):
    """Fetch products from a Shopify store via /products.json API."""
    all_products = []
    page = 1
    while page <= max_pages:
        url = f"{base_url}/products.json?limit=250&page={page}"
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                products = data.get('products', [])
                if not products:
                    break
                all_products.extend(products)
                print(f"  {name} page {page}: {len(products)} products (total: {len(all_products)})")
                page += 1
                time.sleep(0.5)
        except Exception as e:
            print(f"  {name} page {page}: Error - {e}")
            break
    return all_products


def search_product_urls(title, brand=''):
    """Build search URLs for a product across multiple retailers."""
    clean = re.sub(r'[^\w\s]', '', title).strip()
    query = f"{brand} {clean}".strip() if brand else clean
    encoded = urllib.parse.quote(query)
    return {
        'hydrobuilder': f"https://hydrobuilder.com/search?q={encoded}",
        'growershouse': f"https://growershouse.com/catalogsearch/result/?q={encoded}",
        'htgsupply': f"https://htgsupply.com/search?q={encoded}",
    }


def main():
    catalog_dir = BASE / 'outputs' / 'scraped' / 'catalogs'
    catalog_dir.mkdir(parents=True, exist_ok=True)

    # Try to fetch from additional Shopify retailers  
    new_catalogs = {}
    for name, base_url in EXTRA_RETAILERS.items():
        cache_path = catalog_dir / f"{name}_products.json"
        if cache_path.exists():
            with open(cache_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            print(f"Already have {name}: {len(existing)} products (cached)")
            new_catalogs[name] = existing
            continue

        print(f"\nFetching {name} ({base_url})...")
        products = fetch_shopify_catalog(base_url, name)
        if products:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(products, f)
            print(f"  Saved {len(products)} products to {cache_path}")
            new_catalogs[name] = products
        else:
            print(f"  No products found (may not be Shopify or blocked)")

    # Summary
    total_new = sum(len(v) for v in new_catalogs.values())
    print(f"\nAdditional retailer products fetched: {total_new}")
    for name, prods in new_catalogs.items():
        print(f"  {name}: {len(prods)}")


if __name__ == '__main__':
    main()
