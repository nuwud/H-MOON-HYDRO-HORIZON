# SEO-001: Product SEO & Structured Data

**Status**: ✅ COMPLETE  
**Priority**: P1 (High Impact)  
**Effort**: Medium (20-40 hours)  
**Dependencies**: SCRAPE-001 (enriched product data)

---

## Completion Summary (2025-01-09)

### Delivered
| Deliverable | Target | Actual | Status |
|-------------|--------|--------|--------|
| SEO Title | 100% | 1193/1193 (100%) | ✅ |
| SEO Description | 100% | 1193/1193 (100%) | ✅ |
| Meta content in CSV | Yes | Yes | ✅ |
| JSON-LD Product Schema | Yes | `snippets/json-ld-product.liquid` | ✅ |
| JSON-LD Organization | Yes | `snippets/json-ld-organization.liquid` | ✅ |
| JSON-LD Breadcrumb | Yes | `snippets/json-ld-breadcrumb.liquid` | ✅ |
| Image Alt Text | 100% | 758 images generated | ✅ |

### Theme Integration
JSON-LD is rendered in `layout/theme.liquid`:
- Line 24: `{% render 'json-ld-organization' %}`
- Line 26: `{% render 'json-ld-product', product: product %}`
- Line 27: `{% render 'json-ld-breadcrumb', product: product %}`

### Product Schema Features
- ✅ Product name, description, URL
- ✅ SKU and GTIN/barcode
- ✅ Brand with vendor fallback
- ✅ Multiple images (up to 5)
- ✅ Price with currency
- ✅ Availability (InStock/OutOfStock)
- ✅ Seller organization
- ✅ Aggregate rating (when reviews available)

---

## Executive Summary

Implement comprehensive SEO infrastructure for 2,800+ products to improve organic search visibility. Leverages enriched product data from SCRAPE-001 to auto-generate meta content, structured data, and collection descriptions.

**Target Outcome**: 30-50% increase in organic traffic within 6 months.

---

## Problem Statement

### Current SEO Gaps
| Issue | Impact | Products Affected |
|-------|--------|-------------------|
| Missing meta descriptions | Low CTR in search results | ~2,000 |
| Generic page titles | Poor keyword targeting | ~1,500 |
| No JSON-LD structured data | Missing rich snippets | All |
| Duplicate content from filters | Diluted rankings | Collections |
| Missing image alt text | Lost image search traffic | ~70% of images |
| Thin collection descriptions | Collections don't rank | 22 categories |

### Organic Traffic Opportunity
Hydroponics is a **$16B market** with strong search intent:

| Keyword | Monthly Volume | Difficulty | Intent |
|---------|----------------|------------|--------|
| "grow lights" | 33,100 | Medium | Product |
| "hydroponic nutrients" | 4,400 | Low | Product |
| "inline fan" | 8,100 | Low | Product |
| "grow tent" | 22,200 | Medium | Product |
| "ph meter for plants" | 3,600 | Low | Product |
| "fox farm nutrients" | 2,400 | Low | Brand |
| "spider farmer sf4000" | 1,900 | Low | Model |

---

## Technical Approach

### Data Flow
```
Enriched Product (SCRAPE-001)
    → Meta Generator (CLI tool)
    → Shopify Metafields (seo.title, seo.description)
    → Theme Liquid (renders meta tags)
    → JSON-LD Generator (structured data)
    → Google Index
```

---

## Component 1: Meta Title Templates

### Formula
```
[Brand] [Product Name] [Key Spec] | H-Moon Hydro
```

### Category-Specific Templates

| Category | Template | Example |
|----------|----------|---------|
| **Lights** | `{brand} {name} {watts}W LED Grow Light` | "Spider Farmer SF4000 450W LED Grow Light" |
| **Nutrients** | `{brand} {name} {size} - {stage} Nutrient` | "Fox Farm Big Bloom 1 Gal - Bloom Nutrient" |
| **Fans** | `{brand} {name} {cfm}CFM {diameter}" Inline Fan` | "AC Infinity Cloudline T6 402CFM 6" Inline Fan" |
| **Tents** | `{brand} {name} {dimensions} Grow Tent` | "Gorilla Grow Tent 4x4x7 Grow Tent" |
| **Meters** | `{brand} {name} {type} Meter` | "Bluelab pH Pen Digital pH Meter" |
| **Media** | `{brand} {name} {size} {type}` | "Mother Earth Coco 50L Coco Coir" |

