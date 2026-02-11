# Changelog

All notable changes to the H-Moon Hydro project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Root `README.md` with project overview and data quality summary
- `CHANGELOG.md` for tracking all changes
- GitHub Issues created for all pending tasks:
  - #2 - [Migration] Import woocommerce_import_ready.csv to Production
  - #3 - [Data] Fix 317 products missing brand information
  - #4 - [Data] Fix 3,056 products missing weight information
  - #5 - [Data] Fix 498 products missing images

### Changed
- Updated `copilot-instructions.md` with Feb 11, 2026 accomplishments
- Updated `constitution.md` with current status section

---

## [2026-02-11] - Data Quality Fixes

### Added
- `scripts/transform_to_woocommerce.js` - Shopify → WooCommerce CSV transformation
- `scripts/enhanced_price_recovery.js` - Price inheritance from parent products
- `scripts/fix_remaining_skus.js` - SKU generation for products without
- `scripts/final_quality_report.js` - Data quality validation report
- `scripts/analyze_sku_formats.js` - SKU format analysis across data sources
- `scripts/analyze_variant_prices.js` - Variant price inheritance analysis
- `scripts/audit_import_data.js` - Comprehensive data quality audit
- `scripts/diagnose_prices.js` - Price issue diagnostic
- `outputs/woocommerce_import_ready.csv` - Ready for WooCommerce import
- `.speckit/specs/WOOCOMMERCE-IMPORT-001.md` - Active WooCommerce import spec
- `docs/WOOCOMMERCE_MIGRATION_PLAN.md` - Full migration strategy

### Fixed
- **1,488 variations** now have prices (inherited from parent products)
- **1,604 products** now have SKUs (generated with format `HMH-{CAT}-{HASH}`)
- All critical data fields now at 100% coverage

### Changed
- Import file changed from `MASTER_IMPORT.csv` to `woocommerce_import_ready.csv`
- Project focus shifted from Shopify to WooCommerce migration

### Archived
- `archive/shopify/` - Shopify theme files moved to archive
- `.speckit/specs/IMPORT-001-csv-readiness.md` - Marked as superseded

---

## [2026-02-10] - WooCommerce Migration Planning

### Added
- `docs/WOOCOMMERCE_MIGRATION_PLAN.md` - Migration strategy document
- `archive/` folder structure for Shopify files
- WooCommerce column mapping documentation

### Changed
- Updated `.github/copilot-instructions.md` - Changed focus to WooCommerce
- Updated `.speckit/constitution.md` - Added WooCommerce documentation requirements

---

## [2025-12-31] - Data Refinement Complete

### Added
- `outputs/shopify_complete_import_enriched.csv` - 100% descriptions
- Category classification for all products
- Brand normalization using 250+ brand registry

### Fixed
- Product descriptions generated for all 2,579 products
- Categories assigned to all products using priority system

---

## [2025-10-29] - Initial Shopify Theme Export

### Added
- Initial Shopify theme export (Horizon theme)
- Product data pipeline (`hmoon-pipeline/`)
- Custom agents for data processing

---

## Data Quality Metrics History

| Date | SKU % | Price % | Desc % | Notes |
|------|-------|---------|--------|-------|
| 2026-02-11 | 100% | 100% | 100% | All critical fields complete |
| 2026-02-10 | 65% | 51% | 100% | Started WooCommerce migration |
| 2025-12-31 | 65% | 51% | 100% | Descriptions complete |
| 2025-10-29 | ~50% | ~50% | ~20% | Initial export |

---

## Scripts Reference

| Script | Purpose | Added |
|--------|---------|-------|
| `transform_to_woocommerce.js` | Convert Shopify CSV to WooCommerce format | 2026-02-11 |
| `enhanced_price_recovery.js` | Inherit prices from parent products | 2026-02-11 |
| `fix_remaining_skus.js` | Generate SKUs for products without | 2026-02-11 |
| `final_quality_report.js` | Validate data quality | 2026-02-11 |
| `audit_import_data.js` | Comprehensive data audit | 2026-02-11 |
