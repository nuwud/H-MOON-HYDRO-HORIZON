#!/usr/bin/env python3
"""
Generate a WooCommerce-compatible CSV to trash existing products.

This creates a CSV that can be imported via WooCommerce > Products > Import
with "Update existing products" enabled. It sets product status to 'trash'.

Usage:
    python scripts/generate_trash_csv.py
    # Then import outputs/woo_consolidation/step1_trash_products.csv
    # Then import outputs/woo_consolidation/step2_consolidated_products.csv

Two-step workflow:
1. Import step1_trash_products.csv (updates existing to trash status)
2. Import step2_consolidated_products.csv (creates new variable products)
"""

import csv
import sys
from pathlib import Path


def main():
    delete_csv = Path("outputs/woo_consolidation/products_to_delete.csv")
    output_dir = Path("outputs/woo_consolidation")
    
    if not delete_csv.exists():
        print(f"Error: {delete_csv} not found. Run consolidation first.", file=sys.stderr)
        sys.exit(1)
    
    # Read products to delete
    products = []
    with open(delete_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append(row)
    
    print(f"Found {len(products)} products to trash")
    
    # Generate Step 1: Trash existing products
    step1_path = output_dir / "step1_trash_products.csv"
    with open(step1_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        # Minimal columns needed for update - ID is most reliable for matching
        writer.writerow(['ID', 'SKU', 'Name', 'Published'])
        
        for product in products:
            # Published: -1 = trash, 0 = draft, 1 = published
            # Include ID and SKU for best matching chances
            writer.writerow([
                product.get('ID', ''),
                product.get('SKU', ''),
                product.get('Name', ''),
                '-1'  # Trash status
            ])
    
    print(f"Created: {step1_path}")
    
    # Copy consolidated products as Step 2
    source = output_dir / "consolidated_products.csv"
    step2_path = output_dir / "step2_consolidated_products.csv"
    
    if source.exists():
        import shutil
        shutil.copy(source, step2_path)
        print(f"Created: {step2_path}")
    
    print()
    print("=" * 60)
    print("TWO-STEP IMPORT WORKFLOW")
    print("=" * 60)
    print()
    print("Step 1: Trash existing products")
    print("  a. Go to WooCommerce > Products > Import")
    print("  b. Upload: step1_trash_products.csv")
    print("  c. Check 'Update existing products that match by...' SKU")
    print("  d. Map columns and run import")
    print()
    print("Step 2: Import consolidated products")
    print("  a. Go to WooCommerce > Products > Import")
    print("  b. Upload: step2_consolidated_products.csv")
    print("  c. DO NOT check 'Update existing' (these are new)")
    print("  d. Map columns and run import")
    print()
    print("Step 3: (Optional) Permanently delete trashed products")
    print("  a. Go to Products > All Products")
    print("  b. Click 'Trash' filter")
    print("  c. Click 'Empty Trash'")
    print()


if __name__ == "__main__":
    main()
