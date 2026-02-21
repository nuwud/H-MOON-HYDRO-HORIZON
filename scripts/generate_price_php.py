#!/usr/bin/env python3
"""Generate the PHP price import script from price_fixes.json"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(BASE, 'outputs', 'price_fixes.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

# Build PHP array entries
php_entries = []
for m in data['matched']:
    try:
        p = float(m['price'].strip())
        title = m['title'].replace("'", "\\'")[:50]
        source = m['source'][:20]
        php_entries.append(f"    {m['id']} => array({p:.2f}, '{title}', '{source}'),")
    except:
        pass

php = """<?php
/**
 * H-Moon Hydro Price Fix Script
 * Applies prices to """ + str(len(php_entries)) + """ products missing prices
 * Sources: Feb 12 CSV export, enrichment retailer matches, manual MSRP
 * 
 * DRY RUN: wp eval-file wp-content/apply_prices.php
 * LIVE:    CONFIRM=1 wp eval-file wp-content/apply_prices.php
 */

wp_set_current_user(1);

$confirm = getenv('CONFIRM') === '1';
$dry_run = !$confirm;

if ($dry_run) {
    echo "=== DRY RUN MODE (use CONFIRM=1 to apply) ===\\n";
} else {
    echo "=== LIVE MODE - Applying prices ===\\n";
}

// product_id => array(price, title, source)
$price_fixes = array(
""" + "\n".join(php_entries) + """
);

$updated = 0;
$skipped = 0;
$errors = 0;

foreach ($price_fixes as $product_id => $info) {
    list($price, $title, $source) = $info;
    
    // Verify product exists
    $post = get_post($product_id);
    if (!$post || $post->post_type !== 'product') {
        echo "SKIP: #$product_id not found or not a product\\n";
        $skipped++;
        continue;
    }
    
    // Check if already has a price (don't overwrite existing)
    $current_price = get_post_meta($product_id, '_regular_price', true);
    if (!empty($current_price) && floatval($current_price) > 0) {
        $skipped++;
        continue;
    }
    
    $price_str = number_format($price, 2, '.', '');
    
    if ($dry_run) {
        echo "WOULD SET: #$product_id $title => \\$$price_str [$source]\\n";
        $updated++;
    } else {
        // Set both _regular_price and _price (WooCommerce needs both)
        update_post_meta($product_id, '_regular_price', $price_str);
        update_post_meta($product_id, '_price', $price_str);
        
        // Clear cached product data
        wc_delete_product_transients($product_id);
        
        echo "SET: #$product_id $title => \\$$price_str [$source]\\n";
        $updated++;
    }
}

echo "\\n=== SUMMARY ===\\n";
echo "Updated: $updated\\n";
echo "Skipped (already priced or not found): $skipped\\n";
echo "Errors: $errors\\n";

if ($dry_run) {
    echo "\\nRun with CONFIRM=1 to apply these changes.\\n";
}
"""

out_path = os.path.join(BASE, 'scripts', 'apply_prices.php')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(php)

print(f"Generated {out_path} with {len(php_entries)} price entries")
