/**
 * Auto-Enrich Products Script
 * Attempts to fill in missing descriptions, categories, and images
 * without manual intervention
 */

const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(__dirname, '../CSVs/products_export_1_cleaned.csv');
const OUTPUT_CSV = path.join(__dirname, '../CSVs/products_export_1_auto_enriched.csv');
const WOO_LOOKUP = path.join(__dirname, '../CSVs/woo_products_lookup.json');
const WOO_IMAGE_MAP = path.join(__dirname, '../CSVs/woo_image_map.json');

// Category patterns for auto-detection
const CATEGORY_PATTERNS = {
  'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients': [
    /nutrient/i, /flora.*(?:gro|bloom|micro)/i, /ph\s*perfect/i, /cal-?mag/i,
    /bloom\s*(?:boost|enhancer)/i, /big\s*bud/i, /bud\s*candy/i, /carbo/i,
    /sensi/i, /overdrive/i, /voodoo/i, /piranha/i, /nirvana/i, /b-?52/i,
    /grow\s*(?:big|more)/i, /tiger\s*bloom/i, /cha\s*ching/i, /flora.*series/i,
    /general\s*hydroponics/i, /advanced\s*nutrients/i, /fox\s*farm/i,
    /botanicare/i, /humboldt/i, /emerald\s*harvest/i, /athena/i,
    /grease/i, /npk/i, /fertilizer/i, /silica/i, /kelp/i, /humic/i, /fulvic/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Grow Lights': [
    /\b(?:led|hps|mh|cmh|hid)\b/i, /grow\s*light/i, /quantum\s*board/i,
    /spider\s*farmer/i, /mars\s*hydro/i, /gavita/i, /fluence/i, /hlg/i,
    /watt(?:age)?/i, /lumen/i, /ppf/i, /lumatek/i, /spectrum/i,
    /sunblaster/i, /hortilux/i, /eye\s*hortilux/i, /diode/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Grow Light Accessories > Grow Light Reflectors & Hoods': [
    /reflector/i, /hood/i, /wing/i, /parabolic/i, /air-?cooled/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Grow Light Accessories > Grow Light Ballasts & Transformers': [
    /ballast/i, /transformer/i, /driver/i, /dimmable/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media': [
    /rockwool/i, /coco\s*(?:coir)?/i, /hydroton/i, /clay\s*pebbles?/i,
    /perlite/i, /vermiculite/i, /growstone/i, /grodan/i, /slab/i, /cube/i,
    /grow\s*(?:media|medium)/i, /mother\s*earth/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Ventilation': [
    /inline\s*fan/i, /exhaust/i, /carbon\s*filter/i, /ventilation/i,
    /cfm/i, /ac\s*infinity/i, /cloudline/i, /can-?(?:fan|filter)/i,
    /phresh/i, /duct/i, /blower/i, /oscillating/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic pH & EC Meters': [
    /\bph\b.*(?:meter|pen|tester)/i, /\bec\b.*(?:meter|pen)/i, /tds/i, /ppm/i,
    /bluelab/i, /apera/i, /hanna/i, /milwaukee/i, /truncheon/i, /guardian/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems': [
    /dwc/i, /deep\s*water\s*culture/i, /ebb.*flow/i, /nft/i, /aeroponic/i,
    /flood.*drain/i, /drip\s*system/i, /autopot/i, /hydro.*system/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Plant Containers': [
    /\bgal(?:lon)?\b.*(?:pot|container)/i, /smart\s*pot/i, /fabric\s*pot/i,
    /air\s*pot/i, /nursery\s*pot/i, /root\s*pouch/i, /geo\s*pot/i, /planter/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Propagation': [
    /clone/i, /cutting/i, /rooting/i, /propagat/i, /seedling/i, /dome/i,
    /heat\s*mat/i, /humidity\s*dome/i, /clonex/i, /root.*hormone/i, /ez\s*clone/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Irrigation Supplies': [
    /pump/i, /reservoir/i, /irrigation/i, /drip/i, /emitter/i, /tubing/i,
    /fitting/i, /barb/i, /float\s*valve/i, /submersible/i, /air\s*pump/i, /air\s*stone/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Pest Control': [
    /pest/i, /insect/i, /spider\s*mite/i, /fungus\s*gnat/i, /aphid/i,
    /neem/i, /pyrethrin/i, /sns/i, /lost\s*coast/i, /flying\s*skull/i,
    /azamax/i, /mighty\s*wash/i, /safer/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Environmental Control': [
    /controller/i, /timer/i, /thermostat/i, /humidistat/i, /monitor/i,
    /trolmaster/i, /inkbird/i, /autopilot/i, /co2/i, /dehumidifier/i,
    /humidifier/i, /heater/i, /sensor/i
  ],
  'Home & Garden > Lawn & Garden > Gardening > Grow Tents & Rooms': [
    /grow\s*tent/i, /gorilla/i, /mylar/i, /grow\s*room/i, /secret\s*jardin/i
  ]
};

