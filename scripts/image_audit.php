<?php
/**
 * Image Audit & Local Match — H-Moon Hydro
 * 
 * 1. Finds products missing images
 * 2. Checks if original WooCommerce export has image URLs
 * 3. Maps image URLs to local wp-content/uploads paths
 * 4. Identifies images that exist locally but aren't attached
 * 5. Identifies oddly shaped / too-small images that need replacement
 * 
 * Run: wp eval-file image_audit.php
 */

wp_set_current_user(1);
global $wpdb;

echo "============================\n";
echo "IMAGE AUDIT & LOCAL MATCHING\n";
echo date('Y-m-d H:i:s') . "\n";
echo "============================\n\n";

// Get all products without featured images (simple + grouped)
$no_image_products = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
    ORDER BY p.post_title
");

echo "## Products missing featured images: " . count($no_image_products) . "\n\n";

// Check what images exist in wp-content/uploads
$upload_dir = wp_upload_dir();
$base_dir = $upload_dir['basedir']; // e.g. /var/www/site/wp-content/uploads

echo "Upload base: {$base_dir}\n\n";

// Get attachment count
$total_attachments = $wpdb->get_var("
    SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%'
");
echo "Total image attachments in media library: {$total_attachments}\n\n";

// Check how many of the missing-image products have image data in the Dec 31 export
// We can try to match by searching media library for the product name
echo "## POTENTIAL MATCHES IN MEDIA LIBRARY\n";
echo "(Searching media library by product name keywords)\n\n";

$matched = 0;
$unmatched_products = [];

foreach ($no_image_products as $product) {
    // Clean title for search
    $title = $product->post_title;
    
    // Extract meaningful words (skip sizes, units, numbers-only)
    $words = preg_split('/[\s\-\_\(\)\/]+/', $title);
    $search_words = [];
    foreach ($words as $w) {
        $w = trim($w, '®™.,;:');
        if (strlen($w) < 3) continue;
        if (preg_match('/^\d+\.?\d*$/', $w)) continue; // skip pure numbers
        if (preg_match('/^(gal|gm|ml|kg|oz|lbs?|ft|qt|pint|lt|liter|litre|inch|pack|case|count)\.?$/i', $w)) continue;
        $search_words[] = $w;
    }
    
    if (empty($search_words)) {
        $unmatched_products[] = $product;
        continue;
    }
    
    // Take first 3 significant words for search
    $search_terms = array_slice($search_words, 0, 3);
    $like_clauses = [];
    foreach ($search_terms as $term) {
        $escaped = $wpdb->esc_like($term);
        $like_clauses[] = "p.post_title LIKE '%{$escaped}%'";
    }
    
    $found = $wpdb->get_row("
        SELECT p.ID, p.post_title, p.guid
        FROM {$wpdb->posts} p
        WHERE p.post_type = 'attachment'
        AND p.post_mime_type LIKE 'image/%'
        AND " . implode(' AND ', $like_clauses) . "
        LIMIT 1
    ");
    
    if ($found) {
        $matched++;
        if ($matched <= 30) {
            echo "  MATCH: '{$product->post_title}' → attachment #{$found->ID}: {$found->post_title}\n";
        }
    } else {
        $unmatched_products[] = $product;
    }
}

echo "\n  Matched in media library: {$matched} / " . count($no_image_products) . "\n";
echo "  Still unmatched: " . count($unmatched_products) . "\n\n";

// Show some unmatched for manual review
echo "## UNMATCHED PRODUCTS (need external images)\n";
echo "First 50:\n";
foreach (array_slice($unmatched_products, 0, 50) as $up) {
    echo "  #{$up->ID}: {$up->post_title} (SKU: {$up->sku})\n";
}
if (count($unmatched_products) > 50) echo "  ... and " . (count($unmatched_products) - 50) . " more\n";

// Oddly shaped images check
echo "\n\n## ODDLY SHAPED / TOO SMALL IMAGES\n";
$products_with_images = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as thumb_id
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
    WHERE tt.taxonomy = 'product_type' AND t.slug IN ('simple','grouped')
    AND p.post_status = 'publish'
    AND pm.meta_value != '' AND pm.meta_value > 0
");

$too_small = 0;
$odd_ratio = 0;
$good_images = 0;
$small_list = [];

foreach ($products_with_images as $pi) {
    $meta = wp_get_attachment_metadata(intval($pi->thumb_id));
    if (!$meta || !isset($meta['width']) || !isset($meta['height'])) continue;
    
    $w = $meta['width'];
    $h = $meta['height'];
    if ($w == 0 || $h == 0) continue;
    
    $ratio = max($w, $h) / min($w, $h);
    $min_dim = min($w, $h);
    
    if ($min_dim < 300) {
        $too_small++;
        $small_list[] = "#{$pi->ID}: {$pi->post_title} — {$w}x{$h}";
    } elseif ($ratio > 2.0) {
        $odd_ratio++;
    } else {
        $good_images++;
    }
}

echo "  Good quality (300px+ & reasonable ratio): {$good_images}\n";
echo "  Too small (<300px dimension): {$too_small}\n";
echo "  Oddly shaped (>2:1 ratio): {$odd_ratio}\n\n";

echo "## PRICE ANOMALIES RECHECK (post liquid/powder split)\n\n";
// Re-run price check now that liquid/powder are separated
function extract_volume_ml2($title) {
    $title = strtolower($title);
    if (preg_match('/([\d.]+)\s*gal/i', $title, $m)) return $m[1] * 3785;
    if (preg_match('/([\d.]+)\s*(?:lt|liter|litre|l)\b/i', $title, $m)) return $m[1] * 1000;
    if (preg_match('/([\d.]+)\s*ml/i', $title, $m)) return $m[1];
    if (preg_match('/([\d.]+)\s*(?:qt|quart)/i', $title, $m)) return $m[1] * 946;
    if (preg_match('/([\d.]+)\s*kg/i', $title, $m)) return $m[1] * 1000;
    if (preg_match('/([\d.]+)\s*(?:gm|grams?|g)\b/i', $title, $m)) return $m[1];
    if (preg_match('/([\d.]+)\s*(?:oz|ounce)/i', $title, $m)) return $m[1] * 29.57;
    if (preg_match('/([\d.]+)\s*(?:lb|lbs|pound)/i', $title, $m)) return $m[1] * 453.6;
    return null;
}

$grouped_parents2 = $wpdb->get_results("
    SELECT p.ID, p.post_title, pm.meta_value as children_raw
    FROM {$wpdb->posts} p
    JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
    JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_children'
    WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped'
    AND p.post_status = 'publish'
");

$anomaly_count = 0;
foreach ($grouped_parents2 as $parent) {
    $child_ids = maybe_unserialize($parent->children_raw);
    if (!is_array($child_ids) || count($child_ids) < 2) continue;
    
    $sized = [];
    foreach ($child_ids as $cid) {
        $child = get_post($cid);
        if (!$child || $child->post_status !== 'publish') continue;
        $vol = extract_volume_ml2($child->post_title);
        $price = floatval(get_post_meta($cid, '_price', true));
        if ($vol && $price > 0) {
            $sized[] = ['title' => $child->post_title, 'vol' => $vol, 'price' => $price];
        }
    }
    
    usort($sized, function($a, $b) { return $a['vol'] <=> $b['vol']; });
    
    $has_anomaly = false;
    for ($i = 0; $i < count($sized) - 1; $i++) {
        $small = $sized[$i];
        $large = $sized[$i + 1];
        if ($large['price'] < $small['price'] * 0.6) {
            if (!$has_anomaly) {
                echo "  {$parent->post_title} (ID {$parent->ID}):\n";
                $has_anomaly = true;
            }
            echo "    {$small['title']} (\${$small['price']}) > {$large['title']} (\${$large['price']})\n";
        }
    }
    if ($has_anomaly) { $anomaly_count++; echo "\n"; }
}
echo "  Total groups with price anomalies: {$anomaly_count}\n";

echo "\n============================\n";
echo "SUMMARY\n";
echo "============================\n";
echo "Missing images: " . count($no_image_products) . "\n";
echo "  Matched in media library: {$matched}\n";
echo "  Need external sourcing: " . count($unmatched_products) . "\n";
echo "Too small images: {$too_small}\n";
echo "Good quality images: {$good_images}\n";
echo "Price anomalies remaining: {$anomaly_count}\n";
echo "============================\n";
