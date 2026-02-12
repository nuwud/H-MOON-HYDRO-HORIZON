# LAUNCH-001: H-Moon Hydro WooCommerce Launch Checklist

**Status**: 🔴 URGENT - Production Launch  
**Priority**: P0 (Critical Path)  
**Target**: Functional online store ASAP  
**Constraint**: Minimal paid plugins, time-sensitive

---

## Executive Summary

Get hmoonhydro.com accepting orders with:
- ✅ Products imported (DONE - 4,600+ products)
- 🔄 Payment processing (ACH + backup)
- 🔄 Shipping configuration
- 🔄 Basic theme/UX
- 🔄 Legal pages
- 🔄 Testing

---

## 🚨 CRITICAL PATH CHECKLIST

### Phase 1: Payment Processing (BLOCKING)
*Cannot sell without this*

| Task | Status | Time | Notes |
|------|--------|------|-------|
| ACH Plugin installed | ⬜ | 30min | `woo-ach-batch` repo |
| ACH bank account configured | ⬜ | 1hr | Bank API credentials |
| Test ACH transaction | ⬜ | 30min | $1 test purchase |
| Backup payment method | ⬜ | 2hr | See options below |

**ACH Plugin Location**: https://github.com/nuwud/woo-ach-batch

**Backup Payment Options** (hydroponics-friendly):
| Option | Restrictions | Fees | Notes |
|--------|--------------|------|-------|
| Square (manual) | Some | 2.9% + 30¢ | May work if not flagged |
| Authorize.net | None | $25/mo + 2.9% | Traditional merchant |
| NMI | None | Varies | High-risk friendly |
| Crypto (BitPay) | None | 1% | Niche customers |
| COD/Invoice | None | Free | B2B customers |

### Phase 2: Shipping Configuration (BLOCKING)
*Cannot complete checkout without this*

| Task | Status | Time | Notes |
|------|--------|------|-------|
| Shipping zones created | ⬜ | 30min | US zones |
| Shipping classes assigned | ✅ | DONE | Light, Domestic, Freight |
| Flat rate configured | ⬜ | 30min | Simple start |
| Free shipping threshold | ⬜ | 10min | $99+ free? |
| Local pickup option | ⬜ | 10min | Store address |

**Recommended Shipping Setup (MVP)**:
```
Zone: United States
├── Light Items (<1 lb): $5.99 flat
├── Domestic (1-10 lb): $9.99 flat  
├── Medium Freight (10-50 lb): $19.99 flat
├── Heavy Freight (50-150 lb): $49.99 flat
├── LTL Freight (>150 lb): Request Quote
└── Free Shipping: Orders $99+
```

### Phase 3: Essential Pages (BLOCKING)
*Legal requirements*

| Page | Status | Time | Notes |
|------|--------|------|-------|
| Privacy Policy | ⬜ | 30min | Use generator + customize |
| Terms of Service | ⬜ | 30min | Include hydroponics disclaimer |
| Refund Policy | ⬜ | 20min | Standard 30-day |
| Shipping Policy | ⬜ | 20min | Processing times, carriers |
| Contact Page | ⬜ | 15min | Form + phone + address |
| About Us | ⬜ | 30min | Store story |

**Free Policy Generators**:
- Termly.io (privacy, terms)
- Shopify free policy generator (works for any store)
- FreePrivacyPolicy.com

### Phase 4: Basic Theme/UX (IMPORTANT)
*Can launch with minimal, improve later*

| Task | Status | Time | Notes |
|------|--------|------|-------|
| Logo uploaded | ⬜ | 10min | Header logo |
| Color scheme applied | ⬜ | 1hr | Horizon colors |
| Header configured | ⬜ | 2hr | Logo, nav, cart, search |
| Footer configured | ⬜ | 1hr | Links, contact, social |
| Homepage basic | ⬜ | 2hr | Categories, featured |
| Product page functional | ⬜ | 1hr | Images, price, add to cart |
| Cart page working | ⬜ | 30min | Standard WooCommerce |
| Checkout page working | ⬜ | 30min | ACH option visible |

### Phase 5: Testing (CRITICAL)
*Do not skip*

| Test | Status | Notes |
|------|--------|-------|
| Add to cart | ⬜ | Simple + variable product |
| View cart | ⬜ | Quantities, remove |
| Apply coupon | ⬜ | If using coupons |
| Enter shipping | ⬜ | Address validation |
| Complete ACH payment | ⬜ | Test mode first |
| Order confirmation email | ⬜ | Customer + admin |
| Mobile checkout | ⬜ | Responsive test |
| Search works | ⬜ | Find products |
| Categories work | ⬜ | Navigation |

---

## 🆓 FREE Plugin Alternatives

### WooCommerce Core (Free)
Already includes:
- Product management
- Cart/checkout
- Basic shipping
- Tax calculation
- Order management
- Customer accounts
- Basic reports

### Essential Free Plugins

