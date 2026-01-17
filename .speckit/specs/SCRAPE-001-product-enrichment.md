# Product Scraping & Enrichment System

## Specification: SCRAPE-001

## Status: ✅ PHASE 1 COMPLETE (Core Enrichment)

### Completion Summary (2025-01-09)

| Deliverable | Target | Actual | Status |
|-------------|--------|--------|--------|
| Grease images fixed | 9 products | ✅ All have CDN images | ✅ |
| Descriptions | 100% | 1193/1193 (100%) | ✅ |
| SEO Titles | 100% | 1193/1193 (100%) | ✅ |
| SEO Descriptions | 100% | 1193/1193 (100%) | ✅ |
| Prices | 100% | 1193/1193 (100%) | ✅ |
| Categories | 99% | 1192/1193 (99.9%) | ✅ |

### Grease Products Fixed
All Grease brand products now have correct images:
- `yellow-label-finisher` → ✅ GreaseBottle1LYellowcopy-1-scaled.webp
- `super-grease-canna-super-labs` → ✅ SuperGrease-1-scaled.webp
- `purple-label-indica` → ✅ GreaseBottle1LPurplecopy-1-scaled.webp
- `og-grease-trace-booster` → ✅ OGGreasecopy-1-scaled.webp
- `grease-gun-auto-seed-8pk` → ✅ Atlas-Seed-Grease-Gun-7.webp
- `grow-grease-fermented-vegetative-plant-juice` → ✅ GrowGreasecopy-1-scaled.webp
- `bloom-grease-fermented-flowering-plant-juice` → ✅ BloomGrease-1-scaled.webp
- `blue-grease-algae-extract` → ✅ BlueGreasecopy-1-scaled.webp

### Phase 2 (Future)
- [ ] Competitor pricing scraping
- [ ] Extended product specifications
- [ ] Manufacturer site enrichment

---

### Overview
A comprehensive system for scraping competitor hydroponics stores to enrich H-Moon Hydro product data with accurate images, descriptions, specifications, and pricing information.

### Motivation
The previous WooCommerce → Shopify migration resulted in:
- ~~Incorrect product images (e.g., Grease brand products have wrong images)~~ ✅ FIXED
- ~~Missing product specifications~~ ✅ Descriptions added
- ~~Incomplete descriptions~~ ✅ 100% coverage
- Outdated pricing data (Phase 2)

By scraping authoritative sources, we can fix these issues and provide customers with accurate, rich product information.

---

## Source Hierarchy

### Tier 1: Manufacturer Sites (Authoritative)
| Source | Products | Priority | Notes |
|--------|----------|----------|-------|
| growwithgrease.com | Grease nutrients | 🔴 HIGH | **Fix broken Grease images** |
| generalhydroponics.com | GH Flora series | 🔴 HIGH | Primary nutrient line |
| acinfinity.com | Fans, tents, controllers | 🔴 HIGH | Major brand |
| foxfarm.com | FoxFarm nutrients | 🟡 MEDIUM | Soil & nutrients |
| spiderfarmer.com | LED grow lights | 🟡 MEDIUM | Lighting |
| marshydro.com | LED grow lights | 🟡 MEDIUM | Lighting |
| gavita.com | Pro lighting | 🟡 MEDIUM | Commercial lighting |

### Tier 2: Major Retailers (Specs & Pricing)
| Source | URL | Products | Notes |
|--------|-----|----------|-------|
| GrowGeneration | growgeneration.com | Full catalog | Largest hydro chain, good specs |
| Hydrobuilder | hydrobuilder.com | Nutrients, media | Good pricing, variant data |
| HTG Supply | htgsupply.com | Lighting focus | Detailed light specs |
| GH Hydro | ghhydro.com | General | Good descriptions |

### Tier 3: Secondary Retailers (Fill gaps)
| Source | URL | Notes |
|--------|-----|-------|
| Shop Urban Greenhouse | shopurbangreenhouse.myshopify.com | Shopify store |
| Shop Hydrocity | shophydrocity.com | Regional retailer |
| Sunwest Hydro | sunwesthydro.com | Regional retailer |
| All Seasons Hydro | allseasonshydro.com | Full catalog |
| Grow Ace | growace.com | Budget options |
| Grow Lights CA | growlights.ca | Canadian source |
| Humboldts Secret | humboldtssecretsupplies.com | Specialty nutrients |
| Hey Abby | heyabby.com | Grow systems |
| Seed World USA | seedworldusa.com | Seeds |
| Farmers Defense | farmersdefense.com | Protective gear |
| Used Hydro Shop | usedhydroshop.com | Reference pricing |

