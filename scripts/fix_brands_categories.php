<?php
/**
 * Brand Taxonomy Consolidation & Category Cleanup
 * 
 * PROBLEM: 3 brand taxonomies exist:
 *   - pa_brand (WC attribute): 75 terms, ~936 products assigned (MOST USED)
 *   - product_brand (custom): 77 terms, ~400 products assigned
 *   - pwb-brand (Perfect WooCommerce Brands plugin): 67 terms, ALL EMPTY
 * 
 * STRATEGY:
 *   1. Consolidate everything into pwb-brand (the plugin taxonomy - best frontend support)
 *   2. Map pa_brand assignments to pwb-brand terms
 *   3. Map product_brand assignments to pwb-brand terms
 *   4. Fix categories that are actually brands (AC INFINITY, Philips, ROSIN PRO PRESS COMPANY)
 *   5. Clean up malformed category names
 */
wp_set_current_user(1);
global $wpdb;

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN MODE ===\n\n" : "=== LIVE MODE ===\n\n";

// ============================================================
// PHASE 1: Consolidate brands into pwb-brand taxonomy
// ============================================================
echo "=== PHASE 1: BRAND CONSOLIDATION ===\n\n";

// Get all pa_brand terms and their product assignments
$pa_brands = get_terms(array('taxonomy' => 'pa_brand', 'hide_empty' => false));
$product_brands = get_terms(array('taxonomy' => 'product_brand', 'hide_empty' => false));

echo "Source: pa_brand has " . count($pa_brands) . " terms\n";
echo "Source: product_brand has " . count($product_brands) . " terms\n";

// Collect all unique brand names from both taxonomies
$all_brand_names = array();
foreach ($pa_brands as $b) {
    $all_brand_names[strtolower(trim($b->name))] = $b->name;
}
foreach ($product_brands as $b) {
    $key = strtolower(trim($b->name));
    if (!isset($all_brand_names[$key])) {
        $all_brand_names[$key] = $b->name;
    }
}

echo "Unique brand names across all taxonomies: " . count($all_brand_names) . "\n\n";

$brands_created = 0;
$products_assigned = 0;
$already_assigned = 0;

foreach ($all_brand_names as $key => $brand_name) {
    // Check if pwb-brand term already exists
    $pwb_term = get_term_by('name', $brand_name, 'pwb-brand');
    if (!$pwb_term) {
        // Also check by slug
        $slug = sanitize_title($brand_name);
        $pwb_term = get_term_by('slug', $slug, 'pwb-brand');
    }
    
    if (!$pwb_term) {
        // Create it in pwb-brand
        if (!$dry_run) {
            $result = wp_insert_term($brand_name, 'pwb-brand');
            if (!is_wp_error($result)) {
                $pwb_term_id = $result['term_id'];
                $brands_created++;
                echo "  CREATED pwb-brand: {$brand_name} (#{$pwb_term_id})\n";
            } else {
                echo "  ERROR creating '{$brand_name}': {$result->get_error_message()}\n";
                continue;
            }
        } else {
            echo "  WOULD CREATE pwb-brand: {$brand_name}\n";
            $brands_created++;
            continue;
        }
    } else {
        $pwb_term_id = $pwb_term->term_id;
    }
    
    if ($dry_run) continue;
    
    // Find all products with this brand in pa_brand
    $pa_term = get_term_by('name', $brand_name, 'pa_brand');
    if (!$pa_term) {
        $pa_term = get_term_by('slug', sanitize_title($brand_name), 'pa_brand');
    }
    
    $product_ids = array();
    
    if ($pa_term) {
        $pa_products = get_posts(array(
            'post_type' => 'product',
            'posts_per_page' => -1,
            'fields' => 'ids',
            'tax_query' => array(
                array('taxonomy' => 'pa_brand', 'field' => 'term_id', 'terms' => $pa_term->term_id)
            )
        ));
        $product_ids = array_merge($product_ids, $pa_products);
    }
    
    // Also from product_brand
    $pb_term = get_term_by('name', $brand_name, 'product_brand');
    if (!$pb_term) {
        $pb_term = get_term_by('slug', sanitize_title($brand_name), 'product_brand');
    }
    
    if ($pb_term) {
        $pb_products = get_posts(array(
            'post_type' => 'product',
            'posts_per_page' => -1,
            'fields' => 'ids',
            'tax_query' => array(
                array('taxonomy' => 'product_brand', 'field' => 'term_id', 'terms' => $pb_term->term_id)
            )
        ));
        $product_ids = array_merge($product_ids, $pb_products);
    }
    
    $product_ids = array_unique($product_ids);
    
    if (!empty($product_ids)) {
        foreach ($product_ids as $pid) {
            // Check if already assigned
            if (has_term($pwb_term_id, 'pwb-brand', $pid)) {
                $already_assigned++;
                continue;
            }
            wp_set_object_terms($pid, $pwb_term_id, 'pwb-brand', true);
            $products_assigned++;
        }
    }
}

