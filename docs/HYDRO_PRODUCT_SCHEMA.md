# H-Moon Hydro: Product Standard Schema

**Version:** 1.0.0  
**Last Updated:** February 19, 2026  
**Status:** Active — Reference for all product imports and catalog management

---

## Current Catalog Health (Audit Results)

| Metric | Score | Status |
|--------|-------|--------|
| SKU Integrity | 100% | ✅ Perfect |
| Price Coverage | 100% | ✅ Perfect |
| Category Coverage | 100% | ✅ Perfect |
| Image Coverage | 89% | ⚠️ 458 products need images |
| Variable Structure | 100% | ✅ All variations linked |
| Attribute Standardization | 96% | ⚠️ 42 products missing attrs |
| Description Coverage | 100% | ✅ Perfect |
| **Overall Maturity** | **98%** | ✅ Import Ready |

### Remaining Issues
- 42 variable products without attribute definitions
- 588 variations reference Size attribute but some have inconsistent values
- 565 unique size value formats (should be ~50 standardized)
- 458 products missing images

---

## 1. Product Modeling Rules

### Product Type Decision Matrix

| Scenario | Product Type | Example |
|----------|-------------|---------|
| Same product, different sizes (1qt, 1gal, 5gal) | `variable` | General Hydroponics Flora Series |
| Same light, different wattages | `variable` | HPS 400W, 600W, 1000W |
| Same item, different counts (2-pack, 4-pack) | `variable` | Net Pots 6-pack, 50-pack |
| Same ducting, different diameters | `variable` | Ducting 4", 6", 8" |
| Completely different formula/product | `simple` | Big Bud vs Bud Candy |
| Starter kit with multiple SKUs | `grouped` or plugin | Complete Grow Kit |
| One-off accessory | `simple` | pH Calibration Solution |

### When to Create Variable vs Separate Simple Products

**Use Variable Product when:**
- Same brand + same product line
- Only differs by: Size, Wattage, Count, Color, Dimension
- Shares same product description (minus size-specific specs)
- Same image set (or size-appropriate variants)

**Use Separate Simple Products when:**
- Different brand
- Different active ingredients (nutrients)
- Different product category
- Different base price tier (not just size scaling)

### Family Key Pattern

Every variable product needs a canonical **Family Key** for grouping:

```
{brand-slug}-{product-line-slug}
```

**Examples:**
- `advanced-nutrients-ph-perfect-grow`
- `general-hydroponics-flora-series`
- `ac-infinity-cloudline-t`

**Variant Key** (within family):
- `1-quart`
- `1-gallon`
- `5-gallon`

---

## 2. Global Attribute Standards

### Required Global Attributes

Only these attributes should exist in WooCommerce (as global product attributes):

| Attribute Name | Slug | Used For | Format |
|---------------|------|----------|--------|
| **Size** | `pa_size` | Volume, dimension, count | Standardized (see below) |
| **Wattage** | `pa_wattage` | Lights, ballasts | `600W`, `1000W` |
| **Duct Size** | `pa_duct-size` | Fans, ducting, filters | `4 inch`, `6 inch`, `8 inch` |
| **Color Temperature** | `pa_color-temp` | Bulbs | `3000K`, `4000K`, `6500K` |
| **NPK Ratio** | `pa_npk` | Nutrients | `3-1-2`, `0-50-30` |
| **Count** | `pa_count` | Multi-packs | `1 Pc`, `6 Pack`, `50 Pack` |

### Size Value Standardization

**Current Problem:** 565 unique values with inconsistent formatting.

**Standardized Size Values:**

#### Volume (Liquids)
| Standard | Aliases to Convert |
|----------|--------------------|
| `250ml` | `250 ml`, `250 ml.`, `250ML` |
| `500ml` | `500 ml`, `500 ml.`, `500ML` |
| `1L` | `1 L`, `1 Liter`, `1 Liters`, `1 Lt`, `1 Lt.`, `1000ml` |
| `4L` | `4 L`, `4 Liter`, `4 Lt`, `4 Lt.` |
| `10L` | `10 L`, `10 Liter`, `10 Lt`, `10 Lt.` |
| `23L` | `23 L`, `23 Liter`, `23 Lt` |
| `1 Quart` | `1 Qt`, `qt.`, `qt,`, `quart` |
| `1 Gallon` | `1 Gal`, `gal`, `gallon`, `1 galon` |
| `2.5 Gallon` | `2.5 Gal`, `2.5 jug` |
| `5 Gallon` | `5 Gal`, `5 gal.` |

