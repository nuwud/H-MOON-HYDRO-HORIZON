#!/usr/bin/env python3
"""
Phase 3: Targeted web lookups via Shopify JSON API search
For remaining 55 products that still need images/descriptions.
"""
import json, re, time, urllib.request, urllib.parse
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

SHOPIFY_STORES = [
    ('hydrobuilder', 'https://hydrobuilder.com'),
    ('growershouse', 'https://growershouse.com'),
    ('zenhydro', 'https://zenhydro.com'),
    ('growace', 'https://growace.com'),
]

def search_shopify_store(base_url, query, limit=5):
    """Search a Shopify store via /search/suggest.json or /products.json with title filter."""
    # Try /search/suggest.json first 
    encoded = urllib.parse.quote(query)
    url = f"{base_url}/search/suggest.json?q={encoded}&resources[type]=product&resources[limit]={limit}"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            products = data.get('resources', {}).get('results', {}).get('products', [])
            return products
    except Exception:
        pass
    return []

def fetch_product_json(base_url, handle):
    """Fetch full product details via /products/{handle}.json."""
    url = f"{base_url}/products/{handle}.json"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('product', {})
    except Exception:
        return None


def clean_title_for_search(title):
    """Clean a product title for better search results."""
    # Remove size/quantity suffixes
    clean = re.sub(r'\b\d+\s*(oz|ml|lt|liter|litre|gal|gallon|kg|lb|qts?|pint)\b', '', title, flags=re.I)
    # Remove special chars
    clean = re.sub(r'[^\w\s]', ' ', clean)
    # Remove multiple spaces
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def main():
    # Load products needing web lookup
    with open(BASE / 'outputs' / 'web_lookup_needed.json', 'r', encoding='utf-8') as f:
        products = json.load(f)

    # Load existing enrichment
    with open(BASE / 'outputs' / 'deep_enrichment.json', 'r', encoding='utf-8') as f:
        enrichment = json.load(f)

    print(f"Products needing web lookup: {len(products)}")
    
    # Filter out placeholder "Product" entries
    real_products = [p for p in products if p['title'].strip().lower() != 'product']
    placeholder_products = [p for p in products if p['title'].strip().lower() == 'product']
    print(f"Real products to search: {len(real_products)}")
    print(f"Placeholder 'Product' entries (skip): {len(placeholder_products)}")

    found = 0
    for i, p in enumerate(real_products):
        pid = str(p['id'])
        title = p['title']
        brand = p.get('brand', '')
        search_query = clean_title_for_search(title)
        if brand:
            search_query = f"{brand} {search_query}"

        print(f"\n[{i+1}/{len(real_products)}] Searching: {title}")
        print(f"  Query: {search_query}")

        best_result = None
        best_store = None

        for store_name, store_url in SHOPIFY_STORES:
            results = search_shopify_store(store_url, search_query)
            if results:
                # Pick first result
                r = results[0]
                print(f"  [{store_name}] Found: {r.get('title', 'N/A')}")
                
                # Check if it has an image
                image = r.get('image', r.get('featured_image', {}) if isinstance(r.get('featured_image'), dict) else '')
                if isinstance(image, dict):
                    image = image.get('url', image.get('src', ''))
                
                if image and not best_result:
                    best_result = r
                    best_store = store_name
                    # Try to get full product details
                    handle = r.get('handle', '')
                    if handle:
                        full = fetch_product_json(store_url, handle)
                        if full:
                            best_result = full
                            print(f"  -> Got full product details from {store_name}")
                    break  # Got a good match, stop searching

            time.sleep(0.3)  # Be respectful

        if best_result:
            found += 1
            data = enrichment.setdefault(pid, {})

            # Extract image
            if p['needs'].get('thumb'):
                images = best_result.get('images', [])
                if images:
                    src = images[0].get('src', '') if isinstance(images[0], dict) else str(images[0])
                    if src:
                        data['image'] = src
                        print(f"  -> Image: {src[:80]}...")
                elif best_result.get('image'):
                    img = best_result['image']
                    src = img.get('src', img) if isinstance(img, dict) else str(img)
                    if src:
                        data['image'] = src

                # Gallery
                if images and len(images) > 1:
                    gallery = []
                    for img in images[:5]:
                        src = img.get('src', '') if isinstance(img, dict) else str(img)
                        if src:
                            gallery.append(src)
                    if gallery:
                        data['gallery'] = gallery

            # Extract description
            if p['needs'].get('desc'):
                desc = best_result.get('body_html', '')
                if desc and len(desc) > 30:
                    data['description'] = desc
                    # Also make short description
                    clean = re.sub(r'<[^>]+>', '', desc).strip()
                    if len(clean) > 20:
                        short = clean[:250]
                        if len(clean) > 250:
                            short = short.rsplit(' ', 1)[0] + '...'
                        data['short_description'] = short
                    print(f"  -> Description: {len(desc)} chars")

            # Extract price
            variants = best_result.get('variants', [])
            if variants and not enrichment.get(pid, {}).get('price'):
                for v in variants:
                    price = v.get('price', '')
                    if price and price != '0.00':
                        data['price'] = str(price)
                        print(f"  -> Price: ${price}")
                        break

            # Extract vendor/brand
            vendor = best_result.get('vendor', '')
            if vendor and not data.get('brand') and vendor.lower() not in ('', 'default', 'unknown'):
                data['brand'] = vendor

            data['_web_lookup'] = True
            data['_web_store'] = best_store
        else:
            print(f"  -> No results found")

        time.sleep(0.5)  # Rate limit

    # Save updated enrichment
    with open(BASE / 'outputs' / 'deep_enrichment.json', 'w', encoding='utf-8') as f:
        json.dump(enrichment, f, indent=2)

    # Summary
    has_image = sum(1 for e in enrichment.values() if 'image' in e)
    has_price = sum(1 for e in enrichment.values() if 'price' in e)
    has_desc = sum(1 for e in enrichment.values() if 'description' in e)
    has_short = sum(1 for e in enrichment.values() if 'short_description' in e)
    has_brand = sum(1 for e in enrichment.values() if 'brand' in e)
    has_gallery = sum(1 for e in enrichment.values() if 'gallery' in e)

    print(f"\n=== UPDATED ENRICHMENT SUMMARY ===")
    print(f"Total products to update: {len(enrichment)}")
    print(f"  Images: {has_image}")
    print(f"  Gallery: {has_gallery}")
    print(f"  Prices: {has_price}")
    print(f"  Descriptions: {has_desc}")
    print(f"  Short descriptions: {has_short}")
    print(f"  Brands: {has_brand}")
    print(f"Web lookups found: {found}/{len(real_products)}")


if __name__ == '__main__':
    main()
