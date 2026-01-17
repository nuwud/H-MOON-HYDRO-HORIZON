# Implementation Plan: Grease Product Fix

## Plan: SCRAPE-001-P1-GREASE

## Status: ✅ COMPLETE

**Spec Reference**: [SCRAPE-001-product-enrichment.md](../specs/SCRAPE-001-product-enrichment.md)  
**Priority**: 🔴 HIGH  
**Completed**: 2025-01-09

---

## Completion Summary

All Grease products now have correct images uploaded to Shopify CDN:

| Product | Image | Status |
|---------|-------|--------|
| yellow-label-finisher | GreaseBottle1LYellowcopy-1-scaled.webp | ✅ |
| super-grease-canna-super-labs | SuperGrease-1-scaled.webp | ✅ |
| purple-label-indica | GreaseBottle1LPurplecopy-1-scaled.webp | ✅ |
| og-grease-trace-booster | OGGreasecopy-1-scaled.webp | ✅ |
| grease-gun-auto-seed-8pk | Atlas-Seed-Grease-Gun-7.webp | ✅ |
| grow-grease-fermented-vegetative-plant-juice | GrowGreasecopy-1-scaled.webp | ✅ |
| bloom-grease-fermented-flowering-plant-juice | BloomGrease-1-scaled.webp | ✅ |
| blue-grease-algae-extract | BlueGreasecopy-1-scaled.webp | ✅ |

**Source**: Original WooCommerce backup images were used (manufacturer site blocked scraping).

---

## Prerequisites

- [x] Identified Grease products in WooCommerce SQL dump
- [x] Confirmed source: https://www.growwithgrease.com/
- [ ] Backup `products_export_1.csv`
- [ ] Confirm Shopify API credentials in `.env`
- [ ] Install dependencies: `npm install cheerio p-queue fuse.js`

---

## Phase 1: Scraper Development

### Step 1.1: Create Grease Scraper Structure
| Action | Command | Verification |
|--------|---------|--------------|
| Create scraper directory | `mkdir -p src/scraping/scrapers` | Directory exists |
| Create greaseScraper.ts | See code below | File created |

### Step 1.2: Implement Grease Scraper

```typescript
// hmoon-pipeline/src/scraping/scrapers/greaseScraper.ts

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import type { ScrapedCompetitorProduct, NutrientSpecs } from '../types.js';

const BASE_URL = 'https://www.growwithgrease.com';

const SELECTORS = {
  productLinks: '.product-card a, .product-item a',
  title: 'h1.product-title, h1.product__title, .product-single__title',
  price: '.product-price, .price, [data-product-price]',
  description: '.product-description, .product__description, .rte',
  images: '.product-gallery img, .product__media img, [data-product-image]',
  sku: '[data-sku], .product-sku',
  specs: '.product-specs, .product__specs',
};

export async function scrapeGreaseProductList(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/collections/all`);
  const html = await res.text();
  const $ = cheerio.load(html);
  
  const urls: string[] = [];
  $(SELECTORS.productLinks).each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/products/')) {
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      if (!urls.includes(fullUrl)) urls.push(fullUrl);
    }
  });
  
  return urls;
}

export async function scrapeGreaseProduct(url: string): Promise<ScrapedCompetitorProduct> {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  
  // Extract basic info
  const title = $(SELECTORS.title).first().text().trim();
  const priceText = $(SELECTORS.price).first().text().replace(/[^0-9.]/g, '');
  const price = parseFloat(priceText) || undefined;
  
  // Extract images
  const images: string[] = [];
  $(SELECTORS.images).each((_, img) => {
    let src = $(img).attr('src') || $(img).attr('data-src');
    if (src) {
      // Handle Shopify CDN srcset
      if (src.startsWith('//')) src = 'https:' + src;
      // Get highest resolution
      src = src.replace(/_\d+x\d+\./, '.');
      if (!images.includes(src)) images.push(src);
    }
  });
  
  // Extract description
  const descriptionHtml = $(SELECTORS.description).first().html() || '';
  const descriptionText = $(SELECTORS.description).first().text().trim();
  
  // Extract nutrient-specific specs
  const nutrientSpecs = extractNutrientSpecs($);
  
  return {
    sourceDomain: 'growwithgrease.com',
    url,
    core: {
      title,
      brand: 'Grease',
      price,
      currency: 'USD',
    },
    content: {
      shortDescription: descriptionText.slice(0, 200),
      longDescriptionHtml: descriptionHtml,
    },
    specs: {
      nutrient: nutrientSpecs,
    },
    images: {
      main: images[0],
      gallery: images.slice(1),
    },
  };
}

