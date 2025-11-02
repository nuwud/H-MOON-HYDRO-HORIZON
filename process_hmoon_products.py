#!/usr/bin/env python3
"""
H-Moon-Hydro Product Data Processor
Processes the exported CSV data and creates enhanced analytics and reports
"""

import pandas as pd
import numpy as np
from datetime import datetime
import re
import json
from urllib.parse import urlparse

class HMoonProductProcessor:
    def __init__(self, csv_file_path):
        """Initialize with the exported CSV file"""
        self.csv_file = csv_file_path
        self.df = None
        self.load_data()
        
    def load_data(self):
        """Load and clean the CSV data"""
        try:
            self.df = pd.read_csv(self.csv_file)
            print(f"✅ Loaded {len(self.df)} product records")
            
            # Clean and standardize data
            self.df = self.df.fillna('')
            
            # Convert numeric columns
            numeric_columns = ['Variant Grams', 'Variant Inventory Qty', 'Variant Price', 
                             'Variant Compare At Price', 'Cost per item']
            for col in numeric_columns:
                if col in self.df.columns:
                    self.df[col] = pd.to_numeric(self.df[col], errors='coerce').fillna(0)
            
            # Convert boolean columns
            bool_columns = ['Published', 'Variant Requires Shipping', 'Variant Taxable', 'Gift Card']
            for col in bool_columns:
                if col in self.df.columns:
                    self.df[col] = self.df[col].astype(str).str.lower().isin(['true', '1', 'yes'])
            
            print(f"📊 Data cleaned and standardized")
            
        except Exception as e:
            print(f"❌ Error loading data: {str(e)}")
            
    def create_product_summary(self):
        """Create a comprehensive product summary"""
        if self.df is None:
            return None
            
        summary = {
            'total_products': len(self.df),
            'active_products': len(self.df[self.df['Status'] == 'active']),
            'published_products': len(self.df[self.df['Published'] == True]),
            'total_inventory_value': (self.df['Variant Price'] * self.df['Variant Inventory Qty']).sum(),
            'average_price': self.df['Variant Price'].mean(),
            'price_range': {
                'min': self.df['Variant Price'].min(),
                'max': self.df['Variant Price'].max()
            },
            'inventory_summary': {
                'total_units': self.df['Variant Inventory Qty'].sum(),
                'out_of_stock': len(self.df[self.df['Variant Inventory Qty'] == 0]),
                'low_stock': len(self.df[(self.df['Variant Inventory Qty'] > 0) & (self.df['Variant Inventory Qty'] <= 5)])
            }
        }
        
        return summary
    
    def analyze_pricing(self):
        """Analyze pricing patterns and opportunities"""
        pricing_analysis = {}
        
        # Products with compare-at pricing (sale items)
        sale_items = self.df[self.df['Variant Compare At Price'] > 0]
        pricing_analysis['sale_items'] = {
            'count': len(sale_items),
            'average_discount': ((sale_items['Variant Compare At Price'] - sale_items['Variant Price']) / sale_items['Variant Compare At Price'] * 100).mean()
        }
        
        # Price distribution by product type
        if 'Type' in self.df.columns:
            price_by_type = self.df.groupby('Type')['Variant Price'].agg(['mean', 'count', 'min', 'max']).round(2)
            pricing_analysis['by_type'] = price_by_type.to_dict('index')
        
        # Products without pricing (potential issues)
        no_price = self.df[self.df['Variant Price'] == 0]
        pricing_analysis['no_price_items'] = {
            'count': len(no_price),
            'products': no_price['Title'].tolist()
        }
        
        return pricing_analysis
    
    def analyze_inventory(self):
        """Analyze inventory levels and identify issues"""
        inventory_analysis = {}
        
        # Critical inventory levels
        out_of_stock = self.df[self.df['Variant Inventory Qty'] == 0]
        low_stock = self.df[(self.df['Variant Inventory Qty'] > 0) & (self.df['Variant Inventory Qty'] <= 5)]
        good_stock = self.df[self.df['Variant Inventory Qty'] > 20]
        
        inventory_analysis['alerts'] = {
            'out_of_stock': {
                'count': len(out_of_stock),
                'products': out_of_stock[['Title', 'Variant SKU', 'Variant Price']].to_dict('records')
            },
            'low_stock': {
                'count': len(low_stock),
                'products': low_stock[['Title', 'Variant SKU', 'Variant Inventory Qty', 'Variant Price']].to_dict('records')
            },
            'overstocked': {
                'count': len(good_stock),
                'total_value': (good_stock['Variant Price'] * good_stock['Variant Inventory Qty']).sum()
            }
        }
        
        # Inventory value analysis
        inventory_analysis['value_analysis'] = {
            'total_inventory_value': (self.df['Variant Price'] * self.df['Variant Inventory Qty']).sum(),
            'dead_stock_value': (out_of_stock['Variant Price'] * out_of_stock['Variant Inventory Qty']).sum(),
            'average_item_value': self.df['Variant Price'].mean()
        }
        
        return inventory_analysis
    
    def analyze_content_quality(self):
        """Analyze content completeness and quality"""
        content_analysis = {}
        
        # Missing content identification
        missing_descriptions = self.df[self.df['Body (HTML)'].str.strip() == '']
        missing_images = self.df[self.df['Image Src'].str.strip() == '']
        missing_seo = self.df[self.df['SEO Title'].str.strip() == '']
        missing_types = self.df[self.df['Type'].str.strip() == '']
        
        content_analysis['missing_content'] = {
            'descriptions': {
                'count': len(missing_descriptions),
                'products': missing_descriptions['Title'].tolist()
            },
            'images': {
                'count': len(missing_images),
                'products': missing_images['Title'].tolist()
            },
            'seo_titles': {
                'count': len(missing_seo),
                'products': missing_seo['Title'].tolist()
            },
            'product_types': {
                'count': len(missing_types),
                'products': missing_types['Title'].tolist()
            }
        }
        
        # Content quality scores
        self.df['content_score'] = 0
        self.df['content_score'] += (self.df['Body (HTML)'].str.strip() != '').astype(int) * 25  # Description
        self.df['content_score'] += (self.df['Image Src'].str.strip() != '').astype(int) * 25   # Image
        self.df['content_score'] += (self.df['SEO Title'].str.strip() != '').astype(int) * 25   # SEO
        self.df['content_score'] += (self.df['Type'].str.strip() != '').astype(int) * 25        # Type
        
        content_analysis['quality_distribution'] = {
            'excellent_100': len(self.df[self.df['content_score'] == 100]),
            'good_75_99': len(self.df[(self.df['content_score'] >= 75) & (self.df['content_score'] < 100)]),
            'fair_50_74': len(self.df[(self.df['content_score'] >= 50) & (self.df['content_score'] < 75)]),
            'poor_below_50': len(self.df[self.df['content_score'] < 50])
        }
        
        return content_analysis
    
    def create_enhanced_spreadsheet(self, output_file=None):
        """Create enhanced Excel file with multiple analysis sheets"""
        if output_file is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = f"h_moon_hydro_enhanced_analysis_{timestamp}.xlsx"
        
        # Calculate additional metrics
        self.df['Inventory_Value'] = self.df['Variant Price'] * self.df['Variant Inventory Qty']
        self.df['Profit_Margin'] = np.where(
            self.df['Cost per item'] > 0,
            ((self.df['Variant Price'] - self.df['Cost per item']) / self.df['Variant Price'] * 100).round(2),
            0
        )
        self.df['Discount_Percent'] = np.where(
            self.df['Variant Compare At Price'] > 0,
            ((self.df['Variant Compare At Price'] - self.df['Variant Price']) / self.df['Variant Compare At Price'] * 100).round(2),
            0
        )
        
        # Create URLs for easy access
        self.df['Product_URL'] = 'https://h-moon-hydro.myshopify.com/products/' + self.df['Handle']
        self.df['Admin_URL'] = 'https://h-moon-hydro.myshopify.com/admin/products/' + self.df['Handle'].str.extract(r'(\d+)').fillna('')
        
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            # Main product data with enhancements
            self.df.to_excel(writer, sheet_name='Products_Enhanced', index=False)
            
            # Summary analytics
            summary = self.create_product_summary()
            summary_df = pd.DataFrame(list(summary.items()), columns=['Metric', 'Value'])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Inventory alerts
            inventory_analysis = self.analyze_inventory()
            
            # Out of stock products
            out_of_stock = self.df[self.df['Variant Inventory Qty'] == 0][
                ['Title', 'Variant SKU', 'Variant Price', 'Handle', 'Status']
            ]
            out_of_stock.to_excel(writer, sheet_name='Out_of_Stock', index=False)
            
            # Low stock products
            low_stock = self.df[
                (self.df['Variant Inventory Qty'] > 0) & (self.df['Variant Inventory Qty'] <= 5)
            ][['Title', 'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Inventory_Value']]
            low_stock.to_excel(writer, sheet_name='Low_Stock', index=False)
            
            # High value products
            high_value = self.df.nlargest(20, 'Inventory_Value')[
                ['Title', 'Variant Price', 'Variant Inventory Qty', 'Inventory_Value']
            ]
            high_value.to_excel(writer, sheet_name='High_Value_Inventory', index=False)
            
            # Content quality issues
            content_issues = self.df[self.df['content_score'] < 100][
                ['Title', 'Handle', 'content_score', 'Body (HTML)', 'Image Src', 'SEO Title', 'Type']
            ]
            content_issues.to_excel(writer, sheet_name='Content_Issues', index=False)
            
            # Pricing analysis
            pricing_data = self.df[self.df['Variant Compare At Price'] > 0][
                ['Title', 'Variant Price', 'Variant Compare At Price', 'Discount_Percent']
            ]
            pricing_data.to_excel(writer, sheet_name='Sale_Items', index=False)
            
        print(f"✅ Enhanced analysis exported to: {output_file}")
        return output_file
    
    def generate_reports(self):
        """Generate comprehensive analysis reports"""
        reports = {}
        
        reports['summary'] = self.create_product_summary()
        reports['pricing'] = self.analyze_pricing()
        reports['inventory'] = self.analyze_inventory()
        reports['content'] = self.analyze_content_quality()
        
        # Save reports as JSON
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        reports_file = f"h_moon_hydro_reports_{timestamp}.json"
        
        with open(reports_file, 'w') as f:
            json.dump(reports, f, indent=2, default=str)
        
        print(f"✅ Analysis reports saved to: {reports_file}")
        
        return reports

