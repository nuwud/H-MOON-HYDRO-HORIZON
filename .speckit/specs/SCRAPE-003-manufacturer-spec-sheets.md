# SPEC: SCRAPE-003 — Manufacturer Spec Sheet Scraping System

## Status: 📋 SPECIFICATION COMPLETE

## Overview
A systematic web scraping system to collect **product specifications, feeding charts, NPK data, and spec sheets** from manufacturer websites. Focuses on the ~80 hydroponics brands carried by H-Moon Hydro, storing data locally for enrichment.

---

## Problem Statement

### Current State
- **No spec sheets** attached to products
- **No NPK/feeding data** for nutrients
- **Generic descriptions** without technical details
- **Manual lookup** required for customer questions
- **Competitor advantage** — other stores have rich specs

### Target State
- **Spec sheets downloaded** for all products with PDFs available
- **NPK data extracted** for all nutrient products
- **Feeding charts captured** for nutrient lines
- **Technical specs extracted** for equipment (lights, fans, etc.)
- **Data stored locally** in SQLite + JSON for reuse

---

## Target Manufacturer Sites

### Tier 1: High Priority (Major Brands)

| Brand | Website | Products | Data Available |
|-------|---------|----------|----------------|
| General Hydroponics | generalhydroponics.com | 150+ | NPK, feeding charts, MSDS |
| Advanced Nutrients | advancednutrients.com | 200+ | NPK, grow guides, PDFs |
| FoxFarm | foxfarm.com | 80+ | NPK, feeding schedules |
| Botanicare | botanicare.com | 100+ | NPK, mixing guides |
| Canna | cannagardening.com | 60+ | NPK, feeding charts |
| AC Infinity | acinfinity.com | 100+ | Tech specs, dimensions |
| Spider Farmer | spiderfarmer.com | 50+ | PAR maps, power specs |
| Mars Hydro | mars-hydro.com | 60+ | Light specs, coverage |
| Gavita | gavita.com | 40+ | PPF, spectrum data |

### Tier 2: Medium Priority

| Brand | Website | Products | Data Available |
|-------|---------|----------|----------------|
| Hanna Instruments | hannainst.com | 50+ | Tech specs, calibration |
| Bluelab | bluelab.com | 30+ | Probe specs, accuracy |
| Grodan | grodan.com | 40+ | Specs, drainage data |
| Cyco | cycoflower.com | 60+ | NPK, feeding charts |
| House & Garden | house-garden.us | 70+ | NPK, application rates |
| Mills Nutrients | millsnutrients.com | 30+ | NPK, schedules |
| Athena | athenaag.com | 20+ | NPK, pro feeding |

### Tier 3: Additional Brands

| Brand | Website | Notes |
|-------|---------|-------|
| Hydrofarm | hydrofarm.com | Distributor specs |
| Sun System | sunsystemlights.com | HID lighting |
| Lumatek | lumatek.com | Digital ballasts |
| Fluence | fluence.science | Commercial LED |
| Current Culture | currentculture.com | RDWC systems |
| Mammoth | mammothgrow.com | Airflow |
| Can-Fan | canfilters.com | Carbon filters |
| Phat Filter | phatfilter.com | Odor control |

---

## Data Extraction Targets

### Nutrients (All NPK/Supplement Products)

| Field | Source | Example |
|-------|--------|---------|
| Nitrogen (N) | Product page / PDF | 3.0% |
| Phosphorus (P) | Product page / PDF | 1.0% |
| Potassium (K) | Product page / PDF | 5.0% |
| Calcium (Ca) | Product page / PDF | 2.0% |
| Magnesium (Mg) | Product page / PDF | 0.5% |
| Iron (Fe) | Product page / PDF | 0.1% |
| pH Range | Product page | 5.5-6.5 |
| EC Range | Feeding chart | 1.2-2.0 mS/cm |
| Application Rate | Label / page | 5ml/gallon |
| Feeding Schedule | PDF / chart | Week 1-12 dosage |
| MSDS/SDS | PDF link | Safety data sheet |

### Lights (LED, HID, CMH)

| Field | Source | Example |
|-------|--------|---------|
| Wattage | Spec table | 480W |
| PAR/PPF | Spec table | 1700 μmol/s |
| Efficacy | Calculated | 2.8 μmol/J |
| Coverage (Veg) | Spec table | 5x5 ft |
| Coverage (Flower) | Spec table | 4x4 ft |
| Spectrum | Chart/PDF | Full spectrum |
| Dimensions | Spec table | 45x43x3.5 in |
| Weight | Spec table | 26.5 lbs |
| Voltage | Spec table | 120-277V |
| Warranty | Page | 5 years |

