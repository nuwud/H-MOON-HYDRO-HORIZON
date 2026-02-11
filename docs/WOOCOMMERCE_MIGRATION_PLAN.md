# WooCommerce Product Migration Plan

**Created**: February 11, 2026  
**Status**: Active  
**Goal**: Import 2,579 refined products with 100% descriptions, weights, and categories into WooCommerce

---

## Executive Summary

Migrate refined product data from Shopify CSV format back to WooCommerce, preserving all improvements made during the data enrichment process. The refined data has:

| Metric | Refined Data | Current WooCommerce |
|--------|-------------|---------------------|
| Unique Products | 2,579 | 1,481 |
| Description Coverage | **100%** | ~20% |
| Weight Coverage | **100%** | ~38% |
| Category Coverage | **100%** | partial |
| Image Coverage | 87% | varies |

---

## Data Sources

### Primary Source (Use This)
```
outputs/MASTER_IMPORT.csv
```
- 4,727 rows (2,579 products + variants)
- All enriched fields populated
- AI-generated descriptions
- Standardized weights
- Proper category taxonomy

### Reference (WooCommerce Schema)
```
CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv
```
- Current WooCommerce export format
- Use as template for column mapping

### Image Assets
```
hmoonhydro.com/wp-content/uploads/
```
- 10,967 images across 2019-2026
- Match by SKU or product name

---

## Column Mapping: Shopify → WooCommerce

| Shopify Column | WooCommerce Column | Transformation |
|---------------|-------------------|----------------|
| `Handle` | `slug` | Direct |
| `Title` | `name` | Direct |
| `Body (HTML)` | `description` | Direct |
| `Vendor` | `brands` (taxonomy) | Map to Perfect WooCommerce Brands |
| `Type` | `product_cat` | Map to WooCommerce categories |
| `Tags` | `product_tag` | Pipe-delimited |
| `Variant Price` | `regular_price` | Direct |
| `Variant Grams` | `weight` | ÷ 453.592 (grams to lbs) |
| `Variant SKU` | `sku` | Direct |
| `Image Src` | `images` | Comma-separated URLs |
| `Option1 Name` | `Attribute 1 name` | e.g., "Size" |
| `Option1 Value` | `Attribute 1 value(s)` | Pipe-delimited |

---

## Product Type Mapping

### Simple Products (No Variants)
```csv
Type,SKU,Name,Description,Regular price,Categories,Images
simple,HMH-NUT-001,"Big Bud","<p>Bloom booster...</p>",29.99,"Nutrients > Bloom",https://...
```

### Variable Products (With Variants)
```csv
# Parent row
Type,SKU,Name,Description,Categories,Attribute 1 name,Attribute 1 value(s)
variable,HMH-NUT-002,"Big Bud","<p>Bloom booster...</p>","Nutrients > Bloom",Size,"1 Lt | 4 Lt | 10 Lt"

# Variation rows
Type,Parent,SKU,Regular price,Attribute 1 value(s)
variation,big-bud,HMH-NUT-002-1L,29.99,1 Lt
variation,big-bud,HMH-NUT-002-4L,79.99,4 Lt
variation,big-bud,HMH-NUT-002-10L,149.99,10 Lt
```

---

## Import Strategy

### Phase 1: Preparation
1. [ ] Export fresh WooCommerce data (compare with Dec 31 backup)
2. [ ] Run transformation script to generate `woocommerce_import_ready.csv`
3. [ ] Validate CSV structure against WooCommerce requirements
4. [ ] Back up current WooCommerce database

### Phase 2: Staging Test
1. [ ] Set up staging environment (if not available, use local)
2. [ ] Import to staging via WooCommerce Product CSV Importer
3. [ ] Verify product counts (target: 2,579)
4. [ ] Verify variant relationships (254 variable products)
5. [ ] Spot-check descriptions, weights, images

### Phase 3: Production Import
1. [ ] Schedule maintenance window
2. [ ] Full database backup
3. [ ] Import using "Update existing products" option
4. [ ] SKU matching ensures proper merging
5. [ ] Verify and fix any import errors

### Phase 4: Post-Import
1. [ ] Verify search index updated
2. [ ] Check category pages
3. [ ] Test checkout with a few products
4. [ ] Monitor for 404s or missing images

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss during import | Full backup before import |
| Duplicate products | Use SKU matching for updates |
| Image URL changes | Map local images, re-upload if needed |
| Category mismatch | Create mapping table before import |
| Price discrepancies | Validate prices in staging first |
| Variant consolidation | 230 WooCommerce products now grouped as variants |

---

## SKU Overlap Analysis (Feb 2026)

Analysis of current WooCommerce vs. import data:

| Metric | Count |
|--------|-------|
| SKUs that will UPDATE | 1,009 |
| SKUs that will CREATE | 2,087 |
| WooCommerce SKUs not in import | 230 |

### Products Not in Import
See `outputs/woo_products_not_in_import.csv` for full list.

Most are **grouped products** that were consolidated into **variable products** in the refined data:
- `Holland Secret Micro 4L/10L/23L` → Single variable product with size variants
- `ONA Block/Liquid/Gel` → Product line consolidated

These products will remain unchanged in WooCommerce after import.

---

## File Outputs

| File | Purpose |
|------|---------|
| `outputs/woocommerce_import_ready.csv` | Final import-ready CSV |
| `outputs/woocommerce_import_validation.json` | Validation report |
| `outputs/woocommerce_category_mapping.csv` | Category taxonomy mapping |

---

## Scripts

### Transformation Script
```
scripts/transform_to_woocommerce.js
```
Converts Shopify CSV format to WooCommerce import format.

Usage:
```bash
node scripts/transform_to_woocommerce.js --dry-run
node scripts/transform_to_woocommerce.js --confirm
```

### Validation Script
```
scripts/validate_woocommerce_csv.js
```
Validates output CSV against WooCommerce requirements.

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Documentation & Planning | Day 1 | ✅ In Progress |
| Data Transformation | Days 1-2 | ⏳ Pending |
| Staging Test | Days 2-3 | ⏳ Pending |
| Production Import | Day 3-4 | ⏳ Pending |
| Verification | Day 4-5 | ⏳ Pending |

---

## Related Documents

- [CSV_DATA_REFERENCE.md](CSV_DATA_REFERENCE.md) - All CSV files explained
- [.speckit/specs/IMPORT-001-csv-readiness.md](../.speckit/specs/IMPORT-001-csv-readiness.md) - Import specifications
- [variant-consolidation.spec.md](variant-consolidation.spec.md) - Variant grouping rules
