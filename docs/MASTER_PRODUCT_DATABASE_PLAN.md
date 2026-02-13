# H-Moon Hydro: Master Product Data Strategy

## Current State Assessment

### What We Have (Feb 12, 2026)

| Data Source | Records | Key Data |
|-------------|---------|----------|
| **WooCommerce Import** | 1,475 products | 100% brands, prices, categories |
| **POS Inventory** | 2,554 items | UPCs, costs, vendor names |
| **Master Category Files** | 3,094 rows | Curated category data |
| **Local Images** | 10,967 files | WooCommerce uploads |
| **POS Alignment** | 928 high-conf matches | SKU ↔ POS mapping |

### Current Quality Metrics

| Product Type | Count | Brand | Categories | Price | Images | UPC |
|--------------|-------|-------|------------|-------|--------|-----|
| Variable | 243 | 100% | 100% | N/A | 96% | N/A |
| Variation | 838 | 100% | Inherits | 100% | 96% | 78% |
| Simple | 359 | 100% | 100% | 100% | 78% | 36% |

### Gaps Identified

1. **Images** - 131 products missing images (79 simple, 37 variations, 10 variable)
2. **UPC Codes** - 36% simple products missing UPC
3. **Spec Sheets** - 0% have detailed specifications
4. **Feeding Charts** - 0% nutrients have feeding schedules
5. **Compatibility** - 0% products have compatibility data

---

## Master Hydroponics Database Vision

### Goal
Create the most comprehensive hydroponics product database that:
- Contains ALL product data before it enters any store
- Sources spec sheets from manufacturers automatically
- Maintains feeding charts for all nutrients
- Tracks product compatibility and series relationships
- Powers multiple sales channels (WooCommerce, Shopify, POS)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  MASTER PRODUCT DATABASE                     │
│  (Local SQLite/JSON - Source of Truth)                      │
├─────────────────────────────────────────────────────────────┤
│  CORE DATA                                                   │
│  ├── SKU (master identifier)                                 │
│  ├── UPC/EAN (barcode)                                       │
│  ├── Product Name                                            │
│  ├── Brand/Manufacturer                                      │
│  ├── Category Hierarchy                                      │
│  ├── Variants (sizes, colors)                                │
│  └── Status (active, discontinued, seasonal)                 │
├─────────────────────────────────────────────────────────────┤
│  PRICING                                                     │
│  ├── MSRP                                                    │
│  ├── Wholesale Cost                                          │
│  ├── MAP (Minimum Advertised Price)                          │
│  ├── Sale Price                                              │
│  └── Price History                                           │
├─────────────────────────────────────────────────────────────┤
│  SPECIFICATIONS                                              │
│  ├── Weight (oz/lb/g/kg)                                     │
│  ├── Dimensions (L x W x H)                                  │
│  ├── NPK Ratio (for nutrients)                               │
│  ├── PAR/Lumens (for lights)                                 │
│  ├── CFM/dB (for fans)                                       │
│  ├── pH Range                                                │
│  ├── Application Rate                                        │
│  └── Custom Specs (JSON)                                     │
├─────────────────────────────────────────────────────────────┤
│  CONTENT                                                     │
│  ├── Short Description                                       │
│  ├── Full Description (HTML)                                 │
│  ├── Features (bullet points)                                │
│  ├── Benefits                                                │
│  ├── Usage Instructions                                      │
│  ├── Feeding Chart (for nutrients)                           │
│  └── Spec Sheet PDF URL                                      │
├─────────────────────────────────────────────────────────────┤
│  MEDIA                                                       │
│  ├── Primary Image URL                                       │
│  ├── Gallery Images                                          │
│  ├── Spec Sheet PDF                                          │
│  ├── Video URL                                               │
│  └── Local File Paths                                        │
├─────────────────────────────────────────────────────────────┤
│  RELATIONSHIPS                                               │
│  ├── Product Series (Flora Series, etc.)                     │
│  ├── Compatible Products                                     │
│  ├── Required Accessories                                    │
│  ├── Alternative Products                                    │
│  └── Frequently Bought Together                              │
├─────────────────────────────────────────────────────────────┤
│  INVENTORY                                                   │
│  ├── In Stock (by location)                                  │
│  ├── On Order                                                │
│  ├── Reorder Point                                           │
│  └── Lead Time                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Consolidate Local Data (Week 1)

### Tasks
1. **Create unified product database** (SQLite)
2. **Import existing sources**:
   - WooCommerce export
   - POS inventory
   - Master category files
   - POS alignment mappings
3. **Deduplicate and merge** records by SKU/UPC matching
4. **Generate master SKU** for unmatched products

### Scripts to Create
```
scripts/
├── init_master_database.py      # Create SQLite schema
├── import_woocommerce.py        # Import WooCommerce products
├── import_pos_inventory.py      # Import POS data
├── import_master_categories.py  # Import category files
├── merge_products.py            # Dedupe and merge
└── export_to_woocommerce.py     # Generate import CSV
```

