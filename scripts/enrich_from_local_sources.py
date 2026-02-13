#!/usr/bin/env python3
"""
Comprehensive WooCommerce Enrichment from Local Data
====================================================
Enriches WooCommerce import with:
- POS inventory data (UPC, manufacturer, vendor, descriptions)
- Master category files (curated product data)
- Existing alignment data

This creates a master hydroponics product database locally.

Run: python scripts/enrich_from_local_sources.py
"""

import pandas as pd
import re
from pathlib import Path
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

WOO_IMPORT = "outputs/woocommerce_FINAL_IMPORT_20260212.csv"
POS_ALIGNMENT = "outputs/inventory/pos_shopify_alignment.csv"
POS_INVENTORY = "CSVs/HMoonHydro_Inventory.csv"
MASTER_CATALOG = "CSVs/master_catalog_index.csv"
OUTPUT_FILE = "outputs/woocommerce_fully_enriched.csv"

# ============================================================================
# LOAD DATA SOURCES
# ============================================================================

def load_all_sources():
    """Load all local data sources."""
    print("Loading data sources...")
    
    data = {}
    
    # WooCommerce import
    data['woo'] = pd.read_csv(WOO_IMPORT, low_memory=False)
    print(f"  WooCommerce import: {len(data['woo'])} rows")
    
    # POS alignment (SKU -> POS Item Number mapping)
    data['pos_align'] = pd.read_csv(POS_ALIGNMENT, low_memory=False)
    print(f"  POS alignment: {len(data['pos_align'])} rows")
    
    # Full POS inventory
    data['pos_full'] = pd.read_csv(POS_INVENTORY, low_memory=False)
    print(f"  POS inventory: {len(data['pos_full'])} rows")
    
    # Master catalog
    try:
        data['master'] = pd.read_csv(MASTER_CATALOG, low_memory=False)
        print(f"  Master catalog: {len(data['master'])} rows")
    except:
        data['master'] = pd.DataFrame()
        print("  Master catalog: not found")
    
    # Load all master_* files for category-specific data
    master_cats = {}
    for f in Path('CSVs').glob('master_*.csv'):
        if f.stem != 'master_catalog_index':
            try:
                master_cats[f.stem] = pd.read_csv(f, low_memory=False)
            except:
                pass
    data['master_cats'] = master_cats
    print(f"  Master category files: {len(master_cats)}")
    
    return data


# ============================================================================
# BUILD LOOKUP TABLES
# ============================================================================

def build_lookups(data):
    """Build lookup dictionaries for fast enrichment."""
    print("\nBuilding lookup tables...")
    
    lookups = {}
    
    # SKU -> POS Item Number (from alignment)
    high_conf = data['pos_align'][data['pos_align']['Confidence'] == 'auto-high']
    lookups['sku_to_pos_item'] = {}
    for _, row in high_conf.iterrows():
        sku = str(row.get('Variant SKU', '')).strip()
        pos_item = str(row.get('POS Item Number', '')).strip()
        if sku and pos_item and pos_item != 'nan':
            lookups['sku_to_pos_item'][sku] = pos_item
    print(f"  SKU -> POS Item: {len(lookups['sku_to_pos_item'])} mappings")
    
    # POS Item Number -> Full POS data
    lookups['pos_item_data'] = {}
    for _, row in data['pos_full'].iterrows():
        item_num = str(row['Item Number']).strip()
        if item_num and item_num != 'nan':
            lookups['pos_item_data'][item_num] = row.to_dict()
    print(f"  POS Item -> Data: {len(lookups['pos_item_data'])} items")
    
    # SKU -> Master catalog data
    lookups['sku_to_master'] = {}
    if not data['master'].empty:
        for _, row in data['master'].iterrows():
            sku = str(row.get('sku', '')).strip()
            if sku:
                lookups['sku_to_master'][sku] = row.to_dict()
    print(f"  SKU -> Master: {len(lookups['sku_to_master'])} items")
    
    return lookups


# ============================================================================
# ENRICHMENT FUNCTIONS
# ============================================================================

