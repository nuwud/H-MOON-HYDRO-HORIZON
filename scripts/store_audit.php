<?php
/**
 * Comprehensive Store Health Audit
 * Run: wp eval-file store_audit.php
 */
if (!defined('ABSPATH')) {
    // Allow running via wp eval-file
}

global $wpdb;
wp_set_current_user(1);

echo "=== STORE HEALTH AUDIT ===\n\n";

// Overall counts
$total = wp_count_posts('product');
echo "PRODUCT COUNTS:\n";
echo "  Published: {$total->publish}\n";
echo "  Draft: {$total->draft}\n";
echo "  Trash: {$total->trash}\n\n";

// Type breakdown
$types = $wpdb->get_results("
    SELECT t.name, COUNT(*) as cnt 
    FROM {$wpdb->posts} p 
    JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id 
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id 
    JOIN {$wpdb->terms} t ON tt.term_id=t.term_id 
    WHERE p.post_type='product' AND p.post_status='publish' AND tt.taxonomy='product_type' 
    GROUP BY t.name
");
echo "TYPES:\n";
foreach($types as $t) echo "  {$t->name}: {$t->cnt}\n";

// Visibility breakdown  
$vis = $wpdb->get_row("
    SELECT 
      SUM(CASE WHEN ev.object_id IS NOT NULL AND es.object_id IS NOT NULL THEN 1 ELSE 0 END) as hidden,
      SUM(CASE WHEN ev.object_id IS NOT NULL AND es.object_id IS NULL THEN 1 ELSE 0 END) as search_only,
      SUM(CASE WHEN ev.object_id IS NULL AND es.object_id IS NOT NULL THEN 1 ELSE 0 END) as catalog_only,
      SUM(CASE WHEN ev.object_id IS NULL AND es.object_id IS NULL THEN 1 ELSE 0 END) as visible
    FROM {$wpdb->posts} p
    LEFT JOIN (
        SELECT tr.object_id FROM {$wpdb->term_relationships} tr 
        JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id 
        JOIN {$wpdb->terms} t ON tt.term_id=t.term_id 
        WHERE t.slug='exclude-from-catalog'
    ) ev ON p.ID=ev.object_id
    LEFT JOIN (
        SELECT tr.object_id FROM {$wpdb->term_relationships} tr 
        JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id 
        JOIN {$wpdb->terms} t ON tt.term_id=t.term_id 
        WHERE t.slug='exclude-from-search'
    ) es ON p.ID=es.object_id
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "\nVISIBILITY:\n";
echo "  Hidden: {$vis->hidden}, Search: {$vis->search_only}, Catalog: {$vis->catalog_only}, Visible: {$vis->visible}\n";

// Grouped products with children count
$grouped_stats = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_data
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id=t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_children'
    WHERE p.post_type='product' AND p.post_status='publish' 
    AND tt.taxonomy='product_type' AND t.name='grouped'
    ORDER BY p.post_title
");

$empty_grouped = [];
$has_children = 0;
$total_children = 0;
foreach ($grouped_stats as $g) {
    $children = maybe_unserialize($g->children_data);
    if (empty($children) || !is_array($children)) {
        $empty_grouped[] = $g;
    } else {
        $has_children++;
        $total_children += count($children);
    }
}
echo "\nGROUPED PRODUCTS:\n";
echo "  Total grouped: " . count($grouped_stats) . "\n";
echo "  With children: {$has_children} (total {$total_children} children)\n";
echo "  Empty (no children): " . count($empty_grouped) . "\n";

echo "\nEMPTY GROUPED PRODUCTS:\n";
foreach ($empty_grouped as $eg) {
    echo "  [{$eg->ID}] {$eg->post_title}\n";
}

// Weight stats
$weight_stats = $wpdb->get_row("
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN pm.meta_value IS NOT NULL AND pm.meta_value != '' AND pm.meta_value != '0' THEN 1 ELSE 0 END) as has_weight
    FROM {$wpdb->posts} p 
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_weight'
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "\nWEIGHT DATA:\n";
echo "  Total: {$weight_stats->total}, Has weight: {$weight_stats->has_weight}, Missing: " . ($weight_stats->total - $weight_stats->has_weight) . "\n";

// Description stats
$desc_stats = $wpdb->get_row("
    SELECT 
      SUM(CASE WHEN p.post_content != '' THEN 1 ELSE 0 END) as has_desc,
      SUM(CASE WHEN p.post_excerpt != '' THEN 1 ELSE 0 END) as has_short
    FROM {$wpdb->posts} p 
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "\nDESCRIPTIONS:\n";
echo "  Has description: {$desc_stats->has_desc} / {$weight_stats->total}\n";
echo "  Has short desc: {$desc_stats->has_short} / {$weight_stats->total}\n";

// Image stats
$img_stats = $wpdb->get_row("
    SELECT 
      SUM(CASE WHEN pm.meta_value IS NOT NULL AND pm.meta_value != '' AND pm.meta_value != '0' THEN 1 ELSE 0 END) as has_image
    FROM {$wpdb->posts} p 
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_thumbnail_id'
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "  Has featured image: {$img_stats->has_image} / {$weight_stats->total}\n";

// Price stats
$price_stats = $wpdb->get_row("
    SELECT 
      SUM(CASE WHEN pm.meta_value IS NOT NULL AND pm.meta_value != '' THEN 1 ELSE 0 END) as has_price
    FROM {$wpdb->posts} p 
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_regular_price'
    WHERE p.post_type='product' AND p.post_status='publish'
");
echo "  Has price: {$price_stats->has_price} / {$weight_stats->total}\n";

// Find potential orphans: visible simple products that share a category with a grouped product
echo "\n=== ORPHAN ANALYSIS ===\n";
echo "Finding visible simple products in categories that also have grouped parents...\n\n";

// Get all categories that have grouped products
$grouped_cats = $wpdb->get_results("
    SELECT DISTINCT cat_t.term_id, cat_t.name as cat_name, p.ID as grouped_id, p.post_title as grouped_title
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id=t.term_id
    JOIN {$wpdb->term_relationships} tr2 ON p.ID=tr2.object_id
    JOIN {$wpdb->term_taxonomy} tt2 ON tr2.term_taxonomy_id=tt2.term_taxonomy_id
    JOIN {$wpdb->terms} cat_t ON tt2.term_id=cat_t.term_id
    WHERE p.post_type='product' AND p.post_status='publish'
    AND tt.taxonomy='product_type' AND t.name='grouped'
    AND tt2.taxonomy='product_cat'
    ORDER BY cat_t.name, p.post_title
");

// For each category with a grouped product, find visible simple products
$orphan_count = 0;
$categories_with_orphans = [];

foreach ($grouped_cats as $gc) {
    // Find visible simple products in this category
    $orphans = $wpdb->get_results($wpdb->prepare("
        SELECT p.ID, p.post_title, pm_sku.meta_value as sku
        FROM {$wpdb->posts} p
        JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id
        JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id
        JOIN {$wpdb->terms} t ON tt.term_id=t.term_id
        JOIN {$wpdb->term_relationships} tr2 ON p.ID=tr2.object_id
        JOIN {$wpdb->term_taxonomy} tt2 ON tr2.term_taxonomy_id=tt2.term_taxonomy_id
        LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID=pm_sku.post_id AND pm_sku.meta_key='_sku'
        WHERE p.post_type='product' AND p.post_status='publish'
        AND tt.taxonomy='product_type' AND t.name='simple'
        AND tt2.taxonomy='product_cat' AND tt2.term_id=%d
        AND NOT EXISTS (
            SELECT 1 FROM {$wpdb->term_relationships} tr3 
            JOIN {$wpdb->term_taxonomy} tt3 ON tr3.term_taxonomy_id=tt3.term_taxonomy_id 
            JOIN {$wpdb->terms} t3 ON tt3.term_id=t3.term_id 
            WHERE tr3.object_id=p.ID AND t3.slug='exclude-from-catalog'
        )
        AND NOT EXISTS (
            SELECT 1 FROM {$wpdb->postmeta} pm WHERE pm.meta_key='_children' 
            AND pm.meta_value LIKE CONCAT('%%', p.ID, '%%')
        )
        ORDER BY p.post_title
    ", $gc->term_id));
    
    if (!empty($orphans)) {
        $cat_key = "{$gc->cat_name}";
        if (!isset($categories_with_orphans[$cat_key])) {
            $categories_with_orphans[$cat_key] = [
                'grouped' => [],
                'orphans' => []
            ];
        }
        $categories_with_orphans[$cat_key]['grouped'][$gc->grouped_id] = $gc->grouped_title;
        foreach ($orphans as $o) {
            $categories_with_orphans[$cat_key]['orphans'][$o->ID] = [
                'title' => $o->post_title,
                'sku' => $o->sku
            ];
            $orphan_count++;
        }
    }
}

echo "Categories with potential orphans: " . count($categories_with_orphans) . "\n";
echo "Total potential orphan products: {$orphan_count}\n\n";

// Show first 20 categories
$shown = 0;
foreach ($categories_with_orphans as $cat_name => $data) {
    if ($shown++ >= 20) { echo "... (truncated)\n"; break; }
    echo "CATEGORY: {$cat_name}\n";
    echo "  Grouped parents:\n";
    foreach ($data['grouped'] as $gid => $gtitle) {
        echo "    [{$gid}] {$gtitle}\n";
    }
    echo "  Visible orphans (" . count($data['orphans']) . "):\n";
    $ocount = 0;
    foreach ($data['orphans'] as $oid => $odata) {
        if ($ocount++ >= 5) { echo "    ... and " . (count($data['orphans']) - 5) . " more\n"; break; }
        echo "    [{$oid}] {$odata['title']} (SKU: {$odata['sku']})\n";
    }
    echo "\n";
}

echo "\n=== AUDIT COMPLETE ===\n";
