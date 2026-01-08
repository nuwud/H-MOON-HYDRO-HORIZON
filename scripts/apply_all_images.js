/**
 * Apply ALL External Images - Combines manufacturer mappings and WooCommerce matches
 */

const fs = require('fs');
const path = require('path');

// Load WooCommerce fuzzy matches
const wooFuzzyPath = path.join(__dirname, '../outputs/woo_fuzzy_matches.json');
const wooSlugPath = path.join(__dirname, '../outputs/woo_slug_matches.json');
const wooLocalPath = path.join(__dirname, '../outputs/woo_local_matches.json');

let wooFuzzyMappings = {};
let wooSlugMappings = {};
let wooLocalMappings = {};

try {
  wooFuzzyMappings = JSON.parse(fs.readFileSync(wooFuzzyPath, 'utf-8'));
  console.log(`Loaded ${Object.keys(wooFuzzyMappings).length} fuzzy matches`);
} catch (e) {
  console.log('No fuzzy matches file found');
}

try {
  wooSlugMappings = JSON.parse(fs.readFileSync(wooSlugPath, 'utf-8'));
  console.log(`Loaded ${Object.keys(wooSlugMappings).length} slug matches`);
} catch (e) {
  console.log('No slug matches file found');
}

try {
  wooLocalMappings = JSON.parse(fs.readFileSync(wooLocalPath, 'utf-8'));
  console.log(`Loaded ${Object.keys(wooLocalMappings).length} local file matches`);
} catch (e) {
  console.log('No local matches file found');
}

// Original IMAGE_MAPPINGS from manufacturer websites
const IMAGE_MAPPINGS = {
  // Advanced Nutrients
  'b-52': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'b-52-4l': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-B-52-1L.png',
  'big-bud': 'https://www.advancednutrients.com/wp-content/uploads/2022/06/Big-Bud-Liquid-1L-Advanced-Nutrients.png',
  'bud-ignitor': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Ignitor-1L.png',
  'bud-blood': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Blood-1L.png',
  'piranha': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Piranha-Liquid-1L.png',
  'revive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Revive-1L.png',
  'voodoo-juice': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Voodoo-Juice-1L.png',
  'overdrive': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Overdrive-1L.png',
  'tarantula': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Tarantula-Liquid-1L.png',
  'sensizym': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Sensizym-1L.png',
  'rhino-skin': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Rhino-Skin-1L.png',
  'nirvana': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Nirvana-1L.png',
  'flawless-finish': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Flawless-Finish-1L.png',
  'connoisseur': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Connoisseur-Coco-Grow-Bloom-1L-251x300.png',
  'sensi-grow': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  'sensi-bloom': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-pH-Perfect-Sensi-Grow-Bloom-1L-251x300.png',
  'bud-candy': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Bud-Candy-1L.jpg',
  'bud-factor-x': 'https://www.advancednutrients.com/wp-content/uploads/2022/06/Advanced-Nutrients-Bud-Factor-X-1L.jpg',
  'jungle-juice': 'https://www.advancednutrients.com/wp-content/uploads/2022/07/Advanced-Nutrients-Jungle-Juice-1L.png',

  // General Hydroponics
  'armor-si': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_AmorSi-new-quart-1600x1600.png',
  'floragro': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraGro-new-pint-1-1600x1600.png',
  'floramicro': 'https://generalhydroponics.com/wp-content/uploads/GH-product-image-floramicro-update-1600x1600.png',
  'florabloom': 'https://generalhydroponics.com/wp-content/uploads/GH-product-image-florabloom-update-1600x1600.png',
  'calimagic': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_CALiMAGic-new-quart-1600x1600.png',
  'rapidstart': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_RapidStart-new-125ml-1600x1600.png',
  'liquid-koolbloom': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_LiquidKoolBloom-new-quart-1600x1600.png',
  'koolbloom': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_LiquidKoolBloom-new-quart-1600x1600.png',
  'florablend': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraBlend-new-quart-1600x1600.png',
  'florakleen': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_FloraKleen-new-quart-1600x1600.png',
  'floralicious-plus': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_Floralicious_Plus-new-quart-1600x1600.png',
  'ph-up': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_pHUp-new-quart-1600x1600.png',
  'ph-down': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_pHDown-new-quart-1600x1600.png',
  'diamond-nectar': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_DiamondNectar-new-quart-1600x1600.png',
  'bioroot': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_BioRoot-new-quart-1600x1600.png',

  // Botanicare
  'liquid-karma': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_SUPPLEMENTS_0015_Liquid-Karma.jpg',
  'hydroguard': 'https://www.botanicare.com/wp-content/uploads/2020/10/Hydroguard_Bags1.png',
  'cal-mag-plus': 'https://www.botanicare.com/wp-content/uploads/BC__0001_SUPPLEMENTS.png',
  'pure-blend-pro': 'https://www.botanicare.com/wp-content/uploads/2020/09/BC_NUTRIENTS_0002_Pure-Blend-Pro.jpg',

  // CANNA
  'canna-coco-a-b': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-canna-coco-ab.png.webp',
  'canna-coco': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-canna-coco-family.png.webp',
  'cannaboost': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-cannaboost.png.webp',
  'cannazym': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-cannazym.png.webp',
  'canna-rhizotonic': 'https://www.cannagardening.com/sites/united_states/files/styles/product_banner_detail_640x640_/public/2023-12/prod-additives-rhizotonic.png.webp',

  // AC Infinity
  'cloudline-t6': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/185/9520/StorePhoto1__30697.1691012144.jpg',
  'cloudline-t4': 'https://cdn11.bigcommerce.com/s-238e9/images/stencil/600x1000/products/184/9515/StorePhoto1__91234.1691012120.jpg',

  // Xtreme Gardening
  'azos': 'https://static.wixstatic.com/media/951e8c_594c6b93780b409699e5c567f5b242ee~mv2.jpg',
  'mykos': 'https://static.wixstatic.com/media/951e8c_fe3595638e174128ae66dfd868f18d0c~mv2.jpg',
  'great-white': 'https://static.wixstatic.com/media/951e8c_03a9b5c7a9e04d6b90ad10c6c2c1fd8c~mv2.jpg',

  // Clonex
  'clonex': 'https://www.hydrodynamicsintl.com/wp-content/uploads/2025/06/clonex.jpg',
  'clonex-rooting-gel': 'https://www.hydrodynamicsintl.com/wp-content/uploads/2025/06/clonex.jpg',

  // Mars Hydro
  'ts-1000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_ts1000_2_5.jpg',
  'ts-600': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/t/s/ts600_1_5.jpg',
  'tsw-2000': 'https://www.mars-hydro.com/media/catalog/product/cache/707491cb15beee590eb40fd1503b42bf/m/a/mars_hydro_tsw2000_1.jpg',

  // Fox Farm
  'fox-farm-big-bloom': 'https://foxfarm.com/wp-content/uploads/2019/02/bigbloomorg-qt.png',
  'big-bloom': 'https://foxfarm.com/wp-content/uploads/2019/02/bigbloomorg-qt.png',
  'fox-farm-tiger-bloom': 'https://foxfarm.com/wp-content/uploads/2023/11/TigerBloom-QT770x1027.png',
  'tiger-bloom': 'https://foxfarm.com/wp-content/uploads/2023/11/TigerBloom-QT770x1027.png',
  'grow-big': 'https://foxfarm.com/wp-content/uploads/2019/02/growbig-qt2019.png',
  'ocean-forest': 'https://foxfarm.com/wp-content/uploads/2019/02/oceanforest_1-5cf.png',
  'happy-frog': 'https://foxfarm.com/wp-content/uploads/2023/11/HF-PottingSoil-2CF-780x1040-1.png',
};

