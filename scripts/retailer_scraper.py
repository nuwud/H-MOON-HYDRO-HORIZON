#!/usr/bin/env python3
"""
retailer_scraper.py — Scrape hydro retailer Shopify stores for product enrichment data

Major hydro retailers (HydroBuilder, GrowersHouse) carry ALL brands with:
- Hi-res product images
- Detailed descriptions with specs
- Weights and dimensions 
- Available sizes/variants
- Prices for reference

This is far more efficient than scraping 20+ individual manufacturer sites.

Usage:
    python scripts/retailer_scraper.py --fetch          # Download all product catalogs
    python scripts/retailer_scraper.py --match          # Match our products to retailer products
    python scripts/retailer_scraper.py --all            # Fetch + Match in one shot
    python scripts/retailer_scraper.py --stats          # Show match statistics
"""

import json
import os
import re
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ============================================================
# Configuration
# ============================================================

WORKSPACE = Path(__file__).parent.parent
MANIFEST_PATH = WORKSPACE / "outputs" / "enrichment_manifest.json"
OUTPUT_DIR = WORKSPACE / "outputs" / "scraped"
CATALOG_DIR = OUTPUT_DIR / "catalogs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}
RATE_LIMIT = 1.0  # seconds between pages

# Shopify retailers that carry hydro products
RETAILERS = {
    "hydrobuilder": {
        "name": "HydroBuilder",
        "url": "https://hydrobuilder.com",
        "priority": 1,  # Preferred source (usually best data quality)
    },
    "growershouse": {
        "name": "GrowersHouse",
        "url": "https://www.growershouse.com",
        "priority": 2,
    },
    "humboldtnutrients": {
        "name": "Humboldt Nutrients (Manufacturer)",
        "url": "https://humboldtnutrients.com",
        "priority": 1,  # Manufacturer = best source
    },
    "bluelab": {
        "name": "Bluelab (Manufacturer)",
        "url": "https://bluelab.com",
        "priority": 1,
    },
}

# Minimum match scores
MATCH_THRESHOLD = 0.60  # Min fuzzy match score to accept
HIGH_CONFIDENCE = 0.80  # Confident enough to auto-import


# ============================================================
# Shopify API Fetcher
# ============================================================

def fetch_shopify_catalog(retailer_key: str, retailer_info: dict) -> list:
    """Fetch ALL products from a Shopify store via paginated JSON API."""
    base_url = retailer_info["url"]
    name = retailer_info["name"]
    cache_file = CATALOG_DIR / f"{retailer_key}_products.json"
    
    # Check cache (less than 24h old)
    if cache_file.exists():
        mtime = os.path.getmtime(cache_file)
        age_hours = (time.time() - mtime) / 3600
        if age_hours < 24:
            with open(cache_file, encoding='utf-8') as f:
                products = json.load(f)
            print(f"  {name}: Using cached catalog ({len(products)} products, {age_hours:.1f}h old)")
            return products
    
    print(f"  {name}: Fetching products from {base_url}...")
    all_products = []
    page = 1
    
    while True:
        url = f"{base_url}/products.json?limit=250&page={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code != 200:
                print(f"    Page {page}: HTTP {resp.status_code}")
                break
            
            data = resp.json()
            products = data.get('products', [])
            if not products:
                break
            
            all_products.extend(products)
            print(f"    Page {page}: +{len(products)} products (total: {len(all_products)})")
            
            page += 1
            time.sleep(RATE_LIMIT)
            
        except Exception as e:
            print(f"    Page {page} error: {e}")
            break
    
    # Cache the results
    CATALOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False)
    
    print(f"  {name}: {len(all_products)} products saved to {cache_file.name}")
    return all_products


def fetch_all_catalogs() -> dict:
    """Fetch catalogs from all retailers."""
    print("\n" + "=" * 60)
    print("  FETCHING RETAILER CATALOGS")
    print("=" * 60)
    
    catalogs = {}
    for key, info in RETAILERS.items():
        products = fetch_shopify_catalog(key, info)
        catalogs[key] = {
            'info': info,
            'products': products,
        }
    
    total = sum(len(c['products']) for c in catalogs.values())
    print(f"\n  Total products across all retailers: {total}")
    return catalogs


# ============================================================
# Product Matching
# ============================================================

def clean_title(title: str) -> str:
    """Clean and normalize a product title for matching."""
    # Remove common noise
    title = re.sub(r'\s*[-–]\s*H Moon Hydro.*$', '', title, flags=re.I)
    title = re.sub(r'\s*[-–]\s*hmoonhydro.*$', '', title, flags=re.I)
    # Remove size/volume in parens at end
    title = re.sub(r'\s*\(?\d+(\.\d+)?\s*(lt?|gal|ml|oz|qt|lb|kg|g|pack)\b[^)]*\)?\s*$', '', title, flags=re.I)
    # Normalize
    title = re.sub(r'\s+', ' ', title).strip()
    return title


