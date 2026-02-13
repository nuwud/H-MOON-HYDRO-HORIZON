#!/usr/bin/env python3
"""
WooCommerce Grouped -> Variable Product Converter
================================================
Converts grouped products to variable products with proper variations.
Creates a professional import-ready CSV with comprehensive metadata.

Author: H-Moon Hydro Migration Tool
Date: February 2026
"""

import pandas as pd
import re
import hashlib
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ============================================================================
# CONFIGURATION
# ============================================================================

INPUT_FILE = "hmoonhydro.com/wc-product-export-12-2-2026-1770945635307.csv"
OUTPUT_DIR = Path("outputs")
OUTPUT_FILE = OUTPUT_DIR / "woocommerce_variable_products.csv"
REPORT_FILE = OUTPUT_DIR / "conversion_report.txt"

# Size extraction patterns (order matters - more specific first)
SIZE_PATTERNS = [
    # Volume with decimals
    (r'(\d+\.?\d*)\s*(gal|gallon|gallons)', 'gal'),
    (r'(\d+\.?\d*)\s*(qt|quart|quarts)', 'qt'),
    (r'(\d+\.?\d*)\s*(pt|pint|pints)', 'pt'),
    (r'(\d+\.?\d*)\s*(oz|ounce|ounces)', 'oz'),
    (r'(\d+\.?\d*)\s*(ml|milliliter)', 'ml'),
    (r'(\d+\.?\d*)\s*(l|liter|litre)', 'L'),
    # Weight
    (r'(\d+\.?\d*)\s*(lb|lbs|pound|pounds)', 'lb'),
    (r'(\d+\.?\d*)\s*(kg|kilogram)', 'kg'),
    (r'(\d+\.?\d*)\s*(g|gram|grams)(?!\w)', 'g'),
    # Dimensions
    (r'(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)', 'dims'),
    (r'(\d+)\s*[xX]\s*(\d+)', 'dims'),
    (r'(\d+\.?\d*)\s*(inch|in|")', 'in'),
    (r'(\d+\.?\d*)\s*(ft|foot|feet|\')', 'ft'),
    (r'(\d+\.?\d*)\s*(mm|millimeter)', 'mm'),
    (r'(\d+\.?\d*)\s*(cm|centimeter)', 'cm'),
    (r'(\d+\.?\d*)\s*(m|meter)(?!\w)', 'm'),
    # Counts/Packs
    (r'(\d+)\s*(pack|pk|count|ct|pc|pcs|piece)', 'pack'),
    (r'(\d+)\s*-?\s*(cell|cube|plug)', 'cell'),
    # Generic number at end
    (r'\s(\d+)$', 'units'),
]

# Product type indicators (for multi-attribute products)
PRODUCT_TYPE_KEYWORDS = {
    'Grow': ['grow', 'veg', 'vegetative', 'floragro', 'flora gro'],
    'Bloom': ['bloom', 'flower', 'flowering', 'florabloom', 'flora bloom'],
    'Micro': ['micro', 'floramicro', 'flora micro'],
    'Part A': ['part a', 'a component', 'component a'],
    'Part B': ['part b', 'b component', 'component b'],
    'Hardwater': ['hardwater', 'hard water', 'hw'],
    'Base': ['base'],
}