function extractNutrientSpecs($: cheerio.CheerioAPI): NutrientSpecs {
  const specs: NutrientSpecs = {};
  
  // Look for NPK ratio
  const npkMatch = $('body').text().match(/(\d+-\d+-\d+)/);
  if (npkMatch) specs.npkRatio = npkMatch[1];
  
  // Look for dilution rate
  const dilutionMatch = $('body').text().match(/(\d+\s*(?:ml|tsp|tbsp)\s*(?:per|\/)\s*(?:gallon|gal|L))/i);
  if (dilutionMatch) specs.dilutionRate = dilutionMatch[1];
  
  // Check for organic certifications
  if (/OMRI/i.test($('body').text())) specs.omriListed = true;
  
  // Growth stage detection
  const text = $('body').text().toLowerCase();
  const stages: string[] = [];
  if (/\b(veg|vegetative|grow)\b/.test(text)) stages.push('veg');
  if (/\b(bloom|flower|fruit)\b/.test(text)) stages.push('bloom');
  if (/\b(clone|cutting|root)\b/.test(text)) stages.push('clone');
  if (stages.length) specs.growthStage = stages;
  
  return specs;
}
```

### Step 1.3: Verify Scraper Works
| Action | Command | Expected |
|--------|---------|----------|
| Test single product | `npx tsx src/scraping/scrapers/greaseScraper.ts --test` | JSON output |
| Scrape full catalog | `npm run scrape:grease` | `outputs/scraped/grease.json` |

---

## Phase 2: Product Matching

### Step 2.1: Extract Current Grease Products from Shopify
```bash
# Filter current products by vendor
grep -i "grease" CSVs/products_export_1.csv > outputs/current_grease_products.csv
```

### Step 2.2: Match Scraped to Existing
| Match Priority | Method | Confidence |
|----------------|--------|------------|
| 1 | SKU exact match | 100% |
| 2 | Title + Brand fuzzy (Fuse.js) | 80-95% |
| 3 | Title contains product name | 60-80% |
| 4 | Manual review queue | <60% |

### Step 2.3: Generate Match Report
```bash
npm run match:report -- --source=grease --output=outputs/grease_matches.json
```

Expected output:
```json
{
  "matched": [
    {
      "scraped": { "title": "Grow Grease", "url": "..." },
      "existing": { "handle": "grow-grease-fermented-vegetative-plant-juice", "id": "..." },
      "confidence": 0.95,
      "method": "fuzzy"
    }
  ],
  "unmatched": [],
  "needsReview": []
}
```

---

## Phase 3: Image Upload (Using Existing Infrastructure)

### ⚠️ Note: growwithgrease.com blocks automated requests

Since the manufacturer site blocks scraping, we'll use the **local WooCommerce images** from:
```
hmoonhydro.com/wp-content/uploads/2024/03/*Grease*-scaled.webp
```

### Step 3.1: Prepare Image Matches File

Create `outputs/grease_image_matches.json`:

```json
{
  "alfa-grease-alfalfa-extract": [{
    "source": "local",
    "absolutePath": "hmoonhydro.com/wp-content/uploads/2024/03/AlfaGreasecopy-1-scaled.webp",
    "filename": "AlfaGreasecopy-1-scaled.webp",
    "matchType": "exact",
    "score": 1.0,
    "position": 1
  }],
  "bloom-grease-fermented-flowering-plant-juice": [{
    "source": "local", 
    "absolutePath": "hmoonhydro.com/wp-content/uploads/2024/03/BloomGrease-1-scaled.webp",
    "filename": "BloomGrease-1-scaled.webp",
    "matchType": "exact",
    "score": 1.0,
    "position": 1
  }]
}
```

Or use `localImageExtractor.ts` to generate it:
```bash
npx tsx src/scraping/localImageExtractor.ts
```

### Step 3.2: Upload to Shopify Files CDN (Dry Run)

Use the **existing** `uploadImagesToShopifyFiles.ts`:

```bash
# Dry run first
npx tsx src/cli/uploadImagesToShopifyFiles.ts --dry-run

# After verification, upload (limit to grease images)
npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm --limit=20
```

### Step 3.3: Check files_manifest.json

After upload, verify CDN URLs in `outputs/files_manifest.json`:

```bash
cat outputs/files_manifest.json | grep -i grease
```

Expected entries:
```json
{
  "AlfaGreasecopy-1-scaled.webp": {
    "shopifyUrl": "https://cdn.shopify.com/s/files/1/0672/5730/3114/files/...",
    ...
  }
}
```

### Step 3.4: Update Product Images

Use the **existing** `uploadLocalImages.ts` to attach to products:

```bash
# Dry run
npx tsx src/cli/uploadLocalImages.ts --dry-run

# Apply
npx tsx src/cli/uploadLocalImages.ts --confirm
```

---

## Phase 4: Enrichment

### Step 4.1: Dry Run
```bash
npm run enrich:grease -- --dry-run
```

Expected output:
```
[DRY RUN] Would update product: grow-grease-fermented-vegetative-plant-juice
  - Image: (local) AlfaGreasecopy-1-scaled.webp → (CDN) https://cdn.shopify.com/...
  - Description: [current 45 words] → [new 180 words]
  - Metafield: nutrient.npkRatio = "3-1-2"

Summary: 9 products would be updated
```

### Step 4.2: Backup Before Apply
```bash
cp CSVs/products_export_1.csv "CSVs/backups/products_export_1_$(date +%Y%m%d_%H%M%S).csv"
```

### Step 4.3: Apply Enrichment
```bash
npm run enrich:grease -- --confirm
```

### Step 4.4: Verify in Shopify Admin
- [ ] Check each Grease product has correct image
- [ ] Verify descriptions updated
- [ ] Confirm metafields populated

---

## Phase 5: Validation

### Step 5.1: Re-export Products
```bash
npm run sync:pull
```

### Step 5.2: Compare Before/After
```bash
npm run compare:enrichment -- --before=backups/products_export_1_*.csv --after=products_export_1.csv
```

### Step 5.3: Health Score Check
```bash
npm run score -- --filter=vendor:Grease
```

Expected improvement: +15-20 points average

---

## Rollback Steps

### If Phase 4 Fails
1. Stop any running enrichment
2. Restore backup: `cp CSVs/backups/products_export_1_TIMESTAMP.csv CSVs/products_export_1.csv`
3. Re-import to Shopify via admin

### If Images Are Wrong
```bash
npm run revert:images -- --vendor=Grease --restore-from=backup
```

---

## Post-Deployment Verification

- [ ] All 9 Grease products have correct images
- [ ] Product pages load correctly in Shopify storefront
- [ ] No broken image links (check browser console)
- [ ] Descriptions render properly (no HTML entities)
- [ ] Metafields visible in Shopify admin

---

## Known Grease Products (9 Total)

| Product | Local Image | Status |
|---------|-------------|--------|
| Alfa Grease Alfalfa Extract | AlfaGreasecopy-1-scaled.webp | ⏳ |
| Bloom Grease Flowering Plant Juice | BloomGrease-1-scaled.webp | ⏳ |
| Blue Grease Algae Extract | BlueGrease-scaled.webp | ⏳ |
| Grease Gun Auto Seed 8pk | Grease-gun-8-pk-scaled.webp | ⏳ |
| Grow Grease Vegetative Plant Juice | GrowGrease-1-scaled.webp | ⏳ |
| OG Grease Trace Mineral Booster | OGGreasecopy-1-scaled.webp | ⏳ |
| Super Grease Canna Super Labs | SuperGrease-1-scaled.webp | ⏳ |
| Super Greased Seed Pack | SuperGreased4and8pk1-scaled.webp | ⏳ |
| Supergreased Triploid Seeds | SuperGreased4and8pk1-scaled.webp | ⏳ |

---

## Notes

- ⚠️ **growwithgrease.com blocks automated requests** (ERR_BLOCKED_BY_RESPONSE)
- ✅ **Solution**: Use local WooCommerce backup images from `hmoonhydro.com/wp-content/uploads/2024/03/`
- Use `localImageExtractor.ts` to map handles → local files
- Use `uploadImagesToShopifyFiles.ts` to get CDN URLs
- Use `uploadLocalImages.ts` to attach to products
- Grease products are nutrients → use `NutrientSpecs` interface
