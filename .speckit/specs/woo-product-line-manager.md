# WooCommerce Product Line Manager Plugin

## Specification v1.0

**Status:** Draft  
**Author:** AI Assistant / Nuwud  
**Date:** 2026-01-19  
**Plugin Slug:** `woo-product-line-manager`

---

## 1. Overview

### 1.1 Problem Statement
Hydroponic retailers need to:
- Track which product sizes they carry vs. manufacturer full catalogs
- Offer special orders for sizes not in stock
- Understand competitive positioning against industry-standard product lines
- Identify gaps and opportunities in their inventory
- Access this data both in admin and potentially on frontend

### 1.2 Solution
A WooCommerce plugin that:
1. Maintains a **manufacturer product database** with complete size offerings
2. **Audits current inventory** against manufacturer catalogs
3. Generates **special order opportunities** 
4. Creates **distributor order lists** for restocking
5. Provides **admin dashboard** with filters and reports
6. Optionally exposes **frontend special order catalog**

---

## 2. Data Architecture

### 2.1 Manufacturer Database (Custom Post Type or JSON)

```php
// Option A: Custom Post Type
'hmh_manufacturer' => [
    'name' => 'General Hydroponics',
    'distributor' => 'Hawthorne',
    'website' => 'https://generalhydroponics.com',
    'contact' => '',
]

'hmh_product_line' => [
    'manufacturer_id' => 123,
    'name' => 'Flora Series (FloraGro, FloraBloom, FloraMicro)',
    'type' => 'liquid', // liquid, dry, soil, kit
    'sizes' => ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
    'priority' => 1, // 1=essential, 2=important, 3=optional
    'notes' => 'Core 3-part - essential stock',
    'match_patterns' => ['flora.*gro', 'flora.*bloom', 'flora.*micro'],
]

// Option B: JSON Config (simpler, version-controlled)
// /wp-content/plugins/woo-product-line-manager/data/manufacturers.json
```

### 2.2 Product Meta Fields

```php
// Added to WooCommerce products
'_hmh_manufacturer' => 'General Hydroponics',
'_hmh_product_line' => 'Flora Series',
'_hmh_normalized_size' => 'Quart',
'_hmh_audit_status' => 'in_stock', // in_stock, special_order, discontinued
'_hmh_last_audit' => '2026-01-19',
```

### 2.3 Data Sources Reference

```php
// Track where product data came from
'hmh_data_sources' => [
    'shopify_export' => [
        'file' => 'outputs/shopify_complete_import.csv',
        'rows' => 4727,
        'date' => '2025-12-31',
    ],
    'woocommerce_export' => [
        'file' => 'CSVs/WooExport/Products-Export-2025-Dec-31.csv',
        'rows' => 1481,
        'date' => '2025-12-31',
    ],
    'pos_inventory' => [
        'file' => 'CSVs/HMoonHydro_Inventory.csv',
        'rows' => 157,
        'date' => '2025-12-15',
    ],
    'manufacturer_catalogs' => [
        'general_hydroponics' => 'https://generalhydroponics.com/products',
        'advanced_nutrients' => 'https://advancednutrients.com',
        // ... etc
    ],
]
```

---

## 3. Plugin Structure

```
woo-product-line-manager/
├── woo-product-line-manager.php          # Main plugin file
├── readme.txt                             # WordPress.org readme
├── assets/
│   ├── css/
│   │   ├── admin.css
│   │   └── frontend.css
│   └── js/
│       ├── admin.js
│       └── frontend.js
├── data/
│   ├── manufacturers.json                 # Manufacturer database
│   ├── size-normalization.json            # Size aliases/conversions
│   └── data-sources.json                  # Reference sources
├── includes/
│   ├── class-plm-activator.php
│   ├── class-plm-deactivator.php
│   ├── class-plm-loader.php
│   ├── class-plm-i18n.php
│   └── class-plm-core.php
├── admin/
│   ├── class-plm-admin.php
│   ├── class-plm-dashboard.php
│   ├── class-plm-settings.php
│   ├── class-plm-audit.php
│   ├── class-plm-reports.php
│   └── partials/
│       ├── dashboard-display.php
│       ├── audit-display.php
│       ├── settings-display.php
│       └── reports-display.php
├── public/
│   ├── class-plm-public.php
│   ├── class-plm-special-orders.php
│   └── partials/
│       ├── special-order-catalog.php
│       └── product-line-filter.php
├── api/
│   └── class-plm-rest-api.php             # REST API endpoints
└── cli/
    └── class-plm-cli.php                  # WP-CLI commands
```

---

