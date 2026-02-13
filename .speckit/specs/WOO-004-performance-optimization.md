# SPEC: WOO-004 — WooCommerce Performance Optimization

## Status: 📋 SPECIFICATION COMPLETE

## Overview
Comprehensive performance optimization for the WooCommerce store, addressing **database queries, object caching, image delivery, and frontend performance**. Critical for handling 2,500+ products with good user experience.

---

## Problem Statement

### Current State
- **Slow product archive pages** — 3-5 second load times
- **Database bottlenecks** — unoptimized queries on large catalogs
- **No object caching** — repeated database queries for same data
- **Large page sizes** — unoptimized images, excessive JS/CSS
- **Server strain** — DreamPress limits being approached

### Target State
- **<2 second page loads** — TTFB <500ms, LCP <2s
- **Efficient queries** — indexes, query optimization, batching
- **Object caching** — Redis/Memcached for transients
- **Optimized assets** — WebP images, minified CSS/JS, lazy loading
- **CDN delivery** — static assets served from edge

---

## Performance Audit

### Key Metrics

| Metric | Current | Target | Tool |
|--------|---------|--------|------|
| TTFB (homepage) | ~1.2s | <500ms | WebPageTest |
| LCP (archive) | ~4.5s | <2.5s | Lighthouse |
| Total page size | ~3.5MB | <1.5MB | DevTools |
| Database queries | ~180 | <50 | Query Monitor |
| Server response | ~2.0s | <800ms | TTFB |

### Bottleneck Areas

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE BOTTLENECKS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                               │
│  │   DATABASE      │ ◄── Biggest impact                           │
│  │   - Slow queries on meta tables                                 │
│  │   - Missing indexes                                              │
│  │   - N+1 query patterns                                          │
│  └─────────────────┘                                               │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │   OBJECT CACHE  │ ◄── Quick win                                 │
│  │   - No persistent cache                                          │
│  │   - Transients in database                                       │
│  │   - Repeated expensive queries                                   │
│  └─────────────────┘                                               │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │   IMAGES        │ ◄── Major page weight                         │
│  │   - Unoptimized uploads                                          │
│  │   - No WebP conversion                                           │
│  │   - Missing lazy loading                                         │
│  └─────────────────┘                                               │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │   FRONTEND      │ ◄── Render blocking                           │
│  │   - Render-blocking CSS/JS                                       │
│  │   - No critical CSS                                              │
│  │   - Unused plugin assets                                         │
│  └─────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Optimization

### 1. Add Missing Indexes

```sql
-- Product meta lookups (most common slow query)
CREATE INDEX idx_postmeta_product_lookup 
ON wp_postmeta (meta_key, meta_value(32));

-- SKU lookups
CREATE INDEX idx_postmeta_sku 
ON wp_postmeta (meta_value(50)) 
WHERE meta_key = '_sku';

-- Price range queries
CREATE INDEX idx_postmeta_price 
ON wp_postmeta (meta_key, CAST(meta_value AS DECIMAL(10,2)));

-- Stock status
CREATE INDEX idx_postmeta_stock 
ON wp_postmeta (meta_key, meta_value(20)) 
WHERE meta_key IN ('_stock_status', '_stock');

-- Term relationships for category filters
CREATE INDEX idx_term_taxonomy_count 
ON wp_term_taxonomy (taxonomy, count);
```

### 2. Query Optimization

```php
// Before: N+1 queries for product meta
foreach ($products as $product) {
    $sku = get_post_meta($product->ID, '_sku', true);  // 1 query per product
    $price = get_post_meta($product->ID, '_price', true);
}

// After: Batch meta query
$product_ids = wp_list_pluck($products, 'ID');
update_meta_cache('post', $product_ids);  // 1 query for all

foreach ($products as $product) {
    $sku = get_post_meta($product->ID, '_sku', true);  // From cache
    $price = get_post_meta($product->ID, '_price', true);
}
```

