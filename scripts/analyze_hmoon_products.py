#!/usr/bin/env python3
"""
H-Moon-Hydro Product Data Analyzer (Simplified Version)
Analyzes the exported CSV data without requiring additional libraries
"""

import csv
import json
from datetime import datetime
from collections import defaultdict, Counter

class HMoonProductAnalyzer:
    def __init__(self, csv_file_path):
        """Initialize with the exported CSV file"""
        self.csv_file = csv_file_path
        self.products = []
        self.load_data()
        
    def load_data(self):
        """Load the CSV data"""
        try:
            with open(self.csv_file, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                self.products = list(reader)
            print(f"✅ Loaded {len(self.products)} product records")
            
            # Clean numeric fields
            for product in self.products:
                # Convert price fields
                for field in ['Variant Price', 'Variant Compare At Price', 'Cost per item']:
                    try:
                        product[field] = float(product[field]) if product[field] else 0.0
                    except:
                        product[field] = 0.0
                
                # Convert inventory
                try:
                    product['Variant Inventory Qty'] = int(product['Variant Inventory Qty']) if product['Variant Inventory Qty'] else 0
                except:
                    product['Variant Inventory Qty'] = 0
                    
                # Convert weight
                try:
                    product['Variant Grams'] = float(product['Variant Grams']) if product['Variant Grams'] else 0.0
                except:
                    product['Variant Grams'] = 0.0
            
        except Exception as e:
            print(f"❌ Error loading data: {str(e)}")
            
    def analyze_inventory(self):
        """Analyze inventory levels"""
        out_of_stock = []
        low_stock = []
        total_inventory_value = 0
        
        for product in self.products:
            qty = product['Variant Inventory Qty']
            price = product['Variant Price']
            inventory_value = qty * price
            total_inventory_value += inventory_value
            
            if qty == 0:
                out_of_stock.append({
                    'title': product['Title'],
                    'sku': product['Variant SKU'],
                    'price': price,
                    'handle': product['Handle']
                })
            elif 0 < qty <= 5:
                low_stock.append({
                    'title': product['Title'],
                    'sku': product['Variant SKU'],
                    'quantity': qty,
                    'price': price,
                    'value': inventory_value
                })
        
        return {
            'total_inventory_value': total_inventory_value,
            'out_of_stock': out_of_stock,
            'low_stock': low_stock,
            'out_of_stock_count': len(out_of_stock),
            'low_stock_count': len(low_stock)
        }
    
    def analyze_pricing(self):
        """Analyze pricing patterns"""
        prices = [p['Variant Price'] for p in self.products if p['Variant Price'] > 0]
        sale_items = [p for p in self.products if p['Variant Compare At Price'] > 0]
        no_price = [p for p in self.products if p['Variant Price'] == 0]
        
        if prices:
            avg_price = sum(prices) / len(prices)
            min_price = min(prices)
            max_price = max(prices)
        else:
            avg_price = min_price = max_price = 0
        
        # Calculate average discount for sale items
        total_discount = 0
        discount_count = 0
        for item in sale_items:
            if item['Variant Compare At Price'] > 0:
                discount = ((item['Variant Compare At Price'] - item['Variant Price']) / item['Variant Compare At Price']) * 100
                total_discount += discount
                discount_count += 1
        
        avg_discount = total_discount / discount_count if discount_count > 0 else 0
        
        return {
            'average_price': avg_price,
            'price_range': {'min': min_price, 'max': max_price},
            'sale_items_count': len(sale_items),
            'average_discount': avg_discount,
            'no_price_count': len(no_price),
            'no_price_items': [p['Title'] for p in no_price]
        }
    
    def analyze_content_quality(self):
        """Analyze content completeness"""
        missing_descriptions = []
        missing_images = []
        missing_seo = []
        missing_types = []
        
        for product in self.products:
            title = product['Title']
            
            if not product['Body (HTML)'].strip():
                missing_descriptions.append(title)
            
            if not product['Image Src'].strip():
                missing_images.append(title)
            
            if not product['SEO Title'].strip():
                missing_seo.append(title)
            
            if not product['Type'].strip():
                missing_types.append(title)
        
        return {
            'missing_descriptions': {
                'count': len(missing_descriptions),
                'products': missing_descriptions[:10]  # First 10 for brevity
            },
            'missing_images': {
                'count': len(missing_images),
                'products': missing_images[:10]
            },
            'missing_seo': {
                'count': len(missing_seo),
                'products': missing_seo[:10]
            },
            'missing_types': {
                'count': len(missing_types),
                'products': missing_types[:10]
            }
        }
    
    def analyze_categories(self):
        """Analyze product categories and vendors"""
        vendors = Counter()
        types = Counter()
        tags = Counter()
        statuses = Counter()
        
        for product in self.products:
            if product['Vendor']:
                vendors[product['Vendor']] += 1
            
            if product['Type']:
                types[product['Type']] += 1
            
            if product['Tags']:
                for tag in product['Tags'].split(','):
                    tags[tag.strip()] += 1
            
            statuses[product['Status']] += 1
        
        return {
            'vendors': dict(vendors.most_common(10)),
            'types': dict(types.most_common(10)),
            'popular_tags': dict(tags.most_common(10)),
            'status_distribution': dict(statuses)
        }
    
    def create_summary_report(self):
        """Create comprehensive summary"""
        inventory = self.analyze_inventory()
        pricing = self.analyze_pricing()
        content = self.analyze_content_quality()
        categories = self.analyze_categories()
        
        active_products = len([p for p in self.products if p['Status'] == 'active'])
        published_products = len([p for p in self.products if p['Published'].lower() == 'true'])
        
        return {
            'overview': {
                'total_products': len(self.products),
                'active_products': active_products,
                'published_products': published_products,
                'total_inventory_value': inventory['total_inventory_value']
            },
            'inventory_alerts': {
                'out_of_stock': inventory['out_of_stock_count'],
                'low_stock': inventory['low_stock_count'],
                'critical_products': inventory['out_of_stock'][:5] + inventory['low_stock'][:5]
            },
            'pricing_insights': pricing,
            'content_quality': content,
            'categorization': categories
        }
    
    def export_actionable_reports(self):
        """Export specific actionable reports as CSV files"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 1. Inventory Alerts Report
        inventory = self.analyze_inventory()
        
        # Out of stock report
        if inventory['out_of_stock']:
            with open(f'out_of_stock_products_{timestamp}.csv', 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                writer.writerow(['Product Title', 'SKU', 'Price', 'Handle', 'Product URL'])
                for item in inventory['out_of_stock']:
                    url = f"https://h-moon-hydro.myshopify.com/products/{item['handle']}"
                    writer.writerow([item['title'], item['sku'], f"${item['price']:.2f}", item['handle'], url])
            print(f"📄 Out of stock report: out_of_stock_products_{timestamp}.csv")
        
        # Low stock report
        if inventory['low_stock']:
            with open(f'low_stock_products_{timestamp}.csv', 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                writer.writerow(['Product Title', 'SKU', 'Quantity', 'Price', 'Total Value', 'Handle'])
                for item in inventory['low_stock']:
                    writer.writerow([
                        item['title'], item['sku'], item['quantity'], 
                        f"${item['price']:.2f}", f"${item['value']:.2f}", item.get('handle', '')
                    ])
            print(f"📄 Low stock report: low_stock_products_{timestamp}.csv")
        
        # 2. Content Issues Report
        content = self.analyze_content_quality()
        content_issues = []
        
        for product in self.products:
            issues = []
            if not product['Body (HTML)'].strip():
                issues.append('Missing Description')
            if not product['Image Src'].strip():
                issues.append('Missing Image')
            if not product['SEO Title'].strip():
                issues.append('Missing SEO Title')
            if not product['Type'].strip():
                issues.append('Missing Product Type')
            
            if issues:
                content_issues.append({
                    'title': product['Title'],
                    'handle': product['Handle'],
                    'issues': '; '.join(issues),
                    'admin_url': f"https://h-moon-hydro.myshopify.com/admin/products/{product['Handle']}"
                })
        
        if content_issues:
            with open(f'content_issues_{timestamp}.csv', 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                writer.writerow(['Product Title', 'Handle', 'Issues', 'Admin URL'])
                for item in content_issues:
                    writer.writerow([item['title'], item['handle'], item['issues'], item['admin_url']])
            print(f"📄 Content issues report: content_issues_{timestamp}.csv")
        
        # 3. High Value Products Report
        high_value_products = []
        for product in self.products:
            if product['Variant Inventory Qty'] > 0 and product['Variant Price'] > 0:
                total_value = product['Variant Inventory Qty'] * product['Variant Price']
                if total_value > 100:  # Products worth more than $100 in inventory
                    high_value_products.append({
                        'title': product['Title'],
                        'sku': product['Variant SKU'],
                        'quantity': product['Variant Inventory Qty'],
                        'price': product['Variant Price'],
                        'total_value': total_value
                    })
        
        # Sort by total value descending
        high_value_products.sort(key=lambda x: x['total_value'], reverse=True)
        
        if high_value_products:
            with open(f'high_value_inventory_{timestamp}.csv', 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                writer.writerow(['Product Title', 'SKU', 'Quantity', 'Unit Price', 'Total Value'])
                for item in high_value_products[:50]:  # Top 50
                    writer.writerow([
                        item['title'], item['sku'], item['quantity'],
                        f"${item['price']:.2f}", f"${item['total_value']:.2f}"
                    ])
            print(f"📄 High value inventory: high_value_inventory_{timestamp}.csv")
        
        return timestamp

def main():
    """Main execution function"""
    print("🌙 H-Moon-Hydro Product Data Analyzer")
    print("=" * 50)
    
    csv_file = "products_export_1.csv"
    
    try:
        # Initialize analyzer
        analyzer = HMoonProductAnalyzer(csv_file)
        
        # Generate comprehensive report
        summary = analyzer.create_summary_report()
        
        # Save summary as JSON
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        with open(f'h_moon_analysis_summary_{timestamp}.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, default=str)
        
        # Export actionable CSV reports
        report_timestamp = analyzer.export_actionable_reports()
        
        # Print key insights
        print("\n📊 KEY INSIGHTS:")
        print(f"📦 Total Products: {summary['overview']['total_products']}")
        print(f"✅ Active Products: {summary['overview']['active_products']}")
        print(f"💰 Total Inventory Value: ${summary['overview']['total_inventory_value']:,.2f}")
        
        print(f"\n⚠️  INVENTORY ALERTS:")
        print(f"❌ Out of Stock: {summary['inventory_alerts']['out_of_stock']} products")
        print(f"📉 Low Stock (≤5): {summary['inventory_alerts']['low_stock']} products")
        
        print(f"\n💵 PRICING INSIGHTS:")
        print(f"📊 Average Price: ${summary['pricing_insights']['average_price']:.2f}")
        print(f"📈 Price Range: ${summary['pricing_insights']['price_range']['min']:.2f} - ${summary['pricing_insights']['price_range']['max']:.2f}")
        print(f"🏷️  Sale Items: {summary['pricing_insights']['sale_items_count']} products")
        
        print(f"\n📝 CONTENT QUALITY:")
        print(f"📄 Missing Descriptions: {summary['content_quality']['missing_descriptions']['count']}")
        print(f"🖼️  Missing Images: {summary['content_quality']['missing_images']['count']}")
        print(f"🔍 Missing SEO: {summary['content_quality']['missing_seo']['count']}")
        
        print(f"\n📂 TOP CATEGORIES:")
        for vendor, count in list(summary['categorization']['vendors'].items())[:5]:
            print(f"• {vendor}: {count} products")
        
        print(f"\n✅ REPORTS GENERATED:")
        print(f"📊 Summary: h_moon_analysis_summary_{timestamp}.json")
        print(f"📄 Actionable CSVs: Check files with timestamp {report_timestamp}")
        
        print(f"\n💡 NEXT STEPS:")
        print("1. Review out-of-stock and low-stock reports")
        print("2. Update missing product content (descriptions, images, SEO)")
        print("3. Check high-value inventory for optimization opportunities")
        print("4. Consider promotional strategies for sale items")
        
    except FileNotFoundError:
        print(f"❌ Could not find {csv_file}")
        print("Please ensure the CSV file is in the current directory")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    main()