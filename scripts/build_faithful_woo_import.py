"""
Build Faithful WooCommerce Import CSV

This script converts the Dec 31 WooCommerce export (woo-import-export plugin format)
into WooCommerce native CSV import format, PRESERVING:
  - Original categories exactly as they were
  - Grouped product structure (NOT converting to variable/variation)
  - Original product types (simple, grouped)
  - All existing data fields

Changes made:
  - Column names mapped to WooCommerce native format
  - HTML entities decoded in text fields
  - Grouped product child references converted from names to SKUs
  - Missing SKUs auto-generated
  - Missing Regular Price filled from Price column where available
  - Output split into Pass 1 (simple) and Pass 2 (grouped) CSVs
"""

import csv
import html
import re
import os
import hashlib

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOO_EXPORT = os.path.join(BASE_DIR, 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv')
OUTPUT_DIR = os.path.join(BASE_DIR, 'outputs')
PASS1_FILE = os.path.join(OUTPUT_DIR, 'woo_faithful_pass1_simple.csv')
PASS2_FILE = os.path.join(OUTPUT_DIR, 'woo_faithful_pass2_grouped.csv')

# WooCommerce native CSV columns (only the ones we have data for)
WC_COLUMNS = [
    'Type', 'SKU', 'Name', 'Published', 'Is featured?', 'Visibility in catalog',
    'Short description', 'Description', 'Tax status', 'In stock?', 'Stock',
    'Backorders allowed?', 'Weight (lbs)', 'Length (in)', 'Width (in)', 'Height (in)',
    'Allow customer reviews?', 'Regular price', 'Sale price', 'Categories', 'Tags',
    'Images', 'Grouped products', 'Brands',
]


def normalize_name(s):
    """Normalize a product name for fuzzy matching."""
    s = html.unescape(s)
    s = re.sub(r'[\u2033\u201c\u201d\u2019\u2018\u0022\u0027]', '"', s)
    s = re.sub(r'[\u2013\u2014\u2010\u2011]', '-', s)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s


def auto_sku(name, idx):
    """Generate a deterministic SKU from a product name."""
    h = hashlib.md5(name.encode('utf-8')).hexdigest()[:6].upper()
    return f'HMH-AUTO-{h}'


def decode_categories(raw_cat):
    """Pass through category string as-is — DB stores HTML entities like &amp;."""
    if not raw_cat:
        return ''
    # DO NOT html.unescape() — WooCommerce DB stores &amp; not &
    return raw_cat.strip()


def main():
    print("Reading Dec 31 WooCommerce export...")
    with open(WOO_EXPORT, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"  {len(rows)} rows read")

    # =========================================================================
    # Phase 1: Build name -> SKU lookup for grouped product children
    # =========================================================================
    
    # First, ensure all products have SKUs (auto-generate where missing)
    existing_skus = set()
    for r in rows:
        sku = r.get('Sku', '').strip()
        if sku:
            existing_skus.add(sku)
    
    sku_generated = 0
    for i, r in enumerate(rows):
        sku = r.get('Sku', '').strip()
        if not sku:
            name = r.get('Product Name', '').strip()
            new_sku = auto_sku(name, i)
            while new_sku in existing_skus:
                new_sku = f'{new_sku}-{i}'
            r['Sku'] = new_sku
            existing_skus.add(new_sku)
            sku_generated += 1
    print(f"  Auto-generated {sku_generated} missing SKUs")

    # Build name -> SKU maps (exact, decoded, normalized)
    name_exact_to_sku = {}
    name_decoded_to_sku = {}
    name_normalized_to_sku = {}
    
    for r in rows:
        name = r.get('Product Name', '').strip()
        sku = r.get('Sku', '').strip()
        if name and sku:
            name_exact_to_sku[name] = sku
            name_decoded_to_sku[html.unescape(name)] = sku
            name_normalized_to_sku[normalize_name(name)] = sku

    def find_child_sku(child_name):
        """Find the SKU for a grouped product child by name."""
        if child_name in name_exact_to_sku:
            return name_exact_to_sku[child_name]
        decoded = html.unescape(child_name)
        if decoded in name_decoded_to_sku:
            return name_decoded_to_sku[decoded]
        normed = normalize_name(child_name)
        if normed in name_normalized_to_sku:
            return name_normalized_to_sku[normed]
        return None

    # =========================================================================
    # Phase 2: Convert rows to WooCommerce native format
    # =========================================================================
    
    simple_rows = []
    grouped_rows = []
    
    children_found = 0
    children_missing = 0
    
    for r in rows:
        ptype = r.get('Type', '').strip()
        if not ptype:
            ptype = 'simple'
        
        # Map status to Published (1/0/-1)
        status = r.get('Status', '').strip().lower()
        if status == 'publish':
            published = '1'
        elif status == 'draft':
            published = '0'
        elif status == 'private':
            published = '-1'
        else:
            published = '1'
        
        # Regular price: use Price column as fallback for simple products
        reg_price = r.get('Regular Price', '').strip()
        if not reg_price and ptype == 'simple':
            reg_price = r.get('Price', '').strip()
        
        # Categories: decode HTML entities
        categories = decode_categories(r.get('Product categories', '').strip())
        
        # Images
        images = r.get('Image URL', '').strip()
        
        # Grouped products: convert name references to SKU references
        grouped_children = ''
        if ptype == 'grouped':
            raw_grouped = r.get('Grouped products', '').strip()
            if raw_grouped:
                child_skus = []
                for child_name in raw_grouped.split('|~|'):
                    child_name = child_name.strip()
                    if not child_name:
                        continue
                    child_sku = find_child_sku(child_name)
                    if child_sku:
                        child_skus.append(child_sku)
                        children_found += 1
                    else:
                        children_missing += 1
                grouped_children = ', '.join(child_skus)
        
        # Build the WooCommerce native row
        wc_row = {
            'Type': ptype,
            'SKU': r.get('Sku', '').strip(),
            'Name': html.unescape(r.get('Product Name', '').strip()),
            'Published': published,
            'Is featured?': '0',
            'Visibility in catalog': 'visible',
            'Short description': html.unescape(r.get('Product short description', '').strip()),
            'Description': html.unescape(r.get('Product description', '').strip()),
            'Tax status': r.get('Tax Status', '').strip() or 'taxable',
            'In stock?': '1' if r.get('Stock Status', '').strip().lower() in ('instock', 'in stock', '') else '0',
            'Stock': r.get('Stock', '').strip(),
            'Backorders allowed?': '0',
            'Weight (lbs)': r.get('Weight', '').strip(),
            'Length (in)': r.get('Length', '').strip(),
            'Width (in)': r.get('Width', '').strip(),
            'Height (in)': r.get('Height', '').strip(),
            'Allow customer reviews?': '1',
            'Regular price': reg_price,
            'Sale price': r.get('Sale Price', '').strip(),
            'Categories': categories,
            'Tags': html.unescape(r.get('Product tags', '').strip()),
            'Images': images,
            'Grouped products': grouped_children,
            'Brands': r.get('Brands', '').strip(),
        }
        
        if ptype == 'grouped':
            grouped_rows.append(wc_row)
        else:
            simple_rows.append(wc_row)
    
    print(f"\n  Simple products: {len(simple_rows)}")
    print(f"  Grouped products: {len(grouped_rows)}")
    print(f"  Grouped children resolved: {children_found}")
    print(f"  Grouped children missing: {children_missing} (products no longer exist)")

    # =========================================================================
    # Phase 3: Write output CSVs
    # =========================================================================
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    with open(PASS1_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=WC_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(simple_rows)
    print(f"\n  Pass 1 written: {PASS1_FILE}")
    print(f"  {len(simple_rows)} simple products")
    
    with open(PASS2_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=WC_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(grouped_rows)
    print(f"\n  Pass 2 written: {PASS2_FILE}")
    print(f"  {len(grouped_rows)} grouped products")

    # =========================================================================
    # Phase 4: Validation summary
    # =========================================================================
    
    print("\n" + "="*60)
    print("VALIDATION SUMMARY")
    print("="*60)
    
    # Category coverage
    all_rows = simple_rows + grouped_rows
    cat_filled = sum(1 for r in all_rows if r['Categories'])
    print(f"Category coverage: {cat_filled}/{len(all_rows)} ({100*cat_filled/len(all_rows):.0f}%)")
    
    # Unique categories
    unique_cats = set()
    for r in all_rows:
        if r['Categories']:
            unique_cats.add(r['Categories'])
    print(f"Unique categories: {len(unique_cats)}")
    for c in sorted(unique_cats):
        count = sum(1 for r in all_rows if r['Categories'] == c)
        print(f"  {count:5d}  {c}")
    
    # SKU coverage
    sku_filled = sum(1 for r in all_rows if r['SKU'])
    sku_dupes = len(all_rows) - len(set(r['SKU'] for r in all_rows if r['SKU']))
    print(f"\nSKU coverage: {sku_filled}/{len(all_rows)} ({100*sku_filled/len(all_rows):.0f}%)")
    print(f"SKU duplicates: {sku_dupes}")
    
    # Price coverage (simple only)
    simple_priced = sum(1 for r in simple_rows if r['Regular price'])
    print(f"\nSimple products with price: {simple_priced}/{len(simple_rows)}")
    
    # Image coverage
    img_filled = sum(1 for r in all_rows if r['Images'])
    print(f"Image coverage: {img_filled}/{len(all_rows)} ({100*img_filled/len(all_rows):.0f}%)")
    
    # Product types
    print(f"\nProduct types: {len(simple_rows)} simple + {len(grouped_rows)} grouped = {len(all_rows)} total")
    
    # Grouped products with children
    grouped_with_children = sum(1 for r in grouped_rows if r['Grouped products'])
    print(f"Grouped products with resolved children: {grouped_with_children}/{len(grouped_rows)}")


if __name__ == '__main__':
    main()
