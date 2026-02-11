# WordPress Plugin Deactivation Checklist

## H-Moon Hydro - Plugin Audit & Safe Removal Guide

> **⚠️ BACKUP FIRST**: Always create a full backup before deactivating plugins.
> Run `UpdraftPlus → Backup Now` or download via hosting control panel.

---

## Phase 1: Immediate Removals (Low Risk)

These can be removed with minimal testing:

### ❌ REMOVE: Duplicate/Conflicting Plugins

| Plugin | Action | Reason |
|--------|--------|--------|
| Multiple SEO plugins | Keep ONE only | Conflicts, duplicate meta tags |
| Multiple caching plugins | Keep ONE only | Cache conflicts |
| Multiple security plugins | Keep ONE only | Performance, false positives |
| "Hello Dolly" | Delete | Default WP plugin, no function |

### ❌ REMOVE: Inactive/Unused

| Plugin | Check | Action |
|--------|-------|--------|
| Plugins showing "inactive" > 6 months | Are they needed? | Delete |
| Demo/sample plugins | Check for dependencies | Delete |
| Abandoned plugins (no updates 2+ years) | Security risk | Find alternative |

---

## Phase 2: Premium Plugin Replacements (Medium Risk)

Replace expensive plugins with free alternatives:

### 💰 UPS Shipping Plugin (~$100/yr)

**Before:**
1. Note current settings in WooCommerce → Settings → Shipping
2. Export any custom shipping rules

**Replacement:**
- Install `hmoon-ups-shipping` plugin (from `wp-plugins/` folder)
- See README.md for UPS API setup

**After:**
1. Test checkout with various addresses
2. Compare rates to old plugin
3. Only then deactivate old UPS plugin

**Safe to remove after 2 weeks of testing**

---

### 💰 AIOSEO Pro → Free Alternatives

**Before:**
1. Export SEO settings: AIOSEO → Tools → Export
2. Document: Title templates, meta descriptions, sitemap settings

**Replacement Options (pick ONE):**

| Alternative | Pros | Cons |
|-------------|------|------|
| **Yoast SEO (Free)** | Most popular, great UX | Nags for premium |
| **RankMath (Free)** | Feature-rich free tier | Complex UI |
| **SEOPress (Free)** | Clean, no ads | Smaller community |

**Migration Steps:**
1. Install replacement (don't activate yet)
2. Deactivate AIOSEO
3. Activate replacement
4. Import settings if migration tool available
5. Check: Homepage title, product titles, sitemap

**Wait 1 week, check Google Search Console for issues**

---

### 💰 Security Plugin Premium → Free Tier

**If running premium tier of Wordfence/Sucuri/iThemes:**

Most sites only need free tier. Premium adds:
- Real-time firewall rules (free gets them ~30 days later)
- Priority support
- Advanced scanning

**Decision criteria:**
- High-traffic store (>$10k/mo)? → Keep premium
- Regular target of attacks? → Keep premium
- Small store, low traffic? → Free tier sufficient

---

## Phase 3: Consolidation (Higher Risk)

### 🔄 Multiple Image Optimization Plugins

**Keep ONE of:**
- ShortPixel
- Imagify
- Smush
- EWWW

**Before removing:**
1. Check `wp-content/uploads/` for backup originals
2. Note compression settings

---

### 🔄 Multiple Form Plugins

**Common duplicates:**
- Contact Form 7 + WPForms
- Gravity Forms + Ninja Forms

**Check:**
1. Which forms are actually embedded on pages?
2. Are old form entries needed?

**Export entries before removing old plugin**

---

### 🔄 Page Builder Overlap

**You have BeaverBuilder - remove:**
- Elementor (if installed but unused)
- Visual Composer / WPBakery (if unused)
- Gutenberg block plugins that duplicate BB features

---

## Phase 4: WooCommerce Cleanup

### Essential WooCommerce Plugins (KEEP)

| Plugin | Why |
|--------|-----|
| WooCommerce | Core |
| WooCommerce Payments | Payment processing |
| Action Scheduler | Required by WC |

### Likely Removable WooCommerce Plugins

| Plugin | When to Remove |
|--------|----------------|
| WC demo importer | After initial setup |
| WC beta tester | Not needed in production |
| Payment gateways you don't use | Immediately |
| Shipping methods you don't use | Immediately |

---

## Safe Deactivation Order

**Important**: Deactivate in this order to avoid dependency issues.

```
1. Analytics/tracking plugins (low dependency)
2. Marketing plugins (popups, etc.)
3. Social media plugins
4. Image optimization plugins (duplicates)
5. Form plugins (duplicates)
6. SEO plugins (after migration)
7. Security plugins (duplicates - keep one active!)
8. Caching plugins (duplicates)
9. Shipping plugins (after replacement tested)
10. Payment plugins (unused gateways only)
```

---

## Pre-Removal Checklist

For EACH plugin you deactivate:

```
□ Backup created today
□ Plugin settings exported (if available)
□ Checked for dependent plugins
□ Checked for shortcodes used on pages
□ Tested on staging if available
□ Scheduled during low-traffic time
□ Have restore plan ready
□ Keep plugin files for 2 weeks after deactivation
```

---

## Post-Removal Testing

After each plugin removal:

```
□ Homepage loads correctly
□ Product pages work
□ Cart/checkout functional
□ Payment test order successful
□ Admin dashboard accessible
□ No PHP errors in debug.log
□ Site speed improved (GTmetrix/PageSpeed)
□ Forms still submit
□ Emails still send
```

---

## Emergency Rollback

If something breaks:

### Option 1: WP Admin Access Works
1. Go to Plugins
2. Find the recently deactivated plugin
3. Click "Activate"

### Option 2: WP Admin Broken
```bash
# Via FTP or File Manager
# Rename the problem plugin's folder to disable it:
wp-content/plugins/problem-plugin → wp-content/plugins/problem-plugin.bak

# Or rename wp-content/plugins folder to disable ALL plugins:
wp-content/plugins → wp-content/plugins.bak
# Then rename back and reactivate one by one
```

### Option 3: Database Fix
```sql
-- Via phpMyAdmin if needed
-- This deactivates ALL plugins:
UPDATE wp_options SET option_value = 'a:0:{}' WHERE option_name = 'active_plugins';
```

---

## Plugin Audit Timeline

| Week | Action |
|------|--------|
| 1 | Remove obvious duplicates, unused plugins |
| 2 | Install UPS replacement, test |
| 3 | Migrate SEO plugin |
| 4 | Remove paid UPS plugin |
| 5 | Consolidate security, caching |
| 6 | Final cleanup, performance check |

---

## Tracking Removed Plugins

Document what you remove:

| Date | Plugin | Reason | Replacement | Issues? |
|------|--------|--------|-------------|---------|
| | | | | |
| | | | | |

---

## Annual Cost Savings Tracker

| Plugin Removed | Annual Cost | Replacement | New Cost |
|----------------|------------|-------------|----------|
| UPS Shipping | $100 | hmoon-ups-shipping | $0 |
| SEO Premium | $50-200 | Free tier | $0 |
| Security Premium | $0-100 | Free tier | $0 |
| **Total Savings** | | | **$150-400** |