### Environmental (Fans, Filters, Controllers)

| Field | Source | Example |
|-------|--------|---------|
| CFM | Spec table | 807 CFM |
| Noise Level | Spec table | 32 dB |
| Duct Size | Product page | 8 inch |
| Power Draw | Spec table | 65W |
| Speed Settings | Product page | 10-speed |
| Dimensions | Spec table | 14x10x12 in |
| Weight | Spec table | 8.5 lbs |
| Filter Life | Product page | 1-2 years |
| Carbon Depth | Spec table | 2 inch |

---

## Scraping Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SPEC SHEET SCRAPING PIPELINE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │    Brand     │───▶│   Product    │───▶│    Spec      │         │
│  │    Index     │    │    Pages     │    │   Extractor  │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │    Rate      │    │    PDF       │    │    JSON      │         │
│  │   Limiter    │    │   Downloader │    │    Store     │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌──────────────────────────────────────────────────────┐         │
│  │                  outputs/specs/                        │         │
│  │  ├── general_hydroponics/                             │         │
│  │  │   ├── flora_gro.json                               │         │
│  │  │   ├── flora_gro_sds.pdf                            │         │
│  │  │   └── flora_series_feeding_chart.pdf               │         │
│  │  ├── advanced_nutrients/                              │         │
│  │  │   ├── big_bud.json                                 │         │
│  │  │   └── big_bud_datasheet.pdf                        │         │
│  │  └── ac_infinity/                                      │         │
│  │      ├── cloudline_t8.json                            │         │
│  │      └── cloudline_t8_specs.pdf                       │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Site-Specific Extractors

### General Hydroponics (`generalhydroponics.com`)

```python
class GHExtractor(BaseExtractor):
    base_url = "https://generalhydroponics.com"
    
    def get_product_urls(self):
        """Scrape product catalog page."""
        catalog = self.fetch("/products/")
        return [a['href'] for a in catalog.select('.product-card a')]
    
    def extract_specs(self, url):
        """Extract specs from product page."""
        page = self.fetch(url)
        
        return {
            'name': page.select_one('h1.product-title').text.strip(),
            'description': page.select_one('.product-description').text.strip(),
            'npk': self.extract_npk(page),
            'application_rate': self.find_pattern(page, r'(\d+(?:\.\d+)?)\s*(?:ml|tsp)/(?:gallon|liter)'),
            'feeding_chart_url': self.find_pdf_link(page, 'feeding'),
            'sds_url': self.find_pdf_link(page, 'sds|safety'),
        }
    
    def extract_npk(self, page):
        """Parse NPK from guaranteed analysis section."""
        analysis = page.select_one('.guaranteed-analysis')
        if not analysis:
            return {}
        
        npk = {}
        patterns = {
            'nitrogen_n': r'nitrogen.*?(\d+(?:\.\d+)?)\s*%',
            'phosphorus_p': r'phosph.*?(\d+(?:\.\d+)?)\s*%',
            'potassium_k': r'potash|potassium.*?(\d+(?:\.\d+)?)\s*%',
        }
        text = analysis.get_text()
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.I)
            if match:
                npk[key] = float(match.group(1))
        
        return npk
```

### Advanced Nutrients (`advancednutrients.com`)

```python
class ANExtractor(BaseExtractor):
    base_url = "https://advancednutrients.com"
    
    def extract_specs(self, url):
        page = self.fetch(url)
        
        # AN uses structured data
        json_ld = page.select_one('script[type="application/ld+json"]')
        if json_ld:
            data = json.loads(json_ld.string)
            # Extract from structured data
        
        # Also scrape visible specs
        specs_table = page.select('.specs-table tr')
        specs = {}
        for row in specs_table:
            key = row.select_one('th').text.strip().lower()
            value = row.select_one('td').text.strip()
            specs[key] = value
        
        return specs
```

### AC Infinity (`acinfinity.com`)

```python
class ACInfinityExtractor(BaseExtractor):
    base_url = "https://acinfinity.com"
    
    def extract_specs(self, url):
        page = self.fetch(url)
        
        # AC Infinity has a specs tab
        specs_tab = page.select_one('#specifications')
        
        return {
            'cfm': self.extract_number(specs_tab, 'CFM'),
            'noise_db': self.extract_number(specs_tab, 'Noise Level'),
            'duct_size': self.extract_text(specs_tab, 'Duct Size'),
            'wattage': self.extract_number(specs_tab, 'Power'),
            'dimensions': self.extract_text(specs_tab, 'Dimensions'),
            'weight_lbs': self.extract_number(specs_tab, 'Weight'),
            'warranty': self.extract_text(specs_tab, 'Warranty'),
        }
```

