# Competitor & Source Sites Index

This document tracks all scraping sources for product enrichment.

## Quick Reference

### Priority Sites (Tier 1 - Manufacturers)

| Site | Domain | Products | Config |
|------|--------|----------|--------|
| **Grease** 🔴 | growwithgrease.com | Grease nutrients | `GREASE_TARGET` |
| General Hydroponics | generalhydroponics.com | Flora, pH control | `GENERAL_HYDROPONICS_TARGET` |
| AC Infinity | acinfinity.com | Fans, tents, controllers | `AC_INFINITY_TARGET` |
| Spider Farmer | spiderfarmer.com | LED lights | `SPIDER_FARMER_TARGET` |
| Mars Hydro | mars-hydro.com | LED lights, tents | `MARS_HYDRO_TARGET` |
| Fox Farm | foxfarm.com | Nutrients, soil | TODO |
| Gavita | gavita.com | Pro lighting | TODO |

### Major Retailers (Tier 2)

| Site | Domain | Strengths | Config |
|------|--------|-----------|--------|
| GrowGeneration | growgeneration.com | Full catalog, good specs | `GROW_GENERATION_TARGET` |
| Hydrobuilder | hydrobuilder.com | Pricing, variants | `HYDROBUILDER_TARGET` |
| HTG Supply | htgsupply.com | Lighting details | `HTG_SUPPLY_TARGET` |
| GH Hydro | ghhydro.com | Descriptions | `GH_HYDRO_TARGET` |

### Secondary Retailers (Tier 3)

| Site | Domain | Notes |
|------|--------|-------|
| Shop Urban Greenhouse | shopurbangreenhouse.myshopify.com | Shopify store |
| Shop Hydrocity | shophydrocity.com | Regional |
| Sunwest Hydro | sunwesthydro.com | Regional |
| All Seasons Hydro | allseasonshydro.com | Full catalog |
| Grow Ace | growace.com | Budget options |
| Grow Lights CA | growlights.ca | Canadian |
| Humboldts Secret | humboldtssecretsupplies.com | Specialty nutrients |
| Hey Abby | heyabby.com | Grow systems |
| Seed World USA | seedworldusa.com | Seeds |
| Farmers Defense | farmersdefense.com | Protective gear |
| Used Hydro Shop | usedhydroshop.com | Reference pricing |

---

## Discovery Sources

### Store Directories
- **ShopifySpy**: https://shopifyspy.com/stores/niches/hydroponic
- **BuiltWith**: Search for hydroponics stores
- **Similar Web**: Find competitors by traffic

### Google Search Queries
```
"hydroponics supplies" site:myshopify.com
"grow lights" + "add to cart"
"hydroponic nutrients" + "buy now"
```

---

## Platform Detection

### Shopify Indicators
- URL: `*.myshopify.com` or custom domain with Shopify
- Source: `cdn.shopify.com` in assets
- JavaScript: `Shopify.` global object
- Meta: `<meta name="shopify-checkout-api-token"`

### WooCommerce Indicators
- URL: `/product/` or `/shop/`
- CSS: `woocommerce-` prefixed classes
- Body: `class="woocommerce"`

### Magento Indicators
- URL: `/catalog/product/`
- Cookies: `MAGE-*`
- JavaScript: `Mage.`

---

## Selector Patterns by Platform

### Shopify (Dawn-based themes)
```javascript
{
  title: 'h1.product__title',
  price: '.price-item--regular',
  images: '.product__media img',
  description: '.product__description',
  sku: '[data-product-sku]',
}
```

### WooCommerce
```javascript
{
  title: 'h1.product_title',
  price: '.price .woocommerce-Price-amount',
  images: '.woocommerce-product-gallery__image img',
  description: '.woocommerce-product-details__short-description',
  sku: '.sku',
}
```

---

## Rate Limiting Guidelines

| Platform | Safe Rate | Notes |
|----------|-----------|-------|
| Shopify | 2 req/sec | Standard Shopify rate limits |
| WooCommerce | 1 req/sec | Varies by hosting |
| Custom | 0.5 req/sec | Conservative for unknown |

### Retry Strategy
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};
```

---

## Data Quality by Source

| Source | Images | Descriptions | Specs | Pricing |
|--------|--------|--------------|-------|---------|
| Manufacturer | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ (MSRP) |
| GrowGeneration | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Hydrobuilder | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Tier 3 | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

---

## Adding New Sources

1. **Identify platform** (Shopify, WooCommerce, custom)
2. **Test selectors** using browser DevTools
3. **Add to `scrapingTargets.ts`**
4. **Test with single product**
5. **Document in this file**

### Template for New Source
```typescript
export const NEW_SITE_TARGET: ScrapingTarget = {
  domain: 'example.com',
  baseUrl: 'https://www.example.com',
  tier: 2,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-title',
    price: '.product-price',
    description: '.product-description',
    images: '.product-images img',
  },
  categories: ['nutrients'],
  notes: 'What this source is good for',
};
```

---

## Related Files

- [Scraping Schema](scraping-schema.md) — TypeScript interfaces
- [Scraping Targets](../hmoon-pipeline/src/config/scrapingTargets.ts) — Configuration
- [Example Scraper](../hmoon-pipeline/src/scraping/exampleScraper.ts) — Generic implementation
- [SCRAPE-001 Spec](../.speckit/specs/SCRAPE-001-product-enrichment.md) — Full specification
