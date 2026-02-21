<?php
/**
 * batch_import.php — Batch import products with proper mapping
 * Run via: wp eval-file wp-content/batch_import.php
 */

ini_set('memory_limit', '512M');
set_time_limit(0);

$csv_file = ABSPATH . 'wp-content/product_import.csv';

if (!file_exists($csv_file)) {
    echo "ERROR: CSV file not found at $csv_file\n";
    exit(1);
}

// Read CSV
$handle = fopen($csv_file, 'r');
$headers = fgetcsv($handle);
$headers = array_map('trim', $headers);

// Build column index
$col = array_flip($headers);

$stats = [
    'processed' => 0,
    'created' => 0,
    'updated' => 0,
    'skipped' => 0,
    'errors' => 0,
];
$errors = [];

echo "Starting import...\n";
echo "Columns: " . count($headers) . "\n";
echo "ID column: " . ($col['ID'] ?? 'not found') . "\n";
echo "SKU column: " . ($col['SKU'] ?? 'not found') . "\n\n";

$batch_size = 50;
$batch = [];

while (($row = fgetcsv($handle)) !== false) {
    if (count($row) < 5) continue; // Skip empty rows
    
    $data = [];
    foreach ($headers as $i => $header) {
        $data[$header] = isset($row[$i]) ? trim($row[$i]) : '';
    }
    
    $batch[] = $data;
    
    if (count($batch) >= $batch_size) {
        process_batch($batch, $stats, $errors, $col);
        $batch = [];
        echo "Processed: {$stats['processed']} | Created: {$stats['created']} | Updated: {$stats['updated']} | Errors: {$stats['errors']}\n";
    }
}

// Process remaining
if (!empty($batch)) {
    process_batch($batch, $stats, $errors, $col);
}

fclose($handle);

echo "\n========== IMPORT COMPLETE ==========\n";
echo "Total processed: {$stats['processed']}\n";
echo "Created: {$stats['created']}\n";
echo "Updated: {$stats['updated']}\n";
echo "Skipped: {$stats['skipped']}\n";
echo "Errors: {$stats['errors']}\n";

if (!empty($errors)) {
    echo "\nFirst 10 errors:\n";
    foreach (array_slice($errors, 0, 10) as $err) {
        echo "  - {$err}\n";
    }
}

function process_batch(&$batch, &$stats, &$errors, $col) {
    foreach ($batch as $data) {
        $stats['processed']++;
        
        $type = strtolower($data['Type'] ?? 'simple');
        $sku = $data['SKU'] ?? '';
        $name = $data['Name'] ?? '';
        
        // Skip variations for now - they need parent ID
        if ($type === 'variation') {
            $stats['skipped']++;
            continue;
        }
        
        // Skip if no name
        if (empty($name) && $type !== 'variation') {
            $stats['skipped']++;
            continue;
        }
        
        // Check if product exists by SKU
        $existing_id = 0;
        if (!empty($sku)) {
            $existing_id = wc_get_product_id_by_sku($sku);
        }
        
        try {
            if ($existing_id) {
                // Update existing
                $product = wc_get_product($existing_id);
                if (!$product) {
                    $stats['errors']++;
                    $errors[] = "Could not load product ID $existing_id for SKU: $sku";
                    continue;
                }
            } else {
                // Create new
                if ($type === 'variable') {
                    $product = new WC_Product_Variable();
                } else {
                    $product = new WC_Product_Simple();
                }
            }
            
            // Set basic data
            $product->set_name($name);
            if (!empty($sku)) $product->set_sku($sku);
            
            // Status
            $published = $data['Published'] ?? '1';
            $product->set_status($published == '1' ? 'publish' : 'draft');
            
            // Price
            $regular_price = $data['Regular price'] ?? '';
            if (!empty($regular_price) && is_numeric($regular_price)) {
                $product->set_regular_price($regular_price);
            }
            
            $sale_price = $data['Sale price'] ?? '';
            if (!empty($sale_price) && is_numeric($sale_price)) {
                $product->set_sale_price($sale_price);
            }
            
            // Description
            $desc = $data['Description'] ?? '';
            if (!empty($desc)) $product->set_description($desc);
            
            $short_desc = $data['Short description'] ?? '';
            if (!empty($short_desc)) $product->set_short_description($short_desc);
            
            // Weight
            $weight = $data['Weight (lbs)'] ?? '';
            if (!empty($weight) && is_numeric($weight)) {
                $product->set_weight($weight);
            }
            
            // Stock
            $in_stock = $data['In stock?'] ?? '1';
            $product->set_stock_status($in_stock == '1' ? 'instock' : 'outofstock');
            
            $stock = $data['Stock'] ?? '';
            if (!empty($stock) && is_numeric($stock)) {
                $product->set_manage_stock(true);
                $product->set_stock_quantity(intval($stock));
            }
            
            // Save product
            $product_id = $product->save();
            
            if ($product_id) {
                // Categories
                $cats = $data['Categories'] ?? '';
                if (!empty($cats)) {
                    $cat_ids = [];
                    $cat_parts = explode(',', $cats);
                    foreach ($cat_parts as $cat_path) {
                        $cat_path = trim($cat_path);
                        if (empty($cat_path)) continue;
                        
                        // Handle hierarchy: "Parent > Child"
                        $parts = explode('>', $cat_path);
                        $parent_id = 0;
                        foreach ($parts as $cat_name) {
                            $cat_name = trim($cat_name);
                            $term = get_term_by('name', $cat_name, 'product_cat');
                            if (!$term) {
                                $result = wp_insert_term($cat_name, 'product_cat', ['parent' => $parent_id]);
                                if (!is_wp_error($result)) {
                                    $parent_id = $result['term_id'];
                                    $cat_ids[] = $parent_id;
                                }
                            } else {
                                $parent_id = $term->term_id;
                                $cat_ids[] = $parent_id;
                            }
                        }
                    }
                    if (!empty($cat_ids)) {
                        wp_set_object_terms($product_id, $cat_ids, 'product_cat');
                    }
                }
                
                // Brands (custom taxonomy - if exists)
                $brand = $data['Brands'] ?? '';
                if (!empty($brand) && taxonomy_exists('product_brand')) {
                    wp_set_object_terms($product_id, [$brand], 'product_brand');
                } elseif (!empty($brand)) {
                    // Store as meta
                    update_post_meta($product_id, '_brand', $brand);
                }
                
                // Image
                $image_url = $data['Images'] ?? '';
                if (!empty($image_url) && filter_var($image_url, FILTER_VALIDATE_URL)) {
                    // Don't download images now - just store URL
                    update_post_meta($product_id, '_external_image_url', $image_url);
                }
                
                if ($existing_id) {
                    $stats['updated']++;
                } else {
                    $stats['created']++;
                }
            } else {
                $stats['errors']++;
                $errors[] = "Failed to save: $name ($sku)";
            }
            
        } catch (Exception $e) {
            $stats['errors']++;
            $errors[] = "Exception for $sku: " . $e->getMessage();
        }
    }
}
