#!/usr/bin/env python3
"""
manufacturer_scraper.py — Scrape manufacturer websites for product data
 
Strategy:
1. Probe each brand's website for Shopify JSON API (/products.json)
2. For Shopify stores: auto-match products by title fuzzy match
3. For non-Shopify: try common WooCommerce/generic product page patterns
4. Extract: hi-res images, descriptions, weights, dimensions, PDF links
5. Save enrichment data as JSON for WooCommerce import

Usage:
    python scripts/manufacturer_scraper.py                    # Probe all brands
    python scripts/manufacturer_scraper.py --brand "FoxFarm"  # Single brand
    python scripts/manufacturer_scraper.py --scrape            # Full scrape
"""

import json
import os
import re
import sys
import time
import urllib.parse
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
RESULTS_PATH = OUTPUT_DIR / "scrape_results.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

REQUEST_TIMEOUT = 15
RATE_LIMIT_DELAY = 1.5  # seconds between requests to same domain

# Brand → manufacturer website mappings
BRAND_SITES = {
    "Advanced Nutrients": "https://advancednutrients.com",
    "General Hydroponics": "https://generalhydroponics.com",
    "FoxFarm": "https://foxfarm.com",
    "Botanicare": "https://botanicare.com",
    "Humboldt Nutrients": "https://humboldtnutrients.com",
    "Nectar for the Gods": "https://oregonsonly.com",
    "AC Infinity": "https://acinfinity.com",
    "Eye Hortilux": "https://eyehortilux.com",
    "Plagron": "https://plagron.com",
    "Canna": "https://www.canna.com",
    "Dyna-Gro": "https://dfrombio.com",
    "Clonex": "https://hydrodynamicsintl.com",
    "Holland Secret": "https://futureharvestdevelopment.com",
    "Can-Fan": "https://can-filters.com",
    "Growth Science": "https://growthsciencenutrients.com",
    "ONA": "https://onaonline.com",
    "HM Digital": "https://hmdigital.com",
    "Down To Earth": "https://downtoearthfertilizer.com",
    "Technaflora": "https://technaflora.com",
    "Root Pouch": "https://rootpouch.com",
    "BioBizz": "https://biobizz.com",
    "TRIMPRO": "https://trimpro.com",
    "Hydro Dynamic": "https://hydrodynamicsintl.com",
    "Spider Farmer": "https://spider-farmer.com",
    "Mars Hydro": "https://mars-hydro.com",
    "Bluelab": "https://bluelab.com",
    "Safer Brand": "https://saferbrand.com",
    "B'Cuzz": "https://atr-hydroponics.com",
    "Sunblaster": "https://sunblasterlighting.com",
    "DutchMaster": "https://dutchmaster.com.au",
    "Mother Earth": "https://motherearthnutrients.com",
    "MaxiGrow": "https://generalhydroponics.com",
    "Gavita": "https://gavita.com",
    "Hanna Instruments": "https://hannainst.com",
    "SiLICIUM": "https://siliciumplant.com",
}


# ============================================================
# Utilities
# ============================================================

def normalize_title(title: str) -> str:
    """Normalize product title for fuzzy matching."""
    # Remove common size/volume suffixes
    title = re.sub(r'\s*\(?\d+\s*(lt?|gal|ml|oz|qt|lb|kg|g)\b[^)]*\)?', '', title, flags=re.I)
    # Remove brand name prefix patterns
    title = re.sub(r'^(advanced nutrients?|general hydroponics?|foxfarm|botanicare|plagron|canna)\s+', '', title, flags=re.I)
    # Normalize whitespace
    title = re.sub(r'\s+', ' ', title).strip().lower()
    return title


def fuzzy_match(a: str, b: str) -> float:
    """Return similarity ratio between two strings."""
    return SequenceMatcher(None, normalize_title(a), normalize_title(b)).ratio()


