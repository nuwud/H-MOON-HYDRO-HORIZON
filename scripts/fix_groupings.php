<?php
/**
 * fix_groupings.php — Comprehensive grouped product quality fix
 * 
 * Fixes found by grouping_audit.php:
 * - Self-referencing parents (parent is child of itself)
 * - Duplicate parents sharing same children
 * - Mixed product lines under one parent (SiLICIUM, ONA Gel, etc.)
 * - Accessories wrongly grouped as variants (batteries, filters, probes)
 * - Grow/Bloom formulas mixed under one parent
 * - pH/Calibration catch-all with 16 disparate items
 * - Single-child parents (unnecessary grouping wrappers)
 * 
 * Usage:
 *   wp eval-file wp-content/fix_groupings.php          # DRY RUN
 *   CONFIRM=1 wp eval-file wp-content/fix_groupings.php # LIVE
 */

wp_set_current_user(1);
global $wpdb;

$dry_run = !getenv('CONFIRM');
$fixes = 0;
$new_parents = 0;
$trashed = 0;

echo "================================================\n";
echo "  GROUPED PRODUCT QUALITY FIX\n";
echo "  Mode: " . ($dry_run ? "DRY RUN (use CONFIRM=1 to apply)" : "*** LIVE ***") . "\n";
echo "================================================\n\n";

// ============================================================
// HELPERS
// ============================================================

function create_grouped_parent($name, $child_ids, $dry_run, $copy_cat_from = 0) {
    global $wpdb, $new_parents;
    
    if (empty($child_ids)) return 0;
    
    if ($dry_run) {
        $titles = [];
        foreach ($child_ids as $cid) $titles[] = "#$cid " . get_the_title($cid);
        echo "  [DRY] Would create parent '$name' with " . count($child_ids) . " children:\n";
        foreach ($titles as $t) echo "    - $t\n";
        $new_parents++;
        return 0;
    }
    
    $parent_id = wp_insert_post([
        'post_title'  => $name,
        'post_type'   => 'product',
        'post_status' => 'publish',
    ]);
    
    if (is_wp_error($parent_id)) {
        echo "  ERROR creating '$name': " . $parent_id->get_error_message() . "\n";
        return 0;
    }
    
    wp_set_object_terms($parent_id, 'grouped', 'product_type');
    update_post_meta($parent_id, '_children', array_values($child_ids));
    
    // Copy categories from a reference product
    if ($copy_cat_from > 0) {
        $cats = wp_get_object_terms($copy_cat_from, 'product_cat', ['fields' => 'ids']);
        if (!is_wp_error($cats) && !empty($cats)) {
            wp_set_object_terms($parent_id, $cats, 'product_cat');
        }
    } elseif (!empty($child_ids)) {
        $cats = wp_get_object_terms($child_ids[0], 'product_cat', ['fields' => 'ids']);
        if (!is_wp_error($cats) && !empty($cats)) {
            wp_set_object_terms($parent_id, $cats, 'product_cat');
        }
    }
    
    // Hide children
    foreach ($child_ids as $cid) {
        wp_set_object_terms($cid, ['exclude-from-catalog', 'exclude-from-search'], 'product_visibility');
    }
    
    $new_parents++;
    echo "  CREATED: '$name' (#$parent_id) with " . count($child_ids) . " children\n";
    return $parent_id;
}

function remove_children_from_parent($parent_id, $remove_ids, $dry_run) {
    $children = get_post_meta($parent_id, '_children', true);
    if (!is_array($children)) return;
    
    $new_children = array_values(array_diff($children, $remove_ids));
    
    if ($dry_run) {
        echo "  [DRY] Remove " . count($remove_ids) . " children from #$parent_id\n";
        return;
    }
    
    update_post_meta($parent_id, '_children', $new_children);
    
    // Check if removed children are still in another group before making visible
    foreach ($remove_ids as $rid) {
        $still_grouped = $GLOBALS['wpdb']->get_var($GLOBALS['wpdb']->prepare(
            "SELECT COUNT(*) FROM {$GLOBALS['wpdb']->postmeta} 
             WHERE meta_key = '_children' AND meta_value LIKE %s AND post_id != %d",
            '%' . serialize(strval($rid)) . '%',
            $parent_id
        ));
        // Also check integer serialization
        if (!$still_grouped) {
            $still_grouped = $GLOBALS['wpdb']->get_var($GLOBALS['wpdb']->prepare(
                "SELECT COUNT(*) FROM {$GLOBALS['wpdb']->postmeta} 
                 WHERE meta_key = '_children' AND meta_value LIKE %s AND post_id != %d",
                '%i:' . intval($rid) . ';%',
                $parent_id
            ));
        }
        if (!$still_grouped) {
            wp_delete_object_term_relationships($rid, 'product_visibility');
        }
    }
}

