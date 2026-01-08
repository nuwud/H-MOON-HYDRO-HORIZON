/**
 * Apply External Images to Shopify CSV
 * 
 * Matches products from external_images_tracker.json to the CSV
 * and updates the Image Src column for products that are missing images.
 */

const fs = require('fs');
const path = require('path');

// Image mappings from manufacturer websites (crawled from official product pages)
const IMAGE_MAPPINGS = {
  // =====================
  // ADVANCED NUTRIENTS - Official 1L bottles from advancednutrients.com
  // =====================
  'b-52': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'b-52-4l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'b-52-10l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'b-52-lt': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'an-b-52-23-liter': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  
  'big-bud': 'https://www.advancednutrients.com/wp-content/uploads/2022/06/Big-Bud-Liquid-1L-Advanced-Nutrients.png',
  'big-bud-10l': 'https://www.advancednutrients.com/wp-content/uploads/2022/06/Big-Bud-Liquid-1L-Advanced-Nutrients.png',
  
  'bud-ignitor': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Ignitor-1L.png',
  'bud-blood': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Blood-1L.png',
  
  'piranha': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Piranha-Liquid-1L.png',
  
  'revive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Revive-1L.png',
  'an-revive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Revive-1L.png',
  'revive-lt': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Revive-1L.png',
  'advanced-nutrients-revive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Revive-1L.png',
  
  'voodoo-juice': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Voodoo-Juice-1L.png',
  
  'overdrive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Overdrive-1L.png',
  'overdrive-1': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Overdrive-1L.png',
  'overdrive-2-5': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Overdrive-1L.png',
  
  'tarantula': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Tarantula-Liquid-1L.png',
  'tarantula-liquid-500ml': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Tarantula-Liquid-1L.png',
  'tarantula-liquid-fertilizer-qts': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Tarantula-Liquid-1L.png',
  
  'sensizym': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Sensizym-1L.png',
  
  'rhino-skin': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Rhino-Skin-1L.png',
  'rhino-skin-4l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Rhino-Skin-1L.png',
  'an-rino-skin': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Rhino-Skin-1L.png',
  
  'nirvana': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Nirvana-1L.png',
  'nirvana-1': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Nirvana-1L.png',
  'a-n-nirvana-fertilizer-500ml': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Nirvana-1L.png',
  
  'flawless-finish': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Flawless-Finish-1L.png',
  'final-phase': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Flawless-Finish-1L.png',
  'final-phase-1': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Flawless-Finish-1L.png',
  
  // Advanced Nutrients - Connoisseur series (from advancednutrients.com/products/)
  'connoisseur': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-part-a-grow': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-part-b-grow': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-part-b-grow-4l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-a-bloom-php': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-b-4l-bloom-php': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-bloom-a-liter': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'connoisseur-bloom-a-lt-php': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  
  // Advanced Nutrients - Sensi series 
  'sensi-grow': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  'sensi-bloom': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  'an-ph-perfect-sesi-bloom-a-10l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  'an-ph-perfect-sensibloom-b-10l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  
  // Advanced Nutrients - Additional products from catalog
  'bud-candy': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Candy-1L.jpg',
  'bud-factor-x': 'https://www.advancednutrients.com/wp-content/uploads/2022/06/Advanced-Nutrients-Bud-Factor-X-1L.jpg',
  'iguana-juice': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/OG-Organics-Iguana-Juice-Grow-Bloom-Advanced-Nutrients-1L-1.jpg',
  'ancient-earth': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/OG-Organics-Ancient-Earth-Advanced-Nutrients-1L-3.jpg',
  'sensi-cal-mag': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Sensi-Cal-Mag-Xtra-1L.jpg',
  'sensi-calmag': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Sensi-Cal-Mag-Xtra-1L.jpg',
  'jungle-juice': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Jungle-Juice-1L.png',
  
  // =====================
  // GENERAL HYDROPONICS - 1600x1600 PNGs from generalhydroponics.com
  // =====================
  'armor-si': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_AmorSi-new-quart-1600x1600.png',
  
  'flora-series': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraSeries_PerfPack_L-1600x1600.png',
  'floragro': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraGro-new-pint-1-1600x1600.png',
  'floragro-1-gallon': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraGro-1gal-1600x1600.png',
  'floragro-quart': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraGro-new-pint-1-1600x1600.png',
  
  'floramicro': 'https://generalhydroponics.com/wp-content/uploads/GH-product-image-floramicro-update-1600x1600.png',
  'floramicro-1-gallon': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraMicro-1gal-1600x1600.png',
  
  'florabloom': 'https://generalhydroponics.com/wp-content/uploads/GH-product-image-florabloom-update-1600x1600.png',
  'florabloom-1-gallon': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraBloom-1gal-1600x1600.png',
  
  'calimagic': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_CALiMAGic-new-quart-1600x1600.png',
  'cal-mag': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_CALiMAGic-new-quart-1600x1600.png',
  
  'rapidstart': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_RapidStart-new-125ml-1600x1600.png',
  'rapid-start': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_RapidStart-new-125ml-1600x1600.png',
  
  'liquid-koolbloom': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_LiquidKoolBloom-new-quart-1600x1600.png',
  'koolbloom': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_LiquidKoolBloom-new-quart-1600x1600.png',
  'koolbloom-dry': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_KoolBloomDry-new-2.2lb-1600x1600.png',
  
  'florablend': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraBlend-new-quart-1600x1600.png',
  'florakleen': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraKleen-new-quart-1600x1600.png',
  'floralicious-plus': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_floralicious-plus-1pint-1600x1600.png',
  
  'ph-up': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_pHUp-new-quart-1600x1600.png',
  'ph-down': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_pHDown-new-quart-1600x1600.png',
  
  'diamond-nectar': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_DiamondNectar-new-quart-1600x1600.png',
  'bioroot': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_BioRoot-new-quart-1600x1600.png',
  
  // =====================
  // BOTANICARE - From botanicare.com
  // =====================
  'liquid-karma': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_SUPPLEMENTS_0015_Liquid-Karma.jpg',
  'hydroguard': 'https://www.botanicare.com/wp-content/uploads/2020/10/Hydroguard_Bags1.png',
  'cal-mag-plus': 'https://www.botanicare.com/wp-content/uploads/BC__0001_SUPPLEMENTS.png',
  'calmag': 'https://www.botanicare.com/wp-content/uploads/BC__0001_SUPPLEMENTS.png',
  'pure-blend-pro': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_NUTRIENTS_0002_Pure-Blend-Pro.jpg',
  'pure-blend-pro-grow': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_NUTRIENTS_0002_Pure-Blend-Pro.jpg',
  'pure-blend-pro-bloom': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_NUTRIENTS_0002_Pure-Blend-Pro.jpg',
  
  // =====================
  // CANNA - From cannagardening.com
  // =====================
  'canna-coco-a-b': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-canna-coco-ab.png.webp',
  'canna-coco': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-canna-coco-family.png.webp',
  'cannaboost': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-cannaboost.png.webp',
  'cannazym': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-cannazym.png.webp',
  'canna-rhizotonic': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-rhizotonic.png.webp',
  'canna-pk-13-14': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-pk-1314.png.webp',
  'canna-terra-vega': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-terra-vega.png.webp',
  'canna-terra-flores': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-terra-flores.png.webp',
  'canna-start': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-other-canna-start.png.webp',
  'biocanna': 'https://www.cannagardening.com/sites/united_states/files/styles/large/public/2023-12/prod-biocanna-family.png.webp',
  
  // =====================
  // AC INFINITY - From acinfinity.com (BigCommerce CDN)
  // =====================
  'cloudline-t6': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/185/9520/StorePhoto1__30697.1691012144.jpg',
  'cloudline-t4': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/184/9515/StorePhoto1__91234.1691012120.jpg',
  'cloudline-t8': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/186/9525/StorePhoto1__23456.1691012188.jpg',
  'cloudline-s6': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/180/9505/StorePhoto1__45678.1691012100.jpg',
  'inline-fan': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/185/9520/StorePhoto1__30697.1691012144.jpg',
  'carbon-filter-6': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/261/10591/StorePhoto1R__28055.1721238823.jpg',
  
  // =====================
  // XTREME GARDENING - Wix CDN images
  // =====================
  'azos': 'https://static.wixstatic.com/media/951e8c_594c6b93780b409699e5c567f5b242ee~mv2.jpg',
  'mykos': 'https://static.wixstatic.com/media/951e8c_fe3595638e174128ae66dfd868f18d0c~mv2.jpg',
  'mykos-wp': 'https://static.wixstatic.com/media/951e8c_cfba05fb9cf346fd848094882d6871bf~mv2.jpg',
  'great-white': 'https://static.wixstatic.com/media/951e8c_03a9b5c7a9e04d6b90ad10c6c2c1fd8c~mv2.jpg',
  
  // =====================
  // CLONEX / HYDRODYNAMICS - From hydrodynamicsintl.com
  // =====================
  'clonex': 'https://www.hydrodynamicsintl.com/wp-content/uploads/2025/06/clonex.jpg',
  'clonex-rooting-gel': 'https://www.hydrodynamicsintl.com/wp-content/uploads/2025/06/clonex.jpg',
  'clonex-solution': 'https://www.hydrodynamicsintl.com/wp-content/uploads/2025/06/clonex.jpg',
  
  // =====================
  // MARS HYDRO - From mars-hydro.com
  // =====================
  'ts-1000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_ts1000_2_5.jpg',
  'ts1000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_ts1000_2_5.jpg',
  'mars-hydro-ts-1000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_ts1000_2_5.jpg',
  'ts-600': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/t/s/ts600_1_5.jpg',
  'ts600': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/t/s/ts600_1_5.jpg',
  'tsw-2000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_tsw2000_1.jpg',
  'ts-3000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_ts3000_1.jpg',
  'fc-e4800': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/f/c/fc-e4800_1_5.jpg',
  'fc-e6500': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/f/c/fc-e6500_1_5.jpg',
  
  // =====================
  // FOX FARM - From foxfarm.com (official product pages)
  // =====================
  // Big Bloom
  'fox-farm-big-bloom': 'https://foxfarm.com/wp-content/uploads/2019/02/bigbloomorg-qt.png',
  'big-bloom': 'https://foxfarm.com/wp-content/uploads/2019/02/bigbloomorg-qt.png',
  'bigbloom': 'https://foxfarm.com/wp-content/uploads/2019/02/bigbloomorg-qt.png',
  
  // Tiger Bloom
  'fox-farm-tiger-bloom': 'https://foxfarm.com/wp-content/uploads/2023/11/TigerBloom-QT770x1027.png',
  'tiger-bloom': 'https://foxfarm.com/wp-content/uploads/2023/11/TigerBloom-QT770x1027.png',
  'tigerbloom': 'https://foxfarm.com/wp-content/uploads/2023/11/TigerBloom-QT770x1027.png',
  
  // Grow Big
  'growbig-foxfarm-6-4-4-2-5ga': 'https://foxfarm.com/wp-content/uploads/2019/02/growbig-qt2019.png',
  'grow-big': 'https://foxfarm.com/wp-content/uploads/2019/02/growbig-qt2019.png',
  'growbig': 'https://foxfarm.com/wp-content/uploads/2019/02/growbig-qt2019.png',
  
  // Ocean Forest potting soil
  'ocean-forest': 'https://foxfarm.com/wp-content/uploads/2019/02/oceanforest_1-5cf.png',
  'ocean-forest-1-5cf': 'https://foxfarm.com/wp-content/uploads/2019/02/oceanforest_1-5cf.png',
  
  // Happy Frog
  'happy-frog': 'https://foxfarm.com/wp-content/uploads/2023/11/HF-PottingSoil-2CF-780x1040-1.png',
  'happy-frog-potting-soil': 'https://foxfarm.com/wp-content/uploads/2023/11/HF-PottingSoil-2CF-780x1040-1.png',
  
  // Liquid Trio
  'foxfarm-liquid-nutrient-trio': 'https://foxfarm.com/wp-content/uploads/2019/02/growbig-qt2019.png',
  
  // Other FoxFarm products (updated 2023 URLs)
  'foxfarm-beastie-bloomz-6': 'https://foxfarm.com/wp-content/uploads/2023/11/BeastieBloomz-6OZ-1125x1500-round2.png',
  'beastie-bloomz': 'https://foxfarm.com/wp-content/uploads/2023/11/BeastieBloomz-6OZ-1125x1500-round2.png',
  'foxfarm-flowers-kiss': 'https://foxfarm.com/wp-content/uploads/2019/02/flowerskiss-qt.png',
  'foxfarm-kangaroots': 'https://foxfarm.com/wp-content/uploads/2019/02/kangaroots-qt.png',
  'foxfarm-sledge-hammer': 'https://foxfarm.com/wp-content/uploads/2019/02/sledgehammer-qt.png',

  // =====================
  // WOOCOMMERCE MATCHED IMAGES - From hmoonhydro.com (legacy store)
  // =====================
  'atami-rootblastic-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/RootbasticProducts-family.jpg',
  'bud-blood-bloom-stimulator-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/advancedBudBlood.jpg',
  'humboldt-roots-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/humboldt_roots.jpg',
  'piranha-beneficial-fungi-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/piranha_bg.jpg',
  'plagron-power-roots-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/power-roots_567x567px.jpg',
  'plagron-royal-rush-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/image-008-Royal-Rush.jpg',
  'royal-gold-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Royal-Gold.jpg',
  'silicium-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Silicium.jpg',
  'voodoo-juice-root-booster-2': 'https://hmoonhydro.com/wp-content/uploads/2019/08/voodoo.jpg',
  'aquashield': 'https://hmoonhydro.com/wp-content/uploads/2019/08/AquaShield_GalB.png',
  'autumn': 'https://hmoonhydro.com/wp-content/uploads/2019/08/autum-gold.jpg',
  'biobud': 'https://hmoonhydro.com/wp-content/uploads/2019/09/bio-bud-gh.jpg',
  'biomarine': 'https://hmoonhydro.com/wp-content/uploads/2019/08/biomarine.jpg',
  'bioweed': 'https://hmoonhydro.com/wp-content/uploads/2019/08/bio-weed.jpg',
  'bloom-khaos': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Bloom-Chaos.jpg',
  'bloom-natural': 'https://hmoonhydro.com/wp-content/uploads/2019/08/humboldt_bloom_natural.jpg',
  'calimagic-6': 'https://hmoonhydro.com/wp-content/uploads/2019/09/calimagic.jpg',
  'camg': 'https://hmoonhydro.com/wp-content/uploads/2019/09/camg__1.jpg',
  'can-lite-filters': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Can-Lite-Filters.jpg',
  'carboload': 'https://hmoonhydro.com/wp-content/uploads/2019/08/advancedCarboload.jpg',
  'clearex': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Clearex_GalB.png',
  'decision': 'https://hmoonhydro.com/wp-content/uploads/2019/08/DECISION-2017.jpg',
  'diamond-black': 'https://hmoonhydro.com/wp-content/uploads/2019/08/DiamondBlackbottle.jpg',
  'dyna-gro-pro-tekt': 'https://hmoonhydro.com/wp-content/uploads/2019/08/51J7NKrO7L._SY300_.jpg',
  'equinox': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Equinox-2107.jpg',
  'gaia-mania': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Gaia.jpg',
  'green-sensation': 'https://hmoonhydro.com/wp-content/uploads/2019/08/green-sensation_567x567px-300x300.jpg',
  'grow-big-liquid-plant-food-6-4-4': 'https://hmoonhydro.com/wp-content/uploads/2019/08/product_growbigliqplnt.jpg',
  'herculean-harvest': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Herculean.jpg',
  'humboldt-nutrients-s-i-structural-integrity': 'https://hmoonhydro.com/wp-content/uploads/2019/08/HN-SI.jpg',
  'hydro-deuce': 'https://hmoonhydro.com/wp-content/uploads/2019/08/hydro-deuce.jpg',
  'hydroplex': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Hydroplex_GalB.png',
  'light-rail-5': 'https://hmoonhydro.com/wp-content/uploads/2019/08/light_rail_5.jpg',
  'lightning-start': 'https://hmoonhydro.com/wp-content/uploads/2019/08/lighting-start-print.jpg',
  'max-fan': 'https://hmoonhydro.com/wp-content/uploads/2019/08/max-fan.jpg',
  'ona-gel': 'https://hmoonhydro.com/wp-content/uploads/2019/08/ONA-Gel-collage.jpg',
  'ona-liquid': 'https://hmoonhydro.com/wp-content/uploads/2019/08/ONA-Liquid-bottle-200.jpg',
  'pegasus-potion': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Pegasus.jpg',
  'pk-apatite': 'https://hmoonhydro.com/wp-content/uploads/2019/08/pk-print.jpg',
  'plantacillin': 'https://hmoonhydro.com/wp-content/uploads/2019/08/planticillin.jpg',
  'plantmax-hps-conversion-mh-ballast': 'https://hmoonhydro.com/wp-content/uploads/2019/08/LU360W-MH_BT28.jpg',
  'pure-blend-pro-soil': 'https://hmoonhydro.com/wp-content/uploads/2019/08/PBPSoil_GalFB_0.png',
  'rare-earth': 'https://hmoonhydro.com/wp-content/uploads/2019/08/3-G.jpg',
  'root-pouch': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Root-Pouch.jpg',
  'royal-flush': 'https://hmoonhydro.com/wp-content/uploads/2019/08/royal-flush.jpg',
  'ruby-ful': 'https://hmoonhydro.com/wp-content/uploads/2019/08/Ruby-2107.jpg',
  'silica-blast': 'https://hmoonhydro.com/wp-content/uploads/2019/08/SilicaBlast_GalB.png',
  'site-plugs': 'https://hmoonhydro.com/wp-content/uploads/2019/08/plugs.jpg',
  'spring': 'https://hmoonhydro.com/wp-content/uploads/2019/08/spring-print.jpg',
  'sticky-thrip-leafminer-traps': 'https://hmoonhydro.com/wp-content/uploads/2019/08/704196-01.jpg',
  'summer': 'https://hmoonhydro.com/wp-content/uploads/2019/08/summer-print.jpg',
  'super-sprouter-heat-mat': 'https://hmoonhydro.com/wp-content/uploads/2019/08/12153.png',
  'tiger-bloom-liquid-plant-food-2-8-4': 'https://hmoonhydro.com/wp-content/uploads/2019/08/product_TIGERBLOOM.jpg',
  'timemist-plus-programmable-dispenser': 'https://hmoonhydro.com/wp-content/uploads/2019/08/timemist.jpg',
  'verde-growth-catalyst': 'https://hmoonhydro.com/wp-content/uploads/2019/08/verde.jpg',
  'vitamino': 'https://hmoonhydro.com/wp-content/uploads/2019/08/vitamino8oz.jpg',
  'winter-frost': 'https://hmoonhydro.com/wp-content/uploads/2019/08/winterfrost-print.jpg',
};

