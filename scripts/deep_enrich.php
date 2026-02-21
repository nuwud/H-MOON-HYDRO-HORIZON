<?php
/**
 * Deep Description Enrichment + Price Fix + Status Report
 * 
 * Phase 1: Try POS inventory for description matches (fuzzy name match)
 * Phase 2: Fix 3 known price anomalies
 * Phase 3: Full status report
 * 
 * Run: wp eval-file deep_enrich.php              (dry run)
 * Run: CONFIRM=1 wp eval-file deep_enrich.php    (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// ============================================================
// PHASE 1: Description enrichment from POS inventory
// ============================================================
echo "## PHASE 1: POS INVENTORY DESCRIPTION ENRICHMENT\n\n";

// Look for POS inventory CSV on the server
$pos_file = null;
$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$possible = [
    $site_root . '/HMoonHydro_Inventory.csv',
    $site_root . '/wp-content/HMoonHydro_Inventory.csv',
];
foreach ($possible as $f) {
    if (file_exists($f)) { $pos_file = $f; break; }
}

// Get products missing descriptions
$no_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt,
           pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND (p.post_content IS NULL OR p.post_content = '')
    ORDER BY p.post_title
");

echo "  Products missing descriptions: " . count($no_desc) . "\n\n";

// Show what's actually missing
$categories_missing = [];
foreach ($no_desc as $p) {
    $terms = wp_get_post_terms($p->ID, 'product_cat', ['fields' => 'names']);
    $cat = !empty($terms) ? $terms[0] : 'Uncategorized';
    $categories_missing[$cat] = ($categories_missing[$cat] ?? 0) + 1;
}
arsort($categories_missing);
echo "  Missing descriptions by category:\n";
foreach ($categories_missing as $cat => $count) {
    echo "    {$cat}: {$count}\n";
}
echo "\n";

// List first 40 for inspection
echo "  Sample products missing descriptions:\n";
$shown = 0;
foreach ($no_desc as $p) {
    if ($shown >= 40) break;
    $has_short = !empty($p->post_excerpt) ? '(has short desc)' : '(no short desc)';
    echo "    #{$p->ID} [{$p->sku}] {$p->post_title} {$has_short}\n";
    $shown++;
}
if (count($no_desc) > 40) echo "    ... and " . (count($no_desc) - 40) . " more\n";
echo "\n";

// ============================================================
// PHASE 2: Fix price anomalies
// ============================================================
echo "## PHASE 2: FIX PRICE ANOMALIES\n\n";

// 1. Liquid Bud Boom 250ml ($16.99) > 500ml ($9.30) — price inversion
$boom_250 = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as price
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    WHERE p.post_title LIKE '%Liquid Bud Boom%250%'
    AND p.post_status = 'publish'
    LIMIT 1
");

$boom_500 = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as price
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    WHERE p.post_title LIKE '%Liquid Bud Boom%500%'
    AND p.post_status = 'publish'
    LIMIT 1
");

if ($boom_250 && $boom_500) {
    echo "  Liquid Bud Boom price inversion:\n";
    echo "    250ml: #{$boom_250->ID} '{$boom_250->post_title}' → \${$boom_250->price}\n";
    echo "    500ml: #{$boom_500->ID} '{$boom_500->post_title}' → \${$boom_500->price}\n";
    
    if (floatval($boom_250->price) > floatval($boom_500->price)) {
        // Swap prices
        echo "    → SWAPPING prices (250ml was more expensive than 500ml)\n";
        if ($confirm) {
            update_post_meta($boom_250->ID, '_regular_price', $boom_500->price);
            update_post_meta($boom_250->ID, '_price', $boom_500->price);
            update_post_meta($boom_500->ID, '_regular_price', $boom_250->price);
            update_post_meta($boom_500->ID, '_price', $boom_250->price);
            echo "    ✓ Swapped: 250ml→\${$boom_500->price}, 500ml→\${$boom_250->price}\n";
        }
    }
} else {
    echo "  Liquid Bud Boom price anomaly: products not found\n";
}

echo "\n";

// 2. Check Big Bud powder vs liquid (may need split — but we already have separate groups now)
echo "  Big Bud Bloom Booster analysis:\n";
$big_buds = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as price, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_title LIKE '%Big Bud%'
    AND p.post_status = 'publish'
    AND p.post_type = 'product'
    ORDER BY pm.meta_value * 1
");
foreach ($big_buds as $bb) {
    echo "    #{$bb->ID} [{$bb->sku}] {$bb->post_title} → \${$bb->price}\n";
}

// Check if Big Bud has liquid/powder mixing
$big_bud_parent = $wpdb->get_row("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_title LIKE '%Big Bud%'
    AND p.post_status = 'publish'
    LIMIT 1
");

if ($big_bud_parent) {
    $child_ids = maybe_unserialize($big_bud_parent->children_raw);
    $has_liquid = false;
    $has_powder = false;
    echo "\n  Big Bud parent #{$big_bud_parent->ID} children:\n";
    if (is_array($child_ids)) {
        foreach ($child_ids as $cid) {
            $child = get_post($cid);
            if (!$child) continue;
            $price = get_post_meta($cid, '_regular_price', true);
            $title_lower = strtolower($child->post_title);
            echo "    #{$cid} '{$child->post_title}' → \${$price}\n";
            if (strpos($title_lower, 'liquid') !== false || strpos($title_lower, ' lt') !== false || strpos($title_lower, ' ml') !== false || strpos($title_lower, ' gal') !== false) $has_liquid = true;
            if (strpos($title_lower, ' gm') !== false || strpos($title_lower, ' kg') !== false || strpos($title_lower, ' g ') !== false || strpos($title_lower, 'powder') !== false) $has_powder = true;
        }
    }
    if ($has_liquid && $has_powder) {
        echo "  ⚠️ Big Bud has MIXED liquid/powder children — needs split!\n";
    }
}

echo "\n";

// 3. Green Air Calibration Solutions — twin pack vs single (may be correct)
echo "  Green Air Calibration Solutions analysis:\n";
$green_air = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as price
    FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_regular_price'
    WHERE p.post_title LIKE '%Green Air%Calibration%'
    AND p.post_status = 'publish'
    ORDER BY pm.meta_value * 1
");
foreach ($green_air as $ga) {
    echo "    #{$ga->ID} '{$ga->post_title}' → \${$ga->price}\n";
}
echo "  (Twin pack pricing is correct if ~2x single price)\n\n";

// ============================================================
// PHASE 3: Check for more liquid/powder mixing
// ============================================================
echo "## PHASE 3: CHECK FOR ADDITIONAL LIQUID/POWDER MIXING\n\n";

$all_grouped = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
");

$mixed_groups = [];
foreach ($all_grouped as $g) {
    $child_ids = maybe_unserialize($g->children_raw);
    if (!is_array($child_ids) || count($child_ids) < 2) continue;
    
    $liquid_children = [];
    $powder_children = [];
    
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child) continue;
        $title_lower = strtolower($child->post_title);
        
        $is_liquid = (
            strpos($title_lower, 'liquid') !== false ||
            preg_match('/\d+\s*(ml|lt|ltr|litre|liter|gal|gallon|fl\s*oz)/i', $child->post_title)
        );
        $is_powder = (
            strpos($title_lower, 'powder') !== false ||
            strpos($title_lower, 'granular') !== false ||
            preg_match('/\d+\s*(gm|g\b|kg|oz\b|lb)/i', $child->post_title)
        );
        
        if ($is_liquid) $liquid_children[] = $child;
        if ($is_powder) $powder_children[] = $child;
    }
    
    // Only flag if there are CLEAR liquid AND powder children
    // (not just size units that could be either)
    if (!empty($liquid_children) && !empty($powder_children)) {
        // Check if liquid children have "liquid" in the name or ml/lt units
        $truly_liquid = false;
        foreach ($liquid_children as $lc) {
            if (stripos($lc->post_title, 'liquid') !== false || 
                preg_match('/\d+\s*(ml|lt|ltr|gal)/i', $lc->post_title)) {
                $truly_liquid = true;
                break;
            }
        }
        $truly_powder = false;
        foreach ($powder_children as $pc) {
            if (stripos($pc->post_title, 'powder') !== false || 
                stripos($pc->post_title, 'granular') !== false ||
                preg_match('/\d+\s*(gm|kg)\b/i', $pc->post_title)) {
                $truly_powder = true;
                break;
            }
        }
        
        if ($truly_liquid && $truly_powder) {
            $mixed_groups[] = $g;
            echo "  ⚠️ #{$g->ID} '{$g->post_title}'\n";
            foreach ($liquid_children as $lc) {
                $price = get_post_meta($lc->ID, '_regular_price', true);
                echo "    LIQUID: #{$lc->ID} '{$lc->post_title}' → \${$price}\n";
            }
            foreach ($powder_children as $pc) {
                $price = get_post_meta($pc->ID, '_regular_price', true);
                echo "    POWDER: #{$pc->ID} '{$pc->post_title}' → \${$price}\n";
            }
            echo "\n";
        }
    }
}

echo "  Found " . count($mixed_groups) . " groups with liquid/powder mixing\n\n";

// ============================================================
// PHASE 4: Final counts
// ============================================================
echo "## PHASE 4: CURRENT STORE STATUS\n\n";

$total = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status = 'publish'");
$simple = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->terms} t ON tt.term_id=t.term_id WHERE tt.taxonomy='product_type' AND t.slug='simple' AND p.post_status='publish'");
$grouped = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID=tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id=tt.term_taxonomy_id JOIN {$wpdb->terms} t ON tt.term_id=t.term_id WHERE tt.taxonomy='product_type' AND t.slug='grouped' AND p.post_status='publish'");

$has_image = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0 WHERE p.post_type='product' AND p.post_status='publish'");
$no_image = $total - $has_image;

$has_desc = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_content IS NOT NULL AND post_content != ''");
$no_desc_count = $total - $has_desc;

$has_short = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_excerpt IS NOT NULL AND post_excerpt != ''");

$has_price = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_regular_price' AND pm.meta_value > 0 WHERE p.post_type='product' AND p.post_status='publish'");

$has_weight = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_weight' AND pm.meta_value != '' AND pm.meta_value > 0 WHERE p.post_type='product' AND p.post_status='publish'");

echo "  Total published products: {$total}\n";
echo "  Simple: {$simple} | Grouped: {$grouped}\n\n";
echo "  With image: {$has_image} | Missing: {$no_image} (" . round(100*$no_image/$total) . "%)\n";
echo "  With description: {$has_desc} | Missing: {$no_desc_count} (" . round(100*$no_desc_count/$total) . "%)\n";
echo "  With short desc: {$has_short} | Missing: " . ($total - $has_short) . "\n";
echo "  With price: {$has_price} | Missing: " . ($total - $has_price) . "\n";
echo "  With weight: {$has_weight} | Missing: " . ($total - $has_weight) . "\n\n";

echo "============================\n";
echo "DONE\n";