// Merge all mappings (manufacturer > slug > fuzzy > local in priority)
const ALL_MAPPINGS = {
  ...wooLocalMappings, // Lowest priority (local file matches can be hit/miss)
  ...wooFuzzyMappings,  
  ...wooSlugMappings,   
  ...IMAGE_MAPPINGS     // Highest priority (manufacturer)
};

console.log(`\nTotal combined mappings: ${Object.keys(ALL_MAPPINGS).length}`);

// Parse CSV
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else { current += char; }
  }
  result.push(current);
  return result;
}

function escapeCSV(value) {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

function buildCSVLine(cols) {
  return cols.map(escapeCSV).join(',');
}

// Apply images
const csvPath = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const outputPath = path.join(__dirname, '../outputs/shopify_complete_import_final.csv');

console.log('\nReading CSV...');
const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.split('\n');

const header = parseCSVLine(lines[0]);
const handleIdx = header.indexOf('Handle');
const imgIdx = header.indexOf('Image Src');
const titleIdx = header.indexOf('Title');

const outputLines = [lines[0]];
let imagesApplied = 0;
let productsWithImages = 0;
let productsWithoutImages = 0;
const applied = [];
const seen = new Set();

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  
  const cols = parseCSVLine(lines[i]);
  const handle = cols[handleIdx] || '';
  const currentImage = cols[imgIdx] || '';
  const title = cols[titleIdx] || '';
  
  const hasImage = currentImage.startsWith('http');
  
  if (!hasImage) {
    // Try normalized handle first
    const normHandle = handle.replace(/-\d+$/, '');
    const imageUrl = ALL_MAPPINGS[handle] || ALL_MAPPINGS[normHandle];
    
    if (imageUrl) {
      cols[imgIdx] = imageUrl;
      imagesApplied++;
      if (!seen.has(handle)) {
        applied.push({ handle, title: title.slice(0, 50) });
        seen.add(handle);
      }
    } else {
      productsWithoutImages++;
    }
  } else {
    productsWithImages++;
  }
  
  outputLines.push(buildCSVLine(cols));
}

fs.writeFileSync(outputPath, outputLines.join('\n'));

console.log('\n=== Results ===');
console.log(`Original products with images: ${productsWithImages}`);
console.log(`External images applied: ${imagesApplied}`);
console.log(`Still missing images: ${productsWithoutImages}`);
console.log(`Total with images now: ${productsWithImages + imagesApplied}`);

// Also copy to the main file
fs.copyFileSync(outputPath, csvPath);
console.log(`\nCopied to main import file: ${csvPath}`);

// Count unique products
let uniqueWithImg = 0, uniqueWithoutImg = 0;
const seenForCount = new Set();
for (let i = 1; i < outputLines.length; i++) {
  const cols = parseCSVLine(outputLines[i]);
  const handle = cols[handleIdx];
  if (seenForCount.has(handle)) continue;
  seenForCount.add(handle);
  if ((cols[imgIdx] || '').startsWith('http')) uniqueWithImg++;
  else uniqueWithoutImg++;
}

console.log(`\n=== Unique Product Coverage ===`);
console.log(`Unique products: ${seenForCount.size}`);
console.log(`With images: ${uniqueWithImg} (${(uniqueWithImg / seenForCount.size * 100).toFixed(1)}%)`);
console.log(`Without images: ${uniqueWithoutImg} (${(uniqueWithoutImg / seenForCount.size * 100).toFixed(1)}%)`);
