# H-Moon Hydro: Shopify Theme + WooCommerce Migration Pipeline

## Architecture Overview

**Hydroponics ecommerce migration** from WooCommerce to Shopify with three components:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Shopify Horizon Theme** | `/` (root) | Liquid templates, sections, snippets, assets |
| **HMoon Pipeline** | `hmoon-pipeline/` | TypeScript CLI for product auditing, category building, Shopify GraphQL sync |
| **Legacy WooCommerce** | `hmoonhydro.com/` | WordPress site + SQL dump for data archaeology |

**SpecKit** (`.speckit/`) contains specs, plans, and templates — check `.speckit/specs/` for active feature specifications.

---

## 🎯 BEST CSV FOR IMPORT

**USE:** `outputs/shopify_complete_import.csv`

| Metric | Value |
|--------|-------|
| Unique Products | 2,579 |
| Total Rows | 4,727 (includes variants) |
| Image Coverage | 87% (2,199 products) |
| Description Coverage | 100% |
| Header Format | ✅ Shopify-compatible (34 columns) |

**⚠️ AVOID the 23,947-row files** (`shopify_final_fixed.csv`, `shopify_100percent.csv`, etc.) — they have bloated row counts with only 17% image coverage due to variant explosion issues.

### Quick Comparison
| File | Products | Image Coverage | Status |
|------|----------|----------------|--------|
| `outputs/shopify_complete_import.csv` | 2,579 | 87% | ✅ **RECOMMENDED** |
| `CSVs/shopify_import_ready.csv` | ~1,250 | Good | ⚠️ Missing ~half |
| `outputs/shopify_final_fixed.csv` | 2,870 | 17% | ❌ Bloated/broken |

---

## ⚠️ Critical Safety Rules

### 1. Search Before Creating
**80+ scripts exist** in `scripts/` and `hmoon-pipeline/src/cli/`. Use `@repo-archeologist` agent or search before creating new tooling.

### 2. Dry-Run Default Pattern
ALL destructive scripts default to safe mode:
```typescript
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
```
Destructive scripts requiring `--confirm`: `wipeShopifyStore.ts`, `enrichShopifyProducts.ts`, `attachProductImages.ts`

### 3. Protected Files (Never modify without backup)
- `CSVs/products_export_1.csv` — Canonical Shopify export
- `CSVs/HMoonHydro_Inventory.csv` — POS master inventory
- `outputs/pos_shopify_alignment.csv` — Manual SKU mappings

### 4. Rate Limiting
Use 200-500ms pause between Shopify API mutations to avoid throttling.

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

## 📚 Shopify Documentation Requirement

### ⚠️ ALWAYS CHECK OFFICIAL DOCS BEFORE API WORK

**Shopify's GraphQL API changes frequently.** Verify against official documentation:

| Resource | URL |
|----------|-----|
| Product API | https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate |
| Bulk Operations | https://shopify.dev/docs/api/usage/bulk-operations |
| Rate Limits | https://shopify.dev/docs/api/usage/rate-limits |
| CSV Import | https://help.shopify.com/en/manual/products/import-export |

### API Version: `2024-01`

### Known API Changes (Jan 2026)
| Old (Deprecated) | New (Current) |
|------------------|---------------|
| `productCreate(input:)` | `productCreate(product:)` |
| `ProductInput.variants` | `productVariantsBulkCreate` after product |
| `variant.sku` | `variant.inventoryItem.sku` |

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

### Full Import Pipeline
```bash
cd hmoon-pipeline
npx tsx src/cli/runFullImportPipeline.ts  # Generates shopify_import_ready.csv
```
Pipeline: `buildCategoryIndexDraft.ts` → `buildMasterCatalogIndex.ts` → `buildShopifyImport.ts`

### Category Builders (22 total)
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