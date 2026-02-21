<?php
/**
 * Split Liquid/Powder Mixed Groups — H-Moon Hydro
 * 
 * Separates "Liquid" variants from powder/granular variants into
 * their own grouped parent products.
 * 
 * Affected: Bud Boom, Bud Start, Carbo Blast, Ton O Bud 0-10-6
 * 
 * Run: wp eval-file split_liquid_powder.php          (dry run)
 * Run: wp eval-file split_liquid_powder.php --confirm (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN (set CONFIRM=1 to apply) ===\n\n";

// The 4 mixed groups from diagnostic
$mixed_parent_ids = [72890, 72891, 72892, 72896];

foreach ($mixed_parent_ids as $parent_id) {
    $parent = get_post($parent_id);
    if (!$parent) { echo "Parent #{$parent_id} not found, skipping\n"; continue; }
    
    $children_raw = get_post_meta($parent_id, '_children', true);
    $child_ids = maybe_unserialize($children_raw);
    if (!is_array($child_ids)) { echo "Parent #{$parent_id} has no children, skipping\n"; continue; }
    
    $liquid_children = [];
    $powder_children = [];
    
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child || $child->post_status !== 'publish') continue;
        
        if (preg_match('/\bLiquid\b/i', $child->post_title)) {
            $liquid_children[] = $cid;
        } else {
            $powder_children[] = $cid;
        }
    }
    
    if (empty($liquid_children) || empty($powder_children)) {
        echo "#{$parent_id} '{$parent->post_title}': Not actually mixed, skipping\n\n";
        continue;
    }
    
    echo "SPLITTING: {$parent->post_title} (ID {$parent_id})\n";
    echo "  Keeping as powder/granular parent ({$parent->post_title}):\n";
    foreach ($powder_children as $cid) {
        echo "    #{$cid}: " . get_the_title($cid) . "\n";
    }
    
    // Build the liquid parent title
    $liquid_parent_title = "Liquid " . $parent->post_title;
    echo "  Creating liquid parent: '{$liquid_parent_title}'\n";
    foreach ($liquid_children as $cid) {
        echo "    #{$cid}: " . get_the_title($cid) . "\n";
    }
    
    if ($confirm) {
        // 1. Update existing parent to only have powder children
        update_post_meta($parent_id, '_children', $powder_children);
        echo "  ✓ Updated parent #{$parent_id} _children to " . count($powder_children) . " powder products\n";
        
        // Also clear the parent weight (it's misleading)
        delete_post_meta($parent_id, '_weight');
        echo "  ✓ Cleared weight on parent #{$parent_id}\n";
        
        // 2. Create new grouped parent for liquid variants
        // Get the parent's category terms
        $cat_terms = wp_get_post_terms($parent_id, 'product_cat', ['fields' => 'ids']);
        
        $new_parent_id = wp_insert_post([
            'post_title'   => $liquid_parent_title,
            'post_content' => $parent->post_content, // same description
            'post_excerpt' => $parent->post_excerpt,
            'post_status'  => 'publish',
            'post_type'    => 'product',
        ]);
        
        if (is_wp_error($new_parent_id)) {
            echo "  ERROR creating liquid parent: " . $new_parent_id->get_error_message() . "\n";
            continue;
        }
        
        // Set product type to grouped
        wp_set_object_terms($new_parent_id, 'grouped', 'product_type');
        
        // Set categories
        if (!empty($cat_terms)) {
            wp_set_object_terms($new_parent_id, $cat_terms, 'product_cat');
        }
        
        // Set children
        update_post_meta($new_parent_id, '_children', $liquid_children);
        
        // Set visibility (visible)
        // Remove any exclude terms
        wp_remove_object_terms($new_parent_id, ['exclude-from-catalog', 'exclude-from-search'], 'product_visibility');
        
        // Copy featured image from original parent if it has one
        $thumb_id = get_post_meta($parent_id, '_thumbnail_id', true);
        if ($thumb_id) {
            update_post_meta($new_parent_id, '_thumbnail_id', $thumb_id);
        }
        
        // Copy SKU pattern (create a liquid variation)
        $parent_sku = get_post_meta($parent_id, '_sku', true);
        if ($parent_sku) {
            update_post_meta($new_parent_id, '_sku', 'LIQ-' . $parent_sku);
        }
        
        echo "  ✓ Created liquid parent #{$new_parent_id} with " . count($liquid_children) . " children\n";
        
        // 3. Ensure liquid children are hidden
        foreach ($liquid_children as $cid) {
            wp_set_object_terms($cid, ['exclude-from-catalog', 'exclude-from-search'], 'product_visibility');
        }
        echo "  ✓ Hid " . count($liquid_children) . " liquid children from catalog\n";
    }
    echo "\n";
}

// Also clear weight on ALL grouped parents (misleading per diagnostic)
echo "\n## CLEARING MISLEADING WEIGHTS ON ALL GROUPED PARENTS\n";
$parents_with_weight = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as weight
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_weight'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
    AND pm.meta_value != '' AND pm.meta_value IS NOT NULL
");

$cleared = 0;
foreach ($parents_with_weight as $pw) {
    if ($confirm) {
        delete_post_meta($pw->ID, '_weight');
        $cleared++;
    }
}
echo "  " . ($confirm ? "Cleared" : "Would clear") . " weight on " . count($parents_with_weight) . " grouped parents\n";

echo "\n" . ($confirm ? "DONE!" : "DRY RUN COMPLETE — set CONFIRM=1 to apply") . "\n";
