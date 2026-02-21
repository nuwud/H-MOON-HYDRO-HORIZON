<?php
/**
 * Two-Pass WooCommerce CSV Import
 * Pass 1: Import simple + variable products (no variations)
 * Pass 2: Import variations (parents already in DB)
 * 
 * Usage: php woo_import_2pass.php [pass1|pass2|both]
 */
ini_set("memory_limit", "512M");
set_time_limit(0);

require_once(__DIR__ . "/wp-load.php");

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
            
            // Try multiple failure data formats
            if (is_wp_error($fail)) {
                echo "  Item $key: " . $fail->get_error_message() . "\n";
            } elseif (is_array($fail)) {
                $row = isset($fail["row"]) ? $fail["row"] : $key;
                $data = isset($fail["data"]) ? $fail["data"] : $fail;
                if (is_wp_error($data)) {
                    echo "  Row $row: " . $data->get_error_message() . "\n";
                } elseif (is_array($data) && isset($data["sku"])) {
                    echo "  Row $row: SKU={$data['sku']}, Type=" . (isset($data['type']) ? $data['type'] : '?') . "\n";
                } else {
                    echo "  Row $row: " . substr(json_encode($data), 0, 200) . "\n";
                }
            } else {
                echo "  Item $key: " . substr(var_export($fail, true), 0, 200) . "\n";
            }
        }
    }
    
    echo "\n";
    return array("imported" => $imported, "failed" => $failed);
}

$mode = isset($argv[1]) ? $argv[1] : "both";

if ($mode === "pass1" || $mode === "both") {
    echo "===========================================\n";
    echo "PASS 1: Importing products (simple + variable)\n";
    echo "===========================================\n";
    $r1 = run_import(__DIR__ . "/woo_import_products.csv", $mapping, "Products Import");
    
    // Show DB state
    global $wpdb;
    $count = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product'");
    echo "Products in DB after pass 1: $count\n\n";
}

if ($mode === "pass2" || $mode === "both") {
    if ($mode === "both") {
        echo "Pausing 5 seconds between passes...\n\n";
        sleep(5);
    }
    
    echo "===========================================\n";
    echo "PASS 2: Importing variations\n";
    echo "===========================================\n";
    $r2 = run_import(__DIR__ . "/woo_import_variations.csv", $mapping, "Variations Import");
}

// Final stats
global $wpdb;
$products = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product'");
$variations = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product_variation'");
$types = $wpdb->get_results("SELECT t.name, COUNT(*) as cnt FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'product_type' JOIN {$wpdb->terms} t ON tt.term_id = t.term_id WHERE p.post_type = 'product' GROUP BY t.name");

echo "===========================================\n";
echo "FINAL DATABASE STATE\n";
echo "===========================================\n";
echo "Products:   $products\n";
echo "Variations: $variations\n";
echo "By type:\n";
foreach ($types as $t) {
    echo "  {$t->name}: {$t->cnt}\n";
}
echo "\nDone.\n";