function make_standalone($product_id, $dry_run) {
    if ($dry_run) {
        echo "  [DRY] Make #$product_id standalone (visible)\n";
        return;
    }
    wp_delete_object_term_relationships($product_id, 'product_visibility');
}

// ============================================================
// PHASE 1: Remove self-referencing children
// ============================================================
echo "--- PHASE 1: Self-referencing products ---\n";

$all_grouped = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    WHERE t.slug = 'grouped' AND p.post_status = 'publish'
");

$self_ref_count = 0;
foreach ($all_grouped as $parent) {
    $children = get_post_meta($parent->ID, '_children', true);
    if (is_array($children) && in_array($parent->ID, $children)) {
        $new_children = array_values(array_diff($children, [$parent->ID]));
        if (!$dry_run) {
            update_post_meta($parent->ID, '_children', $new_children);
        }
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #$parent->ID '$parent->post_title' — removed self from children\n";
        $self_ref_count++;
        $fixes++;
    }
}
echo "Self-references: $self_ref_count found/fixed\n\n";

// ============================================================
// PHASE 2: Duplicate Clonex Root Maximizer parents
// ============================================================
echo "--- PHASE 2: Duplicate parents ---\n";

$keep_id = 73101;
$dup_id = 73102;
$keep_children = get_post_meta($keep_id, '_children', true);
$dup_children = get_post_meta($dup_id, '_children', true);

if (is_array($keep_children) && is_array($dup_children)) {
    $merged = array_values(array_unique(array_merge($keep_children, $dup_children)));
    
    if (!$dry_run) {
        update_post_meta($keep_id, '_children', $merged);
        wp_update_post(['ID' => $dup_id, 'post_status' => 'trash']);
    }
    echo ($dry_run ? "[DRY]" : "FIXED") . " Clonex Root Maximizer: merged #$dup_id into #$keep_id, trashed duplicate\n";
    $fixes++;
    $trashed++;
} else {
    echo "  Clonex entries not found or already fixed\n";
}
echo "\n";

// ============================================================
// PHASE 3: Split SiLICIUM #73105 into 3 product lines
// ============================================================
echo "--- PHASE 3: Split SiLICIUM #73105 ---\n";

$sil_parent = 73105;
$sil_children = get_post_meta($sil_parent, '_children', true);
if (is_array($sil_children) && count($sil_children) > 3) {
    $regular = [];
    $bloom = [];
    $mono = [];
    
    foreach ($sil_children as $cid) {
        $title = strtolower(get_the_title($cid));
        if (strpos($title, 'mono si') !== false || strpos($title, 'mono_si') !== false) {
            $mono[] = $cid;
        } elseif (strpos($title, 'bloom') !== false) {
            $bloom[] = $cid;
        } else {
            $regular[] = $cid;
        }
    }
    
    echo "  Regular: " . count($regular) . " | Bloom: " . count($bloom) . " | mono si: " . count($mono) . "\n";
    
    // Keep #73105 as regular SiLICIUM
    if (!$dry_run) {
        update_post_meta($sil_parent, '_children', array_values($regular));
    }
    echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #$sil_parent now has only regular SiLICIUM\n";
    
    if (count($bloom) > 0) {
        create_grouped_parent('SiLICIUM Bloom', $bloom, $dry_run, $sil_parent);
    }
    if (count($mono) > 0) {
        create_grouped_parent('SiLICIUM mono si', $mono, $dry_run, $sil_parent);
    }
    $fixes++;
} else {
    echo "  SiLICIUM already fixed or not found\n";
}
echo "\n";

// ============================================================
// PHASE 4: Split ONA Gel #72934 by scent
// ============================================================
echo "--- PHASE 4: Split ONA Gel #72934 ---\n";

