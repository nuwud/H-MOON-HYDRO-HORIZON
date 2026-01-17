/**
 * Fix Missing Prices
 * Fills in missing prices from WooCommerce export data
 */

const fs = require('fs');

// Products with known missing prices and their WooCommerce prices
const MISSING_PRICES = {
  'spray-n-grow-16oz': { price: '24.99', source: 'WooCommerce estimate' },
  'spray-n-grow-micronutrients-8-oz': { price: '19.99', source: 'WooCommerce estimate' },
  'super-lemon-haze-feminised-lemon-skunk-x-super-silver-haze5-seed': { price: '49.99', source: 'Seed estimate' },
  'silicium-bloom': { price: '29.99', source: 'WooCommerce similar: 199-299 range nutrient' },
  'skunk-auto-feminised-skunk-x-ruderalis-5-seed': { price: '39.99', source: 'Seed estimate' },
  'spray-n-grow-32-oz': { price: '34.99', source: 'WooCommerce estimate' },
  'silicium-qts': { price: '299.00', source: 'WooCommerce: hmh01763 = $299' },
  'meet-source-turbo': { price: '599.00', source: 'Extraction equipment estimate' },
  'hydro-logic-preevolution-high-capacity-pre-filter': { price: '149.00', source: 'Hydro-Logic filter estimate' },
  'dutch-lighting-innovations-diode-series-led-multilayer-600-fs-dc-208-400v': { price: '799.00', source: 'WooCommerce DLI: $799' },
  'e-papillon-630-watt-led': { price: '659.00', source: 'WooCommerce: $659' },
  'dli-cri-series-uv-150w-de': { price: '399.00', source: 'DLI UV light estimate' },
  'cloudray-s9-gen-2-grow-tent-clip-fan-9': { price: '49.99', source: 'AC Infinity fan estimate' },
  'bio365-bioflower-nutrient-dense-mix-1-5cu-ft-bag-blend-of-fine-coir-coarse-peat-super-coarse-perlite': { price: '39.99', source: 'Growing media estimate' }
};

// Parse CSV
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);
  
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  
  return { headers, rows };
}

function parseRow(line) {
  const values = [];
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
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  
  return values;
}

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Main
const inputPath = './CSVs/products_export_ready.csv';
const outputPath = './CSVs/products_export_final_ready.csv';

console.log('═'.repeat(70));
console.log('🔧 FIXING MISSING PRICES');
console.log('═'.repeat(70));

const content = fs.readFileSync(inputPath, 'utf-8');
const { headers, rows } = parseCSV(content);

const handleIdx = headers.indexOf('Handle');
const priceIdx = headers.indexOf('Variant Price');

if (handleIdx === -1 || priceIdx === -1) {
  console.error('❌ Could not find Handle or Variant Price columns');
  process.exit(1);
}

let fixedCount = 0;
const fixedProducts = [];

for (const row of rows) {
  const handle = row[handleIdx];
  const price = row[priceIdx];
  
  if ((!price || price.trim() === '') && MISSING_PRICES[handle]) {
    row[priceIdx] = MISSING_PRICES[handle].price;
    fixedProducts.push({
      handle,
      newPrice: MISSING_PRICES[handle].price,
      source: MISSING_PRICES[handle].source
    });
    fixedCount++;
  }
}

// Write output
const outputLines = [headers.map(escapeCSV).join(',')];
for (const row of rows) {
  outputLines.push(row.map(escapeCSV).join(','));
}

fs.writeFileSync(outputPath, outputLines.join('\n'));

console.log(`\n✅ Fixed ${fixedCount} products with missing prices:\n`);
for (const p of fixedProducts) {
  console.log(`   ${p.handle}`);
  console.log(`      Price: $${p.newPrice} (${p.source})`);
}

console.log(`\n📄 Output: ${outputPath}`);
console.log('═'.repeat(70));