---

## Rate Limiting & Politeness

### Default Configuration

```python
SCRAPE_CONFIG = {
    'default_delay': 2.0,          # Seconds between requests
    'max_concurrent': 1,           # One request at a time
    'retry_attempts': 3,           # Retries on failure
    'retry_backoff': [5, 30, 120], # Exponential backoff
    'user_agent': 'HMoonHydro-DataEnrichment/1.0 (+https://hmoonhydro.com)',
    'respect_robots_txt': True,
    'max_pages_per_site': 500,     # Safety limit
}

SITE_SPECIFIC = {
    'generalhydroponics.com': {'delay': 2.0},
    'advancednutrients.com': {'delay': 3.0},  # Slower
    'acinfinity.com': {'delay': 1.5},
    'foxfarm.com': {'delay': 2.5},
}
```

### robots.txt Compliance

```python
from urllib.robotparser import RobotFileParser

class PoliteScraper:
    def __init__(self, base_url):
        self.robots = RobotFileParser()
        self.robots.set_url(f"{base_url}/robots.txt")
        self.robots.read()
    
    def can_fetch(self, url):
        return self.robots.can_fetch('*', url)
    
    def get_crawl_delay(self):
        delay = self.robots.crawl_delay('*')
        return delay or SCRAPE_CONFIG['default_delay']
```

---

## Output Schema

### Spec JSON Format

`outputs/specs/{brand_slug}/{product_slug}.json`

```json
{
  "sku": "GH-FLORA-GRO-1QT",
  "brand": "General Hydroponics",
  "product_name": "Flora Gro",
  "scraped_from": "https://generalhydroponics.com/products/flora-gro",
  "scraped_at": "2026-02-12T18:30:00Z",
  
  "description": "FloraGro builds strong roots during a plant's vegetative stage...",
  "short_description": "Promotes structural and vegetative growth",
  
  "npk": {
    "nitrogen_n": 2.0,
    "phosphorus_p": 1.0,
    "potassium_k": 6.0,
    "calcium_ca": 1.0,
    "magnesium_mg": 0.5
  },
  
  "application": {
    "rate_ml_per_gallon": 10,
    "rate_ml_per_liter": 2.5,
    "frequency": "Every watering",
    "ph_range": {"min": 5.5, "max": 6.5}
  },
  
  "documents": {
    "sds": "outputs/specs/general_hydroponics/flora_gro_sds.pdf",
    "feeding_chart": "outputs/specs/general_hydroponics/flora_series_chart.pdf"
  },
  
  "sizes": [
    {"size": "1 Quart", "sku": "GH-FLORA-GRO-1QT"},
    {"size": "1 Gallon", "sku": "GH-FLORA-GRO-1GAL"},
    {"size": "2.5 Gallon", "sku": "GH-FLORA-GRO-2.5GAL"}
  ],
  
  "related_products": [
    "GH-FLORA-MICRO-1QT",
    "GH-FLORA-BLOOM-1QT"
  ]
}
```

### Equipment Spec Format

```json
{
  "sku": "ACI-CLOUDLINE-T8",
  "brand": "AC Infinity",
  "product_name": "CLOUDLINE T8",
  "scraped_from": "https://acinfinity.com/cloudline-t8",
  "scraped_at": "2026-02-12T18:35:00Z",
  
  "specifications": {
    "cfm": 807,
    "noise_db": 32,
    "duct_size_inches": 8,
    "power_watts": 65,
    "voltage": "120V",
    "speed_settings": 10,
    "dimensions_inches": {"length": 14.2, "width": 10.6, "height": 12.1},
    "weight_lbs": 8.5,
    "cord_length_ft": 6,
    "warranty_years": 2
  },
  
  "features": [
    "PWM-controlled EC motor",
    "Mixed flow technology",
    "Programmable controller included",
    "Temp/humidity sensing"
  ],
  
  "documents": {
    "manual": "outputs/specs/ac_infinity/cloudline_t8_manual.pdf"
  }
}
```

---

## Database Integration

After scraping, import into SQLite master database:

```python
def import_scraped_specs(db, specs_dir):
    """Import scraped specs into product_specs table."""
    
    for brand_dir in os.listdir(specs_dir):
        brand_path = os.path.join(specs_dir, brand_dir)
        
        for spec_file in glob.glob(f"{brand_path}/*.json"):
            with open(spec_file) as f:
                spec = json.load(f)
            
            # Find matching product by SKU
            product = db.products.get_by_sku(spec['sku'])
            if not product:
                # Try fuzzy name match
                product = db.products.search(spec['product_name'], limit=1)
            
            if product:
                # Import specs
                for key, value in spec.get('specifications', {}).items():
                    db.product_specs.upsert(
                        product_id=product.id,
                        spec_name=key,
                        spec_value=str(value),
                        source_url=spec['scraped_from']
                    )
                
                # Import NPK if present
                if 'npk' in spec:
                    db.nutrient_data.upsert(
                        product_id=product.id,
                        **spec['npk']
                    )
```

