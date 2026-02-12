#!/usr/bin/env python3
"""
Expand product lines with standard size tiers.
Creates draft variants for sizes not in inventory.

Advanced Nutrients example:
- Big Bud in stock: 4L
- Creates draft: 250ml, 500ml, 1L, 10L, 23L (presale/backorder)
"""

import pandas as pd
import re
from typing import List, Dict, Optional
import hashlib

# ============================================================================
# SIZE TIERS BY BRAND/CATEGORY
# ============================================================================

# Advanced Nutrients standard sizes (from feed charts)
AN_SIZES = {
    'hobby': ['250ml', '500ml', '1L', '4L'],
    'commercial': ['10L', '23L'],
    'bulk': ['57L', '208L'],  # Drums
}
AN_ALL_SIZES = ['250ml', '500ml', '1L', '4L', '10L', '23L']

# General Hydroponics sizes
GH_SIZES = ['1 Quart', '1 Gallon', '2.5 Gallon', '6 Gallon']

# Fox Farm sizes
FF_SIZES = ['1 Pint', '1 Quart', '1 Gallon', '5 Gallon']

# Botanicare sizes
BOT_SIZES = ['1 Quart', '1 Gallon', '2.5 Gallon', '5 Gallon']

# Size pricing multipliers (relative to 1L)
SIZE_PRICE_MULTIPLIERS = {
    '250ml': 0.35,
    '500ml': 0.55,
    '1L': 1.0,
    '4L': 3.2,
    '10L': 6.5,
    '23L': 12.0,
    '1 Quart': 1.0,
    '1 Gallon': 3.0,
    '2.5 Gallon': 6.5,
    '5 Gallon': 11.0,
    '6 Gallon': 13.0,
    '1 Pint': 0.5,
}

# Products that should have size variants
AN_PRODUCT_LINES = [
    'Big Bud', 'Bud Candy', 'B-52', 'Overdrive', 'Voodoo Juice', 'Piranha',
    'Tarantula', 'Nirvana', 'Sensizym', 'Bud Ignitor', 'Rhino Skin',
    'CarboLoad', 'Bud Factor X', 'Final Phase', 'Flawless Finish',
    'Connoisseur Grow A', 'Connoisseur Grow B', 'Connoisseur Bloom A', 
    'Connoisseur Bloom B', 'Sensi Grow A', 'Sensi Grow B', 
    'Sensi Bloom A', 'Sensi Bloom B', 'pH Perfect Grow', 'pH Perfect Bloom',
    'pH Perfect Micro', 'Jungle Juice Grow', 'Jungle Juice Bloom',
    'Jungle Juice Micro', 'Ancient Earth', 'Mother Earth Tea Grow',
    'Mother Earth Tea Bloom', 'Revive',
]


def extract_base_product_name(name: str) -> str:
    """Extract base product name without size."""
    # Remove size patterns
    base = re.sub(r'\s*[\(\[]?\d+(?:\.\d+)?\s*(ml|l|lt|liter|gal|gallon|qt|quart|oz|kg|g)[\)\]]?\s*', '', name, flags=re.IGNORECASE)
    # Remove trailing size indicators
    base = re.sub(r'\s*-?\s*(small|medium|large|xl|xxl)\s*$', '', base, flags=re.IGNORECASE)
    # Remove Part A/B indicators for matching
    base = re.sub(r'\s*\(?\s*part[- ]?[ab]\s*\)?\s*', ' ', base, flags=re.IGNORECASE)
    base = re.sub(r'\s+', ' ', base).strip()
    return base


def extract_current_size(name: str, attr_value: str = '') -> Optional[str]:
    """Extract current size from product name or attribute."""
    text = f"{name} {attr_value}".lower()
    
    patterns = [
        (r'(\d+)\s*ml\b', lambda m: f"{m.group(1)}ml"),
        (r'(\d+)\s*l(?:t|iter)?\b', lambda m: f"{m.group(1)}L"),
        (r'(\d+(?:\.\d+)?)\s*gal(?:lon)?\b', lambda m: f"{m.group(1)} Gallon"),
        (r'(\d+)\s*qt\.?\b', lambda m: f"{m.group(1)} Quart"),
    ]
    
    for pattern, formatter in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return formatter(match)
    
    return None


def generate_sku_for_size(base_sku: str, size: str) -> str:
    """Generate SKU for a size variant."""
    # Normalize size for SKU
    size_code = size.replace(' ', '').replace('.', '').upper()
    size_code = re.sub(r'[^A-Z0-9]', '', size_code)
    
    # Remove any existing size from base SKU
    base = re.sub(r'-?(250ML|500ML|1L|4L|10L|23L|1QT|1GAL|5GAL|1PT)$', '', base_sku, flags=re.IGNORECASE)
    
    return f"{base}-{size_code}"


