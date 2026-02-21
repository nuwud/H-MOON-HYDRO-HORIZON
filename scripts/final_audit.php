<?php
/**
 * final_audit.php — Comprehensive post-enrichment audit
 */
wp_set_current_user(1);
global $wpdb;

echo "=== H-MOON HYDRO FINAL AUDIT — " . date('Y-m-d H:i') . " ===\n\n";

// Total products
$total = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish'");
echo "TOTAL PRODUCTS: {$total}\n\n";

// --- IMAGES ---
echo "--- IMAGES ---\n";
$with_thumb = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0
    WHERE p.post_type='product' AND p.post_status='publish'
");
$with_gallery = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_product_image_gallery' AND pm.meta_value != ''
    WHERE p.post_type='product' AND p.post_status='publish'
");
$pct_thumb = round($with_thumb / $total * 100, 1);
$pct_gallery = round($with_gallery / $total * 100, 1);
echo "  Thumbnails:  {$with_thumb}/{$total} ({$pct_thumb}%)\n";
echo "  Gallery:     {$with_gallery}/{$total} ({$pct_gallery}%)\n";

// --- PRICES ---
echo "\n--- PRICES ---\n";
$with_price = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_regular_price' AND pm.meta_value != '' AND pm.meta_value > 0
    WHERE p.post_type='product' AND p.post_status='publish'
");
$pct = round($with_price / $total * 100, 1);
echo "  With price: {$with_price}/{$total} ({$pct}%)\n";

// --- SKUS ---
echo "\n--- SKUS ---\n";
$with_sku = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_sku' AND pm.meta_value != ''
    WHERE p.post_type='product' AND p.post_status='publish'
");
$pct = round($with_sku / $total * 100, 1);
echo "  With SKU: {$with_sku}/{$total} ({$pct}%)\n";

// --- DESCRIPTIONS ---
echo "\n--- DESCRIPTIONS ---\n";
$with_desc = $wpdb->get_var("
    SELECT COUNT(*) FROM {$wpdb->posts}
    WHERE post_type='product' AND post_status='publish' AND post_content != '' AND LENGTH(post_content) > 10
");
$with_short = $wpdb->get_var("
    SELECT COUNT(*) FROM {$wpdb->posts}
    WHERE post_type='product' AND post_status='publish' AND post_excerpt != '' AND LENGTH(post_excerpt) > 5
");
echo "  Full desc:  {$with_desc}/{$total} (" . round($with_desc/$total*100,1) . "%)\n";
echo "  Short desc: {$with_short}/{$total} (" . round($with_short/$total*100,1) . "%)\n";

// --- WEIGHT ---
echo "\n--- WEIGHT ---\n";
$with_weight = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_weight' AND pm.meta_value != '' AND pm.meta_value > 0
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "  With weight: {$with_weight}/{$total} (" . round($with_weight/$total*100,1) . "%)\n";

// --- BRANDS ---
echo "\n--- BRANDS ---\n";
$branded = 0;
$brand_counts = array();
$products = get_posts(array('post_type'=>'product','post_status'=>'publish','posts_per_page'=>-1,'fields'=>'ids'));
foreach ($products as $pid) {
    $brands = wp_get_object_terms($pid, 'pwb-brand', array('fields'=>'names'));
    if (!is_wp_error($brands) && !empty($brands)) {
        $branded++;
        $b = $brands[0];
        $brand_counts[$b] = ($brand_counts[$b] ?? 0) + 1;
    }
}
$unbranded = $total - $branded;
echo "  Branded:   {$branded}/{$total} (" . round($branded/$total*100,1) . "%)\n";
echo "  Unbranded: {$unbranded}\n";
echo "  Total brands: " . count($brand_counts) . "\n";

// Top brands
arsort($brand_counts);
echo "\n  Top 15 brands:\n";
$i = 0;
foreach ($brand_counts as $name => $count) {
    if ($i++ >= 15) break;
    echo "    {$name}: {$count}\n";
}

// --- CATEGORIES ---
echo "\n--- CATEGORIES ---\n";
$cats = get_terms(array('taxonomy'=>'product_cat','hide_empty'=>false));
$top_cats = array_filter($cats, function($c) { return $c->parent === 0 && $c->slug !== 'uncategorized'; });
echo "  Top-level categories: " . count($top_cats) . "\n";
echo "  Total categories: " . count($cats) . "\n";

// --- CROSS-SELLS ---
echo "\n--- CROSS-SELLS ---\n";
$with_cs = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_crosssell_ids' AND pm.meta_value != '' AND pm.meta_value != 'a:0:{}'
    WHERE p.post_type='product' AND p.post_status='publish'
");
$with_us = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_upsell_ids' AND pm.meta_value != '' AND pm.meta_value != 'a:0:{}'
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "  Cross-sells: {$with_cs}/{$total}\n";
echo "  Up-sells: {$with_us}/{$total}\n";

// --- PRODUCTS WITHOUT THUMBNAILS (list first 20) ---
echo "\n--- STILL MISSING THUMBNAILS ---\n";
$no_thumb = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_thumbnail_id'
    WHERE p.post_type='product' AND p.post_status='publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.ID DESC LIMIT 25
");
echo "  Showing first " . count($no_thumb) . ":\n";
foreach ($no_thumb as $p) {
    echo "    #{$p->ID} {$p->post_title}\n";
}

echo "\n=== AUDIT COMPLETE ===\n";
