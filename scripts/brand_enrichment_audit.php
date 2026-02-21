<?php
/**
 * brand_enrichment_audit.php — Comprehensive per-brand missing data audit
 * 
 * For each branded product, checks:
 * - Image (missing or too small)
 * - Description (missing or too short)
 * - Short description
 * - Price
 * - Weight
 * - Dimensions
 * - SKU
 * 
 * Outputs a JSON manifest for scraper consumption + summary report
 * 
 * Usage: wp eval-file wp-content/brand_enrichment_audit.php
 */

wp_set_current_user(1);
global $wpdb;

echo "==============================================\n";
echo "  BRAND ENRICHMENT AUDIT\n";
echo "==============================================\n\n";

// Get all published products
$products = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt, p.post_name
    FROM {$wpdb->posts} p
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    ORDER BY p.post_title
");

// Brand → manufacturer URL/search mappings
$brand_urls = [
    'Advanced Nutrients' => ['base' => 'https://advancednutrients.com', 'search' => '/products/?s=', 'product' => '/products/'],
    'General Hydroponics' => ['base' => 'https://generalhydroponics.com', 'search' => '/?s=', 'product' => '/products/'],
    'FoxFarm' => ['base' => 'https://foxfarm.com', 'search' => '/?s=', 'product' => '/products/'],
    'Botanicare' => ['base' => 'https://botanicare.com', 'search' => '/?s=', 'product' => '/products/'],
    'Humboldt Nutrients' => ['base' => 'https://humboldtnutrients.com', 'search' => '/?s=', 'product' => '/products/'],
    'Nectar for the Gods' => ['base' => 'https://oregonsonly.com', 'search' => '/?s=', 'product' => '/nectar-for-the-gods/'],
    'AC Infinity' => ['base' => 'https://acinfinity.com', 'search' => '/search?q=', 'product' => '/products/'],
    'Eye Hortilux' => ['base' => 'https://eyehortilux.com', 'search' => '/?s=', 'product' => '/products/'],
    'Plagron' => ['base' => 'https://plagron.com', 'search' => '/en/?s=', 'product' => '/en/products/'],
    'Canna' => ['base' => 'https://www.canna.com', 'search' => '/en/search?q=', 'product' => '/en/products/'],
    'Dyna-Gro' => ['base' => 'https://dfrombio.com', 'search' => '/?s=', 'product' => '/products/'],
    'Clonex' => ['base' => 'https://hydrodynamicsintl.com', 'search' => '/?s=', 'product' => '/products/'],
    'Holland Secret' => ['base' => 'https://futureharvestdevelopment.com', 'search' => '/?s=', 'product' => '/products/'],
    'Can-Fan' => ['base' => 'https://can-filters.com', 'search' => '/?s=', 'product' => '/products/'],
    'Growth Science' => ['base' => 'https://growthsciencenutrients.com', 'search' => '/?s=', 'product' => '/products/'],
    'ONA' => ['base' => 'https://onaonline.com', 'search' => '/?s=', 'product' => '/products/'],
    'HM Digital' => ['base' => 'https://hmdigital.com', 'search' => '/?s=', 'product' => '/products/'],
    'Down To Earth' => ['base' => 'https://downtoearthfertilizer.com', 'search' => '/?s=', 'product' => '/products/'],
    'Technaflora' => ['base' => 'https://technaflora.com', 'search' => '/?s=', 'product' => '/products/'],
    'Root Pouch' => ['base' => 'https://rootpouch.com', 'search' => '/?s=', 'product' => '/products/'],
    'BioBizz' => ['base' => 'https://biobizz.com', 'search' => '/?s=', 'product' => '/products/'],
    'TRIMPRO' => ['base' => 'https://trimpro.com', 'search' => '/?s=', 'product' => '/products/'],
    'Hydro Dynamic' => ['base' => 'https://hydrodynamicsintl.com', 'search' => '/?s=', 'product' => '/products/'],
    'Spider Farmer' => ['base' => 'https://spider-farmer.com', 'search' => '/search?q=', 'product' => '/products/'],
    'Mars Hydro' => ['base' => 'https://mars-hydro.com', 'search' => '/search?q=', 'product' => '/products/'],
    'Bluelab' => ['base' => 'https://bluelab.com', 'search' => '/search?q=', 'product' => '/products/'],
    'Safer Brand' => ['base' => 'https://saferbrand.com', 'search' => '/?s=', 'product' => '/products/'],
    'Scietetics' => ['base' => 'https://scieticsnaturals.com', 'search' => '/?s=', 'product' => '/products/'],
];

