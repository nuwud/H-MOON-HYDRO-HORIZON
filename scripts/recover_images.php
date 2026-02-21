<?php
/**
 * Image Recovery from Old Uploads
 * 
 * Search wp-content/uploads (7,498 images from 2019, 883 from 2021, etc.)
 * for images matching products that currently have no thumbnail.
 * 
 * Strategy:
 * 1. Get all products without thumbnails
 * 2. Generate search terms from product title/slug
 * 3. Search existing attachments by filename similarity
 * 4. If attachment exists but isn't linked, assign it
 * 5. Report unmatched products for manual review
 */
wp_set_current_user(1);
global $wpdb;

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN MODE ===\n\n" : "=== LIVE MODE ===\n\n";

// Get all products without thumbnails
$no_thumb = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_name 
    FROM {$wpdb->posts} p
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND NOT EXISTS (
        SELECT 1 FROM {$wpdb->postmeta} pm 
        WHERE pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id' 
        AND pm.meta_value > 0 AND pm.meta_value != ''
    )
    ORDER BY p.post_title
");

echo "Products without thumbnail: " . count($no_thumb) . "\n\n";

$matched = 0;
$unmatched = array();

foreach ($no_thumb as $product) {
    // Generate search terms from title
    $title = $product->post_title;
    $slug = $product->post_name;
    
    // Clean title for searching
    $clean = preg_replace('/[^a-z0-9\s]/', ' ', strtolower($title));
    $words = array_values(array_filter(explode(' ', $clean), function($w) {
        return strlen($w) > 2 && !in_array($w, array(
            'the', 'and', 'for', 'with', 'from', 'gallon', 'gal', 'quart', 'qts',
            'liter', 'pack', 'seed', 'auto', 'feminised', 'feminized', 'case',
            'heavy', 'duty', 'premium', '100', '200', '300', '500', '1000',
            'photo', 'bag', 'per', 'sol', 'plant', 'set', 'box'
        ));
    }));
    
    if (empty($words)) continue;
    
    $best_match = null;
    $best_score = 0;
    
    // Strategy 1: Search by primary keywords (first 2-3 significant words)
    $search_words = array_slice($words, 0, min(4, count($words)));
    
    foreach ($search_words as $word) {
        if (strlen($word) < 3) continue;
        
        $candidates = $wpdb->get_results($wpdb->prepare("
            SELECT ID, guid, post_title 
            FROM {$wpdb->posts}
            WHERE post_type = 'attachment' 
            AND post_mime_type LIKE 'image/%%'
            AND (LOWER(guid) LIKE %s OR LOWER(post_title) LIKE %s)
            LIMIT 20
        ", '%' . strtolower($word) . '%', '%' . strtolower($word) . '%'));
        
        foreach ($candidates as $cand) {
            $cand_text = strtolower(basename($cand->guid) . ' ' . $cand->post_title);
            $score = 0;
            $matched_words = array();
            foreach ($words as $w) {
                if (strlen($w) >= 3 && strpos($cand_text, $w) !== false) {
                    $score++;
                    $matched_words[] = $w;
                }
            }
            // Bonus for slug match
            if (strpos($cand_text, str_replace('-', '', $slug)) !== false) {
                $score += 3;
            }
            
            if ($score > $best_score) {
                $best_score = $score;
                $best_match = $cand;
            }
        }
    }
    
    // Strategy 2: Search by slug
    if ($best_score < 2) {
        $slug_variants = array(
            $slug,
            str_replace('-', '', $slug),
            str_replace('-', '_', $slug),
        );
        foreach ($slug_variants as $sv) {
            if (strlen($sv) < 5) continue;
            $candidates = $wpdb->get_results($wpdb->prepare("
                SELECT ID, guid, post_title 
                FROM {$wpdb->posts}
                WHERE post_type = 'attachment' 
                AND post_mime_type LIKE 'image/%%'
                AND LOWER(guid) LIKE %s
                LIMIT 5
            ", '%' . strtolower($sv) . '%'));
            
            foreach ($candidates as $cand) {
                $cand_text = strtolower(basename($cand->guid) . ' ' . $cand->post_title);
                $score = 0;
                foreach ($words as $w) {
                    if (strlen($w) >= 3 && strpos($cand_text, $w) !== false) {
                        $score++;
                    }
                }
                $score += 2; // bonus for slug match
                if ($score > $best_score) {
                    $best_score = $score;
                    $best_match = $cand;
                }
            }
        }
    }
    
    // Strategy 3: Brand-specific product image search
    // Get brand for this product
    $brand_terms = wp_get_object_terms($product->ID, 'pwb-brand', array('fields' => 'names'));
    if (!is_wp_error($brand_terms) && !empty($brand_terms)) {
        $brand = strtolower($brand_terms[0]);
        // Search for brand + key product word
        if (count($words) >= 2 && $best_score < 2) {
            $brand_search = $brand . '%' . $words[0];
            $candidates = $wpdb->get_results($wpdb->prepare("
                SELECT ID, guid, post_title 
                FROM {$wpdb->posts}
                WHERE post_type = 'attachment' 
                AND post_mime_type LIKE 'image/%%'
                AND (LOWER(guid) LIKE %s OR LOWER(post_title) LIKE %s)
                LIMIT 10
            ", '%' . strtolower($words[0]) . '%', '%' . strtolower($words[0]) . '%'));
            
            foreach ($candidates as $cand) {
                $cand_text = strtolower(basename($cand->guid) . ' ' . $cand->post_title);
                if (strpos($cand_text, $brand) !== false || strpos($cand_text, str_replace(' ', '-', $brand)) !== false) {
                    $score = 3; // brand + word match
                    foreach ($words as $w) {
                        if (strlen($w) >= 3 && strpos($cand_text, $w) !== false) {
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
    }
    
    if ($best_match && $best_score >= 2) {
        echo "  MATCH #{$product->ID} \"{$title}\"\n";
        echo "    -> Att#{$best_match->ID} " . basename($best_match->guid) . " (score={$best_score})\n";
        if (!$dry_run) {
            update_post_meta($product->ID, '_thumbnail_id', $best_match->ID);
        }
        $matched++;
    } else {
        $brand_str = (!is_wp_error($brand_terms) && !empty($brand_terms)) ? $brand_terms[0] : 'Unknown';
        $unmatched[] = "#{$product->ID} [{$brand_str}] {$title}";
    }
}

echo "\n=== SUMMARY ===\n";
echo "Matched and assigned: {$matched}\n";
echo "Still unmatched: " . count($unmatched) . "\n";

if (!empty($unmatched)) {
    echo "\nUnmatched products (need manual image sourcing):\n";
    foreach ($unmatched as $u) {
        echo "  {$u}\n";
    }
}

if ($dry_run) {
    echo "\n*** DRY RUN - no changes made. Run with CONFIRM=1 to apply. ***\n";
}