---

## Phase 2: Online Data Collection (Week 2-3)

### Manufacturer Data Sources

| Brand | Website | Data Available |
|-------|---------|----------------|
| General Hydroponics | generalhydroponics.com | Spec sheets, feeding charts |
| Advanced Nutrients | advancednutrients.com | NPK, feeding calculator |
| FoxFarm | foxfarm.com | Feeding schedules |
| AC Infinity | acinfinity.com | Spec sheets, CFM, dB |
| Gavita | gavita.com | PAR maps, spec sheets |
| Grodan | grodan.com | Technical data |
| Bluelab | bluelab.com | Product manuals |

### Data to Scrape
1. **Product spec sheets** (PDF links)
2. **NPK ratios** for nutrients
3. **Feeding charts/schedules**
4. **Technical specifications**
5. **Product images** (high-res)
6. **MSRP pricing**

### Scripts to Create
```
scripts/scrapers/
├── scrape_gh_products.py        # General Hydroponics
├── scrape_an_products.py        # Advanced Nutrients
├── scrape_foxfarm_products.py   # FoxFarm
├── scrape_ac_infinity.py        # AC Infinity
├── scrape_upc_database.py       # UPC lookup API
└── download_spec_sheets.py      # PDF downloader
```

---

## Phase 3: Spec Sheet Intelligence (Week 3-4)

### For Nutrients
- **NPK Ratio** (N-P-K values)
- **Application Rate** (ml/gal or tsp/gal)
- **Frequency** (every watering, weekly, etc.)
- **Growth Stage** (veg, flower, flush)
- **Compatible With** (other products in line)
- **Feeding Chart** (complete schedule)

### For Lights
- **Wattage** (actual draw)
- **PAR Output** (μmol/s)
- **Coverage Area** (veg/flower)
- **Spectrum** (full, veg, bloom)
- **Efficiency** (μmol/J)
- **Dimensions**
- **Weight**
- **Cooling** (passive/active)

### For Fans/HVAC
- **CFM** (cubic feet/minute)
- **Noise Level** (dB)
- **Speed Settings**
- **Duct Size**
- **Power Draw**

### For Growing Media
- **pH** (buffered range)
- **EC** (starting level)
- **Water Retention**
- **Drainage**
- **Composition**

---

## Phase 4: Feeding Chart System (Week 4-5)

### Data Model
```json
{
  "brand": "General Hydroponics",
  "series": "Flora Series",
  "products": ["FloraGro", "FloraMicro", "FloraBloom"],
  "schedule": {
    "seedling": {
      "week": "1-2",
      "floragro": "2.5ml/gal",
      "floramicro": "2.5ml/gal",
      "florabloom": "0ml/gal"
    },
    "early_veg": {
      "week": "3-4",
      "floragro": "5ml/gal",
      "floramicro": "5ml/gal",
      "florabloom": "0ml/gal"
    }
    // ... more stages
  }
}
```

### Create
- Feeding chart database
- Interactive calculator tool
- PDF generation for printable charts
- Series compatibility matrix

---

## Phase 5: Product Relationships (Week 5-6)

### Relationship Types
1. **Series** - Products that work together (Flora Series 3-part)
2. **Compatible** - Products that can be mixed
3. **Required** - Accessories needed (bulb + ballast + reflector)
4. **Alternative** - Competing products
5. **Upgrade** - Better version available
6. **Complementary** - Frequently bought together

### Build
- Product relationship graph
- "Complete Kit" suggestions
- Compatibility warnings
- Cross-sell recommendations

---

## Immediate Action Items

### Today
1. ✅ Run `enrich_from_local_sources.py` - Done
2. Create `master_products.db` SQLite database
3. Import all existing data sources

### This Week
1. Build UPC lookup tool (use existing POS data)
2. Download spec sheets for top 50 products
3. Create NPK database for nutrients

### Resources Needed
- UPC API access (upcitemdb.com free tier: 100/day)
- Web scraping setup (respect robots.txt)
- PDF parsing library (pdfplumber)

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/enrich_from_local_sources.py` | Pull POS data into WooCommerce |
| `scripts/enrich_woo_import.py` | Brand/weight/description enrichment |
| `scripts/convert_grouped_to_variable.py` | Create variable products |
| `outputs/woocommerce_fully_enriched.csv` | Latest enriched import |

---

## Next Steps

1. **Import the enriched file** - `outputs/woocommerce_MASTER_IMPORT_20260212_1804.csv`
2. **Build the SQLite master database** - Single source of truth
3. **Start scraping manufacturer sites** - Spec sheets, images, charts
4. **Create feeding chart system** - Major value-add for customers

Would you like me to start building the Master Database (SQLite) now?