# WooCommerce import columns (comprehensive)
WC_COLUMNS = [
    'ID', 'Type', 'SKU', 'Name', 'Published', 'Is featured?', 
    'Visibility in catalog', 'Short description', 'Description',
    'Date sale price starts', 'Date sale price ends', 'Tax status', 'Tax class',
    'In stock?', 'Stock', 'Low stock amount', 'Backorders allowed?',
    'Sold individually?', 'Weight (oz)', 'Length (in)', 'Width (in)', 'Height (in)',
    'Allow customer reviews?', 'Purchase note', 'Sale price', 'Regular price',
    'Categories', 'Tags', 'Shipping class', 'Images', 'Download limit',
    'Download expiry days', 'Parent', 'Grouped products', 'Upsells', 'Cross-sells',
    'External URL', 'Button text', 'Position', 'Brands', 'Brand',
    'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 1 visible', 'Attribute 1 global',
    'Attribute 2 name', 'Attribute 2 value(s)', 'Attribute 2 visible', 'Attribute 2 global',
    'Attribute 3 name', 'Attribute 3 value(s)', 'Attribute 3 visible', 'Attribute 3 global',
]


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def extract_size(name: str, parent_name: str = "") -> tuple:
    """
    Extract size/quantity from product name.
    Returns (size_value, size_unit, formatted_size)
    """
    name_lower = name.lower()
    
    for pattern, unit_type in SIZE_PATTERNS:
        match = re.search(pattern, name_lower, re.IGNORECASE)
        if match:
            groups = match.groups()
            if unit_type == 'dims':
                # Dimensions like 4x8 or 4x4x4
                if len(groups) == 3:
                    formatted = f"{groups[0]}x{groups[1]}x{groups[2]}"
                else:
                    formatted = f"{groups[0]}x{groups[1]}"
                return (formatted, 'dims', formatted)
            else:
                value = groups[0]
                # Format nicely
                if '.' in value:
                    value = value.rstrip('0').rstrip('.')
                formatted = f"{value} {unit_type}"
                return (value, unit_type, formatted)
    
    # Fallback: try to get suffix after parent name
    if parent_name:
        # Clean HTML from names
        clean_name = re.sub(r'<[^>]+>', '', name)
        clean_parent = re.sub(r'<[^>]+>', '', parent_name)
        
        # Try different methods to find the distinguishing part
        suffix = clean_name.replace(clean_parent, '').strip()
        
        # Clean up common separators
        suffix = re.sub(r'^[\s\-\|:]+', '', suffix)
        suffix = re.sub(r'[\s\-\|:]+$', '', suffix)
        
        if suffix and len(suffix) > 1 and len(suffix) < 50:
            return (suffix, 'variant', suffix)
        
        # If still no difference found, use the full name as the variant
        if clean_name != clean_parent and clean_name:
            # Find longest common prefix and take the rest
            i = 0
            while i < len(clean_name) and i < len(clean_parent) and clean_name[i].lower() == clean_parent[i].lower():
                i += 1
            if i < len(clean_name):
                remainder = clean_name[i:].strip()
                remainder = re.sub(r'^[\s\-\|:]+', '', remainder)
                if remainder and len(remainder) > 1:
                    return (remainder, 'variant', remainder)
    
    # Ultimate fallback: use the name itself if different from parent
    if parent_name and name != parent_name:
        clean_name = re.sub(r'<[^>]+>', '', name).strip()
        if clean_name:
            return (clean_name, 'name', clean_name)
    
    # If name is identical to parent, use "Main Unit" as fallback
    if parent_name:
        clean_name = re.sub(r'<[^>]+>', '', name).strip()
        clean_parent = re.sub(r'<[^>]+>', '', parent_name).strip()
        if clean_name.lower() == clean_parent.lower():
            return ("Main Unit", 'default', "Main Unit")
    
    return (None, None, None)


def extract_product_type(name: str, parent_name: str = "") -> str:
    """
    Extract product type (Grow, Bloom, etc.) from name.
    """
    name_lower = name.lower()
    
    # Search in full name (handles cases like "FloraGro" from parent "Flora Series")
    for type_name, keywords in PRODUCT_TYPE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in name_lower:
                return type_name
    
    return None


def normalize_size_for_sorting(size_str: str) -> tuple:
    """
    Create a sortable tuple from size string.
    Converts to base units for proper ordering.
    """
    if not size_str:
        return (999, 0, size_str or "")
    
    size_lower = size_str.lower()
    
    # Volume conversions to oz
    volume_units = {
        'gal': 128, 'gallon': 128,
        'qt': 32, 'quart': 32,
        'pt': 16, 'pint': 16,
        'oz': 1, 'ounce': 1,
        'l': 33.814, 'liter': 33.814, 'litre': 33.814,
        'ml': 0.033814,
    }
    
    # Weight conversions to oz
    weight_units = {
        'lb': 16, 'lbs': 16, 'pound': 16,
        'kg': 35.274,
        'g': 0.035274, 'gram': 0.035274,
    }
    
    # Try to extract numeric value and unit
    match = re.search(r'(\d+\.?\d*)\s*(\w+)', size_lower)
    if match:
        try:
            value = float(match.group(1))
        except ValueError:
            return (999, 0, size_str)
        unit = match.group(2)
        
        if unit in volume_units:
            return (1, value * volume_units[unit], size_str)
        elif unit in weight_units:
            return (2, value * weight_units[unit], size_str)
        else:
            return (3, value, size_str)
    
    return (999, 0, size_str)


