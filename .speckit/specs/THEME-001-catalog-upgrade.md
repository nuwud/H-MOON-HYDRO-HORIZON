# THEME-001: Multi-Product Catalog Theme Upgrade

**Status**: 📋 DEFERRED (Post-Import Phase)  
**Priority**: P2 (After import complete)  
**Effort**: Large (40-80 hours)  
**Type**: Theme Enhancement / Migration

> **Note**: This spec is deferred until after the Shopify product import is complete. Focus on CSV import and image upload first.

---

## Executive Summary

Upgrade H-Moon Hydro's Shopify theme from the current **Horizon** theme to a more **multi-product, catalog-oriented** experience similar to the Enterprise theme ($400), without paying for it. Two paths are evaluated:

1. **Path A**: Enhance Horizon theme with missing Enterprise features
2. **Path B**: Switch to a free/cheaper theme better suited for large catalogs

**Recommendation**: Path A (Enhance Horizon) — Lower risk, maintains existing customizations, Horizon already has strong foundations.

---

## Problem Statement

### Current Pain Points
- **2,800+ products** need efficient browsing (Horizon optimized for smaller catalogs)
- Missing bulk/B2B features for wholesale customers
- Product cards lack quick-add and variant preview
- Collection pages need better filtering for technical specs (watts, NPK ratios, etc.)
- No stock counter or low-stock indicators
- Limited cross-selling on product pages

### Target User Needs
| User Type | Need | Current Gap |
|-----------|------|-------------|
| Retail Customer | Quick variant selection | ✅ Has color swatches |
| Wholesale Customer | Bulk ordering, quick add | ❌ No quantity input on cards |
| Returning Customer | Recently viewed, reorder | ⚠️ Limited |
| Mobile User | Fast navigation | ✅ Good mobile experience |

---

## Enterprise Theme Feature Analysis

### Features Enterprise Has ($400)

#### Cart & Checkout
| Feature | Enterprise | Horizon | Gap |
|---------|------------|---------|-----|
| Quick Buy | ✅ | ⚠️ Partial (settings.quick_add) | Minor |
| Sticky Cart | ✅ | ❌ | **Add** |
| Slide-out Cart | ✅ | ✅ | None |
| Pre-order | ✅ | ❌ | **Add** |
| In-store Pickup | ✅ | ✅ | None |

#### Marketing & Conversion
| Feature | Enterprise | Horizon | Gap |
|---------|------------|---------|-----|
| Quick View Modal | ✅ | ❌ | **Add** |
| Back-in-stock Alert | ✅ | ❌ | **Add** |
| Stock Counter | ✅ | ❌ | **Add** |
| Countdown Timer | ✅ | ❌ | Nice-to-have |
| Product Badges | ✅ | ⚠️ Custom only | **Add** |
| Promo Banners | ✅ | ✅ | None |
| Recently Viewed | ✅ | ❌ | **Add** |
| Cross-selling | ✅ | ✅ (recommendations) | None |
| Trust Badges | ✅ | ⚠️ Custom only | Minor |

#### Merchandising
| Feature | Enterprise | Horizon | Gap |
|---------|------------|---------|-----|
| Product Tabs | ✅ | ❌ | **Add** |
| Size Chart | ✅ | ❌ | Nice-to-have |
| Product Videos | ✅ | ✅ | None |
| Color Swatches | ✅ | ✅ | None |
| Image Zoom | ✅ | ✅ | None |
| Image Rollover | ✅ | ❌ | **Add** |

#### Product Discovery
| Feature | Enterprise | Horizon | Gap |
|---------|------------|---------|-----|
| Mega Menu | ✅ | ✅ | None |
| Infinite Scroll | ✅ | ✅ | None |
| Breadcrumbs | ✅ | ⚠️ Limited | Minor |
| Enhanced Search | ✅ | ✅ (predictive) | None |
| Swatch Filters | ✅ | ✅ | None |
| Sticky Header | ✅ | ✅ | None |

---

## Path A: Enhance Horizon Theme

