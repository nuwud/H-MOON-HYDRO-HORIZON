# SPEC: DATA-001 — SQLite Master Product Database

## Status: 📋 SPECIFICATION COMPLETE

## Overview
A local SQLite database serving as the **Single Source of Truth** for all H-Moon Hydro product data. Consolidates WooCommerce, POS, scraped data, and manufacturer specifications into a normalized, queryable structure with full audit trail.

---

## Problem Statement

### Current State
- **Fragmented data** across 2,773+ CSV/JSON files
- **No single source of truth** for product information
- **Duplicate effort** — same enrichment applied repeatedly
- **Lost context** — previous enrichment work gets overwritten
- **No audit trail** — can't track where data came from
- **Flat CSV limits** — no relationships, no history, no validation

### Target State
- **Single SQLite database** with normalized schema
- **Full provenance tracking** — every field knows its source
- **Incremental updates** — add data without losing existing enrichment
- **Relationship modeling** — brands, categories, variants, kits all linked
- **Export to any format** — WooCommerce CSV, Shopify CSV, JSON API

---

## Database Schema

### Core Tables

```sql
-- Main product catalog
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    handle TEXT UNIQUE,
    name TEXT NOT NULL,
    product_type TEXT CHECK(product_type IN ('simple', 'variable', 'variation', 'grouped', 'bundle')),
    status TEXT DEFAULT 'draft' CHECK(status IN ('publish', 'draft', 'pending', 'private')),
    
    -- Pricing
    regular_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    msrp DECIMAL(10,2),
    
    -- Physical
    weight_grams INTEGER,
    length_cm DECIMAL(8,2),
    width_cm DECIMAL(8,2),
    height_cm DECIMAL(8,2),
    
    -- Inventory
    manage_stock BOOLEAN DEFAULT 1,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_amount INTEGER DEFAULT 5,
    backorders TEXT DEFAULT 'no' CHECK(backorders IN ('no', 'notify', 'yes')),
    
    -- Content
    short_description TEXT,
    description TEXT,
    
    -- SEO
    seo_title TEXT,
    seo_description TEXT,
    
    -- External IDs
    woo_id INTEGER,
    pos_item_number TEXT,
    upc TEXT,
    manufacturer_sku TEXT,
    
    -- Relationships
    brand_id INTEGER REFERENCES brands(id),
    parent_id INTEGER REFERENCES products(id),
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_quality_score DECIMAL(5,2),
    
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (parent_id) REFERENCES products(id)
);

-- Brands/Manufacturers
CREATE TABLE brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    website TEXT,
    logo_url TEXT,
    description TEXT,
    is_house_brand BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories with hierarchy
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id),
    priority INTEGER DEFAULT 50,
    description TEXT,
    woo_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product-Category relationships (many-to-many)
CREATE TABLE product_categories (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT 0,
    PRIMARY KEY (product_id, category_id)
);

-- Product attributes (Size, Color, etc.)
CREATE TABLE attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'select' CHECK(type IN ('select', 'color', 'button', 'text'))
);

-- Attribute values
CREATE TABLE attribute_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attribute_id INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(attribute_id, value)
);

-- Product-Attribute relationships (for variations)
CREATE TABLE product_attributes (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES attributes(id),
    attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id),
    is_visible BOOLEAN DEFAULT 1,
    is_variation BOOLEAN DEFAULT 1,
    PRIMARY KEY (product_id, attribute_id)
);

-- Product images
CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    local_path TEXT,
    alt_text TEXT,
    position INTEGER DEFAULT 0,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    is_primary BOOLEAN DEFAULT 0,
    source TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Manufacturer specifications
CREATE TABLE product_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    spec_name TEXT NOT NULL,
    spec_value TEXT,
    spec_unit TEXT,
    source_url TEXT,
    scraped_at DATETIME,
    UNIQUE(product_id, spec_name)
);

-- Nutrient-specific data (NPK, feeding charts)
CREATE TABLE nutrient_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    nitrogen_n DECIMAL(5,2),
    phosphorus_p DECIMAL(5,2),
    potassium_k DECIMAL(5,2),
    calcium_ca DECIMAL(5,2),
    magnesium_mg DECIMAL(5,2),
    sulfur_s DECIMAL(5,2),
    iron_fe DECIMAL(5,3),
    ph_range_min DECIMAL(3,1),
    ph_range_max DECIMAL(3,1),
    ec_range_min DECIMAL(4,2),
    ec_range_max DECIMAL(4,2),
    application_rate TEXT,
    feeding_schedule TEXT,
    source_url TEXT,
    UNIQUE(product_id)
);

-- Cross-sell and upsell relationships
CREATE TABLE product_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    related_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relationship_type TEXT CHECK(relationship_type IN ('cross_sell', 'upsell', 'accessory', 'replacement', 'bundle_component')),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(product_id, related_product_id, relationship_type)
);

-- Kit/Bundle contents
CREATE TABLE bundle_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    is_optional BOOLEAN DEFAULT 0,
    UNIQUE(bundle_product_id, component_product_id)
);
```