## 4. Features

### 4.1 Admin Dashboard

**Location:** WooCommerce > Product Lines

**Tabs:**
1. **Overview** - Summary stats, quick actions
2. **Audit** - Run inventory audit, view gaps
3. **Manufacturers** - Manage manufacturer database
4. **Special Orders** - Configure special order catalog
5. **Reports** - Generate distributor orders, exports
6. **Data Sources** - View/manage data sources used
7. **Settings** - Plugin configuration

### 4.2 Admin Features

```php
// Dashboard Widget
- Total manufacturers tracked: 19
- Product lines in database: 167
- Your coverage: 10 partial, 0 complete
- Special order opportunities: 157 items

// Quick Filters on Products List
- Filter by: Manufacturer, Product Line, Audit Status, Size
- Bulk actions: Run audit, Set status, Export

// Product Edit Screen
- Meta box showing: Matched line, available sizes, gaps
- Quick link to manufacturer catalog
```

### 4.3 Frontend Features

```php
// Shortcode: Special Order Catalog
[plm_special_orders brand="all" show_sizes="true"]

// Shortcode: Product Line Filter (for shop page)
[plm_product_filter show_manufacturers="true" show_lines="true"]

// Widget: Product Line Browser
- Accordion by manufacturer
- Links to shop filtered by line

// Single Product: "Other sizes available"
- Shows sizes available for special order
- "Request Quote" button
```

### 4.4 WP-CLI Commands

```bash
# Run full audit
wp plm audit --output=json

# Export distributor orders
wp plm export orders --distributor=hawthorne --format=csv

# Update manufacturer database from JSON
wp plm import manufacturers --file=manufacturers.json

# Sync product meta from audit
wp plm sync products --dry-run

# Show data sources
wp plm sources list
```

### 4.5 REST API

```
GET  /wp-json/plm/v1/manufacturers
GET  /wp-json/plm/v1/manufacturers/{id}/lines
GET  /wp-json/plm/v1/audit
POST /wp-json/plm/v1/audit/run
GET  /wp-json/plm/v1/special-orders
GET  /wp-json/plm/v1/sources
```

---

## 5. Data Sources Panel

### 5.1 Admin UI

**WooCommerce > Product Lines > Data Sources**

| Source | Type | Records | Last Updated | Actions |
|--------|------|---------|--------------|---------|
| Shopify Import | CSV | 4,727 | 2025-12-31 | View / Re-import |
| WooCommerce Export | CSV | 1,481 | 2025-12-31 | View / Refresh |
| POS Inventory | CSV | 157 | 2025-12-15 | View / Re-import |
| GH Catalog | Web | 45 | 2026-01-01 | View / Scrape |
| AN Catalog | Web | 38 | 2026-01-01 | View / Scrape |

### 5.2 Source Types

- **CSV Import** - Local files that were imported
- **Database** - WooCommerce product table
- **API** - External APIs (manufacturer, distributor)
- **Web Scrape** - Manufacturer website catalogs
- **Manual** - Hand-entered data

---

## 6. Top Products Feature

### 6.1 "Industry Essentials" Filter

Products marked as priority 1-2 across manufacturers get special treatment:

```php
// Product attribute or tag
'_hmh_industry_essential' => true
'_hmh_essential_rank' => 15 // 1-100

// WooCommerce filter integration
- Shop page filter: "Show Industry Essentials"
- Widget: "Top Products by Category"
- Shortcode: [plm_essentials category="nutrients" limit="10"]
```

### 6.2 Essential Products List (Pre-configured)

| Rank | Brand | Product | Why Essential |
|------|-------|---------|---------------|
| 1 | GH | Flora Series | Most recognized 3-part |
| 2 | GH | pH Up/Down | Every grower needs |
| 3 | Botanicare | Cal-Mag Plus | Universal supplement |
| 4 | AN | Big Bud | Top bloom booster |
| 5 | Fox Farm | Trio | Organic favorite |
| 6 | GH | CALiMAGic | GH users' cal-mag |
| 7 | Canna | Coco A&B | Coco standard |
| 8 | H&G | Roots Excelurator | Premium root stim |
| 9 | AN | Voodoo Juice | Beneficial bacteria |
| 10 | Athena | Pro Line | Commercial growers |

---

## 7. Database Schema

### 7.1 Custom Tables (optional, for performance)

