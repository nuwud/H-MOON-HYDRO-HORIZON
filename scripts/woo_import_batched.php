<?php
/**
 * Batched WooCommerce CSV Import Script
 * 
 * Processes in small batches (50 rows) like the admin UI does,
 * ensuring parent products are committed before variations.
 */
ini_set("memory_limit", "1024M");
set_time_limit(0);
error_reporting(E_ALL);

require_once(__DIR__ . "/../wp-load.php");

if (!class_exists("WC_Product_CSV_Importer")) {
    include_once WC_ABSPATH . "includes/import/class-wc-product-csv-importer.php";
}

$file = dirname(__DIR__) . "/woocommerce_PERFECT_IMPORT.csv";
if (!file_exists($file)) {
    echo "File not found: $file\n";
    exit(1);
}

echo "File: " . $file . " (" . filesize($file) . " bytes)\n";

// Column mapping
$mapping = array(
    "Type"                    => "type",
    "SKU"                     => "sku",
    "Name"                    => "name",
    "Published"               => "published",
    "Is featured?"            => "featured",
    "Visibility in catalog"   => "catalog_visibility",
    "Short description"       => "short_description",
    "Description"             => "description",
    "Tax status"              => "tax_status",
    "Tax class"               => "tax_class",
    "In stock?"               => "stock_status",
    "Stock"                   => "stock_quantity",
    "Backorders allowed?"     => "backorders",
    "Sold individually?"      => "sold_individually",
    "Weight (lbs)"            => "weight",
    "Length (in)"             => "length",
    "Width (in)"              => "width",
    "Height (in)"             => "height",
    "Allow customer reviews?" => "reviews_allowed",
    "Purchase note"           => "purchase_note",
    "Sale price"              => "sale_price",
    "Regular price"           => "regular_price",
    "Categories"              => "category_ids",
    "Tags"                    => "tag_ids",
    "Shipping class"          => "shipping_class_id",
    "Images"                  => "images",
    "Download limit"          => "download_limit",
    "Download expiry days"    => "download_expiry",
    "Parent"                  => "parent_id",
    "Grouped products"        => "grouped_products",
    "Upsells"                 => "upsell_ids",
    "Cross-sells"             => "cross_sell_ids",
    "External URL"            => "product_url",
    "Button text"             => "button_text",
    "Position"                => "menu_order",
    "Brands"                  => "meta:brand",
    "Attribute 1 name"        => "attributes:name1",
    "Attribute 1 value(s)"    => "attributes:value1",
    "Attribute 1 visible"     => "attributes:visible1",
    "Attribute 1 global"      => "attributes:taxonomy1",
    "Attribute 1 default"     => "attributes:default1",
);

$batch_size = 50;
$position = 0;
$total_imported = 0;
$total_updated = 0;
$total_skipped = 0;
$total_failed = 0;
$batch_num = 0;
$failures = array();

echo "Starting batched import (batch size: $batch_size)...\n\n";

while (true) {
    $batch_num++;
    
    $args = array(
        "mapping"          => $mapping,
        "parse"            => true,
        "prevent_timeouts" => false,
        "lines"            => $batch_size,
        "start_pos"        => $position,
    );

    $importer = new WC_Product_CSV_Importer($file, $args);
    
    // Check if we have data to process
    $parsed = $importer->get_parsed_data();
    if (empty($parsed)) {
        echo "No more data to process.\n";
        break;
    }
    
    $results = $importer->import();
    
    $imported = count($results["imported"]);
    $updated = count($results["updated"]);
    $skipped = count($results["skipped"]);
    $failed = count($results["failed"]);
    
    $total_imported += $imported;
    $total_updated += $updated;
    $total_skipped += $skipped;
    $total_failed += $failed;
    
    // Collect failure info
    if ($failed > 0) {
        foreach ($results["failed"] as $fail) {
            $row_num = isset($fail["row"]) ? $fail["row"] : "?";
            $data = isset($fail["data"]) ? $fail["data"] : null;
            $msg = "unknown";
            if (is_wp_error($data)) {
                $msg = $data->get_error_message();
            } elseif (is_array($data) && isset($data["name"])) {
                $msg = "Failed to import: " . $data["name"];
            }
            $failures[] = "Row $row_num: $msg";
        }
    }
    
    echo "Batch $batch_num: pos=$position, imported=$imported, updated=$updated, skipped=$skipped, failed=$failed\n";
    
    // Get file position for next batch
    $position = $importer->get_file_position();
    
    // Safety: if position didn't advance, we're stuck
    if ($position === 0 && $batch_num > 1) {
        echo "ERROR: File position didn't advance. Stopping.\n";
        break;
    }
    
    // Clear WC caches between batches to ensure parent lookups work
    wp_cache_flush();
    wc_delete_product_transients();
}

echo "\n=== FINAL RESULTS ===\n";
echo "Total Imported: $total_imported\n";
echo "Total Updated:  $total_updated\n";
echo "Total Skipped:  $total_skipped\n";
echo "Total Failed:   $total_failed\n";
echo "Batches:        $batch_num\n";

if (count($failures) > 0) {
    echo "\n=== FAILURES (first 30) ===\n";
    foreach (array_slice($failures, 0, 30) as $f) {
        echo "  $f\n";
    }
    if (count($failures) > 30) {
        echo "  ... and " . (count($failures) - 30) . " more\n";
    }
}

// Post-import stats
echo "\n=== DATABASE COUNTS ===\n";
global $wpdb;
$products = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product'");
$variations = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product_variation'");
$types = $wpdb->get_results("SELECT t.name, COUNT(*) as cnt FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'product_type' JOIN {$wpdb->terms} t ON tt.term_id = t.term_id WHERE p.post_type = 'product' GROUP BY t.name");

echo "Products: $products\n";
echo "Variations: $variations\n";
echo "By type:\n";
foreach ($types as $t) {
    echo "  {$t->name}: {$t->cnt}\n";
}

echo "\nDone.\n";
