<?php
/**
 * Store Issues Diagnostic — H-Moon Hydro
 * Finds: liquid/powder mixing, price anomalies, weight issues, missing images/descriptions
 * Run: wp eval-file store_diagnostic.php
 */

wp_set_current_user(1);
global $wpdb;

echo "============================\n";
echo "STORE ISSUES DIAGNOSTIC\n";
echo date('Y-m-d H:i:s') . "\n";
echo "============================\n\n";

// ============================================================
// ISSUE 1: LIQUID vs POWDER/GRANULAR mixed in same grouped product
// ============================================================
echo "## ISSUE 1: LIQUID vs NON-LIQUID MIXED IN SAME GROUP\n";
echo "(Products where 'Liquid' variants are grouped with powder/granular)\n\n";

$grouped_parents = $wpdb->get_results("
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

$mixed_groups = [];
$all_grouped_children = []; // for later use

foreach ($grouped_parents as $parent) {
    $child_ids = maybe_unserialize($parent->children_raw);
    if (!is_array($child_ids) || empty($child_ids)) continue;
    
    $liquid_children = [];
    $non_liquid_children = [];
    
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child || $child->post_status !== 'publish') continue;
        
        $title = $child->post_title;
        // Check if "Liquid" appears in title
        if (preg_match('/\bLiquid\b/i', $title)) {
            $price = get_post_meta($cid, '_price', true);
            $liquid_children[] = ['id' => $cid, 'title' => $title, 'price' => $price];
        } else {
            $price = get_post_meta($cid, '_price', true);
            $non_liquid_children[] = ['id' => $cid, 'title' => $title, 'price' => $price];
        }
        
        $all_grouped_children[$cid] = $parent->ID;
    }
    
    // If both liquid AND non-liquid exist, this is a mixed group
    if (!empty($liquid_children) && !empty($non_liquid_children)) {
        $mixed_groups[] = [
            'parent_id' => $parent->ID,
            'parent_title' => $parent->post_title,
            'liquid' => $liquid_children,
            'non_liquid' => $non_liquid_children,
        ];
    }
}

echo "Found " . count($mixed_groups) . " mixed groups:\n\n";
foreach ($mixed_groups as $mg) {
    echo "PARENT: {$mg['parent_title']} (ID {$mg['parent_id']})\n";
    echo "  Non-Liquid children (" . count($mg['non_liquid']) . "):\n";
    foreach ($mg['non_liquid'] as $c) {
        echo "    #{$c['id']}: {$c['title']} — \${$c['price']}\n";
    }
    echo "  Liquid children (" . count($mg['liquid']) . "):\n";
    foreach ($mg['liquid'] as $c) {
        echo "    #{$c['id']}: {$c['title']} — \${$c['price']}\n";
    }
    echo "\n";
}

// ============================================================
// ISSUE 2: PRICE ANOMALIES in grouped products
// ============================================================
echo "\n## ISSUE 2: PRICE ANOMALIES (possible inversions)\n";
echo "(Smaller sizes priced higher than larger sizes within same group)\n\n";

// Size hierarchy in ml: 1 gal = 3785ml, 1L = 1000ml, etc.
function extract_volume_ml($title) {
    $title = strtolower($title);
    
    // Gallons
    if (preg_match('/([\d.]+)\s*gal/i', $title, $m)) return $m[1] * 3785;
    // Liters
    if (preg_match('/([\d.]+)\s*(?:lt|liter|litre|l)\b/i', $title, $m)) return $m[1] * 1000;
    // ml
    if (preg_match('/([\d.]+)\s*ml/i', $title, $m)) return $m[1];
    // Quarts
    if (preg_match('/([\d.]+)\s*(?:qt|quart)/i', $title, $m)) return $m[1] * 946;
    // kg
    if (preg_match('/([\d.]+)\s*kg/i', $title, $m)) return $m[1] * 1000; // grams
    // gm/g
    if (preg_match('/([\d.]+)\s*(?:gm|grams?|g)\b/i', $title, $m)) return $m[1];
    // oz
    if (preg_match('/([\d.]+)\s*(?:oz|ounce)/i', $title, $m)) return $m[1] * 29.57;
    // lb
    if (preg_match('/([\d.]+)\s*(?:lb|lbs|pound)/i', $title, $m)) return $m[1] * 453.6;
    // cu ft
    if (preg_match('/([\d.]+)\s*(?:cu\.?\s*ft|cubic)/i', $title, $m)) return $m[1] * 28316.8;
    
    return null;
}