```sql
-- If not using CPT, use custom tables
CREATE TABLE {prefix}plm_manufacturers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    distributor VARCHAR(255),
    website VARCHAR(500),
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE {prefix}plm_product_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    manufacturer_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    type ENUM('liquid', 'dry', 'soil', 'kit', 'equipment'),
    sizes JSON, -- ['Pint', 'Quart', 'Gallon']
    priority TINYINT DEFAULT 3,
    notes TEXT,
    match_patterns JSON, -- regex patterns to match products
    FOREIGN KEY (manufacturer_id) REFERENCES {prefix}plm_manufacturers(id)
);

CREATE TABLE {prefix}plm_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED,
    line_id BIGINT UNSIGNED,
    status ENUM('matched', 'partial', 'missing', 'discontinued'),
    matched_size VARCHAR(100),
    audit_date DATETIME,
    notes TEXT
);

CREATE TABLE {prefix}plm_data_sources (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('csv', 'database', 'api', 'web', 'manual'),
    location VARCHAR(500),
    record_count INT,
    last_sync DATETIME,
    metadata JSON
);
```

---

## 8. Settings

### 8.1 General Settings

```php
[
    'enable_special_orders' => true,
    'special_order_email' => 'orders@hmoonhydro.com',
    'show_sizes_on_product' => true,
    'enable_product_filter' => true,
    'default_lead_time' => '3-7 business days',
    'enable_rest_api' => true,
]
```

### 8.2 Audit Settings

```php
[
    'auto_audit_on_import' => true,
    'audit_schedule' => 'weekly',
    'match_threshold' => 0.8, // fuzzy match threshold
    'size_normalization' => true,
]
```

### 8.3 Display Settings

```php
[
    'catalog_layout' => 'accordion', // accordion, grid, table
    'show_distributor' => false, // hide from customers
    'show_notes' => true,
    'group_by' => 'manufacturer', // manufacturer, category, type
]
```

---

## 9. Implementation Phases

### Phase 1: Core (MVP)
- [ ] Plugin scaffold with WordPress standards
- [ ] Manufacturer JSON database
- [ ] Basic audit functionality
- [ ] Admin dashboard with overview
- [ ] Data sources viewer

### Phase 2: Integration
- [ ] Product meta fields
- [ ] WooCommerce product list filters
- [ ] Product edit meta box
- [ ] Import/export tools

### Phase 3: Frontend
- [ ] Special order catalog shortcode
- [ ] Product page "other sizes" display
- [ ] Request quote functionality
- [ ] Product line filter widget

### Phase 4: Advanced
- [ ] REST API
- [ ] WP-CLI commands
- [ ] Scheduled audits
- [ ] Email notifications
- [ ] Distributor order PDF export

---

## 10. File References

### Current Scripts (to integrate)
- `scripts/expanded_product_line_audit.js` - Full audit logic
- `scripts/smart_weight_finder.js` - Weight estimation
- `scripts/product_line_size_audit.js` - Size gap analysis

### Output Data (seed data for plugin)
- `outputs/product_lines/expanded_audit_*.json` - Audit results
- `outputs/product_lines/special_order_catalog_*.csv` - Catalog data
- `outputs/product_lines/distributor_orders_*.json` - Order lists

---

## 11. Dependencies

- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+

### Optional
- WP-CLI (for CLI commands)
- Action Scheduler (for background tasks)

---

## 12. Security Considerations

- Nonce verification on all forms
- Capability checks (manage_woocommerce)
- Sanitize all inputs
- Escape all outputs
- REST API authentication
- Rate limiting on quote requests

---

## 13. Testing Plan

- Unit tests for audit logic
- Integration tests for WooCommerce hooks
- E2E tests for admin workflows
- Accessibility testing for frontend

---

## Appendix A: Size Normalization Map

```json
{
  "aliases": {
    "qt": "Quart",
    "pt": "Pint",
    "gal": "Gallon",
    "l": "L",
    "ml": "ml",
    "oz": "oz",
    "lb": "lb"
  },
  "conversions": {
    "32 oz": "Quart",
    "16 oz": "Pint",
    "128 oz": "Gallon",
    "3.78L": "Gallon",
    "946ml": "Quart"
  }
}
```

---

## Appendix B: Manufacturer Distributor Reference

| Manufacturer | Primary Distributor | Account Needed |
|--------------|---------------------|----------------|
| General Hydroponics | Hawthorne | Yes |
| Advanced Nutrients | Direct | Yes |
| Fox Farm | Sunlight Supply | Yes |
| Botanicare | Hawthorne | Yes |
| Canna | Hydrofarm | Yes |
| House & Garden | Direct | Yes |
| Athena | Direct | Yes |
| Nectar for the Gods | Oregon's Only | Yes |
| Roots Organics | Aurora Innovations | Yes |

---

*End of Specification*