def title_tokens(title: str) -> set:
    """Extract significant tokens from a title."""
    title = clean_title(title).lower()
    # Remove common filler words
    stopwords = {'the', 'a', 'an', 'for', 'and', 'or', 'with', 'by', 'in', 'of', 'to', '-', '&'}
    tokens = set(re.split(r'[\s/\-–]+', title)) - stopwords
    return {t for t in tokens if len(t) > 1}


def match_score(our_title: str, their_title: str, brand: str = '') -> float:
    """Calculate match score between two product titles."""
    # Normalize both
    a = clean_title(our_title).lower()
    b = clean_title(their_title).lower()
    
    # Exact match
    if a == b:
        return 1.0
    
    # SequenceMatcher ratio
    seq_score = SequenceMatcher(None, a, b).ratio()
    
    # Token overlap score (important for partial matches)
    tokens_a = title_tokens(our_title)
    tokens_b = title_tokens(their_title)
    if tokens_a and tokens_b:
        overlap = len(tokens_a & tokens_b)
        total = max(len(tokens_a), len(tokens_b))
        token_score = overlap / total if total > 0 else 0
    else:
        token_score = 0
    
    # Brand bonus: if brand appears in their title
    brand_bonus = 0
    if brand and brand.lower() in b:
        brand_bonus = 0.05
    
    # Combined score (weight sequence matching slightly higher)
    combined = (seq_score * 0.6 + token_score * 0.4) + brand_bonus
    return min(combined, 1.0)


def extract_enrichment_from_shopify(product: dict, retailer_url: str) -> dict:
    """Extract all enrichment data from a Shopify product object."""
    enrichment = {
        'source_url': f"{retailer_url}/products/{product['handle']}",
        'matched_title': product['title'],
    }
    
    # --- Images ---
    images = product.get('images', [])
    if images:
        enrichment['images'] = []
        for img in images:
            src = img.get('src', '')
            # Get highest resolution (remove Shopify size suffixes)
            hi_res = re.sub(r'_(\d+x\d*|\d*x\d+)\.', '.', src)
            enrichment['images'].append({
                'url': hi_res,
                'alt': img.get('alt', ''),
                'width': img.get('width'),
                'height': img.get('height'),
                'position': img.get('position'),
            })
    
    # --- Description ---
    body = product.get('body_html', '')
    if body and len(body) > 30:
        soup = BeautifulSoup(body, 'html.parser')
        
        # Extract clean text
        text = soup.get_text(' ', strip=True)
        enrichment['description_html'] = body
        enrichment['description_text'] = text
        
        # Look for specs in description
        specs = {}
        text_lower = text.lower()
        
        # NPK extraction
        npk_match = re.search(r'(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)', text)
        if npk_match:
            specs['npk'] = f"{npk_match.group(1)}-{npk_match.group(2)}-{npk_match.group(3)}"
        
        # Weight from text
        wt_match = re.search(r'(?:weight|wt|net\s*wt)[\s:]+(\d+\.?\d*)\s*(lb|lbs|oz|kg|g)', text_lower)
        if wt_match:
            specs['weight'] = f"{wt_match.group(1)} {wt_match.group(2)}"
        
        # UPC from text
        upc_match = re.search(r'(?:upc|barcode)[\s:#]*(\d{12,13})', text_lower)
        if upc_match:
            specs['upc'] = upc_match.group(1)
        
        # Look for feature bullet lists
        features = []
        for li in soup.find_all('li'):
            feat = li.get_text(strip=True)
            if feat and len(feat) > 10:
                features.append(feat)
        if features:
            enrichment['features'] = features[:15]  # Cap at 15
        
        # PDF links in description
        for a in soup.find_all('a', href=True):
            href = a['href'].lower()
            if '.pdf' in href:
                text_link = a.get_text(strip=True).lower()
                if any(kw in href or kw in text_link for kw in ['sds', 'safety', 'msds']):
                    specs['sds_url'] = a['href']
                elif any(kw in href or kw in text_link for kw in ['feed', 'chart', 'schedule']):
                    specs['feeding_chart_url'] = a['href']
                elif any(kw in href or kw in text_link for kw in ['spec', 'technical']):
                    specs['spec_sheet_url'] = a['href']
        
        if specs:
            enrichment['specs'] = specs
    
    # --- Variants (sizes, weights, prices, SKUs) ---
    variants = product.get('variants', [])
    if variants:
        enrichment['variants'] = []
        for v in variants:
            var = {}
            if v.get('title') and v['title'] != 'Default Title':
                var['title'] = v['title']
                # Extract size from variant title
                size_match = re.search(r'(\d+\.?\d*)\s*(lt?|gal|ml|oz|qt|lb|kg|g)', v['title'], re.I)
                if size_match:
                    var['size'] = f"{size_match.group(1)} {size_match.group(2)}"
            if v.get('sku'):
                var['sku'] = v['sku']
            if v.get('price') and float(v['price']) > 0:
                var['price'] = v['price']
            if v.get('compare_at_price'):
                var['compare_at_price'] = v['compare_at_price']
            if v.get('weight') and v['weight'] > 0:
                var['weight'] = v['weight']
                var['weight_unit'] = v.get('weight_unit', 'lb')
            if v.get('barcode'):
                var['barcode'] = v['barcode']
            if v.get('option1'):
                var['option1'] = v['option1']
            if v.get('option2'):
                var['option2'] = v['option2']
            enrichment['variants'].append(var)
        
        # Extract weight from first variant with weight
        for v in variants:
            if v.get('weight') and v['weight'] > 0:
                enrichment['weight'] = v['weight']
                enrichment['weight_unit'] = v.get('weight_unit', 'lb')
                break
    
    # --- Tags ---
    tags = product.get('tags', '')
    if isinstance(tags, str) and tags:
        enrichment['tags'] = [t.strip() for t in tags.split(',')]
    elif isinstance(tags, list):
        enrichment['tags'] = tags
    
    # --- Product Type ---
    if product.get('product_type'):
        enrichment['product_type'] = product['product_type']
    
    # --- Vendor ---
    if product.get('vendor'):
        enrichment['vendor'] = product['vendor']
    
    return enrichment


