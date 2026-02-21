<?php
/**
 * Export enrichment manifest — products + their data gaps
 * Output: JSON to stdout for the Python scraper to consume
 */
wp_set_current_user(1);
global $wpdb;

$products = get_posts(array('post_type'=>'product','post_status'=>'publish','posts_per_page'=>-1));
$manifest = array();

foreach ($products as $p) {
    $meta = get_post_meta($p->ID);
    $thumb_id = get_post_thumbnail_id($p->ID);
    $gallery = get_post_meta($p->ID, '_product_image_gallery', true);
    $weight = isset($meta['_weight'][0]) ? trim($meta['_weight'][0]) : '';
    $price = isset($meta['_regular_price'][0]) ? trim($meta['_regular_price'][0]) : '';
    $short = trim($p->post_excerpt);
    $desc = trim($p->post_content);
    $sku = isset($meta['_sku'][0]) ? $meta['_sku'][0] : '';
    
    // Get brand
    $brands = wp_get_object_terms($p->ID, 'pwb-brand', array('fields'=>'names'));
    $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : '';
    
    // Get categories
    $cats = wp_get_object_terms($p->ID, 'product_cat', array('fields'=>'names'));
    $cat_str = (!is_wp_error($cats)) ? implode(' | ', $cats) : '';
    
    // Determine what's missing
    $missing = array();
    if (!$thumb_id) $missing[] = 'image';
    if (empty($gallery)) $missing[] = 'gallery';
    if (empty($weight)) $missing[] = 'weight';
    if (empty($short)) $missing[] = 'short_description';
    if (empty($desc)) $missing[] = 'description';
    if (empty($brand)) $missing[] = 'brand';
    if (empty($price)) $missing[] = 'price';
    
    $manifest[] = array(
        'id' => $p->ID,
        'title' => $p->post_title,
        'sku' => $sku,
        'brand' => $brand,
        'category' => $cat_str,
        'missing' => $missing,
        'has_image' => (bool) $thumb_id,
        'has_gallery' => !empty($gallery),
        'has_weight' => !empty($weight),
        'has_short_desc' => !empty($short),
        'has_desc' => !empty($desc),
        'has_brand' => !empty($brand),
        'has_price' => !empty($price),
    );
}

// Summary
$total = count($manifest);
$needs_image = count(array_filter($manifest, function($p){ return !$p['has_image']; }));
$needs_gallery = count(array_filter($manifest, function($p){ return !$p['has_gallery']; }));
$needs_weight = count(array_filter($manifest, function($p){ return !$p['has_weight']; }));
$needs_short = count(array_filter($manifest, function($p){ return !$p['has_short_desc']; }));
$needs_desc = count(array_filter($manifest, function($p){ return !$p['has_desc']; }));
$needs_brand = count(array_filter($manifest, function($p){ return !$p['has_brand']; }));

fprintf(STDERR, "=== MANIFEST EXPORTED ===\n");
fprintf(STDERR, "Total products: %d\n", $total);
fprintf(STDERR, "Missing image: %d\n", $needs_image);
fprintf(STDERR, "Missing gallery: %d\n", $needs_gallery);
fprintf(STDERR, "Missing weight: %d\n", $needs_weight);
fprintf(STDERR, "Missing short desc: %d\n", $needs_short);
fprintf(STDERR, "Missing description: %d\n", $needs_desc);
fprintf(STDERR, "Missing brand: %d\n", $needs_brand);

echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