$ona_parent = 72934;
$ona_children = get_post_meta($ona_parent, '_children', true);
if (is_array($ona_children) && count($ona_children) > 2) {
    $fresh_linen = [];
    $pro = [];
    
    foreach ($ona_children as $cid) {
        $title = strtolower(get_the_title($cid));
        if (strpos($title, 'pro') !== false) {
            $pro[] = $cid;
        } else {
            $fresh_linen[] = $cid;  // Default to Fresh Linen
        }
    }
    
    echo "  Fresh Linen: " . count($fresh_linen) . " | Pro: " . count($pro) . "\n";
    
    if (count($pro) > 0 && count($fresh_linen) > 0) {
        // Keep #72934 as Fresh Linen
        if (!$dry_run) {
            update_post_meta($ona_parent, '_children', array_values($fresh_linen));
            wp_update_post(['ID' => $ona_parent, 'post_title' => 'ONA Gel Fresh Linen']);
        }
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #$ona_parent → ONA Gel Fresh Linen\n";
        
        create_grouped_parent('ONA Gel Pro', $pro, $dry_run, $ona_parent);
        $fixes++;
    }
} else {
    echo "  ONA Gel already fixed or not found\n";
}
echo "\n";

// ============================================================
// PHASE 5: Remove accessories from meter groups
// ============================================================
echo "--- PHASE 5: Remove accessories ---\n";

// Batteries #72243 from all meter parents
$battery_id = 72243;
$meter_parents = [72951, 72952, 72950]; // COM-100, PH-200, TDS-3
foreach ($meter_parents as $pid) {
    $children = get_post_meta($pid, '_children', true);
    if (is_array($children) && in_array($battery_id, $children)) {
        remove_children_from_parent($pid, [$battery_id], $dry_run);
        $title = get_the_title($pid);
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " Removed batteries from #$pid '$title'\n";
        $fixes++;
    }
}

// Make batteries visible as standalone
make_standalone($battery_id, $dry_run);

// Mag Drive Pump #72946 — remove filter #72172
$mag_children = get_post_meta(72946, '_children', true);
if (is_array($mag_children)) {
    $filters = [];
    foreach ($mag_children as $cid) {
        if (stripos(get_the_title($cid), 'filter') !== false) {
            $filters[] = $cid;
        }
    }
    if (!empty($filters)) {
        remove_children_from_parent(72946, $filters, $dry_run);
        foreach ($filters as $f) make_standalone($f, $dry_run);
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " Removed " . count($filters) . " filter(s) from Mag Drive #72946\n";
        $fixes++;
    }
}

// Control Wizard pH3 #72954 — remove replacement probe
$ctrl_children = get_post_meta(72954, '_children', true);
if (is_array($ctrl_children)) {
    $probes = [];
    foreach ($ctrl_children as $cid) {
        $t = strtolower(get_the_title($cid));
        if (strpos($t, 'replacement') !== false || strpos($t, 'probe') !== false) {
            $probes[] = $cid;
        }
    }
    if (!empty($probes)) {
        remove_children_from_parent(72954, $probes, $dry_run);
        foreach ($probes as $p) make_standalone($p, $dry_run);
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " Removed probe from Control Wizard #72954\n";
        $fixes++;
    }
}

// TNC Water Pump #72945 — remove filter
$tnc_children = get_post_meta(72945, '_children', true);
if (is_array($tnc_children)) {
    $filters = [];
    foreach ($tnc_children as $cid) {
        if (stripos(get_the_title($cid), 'filter') !== false) {
            $filters[] = $cid;
        }
    }
    if (!empty($filters)) {
        remove_children_from_parent(72945, $filters, $dry_run);
        foreach ($filters as $f) make_standalone($f, $dry_run);
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " Removed filter from TNC Pump #72945\n";
        $fixes++;
    }
}
echo "\n";

// ============================================================
// PHASE 6: Split Grow/Bloom mixed groups
// ============================================================
echo "--- PHASE 6: Split Grow/Bloom mixes ---\n";

$grow_bloom_splits = [
    73002 => 'Mother Earth Organic Super Tea',
    73090 => 'Plagron Terra Bloom & Grow',
    73089 => 'Hydrodynamics int. Coco/Soil Grow & Bloom',
];

