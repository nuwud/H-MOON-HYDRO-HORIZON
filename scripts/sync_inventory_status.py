#!/usr/bin/env python3
"""
Sync WooCommerce catalog with POS inventory.
- Products IN inventory with stock → Published
- Products IN inventory with 0 stock → Draft (backorder available)
- Products NOT in inventory → Draft (special order/presale)

Also standardizes sizes based on documented product lines.
"""

import pandas as pd
import re
from difflib import SequenceMatcher
from typing import Optional, Tuple

# ============================================================================
# ADVANCED NUTRIENTS SIZE TIERS (from feed charts and commercial resources)
# ============================================================================
AN_SIZE_TIERS = {
    'hobby': ['250ml', '500ml', '1L', '4L'],
    'commercial': ['10L', '23L'],
    'bulk': ['57L', '208L', '1000L'],  # 15gal drum, 55gal drum, IBC tote
}

# Standard size normalization map
SIZE_NORMALIZE = {
    # Liters
    '250 ml': '250ml', '250ml': '250ml', '250 ML': '250ml',
    '500 ml': '500ml', '500ml': '500ml', '500 ML': '500ml',
    '1 lt': '1L', '1 liter': '1L', '1 l': '1L', '1 Lt': '1L', '1Lt': '1L',
    '1 Liter': '1L', '1l': '1L', '1 L': '1L',
    '4 lt': '4L', '4 liter': '4L', '4 l': '4L', '4 Lt': '4L', '4Lt': '4L',
    '4 Liter': '4L', '4l': '4L', '4 L': '4L',
    '10 lt': '10L', '10 liter': '10L', '10 l': '10L', '10 Lt': '10L',
    '10Lt': '10L', '10 Liter': '10L', '10l': '10L', '10 L': '10L',
    '23 lt': '23L', '23 liter': '23L', '23 l': '23L', '23 Lt': '23L',
    '23Lt': '23L', '23 Liter': '23L', '23l': '23L', '23 L': '23L',
    '57 lt': '57L', '57 liter': '57L', '57l': '57L',
    '208 lt': '208L', '208 liter': '208L', '208l': '208L',
    # Gallons
    '1 gal': '1 Gallon', '1 gallon': '1 Gallon', '1gal': '1 Gallon',
    '1 Gal': '1 Gallon', '1Gal': '1 Gallon',
    '2.5 gal': '2.5 Gallon', '2.5 gallon': '2.5 Gallon',
    '5 gal': '5 Gallon', '5 gallon': '5 Gallon', '5gal': '5 Gallon',
    '5 Gal': '5 Gallon', '5Gal': '5 Gallon',
    '15 gal': '15 Gallon', '15 gallon': '15 Gallon',  # = 57L
    '55 gal': '55 Gallon', '55 gallon': '55 Gallon',  # = 208L drum
    # Quarts/Pints
    '1 qt': '1 Quart', '1 quart': '1 Quart', '1qt': '1 Quart',
    '1 Qt': '1 Quart', '1Qt': '1 Quart', 'qt': '1 Quart',
    '1 pt': '1 Pint', '1 pint': '1 Pint', '1pt': '1 Pint',
    # Ounces
    '8 oz': '8oz', '8oz': '8oz', '8 Oz': '8oz',
    '16 oz': '16oz', '16oz': '16oz', '16 Oz': '16oz',
    '32 oz': '32oz', '32oz': '32oz', '32 Oz': '32oz',
    # Grams/KG (for powders)
    '130 g': '130g', '130g': '130g', '130 G': '130g',
    '250 g': '250g', '250g': '250g', '250 G': '250g',
    '500 g': '500g', '500g': '500g', '500 G': '500g',
    '1 kg': '1kg', '1 KG': '1kg', '1KG': '1kg',
    '2.5 kg': '2.5kg', '2.5KG': '2.5kg',
    '5 kg': '5kg', '5KG': '5kg',
    '10 kg': '10kg', '10KG': '10kg',
    '23 kg': '23kg', '23KG': '23kg',
}

def normalize_size(size_str: str) -> str:
    """Normalize size string to standard format."""
    if not size_str or pd.isna(size_str):
        return ''
    
    size_str = str(size_str).strip()
    
    # Direct lookup
    if size_str in SIZE_NORMALIZE:
        return SIZE_NORMALIZE[size_str]
    
    # Case-insensitive lookup
    for key, val in SIZE_NORMALIZE.items():
        if size_str.lower() == key.lower():
            return val
    
    return size_str