def match_products(catalogs: dict) -> list:
    """Match our products against retailer catalogs."""
    print("\n" + "=" * 60)
    print("  MATCHING PRODUCTS")
    print("=" * 60)
    
    with open(MANIFEST_PATH, encoding='utf-8') as f:
        manifest = json.load(f)
    
    print(f"  Our products needing enrichment: {len(manifest)}")
    
    # Build a flat list of all retailer products with source info
    retailer_products = []
    for key, cat in catalogs.items():
        for p in cat['products']:
            retailer_products.append({
                'retailer': key,
                'retailer_url': cat['info']['url'],
                'priority': cat['info']['priority'],
                'product': p,
            })
    print(f"  Total retailer products to match against: {len(retailer_products)}")
    
    # Pre-build token index for faster matching
    print("  Building search index...")
    token_index = defaultdict(list)
    for rp in retailer_products:
        title = rp['product']['title']
        for token in title_tokens(title):
            token_index[token].append(rp)
    
    # Match each of our products
    results = []
    matched = 0
    high_confidence = 0
    
    for i, product in enumerate(manifest):
        our_title = product['title']
        brand = product.get('brand', '')
        
        # Get candidate matches using token index
        our_tokens = title_tokens(our_title)
        candidates = set()
        for token in our_tokens:
            for rp in token_index.get(token, []):
                candidates.add(id(rp))
        
        # Map IDs back to retailer products
        candidate_products = [rp for rp in retailer_products if id(rp) in candidates]
        
        # Score each candidate
        best_match = None
        best_score = 0
        best_retailer = None
        
        for rp in candidate_products:
            score = match_score(our_title, rp['product']['title'], brand)
            # Prefer manufacturer sources over retailers
            priority_bonus = 0.02 if rp['priority'] == 1 else 0
            adjusted_score = score + priority_bonus
            
            if adjusted_score > best_score:
                best_score = adjusted_score
                best_match = rp
                best_retailer = rp['retailer']
        
        result = {
            'id': product['id'],
            'title': our_title,
            'brand': brand,
            'missing': product['missing'],
        }
        
        if best_match and best_score >= MATCH_THRESHOLD:
            enrichment = extract_enrichment_from_shopify(
                best_match['product'], 
                best_match['retailer_url']
            )
            enrichment['match_score'] = round(best_score, 3)
            enrichment['retailer'] = best_retailer
            result['enrichment'] = enrichment
            matched += 1
            if best_score >= HIGH_CONFIDENCE:
                high_confidence += 1
        
        results.append(result)
        
        if (i + 1) % 100 == 0:
            print(f"    Processed {i+1}/{len(manifest)} — matched: {matched}")
    
    print(f"\n  Matching complete:")
    print(f"    Total products:        {len(manifest)}")
    print(f"    Matched:               {matched} ({matched*100/len(manifest):.1f}%)")
    print(f"    High confidence (>80%): {high_confidence}")
    print(f"    Unmatched:             {len(manifest) - matched}")
    
    return results


