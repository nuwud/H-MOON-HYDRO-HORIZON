<?php
/**
 * Faithful WooCommerce Import - Two Pass
 * 
 * Pass 1: Simple products (children that grouped products reference)
 * Pass 2: Grouped products (they reference children by SKU)
 * 
 * Usage: php woo_faithful_import.php [pass1|pass2|both]
 */
ini_set("memory_limit", "512M");
set_time_limit(0);

require_once(__DIR__ . "/wp-load.php");
wp_set_current_user(1); // CRITICAL: Set admin user so current_user_can() works for category creation

if (!class_exists("WC_Product_CSV_Importer")) {
    include_once WC_ABSPATH . "includes/import/class-wc-product-csv-importer.php";
}

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
    "In stock?"               => "stock_status",
    "Stock"                   => "stock_quantity",
    "Backorders allowed?"     => "backorders",
    "Weight (lbs)"            => "weight",
    "Length (in)"             => "length",
    "Width (in)"              => "width",
    "Height (in)"             => "height",
    "Allow customer reviews?" => "reviews_allowed",
    "Regular price"           => "regular_price",
    "Sale price"              => "sale_price",
    "Categories"              => "category_ids",
    "Tags"                    => "tag_ids",
    "Images"                  => "images",
    "Grouped products"        => "grouped_products",
    "Brands"                  => "meta:brand",
);

function run_import($file, $mapping, $label) {
    if (!file_exists($file)) {
        echo "ERROR: File not found: $file\n";
        return false;
    }
    
    echo "=== $label ===\n";
    echo "File: $file (" . filesize($file) . " bytes)\n";
    
    $args = array(
        "mapping"          => $mapping,
        "parse"            => true,
        "prevent_timeouts" => false,
    );
    
    $importer = new WC_Product_CSV_Importer($file, $args);
    echo "Processing...\n";
    $results = $importer->import();
    
    $imported = count($results["imported"]);
    $updated = count($results["updated"]);
    $skipped = count($results["skipped"]);
    $failed = count($results["failed"]);
    
    echo "Imported: $imported\n";
    echo "Updated:  $updated\n";
    echo "Skipped:  $skipped\n";
    echo "Failed:   $failed\n";
    
    if ($failed > 0) {
        echo "\nFailure details (first 20):\n";
        $count = 0;
        foreach ($results["failed"] as $key => $fail) {
            if ($count >= 20) break;
            $count++;
            if (is_wp_error($fail)) {
                echo "  Item $key: " . $fail->get_error_message() . "\n";
            } elseif (is_array($fail)) {
                $row = isset($fail["row"]) ? $fail["row"] : $key;
                $data = isset($fail["data"]) ? $fail["data"] : $fail;
                if (is_wp_error($data)) {
                    echo "  Row $row: " . $data->get_error_message() . "\n";
                } elseif (is_array($data) && isset($data["sku"])) {
                    echo "  Row $row: SKU={$data['sku']}\n";
                } else {
                    echo "  Row $row: " . substr(json_encode($data), 0, 200) . "\n";
                }
            }
        }
    }
    
    echo "\n";
    return array("imported" => $imported, "failed" => $failed);
}

$mode = isset($argv[1]) ? $argv[1] : "both";

if ($mode === "pass1" || $mode === "both") {
    echo "===========================================\n";
    echo "PASS 1: Simple products\n";
    echo "===========================================\n";
    run_import(__DIR__ . "/woo_faithful_pass1_simple.csv", $mapping, "Simple Products");
    
    global $wpdb;
    $count = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product'");
    echo "Products in DB after pass 1: $count\n\n";
}

if ($mode === "pass2" || $mode === "both") {
    if ($mode === "both") {
        echo "Pausing 5 seconds between passes...\n";
        sleep(5);
        wp_cache_flush();
    }
    
    echo "===========================================\n";
    echo "PASS 2: Grouped products\n";
    echo "===========================================\n";
    run_import(__DIR__ . "/woo_faithful_pass2_grouped.csv", $mapping, "Grouped Products");
}

// Final stats
global $wpdb;
$products = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product'");
$types = $wpdb->get_results("SELECT t.name, COUNT(*) as cnt FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'product_type' JOIN {$wpdb->terms} t ON tt.term_id = t.term_id WHERE p.post_type = 'product' GROUP BY t.name");
$cats = $wpdb->get_results("SELECT t.name, tt.count FROM {$wpdb->terms} t JOIN {$wpdb->term_taxonomy} tt ON t.term_id = tt.term_id WHERE tt.taxonomy = 'product_cat' AND tt.count > 0 ORDER BY tt.count DESC LIMIT 20");

echo "===========================================\n";
echo "FINAL DATABASE STATE\n";
echo "===========================================\n";
echo "Total Products: $products\n";
echo "\nBy type:\n";
foreach ($types as $t) {
    echo "  {$t->name}: {$t->cnt}\n";
}
echo "\nTop categories:\n";
foreach ($cats as $c) {
    echo "  {$c->count}\t{$c->name}\n";
}
echo "\nDone.\n";
