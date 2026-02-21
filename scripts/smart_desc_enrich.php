<?php
/**
 * Smart Description Enrichment via Name Matching
 * 
 * Many products have auto-generated SKUs (HMH-xxx) that don't match the
 * Feb 12 export's original SKUs. This script does NAME-based fuzzy matching
 * to pull descriptions from the Feb 12 export.
 * 
 * Run: wp eval-file smart_desc_enrich.php              (dry run)
 * Run: CONFIRM=1 wp eval-file smart_desc_enrich.php    (live)
 */

wp_set_current_user(1);
global $wpdb;

$confirm = getenv('CONFIRM') === '1';
echo $confirm ? "=== LIVE MODE ===\n\n" : "=== DRY RUN ===\n\n";

// Load Feb 12 export descriptions (by name AND SKU)
$site_root = rtrim(getenv('HMOON_SITE_DIR') ?: untrailingslashit(ABSPATH), '/');
$export_file = $site_root . '/wc-product-export-12-2-2026.csv';
if (!file_exists($export_file)) {
    echo "ERROR: Feb 12 export not found\n";
    return;
}

$handle = fopen($export_file, 'r');
$headers = fgetcsv($handle);

$sku_col = array_search('SKU', $headers);
$name_col = array_search('Name', $headers);
$desc_col = array_search('Description', $headers);
$short_col = array_search('Short description', $headers);

// Build lookup maps
$by_sku = [];
$by_name = [];  // normalized name → entry

while (($row = fgetcsv($handle)) !== false) {
    $sku = trim($row[$sku_col] ?? '');
    $name = trim($row[$name_col] ?? '');
    $desc = trim($row[$desc_col] ?? '');
    $short = trim($row[$short_col] ?? '');
    
    if (empty($desc) && empty($short)) continue;
    
    $entry = ['name' => $name, 'desc' => $desc, 'short' => $short, 'sku' => $sku];
    
    if (!empty($sku)) $by_sku[$sku] = $entry;
    
    // Normalize name for matching
    $norm = normalize_name($name);
    if (!empty($norm)) {
        $by_name[$norm] = $entry;
    }
}
fclose($handle);

echo "Loaded " . count($by_sku) . " SKU entries, " . count($by_name) . " name entries\n\n";

// Get products missing descriptions
$no_desc = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt,
           pm_sku.meta_value as sku
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
    WHERE p.post_type = 'product'
    AND p.post_status = 'publish'
    AND (p.post_content IS NULL OR p.post_content = '')
    ORDER BY p.post_title
");

echo count($no_desc) . " products missing descriptions\n\n";

$matched_desc = 0;
$matched_short = 0;
$match_methods = ['sku' => 0, 'exact_name' => 0, 'fuzzy_name' => 0, 'base_name' => 0];

foreach ($no_desc as $product) {
    $match = null;
    $method = '';
    
    // 1. Try SKU match
    if (!empty($product->sku) && isset($by_sku[$product->sku])) {
        $match = $by_sku[$product->sku];
        $method = 'sku';
    }
    
    // 2. Try exact normalized name match
    if (!$match) {
        $norm = normalize_name($product->post_title);
        if (isset($by_name[$norm])) {
            $match = $by_name[$norm];
            $method = 'exact_name';
        }
    }
    
    // 3. Try base name match (strip size info: "Product 1 gal" → "Product")
    if (!$match) {
        $base = get_base_name($product->post_title);
        $base_norm = normalize_name($base);
        if (!empty($base_norm) && isset($by_name[$base_norm])) {
            $match = $by_name[$base_norm];
            $method = 'base_name';
        }
    }
    
    // 4. Try fuzzy match against all names
    if (!$match) {
        $best_score = 0;
        $best_entry = null;
        $norm = normalize_name($product->post_title);
        
        foreach ($by_name as $csv_norm => $entry) {
            // Quick length filter
            $len_ratio = strlen($norm) > 0 ? min(strlen($norm), strlen($csv_norm)) / max(strlen($norm), strlen($csv_norm)) : 0;
            if ($len_ratio < 0.5) continue;
            
            similar_text($norm, $csv_norm, $pct);
            if ($pct > 80 && $pct > $best_score) {
                $best_score = $pct;
                $best_entry = $entry;
            }
        }
        
        if ($best_entry) {
            $match = $best_entry;
            $method = 'fuzzy_name';
        }
    }
    
    if (!$match || (empty($match['desc']) && empty($match['short']))) continue;
    
    $did_desc = false;
    $did_short = false;
    
    if (empty($product->post_content) && !empty($match['desc'])) {
        $did_desc = true;
        $matched_desc++;
        if ($confirm) {
            $wpdb->update($wpdb->posts, ['post_content' => $match['desc']], ['ID' => $product->ID]);
        }
    }
    
    if (empty($product->post_excerpt) && !empty($match['short'])) {
        $did_short = true;
        $matched_short++;
        if ($confirm) {
            $wpdb->update($wpdb->posts, ['post_excerpt' => $match['short']], ['ID' => $product->ID]);
        }
    }
    
    if ($did_desc || $did_short) {
        $match_methods[$method]++;
        $what = [];
        if ($did_desc) $what[] = 'desc';
        if ($did_short) $what[] = 'short';
        if (($matched_desc + $matched_short) <= 50) {
            echo "  ✓ [{$method}] #{$product->ID} '{$product->post_title}' ← " . implode('+', $what) . "\n";
            if ($method === 'fuzzy_name') {
                echo "    matched → '{$match['name']}'\n";
            }
        }
    }
}

echo "\n";
if ($matched_desc + $matched_short > 50) {
    echo "  (showing first 50 of " . ($matched_desc + $matched_short) . " matches)\n\n";
}

echo "============================\n";
echo "SUMMARY\n";
echo "============================\n";
echo "Descriptions " . ($confirm ? "enriched" : "available") . ": {$matched_desc}\n";
echo "Short descriptions " . ($confirm ? "enriched" : "available") . ": {$matched_short}\n";
echo "Match methods:\n";
foreach ($match_methods as $m => $c) {
    if ($c > 0) echo "  {$m}: {$c}\n";
}
echo "Still missing: " . (count($no_desc) - $matched_desc) . "\n";
echo "============================\n";
echo ($confirm ? "DONE!" : "DRY RUN COMPLETE") . "\n";


// Helper functions
function normalize_name($name) {
    $name = strtolower(trim($name));
    $name = preg_replace('/[^a-z0-9\s]/', '', $name);
    $name = preg_replace('/\s+/', ' ', $name);
    return trim($name);
}

function get_base_name($name) {
    // Strip size info: "(1 gal)", "(500ml)", "1 Lt", "5L", "250 grams", etc.
    $name = preg_replace('/\s*\(?\d+[\s.]*(gal|gallon|lt|ltr|liter|litre|ml|oz|lb|lbs|kg|gm|g|gram|grams|quart|qt)\)?\s*/i', ' ', $name);
    // Strip parenthetical size/formulation info
    $name = preg_replace('/\s*\([^)]*\)\s*/', ' ', $name);
    // Strip trailing numbers (pack quantities)
    $name = preg_replace('/\s+\d+$/', '', $name);
    return trim($name);
}
