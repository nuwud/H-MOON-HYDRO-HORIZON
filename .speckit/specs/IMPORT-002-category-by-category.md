# IMPORT-002: Category-by-Category Product Import

**Status:** 🟡 In Progress  
**Priority:** P0 — Critical Path  
**Created:** 2025-01-17  
**Owner:** @nuwud

---

## Overview

Import products to Shopify **one category at a time**, starting with best-sellers and most complete data. Each batch is validated before moving to next category.

### Why This Approach
- Previous bulk imports created 23K+ row disasters with 17% image coverage
- Category-focused allows quality control checkpoints
- Best sellers first = fastest revenue recovery
- Smaller batches = easier rollback if issues

---

## 💰 Project Economics

| Metric | Value |
|--------|-------|
| Contract Price | $5,000 |
| Total Products | 2,579 |
| **Per Product** | **$1.94** |
| Industry Rate | $5-15/product |
| Effective Discount | ~70% under market |

**Reality check:** This is a $15K-25K job at market rate. Treat remaining work as learning investment.

---

## 📊 Category Import Order (by priority)

Based on sales data + product counts:

| Wave | Category | Products | Priority | Why |
|------|----------|----------|----------|-----|
| **1** | `nutrients` | 703 | 🔴 Highest | Highest revenue, most orders |
| **2** | `grow_media` | 16 | 🔴 High | Best sellers: Ocean Forest, coco |
| **3** | `irrigation` | 191 | 🟠 Medium | Flashgro (top seller), pumps |
| **4** | `propagation` | 80 | 🟠 Medium | Root Pouch, cloning supplies |
| **5** | `grow_lights` | 68 | 🟡 Normal | High-value items |
| **6** | `odor_control` | 93 | 🟡 Normal | ONA products popular |
| **7** | `ph_meters` | 34 | 🟡 Normal | Essential equipment |
| **8** | `containers` | 32 | 🟢 Lower | Generic items |
| **9** | `harvesting` | 41 | 🟢 Lower | Seasonal demand |
| **10** | `hid_bulbs` | 70 | 🟢 Lower | Legacy lighting |
| **11** | Remaining | ~1,250 | 🟢 Final | Seeds, books, pest, etc. |

---

## 🗂️ Data Sources Available

| Source | Location | Use For |
|--------|----------|---------|
| **POS Inventory** | `CSVs/HMoonHydro_Inventory.csv` | SKU, price, cost, UPC, vendor |
| **WooCommerce Products** | `CSVs/WooExport/Products-Export-*.csv` | Descriptions, categories, images |
| **WooCommerce Orders** | `CSVs/WooExport/Shop-Orders-Export-*.csv` | Best seller identification |
| **Category Masters** | `CSVs/master_*.csv` | Pre-categorized products |
| **Shopify Export** | `CSVs/products_export_1.csv` | Current state reference |
| **Complete Import** | `outputs/shopify_complete_import.csv` | Best consolidated CSV (2,579 products, 87% images) |
| **WooCommerce Images** | `hmoonhydro.com/wp-content/uploads/` | Original product images |
| **Image Map** | `CSVs/woo_image_map.json` | Handle → image URL mapping |

---

## 🔧 Tools Available

### Category Extraction
```bash
# Filter complete import by category
cd hmoon-pipeline
npx tsx src/cli/buildNutrientsMaster.ts     # Regenerate if needed
```

### Image Handling
```bash
# Match images from WooCommerce
node scripts/match_woo_images.js

# Upload to Shopify CDN
npx tsx src/cli/uploadImagesToShopifyFiles.ts --dry-run
npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm
```

### Validation
```bash
# Score product completeness
npm run score

# Audit CSV quality
node diagnose_import_quality.js
node validate_import.js
```

---

## 📋 Per-Category Workflow

### Phase 1: Extract Category CSV
```bash
# From shopify_complete_import.csv, filter by Type column
# Type = "nutrients" for nutrients category
```

### Phase 2: Validate Data Quality
- [ ] All products have Handle (unique)
- [ ] All products have Title
- [ ] All products have Price > 0
- [ ] 80%+ have Image Src
- [ ] All have correct Type/Category

### Phase 3: Enrich Missing Data
- [ ] Match missing images from WooCommerce
- [ ] Fill missing descriptions from POS
- [ ] Verify SKUs against inventory

### Phase 4: Import to Shopify
1. **Dry run** - Upload CSV, review mapping
2. **Import** - Execute import
3. **Verify** - Check 10 random products in admin
4. **Document** - Log any issues

### Phase 5: Post-Import
- [ ] Create/update collection for category
- [ ] Verify images display correctly
- [ ] Check inventory sync
- [ ] Test add-to-cart on 3 products

---

## 🎯 Wave 1: Nutrients (703 products)

### Best Sellers in Category
From order data:
- SNS Colloidal Shield Gallon (31 orders)
- Nutrilife SM-90-4liter (10 orders)
- NSR Bloom Juice 2-5-4/ 1 gal (6 orders)
- Carbo Blast 2.5 kg (6 orders)
- Bush Load 8 oz (6 orders)