#### Weight (Dry Goods)
| Standard | Aliases to Convert |
|----------|--------------------|
| `1 oz` | `1 Oz`, `1oz`, `1 oz.` |
| `8 oz` | `8 Oz`, `8oz`, `8 oz.` |
| `1 lb` | `1 Lb`, `1lb`, `1 lb.`, `1 pound` |
| `5 lb` | `5 Lb`, `5lb`, `5 lb.`, `5 pound` |
| `25 lb` | `25 Lb`, `25lb`, `25 lb.` |
| `50 lb` | `50 Lb`, `50lb` |

#### Dimensions (Ducting, Pots, etc.)
| Standard | Aliases to Convert |
|----------|--------------------|
| `4 inch` | `4 in`, `4"`, `4in` |
| `6 inch` | `6 in`, `6"`, `6in`, `6 in.` |
| `8 inch` | `8 in`, `8"`, `8in` |
| `10 inch` | `10 in`, `10"` |
| `12 inch` | `12 in`, `12"` |

#### Count (Multi-packs)
| Standard | Aliases to Convert |
|----------|--------------------|
| `1 Pc` | `1 PC`, `1 pc`, `1 Piece`, `1 pice` |
| `2 Pc` | `2 PC`, `2 pc` |
| `6 Pack` | `6 Pk`, `6 pk`, `6 Ct`, `6 ct` |
| `10 Pack` | `10 Pk`, `10 pk`, `10 Ct` |
| `25 Pack` | `25 Pk`, `25 ct`, `25 Ct` |
| `50 Pack` | `50 Pk`, `50 ct`, `50 Ct` |
| `100 Pack` | `100 ct`, `100/pk` |

#### Wattage (Lights)
| Standard | Aliases to Convert |
|----------|--------------------|
| `150W` | `150 W`, `150 w`, `150 watt`, `150Watt` |
| `250W` | `250 W`, `250 w`, `250 watt` |
| `315W` | `315 W`, `315 w`, `315 w`, `315 W CMH` |
| `400W` | `400 W`, `400 w`, `400 watt`, `400W` |
| `600W` | `600 W`, `600 w`, `600 watt`, `600Watt` |
| `630W` | `630 W CMH`, `630 Watt CMH` |
| `1000W` | `1000 W`, `1000 watt`, `1000w` |

---

## 3. Category Taxonomy

### Primary Categories (Top Level)

| Category | Slug | Description |
|----------|------|-------------|
| Nutrients & Additives | `nutrients-additives` | All plant nutrition |
| Grow Lights | `grow-lights` | All lighting |
| Environmental Control | `environmental-control` | Fans, AC, CO2 |
| Grow Tents & Rooms | `grow-tents` | Enclosures |
| Growing Media | `growing-media` | Soil, coco, rockwool |
| Containers & Pots | `containers` | Pots, trays, reservoirs |
| Irrigation & Watering | `irrigation` | Pumps, tubing, drip |
| Meters & Monitoring | `meters` | pH, EC, environment |
| Propagation & Cloning | `propagation` | Cloners, domes, rooting |
| Pest & Disease Control | `pest-control` | IPM, sprays |
| Harvesting & Processing | `harvesting` | Trimming, drying |
| Hydroponic Systems | `hydro-systems` | Complete hydro setups |
| CO2 Enrichment | `co2` | CO2 equipment |
| Water Quality | `water-quality` | RO, filters |

### Subcategory Structure

```
Nutrients & Additives/
├── Base Nutrients
├── Bloom Boosters
├── Root Stimulants
├── Additives & Supplements
├── pH & EC Adjusters
└── Organic Nutrients

Grow Lights/
├── LED Grow Lights
├── CMH / LEC
├── HPS
├── Metal Halide
├── T5 Fluorescent
├── Replacement Bulbs
└── Light Accessories

Environmental Control/
├── Inline Fans
├── Oscillating Fans
├── Carbon Filters
├── Ducting & Accessories
├── AC & Cooling
├── Humidifiers
├── Dehumidifiers
├── Heaters
└── Controllers

Irrigation & Watering/
├── Air Pumps
├── Water Pumps
├── Tubing & Fittings
├── Drip Systems
├── Flood & Drain
├── Airstones
└── Reservoirs
```

### Category Priority (for multi-category products)

When a product could belong to multiple categories, assign priority:

