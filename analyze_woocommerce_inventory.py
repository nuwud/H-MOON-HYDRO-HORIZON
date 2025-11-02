#!/usr/bin/env python3
"""
WooCommerce CSV Inventory Analyzer
Analyzes inventory levels from the WooCommerce export
"""

import csv
from collections import Counter, defaultdict
import json
from datetime import datetime

def analyze_woocommerce_inventory():
    """Analyze inventory data from WooCommerce CSV export"""
    
    print("🛍️  WooCommerce Inventory Analysis")
    print("=" * 50)
    
    inventory_data = []
    total_products = 0
    inventory_stats = {
        'zero_stock': 0,
        'low_stock': 0,  # 1-5 items
        'medium_stock': 0,  # 6-20 items
        'high_stock': 0,  # 21+ items
        'no_tracking': 0
    }
    
    price_ranges = defaultdict(int)
    total_inventory_value = 0
    
    try:
        with open('products_export_1.csv', 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            
            for row in reader:
                total_products += 1
                
                # Extract key inventory data
                handle = row.get('Handle', '')
                title = row.get('Title', '')
                price = row.get('Variant Price', '0')
                inventory_qty = row.get('Variant Inventory Qty', '0')
                inventory_policy = row.get('Variant Inventory Policy', '')
                status = row.get('Status', '')
                sku = row.get('Variant SKU', '')
                
                # Clean and convert values
                try:
                    price_val = float(price) if price else 0.0
                except:
                    price_val = 0.0
                
                try:
                    inventory_val = int(inventory_qty) if inventory_qty else 0
                except:
                    inventory_val = 0
                
                # Calculate inventory value
                item_value = price_val * inventory_val
                total_inventory_value += item_value
                
                # Categorize inventory levels
                if inventory_val == 0:
                    inventory_stats['zero_stock'] += 1
                elif 1 <= inventory_val <= 5:
                    inventory_stats['low_stock'] += 1
                elif 6 <= inventory_val <= 20:
                    inventory_stats['medium_stock'] += 1
                else:
                    inventory_stats['high_stock'] += 1
                
                # Price range analysis
                if price_val == 0:
                    price_ranges['$0'] += 1
                elif price_val < 10:
                    price_ranges['$1-9'] += 1
                elif price_val < 50:
                    price_ranges['$10-49'] += 1
                elif price_val < 100:
                    price_ranges['$50-99'] += 1
                elif price_val < 500:
                    price_ranges['$100-499'] += 1
                else:
                    price_ranges['$500+'] += 1
                
                inventory_data.append({
                    'handle': handle,
                    'title': title,
                    'sku': sku,
                    'price': price_val,
                    'inventory_qty': inventory_val,
                    'inventory_value': item_value,
                    'inventory_policy': inventory_policy,
                    'status': status
                })
    
    except FileNotFoundError:
        print("❌ File 'products_export_1.csv' not found!")
        return
    except Exception as e:
        print(f"❌ Error reading file: {str(e)}")
        return
    
    # Generate analysis report
    print(f"\n📊 INVENTORY ANALYSIS RESULTS")
    print(f"Total Products Analyzed: {total_products:,}")
    print(f"Total Inventory Value: ${total_inventory_value:,.2f}")
    
    print(f"\n📦 INVENTORY LEVELS:")
    print(f"• Zero Stock (0 items): {inventory_stats['zero_stock']:,} ({inventory_stats['zero_stock']/total_products*100:.1f}%)")
    print(f"• Low Stock (1-5 items): {inventory_stats['low_stock']:,} ({inventory_stats['low_stock']/total_products*100:.1f}%)")
    print(f"• Medium Stock (6-20 items): {inventory_stats['medium_stock']:,} ({inventory_stats['medium_stock']/total_products*100:.1f}%)")
    print(f"• High Stock (21+ items): {inventory_stats['high_stock']:,} ({inventory_stats['high_stock']/total_products*100:.1f}%)")
    
    print(f"\n💰 PRICE DISTRIBUTION:")
    for price_range, count in sorted(price_ranges.items()):
        print(f"• {price_range}: {count:,} products ({count/total_products*100:.1f}%)")
    
    # Find highest value inventory items
    high_value_items = sorted(inventory_data, key=lambda x: x['inventory_value'], reverse=True)[:10]
    print(f"\n🏆 TOP 10 HIGHEST VALUE INVENTORY:")
    for i, item in enumerate(high_value_items, 1):
        print(f"{i:2d}. {item['title'][:50]:<50} | Qty: {item['inventory_qty']:3d} | Price: ${item['price']:7.2f} | Value: ${item['inventory_value']:8.2f}")
    
    # Find zero stock items
    zero_stock_items = [item for item in inventory_data if item['inventory_qty'] == 0]
    print(f"\n⚠️  ZERO STOCK ITEMS: {len(zero_stock_items):,}")
    if zero_stock_items:
        print("Sample zero stock items:")
        for item in zero_stock_items[:5]:
            print(f"• {item['title'][:60]} (${item['price']:.2f})")
    
    # Export detailed reports
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Export zero stock items
    if zero_stock_items:
        with open(f'woo_zero_stock_{timestamp}.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Handle', 'Title', 'SKU', 'Price', 'Inventory_Qty', 'Status'])
            for item in zero_stock_items:
                writer.writerow([item['handle'], item['title'], item['sku'], item['price'], item['inventory_qty'], item['status']])
        print(f"\n✅ Zero stock report saved: woo_zero_stock_{timestamp}.csv")
    
    # Export high value items
    if high_value_items:
        with open(f'woo_high_value_{timestamp}.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Handle', 'Title', 'SKU', 'Price', 'Inventory_Qty', 'Inventory_Value', 'Status'])
            for item in high_value_items[:50]:  # Top 50
                writer.writerow([item['handle'], item['title'], item['sku'], item['price'], item['inventory_qty'], item['inventory_value'], item['status']])
        print(f"✅ High value inventory report saved: woo_high_value_{timestamp}.csv")
    
    # Save summary JSON
    summary = {
        'analysis_date': datetime.now().isoformat(),
        'total_products': total_products,
        'total_inventory_value': total_inventory_value,
        'inventory_stats': inventory_stats,
        'price_ranges': dict(price_ranges),
        'zero_stock_count': len(zero_stock_items),
        'high_value_threshold': high_value_items[0]['inventory_value'] if high_value_items else 0
    }
    
    with open(f'woo_inventory_summary_{timestamp}.json', 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"✅ Summary report saved: woo_inventory_summary_{timestamp}.json")
    
    print(f"\n💡 KEY INSIGHTS:")
    if inventory_stats['zero_stock'] > total_products * 0.5:
        print(f"⚠️  WARNING: {inventory_stats['zero_stock']/total_products*100:.1f}% of products have zero stock!")
    
    if total_inventory_value > 1000000:
        print(f"💰 You have over $1M in inventory value - consider inventory optimization")
    
    avg_price = sum(item['price'] for item in inventory_data) / len(inventory_data) if inventory_data else 0
    print(f"📊 Average product price: ${avg_price:.2f}")
    
    print(f"\n🎯 NEXT ACTIONS:")
    print(f"• Review {len(zero_stock_items)} zero-stock items for restocking")
    print(f"• Analyze high-value inventory for sales opportunities")
    print(f"• Consider bundling low-stock items")

if __name__ == "__main__":
    analyze_woocommerce_inventory()