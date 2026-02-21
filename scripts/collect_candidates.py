#!/usr/bin/env python3
"""
collect_candidates.py — For every WooCommerce product, gather ALL candidate
matches from retailer catalogs (images, descriptions, prices, PDFs, URLs).

Instead of picking the single best match, we collect the top N matches per
product so the user can browse and choose the right one in the curation tool.

Output: outputs/product_candidates.json
  { "<product_id>": { "title": "...", "candidates": [ ... ] } }

Each candidate has:
  - retailer, title, handle, vendor, score
  - images: [url, ...]
  - description (HTML), description_text (plain)
  - price, weight
  - product_url
  - tags
"""
import json, re, os, sys, time, html
from pathlib import Path
from urllib.parse import quote

BASE = Path(__file__).resolve().parent.parent

STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'in', 'of', 'for', 'with', 'by',
              'to', 'is', 'at', 'on', 'it', 'its', 'ft', 'w'}

# Retailer store URLs for building product links
RETAILER_URLS = {
    'hydrobuilder': 'https://hydrobuilder.com',
    'growershouse': 'https://growershouse.com',
    'zenhydro': 'https://zenhydro.com',
    'growace': 'https://growace.com',
    'bluelab': 'https://www.bluelab.com',
    'humboldtnutrients': 'https://humboldtnutrients.com',
    'futureharvest': 'https://futureharvest.com',
}

# Shopify stores we can search live for extra results
LIVE_SEARCH_STORES = [
    ('hydrobuilder', 'https://hydrobuilder.com'),
    ('zenhydro', 'https://zenhydro.com'),
    ('growace', 'https://growace.com'),
    ('growershouse', 'https://growershouse.com'),
]


def tokenize(text):
    """Extract meaningful tokens from text."""
    tokens = set(re.findall(r'[a-z0-9]+', text.lower()))
    return tokens - STOP_WORDS


