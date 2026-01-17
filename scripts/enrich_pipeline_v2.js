/**
 * Full Product Enrichment Pipeline v2
 * - Properly parses multi-line CSV fields
 * - Removes corrupted rows
 * - Enriches descriptions, categories, images from WooCommerce + templates
 */

const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(__dirname, '../CSVs/products_export_1_enriched_seo.csv');
const OUTPUT_CSV = path.join(__dirname, '../CSVs/products_export_final.csv');
const WOO_IMAGE_MAP = path.join(__dirname, '../CSVs/woo_image_map.json');

// Category detection patterns - expanded for better coverage
const CATEGORY_RULES = [
  // Nutrients & Fertilizers (highest priority) - VERY expanded
  { pattern: /nutrient|flora.*(?:gro|bloom|micro)|ph\s*perfect|cal-?mag|fertilizer|npk|sensi|voodoo|piranha|bud\s*candy|big\s*bud|overdrive|b-?52|rhino|carbo|nirvana|grow\s*big|tiger\s*bloom|cha\s*ching|humboldt|emerald|athena|canna|botanicare|foxfarm|fox\s*farm|general\s*hydroponics|advanced\s*nutrients|house.*garden|grease|root\s*excel|ancient\s*earth|tarantula|bud\s*factor|final\s*phase|flawless\s*finish|bud\s*ignitor|rhino\s*skin|sensizym|jungle\s*juice|iguana|gorilla|mother.*earth.*tea|winter\s*frost|tritan|kelp|humic|fulvic|silica|molasses|compost\s*tea|bat\s*guano|worm\s*casting|seaweed|amino|vitamin|spray\s*n\s*grow|suck\s*it\s*up|silicium|spring\s*(?:gallon|quart|2\.5)|summer\s*(?:gallon|quart|2\.5)|drought|production\s*powder|ton\s*o\s*bud|hammer|yield\s*up|xtreme\s*tea|verde|catalyst|terpinator|connoisseur/i, 
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients' },
  
  // Generators & Engines  
  { pattern: /generator|gen-?\d|engine|propane\s*burner|natural\s*gas|elp/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > CO2 Equipment' },
  
  // Grow Lights - expanded with more patterns
  { pattern: /\b(?:led|hps|mh|cmh|de|se)\b.*(?:light|watt|fixture)|grow\s*light|quantum\s*board|spider\s*farmer|mars\s*hydro|gavita|fluence|hlg|lumatek|spectrum|diode|sun\s*system|ultra.*grow|hortilux|ipower|vipar|kind\s*led|photon|ppf|par\s*meter|badboy|t-?5|t5\s*(?:lamp|fixture|light)|fluorescent|solarmax|sunblaster|lumen|conversion|metal\s*halide|mht|cf\s*\d+k|\d+\s*watt|\d+w\b/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Grow Lights' },
  
  // Ballasts & Drivers
  { pattern: /ballast|driver|dimmable.*driver|electronic\s*ballast|digital\s*ballast|magnetic\s*ballast/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Grow Light Accessories > Grow Light Ballasts & Transformers' },
  
  // Reflectors & Hoods
  { pattern: /reflector|hood|wing|parabolic|air\s*cooled|cool\s*tube|shade|socket\s*set/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Grow Light Accessories > Grow Light Reflectors & Hoods' },
  
  // Light Bulbs
  { pattern: /\b(?:hps|mh|cmh)\s*(?:bulb|lamp)|replacement\s*(?:bulb|lamp)|eye\s*hortilux|ultra\s*sun|grow\s*bulb|1000\s*watt.*bulb|600\s*watt.*bulb|400\s*watt.*bulb/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Grow Light Accessories > Grow Light Bulbs' },
  
  // Growing Media
  { pattern: /rockwool|coco\s*(?:coir)?|hydroton|clay\s*pebble|perlite|vermiculite|grodan|grow.*media|mother\s*earth|roots\s*organic|slab|cube|stonewool|growstone|leca|expanded\s*clay|soil.*mix|potting\s*mix|super\s*soil|bio.*blend|substrate/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media' },
  
  // Ventilation - Fans
  { pattern: /inline\s*fan|exhaust\s*fan|blower|cfm|ac\s*infinity|cloudline|can-?fan|vortex|hurricane|oscillating\s*fan|clip\s*fan|wall\s*fan|floor\s*fan|ducting|duct\s*fan/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Ventilation' },
  
  // Odor Control & Air Treatment
  { pattern: /carbon\s*filter|phresh|odor|smell|charcoal\s*filter|activated\s*carbon|can\s*filter|scrubber|ozone|ionizer|air\s*purifier|timemist|purge|fragrance|deodorizer/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Odor Control' },
  
  // pH & EC Meters
  { pattern: /\bph\b.*(?:meter|pen|tester|kit)|ec\s*(?:meter|pen)|tds|bluelab|apera|hanna|truncheon|guardian|calibration\s*solution|buffer\s*solution|ph\s*(?:up|down|adjuster)/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic pH & EC Meters' },
  
  // Hydroponic Systems
  { pattern: /dwc|deep\s*water\s*culture|ebb.*flow|nft|aeroponic|autopot|hydro.*system|waterfarm|power.*grower|current\s*culture|under\s*current|flood.*drain|recirculating/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems' },
  
  // Plant Containers & Buckets
  { pattern: /smart\s*pot|fabric\s*pot|air\s*pot|geo\s*pot|nursery\s*pot|\bgal\b.*pot|\bgal\b.*container|root\s*pouch|grow\s*bag|planter|saucer|tray|liner|bucket|gallon\s*(?:black|white)?\s*bucket|\d+\s*gallon\s*(?:black|white)?/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Plant Containers' },
  
  // Propagation & Cloning
  { pattern: /clone|cutting|rooting|propagat|seedling|dome|heat\s*mat|clonex|root.*hormone|ez\s*clone|turbo.*klone|humidity\s*dome|starter|plug|rapid\s*rooter/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Propagation' },
  
  // Pumps & Water
  { pattern: /pump|reservoir|gph|chiller|tnc|submersible|air\s*stone|aquarium|water\s*pump|air\s*pump|pond\s*pump/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Irrigation Supplies' },
  
  // Fittings & Connectors
  { pattern: /fitting|connector|splitter|union|barb|elbow|tee|coupling|adapter|reducer|valve|manifold|tubing|hose|pipe|dovetail|foot\s*base|snapture/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Irrigation Supplies' },
  
  // Pest Control
  { pattern: /pest|insect|spider\s*mite|fungus\s*gnat|neem|pyrethrin|azamax|sns|lost\s*coast|flying\s*skull|mighty\s*wash|safer\s*brand|sticky\s*trap|bug|aphid|thrip|mildew|fungicide|insecticide|zero\s*tolerance/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Pest Control' },
  
  // Controllers & Timers
  { pattern: /controller|timer|thermostat|humidistat|trolmaster|inkbird|autopilot|cycle\s*timer|relay|contactor|timestat|digital\s*timer|analog\s*timer|light\s*controller|programmable|dispenser/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Environmental Control' },
  
  // Grow Tents
  { pattern: /grow\s*tent|gorilla|mylar|secret\s*jardin|vivosun|mars.*tent|spider.*tent|tent\s*kit|indoor\s*grow|\buno\b.*tent|\bx\b.*tent/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Grow Tents & Rooms' },
  
  // Harvesting & Trimming
  { pattern: /trim|harvest|scissor|pruner|trimpro|trimbox|tumble|trimmer|bud\s*trimmer|hand\s*trim|loupe|microscope|scale|weigh|storage|cure|drying|hang|trolley|replacement\s*(?:bag|kit|grate|wheel)|spin\s*pro|wire\s*replacement/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Harvesting Equipment' },
  
  // Odor Control & Air Treatment
  { pattern: /ozone|ionizer|air\s*purifier|timemist|purge|fragrance|deodorizer/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Odor Control' },
  
  // CO2 Equipment
  { pattern: /co2|carbon\s*dioxide|regulator|ppm\s*controller|exhale|boost\s*buddy/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > CO2 Equipment' },
  
  // Environmental Monitors
  { pattern: /monitor|sensor|hygrometer|thermometer|temp.*humidity|data\s*logger|wireless\s*sensor/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Environmental Monitors' },
  
  // Water Filtration  
  { pattern: /water\s*filter|ro\s*system|reverse\s*osmosis|sediment|membrane\s*filter|stealth\s*ro|tall\s*boy|small\s*boy|dechlorinator/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Water Filtration' },
  
  // Books & Education
  { pattern: /book|guide|manual|handbook|teaming|gardening\s*indoors|cannabis|marijuana|cultivation/i,
    category: 'Media > Books > Nonfiction > Gardening & Horticulture' },
  
  // Seeds
  { pattern: /seed|feminised|feminized|autoflower|photo.*period|genetics/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Seeds' },
  
  // Water Filtration (duplicate - keep for backwards compat)
  { pattern: /water\s*filter|ro\s*system|reverse\s*osmosis|sediment\s*filter|carbon\s*filter.*water|dechlorinator/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Water Filtration' },
  
  // Generic Hydroponics Fallback - catch any remaining products with hydro-related terms
  { pattern: /hydro|grow|garden|plant|crop|indoor|greenhouse|nutrient|feed|spray|solution|powder|liquid|concentrate|drip|reservoir|gallon|quart|liter|ml\b/i,
    category: 'Home & Garden > Lawn & Garden > Gardening > Hydroponics' }
];

// Description templates
function generateDescription(title, vendor) {
  const text = (title + ' ' + vendor).toLowerCase();
  
  if (/nutrient|flora|bloom|sensi|fertilizer/i.test(text)) {
    return '<p>' + title + ' is a professional-grade plant nutrient for hydroponic and soil growing. ' + (vendor ? 'Made by ' + vendor + ', this' : 'This') + ' formula delivers essential elements for optimal plant growth. Compatible with all growing media.</p>';
  }
  if (/light|led|hps|quantum|watt/i.test(text)) {
    return '<p>' + title + ' is a high-performance grow light for indoor cultivation. ' + (vendor ? 'From ' + vendor + ', this fixture' : 'This fixture') + ' provides optimal spectrum for vegetative growth and flowering. Energy efficient with reliable performance.</p>';
  }
  if (/fan|ventilation|cfm|exhaust/i.test(text)) {
    return '<p>' + title + ' provides essential air circulation for indoor growing. ' + (vendor ? 'From ' + vendor + ', this' : 'This') + ' ventilation solution maintains optimal temperature and humidity. Quiet operation and durable construction.</p>';
  }
  if (/meter|ph|ec|tds/i.test(text)) {
    return '<p>' + title + ' delivers accurate environmental measurements. ' + (vendor ? 'Made by ' + vendor + ', this' : 'This') + ' precision instrument helps maintain optimal growing conditions with reliable readings.</p>';
  }
  if (/rockwool|coco|media|perlite/i.test(text)) {
    return '<p>' + title + ' is a premium growing medium for hydroponic and container growing. ' + (vendor ? 'From ' + vendor + ', this' : 'This') + ' substrate provides excellent water retention and aeration for healthy roots.</p>';
  }
  if (/pot|container|fabric/i.test(text)) {
    return '<p>' + title + ' provides the ideal environment for plant roots. ' + (vendor ? 'From ' + vendor + ', this' : 'This') + ' container features proper drainage and aeration for healthy plant development.</p>';
  }
  return '<p>' + title + ' is a quality product for indoor gardening. ' + (vendor ? 'From ' + vendor + ', designed' : 'Designed') + ' for reliable performance and professional results.</p>';
}

// Corruption detection
function isCorruptedRow(fields, handle) {
  if (!handle) return true;
  if (handle.startsWith('<')) return true;
  if (handle.includes('class=')) return true;
  if (handle.includes('ty-tabs')) return true;
  if (handle.length > 100) return true;
  if (/^[A-Z][a-z].*\s(is|are|the|this|for|with|and)\s/i.test(handle)) return true;
  if (handle.includes('SOLD STRICTLY')) return true;
  return false;
}

// Proper CSV parser
function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(field);
        if (row.length > 1) rows.push(row);
        row = [];
        field = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        field += char;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.length > 1) rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Load WooCommerce image mappings
function loadWooImages() {
  const map = {};
  try {
    const data = JSON.parse(fs.readFileSync(WOO_IMAGE_MAP, 'utf8'));
    for (const item of data) {
      if (item.handle && item.imageUrl) {
        map[item.handle] = item.imageUrl;
        map[item.handle.toLowerCase()] = item.imageUrl;
      }
    }
    console.log('Loaded ' + Object.keys(map).length + ' WooCommerce images');
  } catch (e) {
    console.log('Could not load image map');
  }
  return map;
}

// Main
console.log('Full Product Enrichment Pipeline v2\n');

const content = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(content);
const header = rows[0];
const data = rows.slice(1);

console.log('Input: ' + data.length + ' rows');

// Find column indices
const COL = {};
header.forEach((h, i) => {
  const name = h.trim().toLowerCase().replace(/\s+/g, '_');
  COL[name] = i;
});

const handleCol = COL['handle'];
const titleCol = COL['title'];
const bodyCol = COL['body_(html)'] !== undefined ? COL['body_(html)'] : COL['body'];
const vendorCol = COL['vendor'];
const catCol = COL['product_category'] !== undefined ? COL['product_category'] : COL['category'];
const imgCol = COL['image_src'];

console.log('Columns: Handle=' + handleCol + ', Title=' + titleCol + ', Body=' + bodyCol + ', Vendor=' + vendorCol + ', Category=' + catCol + ', Image=' + imgCol);
console.log('Total columns in header: ' + header.length);

// Load WooCommerce images
const wooImages = loadWooImages();

// Process rows
let stats = { removed: 0, descAdded: 0, catAdded: 0, imgAdded: 0 };
const cleanedData = [];

for (const row of data) {
  const handle = row[handleCol] ? row[handleCol].trim() : '';
  
  // Check for corruption
  if (isCorruptedRow(row, handle)) {
    stats.removed++;
    continue;
  }
  
  const title = row[titleCol] ? row[titleCol].trim() : '';
  const vendor = row[vendorCol] ? row[vendorCol].trim() : '';
  const searchText = title + ' ' + vendor;
  
  // Skip variant rows (no title)
  if (!title) {
    cleanedData.push(row);
    continue;
  }
  
  // Enrich Category
  const currentCat = row[catCol] || '';
  if (currentCat.length < 10) {
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(searchText)) {
        row[catCol] = rule.category;
        stats.catAdded++;
        break;
      }
    }
  }
  
  // Enrich Description
  const currentBody = row[bodyCol] || '';
  if (currentBody.length < 50) {
    row[bodyCol] = generateDescription(title, vendor);
    stats.descAdded++;
  }
  
  // Enrich Image
  const currentImg = row[imgCol] || '';
  if (currentImg.length < 10) {
    const wooImage = wooImages[handle] || wooImages[handle.toLowerCase()];
    if (wooImage) {
      row[imgCol] = wooImage;
      stats.imgAdded++;
    }
  }
  
  cleanedData.push(row);
}

// Write output
const output = [
  header.map(h => escapeCSV(h)).join(','),
  ...cleanedData.map(row => row.map(c => escapeCSV(c)).join(','))
].join('\n');

fs.writeFileSync(OUTPUT_CSV, output);

// Final audit
let totalProducts = 0, withImg = 0, withDesc = 0, withCat = 0;
for (const row of cleanedData) {
  const t = row[titleCol] ? row[titleCol].trim() : '';
  if (!t) continue; // Skip variants
  totalProducts++;
  const img = row[imgCol] || '';
  const body = row[bodyCol] || '';
  const cat = row[catCol] || '';
  if (img.length > 10) withImg++;
  if (body.length > 50) withDesc++;
  if (cat.length > 10) withCat++;
}

console.log('\nEnrichment Complete!');
console.log('Output: ' + OUTPUT_CSV + '\n');
console.log('Results:');
console.log('   Rows removed: ' + stats.removed);
console.log('   Final rows: ' + cleanedData.length);
console.log('   Unique products: ' + totalProducts);
console.log('\nCoverage:');
console.log('   With images: ' + withImg + '/' + totalProducts + ' (' + (withImg/totalProducts*100).toFixed(1) + '%)');
console.log('   With descriptions: ' + withDesc + '/' + totalProducts + ' (' + (withDesc/totalProducts*100).toFixed(1) + '%)');
console.log('   With categories: ' + withCat + '/' + totalProducts + ' (' + (withCat/totalProducts*100).toFixed(1) + '%)');
console.log('\nEnrichment Added:');
console.log('   +' + stats.descAdded + ' descriptions');
console.log('   +' + stats.catAdded + ' categories');
console.log('   +' + stats.imgAdded + ' images from WooCommerce');
