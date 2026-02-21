<?php
wp_set_current_user(1);
global $wpdb;

echo "=== H-MOON HYDRO LIVE CATALOG AUDIT ===\n";
echo "Date: " . date("Y-m-d H:i:s") . "\n\n";

$total = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish'");
$simple = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->terms} t ON tt.term_id=t.term_id WHERE p.post_type='product' AND p.post_status='publish' AND tt.taxonomy='product_type' AND t.slug='simple'");
$grouped = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->terms} t ON tt.term_id=t.term_id WHERE p.post_type='product' AND p.post_status='publish' AND tt.taxonomy='product_type' AND t.slug='grouped'");

echo "--- PRODUCTS ---\n";
echo "Total published:  $total\n";
echo "Simple:           $simple\n";
echo "Grouped:          $grouped\n\n";

$has_sku = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_sku' AND pm.meta_value != ''");
$dup_skus = $wpdb->get_var("SELECT COUNT(*) FROM (SELECT pm.meta_value FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_sku' AND pm.meta_value != '' GROUP BY pm.meta_value HAVING COUNT(*) > 1) x");

echo "--- SKUs ---\n";
echo "Has SKU:          $has_sku / $total (" . round($has_sku/$total*100) . "%)\n";
echo "Duplicate SKUs:   $dup_skus\n\n";

$has_thumb = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0");
$no_thumb = $total - $has_thumb;

$good_img = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id JOIN {$wpdb->postmeta} am ON pm.meta_value=am.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0 AND am.meta_key='_wp_attachment_metadata'");

$has_gallery = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_product_image_gallery' AND pm.meta_value != ''");

echo "--- IMAGES ---\n";
echo "Has thumbnail:    $has_thumb / $total (" . round($has_thumb/$total*100) . "%)\n";
echo "No thumbnail:     $no_thumb\n";
echo "With metadata:    $good_img\n";
echo "Has gallery imgs: $has_gallery\n\n";

$has_desc = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_content != '' AND LENGTH(post_content) > 30");
$has_short = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_excerpt != '' AND LENGTH(post_excerpt) > 10");
$html_desc = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_content LIKE '%<%' AND LENGTH(post_content) > 50");

echo "--- DESCRIPTIONS ---\n";
echo "Has description:  $has_desc / $total (" . round($has_desc/$total*100) . "%)\n";
echo "HTML structured:  $html_desc\n";
echo "Has short desc:   $has_short / $total (" . round($has_short/$total*100) . "%)\n\n";

$has_price = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_regular_price' AND pm.meta_value != '' AND pm.meta_value > 0");

echo "--- PRICES ---\n";
echo "Has price:        $has_price / $total (" . round($has_price/$total*100) . "%)\n\n";

$has_weight = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_weight' AND pm.meta_value != '' AND pm.meta_value > 0");
$has_dims = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_length' AND pm.meta_value != '' AND pm.meta_value > 0");

echo "--- WEIGHT & DIMENSIONS ---\n";
echo "Has weight:       $has_weight / $total (" . round($has_weight/$total*100) . "%)\n";
echo "Has dimensions:   $has_dims / $total (" . round($has_dims/$total*100) . "%)\n\n";

$has_brand = $wpdb->get_var("SELECT COUNT(DISTINCT tr.object_id) FROM {$wpdb->term_relationships} tr JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->posts} p ON tr.object_id=p.ID WHERE tt.taxonomy='pa_brand' AND p.post_type='product' AND p.post_status='publish'");
$brand_count = $wpdb->get_var("SELECT COUNT(DISTINCT t.term_id) FROM {$wpdb->terms} t JOIN {$wpdb->term_taxonomy} tt ON t.term_id=tt.term_id WHERE tt.taxonomy='pa_brand'");

echo "--- BRANDS ---\n";
echo "Products branded: $has_brand / $total (" . round($has_brand/$total*100) . "%)\n";
echo "Unique brands:    $brand_count\n\n";

$has_cat = $wpdb->get_var("SELECT COUNT(DISTINCT tr.object_id) FROM {$wpdb->term_relationships} tr JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->posts} p ON tr.object_id=p.ID WHERE tt.taxonomy='product_cat' AND p.post_type='product' AND p.post_status='publish'");
$cat_count = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->term_taxonomy} WHERE taxonomy='product_cat'");

echo "--- CATEGORIES ---\n";
echo "Categorized:      $has_cat / $total (" . round($has_cat/$total*100) . "%)\n";
echo "Total categories: $cat_count\n\n";

$has_npk = $wpdb->get_var("SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key='_npk_ratio' AND meta_value != ''");
echo "--- ENRICHED METADATA ---\n";
echo "NPK ratios:       $has_npk\n\n";

echo "=== END AUDIT ===\n";
