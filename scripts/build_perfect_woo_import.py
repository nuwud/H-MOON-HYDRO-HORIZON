#!/usr/bin/env python3
"""
Build Perfect WooCommerce Import CSV
=====================================
Transforms MASTER_IMPORT.csv (Shopify format) into a clean WooCommerce-native
CSV that follows the official Product CSV Import Schema:
  https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema

Key decisions based on WooCommerce docs:
- Type: simple | variable | variation (NO grouped products)
- Parent: For variations, references parent SKU
- Attributes: "Attribute 1 name" / "Attribute 1 value(s)" for variable parents
  list ALL values pipe-separated. Variations get single value.
- Categories: Use > for hierarchy, comma-separated for multiple
- Images: Comma-separated URLs, first is featured image
- Weight: In lbs (site is configured for lbs)
- Prices: Regular price on every purchasable row

Data sources merged:
1. outputs/MASTER_IMPORT.csv — Primary enriched product data (Shopify format)
2. CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv — WooCommerce reference data
3. CSVs/HMoonHydro_Inventory.csv — POS pricing/UPC data
4. CSVs/WooExport/Product-Categories-Export-2025-Dec-31-180812.csv — Category taxonomy
"""

import csv
import re
import os
import sys
from collections import OrderedDict

# Paths
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_IMPORT = os.path.join(BASE, 'outputs', 'MASTER_IMPORT.csv')
WOO_EXPORT = os.path.join(BASE, 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv')
POS_INVENTORY = os.path.join(BASE, 'CSVs', 'HMoonHydro_Inventory.csv')
CATEGORY_EXPORT = os.path.join(BASE, 'CSVs', 'WooExport', 'Product-Categories-Export-2025-Dec-31-180812.csv')
OUTPUT = os.path.join(BASE, 'outputs', 'woocommerce_PERFECT_IMPORT.csv')

# WooCommerce CSV columns (official schema from wiki)
WOO_COLUMNS = [
    'Type',
    'SKU',
    'Name',
    'Published',
    'Is featured?',
    'Visibility in catalog',
    'Short description',
    'Description',
    'Date sale price starts',
    'Date sale price ends',
    'Tax status',
    'Tax class',
    'In stock?',
    'Stock',
    'Low stock amount',
    'Backorders allowed?',
    'Sold individually?',
    'Weight (lbs)',
    'Length (in)',
    'Width (in)',
    'Height (in)',
    'Allow customer reviews?',
    'Purchase note',
    'Sale price',
    'Regular price',
    'Categories',
    'Tags',
    'Shipping class',
    'Images',
    'Download limit',
    'Download expiry days',
    'Parent',
    'Grouped products',
    'Upsells',
    'Cross-sells',
    'External URL',
    'Button text',
    'Position',
    'Brands',
    'Attribute 1 name',
    'Attribute 1 value(s)',
    'Attribute 1 visible',
    'Attribute 1 global',
    'Attribute 1 default',
]

# ── Shopify category → WooCommerce category mapping ──
# Using WooCommerce hierarchy format: Parent > Child
CATEGORY_MAP = {
    'nutrients': 'Nutrients & Supplements',
    'bloom boosters': 'Nutrients & Supplements > Bloom Boosters',
    'base nutrients': 'Nutrients & Supplements > Base Nutrients',
    'grow media': 'Growing Media',
    'grow_media': 'Growing Media',
    'coco coir': 'Growing Media > Coco Coir',
    'hydroton': 'Growing Media > Hydroton',
    'perlite': 'Growing Media > Perlite',
    'rockwool': 'Growing Media > Rockwool',
    'soil': 'Growing Media > Soil',
    'seeds': 'Seeds & Propagation > Seeds',
    'propagation': 'Seeds & Propagation > Propagation',
    'cloning': 'Seeds & Propagation > Cloning',
    'irrigation': 'Irrigation & Watering',
    'watering': 'Irrigation & Watering',
    'ph meters': 'Testing & Monitoring > pH Meters',
    'ph_meters': 'Testing & Monitoring > pH Meters',
    'environmental monitors': 'Testing & Monitoring > Environmental Monitors',
    'environmental_monitors': 'Testing & Monitoring > Environmental Monitors',
    'controllers': 'Controllers & Timers',
    'timers': 'Controllers & Timers',
    'controllers_timers': 'Controllers & Timers',
    'grow lights': 'Lighting > Grow Lights',
    'grow_lights': 'Lighting > Grow Lights',
    'hid bulbs': 'Lighting > HID Bulbs',
    'hid_bulbs': 'Lighting > HID Bulbs',
    'led': 'Lighting > LED',
    'lighting': 'Lighting',
    'airflow': 'Climate Control > Airflow & Ventilation',
    'ventilation': 'Climate Control > Airflow & Ventilation',
    'odor control': 'Climate Control > Odor Control',
    'odor_control': 'Climate Control > Odor Control',
    'carbon filters': 'Climate Control > Odor Control',
    'co2': 'Climate Control > CO2',
    'water filtration': 'Water Filtration',
    'water_filtration': 'Water Filtration',
    'containers': 'Pots & Containers',
    'pots': 'Pots & Containers',
    'containers_pots': 'Pots & Containers',
    'fabric pots': 'Pots & Containers > Fabric Pots',
    'harvesting': 'Harvesting & Processing > Harvesting',
    'trimming': 'Harvesting & Processing > Trimming',
    'extraction': 'Harvesting & Processing > Extraction',
    'pest control': 'Pest & Disease Control',
    'pest_control': 'Pest & Disease Control',
    'books': 'Books & Media',
    'grow room materials': 'Grow Room Setup > Materials',
    'grow_room_materials': 'Grow Room Setup > Materials',
    'grow tents': 'Grow Room Setup > Grow Tents',
    'grow_tents': 'Grow Room Setup > Grow Tents',
    'electrical supplies': 'Grow Room Setup > Electrical',
    'electrical_supplies': 'Grow Room Setup > Electrical',
    'ventilation_accessories': 'Climate Control > Ventilation Accessories',
}


def load_csv(path):
    """Load CSV with encoding fallback."""
    for enc in ['utf-8', 'utf-8-sig', 'latin-1']:
        try:
            with open(path, 'r', encoding=enc) as f:
                return list(csv.DictReader(f))
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    return []


def grams_to_lbs(grams_str):
    """Convert Shopify grams to WooCommerce lbs."""
    try:
        grams = float(grams_str)
        if grams <= 0:
            return ''
        lbs = grams / 453.592
        return f'{lbs:.2f}'
    except (ValueError, TypeError):
        return ''


def clean_html(text):
    """Clean up HTML description, ensuring it's reasonable."""
    if not text:
        return ''
    # Remove excessive whitespace
    text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
    return text.strip()


def make_short_description(description, max_len=200):
    """Generate short description from full description."""
    if not description:
        return ''
    # Strip HTML tags for short description
    plain = re.sub(r'<[^>]+>', ' ', description)
    plain = re.sub(r'\s+', ' ', plain).strip()
    if len(plain) <= max_len:
        return plain
    # Cut at sentence boundary
    cut = plain[:max_len]
    last_period = cut.rfind('.')
    if last_period > 100:
        return cut[:last_period + 1]
    return cut.rsplit(' ', 1)[0] + '...'


def map_category(shopify_type, shopify_tags=''):
    """Map Shopify product type to WooCommerce category hierarchy."""
    if not shopify_type:
        return 'Uncategorized'

    type_lower = shopify_type.strip().lower()

    # Direct mapping
    if type_lower in CATEGORY_MAP:
        return CATEGORY_MAP[type_lower]

    # Try partial match
    for key, val in CATEGORY_MAP.items():
        if key in type_lower or type_lower in key:
            return val

    # Use the type as-is, title-cased
    return shopify_type.strip().title()


def normalize_sku(sku):
    """Ensure SKU is clean."""
    if not sku:
        return ''
    return sku.strip()


def build_woo_row():
    """Return an empty WooCommerce row dict."""
    return OrderedDict((col, '') for col in WOO_COLUMNS)


def main():
    print("=" * 60)
    print("Building Perfect WooCommerce Import CSV")
    print("=" * 60)

    # ── Load data sources ──
    print("\n📂 Loading data sources...")

    master = load_csv(MASTER_IMPORT)
    print(f"  MASTER_IMPORT: {len(master)} rows")

    woo_export = load_csv(WOO_EXPORT)
    print(f"  WooCommerce Export: {len(woo_export)} rows")

    pos = load_csv(POS_INVENTORY)
    print(f"  POS Inventory: {len(pos)} rows")

    # ── Build lookups ──
    print("\n🔗 Building cross-reference lookups...")

    # WooCommerce by SKU
    woo_by_sku = {}
    for r in woo_export:
        sku = r.get('Sku', '').strip()
        if sku:
            woo_by_sku[sku] = r

    # WooCommerce grouped products → children mapping
    woo_grouped = {}
    for r in woo_export:
        if r.get('Type', '').strip() == 'grouped':
            parent_sku = r.get('Sku', '').strip()
            children_str = r.get('Grouped products', '')
            children = [c.strip() for c in children_str.split('|~|') if c.strip()]
            if parent_sku and children:
                woo_grouped[parent_sku] = {
                    'name': r.get('Product Name', '').strip(),
                    'children': children,
                    'parent_data': r
                }
    print(f"  WooCommerce grouped products: {len(woo_grouped)}")

    # POS by item number (SKU equivalent)
    pos_by_sku = {}
    for r in pos:
        item_num = r.get('Item Number', '').strip()
        if item_num:
            pos_by_sku[item_num] = r

    # ── Group MASTER_IMPORT by handle ──
    print("\n📦 Grouping products by handle...")
    handles = OrderedDict()
    for r in master:
        h = r['Handle'].strip()
        if not h:
            continue
        handles.setdefault(h, []).append(r)

    # ── Build WooCommerce rows ──
    print("\n🏗️  Building WooCommerce rows...")

    output_rows = []
    all_skus_used = set()  # Track SKUs to prevent duplicates
    auto_sku_counter = 0
    stats = {
        'simple': 0,
        'variable': 0,
        'variation': 0,
        'total_rows': 0,
        'with_price': 0,
        'with_description': 0,
        'with_image': 0,
        'with_sku': 0,
        'price_recovered': 0,
        'sku_generated': 0,
        'sku_deduped': 0,
    }

    for handle, rows in handles.items():
        parent_row = rows[0]
        title = parent_row.get('Title', '').strip()

        if not title:
            continue  # Skip empty products

        # Determine if this is a multi-variant product
        # A product is variable if it has multiple rows with different Option1 Values
        variant_rows = []
        for r in rows:
            opt_val = r.get('Option1 Value', '').strip()
            price = r.get('Variant Price', '').strip()
            sku = r.get('Variant SKU', '').strip()
            # Only count as variant if it has meaningful data
            if opt_val and (price or sku):
                variant_rows.append(r)

        # If only 1 meaningful variant or parent has no Option1 Name=Size, treat as simple
        opt_name = parent_row.get('Option1 Name', '').strip()
        is_variable = len(variant_rows) > 1 and opt_name == 'Size'

        # ── Common data extraction ──
        description = clean_html(parent_row.get('Body (HTML)', ''))
        short_desc = make_short_description(description)
        vendor = parent_row.get('Vendor', '').strip()
        shopify_type = parent_row.get('Type', '').strip()
        tags = parent_row.get('Tags', '').strip()
        category = map_category(shopify_type, tags)
        image_src = parent_row.get('Image Src', '').strip()

        # Try to get better data from WooCommerce export
        parent_sku = parent_row.get('Variant SKU', '').strip()
        woo_ref = woo_by_sku.get(parent_sku, {})
        if woo_ref:
            # Use WooCommerce description if it's richer
            woo_desc = woo_ref.get('Product description', '').strip()
            if woo_desc and len(woo_desc) > len(description):
                description = clean_html(woo_desc)
                short_desc = make_short_description(description)
            # WooCommerce categories (preserve existing if available)
            woo_cats = woo_ref.get('Product categories', '').strip()
            if woo_cats:
                # WooCommerce uses > for hierarchy, keep as-is
                category = woo_cats

        # ──────────────────────────
        # SIMPLE PRODUCT
        # ──────────────────────────
        if not is_variable:
            row = build_woo_row()
            row['Type'] = 'simple'

            # SKU - ensure unique
            sku = normalize_sku(parent_sku)
            if not sku:
                auto_sku_counter += 1
                sku = f'HMH-AUTO-{auto_sku_counter:04d}'
                stats['sku_generated'] += 1
            if sku in all_skus_used:
                sku = f'{sku}-{handle[:8]}'
                stats['sku_deduped'] += 1
            all_skus_used.add(sku)
            row['SKU'] = sku
            row['Name'] = title
            row['Published'] = '1'
            row['Is featured?'] = '0'
            row['Visibility in catalog'] = 'visible'
            row['Short description'] = short_desc
            row['Description'] = description
            row['Tax status'] = 'taxable'
            row['In stock?'] = '1'
            row['Backorders allowed?'] = '0'
            row['Allow customer reviews?'] = '1'

            # Price - use first variant row with a price
            price = parent_row.get('Variant Price', '').strip()
            if not price:
                for vr in rows:
                    p = vr.get('Variant Price', '').strip()
                    if p:
                        price = p
                        stats['price_recovered'] += 1
                        break
            # Fallback to POS
            if not price and parent_sku in pos_by_sku:
                pos_price = pos_by_sku[parent_sku].get('Price', '').strip()
                if pos_price:
                    price = pos_price
                    stats['price_recovered'] += 1

            row['Regular price'] = price
            row['Categories'] = category
            row['Tags'] = tags
            row['Images'] = image_src
            row['Brands'] = vendor

            # Weight (Shopify uses grams, WooCommerce uses lbs)
            weight_grams = parent_row.get('Variant Grams', '').strip()
            row['Weight (lbs)'] = grams_to_lbs(weight_grams)

            # If single variant with a Size option, store as attribute but not variable
            if opt_name == 'Size' and len(variant_rows) == 1:
                opt_val = variant_rows[0].get('Option1 Value', '').strip()
                if opt_val and opt_val.lower() != 'default':
                    row['Name'] = f"{title} - {opt_val}"

            output_rows.append(row)
            stats['simple'] += 1
            stats['total_rows'] += 1
            if price:
                stats['with_price'] += 1
            if description:
                stats['with_description'] += 1
            if image_src:
                stats['with_image'] += 1
            if row['SKU']:
                stats['with_sku'] += 1

        # ──────────────────────────
        # VARIABLE PRODUCT (parent + variations)
        # ──────────────────────────
        else:
            # Collect all attribute values
            all_values = []
            for vr in variant_rows:
                val = vr.get('Option1 Value', '').strip()
                if val and val.lower() != 'default':
                    all_values.append(val)

            if not all_values:
                all_values = ['Default']

            # Determine default value (first variant with price)
            default_value = all_values[0] if all_values else ''

            # ── Parent row (variable) ──
            parent = build_woo_row()
            parent['Type'] = 'variable'

            # Parent SKU: WooCommerce best practice is parent gets its own unique SKU
            # If the parent SKU matches a variation, use a distinct parent SKU
            parent_sku_clean = normalize_sku(parent_sku)
            variation_skus = set()
            for vr in variant_rows:
                vs = normalize_sku(vr.get('Variant SKU', ''))
                if vs:
                    variation_skus.add(vs)
            if parent_sku_clean in variation_skus:
                # Parent needs a distinct SKU. Use handle-based.
                parent_sku_clean = f'{parent_sku_clean}-parent'
                stats['sku_deduped'] += 1
            if not parent_sku_clean:
                auto_sku_counter += 1
                parent_sku_clean = f'HMH-VAR-{auto_sku_counter:04d}'
                stats['sku_generated'] += 1
            all_skus_used.add(parent_sku_clean)

            parent['SKU'] = parent_sku_clean
            parent['Name'] = title
            parent['Published'] = '1'
            parent['Is featured?'] = '0'
            parent['Visibility in catalog'] = 'visible'
            parent['Short description'] = short_desc
            parent['Description'] = description
            parent['Tax status'] = 'taxable'
            parent['In stock?'] = '1'
            parent['Backorders allowed?'] = '0'
            parent['Allow customer reviews?'] = '1'
            parent['Categories'] = category
            parent['Tags'] = tags
            parent['Images'] = image_src
            parent['Brands'] = vendor
            # Parent variable product lists ALL possible attribute values
            parent['Attribute 1 name'] = 'Size'
            parent['Attribute 1 value(s)'] = ' | '.join(all_values)
            parent['Attribute 1 visible'] = '1'
            parent['Attribute 1 global'] = '1'
            parent['Attribute 1 default'] = default_value

            output_rows.append(parent)
            stats['variable'] += 1
            stats['total_rows'] += 1
            if description:
                stats['with_description'] += 1
            if image_src:
                stats['with_image'] += 1
            if parent['SKU']:
                stats['with_sku'] += 1

            # ── Variation rows ──
            for i, vr in enumerate(variant_rows):
                opt_val = vr.get('Option1 Value', '').strip()
                if not opt_val or opt_val.lower() == 'default':
                    opt_val = all_values[0] if all_values else 'Default'

                var_row = build_woo_row()
                var_row['Type'] = 'variation'

                # SKU - ensure unique
                var_sku = normalize_sku(vr.get('Variant SKU', ''))
                if not var_sku:
                    auto_sku_counter += 1
                    var_sku = f'HMH-V-{auto_sku_counter:04d}'
                    stats['sku_generated'] += 1
                if var_sku in all_skus_used:
                    var_sku = f'{var_sku}-v{i+1}'
                    stats['sku_deduped'] += 1
                all_skus_used.add(var_sku)

                var_row['SKU'] = var_sku
                var_row['Name'] = f"{title} - {opt_val}"
                var_row['Published'] = '1'
                var_row['Visibility in catalog'] = 'visible'
                var_row['Tax status'] = 'taxable'
                var_row['In stock?'] = '1'

                # Price
                price = vr.get('Variant Price', '').strip()
                if not price:
                    # Try parent price
                    price = parent_row.get('Variant Price', '').strip()
                    if price:
                        stats['price_recovered'] += 1
                # Fallback to POS
                original_var_sku = normalize_sku(vr.get('Variant SKU', ''))
                if not price and original_var_sku in pos_by_sku:
                    pos_price = pos_by_sku[var_sku].get('Price', '').strip()
                    if pos_price:
                        price = pos_price
                        stats['price_recovered'] += 1

                var_row['Regular price'] = price

                # Parent reference = parent SKU (the deduplicated one)
                var_row['Parent'] = parent_sku_clean

                # Weight
                weight_grams = vr.get('Variant Grams', '').strip()
                var_row['Weight (lbs)'] = grams_to_lbs(weight_grams)

                # Variation image
                var_img = vr.get('Image Src', '').strip()
                if var_img:
                    var_row['Images'] = var_img

                # Single attribute value for this variation
                var_row['Attribute 1 name'] = 'Size'
                var_row['Attribute 1 value(s)'] = opt_val
                var_row['Attribute 1 visible'] = '1'
                var_row['Attribute 1 global'] = '1'

                output_rows.append(var_row)
                stats['variation'] += 1
                stats['total_rows'] += 1
                if price:
                    stats['with_price'] += 1
                if var_row['SKU']:
                    stats['with_sku'] += 1

    # ── Write output ──
    print(f"\n💾 Writing {len(output_rows)} rows to {OUTPUT}...")

    with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=WOO_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(output_rows)

    # ── Report ──
    print("\n" + "=" * 60)
    print("📊 IMPORT CSV REPORT")
    print("=" * 60)
    print(f"  Total rows:       {stats['total_rows']}")
    print(f"  Simple products:  {stats['simple']}")
    print(f"  Variable parents: {stats['variable']}")
    print(f"  Variations:       {stats['variation']}")
    print(f"  ─────────────────────────────")
    print(f"  Unique products:  {stats['simple'] + stats['variable']}")
    print(f"  ─────────────────────────────")
    print(f"  With price:       {stats['with_price']}/{stats['total_rows']}")
    print(f"  With description: {stats['with_description']}/{stats['simple'] + stats['variable']}")
    print(f"  With image:       {stats['with_image']}/{stats['simple'] + stats['variable']}")
    print(f"  With SKU:         {stats['with_sku']}/{stats['total_rows']}")
    print(f"  Prices recovered: {stats['price_recovered']}")
    print(f"  SKUs generated:   {stats['sku_generated']}")
    print(f"  SKUs deduplicated: {stats['sku_deduped']}")
    print(f"\n✅ Output: {OUTPUT}")
    print(f"   File size: {os.path.getsize(OUTPUT) / 1024 / 1024:.1f} MB")


if __name__ == '__main__':
    main()