### Extraction Command
```bash
# Create nutrients-only import CSV
head -1 outputs/shopify_complete_import.csv > outputs/wave1_nutrients.csv
grep -i ',nutrients,' outputs/shopify_complete_import.csv >> outputs/wave1_nutrients.csv
```

### Quality Targets
| Metric | Target | 
|--------|--------|
| Image Coverage | >90% |
| Description Coverage | 100% |
| Price Coverage | 100% |
| SKU Coverage | >95% |

---

## 📁 Output Files Per Wave

Each wave produces:
```
outputs/
  wave{N}_{category}/
    import_ready.csv        # Final import file
    validation_report.md    # Quality check results
    missing_images.json     # Products needing images
    import_log.json         # Shopify import results
```

---

## ✅ Acceptance Criteria

### Per Category
- [ ] CSV passes Shopify import validation
- [ ] No duplicate handles
- [ ] All prices numeric and > 0
- [ ] Images load on imported products
- [ ] Products appear in correct collection

### Overall
- [ ] All 2,579 products imported
- [ ] 85%+ overall image coverage
- [ ] 100% description coverage
- [ ] Collections organized by category
- [ ] No orphan products

---

## 🚫 Anti-Patterns to Avoid

1. **Don't merge CSVs blindly** — The 23K row disaster came from variant explosion
2. **Don't skip validation** — Check every batch before import
3. **Don't import all at once** — Category batches allow rollback
4. **Don't ignore image coverage** — An import without images looks broken
5. **Don't trust row counts** — Unique handles matter, not total rows

---

## Progress Tracker

| Wave | Category | File | Products | Images | Price | Status |
|------|----------|------|----------|--------|-------|--------|
| 1 | nutrients | `wave_nutrients.csv` | **967** | 95% | 100% | ✅ Ready |
| 2 | grow_lights | `wave_grow_lights.csv` | 179 | 92% | 100% | ✅ Ready |
| 3 | irrigation | `wave_irrigation.csv` | 234 | 76% | 100% | ⚠️ Ready |
| 4 | airflow | `wave_airflow.csv` | 74 | 95% | 100% | ✅ Ready |
| 5 | seeds | `wave_seeds.csv` | 69 | 100% | 100% | ✅ Ready |
| 6 | odor_control | `wave_odor_control.csv` | 51 | 100% | 100% | ✅ Ready |
| 7 | containers_pots | `wave_containers_pots.csv` | 70 | 86% | 100% | ✅ Ready |
| 8 | water_filtration | `wave_water_filtration.csv` | 66 | 92% | 100% | ✅ Ready |
| 9 | propagation | `wave_propagation.csv` | 74 | 77% | 100% | ⚠️ Ready |
| 10 | grow_media | `wave_grow_media.csv` | 76 | 71% | 100% | ⚠️ Ready |
| 11 | pest_control | `wave_pest_control.csv` | 69 | 77% | 100% | ⚠️ Ready |
| 12 | ph_meters | `wave_ph_meters.csv` | 40 | 92% | 100% | ✅ Ready |
| 13 | hid_bulbs | `wave_hid_bulbs.csv` | 36 | 97% | 100% | ✅ Ready |
| 14 | controllers_timers | `wave_controllers_timers.csv` | 35 | 89% | 100% | ✅ Ready |
| 15 | trimming | `wave_trimming.csv` | 26 | 100% | 100% | ✅ Ready |
| 16 | co2 | `wave_co2.csv` | 30 | 57% | 100% | ⚠️ Ready |
| 17 | electrical_supplies | `wave_electrical_supplies.csv` | 28 | 89% | 100% | ✅ Ready |
| 18 | grow_tents | `wave_grow_tents.csv` | 16 | 100% | 100% | ✅ Ready |
| 19 | books | `wave_books.csv` | 11 | 82% | 100% | ✅ Ready |
| 20 | harvesting | `wave_harvesting.csv` | 21 | 76% | 100% | ⚠️ Ready |
| — | uncategorized | `wave_uncategorized.csv` | 834 | 93% | 31% | ⚠️ Needs work |

### Files Location
All wave files: `outputs/waves/wave_*.csv`

### Import Priority Order
1. **nutrients** (967) — Highest revenue, best data
2. **grow_lights** (179) — High value items
3. **irrigation** (234) — Includes top seller Flashgro
4. **seeds** (69) — 100% images
5. **odor_control** (51) — 100% images
6. Remaining waves as needed

---

## Related Docs

- [Import Runbook](../hmoon-pipeline/docs/IMPORT_RUNBOOK.md)
- [Category Priority System](../.github/copilot-instructions.md#category-priority-system)
- [Brand Registry](../hmoon-pipeline/src/utils/brand.ts)
- [Existing Import Analysis](../IMPORT_QUALITY_ANALYSIS.md)
