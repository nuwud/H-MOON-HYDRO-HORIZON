#!/usr/bin/env python3
"""
Shopify Product Data Exporter
Exports comprehensive product information to CSV/Excel format
"""

import argparse
import csv
import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

class ShopifyProductExporter:
    def __init__(self, shop_domain, access_token=None):
        self.shop_domain = shop_domain.replace('.myshopify.com', '')
        self.base_url = f"https://{self.shop_domain}.myshopify.com"
        self.access_token = access_token
        self.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        if access_token:
            self.headers['X-Shopify-Access-Token'] = access_token

    def get_products(self, limit=250):
        """Fetch all products from Shopify store"""
        products = []
        page_info = None
        
        while True:
            url = f"{self.base_url}/admin/api/2023-10/products.json"
            params = {'limit': limit}
            
            if page_info:
                params['page_info'] = page_info
            
            try:
                if self.access_token:
                    response = requests.get(url, headers=self.headers, params=params)
                else:
                    # For stores without API access, we'll create a template
                    print("⚠️  No API access token provided. Creating template structure...")
                    return self._create_sample_data()
                
                if response.status_code == 200:
                    data = response.json()
                    products.extend(data.get('products', []))
                    
                    # Check for pagination
                    link_header = response.headers.get('Link', '')
                    if 'rel="next"' in link_header:
                        # Extract next page info
                        next_link = [link.strip() for link in link_header.split(',') if 'rel="next"' in link][0]
                        page_info = next_link.split('page_info=')[1].split('>')[0]
                    else:
                        break
                else:
                    print(f"❌ Error fetching products: {response.status_code} - {response.text}")
                    return self._create_sample_data()
                    
            except Exception as e:
                print(f"❌ Exception occurred: {str(e)}")
                return self._create_sample_data()
        
        return products

    def _create_sample_data(self):
        """Create sample data structure for reference"""
        return [{
            'id': 'SAMPLE_ID',
            'title': 'Sample Product Name',
            'handle': 'sample-product-handle',
            'product_type': 'Sample Type',
            'vendor': 'Sample Vendor',
            'status': 'active',
            'created_at': '2023-01-01T00:00:00-00:00',
            'updated_at': '2023-01-01T00:00:00-00:00',
            'published_at': '2023-01-01T00:00:00-00:00',
            'tags': 'sample, tags',
            'variants': [{
                'id': 'SAMPLE_VARIANT_ID',
                'title': 'Default Title',
                'price': '0.00',
                'sku': 'SAMPLE-SKU',
                'inventory_quantity': 0,
                'weight': 0,
                'requires_shipping': True
            }],
            'images': [{
                'id': 'SAMPLE_IMAGE_ID',
                'src': 'https://example.com/sample-image.jpg',
                'alt': 'Sample Image'
            }],
            'options': [{
                'name': 'Title',
                'values': ['Default Title']
            }]
        }]

    def process_product_data(self, products):
        """Process and flatten product data for spreadsheet export"""
        processed_data = []
        
        for product in products:
            # Basic product info
            base_info = {
                'Product_ID': product.get('id', ''),
                'Product_Name': product.get('title', ''),
                'Handle': product.get('handle', ''),
                'Product_Type': product.get('product_type', ''),
                'Vendor': product.get('vendor', ''),
                'Status': product.get('status', ''),
                'Created_Date': self._format_date(product.get('created_at', '')),
                'Updated_Date': self._format_date(product.get('updated_at', '')),
                'Published_Date': self._format_date(product.get('published_at', '')),
                'Tags': product.get('tags', ''),
                'Description': self._clean_html(product.get('body_html', '')),
                'SEO_Title': product.get('seo_title', ''),
                'SEO_Description': product.get('seo_description', ''),
                'Total_Variants': len(product.get('variants', [])),
                'Total_Images': len(product.get('images', [])),
                'Product_URL': f"https://{self.shop_domain}.myshopify.com/products/{product.get('handle', '')}",
                'Admin_URL': f"https://{self.shop_domain}.myshopify.com/admin/products/{product.get('id', '')}"
            }
            
            variants = product.get('variants', [])
            images = product.get('images', [])
            
            if variants:
                for i, variant in enumerate(variants):
                    row = base_info.copy()
                    row.update({
                        'Variant_ID': variant.get('id', ''),
                        'Variant_Title': variant.get('title', ''),
                        'Variant_SKU': variant.get('sku', ''),
                        'Variant_Price': variant.get('price', ''),
                        'Variant_Compare_Price': variant.get('compare_at_price', ''),
                        'Variant_Inventory': variant.get('inventory_quantity', ''),
                        'Variant_Weight': variant.get('weight', ''),
                        'Variant_Weight_Unit': variant.get('weight_unit', ''),
                        'Variant_Requires_Shipping': variant.get('requires_shipping', ''),
                        'Variant_Taxable': variant.get('taxable', ''),
                        'Variant_Barcode': variant.get('barcode', ''),
                        'Variant_Option1': variant.get('option1', ''),
                        'Variant_Option2': variant.get('option2', ''),
                        'Variant_Option3': variant.get('option3', ''),
                    })
                    
                    # Add image info if available
                    if i < len(images):
                        image = images[i]
                        row.update({
                            'Image_ID': image.get('id', ''),
                            'Image_URL': image.get('src', ''),
                            'Image_Alt': image.get('alt', ''),
                            'Image_Position': image.get('position', '')
                        })
                    
                    processed_data.append(row)
            else:
                # Product without variants
                row = base_info.copy()
                if images:
                    image = images[0]
                    row.update({
                        'Image_ID': image.get('id', ''),
                        'Image_URL': image.get('src', ''),
                        'Image_Alt': image.get('alt', ''),
                        'Image_Position': image.get('position', '')
                    })
                processed_data.append(row)
        
        return processed_data

    def _format_date(self, date_str):
        """Format ISO date string to readable format"""
        if not date_str:
            return ''
        try:
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            return date_str

    def _clean_html(self, html_str):
        """Remove HTML tags from description"""
        if not html_str:
            return ''
        import re
        clean = re.compile('<.*?>')
        return re.sub(clean, '', html_str).strip()

    def export_to_csv(self, data, filename=None):
        """Export data to CSV file"""
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"shopify_products_{self.shop_domain}_{timestamp}.csv"
        path = Path(filename)
        if path.parent:
            path.parent.mkdir(parents=True, exist_ok=True)

        if not data:
            print("❌ No data to export")
            return None

        df = pd.DataFrame(data)
        df.to_csv(path, index=False, encoding='utf-8')
        print(f"✅ Data exported to: {path}")
        return str(path)

    def export_to_excel(self, data, filename=None):
        """Export data to Excel file"""
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"shopify_products_{self.shop_domain}_{timestamp}.xlsx"
        path = Path(filename)
        if path.parent:
            path.parent.mkdir(parents=True, exist_ok=True)

        if not data:
            print("❌ No data to export")
            return None

        df = pd.DataFrame(data)
        with pd.ExcelWriter(path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Products', index=False)

            # Auto-adjust column widths
            worksheet = writer.sheets['Products']
            for column in worksheet.columns:
                max_length = 0
                column_letter = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                worksheet.column_dimensions[column_letter].width = adjusted_width

        print(f"✅ Data exported to: {path}")
        return str(path)

def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(description="Export Shopify products to CSV/Excel")
    parser.add_argument("--shop-domain", default=os.environ.get("SHOPIFY_DOMAIN", "h-moon-hydro"), help="Shopify store domain (without .myshopify.com)")
    parser.add_argument("--access-token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN"), help="Shopify Admin API access token")
    parser.add_argument("--csv-output", type=Path, help="Optional path for CSV output")
    parser.add_argument("--excel-output", type=Path, help="Optional path for Excel output")
    parser.add_argument("--no-excel", action="store_true", help="Skip Excel export")
    args = parser.parse_args()

    print("🛍️  Shopify Product Data Exporter")
    print("=" * 50)

    shop_domain = args.shop_domain
    access_token = args.access_token

    if not access_token:
        print("⚠️  No API access token provided; falling back to sample data")

    print(f"📊 Fetching products from: {shop_domain}.myshopify.com")

    # Initialize exporter
    exporter = ShopifyProductExporter(shop_domain, access_token)
    
    # Fetch products
    print("🔄 Fetching product data...")
    products = exporter.get_products()
    
    if not products:
        print("❌ No products found or unable to fetch data")
        return
    
    print(f"✅ Found {len(products)} products")
    
    # Process data
    print("🔄 Processing product data...")
    processed_data = exporter.process_product_data(products)
    print(f"✅ Processed {len(processed_data)} product records")
    
    # Export to both formats
    print("💾 Exporting data...")
    csv_target = args.csv_output if args.csv_output else None
    excel_target = args.excel_output if args.excel_output else None

    csv_file = exporter.export_to_csv(processed_data, filename=str(csv_target) if csv_target else None)
    excel_file = None
    if not args.no_excel:
        excel_file = exporter.export_to_excel(processed_data, filename=str(excel_target) if excel_target else None)
    
    print("\n📋 Export Summary:")
    print(f"• Products found: {len(products)}")
    print(f"• Records exported: {len(processed_data)}")
    if csv_file:
        print(f"• CSV file: {csv_file}")
    if excel_file:
        print(f"• Excel file: {excel_file}")
    
    print("\n💡 Next steps:")
    print("• Review the exported files")
    print("• Add your Shopify private app access token for live data")
    print("• Customize the script for additional fields if needed")

if __name__ == "__main__":
    main()