def main():
    """Main execution function"""
    print("🌙 H-Moon-Hydro Product Data Processor")
    print("=" * 50)
    
    # Use the downloaded CSV file
    csv_file = "products_export_1.csv"
    
    try:
        # Initialize processor
        processor = HMoonProductProcessor(csv_file)
        
        # Generate enhanced spreadsheet
        excel_file = processor.create_enhanced_spreadsheet()
        
        # Generate analysis reports
        reports = processor.generate_reports()
        
        # Print summary
        print("\n📊 Analysis Summary:")
        summary = reports['summary']
        print(f"• Total Products: {summary['total_products']}")
        print(f"• Active Products: {summary['active_products']}")
        print(f"• Total Inventory Value: ${summary['total_inventory_value']:,.2f}")
        print(f"• Average Price: ${summary['average_price']:.2f}")
        
        print(f"\n⚠️  Inventory Alerts:")
        inventory = reports['inventory']
        print(f"• Out of Stock: {inventory['alerts']['out_of_stock']['count']} products")
        print(f"• Low Stock: {inventory['alerts']['low_stock']['count']} products")
        
        print(f"\n📝 Content Issues:")
        content = reports['content']
        print(f"• Missing Descriptions: {content['missing_content']['descriptions']['count']}")
        print(f"• Missing Images: {content['missing_content']['images']['count']}")
        print(f"• Missing SEO Titles: {content['missing_content']['seo_titles']['count']}")
        
        print(f"\n✅ Files Generated:")
        print(f"• Enhanced Excel: {excel_file}")
        print(f"• Analysis Reports: Available in JSON format")
        
    except FileNotFoundError:
        print(f"❌ Could not find {csv_file}")
        print("Please ensure the CSV file is in the current directory")
    except Exception as e:
        print(f"❌ Error processing data: {str(e)}")

if __name__ == "__main__":
    main()