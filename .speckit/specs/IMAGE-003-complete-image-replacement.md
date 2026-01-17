# SPEC: IMAGE-003 — Complete Product Image Replacement

## Status: 🚧 IN PROGRESS (Phase 2 Complete)

## Overview
A comprehensive initiative to replace ALL existing product images with high-quality alternatives sourced from manufacturers, distributors, and authoritative retailers. Assumes current images are inadequate and prioritizes quality over speed.

## Phase Progress
| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Audit & Prioritization | ✅ Complete |
| P2 | Multi-source Image Search | ✅ Complete |
| P3 | Review Page Generation | ✅ Complete |
| P4 | Upload to Shopify | 📋 Ready |

### Key Scripts
- `scripts/audit_product_images.js` — Quality scoring
- `scripts/find_replacement_images.js` — Multi-source search
- `scripts/generate_image_review.js` — HTML review page
- `scripts/upload_replacement_images.js` — Shopify uploader

### Current Stats
- **1,108 products** need replacement images
- **303 products** have direct image URLs ready
- **805 products** need manual image sourcing

---

## Problem Statement

### Current State
- **1,193 products** in catalog
- **842 products** have images (70.6%)
- **351 products** missing images (29.4%)
- **Unknown quality** — many images are:
  - Low resolution (< 800px)
  - Wrong aspect ratio
  - Watermarked
  - Incorrect product (wrong variant/color)
  - Placeholder or stock photos
  - Poor lighting/backgrounds

### Target State
- **100% products** with high-quality images
- **Minimum 1200x1200px** resolution
- **Square aspect ratio** (1:1) preferred
- **White/transparent backgrounds** where possible
- **Multiple angles** for complex products
- **No watermarks** or competitor branding

---

## Quality Criteria

### Image Scoring System (0-100)

```typescript
interface ImageQualityScore {
  resolution: number;      // 0-25 pts: 1200+ = 25, 800-1199 = 15, 400-799 = 5, <400 = 0
  aspectRatio: number;     // 0-20 pts: 1:1 = 20, 4:3 or 3:4 = 15, other = 5
  background: number;      // 0-20 pts: white/transparent = 20, solid = 15, busy = 5
  watermark: number;       // 0-15 pts: none = 15, small corner = 5, prominent = 0
  productMatch: number;    // 0-20 pts: exact match = 20, close = 10, wrong = 0
}

// Thresholds
const QUALITY_THRESHOLDS = {
  EXCELLENT: 85,   // Keep as-is
  GOOD: 70,        // Acceptable, but upgrade if better found
  FAIR: 50,        // Should replace
  POOR: 30,        // Must replace
  REJECT: 0        // Immediate replacement needed
};
```

---

## Source Priority Hierarchy

### Tier 1: Manufacturer Sites (Authoritative)
| Source | Brands | Priority | Notes |
|--------|--------|----------|-------|
| generalhydroponics.com | GH, Flora series | 🔴 HIGH | Official product shots |
| acinfinity.com | AC Infinity | 🔴 HIGH | High-res lifestyle + product |
| foxfarm.com | FoxFarm | 🔴 HIGH | Official nutrient images |
| spiderfarmer.com | Spider Farmer | 🔴 HIGH | LED light images |
| marshydro.com | Mars Hydro | 🔴 HIGH | Lighting images |
| gavita.com | Gavita | 🔴 HIGH | Pro lighting |
| botanicare.com | Botanicare | 🟡 MEDIUM | Nutrients |
| cannausa.com | Canna | 🟡 MEDIUM | Nutrients |
| grodan.com | Grodan | 🟡 MEDIUM | Grow media |
| bluelabcorp.com | Bluelab | 🟡 MEDIUM | Meters |

### Tier 2: Official Distributors
| Source | Coverage | Notes |
|--------|----------|-------|
| Hawthorne Gardening | GH, Botanicare, Gavita | Parent company CDN |
| Hydrofarm | Multiple brands | Distributor images |
| Sunlight Supply | Multiple brands | High-res catalog |

### Tier 3: Major Retailers (Verified Quality)
| Source | URL | Products | Notes |
|--------|-----|----------|-------|
| GrowGeneration | growgeneration.com | Full catalog | Largest hydro chain |
| HTG Supply | htgsupply.com | Lighting | Good light specs/images |
| Hydrobuilder | hydrobuilder.com | Nutrients | High-res product shots |

### Tier 4: Existing WooCommerce CDN
| Source | Path | Products |
|--------|------|----------|
| Shopify CDN | cdn.shopify.com/s/files/1/0672/5730/3114/ | Current images |
| WooCommerce Backup | hmoonhydro.com/wp-content/uploads/ | Original images |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                 IMAGE REPLACEMENT PIPELINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Audit      │───▶│   Search     │───▶│   Compare    │         │
│  │   Current    │    │   Sources    │    │   Quality    │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Score      │    │   Download   │    │   Select     │         │
│  │   Images     │    │   Candidates │    │   Best       │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                                       │                  │
│         ▼                                       ▼                  │
│  ┌──────────────────────────────────────────────────────┐         │
│  │              image_replacement_state.json            │         │
│  │  - current: { url, score, dimensions }               │         │
│  │  - candidates: [{ source, url, score }]              │         │
│  │  - selected: { url, score, reason }                  │         │
│  │  - status: pending | searching | ready | uploaded    │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Management

