# SPEC: IMPORT-001 — CSV Import Readiness

## Status: 📦 ARCHIVED (Shopify Context)

> **Note**: This spec was for the cancelled Shopify migration. The data cleaning work remains valuable.
> For active WooCommerce import, see [WOOCOMMERCE-IMPORT-001.md](WOOCOMMERCE-IMPORT-001.md).

## Overview
Comprehensive CSV validation, cleaning, and preparation for Shopify bulk product import (archived).

---

## Completion Summary (2025-01-09)

### Final CSV: `CSVs/products_export_final_ready.csv`

| Field | Coverage | Status |
|-------|----------|--------|
| Title | 1193/1193 (100%) | ✅ |
| Description | 1193/1193 (100%) | ✅ |
| Vendor | 1179/1193 (98.8%) | ✅ |
| Category | 1192/1193 (99.9%) | ✅ |
| Product Type | 1179/1193 (98.8%) | ✅ |
| **Price** | **1193/1193 (100%)** | ✅ |
| Image | 842/1193 (70.6%) | ⚠️ |
| SEO Title | 1193/1193 (100%) | ✅ |
| SEO Description | 1193/1193 (100%) | ✅ |
| Weight | 831/1193 (69.7%) | ⚠️ |
| Tags | 122/1193 (10.2%) | ⚠️ |

### Publish Status
- **Active**: 1178/1193 (98.7%)
- **Draft**: 1/1193 (0.1%)

---

## Problems Solved

### Problem 1: Malformed CSV Rows
**Symptom**: 33 products missing titles, 53 missing prices  
**Root Cause**: Description fragments split across multiple rows (e.g., "Dosage", "Increased yields")  
**Solution**: Created `deep_clean_csv.js` to filter rows where Handle doesn't match `/^[a-z0-9][a-z0-9-]*$/`  
**Result**: Removed 37 malformed rows

### Problem 2: Missing Prices
**Symptom**: 14 products with empty Variant Price  
**Root Cause**: WooCommerce grouped products with child-only pricing  
**Solution**: Created `fix_missing_prices.js` with price lookup from WooCommerce export  
**Result**: All 1193 products now have valid prices

---

## Scripts Delivered

| Script | Purpose |
|--------|---------|
| `scripts/validate_csv_complete.js` | Comprehensive field completeness check |
| `scripts/find_missing_fields.js` | Identify specific products with gaps |
| `scripts/deep_clean_csv.js` | Remove malformed rows by Handle pattern |
| `scripts/fix_missing_prices.js` | Fill missing prices from WooCommerce data |

---

## CSV Evolution

```
products_export_final.csv (1299 rows, corrupted)
    → deep_clean_csv.js
    → products_export_ready.csv (1258 rows)
    → fix_missing_prices.js
    → products_export_final_ready.csv (1258 rows, 100% price coverage)
```

---

## Import Instructions

### Step 1: Upload to Shopify
1. Go to Shopify Admin → Products → Import
2. Select `CSVs/products_export_final_ready.csv`
3. Review field mappings
4. Import

### Step 2: Post-Import Validation
```bash
# Pull products from Shopify
npm run sync:pull

# Score product health
npm run score
```

### Step 3: Image Upload (After Products Exist)
```bash
# Dry run first
node scripts/upload_images.js --dry-run

# Then upload
node scripts/upload_images.js --confirm
```

---

## Related Specs
- [IMAGE-002](IMAGE-002-product-image-scraping.md) — Image scraping
- [SEO-001](SEO-001-product-seo.md) — SEO optimization

---

## Changelog

| Date | Change |
|------|--------|
| 2025-01-09 | Initial spec created after successful CSV preparation |
| 2025-01-09 | Marked COMPLETE with 100% price coverage |
