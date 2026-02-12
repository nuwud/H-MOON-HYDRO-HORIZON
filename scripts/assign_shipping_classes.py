#!/usr/bin/env python3
"""
Assign shipping classes based on product dimensions, weight, and volume.
Also generates XML catalog export for backup/interchange.
"""

import pandas as pd
import re
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import Optional, Tuple
from datetime import datetime

# ============================================================================
# SHIPPING CLASS DEFINITIONS (for UPS rate calculation)
# ============================================================================
SHIPPING_CLASSES = {
    'small-item': {
        'description': 'Small items (bottles <1L, packets, accessories)',
        'max_weight_lbs': 2,
        'max_volume_oz': 32,  # Up to 1L
        'example': '250ml bottles, seeds, small tools',
    },
    'medium-item': {
        'description': 'Medium items (1-4L bottles, small equipment)',
        'max_weight_lbs': 15,
        'max_volume_oz': 135,  # Up to 4L
        'example': '1L-4L nutrients, small fans, meters',
    },
    'large-item': {
        'description': 'Large items (10L+ buckets, lights, equipment)',
        'max_weight_lbs': 50,
        'max_volume_oz': 676,  # Up to 20L
        'example': '10L nutrients, grow lights, filters',
    },
    'oversized': {
        'description': 'Oversized items (tents, systems, bulk)',
        'max_weight_lbs': 150,
        'max_volume_oz': float('inf'),
        'example': 'Grow tents, hydro systems, 23L+ containers',
    },
    'freight': {
        'description': 'Freight/LTL (bulk commercial, pallets)',
        'max_weight_lbs': float('inf'),
        'max_volume_oz': float('inf'),
        'example': '55gal drums, 1000L IBC totes',
    },
}

# Volume conversions to oz
VOLUME_TO_OZ = {
    'ml': 0.033814,
    'l': 33.814,
    'lt': 33.814,
    'liter': 33.814,
    'gal': 128,
    'gallon': 128,
    'qt': 32,
    'quart': 32,
    'pt': 16,
    'pint': 16,
    'oz': 1,
    'fl oz': 1,
}

# Size patterns for nutrients
SIZE_PATTERNS = [
    (r'(\d+(?:\.\d+)?)\s*ml\b', 'ml'),
    (r'(\d+(?:\.\d+)?)\s*l(?:t|iter)?\b', 'l'),
    (r'(\d+(?:\.\d+)?)\s*gal(?:lon)?\b', 'gal'),
    (r'(\d+(?:\.\d+)?)\s*qt\.?\b', 'qt'),
    (r'(\d+(?:\.\d+)?)\s*quart\b', 'qt'),
    (r'(\d+(?:\.\d+)?)\s*oz\b', 'oz'),
]


def extract_volume_oz(text: str) -> Optional[float]:
    """Extract volume in fluid ounces from product name/size."""
    if not text:
        return None
    
    text = str(text).lower()
    
    for pattern, unit in SIZE_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            if unit in VOLUME_TO_OZ:
                return value * VOLUME_TO_OZ[unit]
    
    return None


def determine_shipping_class(name: str, weight_lbs: float = 0, volume_oz: float = 0, category: str = '') -> str:
    """Determine shipping class based on product attributes."""
    
    # Check for freight-level items first
    freight_keywords = ['drum', 'ibc', 'tote', '1000l', '208l', '55 gal', 'pallet']
    for kw in freight_keywords:
        if kw in name.lower():
            return 'freight'
    
    # Check for oversized items
    oversized_keywords = ['grow tent', 'complete system', 'ebb and flow', '23l', '57l']
    for kw in oversized_keywords:
        if kw in name.lower():
            return 'oversized'
    
    # Check for large items (lights, 10L containers, filters)
    large_keywords = ['10l', '5 gal', '20l', 'grow light', 'ballast', 'reflector', 'carbon filter', 'fan']
    for kw in large_keywords:
        if kw in name.lower():
            return 'large-item'
    
    # Use volume if available
    if volume_oz:
        if volume_oz <= 32:  # Up to 1 quart
            return 'small-item'
        elif volume_oz <= 135:  # Up to 4L
            return 'medium-item'
        elif volume_oz <= 676:  # Up to 20L
            return 'large-item'
        else:
            return 'oversized'
    
    # Use weight if available
    if weight_lbs:
        if weight_lbs <= 2:
            return 'small-item'
        elif weight_lbs <= 15:
            return 'medium-item'
        elif weight_lbs <= 50:
            return 'large-item'
        else:
            return 'oversized'
    
    # Default based on category
    cat_lower = category.lower() if category else ''
    if 'seeds' in cat_lower or 'propagation' in cat_lower:
        return 'small-item'
    elif 'nutrient' in cat_lower:
        return 'medium-item'
    elif 'light' in cat_lower or 'tent' in cat_lower:
        return 'large-item'
    
    return 'medium-item'  # Safe default


