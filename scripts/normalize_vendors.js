/**
 * Normalize Vendors/Brands
 * 
 * Fixes:
 * 1. UNKNOWN vendors - infer from product title
 * 2. Abbreviations (GH → General Hydroponics)
 * 3. Inconsistent casing and spelling
 * 
 * Run: node scripts/normalize_vendors.js
 */

const fs = require('fs');
const Papa = require('papaparse');

const SOURCE_FILE = 'outputs/shopify_complete_import_enriched.csv';
const OUTPUT_FILE = 'outputs/shopify_complete_import_normalized.csv';

// Brand normalization map
const BRAND_ALIASES = {
  // General Hydroponics variants
  'gh': 'General Hydroponics',
  'gen hydro': 'General Hydroponics',
  'genhydro': 'General Hydroponics',
  'general hydro': 'General Hydroponics',
  
  // Advanced Nutrients variants
  'an': 'Advanced Nutrients',
  'adv nutrients': 'Advanced Nutrients',
  
  // Fox Farm variants
  'ff': 'FoxFarm',
  'fox farm': 'FoxFarm',
  'foxfarm soil': 'FoxFarm',
  
  // House & Garden
  'h&g': 'House & Garden',
  'hg': 'House & Garden',
  'house and garden': 'House & Garden',
  
  // AC Infinity variants
  'ac': 'AC Infinity',
  'cloudline': 'AC Infinity',
  'acinfinity': 'AC Infinity',
  
  // Botanicare
  'bot': 'Botanicare',
  
  // Common distributor normalization
  'nickel city wholesale garden supply': 'Nickel City',
  'hawthorne hydoponics llc': 'Hawthorne',
  'hawthorne hydroponics': 'Hawthorne',
  'sunlight supply inc.': 'Sunlight Supply',
  'sunlight supply': 'Sunlight Supply',
  
  // Other normalizations
  'ngw': 'NGW',
  'bfg': 'BFG Supply',
  'd.l. wholesale': 'DL Wholesale',
  'system': 'System (Generic)',
  'phive8': 'Phive8',
  'gease': 'Grease',
  'grease': 'Grease',
  '@flowers-hemp': 'Flowers Hemp'
};

// Brand detection patterns (for UNKNOWN vendors)
const BRAND_PATTERNS = [
  { pattern: /general hydroponics|flora(gro|micro|bloom)|calimagic|armor si|rapidstart|koolbloom/i, brand: 'General Hydroponics' },
  { pattern: /advanced nutrients|big bud|bud ignitor|overdrive|voodoo juice|piranha|tarantula|b-52|bud candy/i, brand: 'Advanced Nutrients' },
  { pattern: /foxfarm|fox farm|tiger bloom|big bloom|grow big|ocean forest|happy frog|cha ching|beastie bloomz/i, brand: 'FoxFarm' },
  { pattern: /house (&|and) garden|h&g|roots excelurator|shooting powder|top booster|multi zen/i, brand: 'House & Garden' },
  { pattern: /canna(?!bis)|cannazym|rhizotonic|pk 13\/14|boost accelerator/i, brand: 'Canna' },
  { pattern: /botanicare|pure blend|hydroguard|cal-mag plus|silica blast|liquid karma|kind base/i, brand: 'Botanicare' },
  { pattern: /ac infinity|cloudline|ionframe|ionboard|controller 6[79]/i, brand: 'AC Infinity' },
  { pattern: /gavita|pro 1[07]00|ct 1930/i, brand: 'Gavita' },
  { pattern: /fluence|spydr|vypr/i, brand: 'Fluence' },
  { pattern: /grodan|hugo|delta block|gro-slab|a-ok/i, brand: 'Grodan' },
  { pattern: /mother earth|hydroton|coco \+ perlite|groundswell/i, brand: 'Mother Earth' },
  { pattern: /cyco|supa stiky|potash plus|dr\.? repair/i, brand: 'Cyco' },
  { pattern: /bluelab|guardian monitor|ph pen|combo meter/i, brand: 'Bluelab' },
  { pattern: /apera|ph20|pc60|ai311/i, brand: 'Apera' },
  { pattern: /trolmaster|hydro-x|aqua-x/i, brand: 'TrolMaster' },
  { pattern: /athena|pro line|cleanse|stack/i, brand: 'Athena' },
  { pattern: /vivosun|aerolight|vs series/i, brand: 'VIVOSUN' },
  { pattern: /mars hydro|fc-e|ts series/i, brand: 'MARS HYDRO' },
  { pattern: /spider farmer|se series|sf series|g series/i, brand: 'Spider Farmer' },
  { pattern: /hortilux|eye hortilux/i, brand: 'Hortilux' },
  { pattern: /dimlux/i, brand: 'Dimlux' },
  { pattern: /sun system|sun grip|yield master/i, brand: 'Sun System' },
  { pattern: /hydrofarm/i, brand: 'Hydrofarm' },
  { pattern: /dutch master/i, brand: 'Dutch Master' },
  { pattern: /rock nutrients|rock resinator/i, brand: 'Rock Nutrients' },
  { pattern: /emerald harvest/i, brand: 'Emerald Harvest' },
  { pattern: /roots organics/i, brand: 'Roots Organics' },
  { pattern: /nectar for the gods/i, brand: 'Nectar for the Gods' },
  { pattern: /humboldts secret/i, brand: "Humboldt's Secret" },
  { pattern: /dyna-gro|dynagro/i, brand: 'Dyna-Gro' },
  { pattern: /flora flex|floraflex/i, brand: 'FloraFlex' },
  { pattern: /active aqua/i, brand: 'Active Aqua' },
  { pattern: /autopot/i, brand: 'AutoPot' },
  { pattern: /hydrodynamics|clonex/i, brand: 'Hydrodynamics' },
  { pattern: /technaflora/i, brand: 'Technaflora' },
  { pattern: /cutting edge|ce nutrients/i, brand: 'Cutting Edge' },
  { pattern: /current culture/i, brand: 'Current Culture' },
  { pattern: /mammoth p|mammoth microbes/i, brand: 'Mammoth Microbes' },
  { pattern: /great white|plant success/i, brand: 'Plant Success' },
  { pattern: /recharge/i, brand: 'Real Growers' },
  { pattern: /tribus/i, brand: 'Tribus' },
  { pattern: /soul synthetics/i, brand: 'Soul Synthetics' },
  { pattern: /hanna instruments|hanna/i, brand: 'Hanna Instruments' }
];

