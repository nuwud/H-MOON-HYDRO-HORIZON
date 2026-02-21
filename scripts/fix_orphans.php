<?php
/**
 * fix_orphans.php — Aggressive orphan-to-parent matcher for H-Moon Hydro
 * 
 * Phase 1: Link orphans with size variants to existing grouped parents
 * Phase 2: Create NEW grouped parents for orphan families (multiple sizes, no parent)
 * Phase 3: Hide all linked children from catalog (proper WooCommerce behavior)
 * 
 * Usage:
 *   php wp-content/fix_orphans.php              # Dry-run (safe, shows what it would do)
 *   php wp-content/fix_orphans.php --confirm     # Live run (makes changes)
 */

require_once(dirname(__FILE__) . '/../wp-load.php');
wp_set_current_user(1);

$dry_run = !in_array('--confirm', $argv ?? []);
echo $dry_run ? "=== DRY RUN MODE (use --confirm to apply) ===\n\n" : "=== LIVE RUN — MAKING CHANGES ===\n\n";

// ============================================================
// SIZE PATTERN DETECTION
// ============================================================

/**
 * Common hydroponic product size patterns.
 * Returns [base_name, size_label] or false.
 */
function extract_size($title) {
    $patterns = [
        // Volume with units - capture size, rest is base
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:Lt|Ltr?|Liter|Litre|L))\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:Lt|Ltr?|Liter|Litre|L))\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:ml|mL|ML|Milliliter))\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:ml|mL|ML|Milliliter))\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:Gal|Gallon|gal)\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:Gal|Gallon|gal)\.?)\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:qt|Quart|quart)\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:qt|Quart|quart)\.?)\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:Pint|pint|pt)\.?)\s*$/i',
        
        // Weight
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:lb|lbs|pound|Pound)s?\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:lb|lbs|pound|Pound)s?\.?)\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:oz|OZ|Oz|ounce|Ounce)\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:oz|OZ|Oz|ounce|Ounce)\.?)\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:g|gm|gms|gram|Gram)s?\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:g|gm|gms|gram|Gram)s?\.?)\s*$/i',
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:kg|KG|Kg|Kilo)s?\.?)\s*$/i',
        
        // Container sizes
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:cu\.?\s*ft|cubic\s*f(?:oo|ee)t)\.?)\s*$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:cu\.?\s*ft|cubic\s*f(?:oo|ee)t)\.?)\s*$/i',
        
        // Count-based
        '/^(.+?)\s*[-–]\s*(\d+\s*(?:ct|count|pack|pk|pcs|pieces)\.?)\s*$/i',
        '/^(.+?)\s+(\d+\s*(?:ct|count|pack|pk|pcs|pieces)\.?)\s*$/i',
        
        // Foot/length (for mylar rolls, ducting)
        '/^(.+?)\s*[-–]\s*(\d+(?:\.\d+)?\s*(?:ft|foot|feet|\')\s*(?:x\s*\d+.*)?)$/i',
        '/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:ft|foot|feet|\')\s*(?:x\s*\d+.*)?)$/i',
        
        // Parenthesized sizes: "Product Name (1 Lt)"
        '/^(.+?)\s*\((\d+(?:\.\d+)?\s*(?:Lt|L|ml|Gal|qt|oz|lb|lbs|g|kg|ft|ct)\.?)\)\s*$/i',
        
        // Watt for bulbs: "1000 Watt", "600W"
        '/^(.+?)\s*[-–]\s*(\d+\s*(?:W|Watt|watt)s?)\s*$/i',
        '/^(.+?)\s+(\d+\s*(?:W|Watt|watt)s?)\s*$/i',
        
        // "Single" / "Double" / size words
        '/^(.+?)\s*[-–]\s*(Small|Medium|Large|XL|XXL|Single|Double|Triple)\s*$/i',
    ];
    
    foreach ($patterns as $pat) {
        if (preg_match($pat, $title, $m)) {
            $base = trim($m[1]);
            $size = trim($m[2]);
            // Don't match if base is too short (likely a false positive)
            if (strlen($base) < 4) continue;
            return [$base, $size];
        }
    }
    
    return false;
}