def generate_variation_sku(parent_sku: str, size: str, product_type: str = None) -> str:
    """
    Generate a unique SKU for a variation.
    """
    if product_type:
        base = f"{parent_sku}-{product_type[:3].upper()}-{size}"
    else:
        base = f"{parent_sku}-{size}"
    
    # Clean up
    sku = re.sub(r'[^a-zA-Z0-9\-]', '', base.replace(' ', '-'))
    return sku.upper()


# ============================================================================
# MAIN CONVERSION LOGIC
# ============================================================================

def convert_grouped_to_variable(df: pd.DataFrame) -> tuple:
    """
    Convert grouped products to variable products with variations.
    Returns (output_df, stats_dict)
    """
    output_rows = []
    stats = {
        'grouped_converted': 0,
        'variations_created': 0,
        'simple_preserved': 0,
        'multi_attribute': 0,
        'single_attribute': 0,
        'orphan_children': 0,
        'errors': [],
    }
    
    # Build lookup tables
    sku_to_row = {str(row['SKU']): row for _, row in df.iterrows() if pd.notna(row['SKU'])}
    
    # Track which SKUs are children (to avoid duplicating them as standalone)
    child_skus = set()
    for _, row in df[df['Type'] == 'grouped'].iterrows():
        children_str = row.get('Grouped products', '')
        if pd.notna(children_str) and children_str:
            for sku in str(children_str).split(','):
                child_skus.add(sku.strip())
    
    # Process grouped products
    grouped_products = df[df['Type'] == 'grouped']
    
    for _, parent in grouped_products.iterrows():
        parent_sku = str(parent['SKU']) if pd.notna(parent['SKU']) else ''
        parent_name = str(parent['Name']) if pd.notna(parent['Name']) else ''
        children_str = parent.get('Grouped products', '')
        
        if pd.isna(children_str) or not children_str:
            # Convert grouped product without children to simple product
            simple_row = {
                'ID': '',
                'Type': 'simple',
                'SKU': parent_sku,
                'Name': parent_name,
                'Published': parent.get('Published', 1),
                'Is featured?': parent.get('Is featured?', 0),
                'Visibility in catalog': 'visible',
                'Short description': parent.get('Short description', ''),
                'Description': parent.get('Description', ''),
                'Tax status': parent.get('Tax status', 'taxable'),
                'Tax class': parent.get('Tax class', ''),
                'In stock?': 1,
                'Stock': parent.get('Stock', ''),
                'Backorders allowed?': parent.get('Backorders allowed?', 0),
                'Sold individually?': 0,
                'Weight (oz)': parent.get('Weight (oz)', ''),
                'Length (in)': parent.get('Length (in)', ''),
                'Width (in)': parent.get('Width (in)', ''),
                'Height (in)': parent.get('Height (in)', ''),
                'Allow customer reviews?': 1,
                'Purchase note': parent.get('Purchase note', ''),
                'Sale price': parent.get('Sale price', ''),
                'Regular price': parent.get('Regular price', ''),
                'Categories': parent.get('Categories', ''),
                'Tags': parent.get('Tags', ''),
                'Shipping class': parent.get('Shipping class', ''),
                'Images': parent.get('Images', ''),
                'Parent': '',
                'Grouped products': '',
                'Upsells': parent.get('Upsells', ''),
                'Cross-sells': parent.get('Cross-sells', ''),
                'Position': 0,
                'Brands': parent.get('Brands', ''),
                'Brand': parent.get('Brand', ''),
            }
            output_rows.append(simple_row)
            stats['grouped_no_children'] = stats.get('grouped_no_children', 0) + 1
            continue
        
        child_skus_list = [s.strip() for s in str(children_str).split(',')]
        
        # Analyze children to determine attribute structure
        children_data = []
        all_sizes = set()
        all_types = set()
        
        for child_sku in child_skus_list:
            if child_sku not in sku_to_row:
                stats['orphan_children'] += 1
                continue
            
            child_row = sku_to_row[child_sku]
            child_name = str(child_row['Name']) if pd.notna(child_row['Name']) else ''
            
            # Extract attributes
            size_val, size_unit, size_formatted = extract_size(child_name, parent_name)
            product_type = extract_product_type(child_name, parent_name)
            
            children_data.append({
                'sku': child_sku,
                'name': child_name,
                'row': child_row,
                'size': size_formatted,
                'size_val': size_val,
                'size_unit': size_unit,
                'product_type': product_type,
                'sort_key': normalize_size_for_sorting(size_formatted),
            })
            
            if size_formatted:
                all_sizes.add(size_formatted)
            if product_type:
                all_types.add(product_type)
        
        if not children_data:
            stats['errors'].append(f"No valid children found for {parent_sku}")
            continue
        
        # Special case: if only one child with same name as parent, convert to simple
        if len(children_data) == 1:
            child = children_data[0]
            child_name_clean = re.sub(r'<[^>]+>', '', child['name']).strip().lower()
            parent_name_clean = re.sub(r'<[^>]+>', '', parent_name).strip().lower()
            
            if child_name_clean == parent_name_clean or not child['size']:
                # This is essentially a simple product
                child_row = child['row']
                simple_row = {
                    'ID': '',
                    'Type': 'simple',
                    'SKU': parent_sku,  # Use parent SKU
                    'Name': parent_name,
                    'Published': 1,
                    'Is featured?': parent.get('Is featured?', 0),
                    'Visibility in catalog': 'visible',
                    'Short description': parent.get('Short description', ''),
                    'Description': parent.get('Description', '') or child_row.get('Description', ''),
                    'Tax status': 'taxable',
                    'Tax class': '',
                    'In stock?': child_row.get('In stock?', 1),
                    'Stock': child_row.get('Stock', ''),
                    'Backorders allowed?': 0,
                    'Sold individually?': 0,
                    'Weight (oz)': child_row.get('Weight (oz)', ''),
                    'Length (in)': parent.get('Length (in)', ''),
                    'Width (in)': parent.get('Width (in)', ''),
                    'Height (in)': parent.get('Height (in)', ''),
                    'Allow customer reviews?': 1,
                    'Purchase note': parent.get('Purchase note', ''),
                    'Sale price': child_row.get('Sale price', ''),
                    'Regular price': child_row.get('Regular price', ''),
                    'Categories': parent.get('Categories', ''),
                    'Tags': parent.get('Tags', ''),
                    'Shipping class': child_row.get('Shipping class', '') or parent.get('Shipping class', ''),
                    'Images': parent.get('Images', '') or child_row.get('Images', ''),
                    'Parent': '',
                    'Grouped products': '',
                    'Upsells': parent.get('Upsells', ''),
                    'Cross-sells': parent.get('Cross-sells', ''),
                    'Position': 0,
                    'Brands': parent.get('Brands', ''),
                    'Brand': parent.get('Brand', ''),
                }
                output_rows.append(simple_row)
                stats['single_child_to_simple'] = stats.get('single_child_to_simple', 0) + 1
                continue
        
        # Sort children by size
        children_data.sort(key=lambda x: x['sort_key'])
        
        # Determine if multi-attribute
        is_multi_attr = len(all_types) > 1
        
        if is_multi_attr:
            stats['multi_attribute'] += 1
        else:
            stats['single_attribute'] += 1
        
        # Create parent (variable) product row
        parent_row_data = {
            'ID': '',  # Leave blank for import
            'Type': 'variable',
            'SKU': parent_sku,
            'Name': parent_name,
            'Published': 1,
            'Is featured?': parent.get('Is featured?', 0),
            'Visibility in catalog': 'visible',
            'Short description': parent.get('Short description', ''),
            'Description': parent.get('Description', ''),
            'Tax status': parent.get('Tax status', 'taxable'),
            'Tax class': parent.get('Tax class', ''),
            'In stock?': 1,
            'Stock': '',  # Variable products don't have stock at parent level
            'Backorders allowed?': 0,
            'Sold individually?': 0,
            'Weight (oz)': '',  # Will be on variations
            'Length (in)': parent.get('Length (in)', ''),
            'Width (in)': parent.get('Width (in)', ''),
            'Height (in)': parent.get('Height (in)', ''),
            'Allow customer reviews?': 1,
            'Purchase note': parent.get('Purchase note', ''),
            'Sale price': '',
            'Regular price': '',  # Variable products don't have price at parent level
            'Categories': parent.get('Categories', ''),
            'Tags': parent.get('Tags', ''),
            'Shipping class': parent.get('Shipping class', ''),
            'Images': parent.get('Images', ''),
            'Parent': '',
            'Grouped products': '',  # Clear this
            'Upsells': parent.get('Upsells', ''),
            'Cross-sells': parent.get('Cross-sells', ''),
            'Position': 0,
            'Brands': parent.get('Brands', ''),
            'Brand': parent.get('Brand', ''),
        }
        
        # Add attributes to parent
        if is_multi_attr:
            # Attribute 1: Product Type (Grow/Bloom/etc)
            parent_row_data['Attribute 1 name'] = 'Product'
            parent_row_data['Attribute 1 value(s)'] = ' | '.join(sorted(all_types))
            parent_row_data['Attribute 1 visible'] = 1
            parent_row_data['Attribute 1 global'] = 1
            
            # Attribute 2: Size
            sorted_sizes = [s for s in sorted(all_sizes, key=normalize_size_for_sorting)]
            parent_row_data['Attribute 2 name'] = 'Size'
            parent_row_data['Attribute 2 value(s)'] = ' | '.join(sorted_sizes)
            parent_row_data['Attribute 2 visible'] = 1
            parent_row_data['Attribute 2 global'] = 1
        else:
            # Single attribute: Size only
            sorted_sizes = [s for s in sorted(all_sizes, key=normalize_size_for_sorting)]
            parent_row_data['Attribute 1 name'] = 'Size'
            parent_row_data['Attribute 1 value(s)'] = ' | '.join(sorted_sizes)
            parent_row_data['Attribute 1 visible'] = 1
            parent_row_data['Attribute 1 global'] = 1
        
        output_rows.append(parent_row_data)
        stats['grouped_converted'] += 1
        
        # Create variation rows for each child
        for i, child in enumerate(children_data):
            child_row = child['row']
            
            variation_row = {
                'ID': '',
                'Type': 'variation',
                'SKU': child['sku'],  # Keep original SKU
                'Name': '',  # Variations don't have names in WooCommerce
                'Published': 1,
                'Is featured?': 0,
                'Visibility in catalog': '',  # Variations inherit
                'Short description': '',
                'Description': child_row.get('Description', ''),  # Keep for reference
                'Tax status': 'taxable',
                'Tax class': '',
                'In stock?': child_row.get('In stock?', 1),
                'Stock': child_row.get('Stock', ''),
                'Backorders allowed?': child_row.get('Backorders allowed?', 0),
                'Sold individually?': 0,
                'Weight (oz)': child_row.get('Weight (oz)', ''),
                'Length (in)': child_row.get('Length (in)', ''),
                'Width (in)': child_row.get('Width (in)', ''),
                'Height (in)': child_row.get('Height (in)', ''),
                'Allow customer reviews?': '',
                'Purchase note': '',
                'Sale price': child_row.get('Sale price', ''),
                'Regular price': child_row.get('Regular price', ''),
                'Categories': '',  # Variations inherit
                'Tags': '',
                'Shipping class': child_row.get('Shipping class', ''),
                'Images': child_row.get('Images', ''),
                'Parent': parent_sku,  # Link to parent by SKU
                'Grouped products': '',
                'Upsells': '',
                'Cross-sells': '',
                'Position': i + 1,
                'Brands': child_row.get('Brands', '') or parent.get('Brands', ''),
                'Brand': child_row.get('Brand', '') or parent.get('Brand', ''),
            }
            
            # Set variation attributes
            if is_multi_attr:
                variation_row['Attribute 1 name'] = 'Product'
                variation_row['Attribute 1 value(s)'] = child['product_type'] or ''
                variation_row['Attribute 2 name'] = 'Size'
                variation_row['Attribute 2 value(s)'] = child['size'] or ''
            else:
                variation_row['Attribute 1 name'] = 'Size'
                variation_row['Attribute 1 value(s)'] = child['size'] or ''
            
            output_rows.append(variation_row)
            stats['variations_created'] += 1
    
    # Process standalone simple products (not children of grouped)
    simple_products = df[(df['Type'] == 'simple') & (~df['SKU'].isin(child_skus))]
    
    for _, row in simple_products.iterrows():
        simple_row = {
            'ID': '',
            'Type': 'simple',
            'SKU': row.get('SKU', ''),
            'Name': row.get('Name', ''),
            'Published': row.get('Published', 1),
            'Is featured?': row.get('Is featured?', 0),
            'Visibility in catalog': row.get('Visibility in catalog', 'visible'),
            'Short description': row.get('Short description', ''),
            'Description': row.get('Description', ''),
            'Tax status': row.get('Tax status', 'taxable'),
            'Tax class': row.get('Tax class', ''),
            'In stock?': row.get('In stock?', 1),
            'Stock': row.get('Stock', ''),
            'Backorders allowed?': row.get('Backorders allowed?', 0),
            'Sold individually?': row.get('Sold individually?', 0),
            'Weight (oz)': row.get('Weight (oz)', ''),
            'Length (in)': row.get('Length (in)', ''),
            'Width (in)': row.get('Width (in)', ''),
            'Height (in)': row.get('Height (in)', ''),
            'Allow customer reviews?': row.get('Allow customer reviews?', 1),
            'Purchase note': row.get('Purchase note', ''),
            'Sale price': row.get('Sale price', ''),
            'Regular price': row.get('Regular price', ''),
            'Categories': row.get('Categories', ''),
            'Tags': row.get('Tags', ''),
            'Shipping class': row.get('Shipping class', ''),
            'Images': row.get('Images', ''),
            'Parent': '',
            'Grouped products': '',
            'Upsells': row.get('Upsells', ''),
            'Cross-sells': row.get('Cross-sells', ''),
            'Position': 0,
            'Brands': row.get('Brands', ''),
            'Brand': row.get('Brand', ''),
        }
        output_rows.append(simple_row)
        stats['simple_preserved'] += 1
    
    # Create output dataframe
    output_df = pd.DataFrame(output_rows)
    
    # Ensure all columns exist
    for col in WC_COLUMNS:
        if col not in output_df.columns:
            output_df[col] = ''
    
    # Reorder columns
    output_df = output_df[[c for c in WC_COLUMNS if c in output_df.columns]]
    
    return output_df, stats