// Hydro store search URLs (fallback for brands without own site)
$store_search_urls = [
    'https://hydrobuilder.com/search?q=',
    'https://www.htgsupply.com/search?q=',
    'https://growershouse.com/catalogsearch/result/?q=',
];

$manifest = [];
$brand_summary = [];

foreach ($products as $product) {
    $pid = $product->ID;
    $title = $product->post_title;
    
    // Get brand
    $brands = wp_get_object_terms($pid, 'pa_brand', ['fields' => 'names']);
    $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : '';
    
    // Check each data field
    $missing = [];
    
    // Image
    $thumb_id = get_post_thumbnail_id($pid);
    $img_status = 'good';
    if (!$thumb_id) {
        $img_status = 'missing';
        $missing[] = 'image';
    } else {
        $meta = wp_get_attachment_metadata($thumb_id);
        $w = isset($meta['width']) ? $meta['width'] : 0;
        $h = isset($meta['height']) ? $meta['height'] : 0;
        if ($w < 300 || $h < 300) {
            $img_status = 'small';
            $missing[] = 'image_quality';
        }
    }
    
    // Description
    $desc = trim($product->post_content);
    $desc_len = strlen(strip_tags($desc));
    if (empty($desc) || $desc_len < 20) {
        $missing[] = 'description';
    } elseif ($desc_len < 100) {
        $missing[] = 'description_short';
    }
    
    // Short description
    if (empty(trim($product->post_excerpt))) {
        $missing[] = 'short_description';
    }
    
    // Price
    $price = get_post_meta($pid, '_regular_price', true);
    if (empty($price)) {
        $missing[] = 'price';
    }
    
    // Weight
    $weight = get_post_meta($pid, '_weight', true);
    if (empty($weight)) {
        $missing[] = 'weight';
    }
    
    // Dimensions
    $length = get_post_meta($pid, '_length', true);
    $width_dim = get_post_meta($pid, '_width', true);
    $height_dim = get_post_meta($pid, '_height', true);
    if (empty($length) && empty($width_dim) && empty($height_dim)) {
        $missing[] = 'dimensions';
    }
    
    // Only include products that have something missing
    if (empty($missing) && $img_status === 'good') continue;
    
    // Generate search/source URLs
    $search_term = urlencode($title);
    $search_urls = [];
    
    // Manufacturer URL
    if ($brand && isset($brand_urls[$brand])) {
        $bu = $brand_urls[$brand];
        $search_urls['manufacturer'] = $bu['base'] . $bu['search'] . $search_term;
    }
    
    // Google Images
    $search_urls['google_images'] = 'https://www.google.com/search?tbm=isch&q=' . $search_term;
    
    // Google with site: for SDS/specs
    if ($brand && isset($brand_urls[$brand])) {
        $domain = parse_url($brand_urls[$brand]['base'], PHP_URL_HOST);
        $search_urls['specs'] = 'https://www.google.com/search?q=site:' . $domain . '+' . $search_term . '+specifications';
        $search_urls['sds'] = 'https://www.google.com/search?q=' . urlencode($title . ' safety data sheet SDS PDF');
    }
    
    // Hydro store
    $search_urls['hydrobuilder'] = $store_search_urls[0] . $search_term;
    
    $entry = [
        'id' => $pid,
        'title' => $title,
        'slug' => $product->post_name,
        'brand' => $brand,
        'missing' => $missing,
        'img_status' => $img_status,
        'search_urls' => $search_urls,
    ];
    
    $manifest[] = $entry;
    
    // Brand summary
    if (!$brand) $brand = '(Unbranded)';
    if (!isset($brand_summary[$brand])) {
        $brand_summary[$brand] = [
            'total' => 0,
            'image' => 0,
            'image_quality' => 0,
            'description' => 0,
            'description_short' => 0,
            'short_description' => 0,
            'price' => 0,
            'weight' => 0,
            'dimensions' => 0,
        ];
    }
    $brand_summary[$brand]['total']++;
    foreach ($missing as $m) {
        $brand_summary[$brand][$m]++;
    }
}

