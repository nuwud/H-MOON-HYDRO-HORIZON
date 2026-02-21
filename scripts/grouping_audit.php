<?php
/**
 * Grouped Product Quality Audit
 * 
 * Finds grouped parents where children don't actually belong together:
 * - Different product forms mixed (blocks vs liquid vs powder)
 * - Unrelated products grouped by fuzzy name match errors
 * - Children that should be standalone simple products
 * 
 * Run: wp eval-file grouping_audit.php
 */

wp_set_current_user(1);
global $wpdb;

echo "## GROUPED PRODUCT QUALITY AUDIT\n\n";

// Get ALL grouped parents with children
$grouped = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
    ORDER BY p.post_title
");

echo "Total grouped parents: " . count($grouped) . "\n\n";

// ============================================================
// CHECK 1: SiLICIUM specifically
// ============================================================
echo "=== SILICIUM DETAIL ===\n\n";
foreach ($grouped as $g) {
    if (stripos($g->post_title, 'ilicium') === false && stripos($g->post_title, 'SILICIUM') === false) continue;
    
    $children = maybe_unserialize($g->children_raw);
    echo "PARENT #{$g->ID}: {$g->post_title}\n";
    if (is_array($children)) {
        foreach ($children as $cid) {
            $child = get_post($cid);
            if (!$child) { echo "  MISSING: #{$cid}\n"; continue; }
            $price = get_post_meta($cid, '_regular_price', true);
            $sku = get_post_meta($cid, '_sku', true);
            echo "  #{$cid} [{$sku}] {$child->post_title} => \${$price}\n";
        }
    }
    echo "\n";
}

// ============================================================
// CHECK 2: Find groups where children have very different base names
// ============================================================
echo "=== SUSPICIOUS GROUPINGS (name mismatch) ===\n\n";

$suspicious = [];
foreach ($grouped as $g) {
    $children = maybe_unserialize($g->children_raw);
    if (!is_array($children) || count($children) < 2) continue;
    
    // Get all child names
    $child_names = [];
    foreach ($children as $cid) {
        $child = get_post($cid);
        if (!$child) continue;
        $child_names[$cid] = $child->post_title;
    }
    
    if (count($child_names) < 2) continue;
    
    // Extract base product names (strip size/quantity info)
    $base_names = [];
    foreach ($child_names as $cid => $name) {
        $base = preg_replace('/\s*\(?\d+[\s.]*(gal|gallon|lt|ltr|liter|litre|ml|oz|lb|lbs|kg|gm|g|gram|grams|quart|qt)\)?\s*/i', ' ', $name);
        $base = preg_replace('/\s*\([^)]*\)\s*/', ' ', $base);
        $base = preg_replace('/\s+\d+$/', '', $base);
        $base = preg_replace('/\s+/', ' ', trim($base));
        $base = strtolower($base);
        $base_names[$cid] = $base;
    }
    
    // Compare base names - if they're too different, flag it
    $unique_bases = array_unique(array_values($base_names));
    
    // Check pairwise similarity
    $dissimilar = false;
    $worst_pair = '';
    $worst_score = 100;
    
    $bases_arr = array_values($base_names);
    $cids_arr = array_keys($base_names);
    
    for ($i = 0; $i < count($bases_arr); $i++) {
        for ($j = $i + 1; $j < count($bases_arr); $j++) {
            similar_text($bases_arr[$i], $bases_arr[$j], $pct);
            if ($pct < $worst_score) {
                $worst_score = $pct;
                $worst_pair = $child_names[$cids_arr[$i]] . " vs " . $child_names[$cids_arr[$j]];
            }
        }
    }
    
    // Flag if any pair is less than 50% similar
    if ($worst_score < 50 && count($child_names) >= 2) {
        $suspicious[] = [
            'parent' => $g,
            'children' => $child_names,
            'score' => $worst_score,
            'pair' => $worst_pair
        ];
    }
}

// Sort by worst similarity score
usort($suspicious, function($a, $b) { return $a['score'] - $b['score']; });

echo "Found " . count($suspicious) . " groups with dissimilar children:\n\n";

foreach ($suspicious as $s) {
    $parent = $s['parent'];
    echo "⚠️ #{$parent->ID} '{$parent->post_title}' (worst pair: " . round($s['score']) . "% similar)\n";
    echo "  Worst: {$s['pair']}\n";
    foreach ($s['children'] as $cid => $name) {
        $price = get_post_meta($cid, '_regular_price', true);
        $sku = get_post_meta($cid, '_sku', true);
        echo "  #{$cid} [{$sku}] {$name} => \${$price}\n";
    }
    echo "\n";
}

// ============================================================
// CHECK 3: Groups with different product forms mixed
// ============================================================
echo "\n=== MIXED PRODUCT FORMS (blocks vs liquid vs other) ===\n\n";

foreach ($grouped as $g) {
    $children = maybe_unserialize($g->children_raw);
    if (!is_array($children) || count($children) < 2) continue;
    
    $forms = [];
    foreach ($children as $cid) {
        $child = get_post($cid);
        if (!$child) continue;
        $title = strtolower($child->post_title);
        
        if (strpos($title, 'block') !== false) $forms['block'][] = $child->post_title;
        elseif (strpos($title, 'mama') !== false || strpos($title, 'starter') !== false) $forms['starter'][] = $child->post_title;
        elseif (preg_match('/\d+\s*(ml|lt|ltr|liter|gal)/i', $child->post_title)) $forms['liquid'][] = $child->post_title;
        elseif (preg_match('/\d+\s*(gm|kg|oz|lb|powder|granular)/i', $child->post_title)) $forms['powder'][] = $child->post_title;
        else $forms['other'][] = $child->post_title;
    }
    
    // Remove 'other' if it's the only form
    $form_types = array_keys($forms);
    $form_types = array_diff($form_types, ['other']);
    
    if (count($form_types) > 1) {
        echo "⚠️ #{$g->ID} '{$g->post_title}' — mixed: " . implode('+', $form_types) . "\n";
        foreach ($forms as $form => $items) {
            foreach ($items as $item) {
                echo "  [{$form}] {$item}\n";
            }
        }
        echo "\n";
    }
}

// ============================================================
// CHECK 4: Groups where parent created by our script (ID > 72900)
// that may have bad matches
// ============================================================
echo "\n=== SCRIPT-CREATED PARENTS (ID > 72900) ===\n\n";

$script_parents = 0;
foreach ($grouped as $g) {
    if ($g->ID <= 72900) continue;
    $script_parents++;
    
    $children = maybe_unserialize($g->children_raw);
    if (!is_array($children)) continue;
    
    echo "#{$g->ID} '{$g->post_title}' (" . count($children) . " children)\n";
    foreach ($children as $cid) {
        $child = get_post($cid);
        if (!$child) continue;
        $price = get_post_meta($cid, '_regular_price', true);
        echo "  #{$cid} {$child->post_title} => \${$price}\n";
    }
    echo "\n";
}

echo "Total script-created parents: {$script_parents}\n\n";

echo "============================\nAUDIT COMPLETE\n";
