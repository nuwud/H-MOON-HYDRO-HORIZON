<?php
/**
 * Comprehensive Store Polish Script
 * 
 * Phase 1: Re-link grouped children using title matching (Dec 31 CSV)
 * Phase 2: Enrich descriptions and weights (Feb 12 CSV)
 * Phase 3: Convert empty grouped products to simple
 * Phase 4: Fix visibility for newly-linked children
 * 
 * Run: wp eval-file store_polish.php [--confirm]
 * Without --confirm, runs in DRY-RUN mode (safe preview)
 */
if (!defined('ABSPATH')) {
    // Allow running via wp eval-file
}

global $wpdb;
wp_set_current_user(1);

$dry_run = getenv('CONFIRM') !== 'yes';
$mode = $dry_run ? "DRY-RUN" : "LIVE";

echo "=== STORE POLISH SCRIPT ({$mode}) ===\n\n";

// CSV file paths on server
$dec31_csv = dirname(__FILE__) . '/Products-Export-2025-Dec-31-180709.csv';
$feb12_csv = dirname(__FILE__) . '/wc-product-export-12-2-2026.csv';

// =========================================================================
// PHASE 1: Re-link grouped children from Dec 31 export
// =========================================================================
echo "=== PHASE 1: FIX GROUPED CHILDREN ===\n\n";

