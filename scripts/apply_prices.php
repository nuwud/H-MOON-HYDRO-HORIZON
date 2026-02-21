<?php
/**
 * H-Moon Hydro Price Fix Script
 * Applies prices to 251 products missing prices
 * Sources: Feb 12 CSV export, enrichment retailer matches, manual MSRP
 * 
 * DRY RUN: wp eval-file wp-content/apply_prices.php
 * LIVE:    CONFIRM=1 wp eval-file wp-content/apply_prices.php
 */

wp_set_current_user(1);

$confirm = getenv('CONFIRM') === '1';
$dry_run = !$confirm;

if ($dry_run) {
    echo "=== DRY RUN MODE (use CONFIRM=1 to apply) ===\n";
} else {
    echo "=== LIVE MODE - Applying prices ===\n";
}

// product_id => array(price, title, source)
$price_fixes = array(
    72619 => array(27.48, 'HydroDynamics Clonex Mist 100 ml', 'enrichment_match'),
    72703 => array(45.00, 'Athena CaMg', 'feb12_csv'),
    72722 => array(24.95, 'Teaming with Bacteria: The Organic Gardener\'s Gui', 'manual_msrp'),
    72779 => array(29.99, 'Scietetics Foundation Powder', 'manual_msrp'),
    72791 => array(9.99, 'SCIETETICS COCO 8" BLOCK /1.5Gal', 'manual_msrp'),
    72858 => array(16.99, 'FloraBlend', 'manual_msrp'),
    72859 => array(17.99, 'BioThrive', 'manual_msrp'),
    72863 => array(19.99, 'BioBud', 'manual_msrp'),
    72864 => array(22.99, 'BioMarine', 'manual_msrp'),
    72865 => array(16.99, 'BioWeed', 'manual_msrp'),
    72866 => array(14.99, 'CaMg+', 'manual_msrp'),
    72867 => array(14.99, 'Diamond Black', 'manual_msrp'),
    72868 => array(33.73, 'Diamond Nectar', 'enrichment_match'),
    72869 => array(170.00, 'FloraDuo Complete', 'feb12_csv'),
    72871 => array(51.00, 'Floralicious Plus', 'enrichment_match'),
    72872 => array(16.99, 'FloraNectar', 'manual_msrp'),
    72873 => array(16.99, 'Flora Shield', 'manual_msrp'),
    72874 => array(18.29, 'FloraKleen', 'enrichment_match'),
    72875 => array(22.99, 'KoolBloom', 'manual_msrp'),
    72876 => array(322.50, 'Liquid KoolBloom™ 0 - 10 - 10', 'feb12_csv'),
    72877 => array(29.99, 'Rapid Start', 'manual_msrp'),
    72879 => array(67.00, 'B\'Cuzz BIO-NRG Flavor', 'feb12_csv'),
    72881 => array(51.50, 'B\'Cuzz Hydro Nutrients', 'feb12_csv'),
    72882 => array(17.27, 'B\'Cuzz PK 13/14', 'enrichment_match'),
    72883 => array(29.71, 'B\'Cuzz Growth Stimulator', 'enrichment_match'),
    72884 => array(43.01, 'B\'Cuzz Root Stimulator', 'feb12_csv'),
    72885 => array(15.99, 'Better Bloom 12-34-12', 'manual_msrp'),
    72886 => array(202.98, 'Jungle Green 17-15-17', 'feb12_csv'),
    72887 => array(15.99, 'Royal Black', 'manual_msrp'),
    72888 => array(164.99, 'Royal Gold', 'feb12_csv'),
    72889 => array(232.00, 'Yield Up 9-47-9', 'feb12_csv'),
    72890 => array(19.99, 'Bud Boom', 'manual_msrp'),
    72891 => array(18.99, 'Bud Start', 'manual_msrp'),
    72892 => array(15.99, 'Carbo Blast', 'manual_msrp'),
    72893 => array(109.35, 'Prop-O-Gator Plant Food', 'feb12_csv'),
    72894 => array(16.99, 'Suck it Up', 'manual_msrp'),
    72895 => array(448.98, 'Double Super B+ Extra Strength', 'feb12_csv'),
    72896 => array(22.99, 'Ton O Bud 0-10-6', 'manual_msrp'),
    72897 => array(17.99, 'The Hammer', 'manual_msrp'),
    72898 => array(117.00, 'Humboldt Grow 2-1-6', 'feb12_csv'),
    72899 => array(159.12, 'Humboldt Micro 5-0-1', 'feb12_csv'),
    72900 => array(86.69, 'Humboldt Bloom 0-6-5', 'enrichment_match'),
    72901 => array(19.05, 'Big Up Powder 0-33-23', 'enrichment_match'),
    72902 => array(19.99, 'Sea Cal 3-2-8', 'manual_msrp'),
    72903 => array(19.99, 'Sea Mag 0.2-0.2-3', 'manual_msrp'),
    72904 => array(25.81, 'Master A', 'enrichment_match'),
    72905 => array(25.81, 'Master B', 'enrichment_match'),
    72906 => array(70.00, 'DueceDuece', 'feb12_csv'),
    72908 => array(18.99, 'Hydro-Deuce', 'manual_msrp'),
    72911 => array(29.04, 'Grow Natural', 'enrichment_match'),
    72912 => array(29.04, 'Bloom Natural', 'enrichment_match'),
    72913 => array(19.36, 'Hum-Bolt', 'enrichment_match'),
    72914 => array(18.99, 'Flavor-Ful', 'manual_msrp'),
    72915 => array(17.99, 'Verde Growth Catalyst', 'manual_msrp'),
    72916 => array(26.46, 'Oneness 5-9-4', 'enrichment_match'),
    72917 => array(22.99, 'Mayan Microzyme', 'manual_msrp'),
    72919 => array(28.69, 'Myco Madness Soluble', 'enrichment_match'),
    72920 => array(22.99, 'Myco Maximum Granular', 'manual_msrp'),
    72921 => array(25.81, 'Humboldt Honey Hydro Carbs', 'enrichment_match'),
    72922 => array(25.81, 'Humboldt Honey ES', 'enrichment_match'),
    72923 => array(115.00, 'Humboldt Roots', 'feb12_csv'),
    72924 => array(30.00, 'Humboldt Sticky Foliar Feed', 'feb12_csv'),
    72926 => array(34.99, 'CalCarb Calcium Carbonate Foliar Spray', 'feb12_csv'),
    72927 => array(10.60, 'CocoTek Caps', 'feb12_csv'),
    72928 => array(26.90, 'CocoTek Liners', 'feb12_csv'),
    72929 => array(19.99, 'Rapid Rooter Rooting Plugs', 'manual_msrp'),
    72930 => array(134.95, 'BASIC Magnetic Ballast', 'feb12_csv'),
    72931 => array(156.35, 'Ultragrow Cool Tube', 'feb12_csv'),
    72932 => array(8.75, 'ONA Block', 'feb12_csv'),
    72933 => array(29.06, 'ONA Liquid', 'enrichment_match'),
    72934 => array(12.91, 'ONA Gel Fresh Linen', 'enrichment_match'),
    72935 => array(11.68, 'ONA Mist', 'feb12_csv'),
    72939 => array(74.95, 'TimeMist Plus Programmable Dispenser', 'feb12_csv'),
    72940 => array(16.95, 'Safer Garden Fungicide 32oz RTU Spray', 'feb12_csv'),
    72941 => array(249.00, 'Block-IR Infra-Red Barrier', 'feb12_csv'),
    72943 => array(5.95, 'B\'cuzZ Roxx Rooting Blocks', 'feb12_csv'),
    72944 => array(8.00, 'B\'cuzZ Roxx Bimatrix Growing Slabs', 'feb12_csv'),
    72946 => array(104.49, 'Mag Drive Pumps', 'feb12_csv'),
    72947 => array(88.95, 'Reflective Mylar Rolls', 'feb12_csv'),
    72949 => array(17.50, 'Green Air Genesis Calibration Solutions', 'feb12_csv'),
    72953 => array(64.50, 'General Hydroponics pH Up', 'feb12_csv'),
    72956 => array(94.95, 'Plantmax Pulse Start Metal Halide Lamps', 'feb12_csv'),
    72957 => array(96.00, 'BADBOY HO Triphosphor Lamps', 'feb12_csv'),
    72958 => array(79.95, 'Plantmax SUPER High Pressure Sodium', 'feb12_csv'),
    72959 => array(49.99, 'Plantmax HPS Conversion (MH Ballast)', 'manual_msrp'),
    72960 => array(89.95, 'Plantmax MH Conversion (HPS Ballast)', 'feb12_csv'),
    72961 => array(135.95, 'VEGETATIVE - HPS Ballast', 'feb12_csv'),
    72962 => array(123.95, 'VEGETATIVE - MH Ballast', 'feb12_csv'),
    72964 => array(169.99, 'Light Rail 5', 'manual_msrp'),
    72966 => array(22.00, 'Grommets', 'feb12_csv'),
    72967 => array(47.20, '1/2" Barb Connectors', 'feb12_csv'),
    72968 => array(25.45, 'The Bucket Basket', 'enrichment_match'),
    72969 => array(97.00, 'Netpots', 'feb12_csv'),
    72970 => array(2.99, 'Site Plugs', 'manual_msrp'),
    72971 => array(4.79, 'Snapture SnapStand', 'feb12_csv'),
    72973 => array(305.00, 'CST-1(P) Timer / frequency & duration', 'feb12_csv'),
    72974 => array(255.00, '24-DT-1 -- 24 Hour Clock Timer', 'feb12_csv'),
    72975 => array(400.00, 'LT4 - 4 Light Timer (120 or 240 V)', 'feb12_csv'),
    72977 => array(14.99, 'ON /OFF Switcher 120V', 'manual_msrp'),
    72978 => array(254.00, 'Vortex Powerfans', 'feb12_csv'),
    72979 => array(56.95, 'Backdraft Dampers', 'feb12_csv'),
    72980 => array(359.99, 'Thermostatically Controlled Centrifugal Fans', 'feb12_csv'),
    72981 => array(433.31, 'Original Can Fans', 'feb12_csv'),
    72982 => array(399.00, 'Can Filters', 'feb12_csv'),
    72983 => array(23.33, 'Can Filter Pre-Filters', 'feb12_csv'),
    72984 => array(45.00, 'Can Filter Flanges', 'feb12_csv'),
    72985 => array(111.14, 'Ducting', 'feb12_csv'),
    72986 => array(169.99, 'Max-Fan', 'manual_msrp'),
    72987 => array(366.95, 'PROfilter reversible carbon filters', 'feb12_csv'),
    72988 => array(313.32, '38-Special by Can-Filters', 'feb12_csv'),
    72989 => array(79.99, 'The Rack - Collapsible Drying System', 'manual_msrp'),
    72990 => array(1705.50, 'The TRIMPRO', 'enrichment_match'),
    72992 => array(1754.61, 'TRIMPRO ROTOR', 'feb12_csv'),
    72993 => array(14.99, 'Rare Earth', 'manual_msrp'),
    72995 => array(330.00, 'B-52 Vitamin', 'feb12_csv'),
    72996 => array(330.00, 'Big Bud Bloom Booster (Powder)', 'feb12_csv'),
    72997 => array(166.50, 'Bud Blood Bloom Stimulator', 'feb12_csv'),
    72998 => array(18.99, 'Bud Candy', 'manual_msrp'),
    72999 => array(42.99, 'Bud Factor X', 'manual_msrp'),
    73000 => array(14.99, 'CarboLoad', 'manual_msrp'),
    73001 => array(16.99, 'Final Phase', 'manual_msrp'),
    73002 => array(56.50, 'Mother Earth Organic Super Tea Grow', 'feb12_csv'),
    73003 => array(24.99, 'Nirvana', 'manual_msrp'),
    73004 => array(24.99, 'Overdrive', 'manual_msrp'),
    73005 => array(56.82, 'Piranha Beneficial Fungi', 'feb12_csv'),
    73007 => array(79.96, 'Sensi Grow Two-part', 'feb12_csv'),
    73008 => array(24.99, 'Sensizym', 'manual_msrp'),
    73009 => array(56.82, 'Tarantula Beneficial Bacteria', 'feb12_csv'),
    73010 => array(95.00, 'Ultra-premium Connoisseur', 'feb12_csv'),
    73011 => array(330.00, 'VooDoo Juice Root Booster', 'feb12_csv'),
    73012 => array(30.29, 'Grow Big Liquid Plant Food (6-4-4)', 'enrichment_match'),
    73013 => array(17.99, 'Tiger Bloom Liquid Plant Food (2-8-4)', 'manual_msrp'),
    73014 => array(4.99, 'Root Pouch', 'manual_msrp'),
    73016 => array(14.99, 'CALiMAGic', 'manual_msrp'),
    73017 => array(15.06, 'Pure Blend Pro Grow', 'enrichment_match'),
    73018 => array(18.99, 'Pure Blend Pro Bloom', 'manual_msrp'),
    73019 => array(87.83, 'Pure Blend Pro Soil', 'enrichment_match'),
    73020 => array(29.99, 'Hydroplex', 'manual_msrp'),
    73021 => array(20.76, 'Liquid Karma', 'enrichment_match'),
    73023 => array(23.73, 'Cal-Mag Plus', 'enrichment_match'),
    73024 => array(14.99, 'Clearex', 'manual_msrp'),
    73025 => array(16.44, 'Silica Blast', 'enrichment_match'),
    73026 => array(2.50, 'Mondi Super Saucers', 'feb12_csv'),
    73027 => array(6.33, 'Mondi Mini Greenhouse 4" and 7" Propagation Domes', 'enrichment_match'),
    73028 => array(76.00, 'PH Perfect Ultra-premium Connoisseur', 'feb12_csv'),
    73029 => array(13.27, 'pH Perfect Sensi Bloom 2-Part', 'enrichment_match'),
    73030 => array(13.27, 'pH Perfect Sensi Grow 2-Part', 'enrichment_match'),
    73031 => array(65.50, 'B\'CuzZ CoCo Nutrients', 'feb12_csv'),
    73032 => array(30.19, 'Captain Jacks Dead Bug Brew', 'feb12_csv'),
    73033 => array(389.00, 'TRIMPRO UNPLUGGED', 'feb12_csv'),
    73034 => array(48.95, 'EcoPlus Submersible Pumps', 'feb12_csv'),
    73035 => array(20.00, 'Grow it Clay stone 10 lters', 'feb12_csv'),
    73036 => array(56.00, 'Dyna-Gro Grow', 'feb12_csv'),
    73037 => array(28.99, 'Dyna-Gro Bloom', 'feb12_csv'),
    73038 => array(23.98, 'Dyna-Gro Pro Tekt', 'enrichment_match'),
    73039 => array(14.95, 'UNO Rope Ratchets', 'feb12_csv'),
    73041 => array(12.50, 'EcoPlus Pump Filter Bags', 'feb12_csv'),
    73043 => array(78.95, 'EcoPlus Commercial Air Pumps', 'feb12_csv'),
    73044 => array(390.00, 'UNO Grow Tents', 'feb12_csv'),
    73047 => array(2.95, 'Long Term Storage Bags', 'feb12_csv'),
    73048 => array(9.99, 'ONA Spray', 'manual_msrp'),
    73049 => array(70.00, 'Clonex Clone Solution', 'feb12_csv'),
    73050 => array(57.30, 'Vitamino', 'enrichment_match'),
    73051 => array(49.99, 'UNO XXL 8" Piper', 'manual_msrp'),
    73052 => array(12.90, 'Aphrodite\'s Extraction', 'enrichment_match'),
    73053 => array(19.35, 'Athena\'s Aminas', 'enrichment_match'),
    73055 => array(22.99, 'Bloom Khaos', 'manual_msrp'),
    73056 => array(16.99, 'Demeter\'s Destiny', 'manual_msrp'),
    73057 => array(16.99, 'Gaia Mania', 'manual_msrp'),
    73058 => array(7.26, 'Herculean Harvest', 'enrichment_match'),
    73059 => array(14.99, 'Hygeia\'s Hydration', 'manual_msrp'),
    73060 => array(14.18, 'Medusa\'s Magic', 'enrichment_match'),
    73061 => array(3.23, 'Mega Morpheus', 'enrichment_match'),
    73062 => array(3.23, 'Pegasus Potion', 'enrichment_match'),
    73064 => array(32.87, 'Super Sprouter Heat Mat', 'enrichment_match'),
    73065 => array(82.84, 'Atami RootBlastic', 'feb12_csv'),
    73066 => array(34.95, 'Universal T5HO Sunblaster Light Stand', 'feb12_csv'),
    73067 => array(24.99, 'Decision', 'manual_msrp'),
    73068 => array(24.99, 'Equinox', 'manual_msrp'),
    73069 => array(17.99, 'Lightning Start', 'manual_msrp'),
    73070 => array(19.99, 'Ruby Ful#$%', 'manual_msrp'),
    73071 => array(24.99, 'Spring', 'manual_msrp'),
    73072 => array(24.99, 'Summer', 'manual_msrp'),
    73073 => array(24.99, 'Autumn', 'manual_msrp'),
    73074 => array(24.99, 'Winter Frost', 'manual_msrp'),
    73075 => array(529.00, 'LEC 315 Ceramic Digital System', 'feb12_csv'),
    73078 => array(14.99, 'PK APATITE', 'manual_msrp'),
    73079 => array(100.50, 'Black & White Panda Film (poly)', 'feb12_csv'),
    73080 => array(162.00, 'Diamond Silver White Film', 'feb12_csv'),
    73081 => array(70.00, 'General Hydroponics® CocoTek® Grow - A 3 - 0 - 1 &', 'feb12_csv'),
    73083 => array(219.95, 'UNO-2 Speed Controled in line blowers', 'feb12_csv'),
    73084 => array(169.00, 'Dual Lamp Fixture', 'feb12_csv'),
    73085 => array(74.95, 'Accurate pH 4 w/remote probe', 'feb12_csv'),
    73086 => array(100.00, 'HydroDynamics Ionic® Bloom 3-2-6 Premium Plant Nut', 'feb12_csv'),
    73087 => array(19.99, 'HydroDynamics Ionic® Grow 3 - 1 - 5 Premium Plant ', 'manual_msrp'),
    73088 => array(100.00, 'HydroDynamics Ionic® PK Boost 0-5-6 Premium Plant ', 'feb12_csv'),
    73089 => array(50.00, 'Hydrodynamics int. Coco/Soil Grow', 'feb12_csv'),
    73090 => array(79.00, 'Plagron Terra Grow', 'feb12_csv'),
    73091 => array(350.00, 'D‐Papillon 315W FULL SPECTRUM 240V', 'feb12_csv'),
    73093 => array(14.17, 'Humboldt Nutrients S.I. Structural Integrity', 'enrichment_match'),
    73094 => array(46.00, 'Pure Clean Natural Enzymes', 'feb12_csv'),
    73095 => array(109.00, 'Plagron Royal Rush', 'feb12_csv'),
    73096 => array(89.00, 'Plagron Power Roots', 'feb12_csv'),
    73097 => array(52.50, 'Cocos A & B', 'feb12_csv'),
    73098 => array(17.99, 'plagron Hydro A&B', 'manual_msrp'),
    73099 => array(544.00, 'BADBOY T5 lighting System', 'feb12_csv'),
    73100 => array(94.95, 'Eye Hortilux e-Start Metal Halide Lamps', 'feb12_csv'),
    73101 => array(85.00, 'Clonex Root Maximizer - Granular/ for soil applica', 'feb12_csv'),
    73104 => array(6.00, 'Black Plastic Buckets - 3 & 5 Gallon', 'feb12_csv'),
    73105 => array(24.99, 'SiLICIUM', 'manual_msrp'),
    73106 => array(134.95, 'GREENPOWERLUMINAIRES-REMOTE 315', 'feb12_csv'),
    73107 => array(18.95, '315 Socket adapter for 38 mogal - 315 Socket Adapt', 'feb12_csv'),
    73111 => array(950.00, 'ROSIN PRO PRESS CO. Pneumatic', 'feb12_csv'),
    73112 => array(260.00, 'GREENPOWERLUMINAIRES 630 Remote', 'feb12_csv'),
    73116 => array(34.39, 'Down To Earth Bat Guano 9 - 3 - 1', 'feb12_csv'),
    73119 => array(42.95, 'Down To Earth Bone Meal 3 - 15 - 0', 'feb12_csv'),
    73120 => array(60.00, 'Down To Earth Vegan Mix 3 - 2 - 2', 'feb12_csv'),
    73121 => array(65.49, 'Down To Earth Kelp Meal 1 - 0.1 - 2', 'feb12_csv'),
    73123 => array(15.17, 'Down To Earth Bat Guano 9-3-1', 'enrichment_match'),
    73124 => array(19.99, 'CALNESIUM Deficiency Correction Supplement', 'manual_msrp'),
    73126 => array(6.40, 'Sticky Whitefly Trap 3/Pack', 'feb12_csv'),
    73127 => array(318.00, 'Carb O Naria 0-0-0.3', 'feb12_csv'),
    73128 => array(115.89, 'Ripen® 0.5-7-6', 'feb12_csv'),
    73129 => array(51.00, 'Flashgro Roll', 'feb12_csv'),
    73130 => array(24.99, 'Terpinator 0 - 0 - 4', 'manual_msrp'),
    73131 => array(29.95, 'Ed Rosenthal Marijuana Grower\'s Handbook', 'manual_msrp'),
    73132 => array(299.99, 'UNO GEN-1eNG', 'manual_msrp'),
    73133 => array(399.99, 'UNO-GEN-2elp Propane', 'manual_msrp'),
    73135 => array(29.99, 'Scietetics Ful V Tech Element Transfer System', 'manual_msrp'),
    73136 => array(12.99, 'Spray N Grow', 'manual_msrp'),
    73137 => array(8.32, 'Big Bloom Liquid Plant Food', 'enrichment_match'),
    73138 => array(17.99, 'Sensi Bloom part B', 'manual_msrp'),
    73139 => array(17.99, 'Sensi Bloom part A', 'manual_msrp'),
    73143 => array(12.99, 'Quick Roots Gel', 'manual_msrp'),
    73144 => array(14.99, 'Holland Secret Bloom', 'manual_msrp'),
    73145 => array(14.99, 'Holland Secret Grow', 'manual_msrp'),
    73146 => array(14.99, 'Holland Secret Micro H.W', 'manual_msrp'),
    73147 => array(14.99, 'Holland Secret Micro', 'manual_msrp'),
    73148 => array(19.99, 'Liquid Bud Boom', 'manual_msrp'),
    73149 => array(18.99, 'Liquid Bud Start', 'manual_msrp'),
    73150 => array(15.99, 'Liquid Carbo Blast', 'manual_msrp'),
    73151 => array(22.99, 'Liquid Ton O Bud 0-10-6', 'manual_msrp'),
    73153 => array(29.99, 'Big Bud Bloom Booster (Liquid)', 'manual_msrp'),
    73155 => array(164.18, 'SiLICIUM mono si', 'enrichment_match'),
    73156 => array(21.86, 'ONA Gel Pro', 'enrichment_match'),
    73157 => array(122.10, 'Mother Earth Organic Super Tea Bloom', 'enrichment_match'),
    73158 => array(17.99, 'Plagron Terra Bloom', 'manual_msrp'),
    73159 => array(19.99, 'Hydrodynamics int. Coco/Soil Bloom', 'manual_msrp'),
    73161 => array(100.30, 'General Hydroponics pH Down', 'enrichment_match'),
    73162 => array(13.33, 'pH & TDS Calibration Solutions', 'enrichment_match'),
    73163 => array(9.99, 'pH Test Kits', 'manual_msrp'),
);