---

## CLI Tool

```bash
# Scrape single brand
python scripts/scrape/run_scraper.py --brand "general-hydroponics"
# Output: outputs/specs/general_hydroponics/*.json

# Scrape all Tier 1 brands
python scripts/scrape/run_scraper.py --tier 1

# Scrape specific product
python scripts/scrape/run_scraper.py --url "https://advancednutrients.com/products/big-bud"

# Download all PDFs for a brand
python scripts/scrape/download_pdfs.py --brand "advanced-nutrients"

# Import scraped data to SQLite
python scripts/scrape/import_specs.py --input outputs/specs/

# Generate enrichment report
python scripts/scrape/spec_report.py
# Shows: Products matched, specs added, gaps remaining
```

---

## State Management

`outputs/scrape_state.json`

```json
{
  "last_run": "2026-02-12T18:30:00Z",
  "brands_completed": ["general_hydroponics", "foxfarm"],
  "brands_in_progress": ["advanced_nutrients"],
  "brands_pending": ["ac_infinity", "spider_farmer"],
  
  "products_scraped": 245,
  "products_failed": 3,
  "pdfs_downloaded": 89,
  
  "failures": [
    {
      "url": "https://advancednutrients.com/products/overdrive",
      "error": "404 Not Found",
      "attempts": 3,
      "last_attempt": "2026-02-12T18:25:00Z"
    }
  ]
}
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/scrape/base_extractor.py` | Base class for all extractors |
| `scripts/scrape/extractors/gh.py` | General Hydroponics extractor |
| `scripts/scrape/extractors/an.py` | Advanced Nutrients extractor |
| `scripts/scrape/extractors/fox.py` | FoxFarm extractor |
| `scripts/scrape/extractors/aci.py` | AC Infinity extractor |
| `scripts/scrape/extractors/spider.py` | Spider Farmer extractor |
| `scripts/scrape/run_scraper.py` | Main CLI entry point |
| `scripts/scrape/download_pdfs.py` | PDF downloader |
| `scripts/scrape/import_specs.py` | SQLite importer |
| `scripts/scrape/spec_report.py` | Coverage report generator |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Tier 1 brands scraped | ✅ 9 brands (600+ products) |
| NPK data extracted | ✅ 80% of nutrient products |
| Feeding charts downloaded | ✅ 50+ PDFs |
| Equipment specs extracted | ✅ 100+ products |
| Data imported to SQLite | ✅ All specs queryable |
| Rate limit violations | ✅ Zero |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Base Infrastructure | 1 day | Rate limiter, state manager, base extractor |
| 2. GH + AN Extractors | 1 day | Two major nutrient brands |
| 3. Remaining Tier 1 | 2 days | FoxFarm, AC Infinity, Spider Farmer, etc. |
| 4. PDF Downloading | 0.5 day | Feeding charts, SDS sheets |
| 5. SQLite Integration | 0.5 day | Import to master database |
| 6. Reporting | 0.5 day | Coverage reports |

**Total: ~5.5 days**

---

## Dependencies

- Python 3.10+
- httpx>=0.25 (HTTP client with HTTP/2)
- beautifulsoup4>=4.12 (HTML parsing)
- lxml (faster parser)
- pdfplumber (PDF extraction, optional)
- rich (CLI output)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sites block scraping | High | Respect robots.txt, low rate |
| Site structure changes | Medium | Selector fallbacks, monitoring |
| Legal concerns | Medium | Only scrape public product data |
| Rate limiting | Medium | Adaptive delays, backoff |
| Inconsistent data formats | Medium | Fuzzy extraction patterns |

---

## Legal Considerations

- ✅ All data is publicly available product information
- ✅ Respects robots.txt directives
- ✅ Rate limiting prevents server load
- ✅ User-agent identifies purpose
- ✅ Data used for internal product enrichment only
- ⚠️ Do NOT republish scraped content verbatim
- ⚠️ Do NOT scrape pricing data for competitive analysis

---

## References

- [Hydroponics Manufacturer Directory](https://maximumyield.com/hydroponics-company-directory/)
- [Beautiful Soup Documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/)
- [httpx Documentation](https://www.python-httpx.org/)
- Previous spec: [SCRAPE-001](SCRAPE-001-product-enrichment.md)
