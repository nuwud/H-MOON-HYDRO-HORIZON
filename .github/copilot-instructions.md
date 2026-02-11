# H-Moon Hydro: WooCommerce Product Data Migration

## 🚀 PROJECT STATUS UPDATE (February 11, 2026)

**ACTIVE: WooCommerce Migration** - Ready to import 2,579 refined products with **100% SKUs, prices, and descriptions**.

### ✅ Recent Accomplishments (Feb 11, 2026)
- **Price Recovery**: Fixed 1,488 variations missing prices (parent inheritance)
- **SKU Generation**: Generated 1,604 SKUs for products without them
- **Data Validation**: All critical fields now at 100% coverage
- **Import Ready**: `outputs/woocommerce_import_ready.csv` validated and ready

### Active Development Focus
1. **WooCommerce Product Import** - Import `woocommerce_import_ready.csv` to production
2. **WordPress/BeaverBuilder Design** - Theme and UX improvements
3. **Post-Import Data Polish** - Fix weights, images, brands after import
4. **ACH Payment Plugin** - Separate repo: https://github.com/nuwud/woo-ach-batch
5. **Product Line Manager Plugin** - Separate repo: https://github.com/nuwud/woo-product-line-manager

### Component Status
| Component | Status | Notes |
|-----------|--------|-------|
| `outputs/woocommerce_import_ready.csv` | ✅ **IMPORT THIS** | 4,727 rows, 100% SKU/Price |
| `CSVs/WooExport/` | ✅ ACTIVE | Dec 31, 2025 WooCommerce export |
| `hmoonhydro.com/` | 🔒 LOCAL ONLY | WooCommerce site backup (10k+ images) |
| `archive/shopify/` | 📦 ARCHIVED | Liquid templates, Shopify-specific files |
| `hmoon-pipeline/` | 📦 ARCHIVED | Data outputs still useful |

---

## Architecture Overview

**Hydroponics ecommerce** on WooCommerce with product data improvements:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Product Data** | `CSVs/`, `outputs/` | Cleaned/enriched product catalog |
| **HMoon Pipeline** | `hmoon-pipeline/` | (ARCHIVED) TypeScript CLI for data processing |
| **Scripts** | `scripts/` | Python utilities for data transformation |

**SpecKit** (`.speckit/`) contains specs, plans, and templates — check `.speckit/specs/` for active feature specifications.

---

## 🎯 BEST CSV FOR WOOCOMMERCE IMPORT

**PRIMARY:** `outputs/woocommerce_import_ready.csv` → **READY FOR IMPORT**
**REFERENCE:** `CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv` → Current WooCommerce schema

| Metric | Import File | Current WooCommerce |
|--------|-------------|---------------------|
| Unique Products | 2,579 | 1,481 |
| Total Rows | 4,727 (with variants) | 1,481 |
| **SKU Coverage** | **100%** ✅ | ~88% |
| **Price Coverage** | **100%** ✅ | ~70% |
| **Description Coverage** | **100%** ✅ | ~20% |
| Weight Coverage | ~30% | ~38% |
| Image Coverage | 87% | varies |
| Category Coverage | **100%** ✅ | partial |

### Import Strategy
1. Go to **WooCommerce > Products > Import**
2. Upload `outputs/woocommerce_import_ready.csv`
3. Map columns (most auto-map correctly)
4. Select **"Update existing products"** (matches by SKU)
5. Run import - expect ~2,087 new products, ~1,009 updates

---

## ⚠️ Critical Safety Rules

### 1. Search Before Creating
**80+ scripts exist** in `scripts/` and `hmoon-pipeline/src/cli/`. Use `@repo-archeologist` agent or search before creating new tooling.

### 2. Dry-Run Default Pattern
ALL destructive scripts default to safe mode:
```typescript
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
```

### 3. Protected Files (Never modify without backup)
- `CSVs/products_export_1.csv` — Original Shopify export
- `CSVs/HMoonHydro_Inventory.csv` — POS master inventory
- `outputs/pos_shopify_alignment.csv` — Manual SKU mappings

---

## 📋 GitHub Issues Workflow

**ALL issues, bugs, and tasks MUST be tracked in GitHub Issues.**

### Issue Templates
| Type | Template | Use For |
|------|----------|---------|
| Bug | `.github/ISSUE_TEMPLATE/bug_report.md` | Broken functionality, errors |
| Feature | `.github/ISSUE_TEMPLATE/feature_request.md` | New capabilities |
| Migration | `.github/ISSUE_TEMPLATE/migration_task.md` | Import/export tasks |

### Workflow
1. Check GitHub Issues before starting any task
2. Create issue if one doesn't exist
3. Reference in commits: `Fixes #123` or `Relates to #123`
4. Close only when verified complete

---

## 📚 WooCommerce Documentation