def safe_get(url: str, **kwargs) -> requests.Response | None:
    """Make a GET request with error handling."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, **kwargs)
        if resp.status_code == 200:
            return resp
        return None
    except Exception as e:
        print(f"    [ERR] {url}: {e}")
        return None


def extract_pdf_links(soup: BeautifulSoup, base_url: str) -> dict:
    """Find SDS, feeding chart, instruction PDF links on a page."""
    pdfs = {}
    for a in soup.find_all('a', href=True):
        href = a['href'].lower()
        text = (a.get_text() + ' ' + a.get('title', '')).lower()
        if not href.endswith('.pdf') and 'pdf' not in href:
            continue
        full_url = urllib.parse.urljoin(base_url, a['href'])
        if any(kw in href or kw in text for kw in ['sds', 'safety', 'msds']):
            pdfs['sds'] = full_url
        elif any(kw in href or kw in text for kw in ['feed', 'schedule', 'chart', 'program']):
            pdfs['feeding_chart'] = full_url
        elif any(kw in href or kw in text for kw in ['instruction', 'guide', 'manual', 'how']):
            pdfs['instructions'] = full_url
        elif any(kw in href or kw in text for kw in ['spec', 'technical', 'data.?sheet']):
            pdfs['spec_sheet'] = full_url
        else:
            pdfs.setdefault('other_pdfs', []).append(full_url)
    return pdfs


def extract_product_specs(soup: BeautifulSoup) -> dict:
    """Extract structured specs from product page (weight, dimensions, NPK, etc.)."""
    specs = {}
    
    # Look for specification tables
    for table in soup.find_all('table'):
        for row in table.find_all('tr'):
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                key = cells[0].get_text(strip=True).lower()
                val = cells[1].get_text(strip=True)
                if any(kw in key for kw in ['weight', 'wt']):
                    specs['weight'] = val
                elif any(kw in key for kw in ['dimension', 'size', 'length', 'width', 'height']):
                    specs['dimensions'] = val
                elif 'npk' in key or 'analysis' in key:
                    specs['npk'] = val
                elif any(kw in key for kw in ['upc', 'barcode', 'ean']):
                    specs['upc'] = val
                elif any(kw in key for kw in ['sku', 'item', 'model']):
                    specs['sku'] = val
    
    # Look for spec lists (dt/dd or label/value patterns)
    for dl in soup.find_all('dl'):
        dts = dl.find_all('dt')
        dds = dl.find_all('dd')
        for dt, dd in zip(dts, dds):
            key = dt.get_text(strip=True).lower()
            val = dd.get_text(strip=True)
            if 'weight' in key:
                specs['weight'] = val
            elif 'npk' in key:
                specs['npk'] = val
    
    # Look for structured data (JSON-LD)
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, list):
                data = data[0]
            if data.get('@type') == 'Product':
                if 'weight' in data:
                    specs['weight'] = str(data['weight'])
                if 'description' in data:
                    specs['meta_description'] = data['description']
                if 'image' in data:
                    imgs = data['image']
                    if isinstance(imgs, str):
                        specs['json_ld_image'] = imgs
                    elif isinstance(imgs, list):
                        specs['json_ld_images'] = imgs
        except (json.JSONDecodeError, TypeError):
            pass
    
    return specs


# ============================================================
# Shopify Store Scraper
# ============================================================

class ShopifyScraper:
    """Scrape products from Shopify stores via JSON API."""
    
    def __init__(self, base_url: str, brand: str):
        self.base_url = base_url.rstrip('/')
        self.brand = brand
        self.products_cache = None
    
    def is_shopify(self) -> bool:
        """Check if the site is a Shopify store."""
        resp = safe_get(f"{self.base_url}/products.json?limit=1")
        if resp:
            try:
                data = resp.json()
                return 'products' in data
            except (json.JSONDecodeError, ValueError):
                pass
        return False
    
    def fetch_all_products(self) -> list:
        """Fetch all products from Shopify JSON API."""
        if self.products_cache is not None:
            return self.products_cache
        
        all_products = []
        page = 1
        while True:
            resp = safe_get(f"{self.base_url}/products.json?limit=250&page={page}")
            if not resp:
                break
            try:
                data = resp.json()
                products = data.get('products', [])
                if not products:
                    break
                all_products.extend(products)
                page += 1
                time.sleep(RATE_LIMIT_DELAY)
            except (json.JSONDecodeError, ValueError):
                break
        
        self.products_cache = all_products
        return all_products
    
    def match_product(self, our_title: str) -> dict | None:
        """Find the best matching product by fuzzy title match."""
        products = self.fetch_all_products()
        best_match = None
        best_score = 0.0
        
        for p in products:
            score = fuzzy_match(our_title, p['title'])
            if score > best_score:
                best_score = score
                best_match = p
        
        if best_score >= 0.55:  # Threshold for acceptable match
            return best_match
        return None
    
    def extract_enrichment(self, shopify_product: dict) -> dict:
        """Extract enrichment data from a Shopify product."""
        enrichment = {
            'source': 'shopify_api',
            'source_url': f"{self.base_url}/products/{shopify_product['handle']}",
            'match_title': shopify_product['title'],
        }
        
        # Images (sorted by size, largest first)
        images = shopify_product.get('images', [])
        if images:
            # Shopify image URLs support size suffixes like _1024x1024
            enrichment['images'] = []
            for img in images:
                src = img.get('src', '')
                # Get the largest version by removing size suffix
                hi_res = re.sub(r'_\d+x\d*\.', '.', src)
                enrichment['images'].append({
                    'url': hi_res,
                    'alt': img.get('alt', ''),
                    'width': img.get('width'),
                    'height': img.get('height'),
                })
        
        # Description (HTML)
        body = shopify_product.get('body_html', '')
        if body and len(body) > 50:
            enrichment['description_html'] = body
            enrichment['description_text'] = BeautifulSoup(body, 'html.parser').get_text(' ', strip=True)
        
        # Variants (sizes, prices, weights, SKUs)
        variants = shopify_product.get('variants', [])
        if variants:
            enrichment['variants'] = []
            for v in variants:
                var_data = {}
                if v.get('title') and v['title'] != 'Default Title':
                    var_data['title'] = v['title']
                if v.get('sku'):
                    var_data['sku'] = v['sku']
                if v.get('price'):
                    var_data['price'] = v['price']
                if v.get('weight') and v['weight'] > 0:
                    var_data['weight'] = v['weight']
                    var_data['weight_unit'] = v.get('weight_unit', 'lb')
                if v.get('barcode'):
                    var_data['barcode'] = v['barcode']
                enrichment['variants'].append(var_data)
            
            # Use first variant's weight if available
            first_with_weight = next((v for v in variants if v.get('weight') and v['weight'] > 0), None)
            if first_with_weight:
                enrichment['weight'] = first_with_weight['weight']
                enrichment['weight_unit'] = first_with_weight.get('weight_unit', 'lb')
        
        # Tags (can identify category)
        if shopify_product.get('tags'):
            enrichment['tags'] = shopify_product['tags']
        
        # Product type
        if shopify_product.get('product_type'):
            enrichment['product_type'] = shopify_product['product_type']
        
        return enrichment


# ============================================================
# Generic HTML Scraper  
# ============================================================

class GenericScraper:
    """Scrape product data from generic websites using BeautifulSoup."""
    
    def __init__(self, base_url: str, brand: str):
        self.base_url = base_url.rstrip('/')
        self.brand = brand
    
    def search_product(self, title: str) -> str | None:
        """Try to find a product page URL by searching the site."""
        search_patterns = [
            f"{self.base_url}/?s={urllib.parse.quote_plus(title)}",
            f"{self.base_url}/search?q={urllib.parse.quote_plus(title)}",
            f"{self.base_url}/search?type=product&q={urllib.parse.quote_plus(title)}",
        ]
        
        for search_url in search_patterns:
            resp = safe_get(search_url)
            if not resp:
                continue
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            # Look for product links in search results
            for a in soup.find_all('a', href=True):
                href = a['href']
                text = a.get_text(strip=True).lower()
                norm_title = normalize_title(title)
                if fuzzy_match(text, title) > 0.5 and '/product' in href.lower():
                    return urllib.parse.urljoin(self.base_url, href)
            
            time.sleep(RATE_LIMIT_DELAY)
        
        return None
    
    def scrape_product_page(self, url: str) -> dict:
        """Scrape product data from a generic product page."""
        resp = safe_get(url)
        if not resp:
            return {}
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        enrichment = {
            'source': 'html_scrape',
            'source_url': url,
        }
        
        # Images
        images = []
        # Look for product images in common patterns
        for img in soup.find_all('img'):
            src = img.get('src', '') or img.get('data-src', '')
            if not src:
                continue
            # Filter for likely product images
            src_lower = src.lower()
            if any(kw in src_lower for kw in ['product', 'upload', 'media', 'image', 'photo', 'cdn']):
                # Skip tiny icons/thumbnails
                w = img.get('width', '0')
                h = img.get('height', '0')
                try:
                    if int(w) < 50 or int(h) < 50:
                        continue
                except (ValueError, TypeError):
                    pass
                full_url = urllib.parse.urljoin(url, src)
                if full_url not in [i['url'] for i in images]:
                    images.append({
                        'url': full_url,
                        'alt': img.get('alt', ''),
                    })
        if images:
            enrichment['images'] = images[:10]  # Limit to 10 images
        
        # Description
        # Common description selectors
        desc_selectors = [
            '.product-description', '.product__description', '#product-description',
            '.woocommerce-product-details__short-description',
            '.product-single__description', '.product-details',
            '[itemprop="description"]', '.description',
        ]
        for sel in desc_selectors:
            desc_el = soup.select_one(sel)
            if desc_el and len(desc_el.get_text(strip=True)) > 30:
                enrichment['description_html'] = str(desc_el)
                enrichment['description_text'] = desc_el.get_text(' ', strip=True)
                break
        
        # Meta description fallback
        if 'description_text' not in enrichment:
            meta = soup.find('meta', attrs={'name': 'description'})
            if meta and meta.get('content'):
                enrichment['meta_description'] = meta['content']
        
        # Open Graph image
        og_img = soup.find('meta', attrs={'property': 'og:image'})
        if og_img and og_img.get('content'):
            enrichment.setdefault('images', []).insert(0, {
                'url': og_img['content'],
                'alt': 'OG Image',
            })
        
        # Specs
        specs = extract_product_specs(soup)
        if specs:
            enrichment['specs'] = specs
        
        # PDFs
        pdfs = extract_pdf_links(soup, url)
        if pdfs:
            enrichment['pdfs'] = pdfs
        
        return enrichment


# ============================================================
# Main Orchestrator
# ============================================================

def load_manifest() -> list:
    """Load the enrichment manifest."""
    with open(MANIFEST_PATH, encoding='utf-8') as f:
        return json.load(f)


def probe_brand_sites() -> dict:
    """Probe each brand site to determine platform (Shopify vs other)."""
    print("\n" + "=" * 60)
    print("  PROBING MANUFACTURER WEBSITES")
    print("=" * 60)
    
    results = {}
    for brand, url in sorted(BRAND_SITES.items()):
        print(f"\n  {brand}: {url}")
        scraper = ShopifyScraper(url, brand)
        
        # Check if it's a Shopify store
        is_shopify = scraper.is_shopify()
        if is_shopify:
            products = scraper.fetch_all_products()
            print(f"    ✅ SHOPIFY STORE — {len(products)} products found!")
            results[brand] = {
                'url': url,
                'platform': 'shopify',
                'product_count': len(products),
            }
        else:
            # Try to reach the site at all
            resp = safe_get(url)
            if resp:
                print(f"    ⚠️  Non-Shopify (HTML scraping available)")
                results[brand] = {
                    'url': url,
                    'platform': 'generic',
                    'reachable': True,
                }
            else:
                print(f"    ❌ Unreachable")
                results[brand] = {
                    'url': url,
                    'platform': 'unknown',
                    'reachable': False,
                }
        
        time.sleep(RATE_LIMIT_DELAY)
    
    # Save probe results
    probe_path = OUTPUT_DIR / "brand_probe_results.json"
    with open(probe_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"\n\nProbe results saved: {probe_path}")
    
    return results


def scrape_brand(brand: str, products: list, probe_info: dict = None) -> list:
    """Scrape enrichment data for all products of a given brand."""
    url = BRAND_SITES.get(brand)
    if not url:
        print(f"  No manufacturer URL for '{brand}', skipping")
        return []
    
    platform = (probe_info or {}).get('platform', 'unknown')
    print(f"\n--- Scraping: {brand} ({len(products)} products) via {platform} ---")
    
    enriched = []
    
    if platform == 'shopify':
        scraper = ShopifyScraper(url, brand)
        shopify_products = scraper.fetch_all_products()
        
        for p in products:
            title = p['title']
            match = scraper.match_product(title)
            if match:
                data = scraper.extract_enrichment(match)
                data['our_product_id'] = p['id']
                data['our_title'] = title
                data['match_score'] = fuzzy_match(title, match['title'])
                enriched.append(data)
                print(f"    ✅ {title[:50]}  →  {match['title'][:50]} ({data['match_score']:.0%})")
            else:
                print(f"    ❌ No match: {title[:60]}")
            time.sleep(0.5)
    
    elif platform == 'generic':
        scraper = GenericScraper(url, brand)
        for p in products:
            title = p['title']
            product_url = scraper.search_product(title)
            if product_url:
                data = scraper.scrape_product_page(product_url)
                if data:
                    data['our_product_id'] = p['id']
                    data['our_title'] = title
                    enriched.append(data)
                    print(f"    ✅ {title[:50]}  →  {product_url[:60]}")
            else:
                print(f"    ❌ No match: {title[:60]}")
            time.sleep(RATE_LIMIT_DELAY)
    
    return enriched


def run_full_scrape(target_brand: str = None):
    """Run the full scrape pipeline."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    manifest = load_manifest()
    
    # Group products by brand
    by_brand = {}
    for p in manifest:
        brand = p.get('brand', '')
        if not brand:
            continue
        by_brand.setdefault(brand, []).append(p)
    
    # Probe sites first
    probe_path = OUTPUT_DIR / "brand_probe_results.json"
    if probe_path.exists():
        with open(probe_path, encoding='utf-8') as f:
            probe_results = json.load(f)
        print(f"Using cached probe results from {probe_path}")
    else:
        probe_results = probe_brand_sites()
    
    # Scrape each brand
    all_enriched = []
    brands_to_scrape = [target_brand] if target_brand else sorted(by_brand.keys(), key=lambda b: -len(by_brand[b]))
    
    for brand in brands_to_scrape:
        if brand not in by_brand:
            print(f"  Brand '{brand}' not found in manifest")
            continue
        if brand not in BRAND_SITES:
            continue
        
        probe_info = probe_results.get(brand, {})
        if probe_info.get('platform') == 'unknown' or not probe_info.get('reachable', True):
            print(f"  Skipping {brand} (unreachable)")
            continue
        
        enriched = scrape_brand(brand, by_brand[brand], probe_info)
        all_enriched.extend(enriched)
        
        # Save intermediate results
        brand_file = OUTPUT_DIR / f"scraped_{brand.lower().replace(' ', '_')}.json"
        with open(brand_file, 'w', encoding='utf-8') as f:
            json.dump(enriched, f, indent=2, ensure_ascii=False)
        
        print(f"  → Saved {len(enriched)} enrichments to {brand_file.name}")
    
    # Save combined results
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_enriched, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print("\n" + "=" * 60)
    print("  SCRAPE SUMMARY")
    print("=" * 60)
    print(f"  Total products enriched: {len(all_enriched)}")
    
    has_images = sum(1 for e in all_enriched if e.get('images'))
    has_desc = sum(1 for e in all_enriched if e.get('description_html'))
    has_weight = sum(1 for e in all_enriched if e.get('weight') or (e.get('specs') and e['specs'].get('weight')))
    has_pdfs = sum(1 for e in all_enriched if e.get('pdfs'))
    has_variants = sum(1 for e in all_enriched if e.get('variants'))
    
    print(f"  With images:      {has_images}")
    print(f"  With description: {has_desc}")
    print(f"  With weight:      {has_weight}")
    print(f"  With PDFs:        {has_pdfs}")
    print(f"  With variants:    {has_variants}")
    print(f"\n  Results: {RESULTS_PATH}")
    
    return all_enriched


# ============================================================
# Entry Point
# ============================================================

if __name__ == '__main__':
    args = sys.argv[1:]
    
    if '--probe' in args:
        probe_brand_sites()
    elif '--brand' in args:
        idx = args.index('--brand')
        brand = args[idx + 1] if idx + 1 < len(args) else None
        if brand:
            run_full_scrape(target_brand=brand)
        else:
            print("Usage: --brand 'Brand Name'")
    elif '--scrape' in args:
        run_full_scrape()
    else:
        # Default: probe first
        print("Usage:")
        print("  --probe            Probe all brand websites (Shopify vs generic)")
        print("  --brand 'FoxFarm'  Scrape a single brand")
        print("  --scrape           Full scrape of all brands")
        print()
        probe_brand_sites()
