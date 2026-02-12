#!/usr/bin/env python3
"""
Set backorder status based on inventory presence.

Logic:
- In POS inventory with stock > 0: Published, In Stock
- In POS inventory with stock = 0: Published, Allow Backorders
- NOT in POS inventory: Draft (presale/special order)
"""

import pandas as pd
import re
from typing import Optional, Dict
from difflib import SequenceMatcher

# Load POS inventory
POS_INVENTORY_FILE = 'CSVs/HMoonHydro_Inventory.csv'
INPUT_CSV = 'outputs/woocommerce_WEIGHTED.csv'
OUTPUT_CSV = 'outputs/woocommerce_BACKORDER.csv'


def normalize_for_matching(text: str) -> str:
    """Normalize text for fuzzy matching."""
    text = str(text).lower()
    # Remove common noise
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    # Remove units for matching
    text = re.sub(r'\b\d+\s*(ml|l|lt|gal|qt|oz|lb|kg|g|ft|cf)\b', '', text)
    return text.strip()


def build_pos_index(df: pd.DataFrame) -> Dict[str, list]:
    """Build searchable index of POS inventory."""
    index = {}
    
    for idx, row in df.iterrows():
        # POS CSV uses 'Item Name' column
        name = str(row.get('Item Name', row.get('Item', row.get('Name', ''))))
        words = normalize_for_matching(name).split()[:3]
        key = ' '.join(words)
        
        if key not in index:
            index[key] = []
        index[key].append(idx)
    
    return index


def find_in_pos(
    product_name: str,
    sku: str,
    pos_df: pd.DataFrame,
    pos_index: Dict[str, list]
) -> Optional[Dict]:
    """Find product in POS inventory."""
    # Try SKU match first (POS uses 'Item Number' column)
    if sku and str(sku) != 'nan':
        sku_matches = pos_df[pos_df['Item Number'].astype(str).str.lower() == str(sku).lower()]
        if len(sku_matches):
            row = sku_matches.iloc[0]
            # POS uses 'Qty 1' for stock quantity
            qty = int(row.get('Qty 1', 0) or 0)
            return {
                'matched': True,
                'qty': qty,
                'match_type': 'sku'
            }
    
    # Try name matching
    norm_name = normalize_for_matching(product_name)
    words = norm_name.split()[:3]
    key = ' '.join(words)
    
    candidates = pos_index.get(key, [])
    
    if not candidates:
        # Try partial keys
        for idx_key, indices in pos_index.items():
            if idx_key.startswith(words[0] if words else ''):
                candidates.extend(indices)
    
    best_match = None
    best_ratio = 0.0
    
    for idx in candidates:
        if idx >= len(pos_df):
            continue
        row = pos_df.iloc[idx]
        # POS uses 'Item Name' column
        pos_name = normalize_for_matching(str(row.get('Item Name', row.get('Item', row.get('Name', '')))))
        
        ratio = SequenceMatcher(None, norm_name, pos_name).ratio()
        if ratio > best_ratio and ratio > 0.7:
            best_ratio = ratio
            best_match = row
    
    if best_match is not None:
        # POS uses 'Qty 1' for stock quantity
        qty = int(best_match.get('Qty 1', 0) or 0)
        return {
            'matched': True,
            'qty': qty,
            'match_type': f'fuzzy ({best_ratio:.2f})'
        }
    
    return {'matched': False, 'qty': 0, 'match_type': 'none'}


def process_backorder_status(input_csv: str, pos_csv: str, output_csv: str):
    """Set backorder status for all products."""
    print(f"Loading {input_csv}...")
    df = pd.read_csv(input_csv)
    print(f"Loaded {len(df)} products")
    
    print(f"\nLoading POS inventory from {pos_csv}...")
    pos_df = pd.read_csv(pos_csv)
    pos_index = build_pos_index(pos_df)
    print(f"Indexed {len(pos_df)} POS items")
    
    stats = {
        'in_stock': 0,
        'backorder': 0,
        'presale': 0,
        'variation_skipped': 0,
    }
    
    # Process each product
    backorder_status = []
    stock_status = []
    
    for _, row in df.iterrows():
        # Skip variations (inherit from parent)
        if row.get('Type') == 'variation':
            backorder_status.append('')
            stock_status.append('')
            stats['variation_skipped'] += 1
            continue
        
        name = str(row.get('Name', ''))
        sku = str(row.get('SKU', ''))
        
        result = find_in_pos(name, sku, pos_df, pos_index)
        
        if result['matched']:
            if result['qty'] > 0:
                # In stock
                backorder_status.append('notify')  # Notify but allow
                stock_status.append('instock')
                stats['in_stock'] += 1
            else:
                # Out of stock but in POS - allow backorders
                backorder_status.append('notify')
                stock_status.append('onbackorder')
                stats['backorder'] += 1
        else:
            # Not in POS - presale/special order
            backorder_status.append('no')  # Don't allow backorders
            stock_status.append('outofstock')
            stats['presale'] += 1
    
    # Update dataframe
    df['Backorders allowed?'] = backorder_status
    df['Stock status'] = stock_status
    
    # Set Published status based on stock
    published = []
    for _, row in df.iterrows():
        if row.get('Type') == 'variation':
            published.append('')
        elif row.get('Stock status') in ('instock', 'onbackorder'):
            published.append(1)
        else:
            published.append(0)  # Draft for presale
    
    df['Published'] = published
    
    # Add tags for presale items
    for idx, row in df.iterrows():
        if row.get('Stock status') == 'outofstock' and row.get('Type') != 'variation':
            existing_tags = str(row.get('Tags', ''))
            if existing_tags and existing_tags != 'nan':
                if 'special-order' not in existing_tags:
                    df.at[idx, 'Tags'] = f"{existing_tags}, special-order, contact-to-order"
            else:
                df.at[idx, 'Tags'] = 'special-order, contact-to-order'
    
    print(f"\nWriting {output_csv}...")
    df.to_csv(output_csv, index=False)
    
    print("\n" + "=" * 60)
    print("BACKORDER STATUS COMPLETE")
    print("=" * 60)
    print(f"In Stock:     {stats['in_stock']:,} (Published, stock available)")
    print(f"Backorder:    {stats['backorder']:,} (Published, notify when back)")
    print(f"Presale:      {stats['presale']:,} (Draft, special order)")
    print(f"Variations:   {stats['variation_skipped']:,} (inherit from parent)")
    print(f"\nTotal:        {len(df):,}")
    
    print("\n📋 WOOCOMMERCE SETTINGS:")
    print("1. Go to WooCommerce > Settings > Products > Inventory")
    print("2. Enable 'Manage stock'")
    print("3. Set 'Out of Stock Visibility': Show")
    print("4. Set 'Notifications': Admin + Customer")
    
    return df


if __name__ == '__main__':
    process_backorder_status(INPUT_CSV, POS_INVENTORY_FILE, OUTPUT_CSV)