```javascript
CATEGORY_PRIORITY = {
  'nutrients-additives': 100,      // Highest
  'growing-media': 95,
  'propagation': 90,
  'irrigation': 85,
  'meters': 80,
  'environmental-control': 75,
  'grow-lights': 70,
  'containers': 65,
  'harvesting': 60,
  'pest-control': 55,
  'co2': 50,
  'water-quality': 45,
  'hydro-systems': 40,
  'grow-tents': 35,
};
```

---

## 4. SKU Standards

### SKU Format

```
{PREFIX}-{CATEGORY}-{IDENTIFIER}
```

**Prefixes:**
- `HMH` — H-Moon Hydro generated SKU
- Vendor SKU — Use as-is if valid

**Category Codes:**
| Code | Category |
|------|----------|
| `NUT` | Nutrients |
| `LIT` | Lights |
| `FAN` | Fans/Ventilation |
| `GRO` | Growing Media |
| `IRR` | Irrigation |
| `POT` | Containers |
| `MET` | Meters |
| `PRO` | Propagation |
| `PES` | Pest Control |
| `HAR` | Harvesting |
| `CO2` | CO2 Equipment |
| `WAT` | Water Quality |
| `HYD` | Hydro Systems |
| `TEN` | Tents |
| `ACC` | Accessories |

**Examples:**
- `HMH-NUT-A3F2B1` — Generated nutrient SKU
- `AN-BIGBUD-1L` — Vendor SKU (Advanced Nutrients)
- `HMH-LIT-LED600` — Generated light SKU

### SKU Rules

1. **Unique per variation** — Every purchasable item has unique SKU
2. **No blanks** — Generate if missing
3. **No duplicates** — Validate before import
4. **No spaces** — Use hyphens
5. **Uppercase** — Normalize to uppercase

### Variation SKU Pattern

For variable products:
```
{PARENT-SKU}-{SIZE-CODE}
```

**Examples:**
- Parent: `AN-BIGBUD` → Variations: `AN-BIGBUD-250ML`, `AN-BIGBUD-1L`, `AN-BIGBUD-4L`
- Parent: `CL-T6` → Variations: `CL-T6-4IN`, `CL-T6-6IN`, `CL-T6-8IN`

---

## 5. Product Description Template

### Short Description (Excerpt)
Max 160 characters. Formula:

```
{Product Name} by {Brand} - {Primary Benefit}. {Key Feature}.
```

**Example:**
> Big Bud by Advanced Nutrients - Maximizes flower production and weight. pH Perfect technology for hassle-free feeding.

### Full Description Structure

```html
<h2>Overview</h2>
<p>[What it is, who it's for, primary benefit]</p>

<h2>Key Benefits</h2>
<ul>
  <li>[Benefit 1]</li>
  <li>[Benefit 2]</li>
  <li>[Benefit 3]</li>
</ul>

<h2>Features</h2>
<ul>
  <li>[Feature with spec]</li>
  <li>[Feature with spec]</li>
</ul>

<h2>How to Use</h2>
<p>[Application instructions]</p>

<h2>Technical Specifications</h2>
<table>
  <tr><th>Spec</th><th>Value</th></tr>
  <tr><td>NPK</td><td>0-15-35</td></tr>
  <tr><td>Type</td><td>Bloom Booster</td></tr>
</table>

<h2>Compatibility</h2>
<p>[Works with X, Y, Z systems/nutrients]</p>
```

### Category-Specific Fields

#### Nutrients
- NPK Ratio (required)
- Application Rate
- Stage (Veg/Bloom/Both)
- Type (Organic/Synthetic)
- Compatible Systems (Soil, Coco, Hydro)

#### Lights
- Actual Wattage (not equivalent)
- Coverage Area
- Spectrum Type
- PPFD @ height
- Efficiency (μmol/J)
- Input Voltage

#### Fans
- CFM Rating
- Duct Size
- Noise Level (dB)
- Speed Control (Yes/No)
- Motor Type

#### Growing Media
- Volume (cu ft or L)
- pH Buffered (Yes/No)
- Drainage Rating
- Material Type

---

## 6. Image Standards

### Primary Image Requirements
- **Resolution:** 1500px × 1500px minimum
- **Background:** White or transparent
- **Format:** JPG or PNG
- **Subject:** Product packaging, front-facing
- **Crop:** Product fills 80% of frame

### Gallery Images (3-6 per product)
1. Front packaging shot (primary)
2. Back/label with ingredients
3. Product in use (lifestyle)
4. Size reference shot
5. Feeding chart (if applicable)
6. Spec sheet / documentation

### Image Naming Convention
```
{sku}-{sequence}.{ext}
```