### Character Limits
- **Title**: 50-60 characters (Google truncates at ~60)
- **Description**: 150-160 characters

### Implementation
```typescript
// hmoon-pipeline/src/seo/metaTitleGenerator.ts

interface MetaTitleConfig {
  category: string;
  template: string;
  fallback: string;
}

const TITLE_TEMPLATES: MetaTitleConfig[] = [
  {
    category: 'lights',
    template: '{brand} {name} {watts}W LED Grow Light | H-Moon Hydro',
    fallback: '{brand} {name} Grow Light | H-Moon Hydro',
  },
  {
    category: 'nutrients',
    template: '{brand} {name} {size} {stage} Nutrient | H-Moon Hydro',
    fallback: '{brand} {name} Plant Nutrient | H-Moon Hydro',
  },
  // ... more categories
];

function generateMetaTitle(product: Product): string {
  const config = TITLE_TEMPLATES.find(t => t.category === product.productType);
  let title = config?.template || '{brand} {name} | H-Moon Hydro';
  
  // Replace tokens
  title = title
    .replace('{brand}', product.vendor || '')
    .replace('{name}', product.title)
    .replace('{watts}', product.metafields?.specs?.watts || '')
    .replace('{size}', product.variants[0]?.title || '')
    .replace('{stage}', product.metafields?.specs?.growthStage || '');
  
  // Truncate to 60 chars
  return title.slice(0, 60);
}
```

---

## Component 2: Meta Description Templates

### Formula
```
[Value Prop] [Key Specs]. [Social Proof]. Shop at H-Moon Hydro - [CTA].
```

### Category-Specific Templates

| Category | Template |
|----------|----------|
| **Lights** | `Shop the {brand} {name} - {watts}W, {ppf} PPF, {coverage} coverage. {rating}★ rated. Free shipping on orders $99+.` |
| **Nutrients** | `{brand} {name} {npk} for {stage} growth. {organic}. Trusted by growers. Fast shipping from H-Moon Hydro.` |
| **Fans** | `{brand} {name} - {cfm} CFM, {noise} noise level. Perfect for {roomSize}. Shop ventilation at H-Moon Hydro.` |

### Dynamic Elements
```typescript
interface DescriptionTokens {
  brand: string;
  name: string;
  watts?: string;
  ppf?: string;
  coverage?: string;
  npk?: string;
  stage?: string;
  organic?: string;  // "OMRI Listed" or ""
  cfm?: string;
  noise?: string;
  roomSize?: string;
  rating?: string;   // From reviews if available
  price?: string;
}
```

---

## Component 3: JSON-LD Structured Data

### Product Schema
```liquid
{%- comment -%} snippets/json-ld-product.liquid {%- endcomment -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": {{ product.title | json }},
  "description": {{ product.description | strip_html | truncate: 5000 | json }},
  "image": [
    {%- for image in product.images limit: 5 -%}
      {{ image | image_url: width: 1200 | json }}{% unless forloop.last %},{% endunless %}
    {%- endfor -%}
  ],
  "brand": {
    "@type": "Brand",
    "name": {{ product.vendor | json }}
  },
  "sku": {{ product.selected_or_first_available_variant.sku | json }},
  "mpn": {{ product.selected_or_first_available_variant.barcode | json }},
  "offers": {
    "@type": "Offer",
    "url": {{ canonical_url | json }},
    "priceCurrency": {{ cart.currency.iso_code | json }},
    "price": {{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }},
    "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}",
    "seller": {
      "@type": "Organization",
      "name": "H-Moon Hydro"
    }
  }
  {%- if product.metafields.reviews.rating -%}
  ,"aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": {{ product.metafields.reviews.rating.value | json }},
    "reviewCount": {{ product.metafields.reviews.count.value | json }}
  }
  {%- endif -%}
}
</script>
```

