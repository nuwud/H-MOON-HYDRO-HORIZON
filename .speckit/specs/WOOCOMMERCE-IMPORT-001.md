# SPEC: WOOCOMMERCE-IMPORT-001 — WooCommerce Product Import

## Status: 🔄 IN PROGRESS (Data Ready)

## Overview
Transform and import refined product data (2,579 products) from Shopify CSV format into WooCommerce.

---

## Source Data

### Primary Source (VERIFIED)
**File**: `outputs/shopify_complete_import_enriched.csv`

| Metric | Count | Coverage |
|--------|-------|----------|
| Total Rows | 4,727 | (includes variants) |
| Simple Products | 1,745 | - |
| Variable Products | 834 | - |
| Variations | 2,148 | - |
| With Description | 2,579 | **100%** of unique products |
| With Image | 4,229 | 89.5% |
| With SKU | 3,096 | 65.5% |

### Generated Import File
**File**: `outputs/woocommerce_import_ready.csv` ✅ CREATED

### Reference Format
**File**: `CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv`
- Contains current WooCommerce product schema
- 4,503 rows (with corrupted data)

---

## SKU Overlap Analysis (Feb 2026)

| Metric | Count |
|--------|-------|
| SKUs that will UPDATE | 1,009 |
| SKUs that will CREATE | 2,087 |
| WooCommerce SKUs not in import | 230 |

**Note**: 230 WooCommerce products are "grouped" products that were consolidated into variable products in our refined data. They will remain unchanged after import.

See: `outputs/woo_products_not_in_import.csv`

---

## Transformation Script

**File**: `scripts/transform_to_woocommerce.js`

### Usage
```bash
# Preview transformation
node scripts/transform_to_woocommerce.js --dry-run

# Execute transformation  
node scripts/transform_to_woocommerce.js --confirm
```

### Output
- `outputs/woocommerce_import_ready.csv` — Import-ready CSV
- `outputs/woocommerce_import_validation.json` — Validation report

---

## Column Mapping

| Shopify Column | WooCommerce Column | Notes |
|---------------|-------------------|-------|
| Handle | Slug/Parent | Product slug |
| Title | Name | Product name |
| Body (HTML) | Description | Full description |
| Vendor | Brands | Custom taxonomy |
| Type | Categories | Product category |
| Tags | Tags | Product tags |
| Variant SKU | SKU | Unique identifier |
| Variant Price | Regular price | - |
| Variant Grams | Weight (lbs) | ÷ 453.592 |
| Image Src | Images | Comma-separated |
| Option1 Name | Attribute 1 name | e.g., "Size" |
| Option1 Value | Attribute 1 value(s) | Pipe-delimited |

---

## Product Type Mapping

| Condition | WooCommerce Type |
|-----------|-----------------|
| No variants | simple |
| Has variant options on first occurrence | variable |
| Same Handle, no Title (subsequent rows) | variation |

---

## Import Strategy

### Phase 1: Preparation
- [x] Create transformation script
- [ ] Run transformation with `--confirm`
- [ ] Validate output CSV structure

### Phase 2: Staging Test
- [ ] Import to staging WooCommerce
- [ ] Verify product counts
- [ ] Check variant relationships
- [ ] Validate images load

### Phase 3: Production Import
- [ ] Full database backup
- [ ] Import using WooCommerce CSV Importer
- [ ] Select "Update existing products" (SKU matching)
- [ ] Review import log for errors

### Phase 4: Verification
- [ ] Verify search index updated
- [ ] Test category pages
- [ ] Spot-check product pages
- [ ] Test add-to-cart functionality

---

## Known Issues

### Description Coverage Lower Than Expected
The transformation shows 53.3% description coverage. This may be because:
1. Variant rows don't repeat the parent description
2. Some products genuinely lack descriptions

**TODO**: Investigate `shopify_with_descriptions.csv` vs `MASTER_IMPORT.csv` differences

### Weight Conversion
- Source: grams (Shopify)
- Target: lbs (WooCommerce)
- Formula: `grams ÷ 453.592 = lbs`

---

## Related Documents

- [WOOCOMMERCE_MIGRATION_PLAN.md](../../docs/WOOCOMMERCE_MIGRATION_PLAN.md) — Full migration plan
- [CSV_DATA_REFERENCE.md](../../docs/CSV_DATA_REFERENCE.md) — All CSV files explained
- [IMPORT-001-csv-readiness.md](IMPORT-001-csv-readiness.md) — Original Shopify import spec (archived context)