// Description templates by category
const DESC_TEMPLATES = {
  nutrients: (p) => `<p>${p.title} is a professional-grade plant nutrient designed for hydroponic and soil growing systems. ${p.vendor ? `Made by ${p.vendor}, this formula` : 'This formula'} delivers essential elements for optimal plant growth and development. Suitable for use throughout the growing cycle, it helps maximize yields while maintaining plant health. Compatible with all growing media including hydroponics, coco coir, and soil.</p>`,
  
  lights: (p) => `<p>${p.title} is a high-performance grow light engineered for indoor cultivation. ${p.vendor ? `Manufactured by ${p.vendor}, this fixture` : 'This fixture'} provides the optimal light spectrum for both vegetative growth and flowering stages. Designed for efficiency and durability, it delivers professional results for growers of all experience levels. Features include full-spectrum output, energy efficiency, and reliable performance.</p>`,
  
  fans: (p) => `<p>${p.title} provides essential ventilation for indoor growing environments. ${p.vendor ? `From ${p.vendor}, this` : 'This'} ventilation solution helps maintain optimal temperature and humidity levels while ensuring fresh air circulation. Designed for quiet operation and long-lasting performance, it's an essential component for any serious grow room setup.</p>`,
  
  meters: (p) => `<p>${p.title} delivers accurate measurements for monitoring your growing environment. ${p.vendor ? `Made by ${p.vendor}, this precision instrument` : 'This precision instrument'} helps you maintain optimal growing conditions by providing reliable readings. Essential for serious growers who understand the importance of proper nutrient and environmental management.</p>`,
  
  media: (p) => `<p>${p.title} is a premium growing medium designed for hydroponic and container growing. ${p.vendor ? `Produced by ${p.vendor}, this substrate` : 'This substrate'} provides excellent water retention and aeration for healthy root development. Suitable for a variety of growing applications including hydroponics, container gardening, and seed starting.</p>`,
  
  containers: (p) => `<p>${p.title} provides the ideal growing environment for your plants. ${p.vendor ? `From ${p.vendor}, this container` : 'This container'} is designed for optimal root health with proper drainage and aeration. Durable construction ensures long-lasting use across multiple growing cycles.</p>`,
  
  generic: (p) => `<p>${p.title} is a quality growing supply for indoor and hydroponic gardening. ${p.vendor ? `From ${p.vendor}, this product` : 'This product'} is designed to help growers achieve professional results. Built for reliability and performance, it's a valuable addition to any grow room setup.</p>`
};

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
    rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function detectCategory(title, vendor) {
  const searchText = `${title} ${vendor}`.toLowerCase();
  
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        return category;
      }
    }
  }
  return '';
}

function detectDescriptionType(title, vendor, category) {
  const searchText = `${title} ${vendor} ${category}`.toLowerCase();
  
  if (/nutrient|flora|bloom|grow.*big|sensi|voodoo|cal-?mag|npk|fertilizer/i.test(searchText)) return 'nutrients';
  if (/light|led|hps|quantum|spider.*farmer|mars.*hydro|gavita|watt/i.test(searchText)) return 'lights';
  if (/fan|ventilation|inline|carbon.*filter|cfm|exhaust/i.test(searchText)) return 'fans';
  if (/meter|ph|ec|tds|bluelab|apera|hanna/i.test(searchText)) return 'meters';
  if (/rockwool|coco|perlite|clay.*pebble|grodan|media|medium/i.test(searchText)) return 'media';
  if (/pot|container|fabric|smart.*pot|geo.*pot|gallon/i.test(searchText)) return 'containers';
  return 'generic';
}

