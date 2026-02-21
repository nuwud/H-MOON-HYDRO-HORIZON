<?php
/**
 * apply_enrichment.php — Apply scraped enrichment data to WooCommerce products
 * Reads enrichment_to_apply.json uploaded alongside this script
 * 
 * Handles: image_url, gallery_urls, brand, short_description
 */
wp_set_current_user(1);
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN ===\n\n" : "=== LIVE MODE ===\n\n";

// Read enrichment data
$json_file = dirname(__FILE__) . '/enrichment_to_apply.json';
if (!file_exists($json_file)) {
    echo "ERROR: enrichment_to_apply.json not found at: {$json_file}\n";
    exit(1);
}
$enrichments = json_decode(file_get_contents($json_file), true);
echo "Enrichment records: " . count($enrichments) . "\n\n";

$stats = array('image'=>0, 'gallery'=>0, 'brand'=>0, 'short_desc'=>0, 'errors'=>0);

foreach ($enrichments as $i => $en) {
    $pid = $en['id'];
    $title = $en['title'];
    $apply = $en['apply'];
    $score = $en['score'];
    
    // Only auto-apply high-confidence matches (>= 0.80)
    if ($score < 0.60) continue;
    
    $changes = array();
    
    // --- MAIN IMAGE ---
    if (!empty($apply['image_url'])) {
        $url = $apply['image_url'];
        $changes[] = "image: " . basename(parse_url($url, PHP_URL_PATH));
        
        if (!$dry_run) {
            $tmp = download_url($url, 30);
            if (!is_wp_error($tmp)) {
                $file_array = array(
                    'name' => sanitize_file_name(basename(parse_url($url, PHP_URL_PATH))),
                    'tmp_name' => $tmp,
                );
                $att_id = media_handle_sideload($file_array, $pid, $title);
                if (!is_wp_error($att_id)) {
                    set_post_thumbnail($pid, $att_id);
                    $stats['image']++;
                } else {
                    echo "  ERROR image #{$pid}: " . $att_id->get_error_message() . "\n";
                    $stats['errors']++;
                }
            } else {
                echo "  ERROR download #{$pid}: " . $tmp->get_error_message() . "\n";
                $stats['errors']++;
                @unlink($tmp);
            }
        } else {
            $stats['image']++;
        }
    }
    
    // --- GALLERY IMAGES ---
    if (!empty($apply['gallery_urls'])) {
        $gallery_ids = array();
        $existing = get_post_meta($pid, '_product_image_gallery', true);
        if (!empty($existing)) {
            $gallery_ids = explode(',', $existing);
        }
        
        $count = count($apply['gallery_urls']);
        $changes[] = "gallery: +{$count} images";
        
        if (!$dry_run) {
            $added = 0;
            foreach ($apply['gallery_urls'] as $gurl) {
                if ($added >= 5) break; // Max 5 gallery images per product
                
                $tmp = download_url($gurl, 30);
                if (!is_wp_error($tmp)) {
                    $file_array = array(
                        'name' => sanitize_file_name(basename(parse_url($gurl, PHP_URL_PATH))),
                        'tmp_name' => $tmp,
                    );
                    $att_id = media_handle_sideload($file_array, $pid);
                    if (!is_wp_error($att_id)) {
                        $gallery_ids[] = $att_id;
                        $added++;
                    }
                } else {
                    @unlink($tmp);
                }
            }
            if (!empty($gallery_ids)) {
                update_post_meta($pid, '_product_image_gallery', implode(',', array_unique($gallery_ids)));
                $stats['gallery']++;
            }
        } else {
            $stats['gallery']++;
        }
    }
    
    // --- BRAND ---
    if (!empty($apply['brand'])) {
        $brand_name = $apply['brand'];
        $changes[] = "brand: {$brand_name}";
        
        if (!$dry_run) {
            $bt = get_term_by('name', $brand_name, 'pwb-brand');
            if (!$bt) {
                $r = wp_insert_term($brand_name, 'pwb-brand');
                if (!is_wp_error($r)) {
                    $bt = get_term_by('term_id', $r['term_id'], 'pwb-brand');
                }
            }
            if ($bt) {
                wp_set_object_terms($pid, array($bt->term_id), 'pwb-brand', false);
                $stats['brand']++;
            }
        } else {
            $stats['brand']++;
        }
    }
    
    // --- SHORT DESCRIPTION ---
    if (!empty($apply['short_description'])) {
        $short = $apply['short_description'];
        $changes[] = "short_desc: " . strlen($short) . " chars";
        
        if (!$dry_run) {
            wp_update_post(array('ID' => $pid, 'post_excerpt' => $short));
            $stats['short_desc']++;
        } else {
            $stats['short_desc']++;
        }
    }
    
    if (!empty($changes)) {
        $label = ($score >= 0.80) ? "HIGH" : "MED";
        echo "  #{$pid} [{$label} {$score}] " . implode(' | ', $changes) . "\n";
    }
    
    // Progress update every 50
    if (($i + 1) % 50 === 0) {
        echo "  ... processed " . ($i + 1) . "/" . count($enrichments) . "\n";
    }
}

echo "\n=== RESULTS ===\n";
echo "  Images set:         {$stats['image']}\n";
echo "  Galleries added:    {$stats['gallery']}\n";
echo "  Brands assigned:    {$stats['brand']}\n";
echo "  Short descs added:  {$stats['short_desc']}\n";
echo "  Errors:             {$stats['errors']}\n";
echo "\n";
if ($dry_run) echo "*** DRY RUN — use CONFIRM=1 to apply ***\n";