### State File: `outputs/image_replacement_state.json`

```json
{
  "version": "1.0",
  "createdAt": "2026-01-09T...",
  "lastUpdated": "2026-01-09T...",
  "config": {
    "minQualityScore": 70,
    "preferredResolution": 1200,
    "preferSquare": true
  },
  "stats": {
    "totalProducts": 1193,
    "audited": 0,
    "needsReplacement": 0,
    "candidatesFound": 0,
    "replaced": 0,
    "skipped": 0
  },
  "products": {
    "product-handle": {
      "shopifyId": "gid://shopify/Product/123",
      "title": "Product Title",
      "vendor": "Brand",
      "current": {
        "url": "https://cdn.shopify.com/...",
        "score": 45,
        "resolution": "600x400",
        "issues": ["low-resolution", "wrong-aspect"]
      },
      "candidates": [
        {
          "source": "manufacturer",
          "url": "https://acinfinity.com/...",
          "score": 92,
          "resolution": "1500x1500"
        }
      ],
      "selected": null,
      "status": "pending"
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Audit Current Images
**Effort**: 4 hours  
**Script**: `scripts/audit_product_images.js`

1. Pull all products from Shopify
2. Download and analyze each image
3. Score using quality criteria
4. Generate `image_audit_report.json`

```bash
node scripts/audit_product_images.js
```

**Output**:
- Products with score < 70: needs replacement
- Products with score < 50: urgent replacement
- Products with no image: immediate priority

### Phase 2: Source Candidate Images
**Effort**: 8-12 hours  
**Script**: `scripts/find_replacement_images.js`

1. For each product needing replacement:
   - Search manufacturer site by product name
   - Search major retailers by SKU/title
   - Download top 3 candidates per product
2. Score each candidate
3. Select best match

```bash
node scripts/find_replacement_images.js --limit=50
node scripts/find_replacement_images.js --vendor="AC Infinity"
node scripts/find_replacement_images.js --resume
```

### Phase 3: Review & Approve
**Effort**: 2-4 hours  
**Script**: `scripts/review_image_candidates.js`

Generate HTML review page for manual approval:
```bash
node scripts/review_image_candidates.js --output=outputs/image_review.html
```

### Phase 4: Upload Replacements
**Effort**: 4-6 hours  
**Script**: `scripts/upload_replacement_images.js`

1. Delete existing product images
2. Upload new images via Shopify GraphQL
3. Update alt text with SEO template
4. Mark as completed in state

```bash
node scripts/upload_replacement_images.js --dry-run
node scripts/upload_replacement_images.js --confirm
```

---

## CLI Commands

```bash
# Full pipeline
npm run images:audit          # Phase 1: Audit current
npm run images:search         # Phase 2: Find candidates
npm run images:review         # Phase 3: Generate review page
npm run images:upload         # Phase 4: Upload replacements

# Targeted operations
npm run images:audit -- --vendor="AC Infinity"
npm run images:search -- --min-score=50 --limit=100
npm run images:upload -- --handle=cloudline-t6

# Reports
npm run images:report         # Summary of current state
npm run images:gaps           # Products still needing images
```

---

## Existing Infrastructure to Leverage

### Scripts Already Built
| Script | Purpose | Reuse |
|--------|---------|-------|
| `scripts/image_scraper.js` | Multi-source scraping | ✅ Core engine |
| `scripts/upload_images.js` | Shopify upload with staged API | ✅ Upload logic |
| `scripts/generate_alt_text.js` | SEO alt text | ✅ Alt text template |
| `outputs/image_scrape_state.json` | Scrape progress | 📋 State pattern |

### APIs & Config
| Resource | Location |
|----------|----------|
| Shopify GraphQL | `hmoon-pipeline/.env` |
| Brand Registry | `hmoon-pipeline/src/utils/brandRegistry.ts` |
| Scraping Types | `hmoon-pipeline/src/scraping/types.ts` |
| Product Sources | `hmoon-pipeline/src/config/competitorStores.ts` |

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Products with images | 100% (1193/1193) |
| Average quality score | ≥ 80 |
| Images ≥ 1200px | ≥ 90% |
| Square aspect ratio | ≥ 80% |
| Products with multiple images | ≥ 30% |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rate limiting | Exponential backoff, 500ms delays |
| Manufacturer blocks | Rotate user agents, use retailer fallback |
| Wrong product match | Manual review phase before upload |
| Shopify API limits | Batch uploads, throttle to 2/sec |
| Data loss | Never delete before upload confirmed |

---

## Dependencies

- **IMPORT-001**: Products must be imported first ✅
- **IMAGE-002**: Initial scraping infrastructure ✅
- **Shopify API**: Admin access for media mutations

---

## Related Specs

- [IMAGE-001](IMAGE-001-product-image-seo.md) — Alt text optimization
- [IMAGE-002](IMAGE-002-product-image-scraping.md) — Initial scraping
- [SCRAPE-001](SCRAPE-001-product-enrichment.md) — Product enrichment

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-09 | Initial spec created |
