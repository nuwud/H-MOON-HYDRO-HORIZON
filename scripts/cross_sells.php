<?php
/**
 * cross_sells.php — Auto-generate cross-sells and up-sells
 * 
 * Strategy:
 * - Cross-sells: Same brand, same category (complementary)
 * - Up-sells: Same brand, same category, higher price (upgrade path)
 */
wp_set_current_user(1);
global $wpdb;
$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN ===\n\n" : "=== LIVE ===\n\n";

// Get all published products with their brand + category + price
$products = get_posts(array('post_type'=>'product','post_status'=>'publish','posts_per_page'=>-1));
echo "Total products: " . count($products) . "\n";

// Build index: brand -> category -> [products]
$index = array();
$product_data = array();

foreach ($products as $p) {
    $brands = wp_get_object_terms($p->ID, 'pwb-brand', array('fields'=>'names'));
    $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : '';
    
    $cats = wp_get_object_terms($p->ID, 'product_cat', array('fields'=>'names'));
    $cat = (!is_wp_error($cats) && !empty($cats)) ? $cats[0] : '';
    
    $price = floatval(get_post_meta($p->ID, '_regular_price', true));
    
    $product_data[$p->ID] = array(
        'title' => $p->post_title,
        'brand' => $brand,
        'cat' => $cat,
        'price' => $price,
    );
    
    if ($brand && $cat) {
        $key = $brand . '||' . $cat;
        if (!isset($index[$key])) $index[$key] = array();
        $index[$key][] = $p->ID;
    }
}

// Groups with 2+ products can get cross-sells
$eligible_groups = array_filter($index, function($ids) { return count($ids) >= 2; });
echo "Brand+Category groups with 2+ products: " . count($eligible_groups) . "\n";

$cs_set = 0;
$us_set = 0;

foreach ($eligible_groups as $key => $ids) {
    if (count($ids) > 20) continue; // Skip huge groups
    
    foreach ($ids as $pid) {
        $existing_cs = get_post_meta($pid, '_crosssell_ids', true);
        $existing_us = get_post_meta($pid, '_upsell_ids', true);
        
        // Skip if already has cross-sells
        if (!empty($existing_cs)) continue;
        
        $my_price = $product_data[$pid]['price'];
        $cross_sells = array();
        $up_sells = array();
        
        foreach ($ids as $other_id) {
            if ($other_id === $pid) continue;
            $other_price = $product_data[$other_id]['price'];
            
            // Cross-sells: similar price (within 2x)
            if ($my_price > 0 && $other_price > 0) {
                $ratio = $other_price / $my_price;
                if ($ratio > 1.1 && $ratio < 3.0) {
                    $up_sells[] = $other_id;
                } else {
                    $cross_sells[] = $other_id;
                }
            } else {
                $cross_sells[] = $other_id;
            }
        }
        
        // Limit to 4 each
        $cross_sells = array_slice($cross_sells, 0, 4);
        $up_sells = array_slice($up_sells, 0, 4);
        
        if (!empty($cross_sells) || !empty($up_sells)) {
            if (!$dry_run) {
                if (!empty($cross_sells)) update_post_meta($pid, '_crosssell_ids', $cross_sells);
                if (!empty($up_sells)) update_post_meta($pid, '_upsell_ids', $up_sells);
            }
            if (!empty($cross_sells)) $cs_set++;
            if (!empty($up_sells)) $us_set++;
        }
    }
}

echo "\n=== RESULTS ===\n";
echo "  Cross-sells set: {$cs_set} products\n";
echo "  Up-sells set: {$us_set} products\n";
if ($dry_run) echo "\n*** DRY RUN ***\n";
