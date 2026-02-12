# THEME-002: WooCommerce Design System & Theme

**Status**: 📋 PLANNING  
**Priority**: P1 (Active Development)  
**Effort**: Large (60-100 hours)  
**Type**: Theme Selection & Customization  
**Platform**: WordPress/WooCommerce + Beaver Builder

---

## Executive Summary

Select and configure a WooCommerce theme for H-Moon Hydro that:
1. Works seamlessly with Beaver Builder (Builder, Themer, PowerPack)
2. Handles large catalogs (4,700+ products)
3. Matches the Shopify Horizon color scheme
4. Provides professional, modern catalog browsing
5. Optimizes for B2B/wholesale + retail hybrid business

---

## Current State Analysis

### Existing Assets
- **Beaver Builder Pro** — Page builder
- **Beaver Themer** — Theme layout builder
- **Beaver Builder PowerPack** (likely) — Additional modules
- **Envato Elements** — Access to ThemeForest themes
- **Current Theme**: Unknown (needs audit)

### Shopify Horizon Color Scheme (Reference)
```css
/* Primary Colors */
--color-primary: #1B4332;        /* Deep forest green */
--color-primary-light: #2D6A4F;  /* Lighter green */
--color-accent: #52B788;         /* Bright accent green */

/* Neutrals */
--color-background: #FFFFFF;     /* Clean white */
--color-surface: #F8F9FA;        /* Light gray surface */
--color-text: #212529;           /* Dark text */
--color-text-muted: #6C757D;     /* Muted text */

/* Accents */
--color-success: #40916C;        /* Success green */
--color-warning: #F4A261;        /* Warning orange */
--color-error: #E63946;          /* Error red */

/* Borders */
--color-border: #DEE2E6;         /* Light border */
--color-border-dark: #ADB5BD;    /* Darker border */
```

---

## Theme Requirements

### Must-Have Features

#### Catalog & Product Discovery
| Feature | Priority | Notes |
|---------|----------|-------|
| AJAX Product Filtering | 🔴 Must | Filter by brand, category, specs |
| Infinite Scroll / Load More | 🔴 Must | Large catalog navigation |
| Quick View Modal | 🔴 Must | Preview without page load |
| Product Comparison | 🟡 Nice | Compare 2-4 products |
| Recently Viewed | 🔴 Must | Return customer UX |
| Mega Menu | 🔴 Must | Category navigation |
| Product Search (AJAX) | 🔴 Must | Fast type-ahead search |

#### Product Page
| Feature | Priority | Notes |
|---------|----------|-------|
| Gallery with Zoom | 🔴 Must | Large image viewing |
| Video Support | 🔴 Must | Product videos |
| Variant Swatches | 🔴 Must | Color/size selection |
| Tabs (Description, Specs, Reviews) | 🔴 Must | Organized info |
| Related/Upsell Products | 🔴 Must | Cross-selling |
| Stock Indicator | 🔴 Must | In stock / Low stock |
| Bulk Add to Cart | 🟡 Nice | B2B ordering |

#### Cart & Checkout
| Feature | Priority | Notes |
|---------|----------|-------|
| Slide-out Cart | 🔴 Must | Quick cart preview |
| Cart Upsells | 🟡 Nice | "Also bought" |
| Guest Checkout | 🔴 Must | Reduce friction |
| Multi-step Checkout | 🟡 Nice | Cleaner UX |

#### Performance
| Feature | Priority | Notes |
|---------|----------|-------|
| Lazy Loading | 🔴 Must | Image performance |
| CDN Compatible | 🔴 Must | Works with CDN |
| Mobile Optimized | 🔴 Must | 60%+ mobile traffic |
| <3s Load Time | 🔴 Must | Core Web Vitals |

### Beaver Builder Compatibility

**Critical**: Theme must not conflict with Beaver Builder. Options:

1. **BB-Native Themes** (Best compatibility)
   - Beaver Builder Theme (free with BB Pro)
   - GeneratePress + GP Premium
   - Astra Pro
   - Kadence

2. **Envato Themes** (Check compatibility)
   - Must not override BB styles
   - Template files should be BB-editable
   - No forced page builder (Elementor, WPBakery)

---

## Theme Evaluation

### User's Envato Candidates

#### Candidate 1: [Envato Theme 859db536]
**URL**: https://app.envato.com/wordpress/859db536-b186-4bde-b75c-7a9a316da996

**Evaluation**: (Needs manual review)
- [ ] Beaver Builder compatible?
- [ ] WooCommerce support?
- [ ] Mega menu included?
- [ ] AJAX filtering?
- [ ] Mobile responsive?
- [ ] Performance score?

**User Feedback**: "kinda ok, but not enough"

#### Candidate 2: [Envato Theme 0e15c660]
**URL**: https://app.envato.com/wordpress/0e15c660-c066-4cea-bd49-7006b8f9a794

**Evaluation**: (Needs manual review)
- [ ] Beaver Builder compatible?
- [ ] WooCommerce support?
- [ ] Catalog-oriented design?
- [ ] Filter capabilities?

---

### Recommended Themes to Evaluate

#### Option A: GeneratePress + GP Premium ($59/year)
**Why**: Most Beaver Builder compatible, extremely lightweight

**Pros**:
- Built FOR page builders (BB, Elementor)
- Fastest WP theme (< 10KB)
- Excellent WooCommerce support
- Modular — enable only what you need
- Full site editing compatible
- Huge community support

**Cons**:
- Requires GP Premium for WooCommerce features
- Minimal out-of-box WooCommerce styling
- Needs customization work

**WooCommerce Features** (with GP Premium):
- ✅ AJAX add to cart
- ✅ Off-canvas cart
- ✅ Quick view (via addon)
- ✅ Infinite scroll
- ⚠️ Mega menu (needs plugin)
- ✅ Product tabs

