<?php
/**
 * Parent Image Inherit + Description Enrichment — H-Moon Hydro
 * 
 * Phase 1: Grouped parents without images → inherit from first child with image
 * Phase 2: Products without descriptions → pull from Feb 12 export
 * Phase 3: Fix new liquid parents missing images → use child image
 * 
 * Run: wp eval-file enrich_parents.php              (dry run)
 * Run: CONFIRM=1 wp eval-file enrich_parents.php    (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// ============================================================
// PHASE 1: Grouped parents missing images → inherit from children
// ============================================================
echo "## PHASE 1: INHERIT IMAGES FOR GROUPED PARENTS\n\n";

$parents_no_image = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm2.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
");

$inherited = 0;
foreach ($parents_no_image as $parent) {
    $child_ids = maybe_unserialize($parent->children_raw);
    if (!is_array($child_ids)) continue;
    
    // Find first child with an image
    foreach ($child_ids as $cid) {
        $child_thumb = get_post_meta($cid, '_thumbnail_id', true);
        if (!empty($child_thumb) && intval($child_thumb) > 0) {
            echo "  ✓ #{$parent->ID} '{$parent->post_title}' → child #{$cid} image #{$child_thumb}\n";
            if ($confirm) {
                update_post_meta($parent->ID, '_thumbnail_id', $child_thumb);
            }
            $inherited++;
            break;
        }
    }
}

echo "\n  " . ($confirm ? "Inherited" : "Would inherit") . " {$inherited} images for grouped parents\n\n";

// ============================================================
// PHASE 2: Enrich descriptions from Feb 12 export
// ============================================================
echo "## PHASE 2: DESCRIPTION ENRICHMENT FROM FEB 12 EXPORT\n\n";

$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$export_file = $site_root . '/wc-product-export-12-2-2026.csv';
if (!file_exists($export_file)) {
    echo "  ERROR: Feb 12 export not found\n\n";
} else {
    $handle = fopen($export_file, 'r');
    $headers = fgetcsv($handle);
    
    $sku_col = array_search('SKU', $headers);
    $desc_col = array_search('Description', $headers);
    $short_col = array_search('Short description', $headers);
    $name_col = array_search('Name', $headers);
    
    if ($sku_col === false || $desc_col === false) {
        echo "  ERROR: Missing columns in export\n\n";
    } else {
        // Build SKU → descriptions map
        $csv_descs = [];
        while (($row = fgetcsv($handle)) !== false) {
            $sku = trim($row[$sku_col] ?? '');
            $desc = trim($row[$desc_col] ?? '');
            $short = trim($row[$short_col] ?? '');
            $name = trim($row[$name_col] ?? '');
            
            if (!empty($sku)) {
                $csv_descs[$sku] = ['desc' => $desc, 'short' => $short, 'name' => $name];
            }
        }
        fclose($handle);
        
        echo "  Loaded " . count($csv_descs) . " products from Feb 12 export\n";
        
        // Find products missing descriptions
        $no_desc = $wpdb->get_results("
            SELECT p.ID, p.post_title, p.post_content, p.post_excerpt, pm_sku.meta_value as sku
            FROM {$wpdb->posts} p
            JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
            JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
            JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
            LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
            WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
            AND p.post_status = 'publish'
            AND (p.post_content IS NULL OR p.post_content = '' OR p.post_excerpt IS NULL OR p.post_excerpt = '')
            ORDER BY p.post_title
        ");
        
        $enriched_desc = 0;
        $enriched_short = 0;
        
        foreach ($no_desc as $product) {
            $sku = $product->sku;
            if (empty($sku) || !isset($csv_descs[$sku])) continue;
            
            $source = $csv_descs[$sku];
            $updates = [];
            
            // Add description if missing
            if (empty($product->post_content) && !empty($source['desc'])) {
                $updates['post_content'] = $source['desc'];
                $enriched_desc++;
            }
            
            // Add short description if missing
            if (empty($product->post_excerpt) && !empty($source['short'])) {
                $updates['post_excerpt'] = $source['short'];
                $enriched_short++;
            }
            
            if (!empty($updates) && $confirm) {
                $updates['ID'] = $product->ID;
                // Use direct SQL for speed
                if (isset($updates['post_content'])) {
                    $wpdb->update(
                        $wpdb->posts,
                        ['post_content' => $updates['post_content']],
                        ['ID' => $product->ID]
                    );
                }
                if (isset($updates['post_excerpt'])) {
                    $wpdb->update(
                        $wpdb->posts,
                        ['post_excerpt' => $updates['post_excerpt']],
                        ['ID' => $product->ID]
                    );
                }
            }
            
            if (!empty($updates) && ($enriched_desc + $enriched_short) <= 30) {
                $what = [];
                if (isset($updates['post_content'])) $what[] = 'desc';
                if (isset($updates['post_excerpt'])) $what[] = 'short';
                echo "  ✓ #{$product->ID} '{$product->post_title}' → " . implode('+', $what) . "\n";
            }
        }
        
        echo "\n  " . ($confirm ? "Enriched" : "Would enrich") . ": {$enriched_desc} descriptions, {$enriched_short} short descriptions\n\n";
    }
}

// ============================================================
// PHASE 3: Copy child image to grouped parent by name match
// For parents created by our scripts (no SKU in export) 
// ============================================================
echo "## PHASE 3: NEW PARENT DESCRIPTION COPY FROM CHILDREN\n\n";

// For grouped parents with no description, copy from first child that has one
$parents_no_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
    AND (p.post_content IS NULL OR p.post_content = '')
");

$parent_desc_copied = 0;
foreach ($parents_no_desc as $parent) {
    $child_ids = maybe_unserialize($parent->children_raw);
    if (!is_array($child_ids)) continue;
    
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child) continue;
        
        if (!empty($child->post_content)) {
            echo "  ✓ #{$parent->ID} '{$parent->post_title}' ← child #{$cid} description\n";
            if ($confirm) {
                $wpdb->update(
                    $wpdb->posts,
                    ['post_content' => $child->post_content],
                    ['ID' => $parent->ID]
                );
                // Also copy short description if parent doesn't have one
                if (empty(get_post($parent->ID)->post_excerpt) && !empty($child->post_excerpt)) {
                    $wpdb->update(
                        $wpdb->posts,
                        ['post_excerpt' => $child->post_excerpt],
                        ['ID' => $parent->ID]
                    );
                }
            }
            $parent_desc_copied++;
            break;
        }
    }
}

echo "\n  " . ($confirm ? "Copied" : "Would copy") . " {$parent_desc_copied} descriptions from children to parents\n\n";

echo "============================\n";
echo "SUMMARY\n";
echo "============================\n";
echo "Parent images inherited: {$inherited}\n";
echo "Descriptions enriched: {$enriched_desc}\n";
echo "Short descriptions enriched: {$enriched_short}\n";
echo "Parent descriptions from children: {$parent_desc_copied}\n";
echo "============================\n";
echo ($confirm ? "DONE!" : "DRY RUN COMPLETE") . "\n";