def generate_report(stats: dict, output_file: Path) -> str:
    """Generate a conversion report."""
    report = []
    report.append("=" * 70)
    report.append("WOOCOMMERCE GROUPED -> VARIABLE CONVERSION REPORT")
    report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append("=" * 70)
    report.append("")
    report.append("CONVERSION SUMMARY")
    report.append("-" * 40)
    report.append(f"Grouped products converted:  {stats['grouped_converted']}")
    report.append(f"  - Multi-attribute:         {stats['multi_attribute']}")
    report.append(f"  - Single-attribute:        {stats['single_attribute']}")
    report.append(f"Grouped (no children)->Simple: {stats.get('grouped_no_children', 0)}")
    report.append(f"Grouped (1 child same)->Simple: {stats.get('single_child_to_simple', 0)}")
    report.append(f"Variations created:          {stats['variations_created']}")
    report.append(f"Simple products preserved:   {stats['simple_preserved']}")
    report.append(f"Orphan children (skipped):   {stats['orphan_children']}")
    report.append("")
    report.append(f"TOTAL OUTPUT ROWS:           {stats['grouped_converted'] + stats['variations_created'] + stats['simple_preserved']}")
    report.append("")
    report.append(f"Output file: {output_file}")
    report.append("")
    
    if stats['errors']:
        report.append("ERRORS/WARNINGS")
        report.append("-" * 40)
        for error in stats['errors'][:20]:
            report.append(f"  ! {error}")
        if len(stats['errors']) > 20:
            report.append(f"  ... and {len(stats['errors']) - 20} more")
    
    report.append("")
    report.append("IMPORT INSTRUCTIONS")
    report.append("-" * 40)
    report.append("1. Go to WooCommerce > Products > Import")
    report.append("2. Upload the generated CSV file")
    report.append("3. Map columns (most should auto-map)")
    report.append("4. Select 'Update existing products matching by SKU'")
    report.append("5. Run import")
    report.append("")
    report.append("IMPORTANT NOTES")
    report.append("-" * 40)
    report.append("- Variations are linked to parents via the 'Parent' column (SKU)")
    report.append("- Attributes use pipe '|' delimiter for multiple values")
    report.append("- Original child products will become variations")
    report.append("- The grouped products will become variable products")
    report.append("")
    
    return "\n".join(report)


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    print("=" * 70)
    print("WOOCOMMERCE GROUPED -> VARIABLE CONVERSION")
    print("=" * 70)
    print()
    
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Load data
    print(f"Loading: {INPUT_FILE}")
    df = pd.read_csv(INPUT_FILE, low_memory=False)
    print(f"  Loaded {len(df)} rows")
    print(f"  Types: {df['Type'].value_counts().to_dict()}")
    print()
    
    # Convert
    print("Converting grouped products to variable products...")
    output_df, stats = convert_grouped_to_variable(df)
    print()
    
    # Save output
    print(f"Saving: {OUTPUT_FILE}")
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"  Wrote {len(output_df)} rows")
    print()
    
    # Generate and save report
    report = generate_report(stats, OUTPUT_FILE)
    print(report)
    
    with open(REPORT_FILE, 'w') as f:
        f.write(report)
    print(f"\nReport saved: {REPORT_FILE}")
    
    return output_df, stats


if __name__ == "__main__":
    main()
