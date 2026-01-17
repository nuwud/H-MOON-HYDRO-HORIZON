# SCRAPE-002: Brand Logo Collection

**Status**: 📋 DEFERRED (Post-Import Phase)  
**Priority**: P3 (Enhancement)  
**Effort**: Medium (4-8 hours)  
**Dependencies**: SCRAPE-001 (brand registry)

> **Note**: Brand logos are a nice-to-have enhancement. Focus on product import first.

---

## Objective

Download and upload brand logos for all 200+ brands in the registry to enhance storefront UX with vendor-specific branding on collection pages and product cards.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Brand logo coverage | ≥80% of active vendors |
| Logo format | PNG/SVG with transparency |
| Logo size | 200x200 to 500x500px, <100KB |
| Shopify integration | Uploaded to Files, metafields set |

---

## Technical Approach

### Source Priority

1. **Manufacturer website** — Official logo from brand's site
2. **Competitor site** — Logo from GrowGeneration, HTG, etc.
3. **Google Image Search** — Manual fallback with transparency filter
4. **AI Generation** — Last resort for rare/defunct brands

### Data Flow

```
BRAND_LOGO_SOURCES (config)
    → downloadBrandLogos.ts (fetch & save locally)
    → outputs/brand_logos/*.png
    → uploadBrandLogos.ts (upload to Shopify Files)
    → outputs/logo_manifest.json (CDN URLs)
    → Shopify metafields (vendor.logo_url)
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/cli/downloadBrandLogos.ts` | Download logos from configured sources |
| `src/cli/uploadBrandLogos.ts` | Upload to Shopify Files CDN |
| `outputs/brand_logos/` | Local logo storage |
| `outputs/logo_manifest.json` | Mapping of brand → CDN URL |

---

## CLI Commands

```bash
# Preview download (dry run)
npm run logos:download -- --dry-run

# Download all logos
npm run logos:download -- --confirm

# Download specific brand
npm run logos:download -- --brand="Fox Farm" --confirm

# Upload to Shopify (after download)
npm run logos:upload -- --dry-run
npm run logos:upload -- --confirm
```

---

## Brand Logo Sources Configuration

Located in `downloadBrandLogos.ts`:

```typescript
interface BrandLogoSource {
  brand: string;
  manufacturerUrl?: string;
  logoUrls: string[];  // Priority order
  searchTerms?: string[];  // For manual search
}
```

### Currently Configured (50+ brands)

**Nutrients**: General Hydroponics, Fox Farm, Advanced Nutrients, Botanicare, Canna, Athena, Humboldt, House & Garden, Cyco, Mills, Emerald Harvest, Remo, Nectar, Heavy 16, Floraflex, Grease

**Lighting**: Spider Farmer, Mars Hydro, Gavita, Fluence, Growers Choice, HLG, Lumatek, Hortilux

**Environmental**: AC Infinity, Can-Fan, Phresh, TrolMaster, Autopilot, Inkbird

**Meters**: Bluelab, Apera, Hanna Instruments

**Media/Containers**: Grodan, Mother Earth, Smart Pot, GeoPot, Pro-Mix

**Cloning**: Clonex, EZ Clone, Turboklone

**Pest Control**: Lost Coast, SNS, Flying Skull

---

## Output: logo_manifest.json

```json
{
  "generatedAt": "2026-01-09T...",
  "totalBrands": 250,
  "downloadedCount": 48,
  "missingCount": 5,
  "logos": [
    {
      "brand": "Fox Farm",
      "filename": "fox-farm.svg",
      "source": "https://foxfarm.com/...",
      "downloadedAt": "2026-01-09T...",
      "fileSize": 12345,
      "mimeType": "image/svg+xml"
    }
  ],
  "missing": ["Some Obscure Brand"]
}
```

---

## Shopify Integration

### Option A: Metaobject per Brand
Create a `brand` metaobject with fields:
- `name` (text)
- `logo` (file reference)
- `website` (url)
- `description` (rich text)

### Option B: Product Metafield
Add `vendor.logo_url` metafield to products:
```liquid
{% if product.metafields.vendor.logo_url %}
  <img src="{{ product.metafields.vendor.logo_url }}" alt="{{ product.vendor }} logo">
{% endif %}
```

### Option C: Static Brand Mapping
Use `assets/brand-logos.json` for client-side lookup:
```javascript
const BRAND_LOGOS = {
  "Fox Farm": "https://cdn.shopify.com/.../fox-farm.svg",
  "General Hydroponics": "https://cdn.shopify.com/.../general-hydroponics.png"
};
```

---

## Known Challenges

| Challenge | Mitigation |
|-----------|------------|
| Manufacturer sites block requests | Use browser user-agent, retry with delays |
| SVG logos need special handling | Keep as SVG for Shopify Files |
| Some brands defunct/no logo | Mark as "needs-manual" in manifest |
| Logo quality varies | Prefer SVG, then PNG with transparency |
| Rate limiting | 500ms delay between requests |

---

## Acceptance Criteria

- [ ] `downloadBrandLogos.ts` downloads logos for 50+ configured brands
- [ ] `outputs/brand_logos/` contains normalized filenames
- [ ] `logo_manifest.json` tracks all download attempts
- [ ] Missing logos flagged with search terms for manual download
- [ ] Logos uploaded to Shopify Files CDN
- [ ] Integration method chosen (metaobject, metafield, or static)

---

## Related

- **SCRAPE-001**: Product enrichment (uses brand registry)
- **Brand Registry**: `hmoon-pipeline/src/utils/brandRegistry.ts`
- **Upload Infrastructure**: See SCRAPE-001 "Existing Image Upload Infrastructure"
