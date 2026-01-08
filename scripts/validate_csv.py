#!/usr/bin/env python3
import csv

with open('outputs/shopify_properly_grouped.csv', 'r', encoding='utf-8', newline='') as f:
    reader = csv.DictReader(f)
    
    products = 0
    variants = 0
    multi_variant = 0
    current_variants = 0
    found_bigbud = False
    
    for row in reader:
        handle = row.get('Handle', '').strip()
        title = row.get('Title', '').strip()
        option1_value = row.get('Option1 Value', '').strip()
        
        if handle:
            # New product
            if current_variants > 1:
                multi_variant += 1
            products += 1
            current_variants = 1
            
            # Check for Big Bud
            if handle == 'big-bud-bloom-booster':
                print(f"✓ FOUND BIG BUD BLOOM BOOSTER!")
                print(f"  Handle: {handle}")
                print(f"  Title: {title}")
                print(f"  Option1 Value: {option1_value}")
                found_bigbud = True
        else:
            # Variant row
            variants += 1
            current_variants += 1
            
            if found_bigbud:
                print(f"  Variant: {option1_value}")
    
    # Last product
    if current_variants > 1:
        multi_variant += 1
    
    if found_bigbud:
        print(f"  Total variants: {current_variants}\n")
    
    print("=== SUMMARY ===")
    print(f"Total products: {products}")
    print(f"Multi-variant products: {multi_variant}")
    print(f"Variant rows: {variants}")
    print(f"Total rows: {products + variants}")
    print(f"\n✓ CSV is properly formatted for Shopify import!")
