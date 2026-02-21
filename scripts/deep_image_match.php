<?php
/**
 * Deep Image Matcher + Final Diagnostic
 * 
 * Phase 1: More aggressive media library name matching for remaining 110 missing
 * Phase 2: Try matching via Feb 12 export NAME→image URL (not just SKU)
 * Phase 3: Final store status report
 * 
 * Run: wp eval-file deep_image_match.php              (dry run)
 * Run: CONFIRM=1 wp eval-file deep_image_match.php    (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// ============================================================
// PHASE 1: Aggressive media library name matching
// ============================================================
echo "## PHASE 1: AGGRESSIVE MEDIA LIBRARY MATCHING\n\n";

$no_image = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.post_title
");

echo "  Products missing images: " . count($no_image) . "\n\n";

$matched_p1 = 0;

foreach ($no_image as $product) {
    $title = $product->post_title;
    
    // Build search terms from product name
    // Strip sizes and generic words
    $search_name = preg_replace('/\s*\(?(\d+[\s.]*(gal|gallon|lt|ltr|ml|oz|lb|kg|gm|g|gram|grams|quart|qt|ft|in|inch))\)?/i', '', $title);
    $search_name = preg_replace('/\s*\([^)]*\)\s*/', ' ', $search_name); // Remove parentheticals
    $search_name = preg_replace('/\s*-\s*\d+.*$/', '', $search_name); // Strip trailing "- 24" long" etc
    $search_name = preg_replace('/\s+/', ' ', trim($search_name));
    
    if (strlen($search_name) < 3) continue;
    
    // Split into significant words (3+ chars, no special chars)
    $words = array_filter(explode(' ', $search_name), function($w) {
        return strlen($w) >= 3 && !preg_match("/['\"/]/", $w) && !in_array(strtolower($w), ['the','and','for','with','from','that','this','has','are','was','not','but','all','can','had','her','one','our','out','day','get','how','its','may','new','now','old']);
    });
    
    if (count($words) < 1) continue;
    
    // Try searching media library for matching filename/title
    // Use the most unique words
    $significant = array_values($words);
    
    // Try 2-word combinations first (more specific)
    $attachment_id = null;
    
    if (count($significant) >= 2) {
        $term1 = $wpdb->esc_like($significant[0]);
        $term2 = $wpdb->esc_like($significant[1]);
        
        $attachment_id = $wpdb->get_var($wpdb->prepare("
            SELECT ID FROM {$wpdb->posts}
            WHERE post_type = 'attachment'
            AND post_mime_type LIKE 'image/%%'
            AND (
                (post_title LIKE %s AND post_title LIKE %s)
                OR (post_name LIKE %s AND post_name LIKE %s)
            )
            ORDER BY ID DESC LIMIT 1
        ", "%{$term1}%", "%{$term2}%", "%{$term1}%", "%{$term2}%"));
    }
    
    // Fallback: try with brand name + first unique word
    if (!$attachment_id && count($significant) >= 2) {
        // Try searching by file name in _wp_attached_file
        $term1 = $wpdb->esc_like(strtolower($significant[0]));
        $term2 = $wpdb->esc_like(strtolower($significant[1]));
        
        $attachment_id = $wpdb->get_var($wpdb->prepare("
            SELECT p.ID FROM {$wpdb->posts} p
            JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_wp_attached_file'
            WHERE p.post_type = 'attachment'
            AND p.post_mime_type LIKE 'image/%%'
            AND pm.meta_value LIKE %s
            AND pm.meta_value LIKE %s
            ORDER BY p.ID DESC LIMIT 1
        ", "%{$term1}%", "%{$term2}%"));
    }
    
    if ($attachment_id) {
        $matched_p1++;
        $att_title = get_post($attachment_id)->post_title;
        if ($matched_p1 <= 30) {
            echo "  ✓ #{$product->ID} '{$product->post_title}' → attachment #{$attachment_id} '{$att_title}'\n";
        }
        if ($confirm) {
            update_post_meta($product->ID, '_thumbnail_id', $attachment_id);
        }
    }
}

echo "\n  " . ($confirm ? "Matched" : "Would match") . " {$matched_p1} images via aggressive name search\n\n";

// ============================================================
// PHASE 2: Feb 12 export NAME → image URL matching
// ============================================================
echo "## PHASE 2: FEB 12 NAME → IMAGE MATCHING\n\n";

$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$export_file = $site_root . '/wc-product-export-12-2-2026.csv';
if (!file_exists($export_file)) {
    echo "  ERROR: Feb 12 export not found\n\n";
} else {
    $handle = fopen($export_file, 'r');
    $headers = fgetcsv($handle);
    
    $name_col = array_search('Name', $headers);
    $img_col = array_search('Images', $headers);
    
    $name_to_img = [];
    while (($row = fgetcsv($handle)) !== false) {
        $name = trim($row[$name_col] ?? '');
        $img = trim($row[$img_col] ?? '');
        if (!empty($name) && !empty($img)) {
            $norm = strtolower(preg_replace('/[^a-z0-9\s]/', '', strtolower($name)));
            $norm = preg_replace('/\s+/', ' ', trim($norm));
            $name_to_img[$norm] = explode(',', $img)[0]; // First image only
        }
    }
    fclose($handle);
    
    echo "  Loaded " . count($name_to_img) . " name→image mappings\n";
    
    // Refresh missing images list
    $still_no_image = $wpdb->get_results("
        SELECT p.ID, p.post_title
        FROM {$wpdb->posts} p
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
        WHERE p.post_type = 'product' AND p.post_status = 'publish'
        AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
        ORDER BY p.post_title
    ");
    
    $matched_p2 = 0;
    foreach ($still_no_image as $product) {
        $norm = strtolower(preg_replace('/[^a-z0-9\s]/', '', strtolower($product->post_title)));
        $norm = preg_replace('/\s+/', ' ', trim($norm));
        
        // Try exact name match
        $img_url = null;
        if (isset($name_to_img[$norm])) {
            $img_url = trim($name_to_img[$norm]);
        }
        
        // Try base name
        if (!$img_url) {
            $base = preg_replace('/\s*\d+\s*(gal|gallon|lt|ltr|ml|oz|lb|kg|gm|g|gram|quart|qt|ft|in)\s*/i', ' ', $norm);
            $base = preg_replace('/\s*\d+\s*$/', '', trim($base));
            $base = preg_replace('/\s+/', ' ', trim($base));
            if (isset($name_to_img[$base])) {
                $img_url = trim($name_to_img[$base]);
            }
        }
        
        if (!$img_url) continue;
        
        // Extract filename from URL and find attachment
        $url_path = parse_url($img_url, PHP_URL_PATH);
        if (!$url_path) continue;
        
        // Strip /wp-content/uploads/ prefix
        $file_path = preg_replace('#^.*/wp-content/uploads/#', '', $url_path);
        // Also try without size suffix
        $base_file = preg_replace('/-\d+x\d+\./', '.', $file_path);
        
        $att_id = $wpdb->get_var($wpdb->prepare("
            SELECT post_id FROM {$wpdb->postmeta}
            WHERE meta_key = '_wp_attached_file'
            AND (meta_value = %s OR meta_value = %s)
            LIMIT 1
        ", $file_path, $base_file));
        
        if ($att_id) {
            $matched_p2++;
            if ($matched_p2 <= 20) {
                echo "  ✓ #{$product->ID} '{$product->post_title}' → attachment #{$att_id}\n";
            }
            if ($confirm) {
                update_post_meta($product->ID, '_thumbnail_id', $att_id);
            }
        }
    }
    
    echo "\n  " . ($confirm ? "Matched" : "Would match") . " {$matched_p2} via name→URL\n\n";
}

// ============================================================
// PHASE 3: Final Status
// ============================================================
echo "## PHASE 3: FINAL STORE STATUS\n\n";

$total = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish'");
$has_image = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0 WHERE p.post_type='product' AND p.post_status='publish'");
$has_desc = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_content IS NOT NULL AND post_content != ''");
$has_short = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_excerpt IS NOT NULL AND post_excerpt != ''");
$has_price = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key='_regular_price' AND pm.meta_value > 0 WHERE p.post_type='product' AND p.post_status='publish'");

echo "  Total: {$total}\n";
echo "  Images: {$has_image}/" . $total . " (" . round(100*$has_image/$total) . "%)\n";
echo "  Descriptions: {$has_desc}/" . $total . " (" . round(100*$has_desc/$total) . "%)\n";
echo "  Short desc: {$has_short}/" . $total . " (" . round(100*$has_short/$total) . "%)\n";
echo "  Prices: {$has_price}/" . $total . " (" . round(100*$has_price/$total) . "%)\n\n";

// List remaining missing-image products
echo "  Remaining products without images:\n";
$final_no_image = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.post_title
");
foreach ($final_no_image as $p) {
    echo "    #{$p->ID} [{$p->sku}] {$p->post_title}\n";
}

echo "\n  Remaining products without descriptions:\n";
$final_no_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (p.post_content IS NULL OR p.post_content = '')
    ORDER BY p.post_title
    LIMIT 80
");
foreach ($final_no_desc as $p) {
    echo "    #{$p->ID} [{$p->sku}] {$p->post_title}\n";
}

echo "\n============================\n";
echo ($confirm ? "DONE!" : "DRY RUN") . "\n";
