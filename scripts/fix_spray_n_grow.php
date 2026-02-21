<?php
/**
 * Fix Spray N Grow Image Misassignment
 * 
 * Attachment #70852 (32-oz.-sprayNgrow-200x200.jpg.webp) was incorrectly 
 * assigned as thumbnail to 55 products that have nothing to do with Spray N Grow.
 * 
 * Strategy:
 * 1. Remove wrong thumbnail from non-Spray-N-Grow products  
 * 2. Try to find correct images in wp-content/uploads by matching product title
 * 3. If no match found, remove the thumbnail (better no image than wrong image)
 */
wp_set_current_user(1);
global $wpdb;

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN MODE ===\n\n" : "=== LIVE MODE ===\n\n";

// The misassigned Spray N Grow attachment ID
$bad_thumb_id = 70852;

// Get all products using this wrong thumbnail
$products = $wpdb->get_results($wpdb->prepare("
    SELECT p.ID, p.post_title, p.post_name 
    FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
    WHERE pm.meta_key = '_thumbnail_id' AND pm.meta_value = %d
    AND p.post_type = 'product' AND p.post_status = 'publish'
    ORDER BY p.post_title
", $bad_thumb_id));

echo "Products with wrong Spray N Grow thumbnail: " . count($products) . "\n\n";

// Products that SHOULD have this image (Spray N Grow products)
$legit_spray = array();
foreach ($products as $p) {
    if (stripos($p->post_title, 'spray') !== false && stripos($p->post_title, 'grow') !== false) {
        $legit_spray[] = $p->ID;
        echo "KEEPING (legit Spray N Grow): #{$p->ID} {$p->post_title}\n";
    }
}

echo "\n--- Products to FIX ---\n\n";

$fixed = 0;
$image_found = 0;
$image_removed = 0;

foreach ($products as $p) {
    if (in_array($p->ID, $legit_spray)) continue;
    
    echo "#{$p->ID} {$p->post_title}\n";
    
    // Try to find a better image by searching attachments
    $title_clean = preg_replace('/[^a-z0-9\s]/', '', strtolower($p->post_title));
    $words = array_filter(explode(' ', $title_clean), function($w) {
        return strlen($w) > 3 && !in_array($w, array('with', 'from', 'the', 'and', 'for', 'gallon', 'quart', 'pack', 'seed', 'auto'));
    });
    
    $best_match = null;
    $best_score = 0;
    
    if (!empty($words)) {
        // Search for matching attachment by title or filename
        $search_terms = array_slice($words, 0, 3); // Use first 3 significant words
        
        foreach ($search_terms as $word) {
            if (strlen($word) < 4) continue;
            
            $candidates = $wpdb->get_results($wpdb->prepare("
                SELECT ID, guid, post_title 
                FROM {$wpdb->posts}
                WHERE post_type = 'attachment' 
                AND post_mime_type LIKE 'image/%%'
                AND ID != %d
                AND (LOWER(post_title) LIKE %s OR LOWER(guid) LIKE %s)
                LIMIT 10
            ", $bad_thumb_id, '%' . strtolower($word) . '%', '%' . strtolower($word) . '%'));
            
            foreach ($candidates as $cand) {
                $score = 0;
                $cand_name = strtolower($cand->post_title . ' ' . basename($cand->guid));
                foreach ($words as $w) {
                    if (stripos($cand_name, $w) !== false) {
                        $score++;
                    }
                }
                if ($score > $best_score) {
                    $best_score = $score;
                    $best_match = $cand;
                }
            }
        }
    }
    
    if ($best_match && $best_score >= 2) {
        echo "  -> FOUND better image: Att#{$best_match->ID} (" . basename($best_match->guid) . ") score={$best_score}\n";
        if (!$dry_run) {
            update_post_meta($p->ID, '_thumbnail_id', $best_match->ID);
        }
        $image_found++;
    } else {
        echo "  -> REMOVING wrong thumbnail (no suitable replacement found)\n";
        if (!$dry_run) {
            delete_post_meta($p->ID, '_thumbnail_id');
        }
        $image_removed++;
    }
    $fixed++;
}

echo "\n=== SUMMARY ===\n";
echo "Total with wrong image: " . count($products) . "\n";
echo "Legitimate Spray N Grow products (kept): " . count($legit_spray) . "\n";
echo "Fixed with better image: {$image_found}\n";
echo "Thumbnail removed (no replacement): {$image_removed}\n";
echo "Total fixed: {$fixed}\n";

if ($dry_run) {
    echo "\n*** DRY RUN - no changes made. Run with CONFIRM=1 to apply. ***\n";
}
