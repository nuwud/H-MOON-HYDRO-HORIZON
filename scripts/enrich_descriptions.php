<?php
/**
 * Fast Description Enrichment via Direct SQL
 * Uses Feb 12 WooCommerce export to fill missing descriptions
 * 
 * Much faster than wp_update_post() - uses direct SQL UPDATE
 * Run: CONFIRM=yes wp eval-file enrich_descriptions.php
 */
if (!defined('ABSPATH')) {}
global $wpdb;
wp_set_current_user(1);

$dry_run = getenv('CONFIRM') !== 'yes';
$mode = $dry_run ? "DRY-RUN" : "LIVE";
echo "=== FAST DESCRIPTION ENRICHMENT ({$mode}) ===\n\n";

$feb12_csv = dirname(__FILE__) . '/wc-product-export-12-2-2026.csv';
if (!file_exists($feb12_csv)) {
    echo "ERROR: Feb 12 CSV not found at {$feb12_csv}\n";
    exit(1);
}

// Load Feb 12 CSV
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
echo "Feb 12 CSV: " . count($feb12_data) . " rows\n";

// Build lookups
$desc_by_sku = [];
$desc_by_name = [];
$short_by_sku = [];
$short_by_name = [];

foreach ($feb12_data as $row) {
    $sku = trim($row['SKU'] ?? '');
    $name = trim($row['Name'] ?? '');
    $name_norm = mb_strtolower(trim(html_entity_decode($name, ENT_QUOTES|ENT_HTML5, 'UTF-8')));
    $desc = trim($row['Description'] ?? '');
    $short = trim($row['Short description'] ?? '');

    if ($desc) {
        if ($sku) $desc_by_sku[$sku] = $desc;
        if ($name_norm) $desc_by_name[$name_norm] = $desc;
    }
    if ($short) {
        if ($sku) $short_by_sku[$sku] = $short;
        if ($name_norm) $short_by_name[$name_norm] = $short;
    }
}
echo "Description sources: " . count($desc_by_sku) . " by SKU, " . count($desc_by_name) . " by name\n";
echo "Short desc sources: " . count($short_by_sku) . " by SKU, " . count($short_by_name) . " by name\n\n";

// Get products needing enrichment
$products = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt, pm.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_sku'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (p.post_content = '' OR p.post_excerpt = '')
");
echo "Products needing enrichment: " . count($products) . "\n\n";

$desc_added = 0;
$short_added = 0;
$batch_size = 50;
$batch = 0;

foreach ($products as $p) {
    $name_norm = mb_strtolower(trim(html_entity_decode($p->post_title, ENT_QUOTES|ENT_HTML5, 'UTF-8')));
    $need_desc = empty($p->post_content);
    $need_short = empty($p->post_excerpt);
    
    $new_desc = null;
    $new_short = null;

    if ($need_desc) {
        if ($p->sku && isset($desc_by_sku[$p->sku])) {
            $new_desc = $desc_by_sku[$p->sku];
        } elseif (isset($desc_by_name[$name_norm])) {
            $new_desc = $desc_by_name[$name_norm];
        }
    }

    if ($need_short) {
        if ($p->sku && isset($short_by_sku[$p->sku])) {
            $new_short = $short_by_sku[$p->sku];
        } elseif (isset($short_by_name[$name_norm])) {
            $new_short = $short_by_name[$name_norm];
        }
    }

    if ($new_desc || $new_short) {
        $set_parts = [];
        $values = [];
        
        if ($new_desc) {
            $set_parts[] = "post_content = %s";
            $values[] = $new_desc;
            $desc_added++;
        }
        if ($new_short) {
            $set_parts[] = "post_excerpt = %s";
            $values[] = $new_short;
            $short_added++;
        }
        
        $values[] = $p->ID;
        
        if (!$dry_run) {
            $sql = "UPDATE {$wpdb->posts} SET " . implode(', ', $set_parts) . " WHERE ID = %d";
            $wpdb->query($wpdb->prepare($sql, ...$values));
        }
        
        $batch++;
        if ($batch % 100 === 0) {
            echo "  Processed {$batch}...\n";
        }
    }
}

echo "\nResults:\n";
echo "  Descriptions added: {$desc_added}\n";
echo "  Short descriptions added: {$short_added}\n";

if ($dry_run) {
    echo "\n*** DRY-RUN: No changes made. Use CONFIRM=yes to apply. ***\n";
}

// Clear object cache if live
if (!$dry_run) {
    wp_cache_flush();
    echo "\nCache flushed.\n";
}

echo "\n=== DONE ===\n";
