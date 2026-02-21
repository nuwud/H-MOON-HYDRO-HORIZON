<?php
/**
 * Fix Big Bud split + Liquid Bud Boom price swap
 * 
 * 1. Swap Liquid Bud Boom 250ml/500ml prices
 * 2. Split Big Bud Bloom Booster into powder + liquid groups
 * 
 * Run: wp eval-file fix_bigbud_prices.php              (dry run)
 * Run: CONFIRM=1 wp eval-file fix_bigbud_prices.php    (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// ============================================================
// FIX 1: Swap Liquid Bud Boom 250ml/500ml prices
// ============================================================
echo "## FIX 1: LIQUID BUD BOOM PRICE SWAP\n\n";

$boom_250 = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as price
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    WHERE p.post_title LIKE '%Liquid Bud Boom%250%'
    AND p.post_status = 'publish' LIMIT 1
");

$boom_500 = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as price
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    WHERE p.post_title LIKE '%Liquid Bud Boom%500%'
    AND p.post_status = 'publish' LIMIT 1
");

if ($boom_250 && $boom_500 && floatval($boom_250->price) > floatval($boom_500->price)) {
    echo "  Before: 250ml=\${$boom_250->price}, 500ml=\${$boom_500->price}\n";
    if ($confirm) {
        $p250 = $boom_250->price;
        $p500 = $boom_500->price;
        update_post_meta($boom_250->ID, '_regular_price', $p500);
        update_post_meta($boom_250->ID, '_price', $p500);
        update_post_meta($boom_500->ID, '_regular_price', $p250);
        update_post_meta($boom_500->ID, '_price', $p250);
        echo "  ✓ After: 250ml=\${$p500}, 500ml=\${$p250}\n";
    } else {
        echo "  Would swap: 250ml→\${$boom_500->price}, 500ml→\${$boom_250->price}\n";
    }
} else {
    echo "  No swap needed or products not found\n";
}
echo "\n";

// ============================================================
// FIX 2: Split Big Bud Bloom Booster into powder + liquid
// ============================================================
echo "## FIX 2: SPLIT BIG BUD BLOOM BOOSTER\n\n";

$parent = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_title LIKE '%Big Bud Bloom Booster%'
    AND p.post_status = 'publish'
    LIMIT 1
");

if (!$parent) {
    echo "  Big Bud Bloom Booster grouped parent not found\n";
    return;
}

$child_ids = maybe_unserialize($parent->children_raw);
if (!is_array($child_ids)) {
    echo "  No children found\n";
    return;
}

$powder_children = [];
$liquid_children = [];

foreach ($child_ids as $cid) {
    $child = get_post($cid);
    if (!$child) continue;
    $title_lower = strtolower($child->post_title);
    
    // Powder: contains "powder", "gm", "g)" etc.
    if (strpos($title_lower, 'powder') !== false || preg_match('/\d+\s*g[m\s\)]/i', $child->post_title)) {
        $powder_children[] = $cid;
        echo "  POWDER: #{$cid} '{$child->post_title}'\n";
    }
    // Liquid: contains "lt", "gal", "ml"
    elseif (preg_match('/\d+\s*(lt|gal|ml)\b/i', $child->post_title)) {
        $liquid_children[] = $cid;
        echo "  LIQUID: #{$cid} '{$child->post_title}'\n";
    } else {
        // Default to powder group
        $powder_children[] = $cid;
        echo "  UNKNOWN→POWDER: #{$cid} '{$child->post_title}'\n";
    }
}

echo "\n  Powder: " . count($powder_children) . " | Liquid: " . count($liquid_children) . "\n\n";

if (empty($liquid_children)) {
    echo "  No liquid children found — no split needed\n";
    return;
}

// Keep original parent as powder parent → update children to powder-only
echo "  Original parent #{$parent->ID} '{$parent->post_title}' → becomes powder-only\n";

if ($confirm) {
    update_post_meta($parent->ID, '_children', $powder_children);
    // Update title to clarify it's powder
    wp_update_post([
        'ID' => $parent->ID,
        'post_title' => 'Big Bud Bloom Booster (Powder)',
        'post_name' => 'big-bud-bloom-booster-powder'
    ]);
    echo "  ✓ Renamed to 'Big Bud Bloom Booster (Powder)' with " . count($powder_children) . " children\n";
}

// Create new liquid parent
echo "  Creating new liquid parent: 'Big Bud Bloom Booster (Liquid)'\n";

if ($confirm) {
    // Get categories and image from existing parent
    $categories = wp_get_post_terms($parent->ID, 'product_cat', ['fields' => 'ids']);
    $thumbnail = get_post_meta($parent->ID, '_thumbnail_id', true);
    $desc = get_post($parent->ID)->post_content;
    $short = get_post($parent->ID)->post_excerpt;
    
    $new_id = wp_insert_post([
        'post_title' => 'Big Bud Bloom Booster (Liquid)',
        'post_name' => 'big-bud-bloom-booster-liquid',
        'post_type' => 'product',
        'post_status' => 'publish',
        'post_content' => $desc,
        'post_excerpt' => $short,
    ]);
    
    if (is_wp_error($new_id)) {
        echo "  ERROR creating liquid parent: " . $new_id->get_error_message() . "\n";
    } else {
        // Set product type
        wp_set_object_terms($new_id, 'grouped', 'product_type');
        
        // Set categories
        if (!empty($categories)) {
            wp_set_object_terms($new_id, $categories, 'product_cat');
        }
        
        // Set image
        if (!empty($thumbnail)) {
            update_post_meta($new_id, '_thumbnail_id', $thumbnail);
        }
        
        // Set children
        update_post_meta($new_id, '_children', $liquid_children);
        
        // Set visibility
        update_post_meta($new_id, '_visibility', 'visible');
        update_post_meta($new_id, '_stock_status', 'instock');
        
        // Generate SKU for parent
        $new_sku = 'HMH-NUT-BIGBUD-LIQ';
        update_post_meta($new_id, '_sku', $new_sku);
        
        // Hide liquid children from catalog (they show as part of grouped)
        foreach ($liquid_children as $lcid) {
            wp_set_object_terms($lcid, ['exclude-from-catalog', 'exclude-from-search'], 'product_visibility');
        }
        
        echo "  ✓ Created liquid parent #{$new_id} with " . count($liquid_children) . " children\n";
        echo "    Children: " . implode(', ', $liquid_children) . "\n";
    }
}

echo "\n============================\n";
echo ($confirm ? "DONE!" : "DRY RUN COMPLETE") . "\n";
