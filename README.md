# H-Moon Hydro - WooCommerce Migration

[![WooCommerce](https://img.shields.io/badge/WooCommerce-Ready-96588a)](https://hmoonhydro.com)
[![Products](https://img.shields.io/badge/Products-2,579-green)](outputs/)
[![Data Quality](https://img.shields.io/badge/Data_Quality-100%25_SKU_&_Price-brightgreen)](outputs/woocommerce_import_ready.csv)

## 🚀 Project Status: WooCommerce Migration

**Active Migration** - Importing 2,579 refined products with 100% descriptions, SKUs, and prices.

### Quick Links

| Resource | Description |
|----------|-------------|
| [Migration Plan](docs/WOOCOMMERCE_MIGRATION_PLAN.md) | Full migration strategy and column mapping |
| [Import Ready CSV](outputs/woocommerce_import_ready.csv) | Ready-to-import WooCommerce product data |
| [Data Quality Report](#data-quality) | Coverage statistics |
| [Active Spec](..speckit/specs/WOOCOMMERCE-IMPORT-001.md) | Current implementation spec |

---

## 📊 Data Quality Summary

**Last Updated:** February 11, 2026

| Metric | Simple (1,745) | Variable (834) | Variation (2,148) |
|--------|----------------|----------------|-------------------|
| **SKU** | 100% ✅ | 96.8% | 100% ✅ |
| **Price** | 100% ✅ | n/a | 100% ✅ |
| **Description** | 100% ✅ | 100% ✅ | n/a |
| **Category** | 100% ✅ | 100% ✅ | n/a |
| **Brand** | 84.1% | 95.2% | n/a |
| **Image** | 82.4% | 94.6% | 93.2% |
| **Weight** | 34.7% | n/a | 10.8% |

### Import Readiness: ✅ READY

All critical fields (SKU, Price) are at 100%. Minor issues (weights, brands, images) can be addressed post-import.

---

## 📁 Project Structure

```
├── outputs/                     # Generated data files
│   ├── woocommerce_import_ready.csv    # ✅ IMPORT THIS
│   └── data_quality_report.json
├── CSVs/                        # Source data
│   ├── WooExport/              # Current WooCommerce export
│   └── HMoonHydro_Inventory.csv # POS inventory
├── scripts/                     # Data transformation tools
│   ├── transform_to_woocommerce.js
│   ├── enhanced_price_recovery.js
│   ├── fix_remaining_skus.js
│   └── final_quality_report.js
├── docs/                        # Documentation
│   └── WOOCOMMERCE_MIGRATION_PLAN.md
├── .speckit/                    # Project specifications
│   ├── constitution.md         # Project rules & standards
│   └── specs/                  # Feature specifications
├── wp-plugins/                  # Custom WooCommerce plugins
├── archive/                     # Archived Shopify files
│   └── shopify/                # Liquid templates, theme files
└── hmoon-pipeline/              # ARCHIVED - TypeScript CLI tools
```

---

## 🔄 Recent Changes (Feb 2026)

### Data Quality Fixes
- ✅ **Price Recovery**: 1,488 variations now have prices (inherited from parents)
- ✅ **SKU Generation**: 1,604 products received generated SKUs
- ✅ **Validation**: All critical data issues resolved

### New Scripts
| Script | Purpose |
|--------|---------|
| `transform_to_woocommerce.js` | Shopify → WooCommerce CSV conversion |
| `enhanced_price_recovery.js` | Price inheritance from parent products |
| `fix_remaining_skus.js` | SKU generation for products without |
| `final_quality_report.js` | Data quality validation |

### Documentation Updates
- Updated `copilot-instructions.md` for WooCommerce focus
- Updated `constitution.md` with WooCommerce standards
- Created `WOOCOMMERCE_MIGRATION_PLAN.md`
- Created `WOOCOMMERCE-IMPORT-001.md` spec

---

## 🛠️ Usage

### Generate WooCommerce Import CSV

```bash
# Transform Shopify data to WooCommerce format
node scripts/transform_to_woocommerce.js --confirm

# Fix any missing prices (uses parent inheritance)
node scripts/enhanced_price_recovery.js

# Fix any missing SKUs
node scripts/fix_remaining_skus.js

# Validate data quality
node scripts/final_quality_report.js
```

### Import to WooCommerce

1. Go to **WooCommerce > Products > Import**
2. Upload `outputs/woocommerce_import_ready.csv`
3. Map columns (most should auto-map)
4. Select "Update existing products" (matches by SKU)
5. Run import

---

## 📋 GitHub Issues

All work is tracked in [GitHub Issues](https://github.com/nuwud/H-MOON-HYDRO-HORIZON/issues).

### Issue Templates
- **Bug Report**: `.github/ISSUE_TEMPLATE/bug_report.md`
- **Feature Request**: `.github/ISSUE_TEMPLATE/feature_request.md`
- **Migration Task**: `.github/ISSUE_TEMPLATE/migration_task.md`

---

## 🔒 Protected Files

Never modify without backup:
- `CSVs/products_export_1.csv` — Original Shopify export
- `CSVs/HMoonHydro_Inventory.csv` — POS master inventory
- `outputs/pos_shopify_alignment.csv` — Manual SKU mappings

---

## 📚 Related Repositories

- [woo-ach-batch](https://github.com/nuwud/woo-ach-batch) - ACH Payment Plugin
- [woo-product-line-manager](https://github.com/nuwud/woo-product-line-manager) - Product Line Manager

---

## License

Proprietary - H-Moon Hydro. All rights reserved.