/**
 * Normalize a title for comparison: lowercase, strip NPK ratios, trim whitespace.
 */
function normalize_for_match($title) {
    $t = strtolower(trim($title));
    // Remove ® ™ symbols
    $t = str_replace(['®', '™', '©'], '', $t);
    // Remove NPK ratios like "3-2-6" or "0.5-7-6"
    $t = preg_replace('/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/', '', $t);
    // Collapse multiple spaces
    $t = preg_replace('/\s+/', ' ', $t);
    return trim($t);
}

/**
 * Score how well an orphan's base name matches a parent title.
 * Returns 0.0 - 1.0
 */
function match_score($orphan_base, $parent_title) {
    $ob = normalize_for_match($orphan_base);
    $pt = normalize_for_match($parent_title);
    
    if (empty($ob) || empty($pt)) return 0;
    
    // Exact match
    if ($ob === $pt) return 1.0;
    
    // One contains the other
    if (strpos($pt, $ob) !== false) {
        return 0.9 * (strlen($ob) / strlen($pt));
    }
    if (strpos($ob, $pt) !== false) {
        return 0.9 * (strlen($pt) / strlen($ob));
    }
    
    // Word-level overlap — stricter matching
    // Remove common filler words that shouldn't count
    $fillers = ['the','a','an','and','or','for','of','in','by','with','&','-','to','part'];
    $ob_words = array_diff(array_filter(explode(' ', $ob), fn($w) => strlen($w) > 1), $fillers);
    $pt_words = array_diff(array_filter(explode(' ', $pt), fn($w) => strlen($w) > 1), $fillers);
    
    if (empty($ob_words) || empty($pt_words)) return 0;
    
    $common = count(array_intersect($ob_words, $pt_words));
    $ob_only = count(array_diff($ob_words, $pt_words));
    $pt_only = count(array_diff($pt_words, $ob_words));
    
    // If the orphan has product-specific words NOT in parent, penalize heavily
    // e.g., "bloom" vs "root", "ignitor" vs "candy" — these are different products
    $max_words = max(count($ob_words), count($pt_words));
    $score = $common / $max_words;
    
    // Penalty for mismatched significant words (not just missing, but DIFFERENT)
    if ($ob_only > 0 && $pt_only > 0) {
        $score *= 0.7; // Both have unique words = likely different products
    }
    
    return $score;
}

/**
 * Get the primary category for a product
 */
function get_primary_cat($product_id) {
    $cats = wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']);
    if ($cats && !is_wp_error($cats)) {
        return $cats[0];
    }
    return '';
}

// ============================================================
// LOAD DATA
// ============================================================

echo "Loading products...\n";

// Load grouped parents
$grouped = get_posts([
    'post_type' => 'product',
    'posts_per_page' => -1,
    'tax_query' => [[
        'taxonomy' => 'product_type',
        'field' => 'slug',
        'terms' => 'grouped'
    ]]
]);

$parents = [];
$all_children_ids = [];
foreach ($grouped as $g) {
    $children = get_post_meta($g->ID, '_children', true);
    $child_ids = ($children && is_array($children)) ? $children : [];
    $all_children_ids = array_merge($all_children_ids, $child_ids);
    $parents[$g->ID] = [
        'title' => $g->post_title,
        'children' => $child_ids,
        'cat' => get_primary_cat($g->ID),
    ];
}
$all_children_ids = array_unique($all_children_ids);

// Load simple products that are NOT already children
$simple = get_posts([
    'post_type' => 'product',
    'posts_per_page' => -1,
    'tax_query' => [[
        'taxonomy' => 'product_type',
        'field' => 'slug',
        'terms' => 'simple'
    ]]
]);

$orphans = [];
foreach ($simple as $s) {
    if (!in_array($s->ID, $all_children_ids)) {
        $orphans[$s->ID] = [
            'title' => $s->post_title,
            'cat' => get_primary_cat($s->ID),
            'sku' => get_post_meta($s->ID, '_sku', true),
        ];
    }
}

echo "Found " . count($parents) . " grouped parents, " . count($orphans) . " orphans\n\n";