### Advantages
- ✅ Maintains all existing customizations
- ✅ No migration work needed
- ✅ Horizon is a Shopify first-party theme (guaranteed updates)
- ✅ Already familiar with codebase
- ✅ Good foundations (3.0.1, modern Liquid)

### High-Priority Additions (MVP)

#### 1. Quick View Modal
**Effort**: 8-12 hours  
**Files**: New `snippets/quick-view-modal.liquid`, modify `product-card.liquid`

```liquid
{%- comment -%} Quick View trigger on product card {%- endcomment -%}
<button 
  class="quick-view-trigger"
  data-product-url="{{ product.url }}?view=quick"
  aria-label="Quick view {{ product.title }}"
>
  {% render 'icon', name: 'eye' %}
</button>
```

#### 2. Stock Counter / Low Stock Badge
**Effort**: 4-6 hours  
**Files**: `snippets/product-card.liquid`, `snippets/stock-indicator.liquid`

```liquid
{%- if product.available -%}
  {%- if product.variants.first.inventory_quantity <= 5 and product.variants.first.inventory_quantity > 0 -%}
    <span class="badge badge--low-stock">Only {{ product.variants.first.inventory_quantity }} left</span>
  {%- endif -%}
{%- else -%}
  <span class="badge badge--sold-out">Sold Out</span>
{%- endif -%}
```

#### 3. Recently Viewed Products
**Effort**: 6-8 hours  
**Files**: New `sections/recently-viewed.liquid`, `assets/recently-viewed.js`

Uses localStorage to track viewed products, renders a section on product and collection pages.

#### 4. Product Badges (Sale, New, Low Stock)
**Effort**: 4 hours  
**Files**: `snippets/product-badges.liquid`, `snippets/product-card.liquid`

```liquid
{%- assign badges = '' | split: '' -%}
{%- if product.compare_at_price > product.price -%}
  {%- assign sale_percent = product.compare_at_price | minus: product.price | times: 100.0 | divided_by: product.compare_at_price | round -%}
  {%- assign badges = badges | push: 'sale' -%}
{%- endif -%}
{%- if product.created_at > 'now' | date: '%s' | minus: 2592000 -%}
  {%- assign badges = badges | push: 'new' -%}
{%- endif -%}
```

#### 5. Sticky Add-to-Cart Bar
**Effort**: 6-8 hours  
**Files**: `snippets/sticky-add-to-cart.liquid`, `assets/sticky-cart.js`

Fixed bar at bottom on scroll past main ATC button.

#### 6. Image Rollover (Secondary Image)
**Effort**: 3-4 hours  
**Files**: `snippets/product-card.liquid`, `assets/product-card.css`

```liquid
{%- if product.media.size > 1 -%}
  <img 
    class="product-card__secondary-image"
    src="{{ product.media[1] | image_url: width: 400 }}"
    loading="lazy"
  />
{%- endif -%}
```

#### 7. Product Tabs (Description, Specs, Reviews)
**Effort**: 6-8 hours  
**Files**: `sections/product-information.liquid`, `blocks/_product-tabs.liquid`

Replace single description with tabbed interface.

### Medium-Priority Additions

| Feature | Effort | Priority |
|---------|--------|----------|
| Back-in-stock notification form | 4-6h | P2 |
| Bulk add quantity input on cards | 6-8h | P2 |
| Countdown timer for sales | 4h | P3 |
| Pre-order functionality | 8h | P3 |

### Estimated Total Effort: Path A
| Phase | Features | Hours |
|-------|----------|-------|
| MVP | Quick View, Stock Counter, Badges, Rollover | 20-26h |
| Phase 2 | Recently Viewed, Sticky Cart, Product Tabs | 18-24h |
| Phase 3 | Back-in-stock, Bulk Qty, Pre-order | 18-22h |
| **Total** | | **56-72h** |

---

## Path B: Switch to Different Theme

### Free Theme Candidates

#### 1. Dawn (Shopify Official)
- **Pros**: Free, Shopify-maintained, clean code
- **Cons**: Very minimal, needs heavy customization
- **Verdict**: More work than enhancing Horizon