### BreadcrumbList Schema
```liquid
{%- comment -%} snippets/json-ld-breadcrumb.liquid {%- endcomment -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": {{ shop.url | json }}
    }
    {%- if collection -%}
    ,{
      "@type": "ListItem",
      "position": 2,
      "name": {{ collection.title | json }},
      "item": {{ collection.url | prepend: shop.url | json }}
    }
    {%- endif -%}
    {%- if product -%}
    ,{
      "@type": "ListItem",
      "position": 3,
      "name": {{ product.title | json }},
      "item": {{ product.url | prepend: shop.url | json }}
    }
    {%- endif -%}
  ]
}
</script>
```

### Organization Schema (Site-wide)
```liquid
{%- comment -%} In theme.liquid or layout {%- endcomment -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "H-Moon Hydro",
  "url": {{ shop.url | json }},
  "logo": {{ settings.logo | image_url: width: 600 | prepend: 'https:' | json }},
  "sameAs": [
    "https://facebook.com/hmoonhydro",
    "https://instagram.com/hmoonhydro"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-XXX-XXX-XXXX",
    "contactType": "customer service"
  }
}
</script>
```

---

## Component 4: Image Alt Text Generator

### Formula
```
[Brand] [Product Name] - [Descriptor] | H-Moon Hydro
```

### Category-Specific Alt Text

| Category | Pattern | Example |
|----------|---------|---------|
| Lights | `{brand} {model} LED grow light front view` | "Spider Farmer SF4000 LED grow light front view" |
| Nutrients | `{brand} {name} {size} bottle` | "Fox Farm Big Bloom 1 gallon bottle" |
| Fans | `{brand} {model} inline fan` | "AC Infinity Cloudline T6 inline fan" |

### Implementation
```typescript
// hmoon-pipeline/src/seo/altTextGenerator.ts

function generateAltText(product: Product, imageIndex: number): string {
  const descriptors = ['product image', 'front view', 'side view', 'detail', 'in use'];
  const descriptor = descriptors[imageIndex] || 'product image';
  
  return `${product.vendor} ${product.title} - ${descriptor}`.slice(0, 125);
}
```

---

## Component 5: Collection Descriptions

### Template Structure
```markdown
# {Collection Title}

{Intro paragraph - 50-100 words about the category}

## Why Choose H-Moon Hydro for {Category}?
- {Benefit 1}
- {Benefit 2}
- {Benefit 3}

## Top Brands
{brand_list}

## Buying Guide
{2-3 paragraphs of helpful content}
```

### Example: Grow Lights Collection
```html
<div class="collection-description">
  <h2>LED Grow Lights for Indoor Gardens</h2>
  <p>
    Shop premium LED grow lights from top brands like Spider Farmer, Mars Hydro, 
    and Gavita. Our selection includes full-spectrum LEDs for all growth stages, 
    from seedling to harvest. Find the perfect light for your 2x2 to 5x5 grow space.
  </p>
  
  <h3>Why Shop Grow Lights at H-Moon Hydro?</h3>
  <ul>
    <li>Free shipping on orders over $99</li>
    <li>Expert support from real growers</li>
    <li>Price match guarantee</li>
  </ul>
  
  <h3>Popular Brands</h3>
  <p>Spider Farmer • Mars Hydro • Gavita • HLG • Fluence • Growers Choice</p>
</div>
```

---

## Component 6: Canonical URLs & Pagination

### Filter Parameter Handling
```liquid
{%- comment -%} Prevent duplicate content from filter URLs {%- endcomment -%}
{%- assign canonical = canonical_url | split: '?' | first -%}
<link rel="canonical" href="{{ canonical }}" />
```

### Pagination SEO
```liquid
{%- if paginate.previous -%}
  <link rel="prev" href="{{ paginate.previous.url }}" />
{%- endif -%}
{%- if paginate.next -%}
  <link rel="next" href="{{ paginate.next.url }}" />
{%- endif -%}
```

---

## Component 7: Sitemap Enhancement

### Product Sitemap Priority
```xml
<url>
  <loc>https://h-moon-hydro.myshopify.com/products/spider-farmer-sf4000</loc>
  <lastmod>2026-01-09</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
  <image:image>
    <image:loc>https://cdn.shopify.com/.../spider-farmer.jpg</image:loc>
    <image:title>Spider Farmer SF4000 LED Grow Light</image:title>
  </image:image>
</url>
```

