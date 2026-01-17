#!/usr/bin/env python3
"""
Split shopify_complete_import.csv into category waves.
Handles quoted CSV fields properly.
"""

import csv
import os
from collections import defaultdict

INPUT_FILE = 'outputs/shopify_complete_import.csv'
OUTPUT_DIR = 'outputs/waves'

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Read and categorize
categories = defaultdict(list)
header = None

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    header = reader.fieldnames
    
    for row in reader:
        cat = row.get('Type', '').strip().lower()
        if cat:
            categories[cat].append(row)
        else:
            categories['uncategorized'].append(row)

# Write each category to its own file
print(f"{'Category':<25} {'Products':>10} {'Status'}")
print("-" * 50)

total_products = 0
for cat, rows in sorted(categories.items(), key=lambda x: -len(x[1])):
    # Count unique handles (products)
    handles = set(row['Handle'] for row in rows)
    product_count = len(handles)
    total_products += product_count
    
    # Check quality
    with_images = sum(1 for row in rows if row.get('Image Src', '').strip())
    with_price = sum(1 for row in rows if row.get('Variant Price', '').strip() and float(row.get('Variant Price', '0') or '0') > 0)
    with_desc = sum(1 for row in rows if row.get('Body (HTML)', '').strip())
    
    # Write file
    filename = f"wave_{cat.replace(' ', '_').replace('/', '_')}.csv"
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    with open(filepath, 'w', encoding='utf-8', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)
    
    img_pct = (with_images / len(rows) * 100) if rows else 0
    price_pct = (with_price / len(rows) * 100) if rows else 0
    
    status = "✅" if img_pct > 80 and price_pct > 80 else "⚠️" if img_pct > 50 else "❌"
    
    print(f"{cat:<25} {product_count:>10} {status} img:{img_pct:.0f}% price:{price_pct:.0f}%")

print("-" * 50)
print(f"{'TOTAL':<25} {total_products:>10}")
print(f"\nFiles written to: {OUTPUT_DIR}/")
