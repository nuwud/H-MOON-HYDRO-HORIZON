<?php
/**
 * fix_product_types.php
 * Fixes products that are missing _product_type meta
 * Run via: wp eval-file wp-content/fix_product_types.php
 */

global $wpdb;

$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$csv_file = $site_root . '/wp-content/product_import.csv';

if (!file_exists($csv_file)) {
    echo "CSV file not found: {$csv_file}\n";
    exit(1);
}

// Build a map of slug => type from CSV
$handle = fopen($csv_file, 'r');
$headers = fgetcsv($handle);
$col = array_flip(array_map('trim', $headers));

$slug_type_map = [];
$sku_type_map = [];

while (($row = fgetcsv($handle)) !== false) {
    if (count($row) < 5) continue;
    
    $name = isset($row[$col['Name']]) ? trim($row[$col['Name']]) : '';
    $type = isset($row[$col['Type']]) ? strtolower(trim($row[$col['Type']])) : 'simple';
    $sku = isset($row[$col['SKU']]) ? trim($row[$col['SKU']]) : '';
    
    // Skip variations for now
    if ($type === 'variation') continue;
    
    // Generate slug
    $slug = sanitize_title($name);
    
    // Map type
    if ($type === 'variable') {
        $woo_type = 'variable';
    } else {
        $woo_type = 'simple';
    }
    
    if ($slug) {
        $slug_type_map[$slug] = $woo_type;
    }
    if ($sku) {
        $sku_type_map[$sku] = $woo_type;
    }
}
fclose($handle);

echo "Loaded " . count($slug_type_map) . " slug mappings from CSV\n";
echo "Loaded " . count($sku_type_map) . " SKU mappings from CSV\n\n";

// Find all products without _product_type
$products_without_type = $wpdb->get_results("
    SELECT p.ID, p.post_name, p.post_title
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_product_type'
    WHERE p.post_type = 'product'
      AND pm.meta_value IS NULL
");

echo "Found " . count($products_without_type) . " products without _product_type\n\n";

$stats = [
    'simple' => 0,
    'variable' => 0,
    'default' => 0,
];

foreach ($products_without_type as $product) {
    $type = 'simple'; // Default
    
    // Try to match by slug
    if (isset($slug_type_map[$product->post_name])) {
        $type = $slug_type_map[$product->post_name];
    } else {
        // Try to get SKU and match
        $sku = get_post_meta($product->ID, '_sku', true);
        if ($sku && isset($sku_type_map[$sku])) {
            $type = $sku_type_map[$sku];
        }
    }
    
    // Set the product type
    update_post_meta($product->ID, '_product_type', $type);
    $stats[$type]++;
    
    if (($stats['simple'] + $stats['variable'] + $stats['default']) % 200 === 0) {
        echo "Processed: " . ($stats['simple'] + $stats['variable']) . "\n";
    }
}

echo "\n========== FIX COMPLETE ==========\n";
echo "Set as 'simple': {$stats['simple']}\n";
echo "Set as 'variable': {$stats['variable']}\n";
echo "Default (simple): {$stats['default']}\n";
echo "Total: " . ($stats['simple'] + $stats['variable'] + $stats['default']) . "\n";
