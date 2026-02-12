# PRICING-001: Competitive Pricing Research & Display

**Status**: 📋 PLANNING  
**Priority**: P2 (After import stabilization)  
**Effort**: Medium (20-40 hours)  
**Type**: Plugin Enhancement  
**Extends**: `wp-plugins/hmoon-product-enricher/`

---

## Executive Summary

Enhance the H-Moon Product Enricher plugin to include **competitive pricing intelligence** directly in the WooCommerce product editor. Store owners can see what competitors charge, suggested optimal pricing, and cost research data without leaving the WordPress admin.

---

## Problem Statement

### Current Pain Points
- No visibility into competitor pricing when setting prices
- Manual price research is time-consuming (check 5+ sites per product)
- No awareness of market position (are we high, low, or competitive?)
- Pricing decisions based on gut feel vs. data
- No visibility into cost/margin when setting prices

### Target Outcomes
- 10-second competitive price check per product
- Clear market positioning indicator (Below/At/Above Market)
- Historical price tracking for trend analysis
- Cost field with margin calculation

---

## Feature Specification

### 1. Competitor Price Display (MVP)

**Location**: Product Editor Sidebar Metabox (below existing "H-Moon Enrichment")

```
┌─────────────────────────────────────────────┐
│ 💰 Market Pricing Intelligence              │
├─────────────────────────────────────────────┤
│ Your Price: $29.95                          │
│                                             │
│ Competitor Prices:                          │
│ ┌─────────────────────────────────────────┐ │
│ │ HTG Supply      │ $27.95 │ ▼ $2.00 low │ │
│ │ Growershouse    │ $32.99 │ ▲ $3.04     │ │
│ │ Amazon          │ $31.50 │ ▲ $1.55     │ │
│ │ Manufacturer    │ $34.95 │ MSRP        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Market Position: 🟢 COMPETITIVE             │
│ Avg Market Price: $31.85                    │
│ Your Position: 6% below average             │
│                                             │
│ [🔄 Refresh Prices] [📈 Price History]      │
└─────────────────────────────────────────────┘
```

### 2. Cost & Margin Calculator

```
┌─────────────────────────────────────────────┐
│ 📊 Cost & Margin                            │
├─────────────────────────────────────────────┤
│ Product Cost:    $[________] (editable)     │
│ Your Price:      $29.95                     │
│ ─────────────────────────────────────       │
│ Gross Margin:    $12.47 (41.6%)             │
│                                             │
│ If you match avg market ($31.85):           │
│ New Margin:      $14.37 (45.1%)             │
│ Revenue +$1.90/unit                         │
└─────────────────────────────────────────────┘
```

### 3. Price History Chart

```
Price History (90 days)
         HTG    Growers   Amazon   HMoon
Jan 1    $26    $31       $30      $28
Jan 15   $27    $31       $31      $28
Feb 1    $28    $33       $32      $29.95
         ▲ $2   ▲ $2      ▲ $2     ▲ $1.95
         ↑ Competitor prices rising, opportunity to raise
```

---

## Data Sources

### Tier 1: Direct Competitor APIs/Scraping

| Source | Type | Products | Notes |
|--------|------|----------|-------|
| HTG Supply | Scrape | Nutrients, lights | Major competitor |
| Growershouse | Scrape | Full catalog | Major competitor |
| Amazon | API (PA-API) | All | Requires affiliate |
| eBay | API | Used/clearance | Useful for floor pricing |

### Tier 2: Manufacturer MSRP

| Source | Type | Products |
|--------|------|----------|
| Advanced Nutrients | Scrape | AN products |
| General Hydroponics | Scrape | GH products |
| Fox Farm | Scrape | FF products |
| AC Infinity | Scrape | Fans, controllers |

### Tier 3: Price Aggregators

| Source | Type | Notes |
|--------|------|-------|
| Google Shopping | API | Requires merchant account |
| PriceGrabber | - | Limited hydro coverage |

---

## Technical Architecture

### Database Schema

```sql
-- wp_hmoon_competitor_prices
CREATE TABLE wp_hmoon_competitor_prices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,           -- WooCommerce product ID
    sku VARCHAR(100),                     -- For matching
    competitor VARCHAR(50) NOT NULL,       -- 'htg', 'amazon', 'growershouse'
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    url TEXT,                             -- Source URL
    fetched_at DATETIME NOT NULL,
    INDEX idx_product (product_id),
    INDEX idx_sku (sku),
    INDEX idx_competitor_date (competitor, fetched_at)
);

-- wp_hmoon_product_costs
CREATE TABLE wp_hmoon_product_costs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    cost DECIMAL(10,2),
    supplier VARCHAR(100),
    last_updated DATETIME,
    notes TEXT
);

-- wp_hmoon_price_history
CREATE TABLE wp_hmoon_price_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    source VARCHAR(50) NOT NULL,          -- 'hmoon', 'htg', 'amazon', etc.
    price DECIMAL(10,2) NOT NULL,
    recorded_at DATE NOT NULL,
    INDEX idx_product_date (product_id, recorded_at)
);
```

