<?php
/**
 * enrich_from_scraped.php — Import enrichment data from retailer scrape into WooCommerce
 * 
 * What it does:
 * 1. Reads enrichment_import_ready.json (high-confidence matches)
 * 2. For each matched product:
 *    - Sideloads hi-res images to replace missing/small ones
 *    - Adds descriptions where ours are missing or too short
 *    - Adds features as structured HTML bullet points
 *    - Adds spec data (NPK, weights) as product meta
 * 
 * Safety: DRY-RUN by default. Set CONFIRM=1 to apply.
 * 
 * Usage:
 *   wp eval-file wp-content/enrich_from_scraped.php              # Dry run
 *   CONFIRM=1 wp eval-file wp-content/enrich_from_scraped.php    # Live run
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo "============================================\n";
echo "  ENRICHMENT IMPORT FROM RETAILER SCRAPE\n";
echo "  Mode: " . ($confirm ? "🔴 LIVE" : "🟡 DRY RUN") . "\n";
echo "============================================\n\n";

// Load enrichment data
$json_path = ABSPATH . 'wp-content/uploads/enrichment_import_ready.json';
if (!file_exists($json_path)) {
    echo "ERROR: $json_path not found!\n";
    echo "Upload enrichment_import_ready.json to wp-content/uploads/ first.\n";
    exit(1);
}

$enrichments = json_decode(file_get_contents($json_path), true);
echo "Loaded " . count($enrichments) . " high-confidence matches\n\n";

// Counters
$stats = [
    'images_replaced' => 0,
    'images_added' => 0,
    'descriptions_added' => 0,
    'features_added' => 0,
    'specs_added' => 0,
    'skipped' => 0,
    'errors' => 0,
];

// Minimum match score for different types of updates
$THRESHOLDS = [
    'image' => 0.80,       // Images: safe even for imperfect matches (same product family)
    'description' => 0.85,  // Descriptions: need higher confidence
    'features' => 0.85,
    'specs' => 0.80,
];

// Include media handling
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

/**
 * Sideload an image from URL and attach it to a product.
 */
function sideload_image($url, $post_id, $desc = '') {
    // Download
    $tmp = download_url($url, 30);
    if (is_wp_error($tmp)) {
        return $tmp;
    }
    
    // Get filename from URL
    $fname = basename(parse_url($url, PHP_URL_PATH));
    // Clean up Shopify filename params
    $fname = preg_replace('/\?.*$/', '', $fname);
    
    $file_array = [
        'name' => $fname,
        'tmp_name' => $tmp,
    ];
    
    $attachment_id = media_handle_sideload($file_array, $post_id, $desc);
    
    // Clean up temp on error
    if (is_wp_error($attachment_id)) {
        @unlink($tmp);
    }
    
    return $attachment_id;
}

/**
 * Build structured HTML description from enrichment data.
 */
function build_enriched_description($enrichment) {
    $parts = [];
    
    // Main description
    $desc = $enrichment['description_html'] ?? '';
    if ($desc) {
        // Clean up Shopify-specific markup
        $desc = preg_replace('/<meta[^>]*>/', '', $desc);
        $desc = preg_replace('/\sclass="[^"]*"/', '', $desc);
        $desc = preg_replace('/\sdata-[a-z-]+="[^"]*"/', '', $desc);
        $parts[] = $desc;
    }
    
    // Features as bullet list
    $features = $enrichment['features'] ?? [];
    if (!empty($features)) {
        $html = "<h3>Key Features</h3>\n<ul>\n";
        foreach (array_slice($features, 0, 12) as $feat) {
            $html .= "  <li>" . esc_html($feat) . "</li>\n";
        }
        $html .= "</ul>";
        $parts[] = $html;
    }
    
    // Specs table
    $specs = $enrichment['specs'] ?? [];
    if (!empty($specs)) {
        $spec_rows = '';
        $spec_labels = [
            'npk' => 'NPK Ratio',
            'weight' => 'Weight',
            'upc' => 'UPC',
        ];
        foreach ($specs as $key => $val) {
            if (in_array($key, ['sds_url', 'feeding_chart_url', 'spec_sheet_url', 'meta_description', 'json_ld_image', 'json_ld_images'])) continue;
            $label = $spec_labels[$key] ?? ucfirst(str_replace('_', ' ', $key));
            $spec_rows .= "  <tr><th>$label</th><td>" . esc_html($val) . "</td></tr>\n";
        }
        if ($spec_rows) {
            $parts[] = "<h3>Specifications</h3>\n<table class=\"product-specs\">\n$spec_rows</table>";
        }
    }
    
    return implode("\n\n", $parts);
}