$price_anomalies = [];
foreach ($grouped_parents as $parent) {
    $child_ids = maybe_unserialize($parent->children_raw);
    if (!is_array($child_ids) || count($child_ids) < 2) continue;
    
    $sized_children = [];
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child || $child->post_status !== 'publish') continue;
        $vol = extract_volume_ml($child->post_title);
        $price = floatval(get_post_meta($cid, '_price', true));
        if ($vol && $price > 0) {
            $sized_children[] = ['id' => $cid, 'title' => $child->post_title, 'vol' => $vol, 'price' => $price];
        }
    }
    
    // Sort by volume ascending
    usort($sized_children, function($a, $b) { return $a['vol'] <=> $b['vol']; });
    
    // Check: each step up in volume should generally be same or higher price
    $anomalies = [];
    for ($i = 0; $i < count($sized_children) - 1; $i++) {
        $small = $sized_children[$i];
        $large = $sized_children[$i + 1];
        
        // If larger size is cheaper AND the price difference is significant
        if ($large['price'] < $small['price'] * 0.7) {
            $anomalies[] = "  {$small['title']} (\${$small['price']}) > {$large['title']} (\${$large['price']}) — larger size is CHEAPER";
        }
        
        // If per-unit price is wildly inconsistent (>5x)
        $ppu_small = $small['price'] / $small['vol'];
        $ppu_large = $large['price'] / $large['vol'];
        if ($ppu_large > $ppu_small * 5 || $ppu_small > $ppu_large * 5) {
            $anomalies[] = "  Per-unit: {$small['title']} = \$" . round($ppu_small, 4) . "/unit vs {$large['title']} = \$" . round($ppu_large, 4) . "/unit — >5x difference";
        }
    }
    
    if (!empty($anomalies)) {
        $price_anomalies[] = [
            'parent' => $parent->post_title . " (ID {$parent->ID})",
            'issues' => $anomalies,
        ];
    }
}

echo "Found " . count($price_anomalies) . " products with price anomalies:\n\n";
foreach (array_slice($price_anomalies, 0, 30) as $pa) {
    echo "{$pa['parent']}:\n";
    foreach ($pa['issues'] as $issue) {
        echo "  {$issue}\n";
    }
    echo "\n";
}
if (count($price_anomalies) > 30) echo "... and " . (count($price_anomalies) - 30) . " more\n\n";

// ============================================================
// ISSUE 3: WEIGHT on grouped parents (should be empty or correct)
// ============================================================
echo "\n## ISSUE 3: GROUPED PARENTS WITH WRONG/MISLEADING WEIGHT\n";
echo "(Parent weight should generally be empty - children have their own weights)\n\n";

$parents_with_weight = 0;
$bad_weights = [];
foreach ($grouped_parents as $parent) {
    $weight = get_post_meta($parent->ID, '_weight', true);
    if (!empty($weight) && floatval($weight) > 0) {
        $parents_with_weight++;
        $bad_weights[] = "{$parent->post_title} (ID {$parent->ID}): weight = {$weight}";
    }
}
echo "  Grouped parents with weight set: {$parents_with_weight} / " . count($grouped_parents) . "\n";
if ($parents_with_weight > 0 && $parents_with_weight <= 30) {
    foreach ($bad_weights as $bw) echo "    {$bw}\n";
} elseif ($parents_with_weight > 30) {
    foreach (array_slice($bad_weights, 0, 15) as $bw) echo "    {$bw}\n";
    echo "    ... and " . ($parents_with_weight - 15) . " more\n";
}
echo "\n";

// ============================================================
// ISSUE 4: MISSING IMAGES
// ============================================================
echo "\n## ISSUE 4: MISSING IMAGES (simple + grouped parents only)\n\n";

$no_image = $wpdb->get_results("
    SELECT p.ID, p.post_title, t2.slug as product_type
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->term_relationships} tr2 ON p.ID = tr2.object_id
    JOIN {$wpdb->term_taxonomy} tt2 ON tr2.term_taxonomy_id = tt2.term_taxonomy_id
    JOIN {$wpdb->terms} t2 ON tt2.term_id = t2.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    WHERE t.slug IN ('simple', 'grouped')
    AND tt.taxonomy = 'product_type'
    AND t2.slug NOT IN ('exclude-from-catalog')
    AND tt2.taxonomy = 'product_visibility'
    AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.post_title
    LIMIT 100
");