### Audit & Provenance Tables

```sql
-- Track the source of every data point
CREATE TABLE data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('csv_import', 'pos_sync', 'scrape', 'manual', 'api', 'enrichment_script')),
    file_path TEXT,
    url TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    row_count INTEGER,
    notes TEXT
);

-- Field-level provenance
CREATE TABLE field_provenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    field_value TEXT,
    source_id INTEGER NOT NULL REFERENCES data_sources(id),
    confidence DECIMAL(3,2) DEFAULT 1.0,
    set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    set_by TEXT DEFAULT 'system'
);

-- Full change history
CREATE TABLE change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT DEFAULT 'system',
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_id INTEGER REFERENCES data_sources(id),
    reason TEXT
);

-- Import batch tracking
CREATE TABLE import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES data_sources(id),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    rows_processed INTEGER DEFAULT 0,
    rows_created INTEGER DEFAULT 0,
    rows_updated INTEGER DEFAULT 0,
    rows_skipped INTEGER DEFAULT 0,
    errors TEXT
);
```

### Indexes for Performance

```sql
-- Product lookups
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_handle ON products(handle);
CREATE INDEX idx_products_upc ON products(upc);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_parent ON products(parent_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_type ON products(product_type);

-- Category lookups
CREATE INDEX idx_product_categories_product ON product_categories(product_id);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);

-- Image lookups
CREATE INDEX idx_product_images_product ON product_images(product_id);

-- Provenance lookups
CREATE INDEX idx_field_provenance_product ON field_provenance(product_id);
CREATE INDEX idx_change_log_product ON change_log(product_id);
CREATE INDEX idx_change_log_date ON change_log(changed_at);

-- Full-text search
CREATE VIRTUAL TABLE products_fts USING fts5(
    sku, name, short_description, description,
    content='products',
    content_rowid='id'
);
```

---

## Data Migration Plan

### Phase 1: Schema Setup
```bash
python scripts/db/create_database.py
# Creates: outputs/hmoon_products.db with all tables
```

### Phase 2: Import Existing Data (Priority Order)

| Step | Source | Script | Records |
|------|--------|--------|---------|
| 1 | WooCommerce Products | `import_woo_products.py` | ~1,475 |
| 2 | POS Inventory | `import_pos_inventory.py` | ~2,554 |
| 3 | POS Alignment | `import_pos_alignment.py` | ~928 |
| 4 | Master Categories | `import_master_categories.py` | ~3,094 |
| 5 | Brand Registry | `import_brands.py` | ~80+ |
| 6 | Current Enrichment | `import_enriched_data.py` | ~1,475 |

### Phase 3: Ongoing Sync
- WooCommerce webhook listeners for real-time updates
- POS nightly sync via cron
- Web scrape results import

---

## CLI Tool Design

### `hmoon-db` Command Structure

```bash
# Database management
hmoon-db init                    # Create empty database
hmoon-db migrate                 # Run pending migrations
hmoon-db backup                  # Create timestamped backup
hmoon-db restore <backup.db>     # Restore from backup

# Import data
hmoon-db import woo <file.csv>   # Import WooCommerce export
hmoon-db import pos <file.csv>   # Import POS inventory
hmoon-db import scraped <file.json>  # Import scraped data

# Export data
hmoon-db export woo              # Export to WooCommerce CSV
hmoon-db export shopify          # Export to Shopify CSV
hmoon-db export json             # Export full JSON dump

# Query & Analysis
hmoon-db search "fox farm"       # Full-text search
hmoon-db gaps                    # Show data quality gaps
hmoon-db stats                   # Database statistics
hmoon-db audit <sku>             # Show provenance for product

# Enrichment
hmoon-db enrich brands           # Run brand detection
hmoon-db enrich weights          # Run weight estimation
hmoon-db enrich descriptions     # Generate missing descriptions
```

---

## Python API Design

### Database Manager Class

