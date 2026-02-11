# H-Moon Product Enricher

WooCommerce plugin to enrich product data from manufacturer websites directly from the product editor.

## Features

- **One-Click Enrichment**: Search and fetch product data from within the WooCommerce product editor
- **Multi-Source Support**: Pre-configured for major hydroponics manufacturers:
  - Advanced Nutrients
  - General Hydroponics
  - Fox Farm
  - Botanicare
  - AC Infinity
  - Spider Farmer
  - Hydrofarm
  - Gorilla Grow Tent
- **Retailer Fallbacks**: HTG Supply, Growershouse, Hydrobuilder
- **Auto-Detect Manufacturer**: Automatically detects manufacturer from product name/brand
- **Selective Updates**: Choose which fields to update (image, weight, description, dimensions)
- **Activity Logging**: Track all enrichment activity

## Installation

1. Upload the `hmoon-product-enricher` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Navigate to WooCommerce > Enricher for settings

## Usage

### Single Product Enrichment

1. Edit any WooCommerce product
2. Find the "🔍 Product Data Enricher" metabox in the right sidebar
3. Review the current data status (shows ✅/⚠️/❌ for each field)
4. Adjust the search query if needed
5. Select a source (or leave on "Auto-detect")
6. Click "🔍 Search for Product Data"
7. Either:
   - Use the automatically found data, OR
   - Click a search link to find data manually, then paste the URL
8. Check the boxes for fields you want to update
9. Click "✅ Apply Selected Updates"

### Manual URL Fetch

If automatic search doesn't find data:

1. Click one of the search links to open manufacturer/retailer sites
2. Find the product page
3. Copy the URL
4. Paste it in the "Or paste product URL" field
5. Click "📥 Fetch from URL"
6. Review and edit the extracted data
7. Click "✅ Apply to Product"

## Data Extracted

The plugin attempts to extract:

- **Product Image**: Main product image (og:image or product image container)
- **Weight**: Shipping weight (with unit conversion)
- **Description**: Product description (og:description or description div)
- **Dimensions**: Length, width, height if available

## Weight Unit Conversion

Weights are automatically converted to WooCommerce store units:
- kg → lbs (×2.20462)
- g → lbs (÷453.592)
- oz → lbs (÷16)

## Settings

Navigate to **WooCommerce > 🔍 Enricher** to:
- View enrichment activity log
- See counts of products missing data
- Access bulk enrichment tools (coming soon)

## Extending

### Adding New Manufacturers

Edit `hmoon-product-enricher.php` and add to the `$manufacturers` array:

```php
'new-manufacturer' => [
    'name' => 'New Manufacturer',
    'search_url' => 'https://example.com/search?q=%s',
    'product_pattern' => '/example\.com\/product\//',
    'logo' => '🏭',
],
```

### Custom Scraping Logic

Override the `scrape_product_page()` method or add custom selectors for specific sites.

## Changelog

### 1.0.0
- Initial release
- Product editor metabox
- Manufacturer search configurations
- URL scraping with DOM parsing
- Weight unit conversion
- Activity logging
- Settings page

## Requirements

- WordPress 5.8+
- WooCommerce 5.0+
- PHP 7.4+

## License

GPL v2 or later