// ============================================================
// PHASE 1: Match orphans with sizes to existing parents
// ============================================================

echo "=== PHASE 1: MATCH ORPHANS TO EXISTING PARENTS ===\n\n";

$phase1_matches = [];  // orphan_id => parent_id
$size_orphans = [];     // orphans with detected sizes
$no_match_sized = [];   // have size but no parent match

foreach ($orphans as $oid => $o) {
    $extracted = extract_size($o['title']);
    if (!$extracted) continue;
    
    list($base_name, $size) = $extracted;
    $size_orphans[$oid] = ['base' => $base_name, 'size' => $size];
    
    // Find best matching parent
    $best_parent = null;
    $best_score = 0;
    
    foreach ($parents as $pid => $p) {
        $score = match_score($base_name, $p['title']);
        
        // Bonus for same category
        if ($o['cat'] === $p['cat'] && !empty($o['cat'])) {
            $score += 0.15;
        }
        
        if ($score > $best_score) {
            $best_score = $score;
            $best_parent = $pid;
        }
    }
    
    // Tighter thresholds to prevent false positives like
    // "Bud Ignitor" → "Bud Candy" or "Big Bloom" → "Tiger Bloom"
    $threshold = ($best_parent && $o['cat'] === $parents[$best_parent]['cat']) ? 0.70 : 0.80;
    
    if ($best_parent && $best_score >= $threshold) {
        $phase1_matches[$oid] = $best_parent;
        echo "  MATCH: \"{$o['title']}\" (size: {$size})\n";
        echo "      → PARENT: \"{$parents[$best_parent]['title']}\" (score: " . round($best_score, 2) . ")\n";
        echo "      orphan cat: {$o['cat']} | parent cat: {$parents[$best_parent]['cat']}\n\n";
    } else {
        $no_match_sized[$oid] = $size_orphans[$oid];
    }
}

echo "Phase 1 results: " . count($phase1_matches) . " orphans matched to existing parents\n";
echo "Sized orphans with no parent match: " . count($no_match_sized) . "\n\n";

// ============================================================
// PHASE 2: Group orphans that share base names → NEW parents
// ============================================================

echo "=== PHASE 2: CREATE NEW GROUPED PARENTS FROM ORPHAN FAMILIES ===\n\n";

// Group the unmatched sized orphans by base name
$families = [];
foreach ($no_match_sized as $oid => $info) {
    $key = normalize_for_match($info['base']);
    if (!isset($families[$key])) {
        $families[$key] = [
            'display_name' => $info['base'],
            'members' => [],
            'cat' => $orphans[$oid]['cat'],
        ];
    }
    $families[$key]['members'][$oid] = [
        'title' => $orphans[$oid]['title'],
        'size' => $info['size'],
        'sku' => $orphans[$oid]['sku'],
    ];
}

// Only create new parents for families with 2+ members (those are real size groups)
$new_parents = [];
foreach ($families as $key => $fam) {
    if (count($fam['members']) >= 2) {
        $new_parents[$key] = $fam;
        echo "  NEW PARENT: \"{$fam['display_name']}\" ({$fam['cat']})\n";
        foreach ($fam['members'] as $mid => $m) {
            echo "      child: \"{$m['title']}\" (size: {$m['size']}, SKU: {$m['sku']})\n";
        }
        echo "\n";
    }
}

echo "Phase 2 results: " . count($new_parents) . " new grouped parents to create\n";
$new_children_count = 0;
foreach ($new_parents as $np) {
    $new_children_count += count($np['members']);
}
echo "Total children for new parents: {$new_children_count}\n\n";

// ============================================================
// APPLY CHANGES
// ============================================================

if ($dry_run) {
    echo "=== DRY RUN COMPLETE — No changes made ===\n";
    echo "Run with --confirm to apply:\n";
    echo "  Phase 1: Link " . count($phase1_matches) . " orphans to existing parents\n";
    echo "  Phase 2: Create " . count($new_parents) . " new grouped parents with {$new_children_count} children\n";
    echo "  Phase 3: Hide all linked children from catalog\n";
    exit(0);
}