// Main enrichment
console.log('🔧 Auto-Enriching Products\n');

const content = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(content);
const header = rows[0];
const data = rows.slice(1);

// Load WooCommerce lookup data if available
let wooLookup = {};
let wooImages = {};
try {
  if (fs.existsSync(WOO_LOOKUP)) {
    wooLookup = JSON.parse(fs.readFileSync(WOO_LOOKUP, 'utf8'));
    console.log(`📚 Loaded ${Object.keys(wooLookup).length} WooCommerce product records`);
  }
  if (fs.existsSync(WOO_IMAGE_MAP)) {
    const imageArray = JSON.parse(fs.readFileSync(WOO_IMAGE_MAP, 'utf8'));
    // Convert array to object keyed by handle
    for (const item of imageArray) {
      if (item.handle && item.imageUrl) {
        wooImages[item.handle] = item.imageUrl;
        // Also index by normalized handle
        wooImages[item.handle.toLowerCase().replace(/[^a-z0-9]/g, '-')] = item.imageUrl;
      }
    }
    console.log(`🖼️  Loaded ${Object.keys(wooImages).length} WooCommerce image mappings`);
  }
} catch (e) {
  console.log('⚠️  Could not load WooCommerce data:', e.message);
}

// Column indices
const COL = {
  Handle: 0,
  Title: 1,
  Body: 2,
  Vendor: 3,
  Category: 4,
  Type: 5,
  Image: 32
};

let stats = {
  descAdded: 0,
  catAdded: 0,
  imageAdded: 0,
  wooDescUsed: 0,
  wooImageUsed: 0
};

for (const row of data) {
  const handle = row[COL.Handle]?.trim() || '';
  const title = row[COL.Title]?.trim() || '';
  const vendor = row[COL.Vendor]?.trim() || '';
  
  if (!title) continue; // Skip variant rows
  
  // Try to enrich from WooCommerce data
  const wooProduct = wooLookup[handle] || wooLookup[title.toLowerCase()];
  
  // Add Category if missing
  if (!row[COL.Category] || row[COL.Category].length < 5) {
    // Try WooCommerce category first
    if (wooProduct?.categories) {
      row[COL.Category] = wooProduct.categories;
      stats.catAdded++;
    } else {
      // Auto-detect category
      const detectedCat = detectCategory(title, vendor);
      if (detectedCat) {
        row[COL.Category] = detectedCat;
        stats.catAdded++;
      }
    }
  }
  
  // Add Description if missing
  if (!row[COL.Body] || row[COL.Body].length < 50) {
    // Try WooCommerce description first
    if (wooProduct?.description && wooProduct.description.length > 50) {
      row[COL.Body] = wooProduct.description;
      stats.descAdded++;
      stats.wooDescUsed++;
    } else {
      // Generate description from template
      const descType = detectDescriptionType(title, vendor, row[COL.Category] || '');
      const template = DESC_TEMPLATES[descType];
      row[COL.Body] = template({ title, vendor });
      stats.descAdded++;
    }
  }
  
  // Add Image if missing
  if (!row[COL.Image] || row[COL.Image].length < 10) {
    // Try WooCommerce image - check multiple handle variations
    const handleNorm = handle.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const wooImage = wooImages[handle] || wooImages[handleNorm] || (wooProduct?.image);
    if (wooImage && wooImage.startsWith('http')) {
      row[COL.Image] = wooImage;
      stats.imageAdded++;
      stats.wooImageUsed++;
    }
  }
}

// Write enriched CSV
const output = [
  header.map(h => escapeCSV(h)).join(','),
  ...data.map(row => row.map(c => escapeCSV(c)).join(','))
].join('\n');

fs.writeFileSync(OUTPUT_CSV, output);

console.log('\n✅ Auto-Enrichment Complete!');
console.log(`   📁 Output: ${OUTPUT_CSV}`);
console.log(`\n📊 Enrichment Stats:`);
console.log(`   Descriptions added: ${stats.descAdded} (${stats.wooDescUsed} from WooCommerce)`);
console.log(`   Categories added: ${stats.catAdded}`);
console.log(`   Images added: ${stats.imageAdded} (${stats.wooImageUsed} from WooCommerce)`);