foreach ($grow_bloom_splits as $parent_id => $original_name) {
    $children = get_post_meta($parent_id, '_children', true);
    if (!is_array($children) || count($children) < 2) continue;
    
    $grow = [];
    $bloom = [];
    $other = [];
    
    foreach ($children as $cid) {
        $title = strtolower(get_the_title($cid));
        if (strpos($title, 'grow') !== false) {
            $grow[] = $cid;
        } elseif (strpos($title, 'bloom') !== false) {
            $bloom[] = $cid;
        } else {
            $other[] = $cid;
        }
    }
    
    if (count($grow) > 0 && count($bloom) > 0) {
        echo "  #$parent_id: Grow=" . count($grow) . " Bloom=" . count($bloom) . " Other=" . count($other) . "\n";
        
        // Keep parent as Grow, rename
        $grow_name = preg_replace('/\s*(Bloom\s*&?\s*|&\s*Bloom)/i', '', $original_name);
        $grow_name = preg_replace('/\s*(Grow\s*&?\s*|&\s*Grow)/i', '', $grow_name);
        $grow_name = trim($grow_name) . ' Grow';
        
        if (!$dry_run) {
            update_post_meta($parent_id, '_children', array_values(array_merge($grow, $other)));
            wp_update_post(['ID' => $parent_id, 'post_title' => $grow_name]);
        }
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #$parent_id → '$grow_name'\n";
        
        // Create Bloom parent
        $bloom_name = preg_replace('/\s*(Bloom\s*&?\s*|&\s*Bloom)/i', '', $original_name);
        $bloom_name = preg_replace('/\s*(Grow\s*&?\s*|&\s*Grow)/i', '', $bloom_name);
        $bloom_name = trim($bloom_name) . ' Bloom';
        
        create_grouped_parent($bloom_name, $bloom, $dry_run, $parent_id);
        $fixes++;
    }
}
echo "\n";

// ============================================================
// PHASE 7: Split Ed Rosenthal's Zero Tolerance #72938
// ============================================================
echo "--- PHASE 7: Split Ed Rosenthal's Zero Tolerance #72938 ---\n";

$zer_children = get_post_meta(72938, '_children', true);
if (is_array($zer_children) && count($zer_children) >= 2) {
    $fungicide = [];
    $pest = [];
    $other_zer = [];
    
    foreach ($zer_children as $cid) {
        $title = strtolower(get_the_title($cid));
        if (strpos($title, 'fungicide') !== false) {
            $fungicide[] = $cid;
        } elseif (strpos($title, 'pest') !== false) {
            $pest[] = $cid;
        } else {
            $other_zer[] = $cid;
        }
    }
    
    echo "  Fungicide: " . count($fungicide) . " | Pest: " . count($pest) . " | Other: " . count($other_zer) . "\n";
    
    if (count($fungicide) > 0 && count($pest) > 0) {
        // Keep parent as Fungicide
        if (!$dry_run) {
            update_post_meta(72938, '_children', array_values($fungicide));
            wp_update_post(['ID' => 72938, 'post_title' => "Ed Rosenthal's Zero Tolerance Herbal Fungicide"]);
        }
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #72938 → Fungicide only\n";
        
        create_grouped_parent("Ed Rosenthal's Zero Tolerance Pest Control", array_merge($pest, $other_zer), $dry_run, 72938);
        $fixes++;
    }
} else {
    echo "  Already fixed or not found\n";
}
echo "\n";

// ============================================================
// PHASE 8: Reorganize pH/Calibration #72953 (16 items)
// ============================================================
echo "--- PHASE 8: Split pH/Calibration #72953 ---\n";

$ph_children = get_post_meta(72953, '_children', true);
if (is_array($ph_children) && count($ph_children) > 6) {
    $ph_up = [];
    $ph_down = [];
    $calibration = [];
    $test = [];
    $other_ph = [];
    
    foreach ($ph_children as $cid) {
        $title = strtolower(get_the_title($cid));
        if (strpos($title, 'ph up') !== false || strpos($title, 'ph-up') !== false || strpos($title, 'ph+') !== false) {
            $ph_up[] = $cid;
        } elseif (strpos($title, 'ph down') !== false || strpos($title, 'ph-down') !== false) {
            $ph_down[] = $cid;
        } elseif (strpos($title, 'calibrat') !== false || strpos($title, 'ppm') !== false || strpos($title, 'buffer') !== false || strpos($title, 'storage') !== false) {
            $calibration[] = $cid;
        } elseif (strpos($title, 'test') !== false || strpos($title, 'indicator') !== false || strpos($title, 'kit') !== false) {
            $test[] = $cid;
        } else {
            $other_ph[] = $cid;
        }
    }
    
    echo "  pH Up: " . count($ph_up) . "\n";
    echo "  pH Down: " . count($ph_down) . "\n";
    echo "  Calibration: " . count($calibration) . "\n";
    echo "  Test: " . count($test) . "\n";
    echo "  Other: " . count($other_ph) . "\n";
    
    // Keep parent for pH Up (largest or simplest group)
    if (count($ph_up) > 0) {
        if (!$dry_run) {
            update_post_meta(72953, '_children', array_values($ph_up));
            wp_update_post(['ID' => 72953, 'post_title' => 'General Hydroponics pH Up']);
        }
        echo "  " . ($dry_run ? "[DRY]" : "FIXED") . " #72953 → 'General Hydroponics pH Up'\n";
    }
    
    if (count($ph_down) > 0) {
        create_grouped_parent('General Hydroponics pH Down', $ph_down, $dry_run, 72953);
    }
    if (count($calibration) > 0) {
        create_grouped_parent('pH & TDS Calibration Solutions', $calibration, $dry_run, 72953);
    }
    if (count($test) > 0) {
        create_grouped_parent('pH Test Kits', $test, $dry_run, 72953);
    }
    if (count($other_ph) > 0) {
        // Add other items to calibration parent or make standalone
        foreach ($other_ph as $op) make_standalone($op, $dry_run);
    }
    $fixes++;
} else {
    echo "  Already fixed or not found\n";
}
echo "\n";