def clean_upc(upc):
    """Clean and validate UPC code."""
    if pd.isna(upc) or upc == '':
        return ''
    
    # Convert scientific notation
    try:
        upc_num = float(upc)
        upc_str = str(int(upc_num))
    except:
        upc_str = str(upc)
    
    # Clean
    upc_str = re.sub(r'[^0-9]', '', upc_str)
    
    # Validate length (UPC-A is 12 digits, EAN-13 is 13)
    if len(upc_str) in [12, 13, 14]:
        return upc_str
    elif len(upc_str) > 14:
        return upc_str[:14]  # Truncate
    
    return upc_str if upc_str else ''


def normalize_manufacturer(mfr):
    """Normalize manufacturer name."""
    if pd.isna(mfr) or mfr == '':
        return ''
    
    mfr = str(mfr).strip()
    
    # Common normalizations
    normalizations = {
        'GH': 'General Hydroponics',
        'AN': 'Advanced Nutrients',
        'FF': 'FoxFarm',
        'Adv Nutrients': 'Advanced Nutrients',
        'Gen Hydro': 'General Hydroponics',
        'AC Infinity Inc': 'AC Infinity',
        'Sunlight Supply': 'Sunlight Supply',
        'Hawthorne Hydoponics': 'Hawthorne',
        'Hawthorne Hydroponics LLC': 'Hawthorne',
    }
    
    if mfr in normalizations:
        return normalizations[mfr]
    
    return mfr


def enrich_product(row, lookups, stats):
    """Enrich a single product row with all available data."""
    sku = str(row.get('SKU', '')).strip()
    enriched = row.copy()
    
    # Get POS data if available
    pos_item = lookups['sku_to_pos_item'].get(sku)
    pos_data = lookups['pos_item_data'].get(pos_item) if pos_item else None
    
    # Get master catalog data
    master_data = lookups['sku_to_master'].get(sku)
    
    if pos_data:
        # --- UPC Code ---
        if 'UPC' not in enriched or pd.isna(enriched.get('UPC')) or enriched.get('UPC') == '':
            upc = clean_upc(pos_data.get('UPC'))
            if upc:
                enriched['UPC'] = upc
                stats['upc'] += 1
        
        # --- Manufacturer (update Brand if better) ---
        mfr = normalize_manufacturer(pos_data.get('Manufacturer'))
        current_brand = str(enriched.get('Brand', '')).strip()
        if mfr and (not current_brand or current_brand in ['H-Moon Hydro', 'Generic', '']):
            enriched['Brand'] = mfr
            stats['manufacturer'] += 1
        
        # --- Vendor (for internal tracking) ---
        vendor = pos_data.get('Vendor Name')
        if pd.notna(vendor) and vendor:
            enriched['Vendor'] = vendor
            stats['vendor'] += 1
        
        # --- Description (if better than current) ---
        pos_desc = pos_data.get('Item Description')
        current_desc = str(enriched.get('Description', '')).strip()
        if pd.notna(pos_desc) and len(str(pos_desc)) > len(current_desc):
            enriched['Description'] = pos_desc
            stats['description'] += 1
        
        # --- Cost (internal) ---
        cost = pos_data.get('Order Cost')
        if pd.notna(cost) and cost > 0:
            enriched['Cost'] = cost
            stats['cost'] += 1
        
        # --- POS Stock levels ---
        total_qty = 0
        for i in range(1, 21):
            qty_col = f'Qty {i}'
            if qty_col in pos_data:
                qty = pos_data.get(qty_col, 0)
                if pd.notna(qty) and qty > 0:
                    total_qty += qty
        if total_qty > 0:
            enriched['POS Qty'] = total_qty
            stats['stock'] += 1
    
    if master_data:
        # --- Tags from master catalog ---
        tags = master_data.get('tags')
        if pd.notna(tags) and tags:
            current_tags = str(enriched.get('Tags', '')).strip()
            if current_tags:
                enriched['Tags'] = f"{current_tags}, {tags}"
            else:
                enriched['Tags'] = tags
            stats['tags'] += 1
    
    return enriched


# ============================================================================
# MAIN ENRICHMENT
# ============================================================================

