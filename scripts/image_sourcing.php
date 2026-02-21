<?php
/**
 * image_sourcing.php — Generate image search URLs + download manufacturer images
 * 
 * Phase 1: Identify products missing or having too-small images
 * Phase 2: Generate Google Image search URLs organized by brand
 * Phase 3: Try to match from manufacturer websites for known brands
 * Phase 4: Generate report as downloadable HTML
 * 
 * Usage:
 *   wp eval-file wp-content/image_sourcing.php
 */

wp_set_current_user(1);
global $wpdb;

echo "==============================================\n";
echo "  IMAGE SOURCING ENGINE\n";
echo "==============================================\n\n";

// ============================================================
// PHASE 1: Find products needing images
// ============================================================
echo "--- PHASE 1: Scanning all products for image issues ---\n";

$products = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_name
    FROM {$wpdb->posts} p
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    ORDER BY p.post_title
");

$no_image = [];
$small_image = [];
$good_image = [];

foreach ($products as $product) {
    $thumb_id = get_post_thumbnail_id($product->ID);
    
    if (!$thumb_id) {
        // Get brand
        $brands = wp_get_object_terms($product->ID, 'pa_brand', ['fields' => 'names']);
        $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : 'Unknown';
        
        $no_image[] = [
            'id' => $product->ID,
            'title' => $product->post_title,
            'brand' => $brand,
            'slug' => $product->post_name,
        ];
        continue;
    }
    
    $meta = wp_get_attachment_metadata($thumb_id);
    $width = isset($meta['width']) ? $meta['width'] : 0;
    $height = isset($meta['height']) ? $meta['height'] : 0;
    
    if ($width < 300 || $height < 300) {
        $brands = wp_get_object_terms($product->ID, 'pa_brand', ['fields' => 'names']);
        $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : 'Unknown';
        
        $small_image[] = [
            'id' => $product->ID,
            'title' => $product->post_title,
            'brand' => $brand,
            'slug' => $product->post_name,
            'width' => $width,
            'height' => $height,
        ];
    } else {
        $good_image[] = $product->ID;
    }
}

echo "No image:    " . count($no_image) . " products\n";
echo "Small image: " . count($small_image) . " (<300px)\n";
echo "Good image:  " . count($good_image) . "\n\n";

// ============================================================
// PHASE 2: Organize by brand + generate search URLs
// ============================================================
echo "--- PHASE 2: Generating search URLs by brand ---\n";

// Brand website domains for targeted searches
$brand_sites = [
    'Advanced Nutrients' => 'advancednutrients.com',
    'General Hydroponics' => 'generalhydroponics.com',
    'FoxFarm' => 'foxfarm.com',
    'Botanicare' => 'botanicare.com',
    'AC Infinity' => 'acinfinity.com',
    'Spider Farmer' => 'spider-farmer.com',
    'Gavita' => 'gavita.com',
    'Bluelab' => 'bluelab.com',
    'Mars Hydro' => 'mars-hydro.com',
    'Humboldt Nutrients' => 'humboldtnutrients.com',
    'Emerald Harvest' => 'emeraldharvest.com',
    'Canna' => 'canna.com',
    'House & Garden' => 'house-garden.us',
    'Dyna-Gro' => 'dfrombio.com',
    'Eye Hortilux' => 'eyehortilux.com',
    'Nectar for the Gods' => 'oregonsonly.com',
    'BioBizz' => 'biobizz.com',
    'Down To Earth' => 'downtoearthfertilizer.com',
    'Plagron' => 'plagron.com',
    'Clonex' => 'hydrodynamicsintl.com',
    'Holland Secret' => 'futureharvestdevelopment.com',
    'Can-Fan' => 'can-filters.com',
    'TRIMPRO' => 'trimpro.com',
    'Root Pouch' => 'rootpouch.com',
    'Technaflora' => 'technaflora.com',
    'Growth Science' => 'growthsciencenutrients.com',
    'ONA' => 'onaonline.com',
    'HM Digital' => 'hmdigital.com',
];

// Also useful search sites
$hydro_stores = [
    'htgsupply.com',
    'growershouse.com', 
    'hydrobuilder.com',
    'growgeneration.com',
];

// Group all needing-image products by brand
$by_brand = [];
foreach (array_merge($no_image, $small_image) as $item) {
    $brand = $item['brand'];
    if (!isset($by_brand[$brand])) $by_brand[$brand] = [];
    $by_brand[$brand][] = $item;
}

// Sort brands by product count
uasort($by_brand, function($a, $b) { return count($b) - count($a); });

// ============================================================
// PHASE 3: Generate HTML report with clickable search links
// ============================================================
echo "--- PHASE 3: Generating HTML report ---\n";