// ============================================================
// PHASE 9: Trash single-child grouped parents
// ============================================================
echo "--- PHASE 9: Single-child parents ---\n";

// Re-query grouped products after Phase 1-8 changes
$all_grouped_refresh = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    WHERE t.slug = 'grouped' AND p.post_status = 'publish'
");

$single_count = 0;
$zero_count = 0;
foreach ($all_grouped_refresh as $parent) {
    $children = get_post_meta($parent->ID, '_children', true);
    
    // Zero children — trash parent
    if (!is_array($children) || count($children) == 0) {
        echo "  EMPTY: #$parent->ID '$parent->post_title' — 0 children\n";
        if (!$dry_run) {
            wp_update_post(['ID' => $parent->ID, 'post_status' => 'trash']);
        }
        $zero_count++;
        $trashed++;
        $fixes++;
        continue;
    }
    
    // One child — trash parent, make child visible
    if (count($children) == 1) {
        $child_id = $children[0];
        $child_title = get_the_title($child_id);
        echo "  SINGLE: #$parent->ID '$parent->post_title' → child #$child_id '$child_title'\n";
        
        if (!$dry_run) {
            // Copy parent's description/image to child if child lacks them
            $parent_desc = get_post_field('post_content', $parent->ID);
            $child_desc = get_post_field('post_content', $child_id);
            if (!empty($parent_desc) && empty($child_desc)) {
                wp_update_post(['ID' => $child_id, 'post_content' => $parent_desc]);
            }
            
            $parent_thumb = get_post_thumbnail_id($parent->ID);
            $child_thumb = get_post_thumbnail_id($child_id);
            if ($parent_thumb && !$child_thumb) {
                set_post_thumbnail($child_id, $parent_thumb);
            }
            
            // Copy categories
            $parent_cats = wp_get_object_terms($parent->ID, 'product_cat', ['fields' => 'ids']);
            if (!is_wp_error($parent_cats) && !empty($parent_cats)) {
                $child_cats = wp_get_object_terms($child_id, 'product_cat', ['fields' => 'ids']);
                $merged_cats = array_unique(array_merge(
                    is_wp_error($child_cats) ? [] : $child_cats,
                    $parent_cats
                ));
                wp_set_object_terms($child_id, $merged_cats, 'product_cat');
            }
            
            // Make child visible
            wp_delete_object_term_relationships($child_id, 'product_visibility');
            
            // Trash parent
            wp_update_post(['ID' => $parent->ID, 'post_status' => 'trash']);
        }
        $single_count++;
        $trashed++;
        $fixes++;
    }
}
echo "Empty parents trashed: $zero_count\n";
echo "Single-child parents dissolved: $single_count\n\n";

// ============================================================
// PHASE 10: Verify & report final state
// ============================================================
echo "--- PHASE 10: Final report ---\n";

// Count remaining grouped products
$remaining_grouped = $wpdb->get_var("
    SELECT COUNT(DISTINCT p.ID)
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    WHERE t.slug = 'grouped' AND p.post_status = 'publish'
");

$total_products = $wpdb->get_var("
    SELECT COUNT(*) FROM {$wpdb->posts} 
    WHERE post_type = 'product' AND post_status = 'publish'
");

echo "================================================\n";
echo "  SUMMARY\n";
echo "================================================\n";
echo "Total fixes applied: $fixes\n";
echo "New parents created: $new_parents\n";
echo "Parents trashed: $trashed\n";
echo "Remaining grouped products: $remaining_grouped\n";
echo "Total published products: $total_products\n";
echo "Mode: " . ($dry_run ? "DRY RUN — changes NOT saved" : "LIVE — all changes saved") . "\n";
echo "================================================\n";