/**
 * Check if current product image is missing or low quality.
 */
function needs_better_image($post_id) {
    $thumb_id = get_post_thumbnail_id($post_id);
    if (!$thumb_id) return 'missing';
    
    $meta = wp_get_attachment_metadata($thumb_id);
    $w = $meta['width'] ?? 0;
    $h = $meta['height'] ?? 0;
    if ($w < 300 || $h < 300) return 'small';
    
    return false;
}

// ============================================================
// MAIN LOOP
// ============================================================

foreach ($enrichments as $idx => $item) {
    $pid = $item['id'];
    $title = $item['title'];
    $missing = $item['missing'] ?? [];
    $e = $item['enrichment'] ?? [];
    $score = $e['match_score'] ?? 0;
    
    // Verify product exists
    $exists = $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE ID = $pid AND post_status = 'publish'");
    if (!$exists) {
        $stats['skipped']++;
        continue;
    }
    
    $updates = [];
    
    // --- IMAGE ENRICHMENT ---
    if ($score >= $THRESHOLDS['image']) {
        $img_need = needs_better_image($pid);
        $images = $e['images'] ?? [];
        
        if ($img_need && !empty($images)) {
            $img_url = $images[0]['url'];
            
            if ($confirm) {
                $attachment_id = sideload_image($img_url, $pid, $title);
                if (!is_wp_error($attachment_id)) {
                    set_post_thumbnail($pid, $attachment_id);
                    if ($img_need === 'missing') {
                        $stats['images_added']++;
                    } else {
                        $stats['images_replaced']++;
                    }
                    $updates[] = "IMG(" . ($img_need === 'missing' ? 'new' : 'upgraded') . ")";
                } else {
                    $stats['errors']++;
                    $updates[] = "IMG_ERR(" . $attachment_id->get_error_message() . ")";
                }
            } else {
                if ($img_need === 'missing') {
                    $stats['images_added']++;
                } else {
                    $stats['images_replaced']++;
                }
                $updates[] = "IMG(" . ($img_need === 'missing' ? 'new' : 'upgrade') . ")";
            }
            
            // Add gallery images (additional images beyond the first)
            if (count($images) > 1 && $confirm) {
                $gallery_ids = [];
                foreach (array_slice($images, 1, 4) as $extra_img) { // Max 4 gallery images
                    $gal_id = sideload_image($extra_img['url'], $pid, $title);
                    if (!is_wp_error($gal_id)) {
                        $gallery_ids[] = $gal_id;
                    }
                }
                if ($gallery_ids) {
                    $existing_gallery = get_post_meta($pid, '_product_image_gallery', true);
                    $new_gallery = $existing_gallery 
                        ? $existing_gallery . ',' . implode(',', $gallery_ids)
                        : implode(',', $gallery_ids);
                    update_post_meta($pid, '_product_image_gallery', $new_gallery);
                    $updates[] = "GALLERY(+" . count($gallery_ids) . ")";
                }
            }
        }
    }
    
    // --- DESCRIPTION ENRICHMENT ---
    if ($score >= $THRESHOLDS['description'] && (in_array('description', $missing) || in_array('description_short', $missing))) {
        $enriched_desc = build_enriched_description($e);
        
        if ($enriched_desc && strlen(strip_tags($enriched_desc)) > 50) {
            // Only replace if our description is really lacking
            $current_desc = get_post_field('post_content', $pid);
            if (strlen(strip_tags($current_desc)) < 100) {
                if ($confirm) {
                    $wpdb->update($wpdb->posts, ['post_content' => $enriched_desc], ['ID' => $pid]);
                    clean_post_cache($pid);
                }
                $stats['descriptions_added']++;
                $updates[] = "DESC(" . strlen(strip_tags($enriched_desc)) . "ch)";
            }
        }
    }
    
    // --- SHORT DESCRIPTION ---
    if ($score >= $THRESHOLDS['description'] && in_array('short_description', $missing)) {
        $meta_desc = $e['specs']['meta_description'] ?? '';
        $desc_text = $e['description_text'] ?? '';
        
        // Use meta description or first 200 chars
        $short = $meta_desc ?: (strlen($desc_text) > 200 ? substr($desc_text, 0, 200) . '...' : $desc_text);
        
        if ($short && strlen($short) > 20) {
            $current_excerpt = get_post_field('post_excerpt', $pid);
            if (empty(trim($current_excerpt))) {
                if ($confirm) {
                    $wpdb->update($wpdb->posts, ['post_excerpt' => $short], ['ID' => $pid]);
                    clean_post_cache($pid);
                }
                $updates[] = "SHORT_DESC";
            }
        }
    }
    
    // --- SPECS / FEATURES ---
    if ($score >= $THRESHOLDS['specs']) {
        $specs = $e['specs'] ?? [];
        
        // NPK as product attribute
        if (!empty($specs['npk'])) {
            // Validate NPK — each number should be 0-99 (not phone numbers!)
            $npk_parts = explode('-', $specs['npk']);
            $npk_valid = count($npk_parts) === 3 
                && intval($npk_parts[0]) <= 99 
                && intval($npk_parts[1]) <= 99 
                && intval($npk_parts[2]) <= 99;
            
            if ($npk_valid) {
                $current_npk = get_post_meta($pid, '_npk_ratio', true);
                if (empty($current_npk)) {
                    if ($confirm) {
                        update_post_meta($pid, '_npk_ratio', sanitize_text_field($specs['npk']));
                    }
                    $stats['specs_added']++;
                    $updates[] = "NPK({$specs['npk']})";
                }
            }
        }
        
        // Product type/category tag
        if (!empty($e['product_type'])) {
            if ($confirm) {
                update_post_meta($pid, '_source_product_type', sanitize_text_field($e['product_type']));
            }
        }
    }
    
    // Only print if we have updates
    if (!empty($updates)) {
        $brand = $item['brand'] ?? '';
        echo sprintf("[%d/%d] #%d %s | %s%s\n",
            $idx + 1, count($enrichments), $pid,
            substr($title, 0, 45),
            $brand ? "[$brand] " : '',
            implode(' ', $updates)
        );
    }
}

// ============================================================
// SUMMARY
// ============================================================

echo "\n============================================\n";
echo "  ENRICHMENT SUMMARY\n";
echo "============================================\n";
echo "  Images added (new):    {$stats['images_added']}\n";
echo "  Images replaced (hi-res): {$stats['images_replaced']}\n";
echo "  Descriptions added:    {$stats['descriptions_added']}\n";
echo "  Features added:        {$stats['features_added']}\n";
echo "  Specs added:           {$stats['specs_added']}\n";
echo "  Skipped:               {$stats['skipped']}\n";
echo "  Errors:                {$stats['errors']}\n";
echo "  TOTAL UPDATES:         " . ($stats['images_added'] + $stats['images_replaced'] + $stats['descriptions_added'] + $stats['features_added'] + $stats['specs_added']) . "\n";

if (!$confirm) {
    echo "\n  [DRY RUN] No changes made. Use CONFIRM=1 to apply.\n";
}

echo "============================================\n";