### Tier 4: ShopifySpy Competitor Database (100 of 648 stores)
**Source**: [shopifyspy.com/stores/niches/hydroponic](https://shopifyspy.com/stores/niches/hydroponic/)

| Store | Domain | Products | Tier | Notes |
|-------|--------|----------|------|-------|
| ZenHydro | zenhydro.com | 955 | 1 | Large US catalog |
| Costa Rica Hydro | costaricahydroponics.com | 1,488 | 1 | Huge catalog |
| Happy Hydro | happyhydro.com | 181 | 1 | Full hydro supply |
| Grow Ace | growace.com | 236 | 1 | LED, HPS, tents |
| Hydroponics Club CA | hydroponicsclub.ca | 1,013 | 2 | Large Canada catalog |
| Mass Hydro | mass-hydro.com | 762 | 2 | MA large catalog |
| Grow Lights CA | growlights.ca | 555 | 1 | Canada #1 lights |
| Hello Hydroponics AU | hellohydroponics.com.au | 714 | 2 | Australia large |
| Indoor Grow NZ | indoorgrow.nz | 694 | 2 | NZ large catalog |
| Seed World USA | seedworldusa.com | 538 | 1 | Seeds, established 2012 |

**Full list**: See `hmoon-pipeline/src/config/competitorStores.ts` (100 stores parsed, 548 remaining on ShopifySpy)

### Local Sources
| Source | Path | Products |
|--------|------|----------|
| WooCommerce SQL | `hmoonhydro.com/hmoonhydro_com_1.sql` | Original product data |
| WooCommerce Export | `CSVs/Products-Export-2025-Oct-29-171532.csv` | Product export |
| Existing Shopify | `CSVs/products_export_1.csv` | Current state |
| **WooCommerce Images** | `hmoonhydro.com/wp-content/uploads/2024/03/` | ✅ Original Grease images available locally |

---

## ⚠️ Discovery: Grease Images Available Locally

**Finding**: The `growwithgrease.com` site blocks automated requests (ERR_BLOCKED_BY_RESPONSE).

**Good news**: The original WooCommerce backup contains all Grease product images in:
```
hmoonhydro.com/wp-content/uploads/2024/03/
```

### Available Local Grease Images
| Product Handle | Image File | Status |
|----------------|------------|--------|
| `alfa-grease-alfalfa-extract` | `AlfaGreasecopy-1-scaled.webp` | ✅ Found |
| `bloom-grease-fermented-flowering-plant-juice` | `BloomGrease-1-scaled.webp` | ✅ Found |
| `blue-grease-algae-extract` | `BlueGreasecopy-1-scaled.webp` | ✅ Found |
| `grow-grease-fermented-vegetative-plant-juice` | `GrowGreasecopy-1-scaled.webp` | ✅ Found |
| `og-grease-trace-booster` | `OGGreasecopy-1-scaled.webp` | ✅ Found |
| `super-grease-canna-super-labs` | `SuperGrease-1-scaled.webp` | ✅ Found |
| `amber-label-sativa` | `GreaseBottle1LAmbercopy...-scaled.webp` | ✅ Found |
| `purple-label-indica` | `GreaseBottle1LPurplecopy-1-scaled.webp` | ✅ Found |
| `yellow-label-finisher` | `GreaseBottle1LYellowcopy-1-scaled.webp` | ✅ Found |

### Implementation
Use `localImageExtractor.ts` to:
1. Map product handles → local image files
2. Upload to Shopify CDN
3. Update product image references

See: `hmoon-pipeline/src/scraping/localImageExtractor.ts`

---

## Priority Products: Grease Brand Fix

### Identified Grease Products (from WooCommerce SQL)
```
og-grease-trace-booster
grow-grease-fermented-vegetative-plant-juice
blue-grease-algae-extract
alfa-grease-alfalfa-extract
bloom-grease-fermented-flowering-plant-juice
super-grease-canna-super-labs
grease-gun-auto-seed-8pk
```

### Source for Grease Data
**Primary**: https://www.growwithgrease.com/
**Backup**: Original WooCommerce images from `hmoonhydro.com/`

### Grease Fix Workflow
1. Scrape growwithgrease.com product catalog
2. Match products by SKU/title to H-Moon Hydro products
3. Extract: images, descriptions, NPK ratios, usage instructions
4. Update Shopify via GraphQL with correct data

---

## User Stories

### As a store owner, I want to:
- Fix incorrect product images so customers see accurate products
- Have complete product specifications to improve SEO and conversions
- Get competitor pricing data to stay competitive
- Automate enrichment so I don't manually copy/paste data

### As a developer, I want to:
- Create reusable scrapers per domain
- Have a unified output format (ScrapedCompetitorProduct)
- Handle rate limiting and retries gracefully
- Match scraped data to existing products automatically

---

## Acceptance Criteria

### Phase 1: Grease Fix (Priority)
- [ ] All Grease products have correct images from growwithgrease.com
- [ ] Grease product descriptions updated
- [ ] NPK ratios extracted and stored as metafields
- [ ] Usage instructions added to product descriptions

### Phase 2: Core Scrapers
- [ ] Domain-specific scrapers for Tier 1 manufacturers
- [ ] Generic scraper for Tier 2/3 retailers
- [ ] Rate limiting (1-2 second delays)
- [ ] Error handling with retry logic

### Phase 3: Product Matching
- [ ] Match scraped products to existing Shopify products by:
  - SKU (exact match)
  - UPC/barcode (exact match)
  - Title + Brand (fuzzy match with threshold)
  - MPN (manufacturer part number)
- [ ] Handle variants (size/color)
- [ ] Generate confidence scores for matches

### Phase 4: Enrichment Pipeline
- [ ] Update product images (highest priority)
- [ ] Update descriptions (if empty or < 50 words)
- [ ] Update specifications (category-specific metafields)
- [ ] Add competitor pricing as reference data
- [ ] Update SEO titles/descriptions

### Phase 5: Validation & Reporting
- [ ] Before/after comparison report
- [ ] Products enriched count
- [ ] Products still missing data
- [ ] Image quality validation (dimensions, file size)

---

## Technical Approach

### Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Scraper CLI    │────▶│  Scraper Engine  │────▶│  Raw Data Store │
│  (per domain)   │     │  (cheerio/fetch) │     │  (JSON files)   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Shopify Sync   │◀────│  Product Matcher │◀────│  Normalizer     │
│  (GraphQL API)  │     │  (fuzzy + exact) │     │  (specs, units) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Files to Create
| File | Purpose |
|------|---------|
| `hmoon-pipeline/src/scraping/scrapers/greaseScraper.ts` | Grease brand scraper |
| `hmoon-pipeline/src/scraping/scrapers/growGenerationScraper.ts` | GrowGeneration |
| `hmoon-pipeline/src/scraping/scrapers/hydrobuilderScraper.ts` | Hydrobuilder |
| `hmoon-pipeline/src/scraping/scrapers/genericShopifyScraper.ts` | Generic Shopify stores |
| `hmoon-pipeline/src/scraping/productMatcher.ts` | Match scraped to existing |
| `hmoon-pipeline/src/scraping/normalizers/nutrientNormalizer.ts` | Normalize nutrient specs |
| `hmoon-pipeline/src/scraping/normalizers/lightingNormalizer.ts` | Normalize light specs |
| `hmoon-pipeline/src/scraping/enrichmentWriter.ts` | Write to Shopify |
| `hmoon-pipeline/src/cli/scrapeProducts.ts` | CLI entry point |
| `hmoon-pipeline/src/cli/enrichFromScrape.ts` | Apply scraped data |

### Files to Modify
| File | Changes |
|------|---------|
| `hmoon-pipeline/src/scraping/types.ts` | Add missing interfaces |
| `hmoon-pipeline/package.json` | Add scraping npm scripts |
| `hmoon-pipeline/src/config/scrapingTargets.ts` | Domain configurations |

---

## Existing Image Upload Infrastructure

### ✅ Already Implemented — Reuse These!

The project has a complete Shopify CDN upload pipeline. **Do NOT recreate this functionality.**

| Script | Purpose | Usage |
|--------|---------|-------|
| `uploadImagesToShopifyFiles.ts` | Upload local images → Shopify Files CDN | Primary image uploader |
| `uploadLocalImages.ts` | Upload WooCommerce images to products | Product-attached images |
| `uploadGapFilesToShopify.ts` | Upload specific gap files | Targeted uploads |
| `uploadWooImages.ts` | Bulk upload from WooCommerce URLs | Remote URL uploads |

### Core Upload Function Pattern

The upload workflow uses Shopify's staged upload API:

```typescript
// 1. Create staged upload (get presigned URL)
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url, resourceUrl, parameters { name, value } }
  }
}

// 2. POST file to staged URL (FormData)
const formData = new FormData();
for (const param of target.parameters) {
  formData.append(param.name, param.value);
}
formData.append('file', blob, filename);
await fetch(target.url, { method: 'POST', body: formData });

// 3. Create file record in Shopify
mutation fileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { id, ... on MediaImage { image { url } } }
  }
}

// 4. Poll for file status until READY
// Returns CDN URL: https://cdn.shopify.com/s/files/1/0672/5730/3114/files/...
```

### Output: files_manifest.json

After upload, the CDN URL is stored in `outputs/files_manifest.json`:

```json
{
  "byFilename": {
    "AlfaGreasecopy-1-scaled.webp": {
      "originalFilename": "AlfaGreasecopy-1-scaled.webp",
      "shopifyFilename": "a1b2c3d4__AlfaGreasecopy-1-scaled.webp",
      "sha1": "a1b2c3d4e5f6...",
      "shopifyUrl": "https://cdn.shopify.com/s/files/1/0672/5730/3114/files/a1b2c3d4__AlfaGreasecopy-1-scaled.webp",
      "shopifyFileId": "gid://shopify/MediaImage/12345",
      "uploadedAt": "2026-01-09T...",
      "sizeBytes": 123456
    }
  },
  "bySha1": { ... }
}
```

### Using CDN URLs in CSV Import

After uploading, use the manifest to populate `Image Src` column:

```typescript
import { readFileSync } from 'fs';

const manifest = JSON.parse(readFileSync('outputs/files_manifest.json', 'utf-8'));
const cdnUrl = manifest.byFilename['AlfaGreasecopy-1-scaled.webp'].shopifyUrl;
// Use cdnUrl in CSV import row
```

### CLI Commands (Already Available)

```bash
# Upload local images to Shopify Files
npx tsx src/cli/uploadImagesToShopifyFiles.ts --dry-run
npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm

# Upload specific files from gap report
npx tsx src/cli/uploadGapFilesToShopify.ts --confirm --limit=50

# Upload WooCommerce images to products directly
npx tsx src/cli/uploadLocalImages.ts --confirm
```

---

### Dependencies
```json
{
  "cheerio": "^1.0.0",
  "node-fetch": "^3.3.2",
  "p-queue": "^8.0.1",
  "fuse.js": "^7.0.0"
}
```

---

## Scraper Patterns

### Domain-Specific Selectors
Each domain needs custom selectors:

```typescript
// greaseScraper.ts
const GREASE_SELECTORS = {
  productGrid: '.product-grid .product-card',
  title: 'h1.product-title',
  price: '.product-price .amount',
  description: '.product-description',
  images: '.product-gallery img',
  npkRatio: '.product-specs .npk-value',
  usageInstructions: '.usage-instructions',
};
```

### Rate Limiting Pattern
```typescript
import PQueue from 'p-queue';

const queue = new PQueue({
  concurrency: 1,
  interval: 2000,  // 2 seconds between requests
  intervalCap: 1,
});

async function scrapeWithRateLimit(urls: string[]) {
  return Promise.all(
    urls.map(url => queue.add(() => scrapeProduct(url)))
  );
}
```

### Product Matching Pattern
```typescript
import Fuse from 'fuse.js';

const fuse = new Fuse(existingProducts, {
  keys: ['title', 'vendor', 'sku'],
  threshold: 0.3,
  includeScore: true,
});

function findMatch(scraped: ScrapedProduct): MatchResult {
  // Try exact SKU match first
  const skuMatch = existingProducts.find(p => p.sku === scraped.core.sku);
  if (skuMatch) return { product: skuMatch, confidence: 1.0, method: 'sku' };
  
  // Fuzzy title+brand match
  const fuzzyResults = fuse.search(`${scraped.core.brand} ${scraped.core.title}`);
  if (fuzzyResults.length > 0 && fuzzyResults[0].score < 0.3) {
    return { product: fuzzyResults[0].item, confidence: 1 - fuzzyResults[0].score, method: 'fuzzy' };
  }
  
  return { product: null, confidence: 0, method: 'none' };
}
```

---

## CLI Commands

### Proposed npm Scripts
```json
{
  "scripts": {
    "scrape:grease": "tsx src/cli/scrapeProducts.ts --source=grease --output=outputs/scraped/grease.json",
    "scrape:growgen": "tsx src/cli/scrapeProducts.ts --source=growgeneration --output=outputs/scraped/growgen.json",
    "scrape:hydrobuilder": "tsx src/cli/scrapeProducts.ts --source=hydrobuilder --output=outputs/scraped/hydrobuilder.json",
    "scrape:all": "tsx src/cli/scrapeProducts.ts --source=all",
    "enrich:grease": "tsx src/cli/enrichFromScrape.ts --source=grease --dry-run",
    "enrich:apply": "tsx src/cli/enrichFromScrape.ts --source=all --confirm",
    "match:report": "tsx src/cli/generateMatchReport.ts"
  }
}
```

---

## Edge Cases

### Image Handling
- **Multiple images**: Take all, order by position
- **Different sizes**: Prefer largest available
- **CDN URLs**: Handle Shopify CDN rewrites
- **Missing images**: Log but don't fail

### Variant Matching
- **Size variants**: Match by volume (1L, 4L, 1gal)
- **Color variants**: Match by color name
- **Combo products**: Handle kits vs individual

### Price Handling
- **Sale prices**: Store both regular and sale
- **Out of stock**: Note availability, keep data
- **Different currencies**: Convert to USD

### Rate Limit Handling
- **429 errors**: Exponential backoff
- **403 errors**: Rotate user agents
- **Cloudflare**: Handle JS challenge pages

---

## Testing Plan

### Unit Tests
- [ ] URL parsing and domain detection
- [ ] Selector extraction per domain
- [ ] Price normalization (remove $, convert)
- [ ] NPK ratio extraction
- [ ] Volume/weight unit conversion

### Integration Tests
- [ ] Full scrape of 5 products per source
- [ ] Product matching accuracy (>90%)
- [ ] Enrichment dry-run output validation

### Manual Testing
- [ ] Verify Grease images display correctly
- [ ] Check description formatting in Shopify
- [ ] Validate metafields created properly

---

## H-Moon Hydro Specific Considerations

### Agent Consultation
- [x] `@repo-archeologist` — Checked existing scrapers (found `exampleScraper.ts`)
- [ ] `@brand-normalizer` — Grease brand detection
- [ ] `@shopify-compliance-auditor` — Validate before bulk update

### Data Impact
- [ ] Backup `products_export_1.csv` before enrichment
- [ ] Use `--dry-run` mode first
- [ ] Rate limit Shopify mutations (200-500ms)

### Brand Registry Update
Add to `brandRegistry.ts`:
```typescript
BRAND_ALIASES.set('grease', 'Grease');
BRAND_ALIASES.set('grow with grease', 'Grease');
KNOWN_BRANDS.add('Grease');
```

---

## Rollback Plan

1. **Before enrichment**: Export current products to timestamped backup
2. **Track changes**: Log all mutations with before/after values
3. **Rollback script**: `revertEnrichment.ts --session=<id>`
4. **Partial rollback**: Target specific products or fields

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Grease products with correct images | 100% |
| Products with >100 word descriptions | +50% |
| Products with complete specs | +40% |
| Average product health score | +15 points |
| Image quality (>500px width) | 95% |

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Grease Fix | 3 days | Grease products fully enriched |
| Phase 2: Core Scrapers | 1 week | 4 domain scrapers working |
| Phase 3: Matching | 3 days | Product matcher with 90%+ accuracy |
| Phase 4: Enrichment | 1 week | Full pipeline operational |
| Phase 5: Validation | 2 days | Reports and quality checks |

---

## Related Documents

- [Scraping Schema](../docs/scraping-schema.md) — Full TypeScript interfaces
- [Brand Registry](../hmoon-pipeline/src/config/brandRegistry.ts) — Brand normalization
- [Import Runbook](../hmoon-pipeline/docs/IMPORT_RUNBOOK.md) — Deployment guide
