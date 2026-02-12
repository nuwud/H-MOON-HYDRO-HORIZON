# GitHub Issues for H-Moon Hydro WooCommerce Migration

This file documents the GitHub issues to be created for tracking remaining work.
Use GitHub CLI (`gh issue create`) or the web interface to create these.

---

## Issue 1: Packing Slip Plugin Integration

**Title:** Install and configure HMoon Packing Slips plugin

**Labels:** `enhancement`, `priority-medium`

**Description:**
```
## Summary
A custom packing slip plugin has been created at `wp-plugins/hmoon-packing-slips/`

## Tasks
- [ ] Upload plugin to WordPress via SFTP or admin upload
- [ ] Activate plugin in WP Admin > Plugins
- [ ] Test printing packing slip from single order
- [ ] Test bulk packing slip print action
- [ ] Verify order details, customer info, SKUs render correctly
- [ ] Test print preview across browsers

## Features
- Print button on order view
- Bulk print action for multiple orders
- Checkbox column for warehouse picking
- H-Moon branding with green theme
- "Packed by" signature field

## Files
- `wp-plugins/hmoon-packing-slips/hmoon-packing-slips.php`
```

---

## Issue 2: Create Shipping Classes in WooCommerce

**Title:** Setup shipping classes in WooCommerce admin

**Labels:** `configuration`, `shipping`, `priority-high`

**Description:**
```
## Summary
Products have been assigned shipping classes in the CSV. Now need to create matching classes in WooCommerce.

## Shipping Classes to Create
| Class | Slug | Products |
|-------|------|----------|
| Small Item | small-item | 1,066 |
| Medium Item | medium-item | 844 |
| Large Item | large-item | 429 |
| Oversized | oversized | 240 |
| Freight | freight | 0 (manual) |

## Tasks
- [ ] Go to WooCommerce > Settings > Shipping > Shipping Classes
- [ ] Create each class with matching slug
- [ ] Use `scripts/setup_shipping_classes.py` with API credentials

## Alternative
Run WP-CLI on server:
```bash
wp term create product_shipping_class "Small Item" --slug="small-item"
wp term create product_shipping_class "Medium Item" --slug="medium-item"
wp term create product_shipping_class "Large Item" --slug="large-item"
wp term create product_shipping_class "Oversized" --slug="oversized"
wp term create product_shipping_class "Freight" --slug="freight"
```

## Files
- `scripts/setup_shipping_classes.py`
```

---

## Issue 3: Import Final CSV to WooCommerce

**Title:** Import enriched catalog to WooCommerce

**Labels:** `import`, `priority-critical`

**Description:**
```
## Summary
The final enriched catalog is ready for import.

## Import File
`outputs/woocommerce_BACKORDER.csv`

## Stats
- Total rows: 4,201
- Parent products: 2,953
- Variations: 1,248
- In Stock: 1,503
- Backorder: 778
- Presale (draft): 672

## Import Steps
1. Go to WooCommerce > Products > Import
2. Upload `woocommerce_BACKORDER.csv`
3. Map columns (most auto-map)
4. Enable "Update existing products"
5. Run import

## Post-Import Tasks
- [ ] Verify categories created correctly
- [ ] Check a sample of products
- [ ] Verify shipping classes assigned
- [ ] Test backorder functionality
```

---

## Issue 4: Advanced Nutrients Size Expansion

**Title:** Review AN size expansion draft products

**Labels:** `catalog`, `nutrients`

**Description:**
```
## Summary
The `expand_product_sizes.py` script added 374 new size variants for Advanced Nutrients products as draft products (presale).

## Product Lines Expanded
75 product lines expanded with missing standard sizes:
- 250ml, 500ml, 1L, 4L (hobby)
- 10L, 23L (commercial)

## Tasks
- [ ] Review draft products after import
- [ ] Publish popular sizes when stocked
- [ ] Update pricing based on actual wholesale costs
- [ ] Consider adding images for new sizes

## Files
- `scripts/expand_product_sizes.py`
- `outputs/woocommerce_EXPANDED.csv`
```

---

## Issue 5: UPS Dimensional Weight Configuration

**Title:** Configure UPS dimensional weight for accurate shipping

**Labels:** `shipping`, `configuration`

**Description:**
```
## Summary
Products have estimated weights but dimensional weight may be more accurate for large, light items.

## UPS Dimensional Weight Formula
DIM Weight = (L × W × H) / 139

If DIM weight > actual weight, UPS charges by DIM weight.

## Products to Review
- Grow tents
- Carbon filters
- Large fans
- Bulk grow media bags

## Tasks
- [ ] Add dimensions to products where beneficial
- [ ] Update UPS shipping plugin settings
- [ ] Consider flat-rate boxes for known sizes
```

---

## Issue 6: Category Mapping Documentation

**Title:** Document WooCommerce category structure

**Labels:** `documentation`

**Description:**
```
## Summary
The enriched catalog includes 205 hierarchical categories. Document the mapping from original WooCommerce categories.

## Category Structure
Top-level categories:
- Nutrients & Supplements
- Grow Lights
- Climate Control
- Grow Media & Containers
- Hydroponic Systems
- Propagation
- Pest & Disease Control
- Instruments & Meters
- Accessories
- Books & Education

## Tasks
- [ ] Export final category list after import
- [ ] Document category hierarchy
- [ ] Create redirect map for old category URLs (if needed)
```

---

# CLI Commands to Create Issues

```bash
# Install GitHub CLI if needed: https://cli.github.com/

cd /path/to/repo

# Issue 1
gh issue create --title "Install and configure HMoon Packing Slips plugin" \
  --label "enhancement,priority-medium" \
  --body-file docs/issues/packing-slips.md

# Issue 2
gh issue create --title "Setup shipping classes in WooCommerce admin" \
  --label "configuration,shipping,priority-high" \
  --body-file docs/issues/shipping-classes.md

# Issue 3
gh issue create --title "Import enriched catalog to WooCommerce" \
  --label "import,priority-critical" \
  --body-file docs/issues/import-csv.md

# Or create all at once with bodies inline
```

---
Generated: 2026-02-11
