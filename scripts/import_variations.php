<?php
/**
 * import_variations.php — Import product variations after parent products exist
 * Run via: wp eval-file wp-content/import_variations.php
 */

ini_set('memory_limit', '512M');
set_time_limit(0);

$csv_file = ABSPATH . 'wp-content/product_import.csv';

if (!file_exists($csv_file)) {
    echo "ERROR: CSV file not found at $csv_file\n";
    exit(1);
}

// Build parent SKU → Product ID map AND slug → Product ID map AND title → Product ID map
echo "Building parent product map...\n";
$parent_map = [];  // SKU → ID
$slug_map = [];    // post_name slug → ID  
$title_map = [];   // sanitized title slug → ID
$all_slugs = [];   // for fuzzy matching

$args = [
    'post_type' => 'product',
    'posts_per_page' => -1,
    'post_status' => 'any',
];

$products = get_posts($args);
foreach ($products as $post) {
    $product = wc_get_product($post->ID);
    if (!$product) continue;
    
    $sku = $product->get_sku();
    if ($sku) {
        $parent_map[$sku] = $post->ID;
    }
    
    // Map by actual slug (post_name)
    $slug = $post->post_name;
    if ($slug) {
        $slug_map[$slug] = $post->ID;
        $all_slugs[] = $slug;
    }
    
    // Also map by sanitized title (what the expected slug should be)
    $title_slug = sanitize_title($post->post_title);
    if ($title_slug && !isset($title_map[$title_slug])) {
        $title_map[$title_slug] = $post->ID;
    }
}
echo "Found " . count($parent_map) . " parent products with SKUs\n";
echo "Found " . count($slug_map) . " parent products with slugs\n";
echo "Found " . count($title_map) . " parent products with title slugs\n\n";

// Read CSV
$handle = fopen($csv_file, 'r');
$headers = fgetcsv($handle);
$headers = array_map('trim', $headers);
$col = array_flip($headers);

$stats = [
    'processed' => 0,
    'created' => 0,
    'updated' => 0,
    'skipped' => 0,
    'parent_not_found' => 0,
    'errors' => 0,
];
$errors = [];

echo "Processing variations...\n";

$batch = [];
$batch_size = 25;

while (($row = fgetcsv($handle)) !== false) {
    if (count($row) < 5) continue;
    
    $data = [];
    foreach ($headers as $i => $header) {
        $data[$header] = isset($row[$i]) ? trim($row[$i]) : '';
    }
    
    // Only process variations
    if (strtolower($data['Type'] ?? '') !== 'variation') {
        continue;
    }
    
    $batch[] = $data;
    
    if (count($batch) >= $batch_size) {
        process_variations($batch, $stats, $errors, $parent_map, $slug_map, $title_map, $all_slugs);
        $batch = [];
        echo "Processed: {$stats['processed']} | Created: {$stats['created']} | Parent not found: {$stats['parent_not_found']}\n";
    }
}

// Process remaining
if (!empty($batch)) {
    process_variations($batch, $stats, $errors, $parent_map, $slug_map, $title_map, $all_slugs);
}

fclose($handle);

echo "\n========== VARIATION IMPORT COMPLETE ==========\n";
echo "Total processed: {$stats['processed']}\n";
echo "Created: {$stats['created']}\n";
echo "Updated: {$stats['updated']}\n";
echo "Skipped: {$stats['skipped']}\n";
echo "Parent not found: {$stats['parent_not_found']}\n";
echo "Errors: {$stats['errors']}\n";

if (!empty($errors)) {
    echo "\nFirst 10 errors:\n";
    foreach (array_slice($errors, 0, 10) as $err) {
        echo "  - {$err}\n";
    }
}

