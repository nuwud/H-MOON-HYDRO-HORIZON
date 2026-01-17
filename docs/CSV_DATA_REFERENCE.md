# H-Moon Hydro CSV & Data Source Reference

## 📂 FILE HIERARCHY (Use These)

### ✅ PRIMARY IMPORT FILE
| File | Location | Purpose | Status |
|------|----------|---------|--------|
| **MASTER_IMPORT.csv** | `outputs/` | Consolidated import-ready with variants | ✅ RECOMMENDED |
| Row count: 4,742 rows | Unique products: ~2,579 | Multi-variant: 837 products |

### 🗂️ Wave Files (Category-Based Import)
Location: `outputs/waves/`
- `wave_nutrients.csv` - 1,214 products (largest)
- `wave_grow_lights.csv` - 128 products
- `wave_odor_control.csv` - 66 products
- `wave_containers.csv` - 179 products
- ... (22 total categories)

---

## 📁 SOURCE DATA FILES

### WooCommerce (Original Store Data)
| File | Location | Description |
|------|----------|-------------|
| `Products-Export-2025-Dec-31-180709.csv` | `CSVs/WooExport/` | Latest WooCommerce export (2.6MB) |
| `Customers-Export-2025-Dec-31-*.csv` | `CSVs/WooExport/` | Customer data |
| `Shop-Orders-Export-2025-Dec-31-*.csv` | `CSVs/WooExport/` | Order history |
| `Product-Categories-Export-*.csv` | `CSVs/WooExport/` | Category taxonomy |
| `hmoonhydro_com_1.sql` | `hmoonhydro.com/` | Full MySQL database dump |

### Local WooCommerce Images
| Path | Count | Description |
|------|-------|-------------|
| `hmoonhydro.com/wp-content/uploads/` | **10,967 images** | All product images by year |
| `uploads/2019/` through `uploads/2025/` | Organized by upload date |

### POS/Inventory Data
| File | Location | Description |
|------|----------|-------------|
| `HMoonHydro_Inventory.csv` | `CSVs/` | Point-of-Sale master inventory (872KB) |

### Shopify Exports (Previous State)
| File | Location | Description |
|------|----------|-------------|
| `products_export_1.csv` | `CSVs/` | Shopify admin export |
| `shopify_products_h-moon-hydro_*.csv` | `CSVs/` | Timestamped exports |

---

## ⚠️ FILES TO AVOID

| File | Issue |
|------|-------|
| `shopify_final_fixed.csv` (23,947 rows) | Variant explosion, 17% image coverage |
| `shopify_100percent.csv` | Bloated/broken |
| Any file with 20,000+ rows | Likely variant duplication bug |

---

## 🔄 VARIANT CONSOLIDATION STATUS

### What Was Done
- WooCommerce `variable` products (277 found) → Shopify parent/variants
- Standalone products with sizes → Consolidated under parent handles
- Base name extraction: `Big Bud (1 Lt)` → Parent: `big-bud` / Variant: `1 Lt`

### Current State in MASTER_IMPORT.csv
```
Products with Size as Option1 Name: 2,729 rows
Multi-variant products: 837 unique handles
Example structure:
  backdraft-damper:
    - Row 1: Title, Option1 Name="Size", Option1 Value="Default"
    - Row 2: (blank title), Size, 8 inch
    - Row 3: (blank title), Size, 10 inch
    - Row 4: (blank title), Size, 12 inch
```

### ❓ Remaining Gaps
Products that SHOULD be variants but may still be standalone:
- Products with similar names differing only by size
- Need review: `outputs/variant_consolidation/potential_variant_groups.csv`

---

## 🖼️ IMAGE SOURCES

### Priority Order
1. **Shopify CDN** (already uploaded): `cdn.shopify.com/s/files/...`
2. **Local WooCommerce**: `hmoonhydro.com/wp-content/uploads/...`
3. **WooCommerce Live URLs**: `hmoonhydro.com/...` (may be down)

### Image Mapping Files
| File | Purpose |
|------|---------|
| `outputs/woo_image_matches.json` | WooCommerce product → image mapping |
| `outputs/local_image_matches.json` | Local file path matches |
| `CSVs/woo_image_map.json` | Slug → image URL mapping |

---

## 📊 CATEGORY MASTER FILES

Location: `CSVs/master_*.csv`

These are category-specific product lists used to build wave files:
- `master_nutrients.csv` (241KB - largest category)
- `master_grow_lights.csv` (25KB)
- `master_irrigation.csv` (32KB)
- `master_odor_control.csv` (16KB)
- ... (20+ categories)

---

## 🔧 SCRIPTS REFERENCE

### Import Pipeline
```bash
# Full pipeline (builds all category masters → MASTER_IMPORT)
cd hmoon-pipeline && npx tsx src/cli/runFullImportPipeline.ts

# Single category
npm run build:nutrients
npm run build:lights
```

### API Import (New - Jan 2025)
```bash
# Test import with waves
npx tsx src/cli/testImport.ts --wave=odor_control --limit=5 --confirm

# Verify results
npx tsx src/cli/verifyImport.ts --type=odor_control

# Wipe (products only)
npx tsx src/cli/wipeShopifyStore.ts --scope products --confirm
```

---

## 📝 DATA ARCHAEOLOGY NOTES

### WooCommerce Product Types Found
- `simple` - Standard products
- `variable` - Products with variations (277 found)
- `grouped` - Bundle/kit products
- `variation` - Individual variant records (children of variable)

### Shopify Conversion Rules
| WooCommerce | Shopify |
|-------------|---------|
| `variable` product | Parent product with `Option1 Name=Size/Color/etc` |
| `variation` records | Variant rows (blank Title, share Handle) |
| `grouped` product | Consider as Kit/Bundle collection OR manual variants |
| `simple` with size in name | Should become variant under parent |

---

## 🔗 Key Relationships

```
WooCommerce Export (2.6MB, ~3000 products)
    ↓ [variant consolidation]
MASTER_IMPORT.csv (4,742 rows, 2,579 unique)
    ↓ [category splitting]
Wave Files (22 category CSVs)
    ↓ [API import]
Shopify Store (GraphQL mutations)
```

---

Last updated: January 17, 2026
