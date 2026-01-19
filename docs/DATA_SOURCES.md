# Data Sources Reference

This document tracks all data sources used for product analysis and inventory management.

---

## 📊 Primary Data Sources

### 1. Shopify Complete Import
| Property | Value |
|----------|-------|
| **File** | `outputs/shopify_complete_import.csv` |
| **Records** | 4,727 rows (2,579 unique products) |
| **Last Updated** | 2025-12-31 |
| **Contains** | Title, Vendor, SKU, Price, Weight, Description, Images |
| **Origin** | Enriched from WooCommerce + POS + Manual entry |

### 2. WooCommerce Export
| Property | Value |
|----------|-------|
| **File** | `CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv` |
| **Records** | 1,481 products |
| **Last Updated** | 2025-12-31 |
| **Contains** | ID, Name, SKU, Price, Categories, Attributes |
| **Origin** | Live WooCommerce database export |

### 3. POS Inventory
| Property | Value |
|----------|-------|
| **File** | `CSVs/HMoonHydro_Inventory.csv` |
| **Records** | 157 products with weight |
| **Last Updated** | 2025-12-15 |
| **Contains** | Item Number, Description, Weight (column 35) |
| **Origin** | Point of Sale system export |

---

## 🏭 Manufacturer Catalog Sources

### General Hydroponics (GH)
- **Website**: https://generalhydroponics.com/products
- **Distributor**: Hawthorne Gardening
- **Catalog Date**: 2026-01
- **Products Tracked**: 13 product lines
- **Key Lines**: Flora Series, FloraNova, CALiMAGic, pH Up/Down

### Advanced Nutrients (AN)
- **Website**: https://advancednutrients.com
- **Distributor**: Advanced Nutrients Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 14 product lines
- **Key Lines**: pH Perfect Sensi, Big Bud, B-52, Voodoo Juice

### Fox Farm
- **Website**: https://foxfarm.com
- **Distributor**: Sunlight Supply
- **Catalog Date**: 2026-01
- **Products Tracked**: 9 product lines
- **Key Lines**: Trio (Grow Big, Big Bloom, Tiger Bloom), Solubles

### Botanicare
- **Website**: https://botanicare.com
- **Distributor**: Hawthorne Gardening
- **Catalog Date**: 2026-01
- **Products Tracked**: 10 product lines
- **Key Lines**: Pure Blend Pro, CNS17, Cal-Mag Plus, Hydroguard

### Canna
- **Website**: https://canna.com
- **Distributor**: Hydrofarm
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Coco A&B, Boost, Cannazym, Rhizotonic

### House & Garden
- **Website**: https://house-garden.us
- **Distributor**: House & Garden Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Roots Excelurator Gold, Aqua Flakes, Shooting Powder

### Athena
- **Website**: https://athenaproducts.com
- **Distributor**: Athena Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 7 product lines
- **Key Lines**: Pro Line Core, Grow/Bloom A&B, IPM

### Nectar for the Gods
- **Website**: https://oregonsonly.com
- **Distributor**: Oregon's Only Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 12 product lines
- **Key Lines**: One Shot, Bloom Khaos, Herculean Harvest, Roman Regime Kit

### Roots Organics
- **Website**: https://aurorainn.com/roots-organics
- **Distributor**: Aurora Innovations
- **Catalog Date**: 2026-01
- **Products Tracked**: 10 product lines
- **Key Lines**: Buddha Grow/Bloom, Terp Tea, Original Soil

### Earth Juice
- **Website**: https://hydro-organics.com
- **Distributor**: Hydro-Organics Wholesale
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Grow, Bloom, Sugar Peak series

### Technaflora
- **Website**: https://technaflora.com
- **Distributor**: Technaflora Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 9 product lines
- **Key Lines**: BC series, MagiCal, Thrive Alive

### Dutch Master
- **Website**: https://dutchmaster.com.au
- **Distributor**: Dutch Master Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Advance, Gold Range, Max Flower

### Greenplanet
- **Website**: https://greenplanetnutrients.com
- **Distributor**: Greenplanet Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 9 product lines
- **Key Lines**: Dual Fuel, Medi One, Massive Bloom

### Remo Nutrients
- **Website**: https://remonutrients.com
- **Distributor**: Remo Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Grow/Micro/Bloom, MagNifiCal, VeloKelp