### 3. Transient Caching for Expensive Queries

```php
function get_category_product_counts() {
    $cache_key = 'hmoon_category_counts';
    $counts = get_transient($cache_key);
    
    if ($counts === false) {
        global $wpdb;
        $counts = $wpdb->get_results("
            SELECT t.term_id, t.name, tt.count
            FROM wp_terms t
            JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
            WHERE tt.taxonomy = 'product_cat'
            ORDER BY tt.count DESC
        ", ARRAY_A);
        
        set_transient($cache_key, $counts, HOUR_IN_SECONDS);
    }
    
    return $counts;
}

// Clear on product save
add_action('save_post_product', function() {
    delete_transient('hmoon_category_counts');
});
```

---

## Object Caching

### Redis Configuration (DreamPress)

```php
// wp-config.php
define('WP_REDIS_HOST', '127.0.0.1');
define('WP_REDIS_PORT', 6379);
define('WP_REDIS_DATABASE', 0);
define('WP_REDIS_PREFIX', 'hmoon_');

// Cache groups to persist
define('WP_REDIS_SELECTIVE_FLUSH', true);
define('WP_REDIS_IGNORED_GROUPS', ['counts', 'plugins', 'themes']);
```

### Object Cache Plugin

Recommend: **Redis Object Cache** by Till Krüss

```bash
# Via WP-CLI
wp plugin install redis-cache --activate
wp redis enable
```

### Cached Data Points

| Data | Cache Duration | Clear On |
|------|---------------|----------|
| Product queries | 1 hour | Product save |
| Category counts | 1 hour | Product save |
| Navigation menus | 12 hours | Menu save |
| Widget output | 1 hour | Widget save |
| API responses | 15 minutes | Manual |

---

## Image Optimization

### WebP Conversion

```php
// mu-plugins/hmoon-image-optimization.php

add_filter('wp_generate_attachment_metadata', function($metadata, $attachment_id) {
    $file = get_attached_file($attachment_id);
    $type = wp_check_filetype($file)['ext'];
    
    if (in_array($type, ['jpg', 'jpeg', 'png'])) {
        // Generate WebP version
        $webp_path = preg_replace('/\.(jpg|jpeg|png)$/i', '.webp', $file);
        
        $image = imagecreatefromstring(file_get_contents($file));
        imagewebp($image, $webp_path, 80);
        imagedestroy($image);
        
        // Also convert all sizes
        if (isset($metadata['sizes'])) {
            $upload_dir = wp_upload_dir();
            $base_dir = dirname($file);
            
            foreach ($metadata['sizes'] as $size => $data) {
                $size_file = $base_dir . '/' . $data['file'];
                $size_webp = preg_replace('/\.(jpg|jpeg|png)$/i', '.webp', $size_file);
                
                $img = imagecreatefromstring(file_get_contents($size_file));
                imagewebp($img, $size_webp, 80);
                imagedestroy($img);
            }
        }
    }
    
    return $metadata;
}, 10, 2);

// Serve WebP when supported
add_filter('wp_get_attachment_image_src', function($image, $attachment_id) {
    if ($image && isset($_SERVER['HTTP_ACCEPT']) && 
        strpos($_SERVER['HTTP_ACCEPT'], 'image/webp') !== false) {
        
        $webp_url = preg_replace('/\.(jpg|jpeg|png)$/i', '.webp', $image[0]);
        $webp_path = str_replace(
            wp_upload_dir()['baseurl'],
            wp_upload_dir()['basedir'],
            $webp_url
        );
        
        if (file_exists($webp_path)) {
            $image[0] = $webp_url;
        }
    }
    
    return $image;
}, 10, 2);
```

### Responsive Images

```php
// Customize srcset sizes for products
add_filter('wp_calculate_image_sizes', function($sizes, $size, $image_src, $image_meta) {
    if (is_product() || is_shop() || is_product_category()) {
        // Product grids: smaller images needed
        $sizes = '(max-width: 320px) 150px, (max-width: 768px) 300px, (max-width: 1200px) 400px, 600px';
    }
    return $sizes;
}, 10, 4);
```

