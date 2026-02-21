<?php
/**
 * Convert empty grouped products to simple
 * Run: CONFIRM=yes wp eval-file fix_empty_grouped.php
 */
if (!defined('ABSPATH')) {}
global $wpdb;
wp_set_current_user(1);

$dry_run = getenv('CONFIRM') !== 'yes';
$mode = $dry_run ? "DRY-RUN" : "LIVE";
echo "=== FIX EMPTY GROUPED ({$mode}) ===\n\n";

// Find grouped products with no valid children
$grouped = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_data
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND tt.taxonomy = 'product_type' AND t.name = 'grouped'
    ORDER BY p.post_title
");

$simple_term = get_term_by('slug', 'simple', 'product_type');
$grouped_term = get_term_by('slug', 'grouped', 'product_type');

if (!$simple_term || !$grouped_term) {
    echo "ERROR: Cannot find product_type terms\n";
    exit(1);
}

$converted = 0;
foreach ($grouped as $g) {
    $children = maybe_unserialize($g->children_data);
    if (empty($children) || !is_array($children)) {
        echo "  [{$g->ID}] {$g->post_title} -> simple\n";
        if (!$dry_run) {
            wp_remove_object_terms($g->ID, $grouped_term->term_id, 'product_type');
            wp_set_object_terms($g->ID, $simple_term->term_id, 'product_type');
            delete_post_meta($g->ID, '_children');
            // Clear WC transients
            delete_transient('wc_product_children_' . $g->ID);
            wc_delete_product_transients($g->ID);
        }
        $converted++;
    }
}

echo "\nConverted: {$converted}\n";

if ($dry_run) {
    echo "\n*** DRY-RUN: Use CONFIRM=yes to apply. ***\n";
} else {
    // Verify
    $remaining = $wpdb->get_var("
        SELECT COUNT(*) FROM {$wpdb->posts} p
        JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
        JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
        WHERE p.post_type = 'product' AND p.post_status = 'publish'
        AND tt.taxonomy = 'product_type' AND t.name = 'grouped'
    ");
    echo "Grouped products remaining: {$remaining}\n";
    wp_cache_flush();
}

echo "\n=== DONE ===\n";
