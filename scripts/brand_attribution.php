<?php
/**
 * brand_attribution.php — Detect & assign brands to all WooCommerce products
 * 
 * Uses pattern matching from brand registry to:
 * 1. Detect brand from product title/description
 * 2. Register `product_brand` taxonomy if not exists
 * 3. Create brand terms
 * 4. Assign brands to products
 * 5. Report coverage
 * 
 * Usage:
 *   wp eval-file wp-content/brand_attribution.php          # DRY RUN
 *   CONFIRM=1 wp eval-file wp-content/brand_attribution.php # LIVE
 */

wp_set_current_user(1);
global $wpdb;

$dry_run = !getenv('CONFIRM');
$assigned = 0;
$skipped = 0;
$no_match = 0;

echo "==============================================\n";
echo "  BRAND ATTRIBUTION ENGINE\n";
echo "  Mode: " . ($dry_run ? "DRY RUN" : "*** LIVE ***") . "\n";
echo "==============================================\n\n";

// ============================================================
// BRAND DETECTION PATTERNS
// ============================================================
// Product-name-based regex → canonical brand name
// Ported from hmoon-pipeline/src/utils/brand.ts + brandRegistry.ts

$BRAND_PATTERNS = [
    // === NUTRIENTS: Major ===
    'Advanced Nutrients' => '/\b(advanced nutrients|voodoo juice|big bud|bud candy|bud factor|bud ignitor|sensi (grow|bloom)|connoisseur|b-52|overdrive|piranha|tarantula|nirvana|rhino skin|sensizym|final phase|carboload|bud blood|mother earth|flawless finish|ph perfect|ancient earth|revive|iguana juice)/i',
    'General Hydroponics' => '/\b(general hydroponics|flora(gro|nova|blend|kleen|licious|nectar|micro|shield)|diamond nectar|rapid start|camag|cal[- ]?mag|aquashield|armorsi|bio(thrive|root|marine|weed|bud)|clearex|cocotek|defguard|eurogrower|floraduo|floraseries|gh |koolbloom|liquid koolbloom|maxigro|maxibloom|ripen|subculture|silica blast|drain to waste|waterfarm)/i',
    'FoxFarm' => '/\b(fox\s*farm|foxfarm|big bloom|grow big|tiger bloom|bush doctor|cha ching|beastie bloomz|happy frog|ocean forest|open sesame|bembe|boomerang|kangaroo|kelp me kelp you|microbe brew|sledgehammer|terp tea|don\'?t bug me)/i',
    'Botanicare' => '/\b(botanicare|growilla|cal-mag plus|hydroguard|power cloner|pure blend|silica blast|sweet|vitamino)/i',
    'Emerald Harvest' => '/\b(emerald harvest|cali pro|honey chome|king kola|root wizard|emerald goddess|sturdy stalk|professor|cal-mag)/i',
    'Humboldt Nutrients' => '/\b(humboldt (nutrient|secret|honey|root|sticky|county|sea cal|sea mag|deuce|master a|master b|equilibrium|bloom natural|grow natural|ginormous|prozyme|royal flush|hum-bolt|verde|flavor))/i',
    'Nectar for the Gods' => '/\b(nectar (for|of) the gods|olympus up|demeter|herculean|bloom khaos|gaia mania|pegasus potion|athena|medusa|the kraken|tritan|mega morpheus|zeus juice)/i',
    'House & Garden' => '/\b(house (and|&) garden|h&g|van de zwaan|drip clean|bud( )?xl|top (booster|shooter)|algen extract|multi zen|roots excelurator|amino treatment|magic green)/i',
    'Canna' => '/\b(canna\b|cannazym|cannaboost|rhizotonic|bio vega|bio flores|terra vega|terra flores|aqua vega|aqua flores|pk 13[\/ ]14)/i',
    'Dyna-Gro' => '/\b(dyna[- ]?(gro|bloom|foliage|mag|pro|k-l-n))/i',
    'Cyco' => '/\b(cyco\b|cyco (bloom|grow|flower|platinum|supa stiky|silica|b1 boost|uptake|zyme|kleanse|dr))/i',
    'Heavy 16' => '/\b(heavy 16|heavy sixteen)/i',
    'Remo Nutrients' => '/\b(remo (nutrients|astroflower|bloom|grow|micro|magnifical|nature|supercharged|velokelp|roots))/i',
    'Mills Nutrients' => '/\b(mills (nutrients|basis|start|c4|ultimate|vitalize))/i',

    // === NUTRIENTS: Specialty ===  
    'Plagron' => '/\b(plagron|cocos a|cocos b|terra bloom|terra grow|hydro a|hydro b|power roots|royal rush|green sensation)/i',
    'BioBizz' => '/\b(bio\s*bizz|bio[- ]?(bloom|grow|heaven|topmax|root juice|acti vera|fish mix|leaf coat|alg[- ]a[- ]mic))/i',
    'Holland Secret' => '/\b(holland secret)/i',
    'Spray N Grow' => '/\b(spray n grow)/i',
    'Cutting Edge Solutions' => '/\b(cutting edge|uncle john|plant amp|sour dee|sugaree|sonoma gold)/i',
    'Roots Organics' => '/\b(roots organics|aurora|buddha)/i',
    'Technaflora' => '/\b(technaflora|awesome blossoms|b\.c|boost|magical|root 66|sugar daddy|thrive alive)/i',
    'Growth Science' => '/\b(growth science|base a|base b|rock solid|solid start|opulent|vigor|bud explosion)/i',
    'Cultured Solutions' => '/\b(cultured solutions)/i',
    'Hydro Dynamic' => '/\b(hydro\s*dynamic|ionic (bloom|grow|boost|pk|cal)|coco (bloom|grow))/i',

    // === LIGHTING ===
    'Eye Hortilux' => '/\b(hortilux|eye hortilux|e-start|super hps|blue daylight|de\/htl|double[- ]ended)/i',
    'Gavita' => '/\b(gavita|pro (1000|1700|2400))/i',
    'Spider Farmer' => '/\b(spider farmer|sf[- ]?\d{3,4}|se\d{3,4})/i',
    'Mars Hydro' => '/\b(mars hydro|ts[- ]?\d{3,4}|tsl?[- ]?\d{3,4}|fc[- ]?\d{3,4})/i',
    'HLG' => '/\b(hlg|horticulture lighting group)/i',
    'Fluence' => '/\b(fluence|spydr|razr|vypr)/i',
    'Lumatek' => '/\b(lumatek)/i',
    'SolarMax' => '/\b(solarmax|solar max)/i',
    'Plantmax' => '/\b(plantmax|plant max)/i',
    'Philips' => '/\b(philips|son[- ]agro|agrolite)/i',
    'UltraGrow' => '/\b(ultra\s*grow|cool tube)/i',

    // === VENTILATION & ODOR ===
    'AC Infinity' => '/\b(ac infinity|cloudline|cloudlab|controller (67|69|76|79))/i',
    'Can-Fan' => '/\b(can[- ]?fan|can[- ]?filter|can[- ]?lite|can[- ]?duct)/i',
    'Vortex' => '/\b(vortex\b.*\b(fan|cfm|powerfan))/i',
    'Phresh' => '/\b(phresh filter)/i',
    'ONA' => '/\b(ona (gel|block|liquid|mist|spray|fresh linen|pro|polar crystal|breeze))/i',
    'ProFilter' => '/\b(profilter|pro filter)/i',
    'Doktor Doom' => '/\b(doktor doom|dok[eo]r doom)/i',

    // === GROWING MEDIA & CONTAINERS ===
    'Root Pouch' => '/\b(root pouch)/i',
    'Smart Pot' => '/\b(smart pot)/i',
    'GeoPot' => '/\b(geopot|geo pot)/i',
    'Gro Pro' => '/\b(gro pro|air pot)/i',
    'Grodan' => '/\b(grodan|rockwool)/i',
    'Mother Earth (Hydrofarm)' => '/\b(mother earth.*(coco|hydroton|perlite|turbo))/i',
    'Rare Earth' => '/\b(rare earth)/i',

    // === METERS & CONTROLLERS ===
    'Bluelab' => '/\b(bluelab|guardian monitor|combo meter|truncheon)/i',
    'HM Digital' => '/\b(hm digital|com-100|ph-200|tds-3|tds-4|phm-80|dm-1|dm-2)/i',
    'Hanna Instruments' => '/\b(hanna (instruments|checker))/i',
    'Control Wizard' => '/\b(control wizard)/i',
    'TrolMaster' => '/\b(trolmaster|hydro-x)/i',
    'Autopilot' => '/\b(autopilot)/i',
    'Titan Controls' => '/\b(titan (controls|timer|controller)|atlas\b.*\bco2)/i',
    'Green Air' => '/\b(green air|genesis.*calibrat)/i',

    // === CLONING & PROPAGATION ===
    'Clonex' => '/\b(clonex|clone[x]?\b)/i',
    'EZ Clone' => '/\b(ez[- ]?clone)/i',
    'Turboklone' => '/\b(turboklone|turbo klone)/i',
    'Quick Roots' => '/\b(quick roots)/i',
    'Super Sprouter' => '/\b(super sprouter)/i',

    // === PEST CONTROL ===
    'Ed Rosenthal' => '/\b(ed rosenthal|zero tolerance)/i',
    'Safer Brand' => '/\b(safer\b.*\b(garden|brand|insect|fungicide|soap))/i',
    'Flying Skull' => '/\b(flying skull|nuke em)/i',
    'SNS' => '/\b(sierra natural science|sns[- ]?\d{2,3})/i',
    'Lost Coast' => '/\b(lost coast plant therapy)/i',

    // === EQUIPMENT ===
    'Hydrofarm' => '/\b(hydrofarm)/i',
    'Sun System' => '/\b(sun system)/i',
    'VIVOSUN' => '/\b(vivosun|vivo sun)/i',
    'iPower' => '/\b(ipower|i power)/i',
    'Active Aqua' => '/\b(active aqua)/i',
    'TNC' => '/\b(tnc\b.*pump)/i',
    'Mag Drive' => '/\b(mag drive)/i',
    'Q-Max' => '/\b(q-max)/i',
    'TRIMPRO' => '/\b(trimpro|trim pro)/i',
    'Rosin Pro Press' => '/\b(rosin pro press)/i',
    'TimeMist' => '/\b(timemist)/i',
    'Diamond Silver' => '/\b(diamond (silver|white) film)/i',
    'Block-IR' => '/\b(block[- ]?ir)/i',

    // === ORGANIC / SOIL ===
    'Down To Earth' => '/\b(down to earth)/i',
    'Mykos' => '/\b(mykos|xtreme gardening)/i',
    'Plantacillin' => '/\b(plantacillin)/i',
    'CalCarb' => '/\b(calcarb)/i',
    'Terpinator' => '/\b(terpinator)/i',

    // === HOUSE BRAND ===
    'UNO' => '/\b(uno[- ](2 speed|blower|single|mechanical|fan|timer))/i',

    // === NUTRIENTS: More specific ===
    'Scietetics' => '/\b(scietetics|ful v tech|magcal)/i',
    'Ruby Ful' => '/\b(ruby ful)/i',
    'PK Apatite' => '/\b(pk apatite)/i',
    'CALNESIUM' => '/\b(calnesium)/i',
    'Carb O Naria' => '/\b(carb.{0,3}naria|car.?beau.?naria)/i',

    // === ADDITIONAL BRANDS (Phase 2 additions) ===
    'Dutch Lighting Innovations' => '/\b(dutch lighting|joule[- ]series)/i',
    'Max-Fan' => '/\b(max[- ]?fan)/i',
    'Sunblaster' => '/\b(sunblaster|sun blaster|nanotech reflector)/i',
    'EcoPlus' => '/\b(eco\s*plus|eco air)/i',
    'Snapture' => '/\b(snapture|snap(stand|ture))/i',
    'Current Culture' => '/\b(current culture|under current|undercurrent)/i',
    'Bond' => '/\b(bond\b.*\b(soil meter|shear|pruner|tie))/i',
    'Nutradip' => '/\b(nutradip|growboss)/i',
    'DutchMaster' => '/\b(dutch\s*master|gold range|silica|zone|reverse|add\.?27|advance|liquid light|saturator|max[- ]?flower)/i',
    'Panda Film' => '/\b(panda film)/i',
    'Mylar' => '/\b(mylar roll)/i',
    'B\'Cuzz' => '/\b(b.?cuzz|atami)/i',
    'Sea of Green' => '/\b(sea of green)/i',
    'Coco Tek' => '/\b(coco\s*tek)/i',
    'SiLICIUM' => '/\b(silicium)/i',
    'Char Coir' => '/\b(char coir)/i',
    'CaliClean' => '/\b(cali\s*clean)/i',
    'H&G' => '/\b(h&g|h and g)/i',
    'Ionic' => '/\b(ionic\b.*\b(bloom|grow|boost|guard|cal))/i',
    'Bucket Basket' => '/\b(bucket basket|mesh basket)/i',
    'Site Plug' => '/\b(site plug)/i',
    'Backdraft Damper' => '/\b(backdraft damper)/i',
    'RSW' => '/\b(rsw\b.*\bthermo)/i',
    'Green Air Products' => '/\b(green air\b.*\b(cd|co2|controller|generator))/i',
];

