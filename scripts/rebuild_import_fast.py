#!/usr/bin/env python3
"""
Fast rebuild: Fix Parent column and restore categories.
"""

import pandas as pd
import re

# Files
ORIGINAL_WOO = 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv'
CURRENT_IMPORT = 'outputs/woocommerce_IMPORT_READY.csv'
OUTPUT_FILE = 'outputs/woocommerce_REBUILT.csv'


def normalize_sku(sku):
    """Normalize SKU for matching."""
    return str(sku).lower().strip() if pd.notna(sku) and str(sku) != 'nan' else ''


def normalize_name(name):
    """Normalize name for matching."""
    name = str(name).lower()
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:100]  # First 100 chars for matching


def rebuild_import():
    """Main rebuild function."""
    print("=" * 60)
    print("FAST REBUILD")
    print("=" * 60)
    
    # Load original WooCommerce
    print("\nLoading original WooCommerce export...")
    orig = pd.read_csv(ORIGINAL_WOO, on_bad_lines='skip', low_memory=False)
    print(f"  {len(orig)} products")
    
    # Build lookup dictionaries
    print("Building lookup indexes...")
    sku_to_cat = {}
    name_to_cat = {}
    
    for _, row in orig.iterrows():
        cat = row.get('Product categories')
        if pd.notna(cat):
            # Index by SKU
            sku = normalize_sku(row.get('Sku'))
            if sku:
                sku_to_cat[sku] = cat
            
            # Index by normalized name
            name = normalize_name(row.get('Product Name', ''))
            if name:
                name_to_cat[name] = cat
    
    print(f"  {len(sku_to_cat)} SKU mappings")
    print(f"  {len(name_to_cat)} name mappings")
    
    # Load current import
    print("\nLoading current import file...")
    df = pd.read_csv(CURRENT_IMPORT)
    print(f"  {len(df)} rows")
    
    # Step 1: Fix Parent column (handles -> SKUs)
    print("\n--- FIXING PARENT COLUMN ---")
    
    # Build handle -> SKU lookup from variable products
    handle_to_sku = {}
    slug_col = 'Handle' if 'Handle' in df.columns else 'Slug'
    
    for _, row in df[df['Type'] == 'variable'].iterrows():
        handle = str(row.get(slug_col, '')).lower().strip()
        sku = row.get('SKU', '')
        if handle and sku:
            handle_to_sku[handle] = sku
    
    print(f"  {len(handle_to_sku)} handle->SKU mappings")
    
    # Update Parent column
    fixed_parents = 0
    for idx, row in df.iterrows():
        if row['Type'] == 'variation':
            parent_handle = str(row.get('Parent', '')).lower().strip()
            if parent_handle in handle_to_sku:
                df.at[idx, 'Parent'] = handle_to_sku[parent_handle]
                fixed_parents += 1
    
    print(f"  Fixed {fixed_parents} variation Parent values")
    
    # Step 2: Restore original categories where possible
    print("\n--- RESTORING ORIGINAL CATEGORIES ---")
    
    restored = 0
    kept = 0
    
    for idx, row in df.iterrows():
        if row['Type'] == 'variation':
            continue  # Skip variations
        
        sku = normalize_sku(row.get('SKU'))
        name = normalize_name(row.get('Name', ''))
        
        # Try SKU match
        if sku in sku_to_cat:
            cat = sku_to_cat[sku]
            # Convert pipe to comma, fix HTML entities
            cat = cat.replace('|', ', ').replace('&amp;', '&')
            df.at[idx, 'Categories'] = cat
            restored += 1
        # Try name match  
        elif name in name_to_cat:
            cat = name_to_cat[name]
            cat = cat.replace('|', ', ').replace('&amp;', '&')
            df.at[idx, 'Categories'] = cat
            restored += 1
        else:
            kept += 1
    
    print(f"  Restored: {restored}")
    print(f"  Kept existing: {kept}")
    
    # Step 3: Summary
    print("\n--- FINAL STRUCTURE ---")
    print(f"  variable: {len(df[df['Type']=='variable'])}")
    print(f"  variation: {len(df[df['Type']=='variation'])}")
    print(f"  simple: {len(df[df['Type']=='simple'])}")
    
    # Verify Parent column fix
    variations_with_sku_parent = df[
        (df['Type'] == 'variation') & 
        (df['Parent'].str.startswith('hmh', na=False))
    ]
    print(f"  Variations with SKU parent: {len(variations_with_sku_parent)}")
    
    # Save
    print(f"\nSaving to {OUTPUT_FILE}...")
    df.to_csv(OUTPUT_FILE, index=False)
    
    print("\n" + "=" * 60)
    print("✅ REBUILD COMPLETE")
    print("=" * 60)
    print(f"Output: {OUTPUT_FILE}")
    
    # Show sample
    print("\nSample restored categories:")
    samples = df[df['Categories'].str.contains('>', na=False)]['Categories'].head(10)
    for cat in samples:
        print(f"  {str(cat)[:70]}")
    
    print("\nSample Parent values (should be SKUs now):")
    print(df[df['Type']=='variation']['Parent'].head(10).tolist())
    
    return df


if __name__ == '__main__':
    rebuild_import()