def run_enrichment(data, lookups):
    """Run full enrichment on WooCommerce import."""
    print("\nEnriching products...")
    
    woo = data['woo'].copy()
    
    # Ensure new columns exist
    new_cols = ['UPC', 'Vendor', 'Cost', 'POS Qty']
    for col in new_cols:
        if col not in woo.columns:
            woo[col] = ''
    
    stats = {
        'upc': 0,
        'manufacturer': 0,
        'vendor': 0,
        'description': 0,
        'cost': 0,
        'stock': 0,
        'tags': 0,
    }
    
    # Process each row
    enriched_rows = []
    for idx, row in woo.iterrows():
        enriched = enrich_product(row, lookups, stats)
        enriched_rows.append(enriched)
    
    enriched_df = pd.DataFrame(enriched_rows)
    
    print("\nEnrichment Results:")
    print("-" * 50)
    for key, count in stats.items():
        print(f"  {key:15}: {count} products enriched")
    
    return enriched_df


# ============================================================================
# QUALITY REPORT
# ============================================================================

def generate_quality_report(df):
    """Generate comprehensive quality report."""
    print("\n" + "=" * 70)
    print("FINAL DATA QUALITY REPORT")
    print("=" * 70)
    print()
    
    total = len(df)
    
    # Key metrics
    metrics = {
        'Brand': (df['Brand'].notna() & (df['Brand'] != '')).sum(),
        'UPC': (df['UPC'].notna() & (df['UPC'] != '')).sum() if 'UPC' in df.columns else 0,
        'Categories': (df['Categories'].notna() & (df['Categories'] != '')).sum(),
        'Description': (df['Description'].notna() & (df['Description'] != '')).sum(),
        'Short description': (df['Short description'].notna() & (df['Short description'] != '')).sum(),
        'Images': (df['Images'].notna() & (df['Images'] != '')).sum(),
        'Weight (oz)': (df['Weight (oz)'].notna() & (df['Weight (oz)'] != '')).sum(),
        'Vendor': (df['Vendor'].notna() & (df['Vendor'] != '')).sum() if 'Vendor' in df.columns else 0,
        'Cost': (df['Cost'].notna() & (df['Cost'] != '') & (df['Cost'] != 0)).sum() if 'Cost' in df.columns else 0,
    }
    
    print("DATA COMPLETENESS:")
    print("-" * 50)
    for field, count in metrics.items():
        pct = count / total * 100
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        status = "✓" if pct >= 95 else "◌" if pct >= 80 else "✗"
        print(f"  {field:20} {bar} {count:4}/{total} ({pct:5.1f}%) {status}")
    
    print()
    
    # Product type breakdown
    print("PRODUCT TYPE BREAKDOWN:")
    print("-" * 50)
    for ptype in ['variable', 'variation', 'simple']:
        subset = df[df['Type'] == ptype]
        published = (subset['Published'] == 1).sum()
        print(f"  {ptype:12}: {len(subset):4} total, {published:4} published")
    
    print()
    
    # Calculate overall score
    key_fields = ['Brand', 'Categories', 'Description', 'Images', 'Weight (oz)']
    scores = [metrics[f] / total for f in key_fields]
    overall = sum(scores) / len(scores) * 100
    print(f"OVERALL QUALITY SCORE: {overall:.1f}%")


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 70)
    print("COMPREHENSIVE LOCAL DATA ENRICHMENT")
    print("=" * 70)
    print()
    
    # Load all data
    data = load_all_sources()
    
    # Build lookups
    lookups = build_lookups(data)
    
    # Run enrichment
    enriched_df = run_enrichment(data, lookups)
    
    # Save enriched file
    print(f"\nSaving: {OUTPUT_FILE}")
    enriched_df.to_csv(OUTPUT_FILE, index=False)
    
    # Generate report
    generate_quality_report(enriched_df)
    
    # Create timestamped production file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    prod_file = f"outputs/woocommerce_MASTER_IMPORT_{timestamp}.csv"
    enriched_df.to_csv(prod_file, index=False)
    print(f"\nProduction file: {prod_file}")
    
    print("\n" + "=" * 70)
    print("ENRICHMENT COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