echo "\nPhase 1 Results:\n";
echo "  Brands created in pwb-brand: {$brands_created}\n";
echo "  Products assigned to pwb-brand: {$products_assigned}\n";
echo "  Already assigned (skipped): {$already_assigned}\n";

// ============================================================
// PHASE 2: Fix categories that are actually brands
// ============================================================
echo "\n=== PHASE 2: BRAND-AS-CATEGORY FIXES ===\n\n";

$brand_categories = array(
    'AC INFINITY' => 'Environmental Control',
    'Philips' => 'Grow Lights Ballast',
    'ROSIN PRO PRESS COMPANY' => 'Drying & Extraction',
    'COMPLETE LIGHT SYSTEMS' => 'Grow Lights Ballast',
    'Grease' => null, // Investigate - might be "Grease" brand or "Extraction" category
);

foreach ($brand_categories as $brand_cat_name => $target_cat_name) {
    $cat = get_term_by('name', $brand_cat_name, 'product_cat');
    if (!$cat) {
        echo "  Category '{$brand_cat_name}' not found, skipping\n";
        continue;
    }
    
    if ($cat->count == 0) {
        echo "  Category '{$brand_cat_name}' has 0 products, can delete\n";
        if (!$dry_run) {
            wp_delete_term($cat->term_id, 'product_cat');
            echo "    DELETED empty category\n";
        }
        continue;
    }
    
    echo "  Category '{$brand_cat_name}': {$cat->count} products\n";
    
    if ($target_cat_name) {
        $target_cat = get_term_by('name', $target_cat_name, 'product_cat');
        if (!$target_cat) {
            // Try HTML-encoded version
            $target_cat = get_term_by('name', html_entity_decode($target_cat_name), 'product_cat');
        }
        
        if ($target_cat) {
            // Get all products in the brand category
            $prods = get_posts(array(
                'post_type' => 'product',
                'posts_per_page' => -1,
                'fields' => 'ids',
                'tax_query' => array(
                    array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $cat->term_id)
                )
            ));
            
            echo "    Moving {$cat->count} products to '{$target_cat_name}'\n";
            
            if (!$dry_run) {
                foreach ($prods as $pid) {
                    // Add target category
                    wp_set_object_terms($pid, $target_cat->term_id, 'product_cat', true);
                    // Remove brand category
                    wp_remove_object_terms($pid, $cat->term_id, 'product_cat');
                }
                // Delete the brand category
                wp_delete_term($cat->term_id, 'product_cat');
                echo "    DONE - moved products and deleted category\n";
            }
            
            // Ensure brand exists in pwb-brand
            $pwb_brand = get_term_by('name', $brand_cat_name, 'pwb-brand');
            if (!$pwb_brand && !$dry_run) {
                $result = wp_insert_term($brand_cat_name, 'pwb-brand');
                if (!is_wp_error($result)) {
                    // Assign brand to these products
                    foreach ($prods as $pid) {
                        wp_set_object_terms($pid, $result['term_id'], 'pwb-brand', true);
                    }
                    echo "    Created brand '{$brand_cat_name}' and assigned to products\n";
                }
            }
        } else {
            echo "    Target category '{$target_cat_name}' not found!\n";
        }
    }
}