def save_results(results: list):
    """Save match results and generate import-ready data."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Full results
    full_path = OUTPUT_DIR / "enrichment_matches.json"
    with open(full_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n  Full results: {full_path}")
    
    # Import-ready (only matched products with high confidence)
    import_ready = [r for r in results if r.get('enrichment') and r['enrichment'].get('match_score', 0) >= HIGH_CONFIDENCE]
    import_path = OUTPUT_DIR / "enrichment_import_ready.json"
    with open(import_path, 'w', encoding='utf-8') as f:
        json.dump(import_ready, f, indent=2, ensure_ascii=False)
    print(f"  Import-ready ({len(import_ready)} products): {import_path}")
    
    # Statistics
    print_stats(results)
    
    return results


def print_stats(results: list):
    """Print detailed statistics about the match results."""
    matched = [r for r in results if r.get('enrichment')]
    
    print("\n" + "=" * 60)
    print("  ENRICHMENT DATA AVAILABLE")
    print("=" * 60)
    
    # Count what data we got
    has = {
        'images': 0,
        'description': 0,
        'weight': 0,
        'variants': 0,
        'features': 0,
        'specs': 0,
        'pdfs': 0,
        'tags': 0,
    }
    
    for r in matched:
        e = r['enrichment']
        if e.get('images'):
            has['images'] += 1
        if e.get('description_html'):
            has['description'] += 1
        if e.get('weight'):
            has['weight'] += 1
        if e.get('variants'):
            has['variants'] += 1
        if e.get('features'):
            has['features'] += 1
        if e.get('specs'):
            has['specs'] += 1
        if e.get('pdfs'):
            has['pdfs'] += 1
        if e.get('tags'):
            has['tags'] += 1
    
    for what, count in has.items():
        print(f"  {what:15s}: {count:4d} / {len(matched)} matched products")
    
    # By brand
    brand_stats = defaultdict(lambda: {'total': 0, 'matched': 0, 'high': 0})
    for r in results:
        brand = r.get('brand', '(Unbranded)')
        brand_stats[brand]['total'] += 1
        if r.get('enrichment'):
            brand_stats[brand]['matched'] += 1
            if r['enrichment'].get('match_score', 0) >= HIGH_CONFIDENCE:
                brand_stats[brand]['high'] += 1
    
    print(f"\n  --- Match Rate by Brand (Top 20) ---")
    print(f"  {'Brand':<30s} {'Total':>6s} {'Match':>6s} {'High':>6s} {'Rate':>6s}")
    print(f"  {'-'*60}")
    
    for brand, stats in sorted(brand_stats.items(), key=lambda x: -x[1]['total'])[:20]:
        rate = f"{stats['matched']*100/stats['total']:.0f}%" if stats['total'] > 0 else "0%"
        print(f"  {brand:<30s} {stats['total']:>6d} {stats['matched']:>6d} {stats['high']:>6d} {rate:>6s}")
    
    # By retailer source
    retailer_stats = defaultdict(int)
    for r in matched:
        retailer_stats[r['enrichment'].get('retailer', 'unknown')] += 1
    
    print(f"\n  --- Matches by Source ---")
    for ret, count in sorted(retailer_stats.items(), key=lambda x: -x[1]):
        print(f"  {ret}: {count}")


# ============================================================
# Entry Point
# ============================================================

if __name__ == '__main__':
    args = sys.argv[1:]
    
    if '--fetch' in args:
        fetch_all_catalogs()
    
    elif '--match' in args:
        # Load cached catalogs
        catalogs = {}
        for key, info in RETAILERS.items():
            cache_file = CATALOG_DIR / f"{key}_products.json"
            if cache_file.exists():
                with open(cache_file, encoding='utf-8') as f:
                    catalogs[key] = {'info': info, 'products': json.load(f)}
            else:
                print(f"  No cached catalog for {key}, fetching...")
                products = fetch_shopify_catalog(key, info)
                catalogs[key] = {'info': info, 'products': products}
        
        results = match_products(catalogs)
        save_results(results)
    
    elif '--all' in args:
        catalogs = fetch_all_catalogs()
        results = match_products(catalogs)
        save_results(results)
    
    elif '--stats' in args:
        results_file = OUTPUT_DIR / "enrichment_matches.json"
        if results_file.exists():
            with open(results_file, encoding='utf-8') as f:
                results = json.load(f)
            print_stats(results)
        else:
            print("No results file found. Run --all first.")
    
    else:
        print("Hydro Retailer Product Scraper")
        print("=" * 40)
        print(f"  Retailers: {', '.join(r['name'] for r in RETAILERS.values())}")
        print()
        print("Usage:")
        print("  --fetch   Download all retailer product catalogs")
        print("  --match   Match our products against cached catalogs")
        print("  --all     Fetch + Match in one shot")
        print("  --stats   Show statistics from previous match run")
