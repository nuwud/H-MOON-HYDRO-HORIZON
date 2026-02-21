<?php
/**
 * Phase 5: Dissolve brand-name subcategories under Nutrients & Supplements
 * 
 * Products in "Advanced Nutrients" subcategory -> move to parent "Nutrients & Supplements"
 * The brand is already in pwb-brand taxonomy from Phase 1.
 * Keep functional subcategories: Nutrients, Organic Nutrients, Plant Enhancements, Soil Additives
 */
wp_set_current_user(1);
global $wpdb;

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN MODE ===\n\n" : "=== LIVE MODE ===\n\n";

// Find the Nutrients & Supplements parent
$all_cats = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => false));
$nutrient_parent = null;
foreach ($all_cats as $c) {
    if (strpos($c->name, 'Nutrients') !== false && strpos($c->name, 'Supplements') !== false) {
        $nutrient_parent = $c;
        break;
    }
}

if (!$nutrient_parent) {
    echo "ERROR: Cannot find Nutrients & Supplements category!\n";
    exit;
}

echo "Parent: {$nutrient_parent->name} (#{$nutrient_parent->term_id})\n\n";

// Brand subcategories to dissolve
$brand_subcats_to_dissolve = array(
    'Advanced Nutrients', 'Atami B`Cuzz', 'ATHENA', 'Botanicare',
    'Dyna-Gro', 'FoxFarm', 'Future Harvest Development',
    'General Hydroponics', 'General Organics', 'Humboldt Nutrients',
    'Ionic Products', 'Nectar For The Gods', 'New Millenium',
    'plagron', 'RTI Mycorrhizal', 'Scietetics', 'SiLICIUM',
);

$total_moved = 0;
$cats_deleted = 0;

foreach ($brand_subcats_to_dissolve as $subcat_name) {
    $subcat = null;
    foreach ($all_cats as $c) {
        if ($c->name === $subcat_name && $c->parent == $nutrient_parent->term_id) {
            $subcat = $c;
            break;
        }
    }
    
    if (!$subcat) {
        echo "  '{$subcat_name}' - not found as subcategory, skipping\n";
        continue;
    }
    
    $products = get_posts(array(
        'post_type' => 'product',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'tax_query' => array(
            array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $subcat->term_id)
        )
    ));
    
    echo "  '{$subcat_name}': " . count($products) . " products\n";
    
    if (!$dry_run) {
        // Move products to parent category
        foreach ($products as $pid) {
            // Add parent category
            wp_set_object_terms($pid, $nutrient_parent->term_id, 'product_cat', true);
            // Remove brand subcategory
            wp_remove_object_terms($pid, $subcat->term_id, 'product_cat');
        }
        $total_moved += count($products);
        
        // Delete the brand subcategory
        wp_delete_term($subcat->term_id, 'product_cat');
        $cats_deleted++;
        echo "    -> Moved to parent & deleted subcategory\n";
    } else {
        $total_moved += count($products);
    }
}

// Also clean up empty subcategories
echo "\n--- Empty subcategories ---\n";
$nutrient_subcats = get_terms(array(
    'taxonomy' => 'product_cat',
    'parent' => $nutrient_parent->term_id,
    'hide_empty' => false,
));
foreach ($nutrient_subcats as $sc) {
    if ($sc->count == 0 && !in_array($sc->name, array('Nutrients', 'Organic Nutrients', 'Plant Enhancements', 'Soil Additives & Supplements'))) {
        echo "  Empty: '{$sc->name}' (0 products)\n";
        if (!$dry_run) {
            wp_delete_term($sc->term_id, 'product_cat');
            $cats_deleted++;
            echo "    -> Deleted\n";
        }
    }
}

// Also dissolve "Grow Tents AC INFINITY" -> merge into Environmental Control or Grow Tents
$grow_tents = get_term_by('name', 'Grow Tents AC INFINITY', 'product_cat');
if ($grow_tents) {
    echo "\n  'Grow Tents AC INFINITY': {$grow_tents->count} products -> rename to 'Grow Tents'\n";
    if (!$dry_run) {
        wp_update_term($grow_tents->term_id, 'product_cat', array('name' => 'Grow Tents'));
    }
}

// Fix "Grease" category -> rename to "Extraction Equipment"
$grease_cat = get_term_by('name', 'Grease', 'product_cat');
if ($grease_cat) {
    echo "\n  'Grease': {$grease_cat->count} products\n";
    // Check what products are in it
    $grease_products = get_posts(array(
        'post_type' => 'product',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'tax_query' => array(
            array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $grease_cat->term_id)
        )
    ));
    foreach ($grease_products as $gp) {
        $title = get_the_title($gp);
        echo "    #{$gp} {$title}\n";
    }
}

echo "\n=== SUMMARY ===\n";
echo "Products moved to parent: {$total_moved}\n";
echo "Brand subcategories deleted: {$cats_deleted}\n";

if ($dry_run) {
    echo "\n*** DRY RUN - no changes made. Run with CONFIRM=1 to apply. ***\n";
}
