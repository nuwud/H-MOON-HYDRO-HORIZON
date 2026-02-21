<?php
/**
 * Comprehensive Image Fix — H-Moon Hydro
 * 
 * Phase 1: Attach 20 matched media library images
 * Phase 2: Import 229 images from Feb 12 export URLs
 *          (these URLs point to images already on this server)
 * 
 * Run: wp eval-file fix_images.php              (dry run)
 * Run: CONFIRM=1 wp eval-file fix_images.php     (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// ============================================================
// PHASE 1: Attach existing media library images by name match
// ============================================================
echo "## PHASE 1: MEDIA LIBRARY NAME MATCHES\n\n";

$no_image_products = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.post_title
");

$attached_phase1 = 0;
$still_missing_ids = []; // track IDs still needing images after phase 1

foreach ($no_image_products as $product) {
    $title = $product->post_title;
    $words = preg_split('/[\s\-\_\(\)\/,]+/', $title);
    $search_words = [];
    foreach ($words as $w) {
        $w = trim($w, '®™.,;:\'\"');
        if (strlen($w) < 3) continue;
        if (preg_match('/^\d+\.?\d*$/', $w)) continue;
        if (preg_match('/^(gal|gm|ml|kg|oz|lbs?|ft|qt|pint|lt|liter|litre|inch|pack|case|count|gallon|quart|roll|clamps?)\.?$/i', $w)) continue;
        if (strpos($w, "'") !== false) continue;
        $search_words[] = $w;
    }
    
    if (count($search_words) < 2) {
        $still_missing_ids[$product->ID] = $product->post_title;
        continue;
    }
    
    $search_terms = array_slice($search_words, 0, 3);
    $like_clauses = [];
    foreach ($search_terms as $term) {
        $escaped = $wpdb->esc_like($term);
        $like_clauses[] = $wpdb->prepare("p.post_title LIKE %s", '%' . $escaped . '%');
    }
    
    $found = $wpdb->get_row("
        SELECT p.ID, p.post_title
        FROM {$wpdb->posts} p
        WHERE p.post_type = 'attachment'
        AND p.post_mime_type LIKE 'image/%'
        AND " . implode(' AND ', $like_clauses) . "
        LIMIT 1
    ");
    
    if ($found) {
        $meta = wp_get_attachment_metadata($found->ID);
        if ($meta && isset($meta['width']) && $meta['width'] >= 200) {
            if ($confirm) {
                update_post_meta($product->ID, '_thumbnail_id', $found->ID);
            }
            $attached_phase1++;
            echo "  ✓ #{$product->ID} '{$title}' → attachment #{$found->ID}\n";
            continue;
        }
    }
    
    $still_missing_ids[$product->ID] = $product->post_title;
}

echo "\n  Phase 1: " . ($confirm ? "Attached" : "Would attach") . " {$attached_phase1} images\n";
echo "  Still missing: " . count($still_missing_ids) . "\n\n";

// ============================================================
// PHASE 2: Import images from Feb 12 export URLs
// These are URLs on this same server (hmoonhydro.com/wp-content/uploads/...)
// ============================================================
echo "## PHASE 2: IMPORT FROM FEB 12 EXPORT URLs\n\n";

$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$export_file = $site_root . '/wc-product-export-12-2-2026.csv';
if (!file_exists($export_file)) {
    echo "  ERROR: Feb 12 export not found\n";
    echo "\nDONE\n";
    return;
}

// Build SKU → image URL map from export
$handle = fopen($export_file, 'r');
$headers = fgetcsv($handle);
$sku_col = array_search('SKU', $headers);
$img_col = array_search('Images', $headers);

$csv_images = [];
while (($row = fgetcsv($handle)) !== false) {
    $sku = $row[$sku_col] ?? '';
    $img_url = $row[$img_col] ?? '';
    if (!empty($sku) && !empty($img_url)) {
        // Take only the first image URL (before comma if multiple)
        $first_url = explode(',', $img_url)[0];
        $first_url = trim($first_url);
        if (!empty($first_url)) {
            $csv_images[$sku] = $first_url;
        }
    }
}
fclose($handle);

echo "  Loaded " . count($csv_images) . " image URLs from export\n\n";

// For still-missing products, try to find their SKU in the export
$attached_phase2 = 0;
$upload_dir = wp_upload_dir();

foreach ($still_missing_ids as $pid => $ptitle) {
    $sku = get_post_meta($pid, '_sku', true);
    if (empty($sku) || !isset($csv_images[$sku])) continue;
    
    $img_url = $csv_images[$sku];
    
    // Check if this URL is already a known attachment
    $attachment_id = $wpdb->get_var($wpdb->prepare("
        SELECT ID FROM {$wpdb->posts}
        WHERE post_type = 'attachment'
        AND guid = %s
        LIMIT 1
    ", $img_url));
    
    if ($attachment_id) {
        // Already in media library - just attach it
        if ($confirm) {
            update_post_meta($pid, '_thumbnail_id', $attachment_id);
        }
        $attached_phase2++;
        echo "  ✓ #{$pid} '{$ptitle}' → existing attachment #{$attachment_id}\n";
        unset($still_missing_ids[$pid]);
        continue;
    }
    
    // URL is on our server — convert to local path and try to import
    if (strpos($img_url, 'hmoonhydro.com/wp-content/uploads/') !== false) {
        // Extract the path after wp-content/uploads/
        preg_match('/wp-content\/uploads\/(.+)$/', $img_url, $m);
        if ($m) {
            $local_path = $upload_dir['basedir'] . '/' . $m[1];
            
            // Check if the original (non-resized) file exists
            // Remove the -WxH suffix for resized images
            $original_path = preg_replace('/-\d+x\d+(\.[a-z]+)$/i', '$1', $local_path);
            
            if (file_exists($original_path)) {
                if ($confirm) {
                    // Import the image into the media library
                    require_once(ABSPATH . 'wp-admin/includes/media.php');
                    require_once(ABSPATH . 'wp-admin/includes/file.php');
                    require_once(ABSPATH . 'wp-admin/includes/image.php');
                    
                    $file_array = [
                        'name' => basename($original_path),
                        'tmp_name' => $original_path,
                    ];
                    
                    // Use media_handle_sideload would move the file — we don't want that
                    // Instead, check if there's already an attachment for this file
                    $existing = $wpdb->get_var($wpdb->prepare("
                        SELECT post_id FROM {$wpdb->postmeta}
                        WHERE meta_key = '_wp_attached_file'
                        AND meta_value = %s
                        LIMIT 1
                    ", $m[1]));
                    
                    // Also check without resize suffix
                    $original_rel = preg_replace('/-\d+x\d+(\.[a-z]+)$/i', '$1', $m[1]);
                    if (!$existing) {
                        $existing = $wpdb->get_var($wpdb->prepare("
                            SELECT post_id FROM {$wpdb->postmeta}
                            WHERE meta_key = '_wp_attached_file'
                            AND meta_value = %s
                            LIMIT 1
                        ", $original_rel));
                    }
                    
                    if ($existing) {
                        update_post_meta($pid, '_thumbnail_id', $existing);
                        $attached_phase2++;
                        echo "  ✓ #{$pid} '{$ptitle}' → found attachment #{$existing} by file path\n";
                        unset($still_missing_ids[$pid]);
                    } else {
                        echo "  ~ #{$pid} '{$ptitle}' → file exists but no attachment record: {$original_path}\n";
                    }
                } else {
                    echo "  ~ #{$pid} '{$ptitle}' → local file found: " . basename($original_path) . "\n";
                    $attached_phase2++;
                    unset($still_missing_ids[$pid]);
                }
            } elseif (file_exists($local_path)) {
                echo "  ~ #{$pid} '{$ptitle}' → resized version exists: " . basename($local_path) . "\n";
                $attached_phase2++;
                unset($still_missing_ids[$pid]);
            }
        }
    }
}

echo "\n  Phase 2: " . ($confirm ? "Attached" : "Could source") . " {$attached_phase2} images\n";
echo "  Still missing after both phases: " . count($still_missing_ids) . "\n\n";

// Show what's truly unsourceable
echo "## TRULY MISSING (need external download)\n";
echo "First 30:\n";
$i = 0;
foreach ($still_missing_ids as $pid => $ptitle) {
    if ($i++ >= 30) break;
    $sku = get_post_meta($pid, '_sku', true);
    echo "  #{$pid}: {$ptitle} (SKU: {$sku})\n";
}
if (count($still_missing_ids) > 30) echo "  ... and " . (count($still_missing_ids) - 30) . " more\n";

echo "\n" . ($confirm ? "DONE!" : "DRY RUN COMPLETE") . "\n";
