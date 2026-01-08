const fs = require('fs');

// Read the CSV
const csv = fs.readFileSync('outputs/shopify_complete_import.csv', 'utf8');
const lines = csv.split('\n').slice(1);

// Get products without images
const missing = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const handleMatch = line.match(/^"([^"]+)"/);
  if (!handleMatch) continue;
  const handle = handleMatch[1];
  
  // Check if has real image URL
  const imgMatch = line.match(/,"(https?:\/\/[^"]+)"/);
  const hasRealImg = imgMatch && !imgMatch[1].includes('HMH_logo_small');
  
  if (!hasRealImg && !missing.find(m => m.handle === handle)) {
    const titleMatch = line.match(/^"[^"]+","([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : handle;
    missing.push({ handle, title });
  }
}

// Try to identify brand from title
const brandPatterns = [
  [/fox\s*farm/i, 'Fox Farm'],
  [/advanced\s*nutrients?/i, 'Advanced Nutrients'],
  [/general\s*hydro/i, 'General Hydroponics'],
  [/botanicare/i, 'Botanicare'],
  [/flora.?flex/i, 'FloraFlex'],
  [/grodan/i, 'Grodan'],
  [/hydro.?logic/i, 'Hydro-Logic'],
  [/ac\s*infinity/i, 'AC Infinity'],
  [/grow.?it/i, 'Grow!t'],
  [/can.?filter/i, 'Can-Filters'],
  [/xtreme\s*gardening/i, 'Xtreme Gardening'],
  [/monterey/i, 'Monterey'],
  [/roots?\s*organic/i, 'Roots Organics'],
  [/vermicrop/i, 'Vermicrop'],
  [/hydro.?dynamics/i, 'Hydrodynamics'],
  [/canna/i, 'Canna'],
  [/hammer\s*head/i, 'Advanced Nutrients'],
  [/big\s*bud/i, 'Advanced Nutrients'],
  [/bud\s*candy/i, 'Advanced Nutrients'],
  [/oasis/i, 'Oasis'],
  [/athena/i, 'Athena'],
  [/emerald\s*harvest/i, 'Emerald Harvest'],
  [/aza.?guard/i, 'AzaGuard'],
  [/pyganic/i, 'PyGanic'],
  [/great\s*white/i, 'Plant Revolution'],
  [/mammoth/i, 'Mammoth'],
];

const byBrand = {};
for (const p of missing) {
  let brand = 'Unknown';
  for (const [pattern, name] of brandPatterns) {
    if (pattern.test(p.title)) {
      brand = name;
      break;
    }
  }
  if (!byBrand[brand]) byBrand[brand] = [];
  byBrand[brand].push({ handle: p.handle, title: p.title });
}

console.log('=== Missing Images by Detected Brand ===\n');
const sorted = Object.entries(byBrand).sort((a,b) => b[1].length - a[1].length);
for (const [brand, items] of sorted.slice(0, 20)) {
  console.log(`${brand}: ${items.length} products`);
  items.slice(0, 3).forEach(item => console.log(`  - ${item.title.substring(0, 65)}`));
  console.log('');
}

console.log('\n=== Summary ===');
console.log('Total products missing images:', missing.length);
console.log('Known brands:', sorted.filter(([b]) => b !== 'Unknown').reduce((sum, [,items]) => sum + items.length, 0));
console.log('Unknown brand:', (byBrand['Unknown'] || []).length);

// Save details for known brands (we might be able to find images)
const knowable = sorted.filter(([b]) => b !== 'Unknown');
const output = {};
for (const [brand, items] of knowable) {
  output[brand] = items.map(i => i.handle);
}
fs.writeFileSync('outputs/missing_by_brand.json', JSON.stringify(output, null, 2));
console.log('\nSaved outputs/missing_by_brand.json');