$html = '<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>H-Moon Hydro Image Sourcing Guide</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
h1 { color: #2d5016; border-bottom: 3px solid #4a8c2a; padding-bottom: 10px; }
h2 { color: #4a8c2a; margin-top: 30px; cursor: pointer; }
h2:hover { text-decoration: underline; }
.brand-section { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.product-row { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.product-name { flex: 1; min-width: 250px; font-weight: 500; }
.status { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
.status.missing { background: #fee; color: #c00; }
.status.small { background: #ffd; color: #880; }
.search-links { display: flex; gap: 5px; flex-wrap: wrap; }
.search-links a { padding: 3px 10px; border-radius: 4px; font-size: 12px; text-decoration: none; color: white; }
.search-links a.google { background: #4285f4; }
.search-links a.mfr { background: #34a853; }
.search-links a.store { background: #ea4335; }
.search-links a:hover { opacity: 0.8; }
.summary { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; }
.count { color: #666; font-size: 14px; }
.collapse { display: none; }
.expanded .collapse { display: block; }
</style>
<script>
function toggleBrand(id) {
    document.getElementById(id).classList.toggle("expanded");
}
</script>
</head>
<body>
<h1>🖼️ H-Moon Hydro — Image Sourcing Guide</h1>
<div class="summary">
<strong>' . (count($no_image) + count($small_image)) . ' products need better images</strong><br>
Missing image: ' . count($no_image) . ' | Too small (&lt;300px): ' . count($small_image) . ' | Good: ' . count($good_image) . '<br>
<em>Click search links to find hi-res product images. Right-click → Save As to download.</em>
</div>
';

$brand_idx = 0;
foreach ($by_brand as $brand => $items) {
    $brand_idx++;
    $brand_id = 'brand-' . $brand_idx;
    $site = isset($brand_sites[$brand]) ? $brand_sites[$brand] : '';
    
    $html .= '<div class="brand-section" id="' . $brand_id . '">';
    $html .= '<h2 onclick="toggleBrand(\'' . $brand_id . '\')">' . htmlspecialchars($brand) . ' <span class="count">(' . count($items) . ' products)</span></h2>';
    $html .= '<div class="collapse">';
    
    foreach ($items as $item) {
        $name = htmlspecialchars($item['title']);
        $search_term = urlencode($item['title'] . ' product image');
        $brand_search = urlencode($item['title']);
        $is_missing = !isset($item['width']);
        
        $html .= '<div class="product-row">';
        $html .= '<span class="status ' . ($is_missing ? 'missing' : 'small') . '">' 
              . ($is_missing ? 'NO IMG' : $item['width'] . 'x' . $item['height']) . '</span>';
        $html .= '<span class="product-name">' . $name . '</span>';
        $html .= '<div class="search-links">';
        
        // Google Images search
        $html .= '<a class="google" href="https://www.google.com/search?tbm=isch&q=' . $search_term . '" target="_blank">Google</a>';
        
        // Manufacturer site search
        if ($site) {
            $html .= '<a class="mfr" href="https://www.google.com/search?tbm=isch&q=site:' . $site . '+' . $brand_search . '" target="_blank">Mfr Site</a>';
        }
        
        // Hydro store searches
        foreach (['hydrobuilder.com' => 'HydroB', 'growershouse.com' => 'Growers'] as $store => $label) {
            $html .= '<a class="store" href="https://www.google.com/search?tbm=isch&q=site:' . $store . '+' . $brand_search . '" target="_blank">' . $label . '</a>';
        }
        
        $html .= '</div>';
        $html .= '</div>';
    }
    
    $html .= '</div></div>';
}

$html .= '</body></html>';

// Save report
$report_path = ABSPATH . 'wp-content/uploads/image_sourcing_guide.html';
file_put_contents($report_path, $html);
echo "Report saved: $report_path\n";
echo "URL: " . site_url('/wp-content/uploads/image_sourcing_guide.html') . "\n\n";

// ============================================================
// PHASE 4: Summary by brand (top 20 needing images)
// ============================================================
echo "--- PHASE 4: Top brands needing images ---\n";

$i = 0;
foreach ($by_brand as $brand => $items) {
    $i++;
    if ($i > 20) break;
    $missing = count(array_filter($items, function($x) { return !isset($x['width']); }));
    $small = count($items) - $missing;
    echo "  " . str_pad($brand, 30) . " " . count($items) . " total  (missing: $missing, small: $small)\n";
}

echo "\n==============================================\n";
echo "  Total needing attention: " . (count($no_image) + count($small_image)) . "\n";
echo "  Report: " . site_url('/wp-content/uploads/image_sourcing_guide.html') . "\n";
echo "==============================================\n";