### Official Resources
| Resource | URL |
|----------|-----|
| WooCommerce REST API | https://woocommerce.github.io/woocommerce-rest-api-docs/ |
| Product CSV Import | https://woocommerce.com/document/product-csv-importer-exporter/ |
| Variable Products | https://woocommerce.com/document/variable-product/ |
| WP-CLI WooCommerce | https://github.com/woocommerce/woocommerce/wiki/WC-CLI |

### WooCommerce Import CSV Columns
| Column | Required | Notes |
|--------|----------|-------|
| `ID` | No | Leave blank for new products |
| `Type` | Yes | `simple`, `variable`, `variation` |
| `SKU` | Yes | Used for matching existing products |
| `Name` | Yes | Product title |
| `Description` | No | Full HTML description |
| `Short description` | No | Summary text |
| `Regular price` | Yes | Base price |
| `Categories` | No | Pipe-delimited: `Cat1 > SubCat \| Cat2` |
| `Images` | No | Comma-separated URLs |
| `Attribute 1 name` | For variants | e.g., "Size" |
| `Attribute 1 value(s)` | For variants | Pipe-delimited values |

---

## Category Priority System

When a product matches multiple categories, use strict priority:

```typescript
CATEGORY_PRIORITY = {
  nutrients: 100,        // Highest
  grow_media: 95,
  seeds: 90,
  propagation: 85,
  irrigation: 80,
  ph_meters: 75,
  environmental_monitors: 70,
  controllers: 65,
  grow_lights: 60,
  hid_bulbs: 55,
  airflow: 50,
  odor_control: 45,
  water_filtration: 40,
  containers: 35,
  harvesting: 30,
  trimming: 25,
  pest_control: 20,
  co2: 15,
  grow_room_materials: 10,
  books: 5,
  electrical_supplies: 3,
  extraction: 1,         // Lowest
}
```

### Category Codes
`NUT` nutrients, `GRO` grow_media, `IRR` irrigation, `PHM` ph_meters, `LIT` lights, `HID` hid_bulbs, `AIR` airflow, `ODR` odor, `POT` containers, `PRO` propagation, `SED` seeds, `HAR` harvesting, `TRM` trimming, `PES` pest, `CO2` co2, `BOK` books

---

## Key Workflows

> ⚠️ **ARCHIVED SECTION** - hmoon-pipeline archived. Use data outputs only.

### Full Import Pipeline (ARCHIVED)
```bash
cd hmoon-pipeline
npx tsx src/cli/runFullImportPipeline.ts  # Generates shopify_import_ready.csv
```
Pipeline: `buildCategoryIndexDraft.ts` → `buildMasterCatalogIndex.ts` → `buildShopifyImport.ts`

### Category Builders (22 total - ARCHIVED)
```bash
npm run build:nutrients   # → CSVs/master_nutrients.csv
npm run build:lights      # → CSVs/master_grow_lights.csv
npm run build:airflow     # etc.
```

### Python Scripts (in `scripts/`)
```bash
python scripts/align_pos_inventory.py      # POS ↔ Shopify fuzzy matching
python scripts/consolidate_variants.py     # WooCommerce grouped → Shopify variants
python scripts/analyze_woocommerce_inventory.py  # Inventory analysis
```

---

## Data Sources & Priority

### SKU Resolution Order
1. Existing Shopify Variant SKU (never change)
2. POS Item Number (vendor SKU)
3. WooCommerce SKU
4. Derived: `HMH-{CATEGORY}-{HASH}` (e.g., `HMH-NUT-A3F2B1`)

---

## Brand Registry (`hmoon-pipeline/src/utils/brand.ts`)

### Blocklist (NOT valid brands)
`h moon hydro`, `hmoonhydro`, `unknown`, `default`, `other`, `n/a`

### House Brand
**UNO** is a valid private label brand (like Kirkland/Costco) — do NOT blocklist.

### Brand Aliases Example
```typescript
'gh' → 'General Hydroponics'
'cloudline' → 'AC Infinity'
'fox farm' → 'FoxFarm'
```

---

## Liquid Theme Patterns

### Internal Blocks (prefixed with `_`)
```liquid
{% content_for 'block', type: '_product-details', id: 'product-details' %}
```

### Template JSON Warning
`templates/*.json` files are **auto-generated by Shopify admin** — never manually edit.

---

## ⚡ Shopify API Evolution (CRITICAL)

**Shopify GraphQL API changes frequently.** Always verify mutation/query structure against current docs.

### API 2024-01 Breaking Changes
| Old (Deprecated) | New (Current) |
|------------------|---------------|
| `productCreate(input: ProductInput!)` | `productCreate(product: ProductCreateInput!)` |
| `ProductInput.options` (string array) | `ProductCreateInput.productOptions` (with values) |
| `ProductInput.variants` | Use `productVariantsBulkCreate` after product creation |
| `productVariantUpdate` | `productVariantsBulkUpdate` |
| `variant.sku` directly | `variant.inventoryItem.sku` |