### Lazy Loading

```php
// Native lazy loading (already in WordPress 5.5+)
// Ensure it's not disabled
remove_filter('wp_lazy_loading_enabled', '__return_false');

// Add lazy loading to WooCommerce galleries
add_filter('woocommerce_single_product_image_gallery_classes', function($classes) {
    $classes[] = 'loading-lazy';
    return $classes;
});
```

---

## Frontend Optimization

### Critical CSS

```php
// Inline critical CSS for above-the-fold content
add_action('wp_head', function() {
    if (is_shop() || is_product_category()) {
        echo '<style id="critical-css">';
        include get_stylesheet_directory() . '/critical-shop.css';
        echo '</style>';
    }
}, 1);

// Defer non-critical CSS
add_filter('style_loader_tag', function($html, $handle) {
    $defer_handles = ['woocommerce-general', 'dashicons', 'wp-block-library'];
    
    if (in_array($handle, $defer_handles)) {
        $html = str_replace("rel='stylesheet'", 
            "rel='preload' as='style' onload=\"this.rel='stylesheet'\"", 
            $html);
        $html .= "<noscript>{$html}</noscript>";
    }
    
    return $html;
}, 10, 2);
```

### JavaScript Optimization

```php
// Defer non-critical JavaScript
add_filter('script_loader_tag', function($tag, $handle) {
    $defer_handles = ['wc-cart-fragments', 'wc-add-to-cart', 'jquery-migrate'];
    
    if (in_array($handle, $defer_handles) && strpos($tag, 'defer') === false) {
        $tag = str_replace(' src=', ' defer src=', $tag);
    }
    
    return $tag;
}, 10, 2);

// Disable cart fragments on non-cart pages
add_action('wp_enqueue_scripts', function() {
    if (!is_cart() && !is_checkout()) {
        wp_dequeue_script('wc-cart-fragments');
    }
}, 99);
```

### Remove Unused Assets

```php
// Disable WooCommerce assets on non-shop pages
add_action('wp_enqueue_scripts', function() {
    if (!is_woocommerce() && !is_cart() && !is_checkout()) {
        wp_dequeue_style('woocommerce-general');
        wp_dequeue_style('woocommerce-layout');
        wp_dequeue_style('woocommerce-smallscreen');
        wp_dequeue_script('wc-add-to-cart');
        wp_dequeue_script('woocommerce');
    }
}, 99);
```

---

## CDN Configuration

### Recommend: Cloudflare (Free Tier)

```
DNS: Use Cloudflare nameservers
SSL: Full (strict)
Caching: 
  - Cache Everything for /wp-content/uploads/*
  - Bypass cache for /cart, /checkout, /my-account
  - Cache level: Standard
  - Browser TTL: 4 hours
  
Page Rules:
  1. *hmoonhydro.com/wp-admin/*
     - Cache Level: Bypass
  2. *hmoonhydro.com/cart*
     - Cache Level: Bypass
  3. *hmoonhydro.com/wp-content/uploads/*
     - Cache Level: Cache Everything
     - Edge Cache TTL: 1 month
```

### Cache Headers

```php
// Set proper cache headers for static assets
add_filter('mod_rewrite_rules', function($rules) {
    $cache_rules = "
# Cache static assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/webp \"access plus 1 year\"
    ExpiresByType image/jpeg \"access plus 1 year\"
    ExpiresByType image/png \"access plus 1 year\"
    ExpiresByType text/css \"access plus 1 month\"
    ExpiresByType application/javascript \"access plus 1 month\"
</IfModule>
";
    return $cache_rules . $rules;
});
```

---

## Database Maintenance

### Automated Cleanup