function normalizeVendor(vendor, title = '') {
  // Check if already a good vendor
  if (vendor && vendor !== 'UNKNOWN' && vendor.length > 2) {
    // Check alias map
    const lower = vendor.toLowerCase().trim();
    if (BRAND_ALIASES[lower]) {
      return BRAND_ALIASES[lower];
    }
    return vendor;
  }
  
  // Try to detect brand from title
  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(title)) {
      return brand;
    }
  }
  
  // Still unknown - return original or mark as unknown
  return vendor || 'H-Moon Hydro';
}

async function main() {
  console.log('=== VENDOR NORMALIZATION ===\n');
  
  const data = Papa.parse(fs.readFileSync(SOURCE_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  console.log(`Loaded: ${data.length} rows`);
  
  // Track changes
  let stats = { normalized: 0, detected: 0, unchanged: 0, stillUnknown: 0 };
  const vendorChanges = {};
  
  const normalizedData = data.map(row => {
    const oldVendor = row.Vendor || '';
    const title = row.Title || '';
    
    // Skip variant rows
    if (!title.trim()) {
      return row;
    }
    
    const newVendor = normalizeVendor(oldVendor, title);
    
    if (newVendor !== oldVendor) {
      if (oldVendor === 'UNKNOWN' || !oldVendor.trim()) {
        stats.detected++;
      } else {
        stats.normalized++;
      }
      
      // Track changes
      const key = `${oldVendor} → ${newVendor}`;
      vendorChanges[key] = (vendorChanges[key] || 0) + 1;
      
      row.Vendor = newVendor;
    } else {
      if (oldVendor === 'UNKNOWN') {
        stats.stillUnknown++;
      } else {
        stats.unchanged++;
      }
    }
    
    return row;
  });
  
  // Write output
  const output = Papa.unparse(normalizedData);
  fs.writeFileSync(OUTPUT_FILE, output);
  
  console.log('\n=== RESULTS ===');
  console.log(`Normalized (alias→proper): ${stats.normalized}`);
  console.log(`Detected from title:       ${stats.detected}`);
  console.log(`Unchanged (already good):  ${stats.unchanged}`);
  console.log(`Still unknown:             ${stats.stillUnknown}`);
  
  console.log('\n=== TOP VENDOR CHANGES ===');
  Object.entries(vendorChanges)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([change, count]) => {
      console.log(`  ${count.toString().padStart(4)} ${change}`);
    });
  
  console.log(`\nOutput: ${OUTPUT_FILE}`);
  
  // Verify
  const verifyData = Papa.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  const verifyProducts = verifyData.filter(r => r.Title && r.Title.trim() !== '');
  const unknownCount = verifyProducts.filter(r => r.Vendor === 'UNKNOWN' || !r.Vendor.trim()).length;
  console.log(`\nVerification: ${unknownCount} products still have UNKNOWN vendor`);
}

main().catch(console.error);