def extract_size_from_name(name: str) -> Optional[str]:
    """Extract size from product name."""
    if not name:
        return None
    
    # Common patterns
    patterns = [
        r'(\d+(?:\.\d+)?)\s*(ml|ML|l|L|lt|Lt|liter|Liter|gal|Gal|gallon|qt|Qt|quart|oz|Oz|kg|KG|g|G)\b',
        r'(\d+)\s*(?:pack|pk|pc|pcs|piece)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            return f"{match.group(1)}{match.group(2)}"
    
    return None


def clean_name_for_matching(name: str) -> str:
    """Clean product name for fuzzy matching."""
    if not name:
        return ''
    
    # Remove size info, normalize
    name = str(name).lower()
    # Remove common size patterns
    name = re.sub(r'\d+(?:\.\d+)?\s*(ml|lt?|liter|gal|gallon|qt|quart|oz|kg|g)\b', '', name, flags=re.IGNORECASE)
    # Remove part numbers, special chars
    name = re.sub(r'\(part[- ]?[ab]\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[^a-z0-9\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    return name


def fuzzy_match_score(name1: str, name2: str) -> float:
    """Calculate similarity score between two product names."""
    clean1 = clean_name_for_matching(name1)
    clean2 = clean_name_for_matching(name2)
    
    if not clean1 or not clean2:
        return 0.0
    
    return SequenceMatcher(None, clean1, clean2).ratio()


def build_inventory_index(inventory_df: pd.DataFrame) -> dict:
    """Build a searchable index of inventory items."""
    index = {}
    for _, row in inventory_df.iterrows():
        inv_name = str(row.get('Item Name', ''))
        clean = clean_name_for_matching(inv_name)
        if clean:
            # Store by first 3 words as key for fast lookup
            words = clean.split()[:3]
            key = ' '.join(words)
            if key not in index:
                index[key] = []
            index[key].append(row)
    return index


def match_to_inventory(product_name: str, inv_index: dict, inventory_df: pd.DataFrame, threshold: float = 0.7) -> Tuple[Optional[pd.Series], float]:
    """Find best inventory match for a product using index."""
    clean_name = clean_name_for_matching(product_name)
    if not clean_name:
        return None, 0.0
    
    # Get candidate keys
    words = clean_name.split()
    candidates = []
    
    # Try different key lengths
    for key_len in range(min(3, len(words)), 0, -1):
        key = ' '.join(words[:key_len])
        if key in inv_index:
            candidates.extend(inv_index[key])
    
    # Also try single word matches for short product names
    for word in words[:2]:
        for key in inv_index:
            if word in key.split():
                candidates.extend(inv_index[key])
    
    # Limit candidates and find best match
    seen = set()
    unique_candidates = []
    for c in candidates:
        name = str(c.get('Item Name', ''))
        if name not in seen:
            seen.add(name)
            unique_candidates.append(c)
    
    best_match = None
    best_score = 0.0
    
    for inv_row in unique_candidates[:50]:  # Limit to 50 candidates
        inv_name = str(inv_row.get('Item Name', ''))
        score = fuzzy_match_score(product_name, inv_name)
        
        if score > best_score and score >= threshold:
            best_score = score
            best_match = inv_row
    
    return best_match, best_score


def sync_catalog_with_inventory(catalog_path: str, inventory_path: str, output_path: str):
    """Main sync function."""
    print(f"Loading catalog: {catalog_path}")
    catalog = pd.read_csv(catalog_path)
    print(f"Loaded {len(catalog)} products")
    
    print(f"\nLoading inventory: {inventory_path}")
    inventory = pd.read_csv(inventory_path)
    print(f"Loaded {len(inventory)} inventory items")
    
    print("Building search index...")
    inv_index = build_inventory_index(inventory)
    print(f"Index built with {len(inv_index)} keys")
    
    # Stats
    stats = {
        'matched_in_stock': 0,
        'matched_no_stock': 0,
        'not_matched': 0,
        'variations_skipped': 0,
    }
    
    print("\nMatching products to inventory...")
    # Process each product
    for idx, row in catalog.iterrows():
        product_type = str(row.get('Type', '')).lower()
        
        # Skip variations (they inherit parent status)
        if product_type == 'variation':
            stats['variations_skipped'] += 1
            continue
        
        name = str(row.get('Name', ''))
        
        # Try to match to inventory
        match, score = match_to_inventory(name, inv_index, inventory, threshold=0.65)
        
        if match is not None:
            qty = match.get('Qty 1', 0)
            if pd.isna(qty):
                qty = 0
            
            if qty > 0:
                catalog.at[idx, 'Published'] = 1
                catalog.at[idx, 'Stock'] = int(qty)
                stats['matched_in_stock'] += 1
            else:
                catalog.at[idx, 'Published'] = 0  # Draft - can backorder
                catalog.at[idx, 'Stock'] = 0
                stats['matched_no_stock'] += 1
            
            # Copy inventory price if available
            inv_price = match.get('Regular Price', 0)
            if inv_price and inv_price > 0:
                catalog.at[idx, 'Regular price'] = inv_price
            
            # Normalize size
            inv_size = match.get('Size', '')
            if inv_size:
                normalized = normalize_size(inv_size)
                if normalized:
                    # Update attribute
                    if 'Attribute 1 value(s)' in catalog.columns:
                        catalog.at[idx, 'Attribute 1 value(s)'] = normalized
        else:
            # Not in inventory - draft/presale
            catalog.at[idx, 'Published'] = 0
            stats['not_matched'] += 1
    
    # Save
    print(f"\nWriting: {output_path}")
    catalog.to_csv(output_path, index=False)
    
    print("\n" + "=" * 60)
    print("INVENTORY SYNC COMPLETE")
    print("=" * 60)
    print(f"Matched (in stock):      {stats['matched_in_stock']}")
    print(f"Matched (no stock):      {stats['matched_no_stock']}")
    print(f"Not in inventory:        {stats['not_matched']} (draft/presale)")
    print(f"Variations (inherited):  {stats['variations_skipped']}")
    print(f"\nOutput: {output_path}")


if __name__ == '__main__':
    sync_catalog_with_inventory(
        catalog_path='outputs/woocommerce_ENRICHED.csv',
        inventory_path='CSVs/HMoonHydro_Inventory.csv',
        output_path='outputs/woocommerce_SYNCED.csv'
    )