def estimate_price_for_size(base_price: float, base_size: str, target_size: str) -> float:
    """Estimate price for a different size based on base price."""
    base_mult = SIZE_PRICE_MULTIPLIERS.get(base_size, 1.0)
    target_mult = SIZE_PRICE_MULTIPLIERS.get(target_size, 1.0)
    
    if base_mult == 0:
        base_mult = 1.0
    
    # Calculate price per unit, then scale to target
    unit_price = base_price / base_mult
    return round(unit_price * target_mult, 2)


def expand_product_sizes(input_csv: str, output_csv: str):
    """Expand products with standard size variants."""
    print(f"Loading {input_csv}...")
    df = pd.read_csv(input_csv)
    print(f"Loaded {len(df)} products")
    
    # Get only parent products (not variations)
    parents = df[df['Type'] != 'variation'].copy()
    
    # Track new rows to add
    new_rows = []
    stats = {
        'expanded': 0,
        'sizes_added': 0,
        'an_products': 0,
    }
    
    # Find AN products to expand
    an_products = parents[parents['Brands'] == 'Advanced Nutrients']
    print(f"\nFound {len(an_products)} Advanced Nutrients products")
    stats['an_products'] = len(an_products)
    
    # Group by base product name
    product_groups = {}
    for _, row in an_products.iterrows():
        base_name = extract_base_product_name(str(row['Name']))
        if base_name not in product_groups:
            product_groups[base_name] = []
        product_groups[base_name].append(row)
    
    print(f"Found {len(product_groups)} unique AN product lines")
    
    for base_name, products in product_groups.items():
        # Get existing sizes for this product line
        existing_sizes = set()
        for prod in products:
            size = extract_current_size(str(prod['Name']), str(prod.get('Attribute 1 value(s)', '')))
            if size:
                existing_sizes.add(size)
        
        # Determine missing sizes
        missing_sizes = [s for s in AN_ALL_SIZES if s not in existing_sizes]
        
        if not missing_sizes:
            continue
        
        # Use first product as template
        template = products[0]
        template_size = extract_current_size(str(template['Name']), str(template.get('Attribute 1 value(s)', '')))
        template_price = float(template.get('Regular price', 0) or 0)
        
        if not template_size or template_price <= 0:
            continue
        
        stats['expanded'] += 1
        print(f"  Expanding: {base_name} (has {existing_sizes}, adding {missing_sizes})")
        
        for size in missing_sizes:
            # Create new row based on template
            new_row = template.to_dict()
            
            # Update for new size
            new_row['Name'] = f"{base_name} {size}"
            new_row['SKU'] = generate_sku_for_size(str(template['SKU']), size)
            new_row['Regular price'] = estimate_price_for_size(template_price, template_size, size)
            new_row['Attribute 1 value(s)'] = size
            new_row['Published'] = 0  # Draft - presale
            new_row['Stock'] = 0
            new_row['In stock?'] = 0
            
            # Update shipping class based on size
            if size in ['250ml', '500ml']:
                new_row['Shipping class'] = 'small-item'
            elif size in ['1L', '4L', '1 Quart', '1 Gallon']:
                new_row['Shipping class'] = 'medium-item'
            elif size in ['10L', '2.5 Gallon', '5 Gallon']:
                new_row['Shipping class'] = 'large-item'
            else:
                new_row['Shipping class'] = 'oversized'
            
            # Add tags indicating presale
            existing_tags = str(new_row.get('Tags', ''))
            if existing_tags and existing_tags != 'nan':
                new_row['Tags'] = f"{existing_tags}, presale, special-order"
            else:
                new_row['Tags'] = 'presale, special-order'
            
            new_rows.append(new_row)
            stats['sizes_added'] += 1
    
    # Add new rows to dataframe
    if new_rows:
        new_df = pd.DataFrame(new_rows)
        df = pd.concat([df, new_df], ignore_index=True)
    
    print(f"\nWriting {output_csv}...")
    df.to_csv(output_csv, index=False)
    
    print("\n" + "=" * 60)
    print("SIZE EXPANSION COMPLETE")
    print("=" * 60)
    print(f"AN products found:     {stats['an_products']}")
    print(f"Product lines expanded: {stats['expanded']}")
    print(f"New sizes added:       {stats['sizes_added']}")
    print(f"Total products now:    {len(df[df['Type'] != 'variation'])}")
    print(f"\nOutput: {output_csv}")
    
    return df


if __name__ == '__main__':
    expand_product_sizes(
        input_csv='outputs/woocommerce_FINAL.csv',
        output_csv='outputs/woocommerce_EXPANDED.csv'
    )