def add_shipping_classes(input_csv: str, output_csv: str):
    """Add shipping class column to CSV."""
    print(f"Loading {input_csv}...")
    df = pd.read_csv(input_csv)
    print(f"Loaded {len(df)} products")
    
    stats = {cls: 0 for cls in SHIPPING_CLASSES}
    
    for idx, row in df.iterrows():
        if row.get('Type') == 'variation':
            continue  # Variations inherit from parent
        
        name = str(row.get('Name', ''))
        weight = float(row.get('Weight (lbs)', 0) or 0)
        
        # Extract volume from name or attribute
        volume_str = str(row.get('Attribute 1 value(s)', ''))
        if not volume_str or pd.isna(volume_str):
            volume_str = name
        
        volume_oz = extract_volume_oz(volume_str) or extract_volume_oz(name)
        category = str(row.get('Categories', ''))
        
        ship_class = determine_shipping_class(name, weight, volume_oz or 0, category)
        df.at[idx, 'Shipping class'] = ship_class
        stats[ship_class] += 1
    
    print(f"\nWriting {output_csv}...")
    df.to_csv(output_csv, index=False)
    
    print("\n" + "=" * 60)
    print("SHIPPING CLASS ASSIGNMENT COMPLETE")
    print("=" * 60)
    for cls, count in stats.items():
        print(f"  {cls}: {count}")
    print(f"\nOutput: {output_csv}")
    
    return df


def export_to_xml(df: pd.DataFrame, output_xml: str):
    """Export catalog to XML format."""
    print(f"\nGenerating XML catalog: {output_xml}")
    
    root = ET.Element('catalog')
    root.set('generated', datetime.now().isoformat())
    root.set('product_count', str(len(df[df['Type'] != 'variation'])))
    
    # Add metadata
    meta = ET.SubElement(root, 'metadata')
    ET.SubElement(meta, 'store_name').text = 'H-Moon Hydro'
    ET.SubElement(meta, 'store_url').text = 'https://hmoonhydro.com'
    ET.SubElement(meta, 'export_date').text = datetime.now().strftime('%Y-%m-%d')
    
    # Add products
    products_elem = ET.SubElement(root, 'products')
    
    for _, row in df.iterrows():
        if row.get('Type') == 'variation':
            continue
        
        product = ET.SubElement(products_elem, 'product')
        product.set('sku', str(row.get('SKU', '')))
        product.set('type', str(row.get('Type', 'simple')))
        
        ET.SubElement(product, 'name').text = str(row.get('Name', ''))
        ET.SubElement(product, 'price').text = str(row.get('Regular price', ''))
        ET.SubElement(product, 'brand').text = str(row.get('Brands', ''))
        ET.SubElement(product, 'categories').text = str(row.get('Categories', ''))
        ET.SubElement(product, 'shipping_class').text = str(row.get('Shipping class', ''))
        ET.SubElement(product, 'stock').text = str(int(row.get('Stock', 0) or 0))
        ET.SubElement(product, 'published').text = str(int(row.get('Published', 0) or 0))
        ET.SubElement(product, 'tags').text = str(row.get('Tags', ''))
        
        # Dimensions
        dims = ET.SubElement(product, 'dimensions')
        ET.SubElement(dims, 'weight_lbs').text = str(row.get('Weight (lbs)', ''))
        ET.SubElement(dims, 'length').text = str(row.get('Length (in)', ''))
        ET.SubElement(dims, 'width').text = str(row.get('Width (in)', ''))
        ET.SubElement(dims, 'height').text = str(row.get('Height (in)', ''))
        
        # Size attribute
        size = str(row.get('Attribute 1 value(s)', ''))
        if size and size != 'nan':
            ET.SubElement(product, 'size').text = size
    
    # Pretty print
    xmlstr = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    with open(output_xml, 'w', encoding='utf-8') as f:
        f.write(xmlstr)
    
    print(f"XML catalog saved: {output_xml}")


if __name__ == '__main__':
    # Add shipping classes
    df = add_shipping_classes(
        input_csv='outputs/woocommerce_SYNCED.csv',
        output_csv='outputs/woocommerce_FINAL.csv'
    )
    
    # Export to XML
    export_to_xml(df, 'outputs/hmoon_catalog.xml')