### Current Working Pattern (Jan 2025)
```typescript
// 1. Create product with options (no variants)
productCreate(product: { title, productOptions: [{name, values}] }, media)

// 2. Update default variant with SKU/price  
productVariantsBulkUpdate(productId, variants: [{id, price, inventoryItem: {sku}}])

// 3. Create additional variants
productVariantsBulkCreate(productId, variants: [{price, optionValues, inventoryItem}])
```

### Rate Limits
- **Standard**: 2 requests/second burst, 1/second sustained
- **Bulk operations**: Use `bulkOperationRunQuery` for 10,000+ items
- **50,000 variant threshold**: Max 1,000 new variants/day after

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| WooCommerce grouped products delimiter | Use `\|~\|` NOT `\|` |
| Weight conversion | WooCommerce lbs → Shopify grams (×453.592) |
| CSV import fails | Check 34-column header matches exactly |
| GraphQL "THROTTLED" | Wait based on `throttleStatus.restoreRate` |
| Large CSVs with low image % | Variant explosion — use `shopify_complete_import.csv` instead |

---

## Environment Setup

```bash
cd hmoon-pipeline
cp .env.example .env
# Fill: SHOPIFY_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_LOCATION_ID
npm install
```

---

## Custom Agents (`agents/`)

| Agent | Use Case |
|-------|----------|
| `@repo-archeologist` | Search existing scripts before creating new ones |
| `@safe-shopify-operator` | Verify dry-run guardrails for API mutations |
| `@brand-normalizer` | Normalize brand names using registry |
| `@category-classifier` | Handle category priority conflicts |
| `@shopify-compliance-auditor` | Validate CSV/Liquid changes before deploy |

---

## Key File Locations

| Purpose | Path |
|---------|------|
| **Best import CSV** | `outputs/MASTER_IMPORT.csv` |
| **CSV Reference Guide** | `docs/CSV_DATA_REFERENCE.md` |
| Wave files (categories) | `outputs/waves/wave_*.csv` |
| Import pipeline | `hmoon-pipeline/src/cli/runFullImportPipeline.ts` |
| **Test import (API)** | `hmoon-pipeline/src/cli/testImport.ts` |
| Brand normalization | `hmoon-pipeline/src/utils/brand.ts` |
| Health scoring rules | `hmoon-pipeline/src/config/productRules.ts` |
| Import runbook | `hmoon-pipeline/docs/IMPORT_RUNBOOK.md` |
| Feature specs | `.speckit/specs/` |

---

## 🖼️ Local Image Sources

**10,967 images available locally** in WooCommerce backup:

| Path | Description |
|------|-------------|
| `hmoonhydro.com/wp-content/uploads/2019/` | 2019 uploads |
| `hmoonhydro.com/wp-content/uploads/2020/` | 2020 uploads |
| `hmoonhydro.com/wp-content/uploads/2021/` | 2021 uploads |
| `hmoonhydro.com/wp-content/uploads/2022/` | 2022 uploads |
| `hmoonhydro.com/wp-content/uploads/2023/` | 2023 uploads |
| `hmoonhydro.com/wp-content/uploads/2024/` | 2024 uploads |

### Image Matching Strategy
1. Match by SKU/handle to WooCommerce product
2. Extract image URLs from WooCommerce export
3. Map to local file path: `hmoonhydro.com/wp-content/uploads/YYYY/MM/filename.jpg`
4. Upload to Shopify Files API or use in `media` input

---

## 🔄 Variant Consolidation Rules

### WooCommerce → Shopify Mapping
| WooCommerce Type | Shopify Structure |
|------------------|-------------------|
| `variable` product | Parent with `Option1 Name` (Size/Color) |
| `variation` records | Variant rows (blank Title, same Handle) |
| `simple` with size in name | **SHOULD** become variant under parent |
| `grouped` product | Kit/bundle OR manual variants |

### Consolidation Logic
Products with similar base names differing only by size should share a handle:
- `Big Bud (1 Lt)` → Handle: `big-bud`, Option1 Value: `1 Lt`
- `Big Bud (4 Lt)` → Handle: `big-bud`, Option1 Value: `4 Lt`
- `Big Bud Powder` → Handle: `big-bud`, Option1 Value: `Powder`

### Files for Review
- `outputs/variant_consolidation/potential_variant_groups.csv` — Candidates needing consolidation
- `outputs/VARIANT_CONSOLIDATION_COMPLETE.md` — What was done

---

## 🔐 WooCommerce ACH Batch Plugin

> ⚠️ **MOVED TO SEPARATE REPO**: https://github.com/nuwud/woo-ach-batch

The ACH payment plugin has been moved to its own standalone repository for cleaner separation of concerns. This plugin is for a different WooCommerce site, not H-Moon Hydro.

**For ACH plugin development, clone:** `git clone https://github.com/nuwud/woo-ach-batch.git`