### Scraper Service Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  WP Admin UI    │ ←──→ │  REST API       │ ←──→ │  Price DB       │
│  (Metabox)      │      │  /wp-json/hmoon │      │  (wp_hmoon_*)   │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                         ┌────────▼────────┐
                         │  Background     │
                         │  Price Fetcher  │
                         │  (WP-Cron)      │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  HTG Scraper  │       │ Amazon PA-API │       │ GH Scraper    │
└───────────────┘       └───────────────┘       └───────────────┘
```

### WP-Cron Schedule

```php
// Price refresh schedule
add_action('hmoon_refresh_competitor_prices', 'refresh_all_competitor_prices');

wp_schedule_event(time(), 'daily', 'hmoon_refresh_competitor_prices');

// Priority refresh for recently edited products
add_action('save_post_product', 'queue_competitor_price_refresh');
```

---

## User Interface

### Admin Settings Page

**Location**: WooCommerce → Settings → H-Moon → Pricing Intelligence

```
┌─────────────────────────────────────────────────────────────┐
│ Pricing Intelligence Settings                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Competitor Sources:                                         │
│ ☑ HTG Supply (htgsupply.com)                               │
│ ☑ Growershouse (growershouse.com)                          │
│ ☐ Amazon (requires PA-API credentials)                     │
│ ☑ Manufacturer MSRPs                                       │
│                                                             │
│ Amazon PA-API (optional):                                   │
│ Access Key: [________________________]                      │
│ Secret Key: [________________________]                      │
│ Associate ID: [________________________]                    │
│                                                             │
│ Refresh Schedule:                                           │
│ (•) Daily  ( ) Weekly  ( ) Manual only                     │
│                                                             │
│ Market Position Thresholds:                                 │
│ Below Market: More than [5]% below average                 │
│ Competitive:  Within [5]% of average                       │
│ Above Market: More than [5]% above average                 │
│                                                             │
│ Show in Product Editor: ☑ Yes                              │
│ Show Price History Chart: ☑ Yes                            │
│                                                             │
│ [Save Settings]                                             │
└─────────────────────────────────────────────────────────────┘
```

### Bulk Price Analysis Report

**Location**: WooCommerce → Reports → Pricing Intelligence

| Product | Your Price | Market Avg | Position | Margin | Action |
|---------|------------|------------|----------|--------|--------|
| Big Bud 1L | $29.95 | $31.85 | 🟢 Below | 42% | [Edit] |
| pH Perfect | $45.00 | $39.99 | 🔴 Above | 38% | [Edit] |
| Flora Trio | $52.95 | $52.50 | 🟡 Match | 35% | [Edit] |

**Filters**: Category, Brand, Position (Below/At/Above), Margin Range

---

## Implementation Phases

### Phase 1: MVP (Metabox Display)
- [ ] Create database tables
- [ ] Add cost field to product editor
- [ ] Manual price entry for competitors
- [ ] Basic margin calculator
- [ ] Market position indicator

### Phase 2: Automated Scraping
- [ ] HTG Supply scraper
- [ ] Growershouse scraper
- [ ] Manufacturer MSRP scraper
- [ ] WP-Cron scheduling
- [ ] Price history tracking

### Phase 3: Advanced Features
- [ ] Amazon PA-API integration
- [ ] Bulk pricing report
- [ ] Price change alerts
- [ ] Export to spreadsheet
- [ ] Suggested price recommendations

---

## Legal Considerations

### Scraping Compliance
- Respect robots.txt
- Rate limiting (1 request/2 seconds per domain)
- User-agent identification
- Cache aggressively to minimize requests
- No login/authentication bypass
- Public price data only (no hidden/member pricing)

### Amazon PA-API Terms
- Requires active affiliate account
- Prices must be refreshed within 1 hour of display
- Attribution required if showing to customers

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Price research time | < 10 seconds | Time to see competitor prices |
| Coverage | 80%+ of products | Products with competitor matches |
| Freshness | < 24 hours | Age of pricing data |
| Margin visibility | 100% | Products with cost entered |

---

## Dependencies

- `wp-plugins/hmoon-product-enricher/` — Parent plugin
- WooCommerce 8.0+
- PHP 8.0+ (for async HTTP)
- MySQL 5.7+ (JSON support)

---

## Open Questions

1. **Customer-facing display?** Should we show "Price Match Guarantee" or competitor comparison on frontend?
2. **Cost data source?** Manual entry vs. import from vendor invoices?
3. **Dynamic pricing?** Auto-adjust prices to stay competitive?

---

## Related Specs

- [SCRAPE-001-product-enrichment.md](SCRAPE-001-product-enrichment.md) — Existing scraping infrastructure
- [THEME-002-woocommerce-design.md](THEME-002-woocommerce-design.md) — Frontend display considerations