#### Option B: Astra Pro ($59/year)
**Why**: Feature-rich WooCommerce support

**Pros**:
- Native mega menu
- WooCommerce module with AJAX filters
- Starter templates
- Good performance
- BB compatible

**Cons**:
- More bloated than GeneratePress
- Some features overlap with BB

#### Option C: Kadence Pro ($149/year)
**Why**: Modern, full-featured

**Pros**:
- Beautiful WooCommerce templates
- Header/footer builder
- Mega menu
- Shop Kit add-on
- Great performance

**Cons**:
- Slightly more expensive
- Newer, smaller community

#### Option D: WooCommerce Flavor Theme (Envato)
**Examples from Envato to consider**:

1. **Porto** — Multi-purpose, huge WooCommerce support
2. **Flavor** — WordPress theme for store that showcase the products
3. **Basel/XStore** — Premium WooCommerce
4. **ShopIsle** — Lightweight WooCommerce
5. **flavor** — Minimalist catalog
6. **flavor** — Multi-vendor compatible

**Search Criteria for Envato**:
```
Keywords: woocommerce catalog wholesale
Filters: 
  - WordPress
  - WooCommerce Compatible
  - Beaver Builder Compatible (check description)
  - NOT: Elementor-based
  - Rating: 4.5+
  - Sales: 1000+
```

---

## Recommended Approach

### 🎯 Primary Recommendation: GeneratePress + GP Premium

**Why GeneratePress wins for H-Moon Hydro**:

1. **Beaver Builder Native** — GP is specifically designed to work with BB
2. **Speed** — Critical for 4,700+ products
3. **Flexibility** — Use BB Themer for all layouts
4. **Stability** — 500k+ installs, actively maintained
5. **Cost** — $59/year vs $149+ for Envato alternatives

### Implementation Strategy

```
Phase 1: Base Setup (Week 1)
├── Install GeneratePress + GP Premium
├── Apply H-Moon color scheme
├── Configure WooCommerce module
└── Set up header/footer with BB Themer

Phase 2: Catalog Pages (Week 2)
├── Design collection/category templates
├── Add AJAX filtering (FacetWP or GP built-in)
├── Configure product grid options
└── Implement mega menu

Phase 3: Product Pages (Week 3)
├── Design product template with BB Themer
├── Add tabs, gallery, variants
├── Configure related products
└── Add bulk quantity selector

Phase 4: Cart & Checkout (Week 4)
├── Style cart page
├── Optimize checkout flow
├── Add cart upsells
└── Mobile optimization

Phase 5: Polish (Week 5)
├── Speed optimization
├── Mobile testing
├── A/B testing key pages
└── Analytics setup
```

---

## Color Scheme Implementation

### CSS Custom Properties

```css
/* H-Moon Hydro Color System */
/* Add to Customizer → Additional CSS */

:root {
  /* Brand Colors (from Horizon) */
  --hmoon-primary: #1B4332;
  --hmoon-primary-light: #2D6A4F;
  --hmoon-accent: #52B788;
  --hmoon-accent-light: #74C69D;
  
  /* Text */
  --hmoon-text: #212529;
  --hmoon-text-muted: #6C757D;
  --hmoon-text-light: #FFFFFF;
  
  /* Backgrounds */
  --hmoon-bg: #FFFFFF;
  --hmoon-bg-alt: #F8F9FA;
  --hmoon-bg-dark: #1B4332;
  
  /* Borders */
  --hmoon-border: #DEE2E6;
  
  /* Status */
  --hmoon-success: #40916C;
  --hmoon-warning: #F4A261;
  --hmoon-error: #E63946;
  
  /* Shadows */
  --hmoon-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --hmoon-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --hmoon-shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

/* Apply to WooCommerce */
.woocommerce .button.alt,
.woocommerce a.button.alt {
  background-color: var(--hmoon-primary);
}

.woocommerce .button.alt:hover {
  background-color: var(--hmoon-primary-light);
}

.woocommerce .woocommerce-message,
.woocommerce .woocommerce-info {
  border-top-color: var(--hmoon-accent);
}

.woocommerce .price {
  color: var(--hmoon-primary);
}
```

---

## Plugin Recommendations

### Required
| Plugin | Purpose | Notes |
|--------|---------|-------|
| FacetWP | AJAX Filtering | Best filtering for WooCommerce |
| WP Rocket | Caching | Or LiteSpeed Cache |
| Smush/Imagify | Image optimization | CDN images |
| WooCommerce Product Table | Catalog view | B2B ordering |

### Recommended
| Plugin | Purpose | Notes |
|--------|---------|-------|
| YITH Quick View | Product quick view | Free version available |
| WooCommerce Waitlist | Back in stock alerts | |
| WPC Smart Compare | Product comparison | |
| Max Mega Menu | Navigation | Or GeneratePress built-in |

---

## Next Steps

1. **Audit Current Theme** — What's installed now?
2. **Review Envato Candidates** — Check BB compatibility
3. **Test GeneratePress** — Install on staging
4. **Color Scheme Setup** — Apply Horizon colors
5. **BB Themer Templates** — Build header, footer, product pages
6. **Performance Baseline** — Measure before/after

---

## Open Questions

1. What Beaver Builder add-ons are currently installed?
2. Is there a staging site for testing?
3. Budget for theme/plugins?
4. Timeline pressure?
5. Any existing customizations to preserve?

---

## Related Specs

- [THEME-001-catalog-upgrade.md](THEME-001-catalog-upgrade.md) — Original Shopify theme spec
- [PRICING-001-competitive-intelligence.md](PRICING-001-competitive-intelligence.md) — Admin pricing display