def strip_html(html_text):
    """Strip HTML tags and decode entities."""
    if not html_text:
        return ''
    text = re.sub(r'<[^>]+>', ' ', html_text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def build_inverted_index(catalog_items):
    """Build token -> [catalog_idx] inverted index."""
    index = {}
    for i, ci in enumerate(catalog_items):
        tokens = tokenize(ci.get('title', ''))
        for tok in tokens:
            if len(tok) >= 2:
                index.setdefault(tok, []).append(i)
    return index


def find_top_matches(title, catalog_items, inv_index, max_results=20, min_score=25):
    """Find top N catalog matches using inverted index. Lower threshold than
    the enrichment script — we want MORE candidates, not fewer."""
    query_tokens = tokenize(title)
    if not query_tokens:
        return []

    # Get candidate indices from inverted index
    candidate_counts = {}
    for tok in query_tokens:
        if tok in inv_index and len(tok) >= 2:
            for idx in inv_index[tok]:
                candidate_counts[idx] = candidate_counts.get(idx, 0) + 1

    # Candidates with at least 1 meaningful token overlap
    min_overlap = max(1, len(query_tokens) // 4)
    candidates = [(idx, cnt) for idx, cnt in candidate_counts.items() if cnt >= min_overlap]

    # Score all candidates
    scored = []
    for idx, cnt in candidates:
        ci_tokens = tokenize(catalog_items[idx].get('title', ''))
        if not ci_tokens:
            continue
        intersection = query_tokens & ci_tokens
        # Score based on overlap relative to query tokens
        score = len(intersection) / max(len(query_tokens), 1) * 100
        if score >= min_score:
            scored.append((score, idx))

    # Sort by score descending, take top N
    scored.sort(key=lambda x: -x[0])
    return scored[:max_results]


def extract_candidate(catalog_item, retailer, score):
    """Extract structured candidate data from a catalog item."""
    item = catalog_item

    # Extract all image URLs
    images = []
    for img in item.get('images', []):
        src = img.get('src', img) if isinstance(img, dict) else str(img)
        if src:
            # Remove Shopify size suffix to get full-res URL
            full = re.sub(r'_\d+x\d*\.', '.', src)
            images.append(full)

    # Extract price from variants
    price = None
    prices_all = []
    for v in item.get('variants', []):
        p = v.get('price')
        if p and p != '0.00':
            prices_all.append(float(p))
    if prices_all:
        price = min(prices_all)

    # Weight
    weight = None
    weight_unit = 'lb'
    for v in item.get('variants', []):
        w = v.get('weight')
        if w and float(w) > 0:
            weight = float(w)
            weight_unit = v.get('weight_unit', 'lb')
            break

    # Description
    body_html = item.get('body_html', '') or ''
    desc_text = strip_html(body_html)

    # Build product URL
    handle = item.get('handle', '')
    base_url = RETAILER_URLS.get(retailer, '')
    product_url = f"{base_url}/products/{handle}" if base_url and handle else ''

    return {
        'retailer': retailer,
        'title': item.get('title', ''),
        'handle': handle,
        'vendor': item.get('vendor', ''),
        'product_type': item.get('product_type', ''),
        'score': round(score, 1),
        'images': images,
        'image_count': len(images),
        'description_html': body_html[:2000] if body_html else '',
        'description_text': desc_text[:500] if desc_text else '',
        'price': price,
        'price_range': f"${min(prices_all):.2f} - ${max(prices_all):.2f}" if len(prices_all) > 1 else None,
        'weight': weight,
        'weight_unit': weight_unit,
        'tags': item.get('tags', ''),
        'product_url': product_url,
        'variant_count': len(item.get('variants', [])),
    }


def main():
    max_per_product = int(sys.argv[1]) if len(sys.argv) > 1 else 20

    # Load manifest
    manifest_path = BASE / 'outputs' / 'fresh_manifest.json'
    print(f"Loading manifest from {manifest_path}")
    with open(manifest_path, 'r', encoding='utf-8') as f:
        products = json.load(f)
    print(f"  Products: {len(products)}")

    # Load all retailer catalogs
    catalog_dir = BASE / 'outputs' / 'scraped' / 'catalogs'
    all_items = []
    retailer_map = {}  # idx -> retailer name
    catalog_sizes = {}

    for fp in sorted(catalog_dir.glob('*.json')):
        retailer = fp.stem.replace('_products', '')
        with open(fp, 'r', encoding='utf-8') as f:
            items = json.load(f)
        start_idx = len(all_items)
        all_items.extend(items)
        for i in range(start_idx, len(all_items)):
            retailer_map[i] = retailer
        catalog_sizes[retailer] = len(items)
        print(f"  Catalog {retailer}: {len(items)} products")

    print(f"  Total catalog: {len(all_items)} products")
    print(f"  Max candidates per product: {max_per_product}")

    # Build inverted index
    print("\nBuilding inverted index...")
    inv_index = build_inverted_index(all_items)
    print(f"  Index: {len(inv_index)} unique tokens")

    # Collect candidates for each product
    print(f"\nCollecting candidates for {len(products)} products...")
    results = {}
    products_with_candidates = 0
    total_candidates = 0
    total_images = 0

    for i, p in enumerate(products):
        pid = str(p['id'])
        title = p['title']

        # Skip placeholder products
        if title.strip().lower() in ('product', ''):
            continue

        # Find top matches
        matches = find_top_matches(title, all_items, inv_index,
                                   max_results=max_per_product, min_score=25)

        if not matches:
            continue

        candidates = []
        seen_titles = set()  # deduplicate same product across collections

        for score, idx in matches:
            item = all_items[idx]
            retailer = retailer_map[idx]

            # Dedup by title (same product listed under multiple names)
            dup_key = item.get('title', '').lower().strip()
            if dup_key in seen_titles:
                continue
            seen_titles.add(dup_key)

            candidate = extract_candidate(item, retailer, score)
            if candidate['images'] or candidate['description_text'] or candidate['price']:
                candidates.append(candidate)

        if candidates:
            results[pid] = {
                'title': title,
                'sku': p.get('sku', ''),
                'brand': p.get('brand', ''),
                'current_thumb': p.get('thumb', ''),
                'current_price': p.get('price', ''),
                'has_desc': p.get('desc') == 'has',
                'has_short': p.get('short_desc') == 'has',
                'candidate_count': len(candidates),
                'candidates': candidates,
            }
            products_with_candidates += 1
            total_candidates += len(candidates)
            total_images += sum(c['image_count'] for c in candidates)

        if (i + 1) % 200 == 0:
            print(f"  Processed {i+1}/{len(products)} — {products_with_candidates} with candidates")

    # Summary
    print(f"\n{'='*50}")
    print(f"  CANDIDATE COLLECTION RESULTS")
    print(f"{'='*50}")
    print(f"  Products scanned:        {len(products)}")
    print(f"  Products with candidates: {products_with_candidates}")
    print(f"  Total candidates:         {total_candidates}")
    print(f"  Total images found:       {total_images}")
    print(f"  Avg candidates/product:   {total_candidates/max(products_with_candidates,1):.1f}")
    print(f"  Avg images/product:       {total_images/max(products_with_candidates,1):.1f}")

    # Top-level stats
    has_images = sum(1 for r in results.values() if any(c['images'] for c in r['candidates']))
    has_descs = sum(1 for r in results.values() if any(c['description_text'] for c in r['candidates']))
    has_prices = sum(1 for r in results.values() if any(c['price'] for c in r['candidates']))
    print(f"\n  Products with image candidates:  {has_images}")
    print(f"  Products with desc candidates:   {has_descs}")
    print(f"  Products with price candidates:  {has_prices}")

    # Save
    out_path = BASE / 'outputs' / 'product_candidates.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    file_size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\n  Saved to {out_path}")
    print(f"  File size: {file_size_mb:.1f} MB")
    print(f"{'='*50}")


if __name__ == '__main__':
    main()
