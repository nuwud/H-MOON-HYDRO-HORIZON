# H-Moon Custom WordPress Plugins

Custom-built plugins to replace expensive premium alternatives. Save **$150-400/year** in plugin costs.

## Plugins Included

| Plugin | Replaces | Annual Savings |
|--------|----------|----------------|
| [hmoon-ups-shipping](#ups-shipping) | WooCommerce UPS Shipping ($100/yr) | $100 |
| [hmoon-analytics](#analytics) | MonsterInsights/GA plugins ($50-200/yr) | $50+ |
| [hmoon-security-hardening](#security) | Premium security plugins ($0-100/yr) | $0-100 |
| [hmoon-wc-optimizer](#wc-optimizer) | Multiple optimization plugins | Performance |

---

## Installation

### Standard Plugins (wp-content/plugins/)

```bash
# Copy these folders to wp-content/plugins/ on your WordPress site:
hmoon-ups-shipping/
hmoon-analytics/
hmoon-wc-optimizer/
```

Then activate in WordPress Admin → Plugins.

### MU-Plugin (Auto-loads, Can't Be Deactivated)

```bash
# Copy to wp-content/mu-plugins/ (create folder if doesn't exist):
hmoon-security-hardening.php
```

MU-plugins load automatically before regular plugins.

---

## Plugin Details

### UPS Shipping

**Location:** `hmoon-ups-shipping/`

**Replaces:** WooCommerce UPS Shipping, WooCommerce Shipping UPS, etc.

**Features:**
- Live UPS rates at checkout
- All major services (Ground, 2-Day, Next Day)
- Modern OAuth 2.0 REST API
- Rate caching
- Handling fees
- HPOS compatible

**Setup:**
1. Get free API credentials at [developer.ups.com](https://developer.ups.com)
2. Go to WooCommerce → Settings → Shipping → UPS (H-Moon)
3. Enter Client ID, Secret, and Account Number

See [hmoon-ups-shipping/README.md](hmoon-ups-shipping/README.md) for detailed setup.

---

### Analytics

**Location:** `hmoon-analytics/`

**Replaces:** MonsterInsights, GA Google Analytics, PixelYourSite, etc.

**Features:**
- Google Analytics 4
- Google Tag Manager
- Facebook Pixel
- WooCommerce purchase tracking
- View product events
- Admin users excluded

**Setup:**
1. Activate plugin
2. Go to Settings → H-Moon Analytics
3. Enter your tracking IDs

**Recommended:** Use GTM OR GA4 directly, not both simultaneously.

---

### Security Hardening

**Location:** `hmoon-security-hardening.php` (single file)

**Install to:** `wp-content/mu-plugins/`

**Replaces:** Basic features of Wordfence, Sucuri, iThemes Security

**Features:**
- WordPress version hidden
- XML-RPC disabled
- Login attempt limiting (5 attempts, 15min lockout)
- Security headers (X-Frame-Options, CSP, etc.)
- Author archive blocking (username enumeration)
- REST API user enumeration blocked
- Suspicious query string blocking
- Admin security notices

**What it DOESN'T replace:**
- Malware scanning (keep Wordfence free for this)
- Firewall rules
- Two-factor authentication
- Real-time threat intelligence

**Recommended stack:** This MU-plugin + Wordfence Free

---

### WC Optimizer

**Location:** `hmoon-wc-optimizer/`

**Replaces:** WooCommerce optimization snippets, performance plugins

**Features:**
- Removes WC scripts from non-WC pages
- Disables WC marketing hub bloat
- Optimizes cart fragments AJAX
- Reduces database queries
- Cleans action scheduler retention
- Admin panel optimizations

**No configuration needed** - works automatically.

---

## Deployment Checklist

### Before Installing

```
□ Create full site backup
□ Test on staging first if available
□ Document current plugin settings
□ Schedule during low-traffic time
```

### After Installing

```
□ Test checkout flow
□ Verify shipping rates display
□ Check analytics tracking (use GA real-time)
□ Confirm security features active (Tools → Security Status)
□ Run PageSpeed test - should improve
```

### Removing Old Plugins

Wait **2 weeks** after confirming new plugins work before removing old ones:

1. Deactivate old plugin (don't delete yet)
2. Monitor for 1 week
3. If no issues, delete old plugin
4. Cancel subscription/license

---

## Support & Customization

These plugins are purpose-built for H-Moon Hydro. To customize:

- **UPS services:** Edit `enabled_services` in shipping settings
- **Security rules:** Modify `hmoon-security-hardening.php` directly
- **Analytics events:** Extend `HMoon_Analytics` class

---

## Changelog

### 2026-02-11
- Initial release of all plugins
- UPS REST API integration
- GA4 + Facebook Pixel tracking
- Security hardening MU-plugin
- WooCommerce performance optimizer
