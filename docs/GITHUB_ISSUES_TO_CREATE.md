# GitHub Issues to Create

This file contains issue bodies ready to paste into GitHub Issues.
Create these at: https://github.com/nuwud/H-MOON-HYDRO-HORIZON/issues/new

---

## Issue #1: WooCommerce Product Import - Ready for Execution

**Title:** `[Migration] Import woocommerce_import_ready.csv to Production`

**Labels:** `migration`, `priority:high`

**Body:**
```markdown
## Summary
Import the validated product data CSV to WooCommerce production site.

## Files Ready
- `outputs/woocommerce_import_ready.csv` - 4,727 rows (2,579 unique products)

## Data Quality Verified
- [x] SKU: 100%
- [x] Price: 100%
- [x] Description: 100%
- [x] Categories: 100%

## Import Steps
1. [ ] Backup current WooCommerce products
2. [ ] Go to WooCommerce > Products > Import
3. [ ] Upload `woocommerce_import_ready.csv`
4. [ ] Map columns (verify auto-mapping is correct)
5. [ ] Select "Update existing products" checkbox
6. [ ] Run import
7. [ ] Verify ~2,087 new products created
8. [ ] Verify ~1,009 existing products updated
9. [ ] Spot check 10 random products for accuracy

## Acceptance Criteria
- [ ] All 2,579 products imported successfully
- [ ] No duplicate SKUs
- [ ] Prices display correctly on frontend
- [ ] Categories are properly assigned
```

---

## Issue #2: Post-Import Data Polish - Missing Brands

**Title:** `[Data] Fix 317 products missing brand information`

**Labels:** `data-quality`, `priority:medium`

**Body:**
```markdown
## Summary
317 products are missing brand information after import.

## Impact
- Product filtering by brand won't work for these items
- SEO may be affected

## Approach
1. Export products without brands from WooCommerce
2. Cross-reference with POS inventory (`CSVs/HMoonHydro_Inventory.csv`)
3. Use brand registry (`hmoon-pipeline/src/utils/brand.ts`) for normalization
4. Update via WooCommerce bulk edit or CSV update

## Files to Reference
- `scripts/normalize_vendors.js` - May help with brand matching
- Brand alias list in `hmoon-pipeline/src/utils/brand.ts`

## Acceptance Criteria
- [ ] All products have brand assigned
- [ ] Brands are normalized per registry
```

---

## Issue #3: Post-Import Data Polish - Missing Weights

**Title:** `[Data] Fix 3,056 products missing weight information`

**Labels:** `data-quality`, `priority:low`

**Body:**
```markdown
## Summary
3,056 products/variations are missing weight data.

## Impact
- Shipping calculations may be inaccurate
- WooCommerce may use default weight

## Approach
1. Use `scripts/estimate_weights.js` to estimate from product names
2. Cross-reference with POS inventory for actual weights
3. Manual review for high-value items
4. Update via WooCommerce bulk edit

## Files to Reference
- `scripts/estimate_weights.js` - Weight estimation from product names
- `CSVs/HMoonHydro_Inventory.csv` - May have weight data

## Priority
Low - Shipping can use default weights until fixed

## Acceptance Criteria
- [ ] Weight coverage > 80%
- [ ] High-value items have accurate weights
```

---

## Issue #4: Post-Import Data Polish - Missing Images

**Title:** `[Data] Fix 498 products missing images`

**Labels:** `data-quality`, `priority:medium`

**Body:**
```markdown
## Summary
498 products are missing product images.

## Image Sources Available
Local WooCommerce backup: `hmoonhydro.com/wp-content/uploads/`
- 10,967 images available locally
- Organized by year: 2019-2024

## Approach
1. Match products without images to local image library
2. Use `scripts/match_woo_images.js` for automated matching
3. Upload missing images to WooCommerce media library
4. Update product image associations

## Files to Reference
- `scripts/match_woo_images.js`
- `scripts/enhanced_image_match.js`
- `scripts/enrich_images.js`

## Acceptance Criteria
- [ ] Image coverage > 95%
- [ ] All hero products have images
```

---

## Issue #5: Documentation Update Complete

**Title:** `[Docs] Documentation updated for WooCommerce migration`

**Labels:** `documentation`, `priority:low`

**Body:**
```markdown
## Summary
Documentation has been updated to reflect WooCommerce migration status.

## Files Updated
- [x] `README.md` - Created with project overview
- [x] `CHANGELOG.md` - Created with full history
- [x] `.github/copilot-instructions.md` - Updated for WooCommerce
- [x] `.speckit/constitution.md` - Updated with current status
- [x] `docs/WOOCOMMERCE_MIGRATION_PLAN.md` - Created

## Work Tracked
| Date | Task | Status |
|------|------|--------|
| 2026-02-11 | Price recovery (1,488 variations) | ✅ |
| 2026-02-11 | SKU generation (1,604 products) | ✅ |
| 2026-02-11 | Data validation | ✅ |
| 2026-02-11 | Documentation updates | ✅ |

This issue can be closed after commit.
```

---

## How to Create These Issues

1. Go to https://github.com/nuwud/H-MOON-HYDRO-HORIZON/issues
2. Click "New issue"
3. Copy the title from above
4. Copy the body from the markdown block
5. Add the specified labels
6. Submit

Or use GitHub CLI:
```bash
gh issue create --title "[Migration] Import woocommerce_import_ready.csv to Production" --label "migration,priority:high" --body-file issue1.md
```
