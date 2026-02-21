<?php
/**
 * estimate_weights.php — Fill missing weights using product type/size estimation
 * 
 * Strategy:
 * 1. Extract size from title (gallons, liters, oz, etc.)
 * 2. Estimate weight based on product category + size
 * 3. Use average weight from similar products with weights as fallback
 */
wp_set_current_user(1);
global $wpdb;
$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN ===\n\n" : "=== LIVE ===\n\n";

// Weight estimation rules (lbs)
$liquid_weight_per_unit = array(
    'gallon' => 9.0,    // 1 gallon liquid ≈ 9 lbs (with container)
    'gal'    => 9.0,
    'quart'  => 2.5,    // 1 quart ≈ 2.5 lbs
    'qt'     => 2.5,
    'liter'  => 2.5,    // 1 liter ≈ 2.2 lbs + container
    'litre'  => 2.5,
    'lt'     => 2.5,
    'l'      => 2.5,
    'pint'   => 1.5,
    'pt'     => 1.5,
    'oz'     => 0.075,  // 1 fl oz ≈ 0.075 lbs
    'ml'     => 0.0025, // 1 ml ≈ 0.0025 lbs
);

// Dry goods weight per unit (lbs)
$dry_weight_per_unit = array(
    'lb'  => 1.0,
    'lbs' => 1.0,
    'kg'  => 2.2,
    'oz'  => 0.0625,
    'g'   => 0.0022,
);

// Default weights by category (lbs) when no size extractable
$category_defaults = array(
    'Nutrients & Supplements' => 3.0,
    'Grow Media'              => 15.0,
    'Grow Lights'             => 8.0,
    'HID Bulbs'               => 1.5,
    'Airflow & Ventilation'   => 6.0,
    'Odor Control'            => 4.0,
    'Environmental Monitors'  => 1.0,
    'Controllers'             => 2.0,
    'pH & Testing'            => 1.0,
    'Irrigation & Watering'   => 3.0,
    'Containers & Pots'       => 2.0,
    'Propagation'             => 1.5,
    'Cannabis Seeds'          => 0.1,
    'Pest Control'            => 2.0,
    'CO2 & Supplementation'   => 5.0,
    'Harvesting'              => 2.0,
    'Trimming'                => 3.0,
    'Water Filtration'        => 5.0,
    'Grow Room Materials'     => 10.0,
    'Books & Media'           => 1.5,
    'Electrical Supplies'     => 2.0,
    'Drying & Extraction'     => 3.0,
    'Grow Tents'              => 20.0,
);

// Get products missing weight
$products = $wpdb->get_results("
    SELECT p.ID, p.post_title
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_weight'
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND (pm.meta_value IS NULL OR pm.meta_value = '' OR pm.meta_value = '0')
");

echo "Products missing weight: " . count($products) . "\n\n";

$estimated = 0;
$methods = array('size_extract' => 0, 'category_default' => 0, 'fallback' => 0);

foreach ($products as $p) {
    $title = $p->post_title;
    $tl = strtolower($title);
    $weight = null;
    $method = '';
    
    // 1. Try to extract size from title
    // Match patterns like "1 Gallon", "4 Lt", "32 oz", "500 ml", "50 lb"
    if (preg_match('/(\d+\.?\d*)\s*(gallon|gal|quart|qt|liter|litre|lt|pint|pt|oz|ml|lb|lbs|kg)\b/i', $tl, $m)) {
        $amount = floatval($m[1]);
        $unit = strtolower($m[2]);
        
        // Check if it's a dry good (lb/kg) or liquid
        if (isset($dry_weight_per_unit[$unit])) {
            $weight = $amount * $dry_weight_per_unit[$unit];
            // Add packaging weight (10%)
            $weight *= 1.1;
            $method = "dry: {$amount} {$unit}";
        } elseif (isset($liquid_weight_per_unit[$unit])) {
            $weight = $amount * $liquid_weight_per_unit[$unit];
            $method = "liquid: {$amount} {$unit}";
        }
    }
    
    // Also check for pack sizes like "12-pack", "6 pack"
    if (!$weight && preg_match('/(\d+)\s*[-]?\s*pack/i', $tl, $m)) {
        $pack_size = intval($m[1]);
        // Assume each item is ~0.5 lbs
        $weight = $pack_size * 0.5;
        $method = "pack: {$pack_size} items";
    }
    
    // 2. Category-based default
    if (!$weight) {
        $cats = wp_get_object_terms($p->ID, 'product_cat', array('fields' => 'names'));
        if (!is_wp_error($cats)) {
            foreach ($cats as $cat) {
                if (isset($category_defaults[$cat])) {
                    $weight = $category_defaults[$cat];
                    $method = "category: {$cat}";
                    break;
                }
            }
        }
    }
    
    // 3. Global fallback
    if (!$weight) {
        $weight = 2.0;
        $method = "fallback";
    }
    
    $weight = round($weight, 2);
    
    // Sanity check bounds
    if ($weight < 0.01) $weight = 0.1;
    if ($weight > 200) $weight = 200;
    
    echo "  #{$p->ID} -> {$weight} lbs ({$method})\n";
    
    if (!$dry_run) {
        update_post_meta($p->ID, '_weight', $weight);
    }
    
    $estimated++;
    if (strpos($method, 'dry:') === 0 || strpos($method, 'liquid:') === 0) $methods['size_extract']++;
    elseif (strpos($method, 'category:') === 0) $methods['category_default']++;
    else $methods['fallback']++;
}

echo "\n=== RESULTS ===\n";
echo "  Total estimated: {$estimated}\n";
echo "  By size extraction: {$methods['size_extract']}\n";
echo "  By category default: {$methods['category_default']}\n";
echo "  By fallback: {$methods['fallback']}\n";
if ($dry_run) echo "\n*** DRY RUN ***\n";