// Sort by total missing
uasort($brand_summary, function($a, $b) { return $b['total'] - $a['total']; });

// ============================================================
// OUTPUT: Summary + JSON manifest
// ============================================================

echo "--- BRAND ENRICHMENT GAPS (Top 30) ---\n\n";
echo str_pad('Brand', 32) . str_pad('Total', 7) . str_pad('Img', 5) . str_pad('ImgQ', 6) 
     . str_pad('Desc', 6) . str_pad('Short', 7) . str_pad('Price', 7) . str_pad('Wt', 5) . str_pad('Dims', 6) . "\n";
echo str_repeat('-', 90) . "\n";

$i = 0;
$totals = ['total'=>0,'image'=>0,'image_quality'=>0,'description'=>0,'short_description'=>0,'price'=>0,'weight'=>0,'dimensions'=>0];
foreach ($brand_summary as $brand => $data) {
    $i++;
    foreach ($totals as $k => &$v) { $v += $data[$k]; }
    if ($i <= 30) {
        echo str_pad($brand, 32) 
             . str_pad($data['total'], 7)
             . str_pad($data['image'], 5) 
             . str_pad($data['image_quality'], 6)
             . str_pad($data['description'] + ($data['description_short'] ?? 0), 6)
             . str_pad($data['short_description'], 7)
             . str_pad($data['price'], 7) 
             . str_pad($data['weight'], 5)
             . str_pad($data['dimensions'], 6) . "\n";
    }
}
echo str_repeat('-', 90) . "\n";
echo str_pad('TOTALS', 32)
     . str_pad($totals['total'], 7)
     . str_pad($totals['image'], 5) 
     . str_pad($totals['image_quality'], 6)
     . str_pad($totals['description'], 6)
     . str_pad($totals['short_description'], 7)
     . str_pad($totals['price'], 7) 
     . str_pad($totals['weight'], 5)
     . str_pad($totals['dimensions'], 6) . "\n";

// Save JSON manifest
$manifest_path = ABSPATH . 'wp-content/uploads/enrichment_manifest.json';
file_put_contents($manifest_path, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
echo "\nManifest saved: $manifest_path (" . count($manifest) . " products)\n";
echo "URL: " . site_url('/wp-content/uploads/enrichment_manifest.json') . "\n\n";

// Also save a per-brand summary JSON
$summary_path = ABSPATH . 'wp-content/uploads/enrichment_summary.json';
file_put_contents($summary_path, json_encode([
    'generated' => date('Y-m-d H:i:s'),
    'total_products' => count($products),
    'products_needing_enrichment' => count($manifest),
    'brand_urls' => $brand_urls,
    'store_search_urls' => $store_search_urls,
    'brand_summary' => $brand_summary,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
echo "Summary saved: $summary_path\n";
echo "URL: " . site_url('/wp-content/uploads/enrichment_summary.json') . "\n\n";

// ============================================================
// PRIORITY ENRICHMENT: Top brands with manufacturer websites
// ============================================================
echo "--- PRIORITY ENRICHMENT TARGETS ---\n";
echo "(Brands with manufacturer websites = easiest to source)\n\n";

foreach ($brand_summary as $brand => $data) {
    if (!isset($brand_urls[$brand])) continue;
    if ($data['total'] < 3) continue;
    
    $bu = $brand_urls[$brand];
    echo "  $brand ({$data['total']} products): {$bu['base']}\n";
    echo "    Missing: img={$data['image']} imgQ={$data['image_quality']} desc=" . ($data['description'] + ($data['description_short'] ?? 0))
         . " wt={$data['weight']} dims={$data['dimensions']} price={$data['price']}\n\n";
}

echo "==============================================\n";
echo "  DONE — use enrichment_manifest.json for scraping\n";
echo "==============================================\n";
