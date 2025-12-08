# Shopify Product Data Export Guide

## Method 1: Admin Dashboard Export (Easiest)

### Steps:
1. **Go to your Shopify Admin**: https://h-moon-hydro.myshopify.com/admin
2. **Navigate to Products**: Products → All products
3. **Export Products**: Click "Export" button
4. **Choose export options**:
   - Export: All products
   - Export as: CSV for Excel, CSV for Numbers, or Plain CSV
   - Include: Select what fields to include

### What you'll get:
- Product Handle
- Product Title  
- Product Description
- Product Type
- Vendor
- Tags
- Published
- Variant SKU
- Variant Grams
- Variant Inventory Tracker
- Variant Inventory Qty
- Variant Inventory Policy
- Variant Fulfillment Service
- Variant Price
- Variant Compare at Price
- Variant Requires Shipping
- Variant Taxable
- Variant Barcode
- Image Src
- Image Position
- Image Alt Text
- Gift Card
- SEO Title
- SEO Description
- Google Shopping / Google Product Category
- Google Shopping / Gender
- Google Shopping / Age Group
- Google Shopping / MPN
- Google Shopping / AdWords Grouping
- Google Shopping / AdWords Labels
- Google Shopping / Condition
- Google Shopping / Custom Product
- Google Shopping / Custom Label 0
- Google Shopping / Custom Label 1
- Google Shopping / Custom Label 2
- Google Shopping / Custom Label 3
- Google Shopping / Custom Label 4
- Variant Image
- Variant Weight Unit
- Variant Tax Code
- Cost per item
- Status

## Method 2: Python Script (Most Comprehensive)

### Prerequisites:
```bash
pip install pandas openpyxl requests
```

### Running the Script:
```bash
python export_products.py
```

### For Live Data Access:
1. **Create a Private App** in your Shopify Admin:
   - Go to Apps → App and sales channel settings → Develop apps
   - Create an app with Product read permissions
   - Get the access token
   - Add it to the script

## Method 3: Shopify CLI + GraphQL (Advanced)

### Query Example:
```graphql
{
  products(first: 250) {
    edges {
      node {
        id
        title
        handle
        productType
        vendor
        status
        createdAt
        updatedAt
        publishedAt
        tags
        description
        seo {
          title
          description
        }
        variants(first: 100) {
          edges {
            node {
              id
              title
              price
              sku
              inventoryQuantity
              weight
              weightUnit
            }
          }
        }
        images(first: 10) {
          edges {
            node {
              id
              src
              altText
            }
          }
        }
      }
    }
  }
}
```

## Method 4: Third-Party Apps

### Recommended Apps:
- **EZ Exporter**: Advanced export with custom fields
- **Shopify Flow**: Automate exports
- **Matrixify**: Bulk export/import with extensive options

## Data Fields Available:

### Product Level:
- Product ID
- Product Name/Title
- Handle (URL slug)
- Description (HTML and plain text)
- Product Type
- Vendor
- Tags
- Status (active/draft/archived)
- Created/Updated/Published dates
- SEO title and description
- Images
- Options (Size, Color, etc.)

### Variant Level:
- Variant ID
- SKU
- Barcode
- Price and Compare at Price
- Weight and dimensions
- Inventory quantity
- Fulfillment service
- Tax settings
- Shipping requirements

### Additional Metadata:
- Collections
- Metafields (custom data)
- Inventory tracking
- Google Shopping data
- Tax codes
- Cost per item

## Output Formats:
- **CSV**: Universal compatibility
- **Excel**: Better formatting and multiple sheets
- **JSON**: For developers/integrations
- **XML**: For specialized systems