// ============================================================
// PHASE 1: Register taxonomy if needed
// ============================================================
echo "--- PHASE 1: Check/register brand taxonomy ---\n";

// Check if 'product_brand' taxonomy exists (from a plugin)
$tax_exists = taxonomy_exists('product_brand');
$use_tax = 'product_brand';

if (!$tax_exists) {
    // Check for 'pwb-brand' (Perfect Brands plugin)
    if (taxonomy_exists('pwb-brand')) {
        $use_tax = 'pwb-brand';
        echo "Found 'pwb-brand' taxonomy (Perfect Brands plugin)\n";
    } else {
        // Register our own
        if (!$dry_run) {
            register_taxonomy('product_brand', 'product', [
                'label' => 'Brands',
                'hierarchical' => false,
                'show_ui' => true,
                'show_in_menu' => true,
                'show_in_rest' => true,
                'rewrite' => ['slug' => 'brand'],
            ]);
        }
        echo ($dry_run ? "[DRY] Would register" : "Registered") . " 'product_brand' taxonomy\n";
    }
} else {
    echo "product_brand taxonomy already exists\n";
}
echo "\n";

// ============================================================
// PHASE 2: Get all products and detect brands
// ============================================================
echo "--- PHASE 2: Brand detection across all products ---\n";

$products = $wpdb->get_results("
    SELECT ID, post_title, post_content 
    FROM {$wpdb->posts}
    WHERE post_type = 'product' AND post_status = 'publish'
    ORDER BY post_title
");

$brand_counts = [];
$unmatched = [];
$assignments = [];

foreach ($products as $product) {
    $text = $product->post_title . ' ' . $product->post_content;
    $detected = null;
    
    foreach ($BRAND_PATTERNS as $brand => $pattern) {
        if (preg_match($pattern, $text)) {
            $detected = $brand;
            break;
        }
    }
    
    if ($detected) {
        $brand_counts[$detected] = ($brand_counts[$detected] ?? 0) + 1;
        $assignments[$product->ID] = $detected;
    } else {
        $unmatched[] = ['id' => $product->ID, 'title' => $product->post_title];
    }
}

// Sort brands by count
arsort($brand_counts);

echo "Detected " . count($assignments) . " / " . count($products) . " products (" 
     . round(count($assignments)/count($products)*100, 1) . "%)\n\n";

echo "Top brands:\n";
$i = 0;
foreach ($brand_counts as $brand => $count) {
    $i++;
    if ($i > 30) { echo "  ... and " . (count($brand_counts) - 30) . " more brands\n"; break; }
    echo "  " . str_pad($brand, 35) . " $count products\n";
}
echo "\nTotal unique brands: " . count($brand_counts) . "\n\n";

// ============================================================
// PHASE 3: Assign brands to products
// ============================================================
echo "--- PHASE 3: Assign brands to products ---\n";

if (!$dry_run && taxonomy_exists($use_tax)) {
    foreach ($assignments as $product_id => $brand) {
        // Create term if not exists
        $term = term_exists($brand, $use_tax);
        if (!$term) {
            $term = wp_insert_term($brand, $use_tax);
            if (is_wp_error($term)) {
                echo "  ERROR creating term '$brand': " . $term->get_error_message() . "\n";
                continue;
            }
        }
        
        $term_id = is_array($term) ? $term['term_id'] : $term;
        wp_set_object_terms($product_id, intval($term_id), $use_tax, false);
        $assigned++;
    }
    echo "Assigned brands to $assigned products\n";
} else {
    $assigned = count($assignments);
    echo "[DRY] Would assign brands to $assigned products using '$use_tax' taxonomy\n";
}
echo "\n";

// ============================================================
// PHASE 4: Unmatched products
// ============================================================
echo "--- PHASE 4: Unmatched products (" . count($unmatched) . ") ---\n";

$show_max = 50;
foreach (array_slice($unmatched, 0, $show_max) as $u) {
    echo "  #" . $u['id'] . " " . $u['title'] . "\n";
}
if (count($unmatched) > $show_max) {
    echo "  ... and " . (count($unmatched) - $show_max) . " more\n";
}

echo "\n";

// ============================================================
// PHASE 5: Also set product attribute 'pa_brand' for display
// ============================================================
echo "--- PHASE 5: Set pa_brand product attribute ---\n";

// Register product attribute if not exists
$attr_exists = $wpdb->get_var("SELECT attribute_id FROM {$wpdb->prefix}woocommerce_attribute_taxonomies WHERE attribute_name = 'brand'");

if (!$attr_exists && !$dry_run) {
    $wpdb->insert("{$wpdb->prefix}woocommerce_attribute_taxonomies", [
        'attribute_name' => 'brand',
        'attribute_label' => 'Brand',
        'attribute_type' => 'select',
        'attribute_orderby' => 'name',
        'attribute_public' => 1,
    ]);
    
    // Flush rewrite rules to register the taxonomy
    delete_transient('wc_attribute_taxonomies');
    
    // Register the taxonomy immediately
    register_taxonomy('pa_brand', 'product', [
        'label' => 'Brand',
        'hierarchical' => false,
        'show_ui' => true,
        'query_var' => true,
        'rewrite' => ['slug' => 'pa-brand'],
    ]);
    echo "Created 'pa_brand' WooCommerce product attribute\n";
} elseif ($attr_exists) {
    echo "'pa_brand' attribute already exists (ID: $attr_exists)\n";
} else {
    echo "[DRY] Would create 'pa_brand' WooCommerce product attribute\n";
}

// Assign pa_brand to products
$pa_assigned = 0;
if (!$dry_run) {
    // Make sure taxonomy is registered
    if (!taxonomy_exists('pa_brand')) {
        register_taxonomy('pa_brand', 'product', [
            'label' => 'Brand',
            'hierarchical' => false,
        ]);
    }
    
    foreach ($assignments as $product_id => $brand) {
        $term = term_exists($brand, 'pa_brand');
        if (!$term) {
            $term = wp_insert_term($brand, 'pa_brand');
            if (is_wp_error($term)) continue;
        }
        
        $term_id = is_array($term) ? $term['term_id'] : $term;
        wp_set_object_terms($product_id, intval($term_id), 'pa_brand', false);
        
        // Set product attributes meta
        $product_attrs = get_post_meta($product_id, '_product_attributes', true);
        if (!is_array($product_attrs)) $product_attrs = [];
        
        $product_attrs['pa_brand'] = [
            'name' => 'pa_brand',
            'value' => '',
            'position' => 0,
            'is_visible' => 1,
            'is_variation' => 0,
            'is_taxonomy' => 1,
        ];
        update_post_meta($product_id, '_product_attributes', $product_attrs);
        $pa_assigned++;
    }
    echo "Set pa_brand attribute on $pa_assigned products\n";
} else {
    echo "[DRY] Would set pa_brand on " . count($assignments) . " products\n";
}

echo "\n";

// ============================================================
// SUMMARY
// ============================================================
echo "==============================================\n";
echo "  SUMMARY\n";
echo "==============================================\n";
echo "Total products:     " . count($products) . "\n";
echo "Brands detected:    " . count($assignments) . " (" . round(count($assignments)/count($products)*100,1) . "%)\n";
echo "Unique brands:      " . count($brand_counts) . "\n";
echo "Unmatched products: " . count($unmatched) . "\n";
echo "Mode: " . ($dry_run ? "DRY RUN" : "LIVE") . "\n";
echo "==============================================\n";
