#!/usr/bin/env python3
"""
Rebuild import file with:
1. Original WooCommerce categories (74 hierarchical paths)
2. Fixed Parent column (SKU instead of handle)
3. Proper variable/variation linking
"""

import pandas as pd
import re
from difflib import SequenceMatcher

# Files
ORIGINAL_WOO = 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv'
CURRENT_IMPORT = 'outputs/woocommerce_IMPORT_READY.csv'
OUTPUT_FILE = 'outputs/woocommerce_REBUILT.csv'


def normalize_name(name):
    """Normalize product name for matching."""
    name = str(name).lower()
    name = re.sub(r'[^\w\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def find_original_category(product_name, product_sku, orig_df):
    """Find the original category for a product."""
    name_norm = normalize_name(product_name)
    
    # Try SKU match first
    if product_sku and str(product_sku) != 'nan':
        sku_match = orig_df[orig_df['Sku'].astype(str).str.lower() == str(product_sku).lower()]
        if len(sku_match) and pd.notna(sku_match.iloc[0]['Product categories']):
            return sku_match.iloc[0]['Product categories']
    
    # Try name match - use vectorized operation for speed
    orig_df_copy = orig_df.copy()
    orig_df_copy['name_norm'] = orig_df_copy['Product Name'].apply(lambda x: normalize_name(str(x))[:50])
    
    for _, row in orig_df_copy.iterrows():
        orig_name = row['name_norm']
        ratio = SequenceMatcher(None, name_norm[:50], orig_name).ratio()
        if ratio > 0.75:
            if pd.notna(row.get('Product categories')):
                return row['Product categories']
    
    return None


def fix_parent_column(df):
    """Fix Parent column to use SKU instead of handle."""
    # Build handle -> SKU mapping from variable products
    handle_to_sku = {}
    
    for _, row in df[df['Type'] == 'variable'].iterrows():
        handle = str(row.get('Handle', row.get('Slug', ''))).lower().strip()
        sku = row.get('SKU', '')
        if handle and sku:
            handle_to_sku[handle] = sku
    
    print(f"Built handle->SKU mapping for {len(handle_to_sku)} variable products")
    
    # Fix Parent column in variations
    fixed_count = 0
    for idx, row in df.iterrows():
        if row['Type'] == 'variation':
            parent_handle = str(row.get('Parent', '')).lower().strip()
            if parent_handle in handle_to_sku:
                df.at[idx, 'Parent'] = handle_to_sku[parent_handle]
                fixed_count += 1
    
    print(f"Fixed {fixed_count} variation Parent values")
    return df


def rebuild_import():
    """Main rebuild function."""
    print("=" * 60)
    print("REBUILDING IMPORT FILE")
    print("=" * 60)
    
    # Load files
    print("\nLoading original WooCommerce export...")
    # Use error_bad_lines=False for older pandas, on_bad_lines='skip' for newer
    try:
        orig = pd.read_csv(ORIGINAL_WOO, on_bad_lines='skip', encoding='utf-8', low_memory=False)
    except:
        orig = pd.read_csv(ORIGINAL_WOO, error_bad_lines=False, encoding='utf-8', low_memory=False)
    print(f"  {len(orig)} products, {orig['Product categories'].notna().sum()} have categories")
    
    print("\nLoading current import file...")
    df = pd.read_csv(CURRENT_IMPORT)
    print(f"  {len(df)} rows")
    
    # Step 1: Restore original categories
    print("\n--- RESTORING ORIGINAL CATEGORIES ---")
    categories_restored = 0
    categories_kept = 0
    
    for idx, row in df.iterrows():
        if row['Type'] == 'variation':
            continue  # Variations inherit from parent
        
        orig_cat = find_original_category(row['Name'], row['SKU'], orig)
        
        if orig_cat:
            # Convert pipe-delimited to comma-delimited and fix HTML entities
            orig_cat = orig_cat.replace('|', ', ').replace('&amp;', '&')
            df.at[idx, 'Categories'] = orig_cat
            categories_restored += 1
        else:
            categories_kept += 1
    
    print(f"  Restored original categories: {categories_restored}")
    print(f"  Kept enriched categories: {categories_kept}")
    
    # Step 2: Fix Parent column
    print("\n--- FIXING PARENT COLUMN ---")
    df = fix_parent_column(df)
    
    # Step 3: Verify structure
    print("\n--- FINAL STRUCTURE ---")
    print(f"  variable (parents): {len(df[df['Type']=='variable'])}")
    print(f"  variation (children): {len(df[df['Type']=='variation'])}")
    print(f"  simple: {len(df[df['Type']=='simple'])}")
    
    # Count unique categories
    all_cats = set()
    for cats in df[df['Type'] != 'variation']['Categories'].dropna():
        for cat in str(cats).split(','):
            all_cats.add(cat.strip())
    print(f"  Unique categories: {len(all_cats)}")
    
    # Save
    print(f"\nSaving to {OUTPUT_FILE}...")
    df.to_csv(OUTPUT_FILE, index=False)
    
    print("\n" + "=" * 60)
    print("✅ REBUILD COMPLETE")
    print("=" * 60)
    print(f"Output: {OUTPUT_FILE}")
    
    # Show sample categories
    print("\nSample restored categories:")
    samples = df[df['Categories'].str.contains('>', na=False)]['Categories'].head(10)
    for cat in samples:
        print(f"  {cat[:70]}")
    
    return df


if __name__ == '__main__':
    rebuild_import()