### Heavy 16
- **Website**: https://heavy16.com
- **Distributor**: Heavy 16 Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 7 product lines
- **Key Lines**: Veg A&B, Bud A&B, Fire, Prime

### Cultured Solutions
- **Website**: https://culturedsolutions.com
- **Distributor**: Cultured Solutions Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 7 product lines
- **Key Lines**: Veg/Bloom A&B, UC Roots, Bud Boosters

### Cutting Edge Solutions
- **Website**: https://cuttingedgesolutions.com
- **Distributor**: Cutting Edge Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 7 product lines
- **Key Lines**: Micro/Grow/Bloom, Uncle John's Blend

### Mills Nutrients
- **Website**: https://millsnutrients.com
- **Distributor**: Mills Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 5 product lines
- **Key Lines**: Basis A&B, C4, Ultimate PK

### Emerald Harvest
- **Website**: https://emeraldharvest.com
- **Distributor**: Emerald Harvest Direct
- **Catalog Date**: 2026-01
- **Products Tracked**: 8 product lines
- **Key Lines**: Cali Pro A&B, King Kola, Honey Chome

---

## 📁 Output Files Generated

### Audit Results
| File | Description |
|------|-------------|
| `outputs/product_lines/expanded_audit_*.json` | Full audit with all 167 product lines |
| `outputs/product_lines/size_audit_*.json` | Original 69-line audit |

### Special Order Data
| File | Description |
|------|-------------|
| `outputs/product_lines/special_order_catalog_*.csv` | CSV for import/spreadsheet |
| `outputs/product_lines/special_order_page_*.html` | Ready HTML template |
| `outputs/product_lines/special_order_opportunities.csv` | Initial opportunities list |

### Distributor Orders
| File | Description |
|------|-------------|
| `outputs/product_lines/distributor_orders_*.json` | Priority orders by distributor |

### Weight Estimates
| File | Description |
|------|-------------|
| `outputs/woo_updates/weight_estimates_*.csv` | All 359 estimates with confidence |
| `outputs/woo_updates/weight_import_*.csv` | WooCommerce import format |
| `outputs/woo_updates/weight_import_high_confidence_*.csv` | HIGH confidence only |

---

## 🔄 Data Flow

```
┌─────────────────────┐     ┌─────────────────────┐
│   WooCommerce DB    │────▶│  WooCommerce Export │
└─────────────────────┘     └──────────┬──────────┘
                                       │
┌─────────────────────┐                │
│   POS System        │────────────────┼──────────────────┐
└─────────────────────┘                │                  │
                                       ▼                  │
┌─────────────────────┐     ┌─────────────────────┐      │
│ Manufacturer Sites  │────▶│   Product Enrichment │◀─────┘
│ (catalog data)      │     │   Scripts            │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                                       ▼
                           ┌─────────────────────┐
                           │ shopify_complete_   │
                           │ import.csv          │
                           └──────────┬──────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│  Product Line Audit │ │  Weight Estimates   │ │  Special Orders     │
│  (gap analysis)     │ │  (shipping data)    │ │  (catalog)          │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

## 📝 Scripts Reference

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `expanded_product_line_audit.js` | Full 19-brand audit | shopify_complete_import.csv | audit JSON, catalog CSV, orders JSON, HTML |
| `product_line_size_audit.js` | Original 9-brand audit | shopify_complete_import.csv | size_audit JSON/CSV |
| `smart_weight_finder.js` | Estimate missing weights | WooCommerce export, POS | weight estimates CSV |
| `woo_product_accounting.js` | Match products to enriched data | Both exports | accounting report |
| `woo_category_updater.js` | Category-by-category updates | WooCommerce export | update CSVs with revert |

---

## 🏷️ Category Codes

| Code | Category |
|------|----------|
| NUT | Nutrients |
| GRO | Grow Media |
| IRR | Irrigation |
| PHM | pH Meters |
| LIT | Grow Lights |
| HID | HID Bulbs |
| AIR | Airflow |
| ODR | Odor Control |
| POT | Containers |
| PRO | Propagation |
| SED | Seeds |
| HAR | Harvesting |
| TRM | Trimming |
| PES | Pest Control |
| CO2 | CO2 Equipment |
| BOK | Books |

---

*Last Updated: 2026-01-19*