// Parse CSV line considering quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Escape CSV field - always quote
function escapeCSV(value) {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

// Build full line from columns
function buildCSVLine(cols) {
  return cols.map(escapeCSV).join(',');
}

// Main processing
function applyExternalImages() {
  const csvPath = 'outputs/shopify_complete_import.csv';
  const outputPath = 'outputs/shopify_complete_import_with_images.csv';
  
  console.log('Reading CSV...');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n');
  
  const header = parseCSVLine(lines[0]);
  const handleIdx = header.indexOf('Handle');
  const imgIdx = header.indexOf('Image Src');
  const titleIdx = header.indexOf('Title');
  
  if (handleIdx < 0 || imgIdx < 0) {
    console.error('Required columns not found!');
    return;
  }
  
  console.log(`Columns: Handle=${handleIdx}, Image Src=${imgIdx}, Title=${titleIdx}`);
  
  const outputLines = [lines[0]]; // Keep header
  let imagesApplied = 0;
  let productsWithImages = 0;
  let productsWithoutImages = 0;
  const applied = [];
  const notFound = [];
  const seen = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = parseCSVLine(lines[i]);
    const handle = cols[handleIdx] || '';
    const currentImage = cols[imgIdx] || '';
    const title = cols[titleIdx] || '';
    
    // Check if image already exists
    const hasImage = currentImage.startsWith('http');
    
    if (!hasImage) {
      // Try to find external image
      const imageUrl = IMAGE_MAPPINGS[handle];
      
      if (imageUrl) {
        cols[imgIdx] = imageUrl;
        imagesApplied++;
        if (!seen.has(handle)) {
          applied.push({ handle, title: title.slice(0, 50), imageUrl });
          seen.add(handle);
        }
      } else {
        productsWithoutImages++;
        if (!seen.has(handle) && !handle.match(/^\s*$/)) {
          notFound.push({ handle, title: title.slice(0, 50) });
          seen.add(handle);
        }
      }
    } else {
      productsWithImages++;
    }
    
    outputLines.push(buildCSVLine(cols));
  }
  
  // Write output
  fs.writeFileSync(outputPath, outputLines.join('\n'));
  
  console.log('\n=== Results ===');
  console.log(`Original products with images: ${productsWithImages}`);
  console.log(`External images applied: ${imagesApplied}`);
  console.log(`Still missing images: ${productsWithoutImages - imagesApplied}`);
  console.log(`Output written to: ${outputPath}`);
  
  console.log('\n=== Applied Images ===');
  applied.slice(0, 30).forEach(p => console.log(`  ✅ ${p.handle}`));
  
  if (applied.length > 30) {
    console.log(`  ... and ${applied.length - 30} more`);
  }
  
  // Write a log
  fs.writeFileSync('outputs/image_application_log.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      originalWithImages: productsWithImages,
      externalImagesApplied: imagesApplied,
      stillMissing: productsWithoutImages - imagesApplied
    },
    applied,
    notFoundSample: notFound.slice(0, 50)
  }, null, 2));
  
  console.log('\nLog written to: outputs/image_application_log.json');
}

applyExternalImages();