### Sitemap Index Script
```typescript
// Generate supplementary sitemap for images
// Shopify auto-generates product sitemap, but we can enhance
```

---

## CLI Tools

### 1. Meta Generator
```bash
# Generate meta titles/descriptions for all products
npm run seo:generate-meta -- --dry-run

# Apply to Shopify via metafields
npm run seo:generate-meta -- --confirm

# Single category
npm run seo:generate-meta -- --category=lights --confirm
```

### 2. Alt Text Generator
```bash
# Generate alt text for products missing it
npm run seo:generate-alt -- --dry-run
npm run seo:generate-alt -- --confirm
```

### 3. SEO Audit
```bash
# Audit current SEO status
npm run seo:audit

# Output: outputs/seo_audit.json
```

### Audit Output
```json
{
  "summary": {
    "totalProducts": 2824,
    "withMetaTitle": 824,
    "withMetaDescription": 312,
    "withAltText": 1200,
    "withStructuredData": 0
  },
  "missing": {
    "metaTitle": ["handle-1", "handle-2"],
    "metaDescription": ["handle-3", "handle-4"],
    "altText": ["handle-5"]
  },
  "issues": {
    "titleTooLong": ["handle-6"],
    "descriptionTooShort": ["handle-7"],
    "duplicateTitle": [["handle-8", "handle-9"]]
  }
}
```

---

## Implementation Files

### New Files
```
hmoon-pipeline/src/seo/
  metaTitleGenerator.ts
  metaDescriptionGenerator.ts
  altTextGenerator.ts
  seoAudit.ts
  jsonLdGenerator.ts

snippets/
  json-ld-product.liquid
  json-ld-breadcrumb.liquid
  json-ld-organization.liquid
  seo-meta.liquid

outputs/
  seo_audit.json
  seo_meta_updates.csv
```

### Files to Modify
```
layout/theme.liquid          # Add JSON-LD includes
sections/main-product.liquid # Add product JSON-LD
config/settings_schema.json  # Add SEO settings
```

---

## npm Scripts

```json
{
  "seo:audit": "tsx src/seo/seoAudit.ts",
  "seo:generate-meta": "tsx src/seo/generateMeta.ts",
  "seo:generate-alt": "tsx src/seo/generateAltText.ts",
  "seo:apply": "tsx src/seo/applyMetaToShopify.ts"
}
```

---

## Acceptance Criteria

### Phase 1: Meta Content
- [ ] Meta title template per category (8 categories)
- [ ] Meta description template per category
- [ ] CLI tool generates meta for all products
- [ ] Dry-run mode shows preview
- [ ] Metafields update via GraphQL

### Phase 2: Structured Data
- [ ] JSON-LD Product schema on all product pages
- [ ] JSON-LD BreadcrumbList on product/collection pages
- [ ] JSON-LD Organization site-wide
- [ ] Validate with Google Rich Results Test

### Phase 3: Content & Alt Text
- [ ] Alt text generator for images
- [ ] Collection descriptions for 22 categories
- [ ] Canonical URL handling for filters

### Phase 4: Monitoring
- [ ] SEO audit CLI tool
- [ ] Weekly audit cron job
- [ ] Google Search Console integration docs

---

## Success Metrics

| Metric | Baseline | 3-Month Target | 6-Month Target |
|--------|----------|----------------|----------------|
| Indexed pages | ? | +20% | +40% |
| Organic traffic | ? | +15% | +35% |
| Avg position | ? | Improve 5 spots | Improve 10 spots |
| Rich snippet CTR | 0% | 10% of products | 50% of products |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-optimization penalty | Low | Follow Google guidelines, natural language |
| Duplicate titles | Medium | Audit tool catches duplicates |
| Schema validation errors | Medium | Test with Google tool before deploy |
| Bulk update rate limits | Medium | Use batch processing, respect API limits |

---

## Related Specs

- **SCRAPE-001**: Provides enriched product data (specs, descriptions)
- **THEME-001**: Theme must render meta tags and JSON-LD
- **CAT-001** (future): Collection structure affects breadcrumbs

---

## References

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Schema.org Product](https://schema.org/Product)
- [Shopify SEO Best Practices](https://help.shopify.com/en/manual/promoting-marketing/seo)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