```python
from hmoon_db import HMoonDB

# Initialize
db = HMoonDB('outputs/hmoon_products.db')

# Query products
products = db.products.search('fox farm', limit=10)
product = db.products.get_by_sku('FF-OCEAN-1GAL')
variations = db.products.get_variations(parent_id=123)

# Update with provenance
db.products.update(
    sku='FF-OCEAN-1GAL',
    fields={'weight_grams': 4536},
    source='pos_inventory',
    confidence=0.95
)

# Batch import
with db.import_batch('woo_import', 'csv_import') as batch:
    for row in csv_reader:
        batch.upsert_product(row)
    print(f"Created: {batch.created}, Updated: {batch.updated}")

# Export
db.export.woocommerce('outputs/woo_import_from_db.csv')
db.export.shopify('outputs/shopify_import_from_db.csv')

# Provenance
history = db.audit.get_field_history('FF-OCEAN-1GAL', 'regular_price')
sources = db.audit.get_product_sources('FF-OCEAN-1GAL')
```

---

## Export Formats

### WooCommerce CSV Export
Generates: `outputs/woocommerce_export_YYYYMMDD.csv`

Columns: ID, Type, SKU, Name, Published, Is featured?, Visibility, Short description, Description, Sale price, Regular price, Categories, Tags, Images, Parent, Position, Brands, Attribute 1 name, Attribute 1 value(s), etc.

### Shopify CSV Export
Generates: `outputs/shopify_export_YYYYMMDD.csv`

Columns: Handle, Title, Body (HTML), Vendor, Product Category, Type, Tags, Published, Option1 Name, Option1 Value, Variant SKU, Variant Price, etc.

### JSON API Export
```json
{
  "products": [
    {
      "sku": "FF-OCEAN-1GAL",
      "name": "FoxFarm Ocean Forest Potting Soil - 1 Gallon",
      "brand": {"name": "FoxFarm", "slug": "foxfarm"},
      "categories": [{"name": "Grow Media", "slug": "grow-media"}],
      "variations": [],
      "specs": {"ph_range": "6.3-6.8"},
      "provenance": {
        "regular_price": {"source": "pos_inventory", "confidence": 1.0},
        "description": {"source": "scrape_manufacturer", "confidence": 0.9}
      }
    }
  ]
}
```

---

## Data Quality Dashboard

### Quality Metrics Tracked

| Metric | Target | Calculation |
|--------|--------|-------------|
| SKU Coverage | 100% | Products with non-null SKU |
| Price Coverage | 100% | Products with regular_price > 0 |
| Description Coverage | 95% | Products with description length > 50 |
| Image Coverage | 90% | Products with at least 1 image |
| Category Coverage | 100% | Products with at least 1 category |
| Brand Coverage | 95% | Products with brand_id set |
| Weight Coverage | 80% | Products with weight_grams > 0 |
| UPC Coverage | 70% | Products with valid UPC |

### Quality Score Formula
```python
quality_score = (
    (has_sku * 15) +
    (has_price * 15) +
    (has_description * 15) +
    (has_image * 15) +
    (has_category * 10) +
    (has_brand * 10) +
    (has_weight * 10) +
    (has_upc * 5) +
    (has_seo * 5)
) / 100
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/db/create_database.py` | Create schema from scratch |
| `scripts/db/migrations/` | Incremental schema changes |
| `scripts/db/import_woo_products.py` | Import WooCommerce CSV |
| `scripts/db/import_pos_inventory.py` | Import POS data |
| `scripts/db/export_woocommerce.py` | Export to WooCommerce CSV |
| `scripts/db/export_shopify.py` | Export to Shopify CSV |
| `scripts/db/hmoon_db.py` | Main Python API module |
| `scripts/db/cli.py` | CLI tool entry point |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| All existing data imported | ✅ 100% of WooCommerce + POS data |
| Provenance tracking working | ✅ Every field has source |
| Export matches current CSV quality | ✅ No data regression |
| CLI tool functional | ✅ All commands work |
| Query performance | ✅ <100ms for single product |
| Full-text search working | ✅ Returns relevant results |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Schema & Setup | 1 day | Database created, migrations working |
| 2. WooCommerce Import | 1 day | All products imported with provenance |
| 3. POS Integration | 1 day | UPC, cost, vendor data merged |
| 4. Export Tools | 1 day | CSV exports matching current quality |
| 5. CLI Tool | 1 day | All commands functional |
| 6. Documentation | 0.5 day | Usage guide complete |

**Total: ~5.5 days**

---

## Dependencies

- Python 3.10+
- sqlite3 (built-in)
- pandas>=2.0
- rich (for CLI output)
- click (for CLI parsing)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Always backup before import |
| Schema changes break exports | Medium | Version migrations properly |
| Duplicate products created | Medium | SKU-based upsert logic |
| Performance degradation | Low | Indexes on all query columns |

---

## References

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [WooCommerce CSV Format](https://woocommerce.com/document/product-csv-importer-exporter/)
- [Shopify CSV Format](https://help.shopify.com/en/manual/products/import-export/using-csv)