// ============================================================
// PHASE 3: Fix malformed category names
// ============================================================
echo "\n=== PHASE 3: CATEGORY NAME CLEANUP ===\n\n";

$cats = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => false));
$fixed_names = 0;

foreach ($cats as $cat) {
    $new_name = $cat->name;
    
    // Fix overly long category names
    if (strlen($new_name) > 60) {
        // Truncate at first parenthesis or special char
        if (preg_match('/^([^(]+)/', $new_name, $m)) {
            $new_name = trim($m[1]);
        }
    }
    
    // Fix HTML entities in names
    if (strpos($new_name, '&amp;') !== false || strpos($new_name, '&#') !== false) {
        $new_name = html_entity_decode($new_name);
    }
    
    // Fix specific known issues
    $name_fixes = array(
        "bio365™ BIOFLOWER™ Nutrient Dense Mix ( please do not order if out of New York)" => "bio365 BIOFLOWER",
        "Spray N Grow" => "Spray-N-Grow Products",
        "TERPINATOR FINISHING!" => "Terpinator",
        "SOIL Additives/Supplements" => "Soil Additives & Supplements",
        "HYGROZYME" => "Hygrozyme Products",
    );
    
    if (isset($name_fixes[$cat->name])) {
        $new_name = $name_fixes[$cat->name];
    }
    
    if ($new_name !== $cat->name) {
        echo "  '{$cat->name}' -> '{$new_name}'\n";
        if (!$dry_run) {
            wp_update_term($cat->term_id, 'product_cat', array('name' => $new_name));
        }
        $fixed_names++;
    }
}

echo "Category names fixed: {$fixed_names}\n";

// ============================================================
// PHASE 4: Summary of Nutrient subcategories (brands as subcats)
// ============================================================
echo "\n=== PHASE 4: NUTRIENT SUBCATEGORY AUDIT ===\n\n";
echo "These Nutrient subcategories are BRAND NAMES (should be pwb-brand instead):\n";

$nutrient_cat = get_term_by('name', 'Nutrients & Supplements', 'product_cat');
if (!$nutrient_cat) {
    // Try with HTML entities
    $all_cats = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => false));
    foreach ($all_cats as $c) {
        if (strpos($c->name, 'Nutrients') !== false && strpos($c->name, 'Supplements') !== false) {
            $nutrient_cat = $c;
            break;
        }
    }
}

if ($nutrient_cat) {
    $nutrient_subcats = get_terms(array(
        'taxonomy' => 'product_cat',
        'parent' => $nutrient_cat->term_id,
        'hide_empty' => false,
    ));
    
    // Brand-name subcategories that should be pwb-brand terms instead
    $brand_subcats = array(
        'Advanced Nutrients', 'Atami B`Cuzz', 'ATHENA', 'Botanicare',
        'Dyna-Gro', 'FoxFarm', 'Future Harvest Development',
        'General Hydroponics', 'General Organics', 'Humboldt Nutrients',
        'HYGROZYME', 'Ionic Products', 'Nectar For The Gods',
        'New Millenium', 'plagron', 'RTI Mycorrhizal', 'Scietetics',
        'SiLICIUM', 'Spray N Grow', 'TERPINATOR FINISHING!'
    );
    
    // Generic/functional subcategories to KEEP
    $keep_subcats = array(
        'Nutrients', 'Organic Nutrients', 'Plant Enhancements',
        'SOIL Additives/Supplements', 'Soil Biology Micro Bio meter'
    );
    
    foreach ($nutrient_subcats as $subcat) {
        $is_brand = in_array($subcat->name, $brand_subcats);
        $marker = $is_brand ? 'BRAND (should migrate)' : 'KEEP';
        echo "  {$subcat->name} ({$subcat->count} products) -> {$marker}\n";
    }
}

echo "\n=== AUDIT COMPLETE ===\n";
if ($dry_run) {
    echo "*** DRY RUN - no changes made. Run with CONFIRM=1 to apply Phase 1-3. ***\n";
}
