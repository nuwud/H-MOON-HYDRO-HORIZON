# Import Pipeline Issues Report

## Date: December 30, 2025

---

## Issue 1: 31 Products Failed Import (FIXED)

### Cause
Multi-image expansion was creating duplicate variant rows. When a product had multiple images (separated by `||`), the expansion script copied the entire row including `Option1 Value`, causing Shopify to see duplicate variants.

### Fix Applied
Updated `rewriteFinalImportCsvWithFilesManifest.ts` to clear ALL variant fields on image-only rows. Image rows now only contain:
- `Handle`
- `Image Src`
- `Image Position`
- `Image Alt Text`

### Files Created
- `outputs/shopify_import_31_failed_only.csv` - The 31 fixed products ready for re-import

---

## Issue 2: Invalid Product Categories (1,422 Warnings)

### Cause
Custom category names like "Hydroponic Nutrients" and "Grow Light Ballasts & Reflectors" are not in Shopify's Standard Product Taxonomy.

### Valid Categories for Hydroponics
See [docs/SHOPIFY_CATEGORY_MAPPING.md](docs/SHOPIFY_CATEGORY_MAPPING.md) for complete mapping.

Key fixes needed:
| Invalid | Valid |
|---------|-------|
| `Hydroponic Nutrients` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements` |
| `Grow Light Ballasts & Reflectors` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting` |
| `Hydroponic Growing Media` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media` |
| `Hydroponic Fans` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics` |
| `Hydroponic Grow Tents` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics` |
| `Pest Control` (Gardening) | `Home & Garden > Household Supplies > Pest Control` |
| `Seeds` (Gardening) | `Home & Garden > Plants > Seeds, Bulbs & Accessories > Seeds & Seed Tape` |

### Status
Documentation created. Categories can be fixed via:
1. Bulk edit in Shopify Admin
2. CSV export → fix → re-import
3. GraphQL bulk update script

---

## Issue 3: Variant Grouping Not Preserved (PIPELINE GAP)

### Cause
Two separate pipelines were never connected:

1. **`scripts/consolidate_variants.py`** - Properly consolidated WooCommerce grouped products
   - Output: `outputs/variant_consolidation/variant_consolidation.csv`
   - 251 grouped products with 849 variant rows
   - Example: `flora-series` has 26 variants properly grouped

2. **`hmoon-pipeline/src/cli/buildShopifyImport.ts`** - Generates Shopify import
   - Input: `CSVs/master_catalog_index.csv`
   - This file was built from individual WooCommerce products, NOT the consolidated output
   - 1,533 rows with no multi-variant grouping

### Result
WooCommerce grouped products like "Flora Series" (27 children) became:
- 1 parent product with "Default Title"
- 26 separate individual products with their own handles

### Required Fix
The pipeline needs a merge step:

```
consolidate_variants.py → variant_consolidation.csv
                                    ↓
                            [MERGE STEP NEEDED]
                                    ↓
buildMasterCatalogIndex.ts → master_catalog_index.csv
                                    ↓
buildShopifyImport.ts → shopify_import_ready.csv
```

### Proposed Solution
Create a new script `mergeConsolidatedVariants.ts` that:
1. Reads `master_catalog_index.csv` (simple products)
2. Reads `variant_consolidation.csv` (grouped products)
3. Identifies which simple products belong to grouped parents
4. Removes the simple products that were consolidated
5. Adds the grouped products with variants
6. Outputs updated `master_catalog_index.csv`

### Affected Products
277 WooCommerce grouped product families were split into individual products instead of being properly consolidated as multi-variant Shopify products.

---

## Immediate Actions Available

### For the 31 Failed Products
```bash
# Import just the 31 fixed products
# File: outputs/shopify_import_31_failed_only.csv
```

### For Category Fixes
```python
# Use this mapping to fix categories in bulk
CATEGORY_FIX_MAP = {
    'Hydroponic Nutrients': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements',
    'Grow Light Ballasts & Reflectors': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting',
    'Hydroponic Growing Media': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media',
    'Hydroponic Fans': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
    'Hydroponic Grow Tents': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
    'Hydroponic Test Equipment': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
}
```

### For Variant Grouping
This requires a more significant pipeline rework. Options:
1. **Manual in Shopify Admin** - Merge products by creating new multi-variant products
2. **Re-run pipeline** - Fix the pipeline to include consolidation, wipe store, re-import
3. **GraphQL updates** - Create script to merge variants via API (complex)

---

## Summary

| Issue | Status | Action Needed |
|-------|--------|--------------|
| 31 Failed Products | ✅ FIXED | Import `shopify_import_31_failed_only.csv` |
| Invalid Categories | 📝 Documented | Bulk edit or update script needed |
| Variant Grouping | ❌ Pipeline Gap | Major pipeline rework OR manual fixes |