```php
// wp-cron job for database maintenance
add_action('hmoon_db_maintenance', function() {
    global $wpdb;
    
    // Clean up expired transients
    $wpdb->query("
        DELETE FROM {$wpdb->options}
        WHERE option_name LIKE '_transient_timeout_%'
        AND option_value < UNIX_TIMESTAMP()
    ");
    
    // Clean orphaned postmeta
    $wpdb->query("
        DELETE pm FROM {$wpdb->postmeta} pm
        LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID
        WHERE p.ID IS NULL
    ");
    
    // Clean up revisions older than 30 days
    $wpdb->query("
        DELETE FROM {$wpdb->posts}
        WHERE post_type = 'revision'
        AND post_date < DATE_SUB(NOW(), INTERVAL 30 DAY)
    ");
    
    // Optimize tables
    $tables = ['posts', 'postmeta', 'options', 'term_relationships'];
    foreach ($tables as $table) {
        $wpdb->query("OPTIMIZE TABLE {$wpdb->prefix}{$table}");
    }
});

// Schedule weekly
if (!wp_next_scheduled('hmoon_db_maintenance')) {
    wp_schedule_event(time(), 'weekly', 'hmoon_db_maintenance');
}
```

---

## Monitoring

### Query Monitor Plugin

Install for development/staging:
```bash
wp plugin install query-monitor --activate
```

Key metrics to watch:
- Queries by caller
- Slow queries (>0.05s)
- Duplicate queries
- HTTP API calls

### Performance Logging

```php
// Log slow page loads
add_action('shutdown', function() {
    $time = timer_stop(0, 3);
    
    if ($time > 3.0 && !is_admin()) {
        error_log(sprintf(
            '[HMOON PERF] Slow page: %s (%.2fs) - Queries: %d',
            $_SERVER['REQUEST_URI'],
            $time,
            get_num_queries()
        ));
    }
});
```

---

## Implementation Priority

| Priority | Optimization | Impact | Effort |
|----------|-------------|--------|--------|
| 1 | Object caching (Redis) | High | Low |
| 2 | Database indexes | High | Low |
| 3 | Image optimization | High | Medium |
| 4 | CDN setup | Medium | Low |
| 5 | Critical CSS | Medium | Medium |
| 6 | JS optimization | Medium | Medium |
| 7 | Database cleanup | Low | Low |

---

## Implementation Files

| File | Purpose |
|------|---------|
| `mu-plugins/hmoon-performance.php` | Main performance optimizations |
| `mu-plugins/hmoon-image-optimization.php` | WebP conversion |
| `mu-plugins/hmoon-db-maintenance.php` | Database cleanup |
| `critical-shop.css` | Critical CSS for shop pages |
| `scripts/perf/add_indexes.sql` | Database index definitions |
| `scripts/perf/audit.php` | Performance audit script |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Homepage TTFB | ✅ <500ms |
| Shop page LCP | ✅ <2.5s |
| Database queries (shop) | ✅ <50 |
| Page size (shop) | ✅ <1.5MB |
| Lighthouse score | ✅ >80 |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Object cache setup | 0.5 day | Redis configured |
| 2. Database optimization | 0.5 day | Indexes added |
| 3. Image optimization | 1 day | WebP + lazy loading |
| 4. Frontend optimization | 1 day | Critical CSS, defer JS |
| 5. CDN configuration | 0.5 day | Cloudflare setup |
| 6. Testing & tuning | 0.5 day | Benchmarks verified |

**Total: ~4 days**

---

## Dependencies

- Redis server (DreamPress includes)
- Redis Object Cache plugin
- Query Monitor (dev)
- Cloudflare account (free)

---

## References

- [WooCommerce Performance Guide](https://woocommerce.com/document/performance-guide/)
- [WordPress Core Performance](https://developer.wordpress.org/plugins/performance/)
- [DreamPress Caching](https://help.dreamhost.com/hc/en-us/articles/215300647-DreamPress-caching)