// --- PHASE 1 APPLY ---
echo "=== APPLYING PHASE 1: Linking to existing parents ===\n";
$linked_count = 0;
foreach ($phase1_matches as $orphan_id => $parent_id) {
    $existing = get_post_meta($parent_id, '_children', true);
    if (!is_array($existing)) $existing = [];
    
    if (!in_array($orphan_id, $existing)) {
        $existing[] = $orphan_id;
        update_post_meta($parent_id, '_children', $existing);
        $linked_count++;
        echo "  Linked #{$orphan_id} \"{$orphans[$orphan_id]['title']}\" → parent #{$parent_id}\n";
    }
}
echo "Phase 1 complete: {$linked_count} orphans linked\n\n";

// --- PHASE 2 APPLY ---
echo "=== APPLYING PHASE 2: Creating new grouped parents ===\n";
$created_parents = 0;
$created_children = 0;

foreach ($new_parents as $key => $fam) {
    // Create the grouped parent product
    $parent_post = [
        'post_title' => $fam['display_name'],
        'post_status' => 'publish',
        'post_type' => 'product',
    ];
    $parent_id = wp_insert_post($parent_post);
    
    if (is_wp_error($parent_id)) {
        echo "  ERROR creating parent \"{$fam['display_name']}\": " . $parent_id->get_error_message() . "\n";
        continue;
    }
    
    // Set product type to grouped
    wp_set_object_terms($parent_id, 'grouped', 'product_type');
    
    // Set same category as children
    if (!empty($fam['cat'])) {
        $cat_term = get_term_by('name', $fam['cat'], 'product_cat');
        if ($cat_term) {
            wp_set_object_terms($parent_id, [$cat_term->term_id], 'product_cat');
        }
    }
    
    // Set visibility to visible (parent should be visible)
    update_post_meta($parent_id, '_visibility', 'visible');
    
    // Link children
    $child_ids = array_keys($fam['members']);
    update_post_meta($parent_id, '_children', $child_ids);
    
    $created_parents++;
    $created_children += count($child_ids);
    echo "  Created parent #{$parent_id} \"{$fam['display_name']}\" with " . count($child_ids) . " children\n";
}
echo "Phase 2 complete: {$created_parents} parents created, {$created_children} children linked\n\n";

// --- PHASE 3 APPLY ---
echo "=== APPLYING PHASE 3: Hiding linked children from catalog ===\n";

// Collect ALL children that should be hidden (Phase 1 + Phase 2)
$all_to_hide = array_keys($phase1_matches);
foreach ($new_parents as $fam) {
    $all_to_hide = array_merge($all_to_hide, array_keys($fam['members']));
}
$all_to_hide = array_unique($all_to_hide);

$hidden_count = 0;
foreach ($all_to_hide as $child_id) {
    // Add visibility terms to hide from catalog and search
    $existing_vis = get_the_terms($child_id, 'product_visibility');
    $has_exclude_catalog = false;
    $has_exclude_search = false;
    
    if ($existing_vis && !is_wp_error($existing_vis)) {
        foreach ($existing_vis as $v) {
            if ($v->slug === 'exclude-from-catalog') $has_exclude_catalog = true;
            if ($v->slug === 'exclude-from-search') $has_exclude_search = true;
        }
    }
    
    $terms_to_add = [];
    if (!$has_exclude_catalog) $terms_to_add[] = 'exclude-from-catalog';
    if (!$has_exclude_search) $terms_to_add[] = 'exclude-from-search';
    
    if (!empty($terms_to_add)) {
        wp_set_object_terms($child_id, $terms_to_add, 'product_visibility', true);
        $hidden_count++;
    }
}
echo "Phase 3 complete: {$hidden_count} children hidden from catalog\n\n";

echo "=== ALL PHASES COMPLETE ===\n";
echo "Summary:\n";
echo "  Phase 1: {$linked_count} orphans linked to existing parents\n";
echo "  Phase 2: {$created_parents} new parents created, {$created_children} children linked\n";
echo "  Phase 3: {$hidden_count} children hidden from catalog\n";
echo "\nRemaining truly standalone orphans: " . (count($orphans) - count($phase1_matches) - $new_children_count) . "\n";
