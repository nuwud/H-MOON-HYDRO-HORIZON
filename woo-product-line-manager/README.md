# WooCommerce Product Line Manager

A WordPress/WooCommerce plugin for managing hydroponics product lines, running inventory audits, and enabling special orders.

## Features

### 🔍 **Inventory Auditing**
- Compare your WooCommerce inventory against manufacturer product catalogs
- Identify gaps in product coverage by brand/line
- Track which sizes you stock vs. what's available

### 📦 **Special Orders**
- Display products available for special order that you don't stock
- Customer-facing catalog with filterable brand/category views
- AJAX-powered add-to-cart for special order items

### 📊 **Data Sources Dashboard**
- See all data sources used for product analysis
- Visualize data flow from imports → analysis → output
- Track CSV imports, manufacturer catalogs, and POS data

### ⭐ **Industry Essentials**
- Priority-ranked products (1-3 scale)
- Filter to show only essential products
- Shortcode for homepage/landing page integration

### 🏭 **19 Manufacturer Databases**
Pre-configured catalogs including:
- **Nutrients**: General Hydroponics, Advanced Nutrients, FoxFarm, House & Garden, Canna, Botanicare, Cyco, Athena
- **Lighting**: AC Infinity, Gavita, Fluence, VIVOSUN, MARS HYDRO, Spider Farmer
- **Environmental**: AC Infinity, TrolMaster, Bluelab, Apera
- **Growing Media**: Grodan, Mother Earth

## Installation

1. Upload `woo-product-line-manager` folder to `/wp-content/plugins/`
2. Activate through WordPress admin → Plugins
3. Go to **WooCommerce → Product Lines** to configure

## Requirements

- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+

## Shortcodes

```php
// Display special order catalog
[plm_special_orders layout="accordion" brand="General Hydroponics"]

// Show industry essentials
[plm_essentials limit="20" category="nutrients"]

// Product line filter widget
[plm_product_filter]
```

## REST API

```
GET  /wp-json/plm/v1/manufacturers     # List all manufacturers
GET  /wp-json/plm/v1/manufacturers/:slug  # Get manufacturer details
GET  /wp-json/plm/v1/special-orders    # List special order items
GET  /wp-json/plm/v1/essentials        # Get essential products
POST /wp-json/plm/v1/audit/run         # Run inventory audit (admin only)
```

## Product Meta

The plugin adds two meta fields to WooCommerce products:

- `_plm_manufacturer` - Manufacturer name
- `_plm_product_line` - Product line name

## Development

### File Structure

```
woo-product-line-manager/
├── woo-product-line-manager.php    # Main plugin file
├── includes/
│   ├── class-plm-core.php          # Core plugin class
│   ├── class-plm-loader.php        # Hook loader
│   ├── class-plm-data-manager.php  # Manufacturer data
│   ├── class-plm-audit.php         # Audit engine
│   ├── class-plm-activator.php     # Activation logic
│   ├── class-plm-deactivator.php   # Deactivation logic
│   └── class-plm-i18n.php          # Internationalization
├── admin/
│   ├── class-plm-admin.php         # Admin functionality
│   └── partials/                   # Admin templates
├── public/
│   ├── class-plm-public.php        # Frontend functionality
│   └── partials/                   # Frontend templates
├── api/
│   └── class-plm-rest-api.php      # REST API endpoints
├── assets/
│   ├── css/                        # Stylesheets
│   └── js/                         # JavaScript
└── data/
    ├── manufacturers.json          # Manufacturer database
    └── size-normalization.json     # Size aliases
```

### Hooks

**Actions:**
- `plm_before_audit` - Before audit runs
- `plm_after_audit` - After audit completes
- `plm_special_order_added` - When special order added to cart

**Filters:**
- `plm_manufacturers` - Modify manufacturer list
- `plm_product_lines` - Modify product lines
- `plm_size_aliases` - Modify size normalization
- `plm_essential_threshold` - Change essential priority threshold

## Contributing

This plugin is developed as part of the H-Moon Hydro project.

## License

GPL v2 or later