**Examples:**
- `AN-BIGBUD-1L-01.jpg` (primary)
- `AN-BIGBUD-1L-02.jpg` (back label)
- `AN-BIGBUD-1L-03.jpg` (feeding chart)

### Image Quality Tiers

| Tier | Source | Auto-Apply? |
|------|--------|-------------|
| A | Manufacturer official | Yes |
| B | Professional photo | Yes |
| C | Retailer scraped (high-res) | Review first |
| D | Distributor thumbnail | No — needs replacement |

---

## 7. Meta Fields (Technical Data)

### WooCommerce Custom Fields

| Field | Key | Type | Category |
|-------|-----|------|----------|
| NPK Ratio | `_npk_ratio` | string | Nutrients |
| Application Rate | `_application_rate` | string | Nutrients |
| Growth Stage | `_growth_stage` | select | Nutrients |
| Actual Watts | `_actual_watts` | number | Lights |
| Coverage Area | `_coverage_area` | string | Lights |
| PPFD | `_ppfd_value` | number | Lights |
| CFM Rating | `_cfm_rating` | number | Fans |
| Noise Level | `_noise_db` | number | Fans |
| Duct Size | `_duct_size` | number | Fans/Filters |

### Filterable Attributes

These should be set as filterable in WooCommerce:

- Brand
- Size
- Wattage
- NPK Ratio
- Growth Stage (Veg/Bloom)
- System Compatibility
- Organic/Synthetic

---

## 8. Import Validation Gates

### Pre-Import Checklist

Before any CSV import, validate:

- [ ] No duplicate SKUs
- [ ] No blank SKUs
- [ ] All prices > 0
- [ ] All variable products have attributes
- [ ] All variations have parent reference
- [ ] Categories exist in WooCommerce
- [ ] Image URLs are valid/accessible

### Validation Script

```bash
node scripts/catalog_audit.js
```

Must show:
- SKU Integrity: 100%
- Price Coverage: 100%
- Category Coverage: 100%
- Variable Structure: 100%

### Post-Import Verification

After import:
1. Check product count matches expected
2. Verify variable products have correct variations
3. Test category filters work
4. Confirm images loaded
5. Check prices display correctly

---

## 9. Change Management

### Import Log Requirements

Every enrichment/import run must log:

```json
{
  "timestamp": "2026-02-19T14:30:00Z",
  "operation": "attribute_standardization",
  "products_affected": 145,
  "fields_updated": ["Attribute 1 value(s)"],
  "before_sample": {"SKU": "AN-BB-1L", "Size": "1 Lt."},
  "after_sample": {"SKU": "AN-BB-1L", "Size": "1L"},
  "dry_run": false,
  "operator": "system"
}
```

### Protected Data

Never auto-modify without backup:
- SKUs (established)
- Prices (manually verified)
- Custom images (uploaded)
- Hand-written descriptions

### Confidence Tiers for Auto-Apply

| Confidence | Action | Scope |
|------------|--------|-------|
| 95-100% | Auto-apply | All fields |
| 85-95% | Auto-apply | Images, descriptions only |
| 70-85% | Flag for review | None auto |
| <70% | Ignore | Manual only |

---

## 10. Implementation Priority

### Immediate (Before Next Import)
1. ✅ SKU integrity validated
2. ✅ Price coverage complete
3. ⚠️ Fix 42 variable products missing attributes
4. ⚠️ Standardize 565 size values → ~50 canonical

### Short Term (This Week)
5. Fill 458 missing images
6. Standardize attribute values with script
7. Verify all variations have proper attribute values

### Medium Term (This Month)
8. Create NPK meta fields for nutrients
9. Add technical specs to product descriptions
10. Set up cross-sell/upsell relationships

### Long Term (Ongoing)
11. Automated enrichment pipeline
12. Image quality upgrades
13. Description enhancements

---

## Appendix A: Size Normalization Script

See `scripts/normalize_sizes.js` — Converts all size variations to canonical format.

## Appendix B: Attribute Fix Script

See `scripts/fix_missing_attributes.js` — Adds Size attribute to variable products missing it.

## Appendix C: Current Files

| File | Purpose | Status |
|------|---------|--------|
| `outputs/woocommerce_import_ready.csv` | Primary import file | ✅ Ready |
| `scripts/catalog_audit.js` | Structure validation | ✅ Active |
| `scripts/analyze_attributes.js` | Attribute analysis | ✅ Active |

---

*This document is the authoritative reference for H-Moon Hydro product catalog management. All import scripts, enrichment tools, and manual edits should comply with these standards.*