function process_variations(&$batch, &$stats, &$errors, &$parent_map, &$slug_map, &$title_map, &$all_slugs) {
    foreach ($batch as $data) {
        $stats['processed']++;
        
        $sku = $data['SKU'] ?? '';
        $name = $data['Name'] ?? '';
        $parent_ref = $data['Parent'] ?? '';
        
        // Find parent - try multiple methods
        $parent_id = 0;
        
        if (!empty($parent_ref)) {
            // Method 1: Try slug map first (exact slug match)
            if (isset($slug_map[$parent_ref])) {
                $parent_id = $slug_map[$parent_ref];
            }
            // Method 2: Try title-based slug map
            elseif (isset($title_map[$parent_ref])) {
                $parent_id = $title_map[$parent_ref];
            }
            // Method 3: Try SKU match
            elseif (isset($parent_map[$parent_ref])) {
                $parent_id = $parent_map[$parent_ref];
            }
            // Method 4: Fuzzy match - find slugs ending with parent_ref
            if (!$parent_id) {
                foreach ($all_slugs as $actual_slug) {
                    // Slug ends with parent_ref (e.g., "6-in-backdraft-damper" ends with "backdraft-damper")
                    if (strlen($actual_slug) > strlen($parent_ref) && 
                        substr($actual_slug, -strlen($parent_ref) - 1) === '-' . $parent_ref) {
                        $parent_id = $slug_map[$actual_slug];
                        break;
                    }
                }
            }
            // Method 5: Try numeric ID
            if (!$parent_id && is_numeric($parent_ref)) {
                $check_id = intval($parent_ref);
                $product = wc_get_product($check_id);
                if ($product && $product->is_type('variable')) {
                    $parent_id = $check_id;
                }
            }
        }
        
        if (!$parent_id) {
            $stats['parent_not_found']++;
            // Try to find parent by name pattern
            $base_name = preg_replace('/\s*-?\s*(250ml|500ml|1l|1lt|4l|10l|23l|1gal|2\.5gal|5gal|1oz|4oz|8oz|16oz|32oz|1lb|5lb|10lb|25lb)$/i', '', $name);
            if ($base_name !== $name) {
                // Look for parent with this base name
                $found_parent = wc_get_products([
                    'type' => 'variable',
                    'limit' => 1,
                    'name' => $base_name
                ]);
                if (!empty($found_parent)) {
                    $parent_id = $found_parent[0]->get_id();
                }
            }
            
            if (!$parent_id) {
                $errors[] = "Parent not found for: {$name} (parent_ref: {$parent_ref})";
                continue;
            }
        }
        
        // Check if variation exists
        $existing_id = 0;
        if (!empty($sku)) {
            $existing_id = wc_get_product_id_by_sku($sku);
        }
        
        try {
            if ($existing_id) {
                $variation = wc_get_product($existing_id);
                if (!$variation || !$variation->is_type('variation')) {
                    $stats['errors']++;
                    $errors[] = "SKU exists but not a variation: $sku";
                    continue;
                }
            } else {
                $variation = new WC_Product_Variation();
                $variation->set_parent_id($parent_id);
            }
            
            // Set data
            if (!empty($sku)) $variation->set_sku($sku);
            
            // Price
            $regular_price = $data['Regular price'] ?? '';
            if (!empty($regular_price) && is_numeric($regular_price)) {
                $variation->set_regular_price($regular_price);
            }
            
            $sale_price = $data['Sale price'] ?? '';
            if (!empty($sale_price) && is_numeric($sale_price)) {
                $variation->set_sale_price($sale_price);
            }
            
            // Stock
            $in_stock = $data['In stock?'] ?? '1';
            $variation->set_stock_status($in_stock == '1' ? 'instock' : 'outofstock');
            
            $stock = $data['Stock'] ?? '';
            if (!empty($stock) && is_numeric($stock)) {
                $variation->set_manage_stock(true);
                $variation->set_stock_quantity(intval($stock));
            }
            
            // Weight
            $weight = $data['Weight (lbs)'] ?? '';
            if (!empty($weight) && is_numeric($weight)) {
                $variation->set_weight($weight);
            }
            
            // Attributes
            $attr_name = $data['Attribute 1 name'] ?? 'Size';
            $attr_value = $data['Attribute 1 value(s)'] ?? '';
            
            // Extract size from name if no attribute value
            if (empty($attr_value) && !empty($name)) {
                if (preg_match('/(\d+(\.\d+)?\s*(ml|l|lt|gal|oz|lb|kg|g|liter)s?)$/i', $name, $matches)) {
                    $attr_value = $matches[1];
                }
            }
            
            if (!empty($attr_value)) {
                $attr_slug = sanitize_title($attr_name);
                $variation->set_attributes([
                    $attr_slug => $attr_value
                ]);
            }
            
            // Status
            $variation->set_status('publish');
            
            // Save
            $variation_id = $variation->save();
            
            if ($variation_id) {
                if ($existing_id) {
                    $stats['updated']++;
                } else {
                    $stats['created']++;
                }
                
                // Sync parent product
                $parent = wc_get_product($parent_id);
                if ($parent) {
                    WC_Product_Variable::sync($parent_id);
                }
            } else {
                $stats['errors']++;
                $errors[] = "Failed to save variation: $sku";
            }
            
        } catch (Exception $e) {
            $stats['errors']++;
            $errors[] = "Exception for $sku: " . $e->getMessage();
        }
    }
}
