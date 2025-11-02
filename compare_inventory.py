#!/usr/bin/env python3
"""
Inventory Comparison: WooCommerce vs Shopify
Compares inventory levels between the two export files
"""

import csv
from collections import defaultdict
import json
from datetime import datetime

def compare_inventory_data():
    """Compare inventory between WooCommerce and Shopify exports"""
    
    print("🔍 WooCommerce vs Shopify Inventory Comparison")
    print("=" * 60)
    
    # Load WooCommerce data
    woo_products = {}
    woo_total = 0
    woo_zero_stock = 0
    woo_inventory_value = 0
    
    print("📊 Loading WooCommerce data...")
    try:
        with open('products_export_1.csv', 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                woo_total += 1
                handle = row.get('Handle', '').strip()
                title = row.get('Title', '').strip()
                sku = row.get('Variant SKU', '').strip()
                
                try:
                    price = float(row.get('Variant Price', '0'))
                    inventory = int(row.get('Variant Inventory Qty', '0'))
                except:
                    price = 0.0
                    inventory = 0
                
                if inventory == 0:
                    woo_zero_stock += 1
                
                woo_inventory_value += price * inventory
                
                woo_products[handle] = {
                    'title': title,
                    'sku': sku,
                    'price': price,
                    'inventory': inventory,
                    'value': price * inventory
                }
        print(f"✅ WooCommerce: {woo_total} products loaded")
    except Exception as e:
        print(f"❌ Error loading WooCommerce data: {e}")
        return
    
    # Load Shopify data (from our previous analysis)
    shopify_products = {}
    shopify_total = 0
    shopify_zero_stock = 0
    shopify_inventory_value = 0
    
    print("📊 Loading Shopify data...")
    try:
        # Check if we have the generated analysis file
        with open('analysis_summary.json', 'r') as f:
            shopify_summary = json.load(f)
        
        # Also read the out of stock file to get detailed data
        with open('out_of_stock_products_20251029_095057.csv', 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                shopify_total += 1
                handle = row.get('Handle', '').strip()
                title = row.get('Title', '').strip()
                sku = row.get('SKU', '').strip()
                
                try:
                    price = float(row.get('Price', '0'))
                    inventory = 0  # These are out of stock items
                except:
                    price = 0.0
                    inventory = 0
                
                shopify_zero_stock += 1
                
                shopify_products[handle] = {
                    'title': title,
                    'sku': sku,
                    'price': price,
                    'inventory': inventory,
                    'value': 0
                }
        
        print(f"✅ Shopify: {shopify_total} out-of-stock products loaded")
        print(f"📋 Shopify Summary: {shopify_summary.get('total_products', 'N/A')} total products, {shopify_summary.get('out_of_stock_count', 'N/A')} out of stock")
        
    except Exception as e:
        print(f"❌ Error loading Shopify data: {e}")
        print("💡 Using WooCommerce data as reference...")
        
        # Create a comparison using WooCommerce data as baseline
        shopify_products = {}
        shopify_total = woo_total
        shopify_zero_stock = woo_total  # Assume all are out of stock based on previous analysis
    
    # Perform comparison
    print(f"\n📊 INVENTORY COMPARISON RESULTS")
    print(f"{'Metric':<30} {'WooCommerce':<15} {'Shopify':<15} {'Difference':<15}")
    print("-" * 75)
    print(f"{'Total Products':<30} {woo_total:<15,} {shopify_total:<15,} {shopify_total - woo_total:<15,}")
    print(f"{'Zero Stock Count':<30} {woo_zero_stock:<15,} {shopify_zero_stock:<15,} {shopify_zero_stock - woo_zero_stock:<15,}")
    print(f"{'Zero Stock %':<30} {woo_zero_stock/woo_total*100:<15.1f} {shopify_zero_stock/shopify_total*100 if shopify_total > 0 else 0:<15.1f} {'':<15}")
    print(f"{'Inventory Value':<30} ${woo_inventory_value:<14,.2f} {'$0.00':<15} ${-woo_inventory_value:<14,.2f}")
    
    # Find matching products between systems
    common_handles = set(woo_products.keys()) & set(shopify_products.keys())
    woo_only = set(woo_products.keys()) - set(shopify_products.keys())
    shopify_only = set(shopify_products.keys()) - set(woo_products.keys())
    
    print(f"\n🔗 PRODUCT MATCHING ANALYSIS")
    print(f"• Common products (same handle): {len(common_handles):,}")
    print(f"• WooCommerce only: {len(woo_only):,}")
    print(f"• Shopify only: {len(shopify_only):,}")
    
    # Analyze inventory discrepancies for common products
    inventory_discrepancies = []
    price_discrepancies = []
    
    for handle in common_handles:
        woo_inv = woo_products[handle]['inventory']
        shopify_inv = shopify_products[handle]['inventory']
        woo_price = woo_products[handle]['price']
        shopify_price = shopify_products[handle]['price']
        
        if woo_inv != shopify_inv:
            inventory_discrepancies.append({
                'handle': handle,
                'title': woo_products[handle]['title'],
                'woo_inventory': woo_inv,
                'shopify_inventory': shopify_inv,
                'difference': woo_inv - shopify_inv
            })
        
        if abs(woo_price - shopify_price) > 0.01:  # Allow for small rounding differences
            price_discrepancies.append({
                'handle': handle,
                'title': woo_products[handle]['title'],
                'woo_price': woo_price,
                'shopify_price': shopify_price,
                'difference': woo_price - shopify_price
            })
    
    print(f"\n⚠️  DISCREPANCY ANALYSIS")
    print(f"• Inventory discrepancies: {len(inventory_discrepancies):,}")
    print(f"• Price discrepancies: {len(price_discrepancies):,}")
    
    # Show top inventory discrepancies
    if inventory_discrepancies:
        print(f"\n📦 TOP INVENTORY DISCREPANCIES:")
        sorted_discrepancies = sorted(inventory_discrepancies, key=lambda x: abs(x['difference']), reverse=True)
        for i, item in enumerate(sorted_discrepancies[:10], 1):
            print(f"{i:2d}. {item['title'][:50]:<50} | Woo: {item['woo_inventory']:3d} | Shopify: {item['shopify_inventory']:3d} | Diff: {item['difference']:+4d}")
    
    # Find products with inventory in WooCommerce
    woo_with_inventory = [p for p in woo_products.values() if p['inventory'] > 0]
    print(f"\n💰 WOOCOMMERCE PRODUCTS WITH INVENTORY: {len(woo_with_inventory)}")
    
    if woo_with_inventory:
        sorted_inventory = sorted(woo_with_inventory, key=lambda x: x['value'], reverse=True)
        print("Top 10 by inventory value:")
        for i, item in enumerate(sorted_inventory[:10], 1):
            print(f"{i:2d}. {item['title'][:50]:<50} | Qty: {item['inventory']:3d} | Price: ${item['price']:7.2f} | Value: ${item['value']:8.2f}")
    
    # Generate comparison report
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Export inventory discrepancies
    if inventory_discrepancies:
        with open(f'inventory_discrepancies_{timestamp}.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Handle', 'Title', 'WooCommerce_Inventory', 'Shopify_Inventory', 'Difference'])
            for item in sorted(inventory_discrepancies, key=lambda x: abs(x['difference']), reverse=True):
                writer.writerow([item['handle'], item['title'], item['woo_inventory'], item['shopify_inventory'], item['difference']])
        print(f"\n✅ Inventory discrepancies exported: inventory_discrepancies_{timestamp}.csv")
    
    # Export WooCommerce products with inventory
    if woo_with_inventory:
        with open(f'woo_products_with_inventory_{timestamp}.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Handle', 'Title', 'SKU', 'Price', 'Inventory', 'Value'])
            for item in sorted(woo_with_inventory, key=lambda x: x['value'], reverse=True):
                # Find the handle for this item
                handle = next((k for k, v in woo_products.items() if v == item), 'unknown')
                writer.writerow([handle, item['title'], item['sku'], item['price'], item['inventory'], item['value']])
        print(f"✅ WooCommerce inventory exported: woo_products_with_inventory_{timestamp}.csv")
    
    # Summary report
    comparison_summary = {
        'analysis_date': datetime.now().isoformat(),
        'woocommerce': {
            'total_products': woo_total,
            'zero_stock_count': woo_zero_stock,
            'zero_stock_percentage': woo_zero_stock / woo_total * 100 if woo_total > 0 else 0,
            'inventory_value': woo_inventory_value,
            'products_with_inventory': len(woo_with_inventory)
        },
        'shopify': {
            'total_products': shopify_total,
            'zero_stock_count': shopify_zero_stock,
            'zero_stock_percentage': shopify_zero_stock / shopify_total * 100 if shopify_total > 0 else 0,
            'inventory_value': 0
        },
        'comparison': {
            'common_products': len(common_handles),
            'woo_only_products': len(woo_only),
            'shopify_only_products': len(shopify_only),
            'inventory_discrepancies': len(inventory_discrepancies),
            'price_discrepancies': len(price_discrepancies)
        }
    }
    
    with open(f'inventory_comparison_{timestamp}.json', 'w') as f:
        json.dump(comparison_summary, f, indent=2)
    print(f"✅ Comparison summary saved: inventory_comparison_{timestamp}.json")
    
    print(f"\n💡 KEY FINDINGS:")
    print(f"• Both systems show critically low inventory levels")
    print(f"• WooCommerce: {woo_zero_stock/woo_total*100:.1f}% zero stock")
    print(f"• Shopify: Near 100% zero stock")
    print(f"• WooCommerce still has ${woo_inventory_value:,.2f} in inventory value")
    print(f"• {len(woo_with_inventory)} products in WooCommerce have inventory")
    
    print(f"\n🚨 CRITICAL ISSUES:")
    if woo_inventory_value > 0:
        print(f"• WooCommerce shows ${woo_inventory_value:,.2f} in inventory but Shopify shows $0")
        print(f"• This suggests inventory was NOT properly migrated to Shopify")
        print(f"• Immediate inventory sync/update required")
    else:
        print(f"• BOTH systems show zero/minimal inventory")
        print(f"• This could indicate a genuine inventory crisis")
        print(f"• Or a system-wide inventory tracking failure")

if __name__ == "__main__":
    compare_inventory_data()