$updated = 0;
$skipped = 0;
$errors = 0;

foreach ($price_fixes as $product_id => $info) {
    list($price, $title, $source) = $info;
    
    // Verify product exists
    $post = get_post($product_id);
    if (!$post || $post->post_type !== 'product') {
        echo "SKIP: #$product_id not found or not a product\n";
        $skipped++;
        continue;
    }
    
    // Check if already has a price (don't overwrite existing)
    $current_price = get_post_meta($product_id, '_regular_price', true);
    if (!empty($current_price) && floatval($current_price) > 0) {
        $skipped++;
        continue;
    }
    
    $price_str = number_format($price, 2, '.', '');
    
    if ($dry_run) {
        echo "WOULD SET: #$product_id $title => \$$price_str [$source]\n";
        $updated++;
    } else {
        // Set both _regular_price and _price (WooCommerce needs both)
        update_post_meta($product_id, '_regular_price', $price_str);
        update_post_meta($product_id, '_price', $price_str);
        
        // Clear cached product data
        wc_delete_product_transients($product_id);
        
        echo "SET: #$product_id $title => \$$price_str [$source]\n";
        $updated++;
    }
}

echo "\n=== SUMMARY ===\n";
echo "Updated: $updated\n";
echo "Skipped (already priced or not found): $skipped\n";
echo "Errors: $errors\n";

if ($dry_run) {
    echo "\nRun with CONFIRM=1 to apply these changes.\n";
}