if (!file_exists($dec31_csv)) {
    echo "WARNING: Dec 31 CSV not found at {$dec31_csv}\n";
    echo "  Upload it to continue. Skipping Phase 1.\n\n";
    $phase1_results = ['found' => 0, 'linked' => 0, 'already_linked' => 0, 'not_found' => 0];
} else {
    // Parse the Dec 31 CSV
    $dec31_data = [];
    if (($handle = fopen($dec31_csv, 'r')) !== false) {
        $headers = fgetcsv($handle);
        while (($row = fgetcsv($handle)) !== false) {
            $item = [];
            foreach ($headers as $i => $h) {
                $item[$h] = isset($row[$i]) ? $row[$i] : '';
            }
            $dec31_data[] = $item;
        }
        fclose($handle);
    }
    echo "Dec 31 CSV: " . count($dec31_data) . " rows loaded\n";

    // Build post_title -> post_id lookup from DB
    $all_products = $wpdb->get_results("
        SELECT p.ID, p.post_title, pm.meta_value as sku
        FROM {$wpdb->posts} p
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_sku'
        WHERE p.post_type = 'product' AND p.post_status = 'publish'
    ");

    $title_to_id = [];
    $title_normalized_to_id = [];
    $sku_to_id = [];
    foreach ($all_products as $p) {
        $title_to_id[$p->post_title] = $p->ID;
        $title_normalized_to_id[normalize_title($p->post_title)] = $p->ID;
        if ($p->sku) {
            $sku_to_id[$p->sku] = $p->ID;
        }
    }
    echo "DB products loaded: " . count($all_products) . "\n";

    // Get current grouped products and their existing children
    $grouped_products = $wpdb->get_results("
        SELECT p.ID, p.post_title, pm.meta_value as children_data, pm_sku.meta_value as sku
        FROM {$wpdb->posts} p
        JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
        JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
        LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
        WHERE p.post_type = 'product' AND p.post_status = 'publish'
        AND tt.taxonomy = 'product_type' AND t.name = 'grouped'
        ORDER BY p.post_title
    ");
    echo "Grouped products in DB: " . count($grouped_products) . "\n\n";

    // Build grouped product title -> CSV row mapping
    $csv_grouped = [];
    foreach ($dec31_data as $row) {
        if (strtolower(trim($row['Type'] ?? '')) === 'grouped') {
            $csv_grouped[trim($row['Product Name'])] = $row;
        }
    }

    $phase1_results = ['found' => 0, 'linked' => 0, 'already_linked' => 0, 'not_found' => 0];
    $children_to_hide = [];

    foreach ($grouped_products as $gp) {
        $existing_children = maybe_unserialize($gp->children_data);
        if (!is_array($existing_children)) $existing_children = [];

        // Find this grouped product in the CSV
        $csv_row = null;
        if (isset($csv_grouped[$gp->post_title])) {
            $csv_row = $csv_grouped[$gp->post_title];
        } else {
            // Try HTML-decoded match
            $decoded = html_entity_decode($gp->post_title, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if (isset($csv_grouped[$decoded])) {
                $csv_row = $csv_grouped[$decoded];
            } else {
                // Try normalized
                foreach ($csv_grouped as $csv_title => $csv_data) {
                    if (normalize_title($csv_title) === normalize_title($gp->post_title)) {
                        $csv_row = $csv_data;
                        break;
                    }
                }
            }
        }

        if (!$csv_row) {
            continue; // No CSV data for this grouped product
        }

        $children_raw = trim($csv_row['Grouped products'] ?? '');
        if (!$children_raw) continue;

        $child_names = array_filter(array_map('trim', explode('|~|', $children_raw)));
        if (empty($child_names)) continue;

        $new_children = $existing_children;
        $newly_linked = 0;

        foreach ($child_names as $child_name) {
            $child_id = find_product_id($child_name, $title_to_id, $title_normalized_to_id, $sku_to_id, $dec31_data);

            if ($child_id) {
                $phase1_results['found']++;
                if (!in_array($child_id, $new_children)) {
                    $new_children[] = (int) $child_id;
                    $children_to_hide[] = $child_id;
                    $newly_linked++;
                    $phase1_results['linked']++;
                } else {
                    $phase1_results['already_linked']++;
                }
            } else {
                $phase1_results['not_found']++;
            }
        }

        // Update if we found new children
        if ($newly_linked > 0) {
            echo "  [{$gp->ID}] {$gp->post_title}: +{$newly_linked} children (was " . count($existing_children) . ", now " . count($new_children) . ")\n";
            if (!$dry_run) {
                update_post_meta($gp->ID, '_children', $new_children);
            }
        }
    }

    echo "\nPhase 1 Results:\n";
    echo "  Children found in DB: {$phase1_results['found']}\n";
    echo "  Newly linked: {$phase1_results['linked']}\n";
    echo "  Already linked: {$phase1_results['already_linked']}\n";
    echo "  Not found in DB: {$phase1_results['not_found']}\n";

    // Hide newly-linked children
    if (!empty($children_to_hide)) {
        echo "\n  Hiding " . count($children_to_hide) . " newly-linked children from catalog...\n";
        $exclude_catalog_term = get_term_by('slug', 'exclude-from-catalog', 'product_visibility');
        $exclude_search_term = get_term_by('slug', 'exclude-from-search', 'product_visibility');

        if ($exclude_catalog_term && $exclude_search_term) {
            foreach ($children_to_hide as $child_id) {
                if (!$dry_run) {
                    wp_set_object_terms($child_id, [
                        $exclude_catalog_term->term_id,
                        $exclude_search_term->term_id
                    ], 'product_visibility', true);
                }
            }
            echo "  Done hiding children.\n";
        } else {
            echo "  ERROR: Could not find product_visibility terms!\n";
        }
    }
}

// =========================================================================
// PHASE 2: SMART ORPHAN MATCHING
// =========================================================================
echo "\n=== PHASE 2: SMART ORPHAN MATCHING ===\n\n";

// Get all grouped products and their categories
$grouped_with_cats = $wpdb->get_results("
    SELECT p.ID, p.post_title, cat_t.term_id as cat_id, cat_t.name as cat_name,
           pm.meta_value as children_data
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->term_relationships} tr2 ON p.ID = tr2.object_id
    JOIN {$wpdb->term_taxonomy} tt2 ON tr2.term_taxonomy_id = tt2.term_taxonomy_id
    JOIN {$wpdb->terms} cat_t ON tt2.term_id = cat_t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND tt.taxonomy = 'product_type' AND t.name = 'grouped'
    AND tt2.taxonomy = 'product_cat'
    ORDER BY cat_t.name, p.post_title
");

// Build a map: category -> [grouped products with their base names]
$cat_grouped = [];
foreach ($grouped_with_cats as $gp) {
    $base_name = extract_base_name($gp->post_title);
    if (!isset($cat_grouped[$gp->cat_id])) {
        $cat_grouped[$gp->cat_id] = [];
    }
    $cat_grouped[$gp->cat_id][] = [
        'id' => $gp->ID,
        'title' => $gp->post_title,
        'base_name' => $base_name,
        'cat_name' => $gp->cat_name,
        'children' => maybe_unserialize($gp->children_data) ?: [],
    ];
}

// Find visible simple products that match grouped parents by name similarity
$orphans_matched = 0;
$orphan_updates = []; // grouped_id => [child_ids to add]

// Get all visible simple products 
$visible_simples = $wpdb->get_results("
    SELECT p.ID, p.post_title, cat_t.term_id as cat_id
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->term_relationships} tr2 ON p.ID = tr2.object_id
    JOIN {$wpdb->term_taxonomy} tt2 ON tr2.term_taxonomy_id = tt2.term_taxonomy_id
    JOIN {$wpdb->terms} cat_t ON tt2.term_id = cat_t.term_id
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND tt.taxonomy = 'product_type' AND t.name = 'simple'
    AND tt2.taxonomy = 'product_cat'
    AND NOT EXISTS (
        SELECT 1 FROM {$wpdb->term_relationships} tr3 
        JOIN {$wpdb->term_taxonomy} tt3 ON tr3.term_taxonomy_id = tt3.term_taxonomy_id 
        JOIN {$wpdb->terms} t3 ON tt3.term_id = t3.term_id 
        WHERE tr3.object_id = p.ID AND t3.slug = 'exclude-from-catalog'
    )
");

foreach ($visible_simples as $vs) {
    if (!isset($cat_grouped[$vs->cat_id])) continue;

    foreach ($cat_grouped[$vs->cat_id] as $gp) {
        // Check if this simple product is already a child
        if (in_array($vs->ID, $gp['children'])) continue;

        // Name matching: does the simple product's title contain the grouped product's base name?
        if (title_matches_parent($vs->post_title, $gp['title'], $gp['base_name'])) {
            if (!isset($orphan_updates[$gp['id']])) {
                $orphan_updates[$gp['id']] = [
                    'title' => $gp['title'],
                    'existing' => $gp['children'],
                    'new' => [],
                ];
            }
            $orphan_updates[$gp['id']]['new'][] = [
                'id' => $vs->ID,
                'title' => $vs->post_title,
            ];
            $orphans_matched++;
            break; // Don't match to multiple parents
        }
    }
}

echo "Smart orphan matches: {$orphans_matched}\n\n";

$children_to_hide_phase2 = [];
foreach ($orphan_updates as $gp_id => $update) {
    $new_children = $update['existing'];
    echo "  [{$gp_id}] {$update['title']}:\n";
    foreach ($update['new'] as $child) {
        echo "    + [{$child['id']}] {$child['title']}\n";
        $new_children[] = (int) $child['id'];
        $children_to_hide_phase2[] = $child['id'];
    }
    
    if (!$dry_run) {
        update_post_meta($gp_id, '_children', $new_children);
    }
}

// Hide Phase 2 children
if (!empty($children_to_hide_phase2)) {
    echo "\n  Hiding " . count($children_to_hide_phase2) . " orphans matched to parents...\n";
    $exclude_catalog_term = get_term_by('slug', 'exclude-from-catalog', 'product_visibility');
    $exclude_search_term = get_term_by('slug', 'exclude-from-search', 'product_visibility');
    
    if ($exclude_catalog_term && $exclude_search_term) {
        foreach ($children_to_hide_phase2 as $child_id) {
            if (!$dry_run) {
                wp_set_object_terms($child_id, [
                    $exclude_catalog_term->term_id,
                    $exclude_search_term->term_id
                ], 'product_visibility', true);
            }
        }
    }
}

// =========================================================================
// PHASE 3: WEIGHT RECOVERY
// =========================================================================
echo "\n=== PHASE 3: WEIGHT RECOVERY ===\n\n";

// First try Dec 31 export weights
$weights_from_dec31 = 0;
$weights_from_feb12 = 0;

// Get products missing weights
$missing_weight = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_weight'
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
");
echo "Products missing weight: " . count($missing_weight) . "\n";

// Build lookups from Dec 31 data
$dec31_weights = [];
if (isset($dec31_data)) {
    foreach ($dec31_data as $row) {
        $w = trim($row['Weight'] ?? '');
        if ($w && $w !== '0') {
            $name = trim($row['Product Name'] ?? '');
            $sku = trim($row['Sku'] ?? '');
            if ($sku) $dec31_weights['sku:' . $sku] = $w;
            if ($name) {
                $dec31_weights['name:' . $name] = $w;
                $dec31_weights['norm:' . normalize_title($name)] = $w;
            }
        }
    }
}

// Build lookups from Feb 12 data
$feb12_weights = [];
$feb12_descriptions = [];
$feb12_short_descriptions = [];

if (file_exists($feb12_csv)) {
    $feb12_data = [];
    if (($handle = fopen($feb12_csv, 'r')) !== false) {
        $headers = fgetcsv($handle);
        while (($row = fgetcsv($handle)) !== false) {
            $item = [];
            foreach ($headers as $i => $h) {
                $item[$h] = isset($row[$i]) ? $row[$i] : '';
            }
            $feb12_data[] = $item;
        }
        fclose($handle);
    }
    echo "Feb 12 CSV: " . count($feb12_data) . " rows loaded\n";

    foreach ($feb12_data as $row) {
        $sku = trim($row['SKU'] ?? '');
        $name = trim($row['Name'] ?? '');
        $w = trim($row['Weight (lbs)'] ?? '');
        $desc = trim($row['Description'] ?? '');
        $short = trim($row['Short description'] ?? '');

        if ($w && $w !== '0') {
            if ($sku) $feb12_weights['sku:' . $sku] = $w;
            if ($name) {
                $feb12_weights['name:' . $name] = $w;
                $feb12_weights['norm:' . normalize_title($name)] = $w;
            }
        }
        if ($desc) {
            if ($sku) $feb12_descriptions['sku:' . $sku] = $desc;
            if ($name) {
                $feb12_descriptions['name:' . $name] = $desc;
                $feb12_descriptions['norm:' . normalize_title($name)] = $desc;
            }
        }
        if ($short) {
            if ($sku) $feb12_short_descriptions['sku:' . $sku] = $short;
            if ($name) {
                $feb12_short_descriptions['name:' . $name] = $short;
                $feb12_short_descriptions['norm:' . normalize_title($name)] = $short;
            }
        }
    }
} else {
    echo "WARNING: Feb 12 CSV not found at {$feb12_csv}\n";
}

// Apply weights
foreach ($missing_weight as $p) {
    $weight = null;
    
    // Try Dec 31 first (more authoritative)
    if ($p->sku && isset($dec31_weights['sku:' . $p->sku])) {
        $weight = $dec31_weights['sku:' . $p->sku];
        $source = 'dec31-sku';
    } elseif (isset($dec31_weights['name:' . $p->post_title])) {
        $weight = $dec31_weights['name:' . $p->post_title];
        $source = 'dec31-name';
    } elseif (isset($dec31_weights['norm:' . normalize_title($p->post_title)])) {
        $weight = $dec31_weights['norm:' . normalize_title($p->post_title)];
        $source = 'dec31-norm';
    }
    // Then try Feb 12
    elseif ($p->sku && isset($feb12_weights['sku:' . $p->sku])) {
        $weight = $feb12_weights['sku:' . $p->sku];
        $source = 'feb12-sku';
    } elseif (isset($feb12_weights['name:' . $p->post_title])) {
        $weight = $feb12_weights['name:' . $p->post_title];
        $source = 'feb12-name';
    } elseif (isset($feb12_weights['norm:' . normalize_title($p->post_title)])) {
        $weight = $feb12_weights['norm:' . normalize_title($p->post_title)];
        $source = 'feb12-norm';
    }

    if ($weight) {
        if (strpos($source, 'dec31') === 0) $weights_from_dec31++;
        else $weights_from_feb12++;
        
        if (!$dry_run) {
            update_post_meta($p->ID, '_weight', $weight);
        }
    }
}

echo "Weights recovered from Dec 31: {$weights_from_dec31}\n";
echo "Weights recovered from Feb 12: {$weights_from_feb12}\n";
echo "Still missing: " . (count($missing_weight) - $weights_from_dec31 - $weights_from_feb12) . "\n";

// =========================================================================
// PHASE 4: DESCRIPTION ENRICHMENT
// =========================================================================
echo "\n=== PHASE 4: DESCRIPTION ENRICHMENT ===\n\n";

// Get products missing descriptions
$missing_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (p.post_content = '' OR p.post_excerpt = '')
");
echo "Products needing description or short desc: " . count($missing_desc) . "\n";

$desc_added = 0;
$short_added = 0;

foreach ($missing_desc as $p) {
    $updates = [];
    
    // Description
    if (empty($p->post_content)) {
        $desc = null;
        if ($p->sku && isset($feb12_descriptions['sku:' . $p->sku])) {
            $desc = $feb12_descriptions['sku:' . $p->sku];
        } elseif (isset($feb12_descriptions['name:' . $p->post_title])) {
            $desc = $feb12_descriptions['name:' . $p->post_title];
        } elseif (isset($feb12_descriptions['norm:' . normalize_title($p->post_title)])) {
            $desc = $feb12_descriptions['norm:' . normalize_title($p->post_title)];
        }
        if ($desc) {
            $updates['post_content'] = $desc;
            $desc_added++;
        }
    }
    
    // Short description
    if (empty($p->post_excerpt)) {
        $short = null;
        if ($p->sku && isset($feb12_short_descriptions['sku:' . $p->sku])) {
            $short = $feb12_short_descriptions['sku:' . $p->sku];
        } elseif (isset($feb12_short_descriptions['name:' . $p->post_title])) {
            $short = $feb12_short_descriptions['name:' . $p->post_title];
        } elseif (isset($feb12_short_descriptions['norm:' . normalize_title($p->post_title)])) {
            $short = $feb12_short_descriptions['norm:' . normalize_title($p->post_title)];
        }
        if ($short) {
            $updates['post_excerpt'] = $short;
            $short_added++;
        }
    }
    
    if (!empty($updates) && !$dry_run) {
        $updates['ID'] = $p->ID;
        wp_update_post($updates);
    }
}

echo "Descriptions added: {$desc_added}\n";
echo "Short descriptions added: {$short_added}\n";

// =========================================================================
// PHASE 5: EMPTY GROUPED PRODUCTS -> SIMPLE
// =========================================================================
echo "\n=== PHASE 5: CONVERT EMPTY GROUPED TO SIMPLE ===\n\n";

$empty_grouped = $wpdb->get_results("
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

$still_empty = [];
foreach ($empty_grouped as $eg) {
    $children = maybe_unserialize($eg->children_data);
    if (empty($children) || !is_array($children)) {
        $still_empty[] = $eg;
    }
}

echo "Empty grouped products remaining: " . count($still_empty) . "\n";

if (!empty($still_empty)) {
    // Get the 'simple' product type term
    $simple_term = get_term_by('slug', 'simple', 'product_type');
    $grouped_term = get_term_by('slug', 'grouped', 'product_type');
    
    if ($simple_term && $grouped_term) {
        foreach ($still_empty as $eg) {
            echo "  Converting [{$eg->ID}] {$eg->post_title} to simple\n";
            if (!$dry_run) {
                wp_remove_object_terms($eg->ID, $grouped_term->term_id, 'product_type');
                wp_set_object_terms($eg->ID, $simple_term->term_id, 'product_type');
                delete_post_meta($eg->ID, '_children');
            }
        }
        echo "Converted " . count($still_empty) . " products from grouped to simple\n";
    } else {
        echo "ERROR: Could not find product_type terms\n";
    }
}

// =========================================================================
// SUMMARY
// =========================================================================
echo "\n" . str_repeat('=', 60) . "\n";
echo "SUMMARY ({$mode})\n";
echo str_repeat('=', 60) . "\n";
echo "Phase 1 - Grouped children re-linked: {$phase1_results['linked']}\n";
echo "Phase 2 - Smart orphan matches: {$orphans_matched}\n"; 
echo "Phase 3 - Weights recovered: " . ($weights_from_dec31 + $weights_from_feb12) . "\n";
echo "Phase 4 - Descriptions added: {$desc_added}, Short descs: {$short_added}\n";
echo "Phase 5 - Empty grouped → simple: " . count($still_empty) . "\n";

if ($dry_run) {
    echo "\n*** DRY-RUN MODE: No changes made. Run with --confirm to apply. ***\n";
}

echo "\n=== COMPLETE ===\n";

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

function normalize_title($s) {
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    // Normalize unicode quotes and dashes
    $s = preg_replace('/[\x{2033}\x{201c}\x{201d}\x{2019}\x{2018}]/u', '"', $s);
    $s = preg_replace('/[\x{2013}\x{2014}\x{2010}\x{2011}\x{00ad}]/u', '-', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return strtolower(trim($s));
}

function extract_base_name($title) {
    // Remove size/quantity info to get base product name
    // "FloraBlend qt" -> "florablend"
    // "Big Bud 1 Lt" -> "big bud"
    // "UNO Grow Tents" -> "uno grow tents"
    $t = normalize_title($title);
    // Remove common size patterns
    $t = preg_replace('/\b\d+(\.\d+)?\s*(lt|liter|litre|gal|gallon|qt|quart|oz|ml|kg|lb|lbs|g|gram|cu\s*ft|pack|cs|case|bag|roll|each)\b/i', '', $t);
    $t = preg_replace('/\b(small|medium|large|xl|xxl|mini|micro|mega|super)\b/i', '', $t);
    $t = preg_replace('/\s+/', ' ', $t);
    return trim($t);
}

function title_matches_parent($child_title, $parent_title, $parent_base) {
    $child_norm = normalize_title($child_title);
    $parent_norm = normalize_title($parent_title);
    $child_base = extract_base_name($child_title);
    
    // Exact base name match
    if ($child_base === $parent_base && $child_base !== '') {
        return true;
    }
    
    // Child title starts with parent title (e.g. "Big Bud 1 Lt" starts with "Big Bud")
    if ($parent_norm !== '' && strlen($parent_norm) >= 5 && strpos($child_norm, $parent_norm) === 0) {
        return true;
    }
    
    // Parent title starts with child base (e.g. grouped "Clonex Root Maximizer..." and child "Clonex Root Maximizer 4 OZ")
    if ($child_base !== '' && strlen($child_base) >= 5 && strpos($parent_norm, $child_base) === 0) {
        return true;
    }
    
    return false;
}

function find_product_id($child_name, $title_to_id, $title_normalized_to_id, $sku_to_id, $csv_data) {
    // Direct title match
    if (isset($title_to_id[$child_name])) {
        return $title_to_id[$child_name];
    }
    
    // HTML decoded match
    $decoded = html_entity_decode($child_name, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (isset($title_to_id[$decoded])) {
        return $title_to_id[$decoded];
    }
    
    // Normalized match
    $normed = normalize_title($child_name);
    if (isset($title_normalized_to_id[$normed])) {
        return $title_normalized_to_id[$normed];
    }
    
    // Try finding the child's SKU from CSV, then look up by SKU
    foreach ($csv_data as $row) {
        if (normalize_title(trim($row['Product Name'] ?? '')) === $normed) {
            $sku = trim($row['Sku'] ?? '');
            if ($sku && isset($sku_to_id[$sku])) {
                return $sku_to_id[$sku];
            }
        }
    }
    
    return null;
}