// Simpler query - just count visible products without images
$no_image_count = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID) 
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
");

echo "  Total products missing featured image: {$no_image_count}\n";
echo "  Sample (first 50):\n";
$shown = 0;
foreach ($no_image as $ni) {
    if ($shown >= 50) break;
    // Skip hidden children
    echo "    #{$ni->ID}: {$ni->post_title}\n";
    $shown++;
}
echo "\n";

// ============================================================
// ISSUE 5: MISSING DESCRIPTIONS (visible products only)
// ============================================================
echo "\n## ISSUE 5: MISSING DESCRIPTIONS (visible products)\n\n";

$no_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND (p.post_content IS NULL OR p.post_content = '')
    ORDER BY p.post_title
");
echo "  Products missing description: " . count($no_desc) . "\n";
echo "  Sample (first 40):\n";
foreach (array_slice($no_desc, 0, 40) as $nd) {
    echo "    #{$nd->ID}: {$nd->post_title}\n";
}
if (count($no_desc) > 40) echo "    ... and " . (count($no_desc) - 40) . " more\n";
echo "\n";

// ============================================================
// ISSUE 6: CHILD PRODUCTS WITH $0 OR MISSING PRICES
// ============================================================
echo "\n## ISSUE 6: CHILDREN WITH MISSING/ZERO PRICES\n\n";

$child_list = implode(',', array_map('intval', array_keys($all_grouped_children)));
if (!empty($child_list)) {
    $bad_price_children = $wpdb->get_results("
        SELECT p.ID, p.post_title, pm.meta_value as price
        FROM {$wpdb->posts} p
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_price'
        WHERE p.ID IN ({$child_list})
        AND p.post_status = 'publish'
        AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0' OR pm.meta_value = '0.00')
        ORDER BY p.post_title
    ");
    echo "  Children with $0 or missing price: " . count($bad_price_children) . "\n";
    foreach (array_slice($bad_price_children, 0, 20) as $bc) {
        $parent_id = $all_grouped_children[$bc->ID];
        $parent_title = get_the_title($parent_id);
        echo "    #{$bc->ID}: {$bc->post_title} (parent: {$parent_title}) — price: {$bc->price}\n";
    }
}
echo "\n";

// ============================================================
// ISSUE 7: IMAGE DIMENSION CHECK (oddly shaped)
// ============================================================
echo "\n## ISSUE 7: ODDLY SHAPED IMAGES (very non-square)\n\n";
$odd_images = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as thumb_id
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND pm.meta_value != '' AND pm.meta_value > 0
    LIMIT 500
");

$odd_count = 0;
$odd_list = [];
foreach ($odd_images as $oi) {
    $meta = wp_get_attachment_metadata(intval($oi->thumb_id));
    if (!$meta || !isset($meta['width']) || !isset($meta['height'])) continue;
    
    $w = $meta['width'];
    $h = $meta['height'];
    if ($w == 0 || $h == 0) continue;
    
    $ratio = max($w, $h) / min($w, $h);
    
    // Flag images with ratio > 2.0 (very non-square) or very small
    if ($ratio > 2.0 || min($w, $h) < 200) {
        $odd_count++;
        $reason = [];
        if ($ratio > 2.0) $reason[] = "ratio " . round($ratio, 1) . ":1";
        if (min($w, $h) < 200) $reason[] = "small ({$w}x{$h})";
        $odd_list[] = "#{$oi->ID}: {$oi->post_title} — {$w}x{$h} (" . implode(', ', $reason) . ")";
    }
}
echo "  Oddly shaped or too small: {$odd_count} / " . count($odd_images) . " checked\n";
foreach (array_slice($odd_list, 0, 20) as $ol) {
    echo "    {$ol}\n";
}
if ($odd_count > 20) echo "    ... and " . ($odd_count - 20) . " more\n";
echo "\n";

// ============================================================
// SUMMARY
// ============================================================
echo "============================\n";
echo "DIAGNOSTIC SUMMARY\n";
echo "============================\n";
echo "Mixed liquid/powder groups: " . count($mixed_groups) . "\n";
echo "Price anomalies: " . count($price_anomalies) . "\n";
echo "Parents with misleading weight: {$parents_with_weight}\n";
echo "Missing images: {$no_image_count}\n";
echo "Missing descriptions: " . count($no_desc) . "\n";
echo "Children with \$0 price: " . count($bad_price_children) . "\n";
echo "Oddly shaped images: {$odd_count}\n";
echo "============================\n";
