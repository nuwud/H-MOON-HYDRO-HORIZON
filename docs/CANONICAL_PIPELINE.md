# Canonical WooCommerce Product Data Pipeline

_Last updated: 2026-02-20_

This document defines the **single source of truth pipeline** for building and validating WooCommerce product import data.

## Canonical Execution Order

1. **Transform base catalog**
   - Script: `scripts/transform_to_woocommerce.js`
   - Input: `outputs/shopify_complete_import_enriched.csv`
   - Output: `outputs/woocommerce_import_ready.csv`

2. **Recover/fill prices**
   - Script: `scripts/enhanced_price_recovery.js`
   - Inputs:
     - `outputs/woocommerce_import_ready.csv`
     - `CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv`
     - `CSVs/HMoonHydro_Inventory.csv`
   - Output: `outputs/woocommerce_import_with_prices.csv`

3. **Fill remaining SKUs**
   - Script: `scripts/fix_remaining_skus.js`
   - Input: `outputs/woocommerce_import_with_prices.csv`
   - Output: in-place update of `outputs/woocommerce_import_with_prices.csv`

4. **Fill images from unified sources**
   - Script: `scripts/unified_image_fill.js`
   - Input selection (in order):
     1. `outputs/woocommerce_import_with_prices.csv`
     2. `outputs/woocommerce_import_ready.csv`
   - Optional override: pass a `.csv` path argument
   - Output: `outputs/woocommerce_FINAL_WITH_IMAGES.csv`

5. **Validation gates**
   - Coverage gate: `scripts/final_quality_report.js`
   - Import schema gate: `scripts/validate_import_csv.js outputs/woocommerce_FINAL_WITH_IMAGES.csv`

6. **Best-seller prioritization artifact**
   - Script: `scripts/extract_best_sellers.js`
   - Input: `CSVs/WooExport/Shop-Orders-Export-2025-Dec-31-180904.csv`
   - Outputs:
     - `outputs/analytics/best_sellers_from_orders.csv`
     - `outputs/analytics/best_sellers_from_orders.json`

---

## Hard Gates Before Import

- SKU coverage: **100%** for non-variation rows
- Price coverage: **100%** for simple/variation rows
- Duplicate SKU count: **0**
- Final CSV exists: `outputs/woocommerce_FINAL_WITH_IMAGES.csv`
- Validation passes: `scripts/validate_import_csv.js`

---

## Script Status (Canonical vs Legacy)

### Canonical
- `scripts/transform_to_woocommerce.js`
- `scripts/enhanced_price_recovery.js`
- `scripts/fix_remaining_skus.js`
- `scripts/unified_image_fill.js`
- `scripts/final_quality_report.js`
- `scripts/validate_import_csv.js`
- `scripts/extract_best_sellers.js`

### Legacy/Superseded (do not use for main pipeline)
- `scripts/convert_to_woocommerce.js` (superseded by `transform_to_woocommerce.js`)
- `extract_woo_images.js` at repo root (older export path)
- `validate_import.js` at repo root (legacy validation target)
- older staged image scripts (`enhanced_image_match.js`, `final_image_enrichment.js`, etc.)

---

## Notes

- `hmoon-pipeline/` is archived and should be used as reference logic only.
- If this flow changes, update this doc in the same PR as the script changes.