#### 2. Refresh (Free)
- **Pros**: Free, catalog-focused
- **Cons**: Less polished than Horizon
- **Verdict**: Lateral move

#### 3. Trade (Free)
- **Pros**: B2B focused, quick order list
- **Cons**: Industrial look
- **Verdict**: Consider for wholesale-heavy stores

### Paid Theme Alternatives (< $400)

| Theme | Price | Best For | Key Features |
|-------|-------|----------|--------------|
| Warehouse | $320 | Large catalogs | Quick view, mega menu |
| Impulse | $350 | High conversion | Quick shop, upsells |
| Prestige | $350 | Premium products | Lookbooks, storytelling |
| Motion | $360 | Visual products | Animations, video |

### Path B Risks
- ❌ Lose all existing theme customizations
- ❌ Migration testing needed
- ❌ Staff retraining on new admin
- ❌ Potential SEO disruption
- ❌ Time spent learning new codebase

---

## Recommendation

### Chosen Path: **Path A - Enhance Horizon**

**Rationale**:
1. Horizon already has 70% of Enterprise features (mega menu, infinite scroll, swatches, predictive search)
2. Adding missing 30% is faster than full theme migration
3. Horizon is Shopify first-party = guaranteed long-term support
4. Existing customizations preserved
5. Cost: $0 (vs $400 Enterprise or $320+ alternatives)

### Implementation Phases

#### Phase 1: MVP Enhancements (Week 1-2)
- [ ] Quick View modal
- [ ] Stock counter badges
- [ ] Product badges (Sale, New)
- [ ] Image rollover

#### Phase 2: Conversion Features (Week 3-4)
- [ ] Recently viewed products section
- [ ] Sticky add-to-cart bar
- [ ] Product tabs

#### Phase 3: B2B Features (Week 5-6)
- [ ] Back-in-stock notification
- [ ] Bulk quantity input on collection page
- [ ] Customer-specific pricing display

---

## Technical Implementation

### New Files to Create
```
snippets/
  quick-view-modal.liquid
  stock-indicator.liquid
  product-badges.liquid
  sticky-add-to-cart.liquid
  recently-viewed.liquid

sections/
  recently-viewed.liquid
  product-tabs.liquid

assets/
  quick-view.js
  recently-viewed.js
  sticky-cart.js
  product-badges.css
```

### Files to Modify
```
snippets/product-card.liquid      # Add badges, rollover, quick view trigger
sections/product-information.liquid # Add tabs
config/settings_schema.json       # Add new settings
locales/en.default.json          # Add translations
```

### Settings to Add
```json
{
  "name": "Product Cards",
  "settings": [
    { "id": "show_stock_counter", "type": "checkbox", "default": true },
    { "id": "stock_threshold", "type": "range", "min": 1, "max": 20, "default": 5 },
    { "id": "show_sale_badge", "type": "checkbox", "default": true },
    { "id": "show_new_badge", "type": "checkbox", "default": true },
    { "id": "new_badge_days", "type": "range", "min": 7, "max": 90, "default": 30 },
    { "id": "enable_quick_view", "type": "checkbox", "default": true },
    { "id": "enable_image_rollover", "type": "checkbox", "default": true }
  ]
}
```

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Add-to-cart rate | ? | +15% | Shopify Analytics |
| Bounce rate on collections | ? | -10% | GA4 |
| Time on collection page | ? | +20% | GA4 |
| Mobile conversion | ? | +10% | Shopify Analytics |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing functionality | Medium | High | Feature flags, staging testing |
| Performance degradation | Low | High | Lazy load, code review |
| Shopify theme update conflicts | Low | Medium | Document all customizations |
| Scope creep | High | Medium | Strict MVP definition |

---

## Related Specs

- SCRAPE-001: Product enrichment (better data = better cards)
- SCRAPE-002: Brand logos (use on product cards)

---

## Appendix: Enterprise Demo Reference

**Enterprise Demo Store**: https://enterprise-theme.myshopify.com/

Key pages to study:
- Collection page with filters
- Product page with tabs
- Cart drawer
- Mega menu

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-09 | Spec created | Evaluate Path A vs B |
| | Pending: Team review | |
