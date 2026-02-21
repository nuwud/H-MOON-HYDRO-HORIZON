<?php
/**
 * brand_logos.php — Download and assign brand logos to PWB brand terms
 * 
 * Uses known logo URLs from manufacturer websites + scraped vendor data
 */
wp_set_current_user(1);
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN ===\n\n" : "=== LIVE ===\n\n";

// Known brand logo URLs (verified manufacturer sites)
$logo_sources = array(
    'General Hydroponics' => 'https://generalhydroponics.com/wp-content/uploads/2020/01/GH-logo.png',
    'Advanced Nutrients' => 'https://www.advancednutrients.com/wp-content/themes/developer/assets/images/an-logo.png',
    'Botanicare' => 'https://www.botanicare.com/wp-content/uploads/2020/10/botanicare-logo.png',
    'FoxFarm' => 'https://foxfarm.com/wp-content/themes/developer/assets/images/foxfarm-logo.png',
    'Bluelab' => 'https://www.bluelab.com/cdn/shop/files/logo-blue.png',
    'Humboldt Nutrients' => 'https://humboldtnutrients.com/cdn/shop/files/humboldt-logo_180x.png',
    'ONA' => 'https://www.ona-products.com/wp-content/uploads/2022/04/ONA_Logo_Primary_White.png',
    'AC Infinity' => 'https://www.acinfinity.com/cdn/shop/files/ac-infinity-logo.png',
    'Clonex' => 'https://www.clonex.com/wp-content/uploads/2020/01/Clonex-Logo.png',
    'Can-Fan' => 'https://www.can-fan.com/wp-content/uploads/2020/01/Can-Fan-Logo.png',
);

// Get all PWB brand terms
$brands = get_terms(array(
    'taxonomy' => 'pwb-brand',
    'hide_empty' => false,
));

echo "Total PWB brands: " . count($brands) . "\n";

// Check which already have logos
$without_logo = array();
foreach ($brands as $brand) {
    $logo_id = get_term_meta($brand->term_id, 'pwb_brand_image', true);
    if (empty($logo_id)) {
        $without_logo[] = $brand;
    }
}
echo "Brands without logos: " . count($without_logo) . "\n\n";

// Try to find logos from scraped retailer data
// Load retailer catalogs to find vendor logos
$catalog_dir = dirname(__FILE__) . '/';
$vendor_images = array();

// Try hydrobuilder catalog
$hb_file = $catalog_dir . 'hydrobuilder_logos.json';
if (file_exists($hb_file)) {
    $vendor_images = array_merge($vendor_images, json_decode(file_get_contents($hb_file), true) ?: array());
}

$set = 0;
$attempted = 0;

foreach ($without_logo as $brand) {
    $name = $brand->name;
    $logo_url = null;
    
    // Check known sources first
    if (isset($logo_sources[$name])) {
        $logo_url = $logo_sources[$name];
    }
    // Check vendor images from scraped data
    elseif (isset($vendor_images[$name])) {
        $logo_url = $vendor_images[$name];
    }
    
    if (!$logo_url) continue;
    
    $attempted++;
    echo "  {$name}: " . basename(parse_url($logo_url, PHP_URL_PATH));
    
    if (!$dry_run) {
        $tmp = download_url($logo_url, 15);
        if (!is_wp_error($tmp)) {
            $file_array = array(
                'name' => sanitize_file_name(strtolower(str_replace(' ', '-', $name)) . '-logo.png'),
                'tmp_name' => $tmp,
            );
            $att_id = media_handle_sideload($file_array, 0, $name . ' Logo');
            if (!is_wp_error($att_id)) {
                update_term_meta($brand->term_id, 'pwb_brand_image', $att_id);
                echo " -> OK (#$att_id)\n";
                $set++;
            } else {
                echo " -> ERROR: " . $att_id->get_error_message() . "\n";
            }
        } else {
            echo " -> DOWNLOAD FAILED: " . $tmp->get_error_message() . "\n";
            @unlink($tmp);
        }
    } else {
        echo " -> [would set]\n";
        $set++;
    }
}

echo "\n=== RESULTS ===\n";
echo "  Logos attempted: {$attempted}\n";
echo "  Logos set: {$set}\n";
if ($dry_run) echo "\n*** DRY RUN ***\n";