| Need | Free Plugin | Paid Alternative | Notes |
|------|-------------|------------------|-------|
| **SEO** | Yoast SEO Free | Yoast Premium | Core features free |
| **Caching** | LiteSpeed Cache | WP Rocket | If on LiteSpeed server |
| **Caching** | W3 Total Cache | WP Rocket | Alternative |
| **Security** | Wordfence Free | Wordfence Premium | Core security free |
| **Backup** | UpdraftPlus Free | UpdraftPlus Premium | Manual backups |
| **Images** | Smush Free | Smush Pro | 50 images/bulk |
| **Images** | ShortPixel Free | ShortPixel | 100 images/mo |
| **SMTP** | WP Mail SMTP | - | Use free tier |
| **Forms** | WPForms Lite | WPForms Pro | Contact forms |
| **Analytics** | Site Kit by Google | - | GA4 integration |

### WooCommerce-Specific Free Plugins

| Need | Free Plugin | Notes |
|------|-------------|-------|
| **Quick View** | YITH Quick View | Free version solid |
| **Wishlist** | YITH Wishlist | Free version works |
| **Compare** | YITH Compare | Free version works |
| **Product Search** | Relevanssi Free | Better search |
| **Product Tabs** | WooCommerce Tab Manager | Custom tabs |
| **Stock Alerts** | Back In Stock Notifier | Email when available |
| **Variation Swatches** | Variation Swatches for WooCommerce | Color/image swatches |

### Beaver Builder Ecosystem (Free)

| Plugin | Purpose |
|--------|---------|
| Starter Templates | Pre-built BB layouts |
| BB Components | Free modules |
| BB Header Footer | Header/footer builder |

---

## ⏱️ Launch Timeline (Aggressive)

### Day 1: Core Functionality
| Hour | Task | Owner |
|------|------|-------|
| 0-2 | ACH plugin install + configure | Dev |
| 2-3 | Shipping zones setup | Dev |
| 3-4 | Legal pages (generate + upload) | Owner |
| 4-6 | Basic theme config (BB Theme) | Dev |
| 6-8 | Testing all flows | Both |

### Day 2: Polish + Launch
| Hour | Task | Owner |
|------|------|-------|
| 0-2 | Fix any Day 1 issues | Dev |
| 2-4 | Homepage design (basic) | Dev |
| 4-5 | Final testing | Both |
| 5-6 | DNS/SSL verification | Dev |
| 6+ | **SOFT LAUNCH** | 🚀 |

### Week 1 Post-Launch
- Monitor orders
- Fix any checkout issues
- Improve product images
- Add more categories
- Customer feedback

---

## 🎨 MVP Theme Configuration

### Using BB Theme + BB Themer (Free with BB Pro)

**Header Template**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]     [Search Bar]          [Account] [Cart ($0.00)] │
├─────────────────────────────────────────────────────────────┤
│ Nutrients | Grow Media | Lighting | Environmental | More ▼  │
└─────────────────────────────────────────────────────────────┘
```

**Footer Template**:
```
┌─────────────────────────────────────────────────────────────┐
│ Shop          Support        Connect         Newsletter    │
│ ──────────    ──────────     ──────────      ───────────── │
│ Nutrients     Contact Us     Facebook        [Email      ] │
│ Lighting      Shipping       Instagram       [Subscribe  ] │
│ Grow Media    Returns        YouTube                       │
│ All Products  FAQ                                          │
├─────────────────────────────────────────────────────────────┤
│ © 2026 H-Moon Hydro | Privacy | Terms | Powered by WC     │
└─────────────────────────────────────────────────────────────┘
```

**Homepage Sections** (BB modules):
1. Hero banner (featured products/sale)
2. Category grid (6-8 main categories with images)
3. Featured products row
4. Why shop with us (trust badges)
5. Newsletter signup

---

## Dependencies

### Already Complete
- ✅ Products imported (4,600+)
- ✅ Shipping classes assigned
- ✅ SKUs and prices set
- ✅ Descriptions added
- ✅ H-Moon plugins installed

### Needs Verification
- [ ] SSL certificate active (https)
- [ ] Domain DNS correct
- [ ] Email sending works
- [ ] DreamHost PHP version (8.0+)

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| ACH fails | Cannot sell | Have Square as backup |
| Theme breaks | Bad UX | Use default Storefront |
| Slow site | Lost sales | Enable caching Day 1 |
| Orders not emailed | Confusion | Test SMTP immediately |
| Search broken | Can't find products | Install Relevanssi |

---

## Post-Launch Improvements (Week 2+)

1. **Better filtering** — FacetWP or similar
2. **Product images** — Run enricher on missing
3. **Theme polish** — Better category pages
4. **Speed optimization** — CDN, image optimization
5. **Marketing** — Email capture, social

---

## Related Specs

- [THEME-002-woocommerce-design.md](THEME-002-woocommerce-design.md) — Full theme spec
- [PRICING-001-competitive-intelligence.md](PRICING-001-competitive-intelligence.md) — Pricing research
- [ACH_SECURITY_SPEC.md](ACH_SECURITY_SPEC.md) — ACH plugin security
