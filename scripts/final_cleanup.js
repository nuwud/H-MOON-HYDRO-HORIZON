/**
 * Final cleanup - generate SKUs for remaining products and final validation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(cell); cell = ''; }
    else cell += c;
  }
  result.push(cell);
  return result;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateSku(name, category) {
  const catCode = getCategoryCode(category);
  const hash = crypto.createHash('md5').update(name || 'unknown').digest('hex').substring(0, 6).toUpperCase();
  return `HMH-${catCode}-${hash}`;
}

function getCategoryCode(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('nutrient')) return 'NUT';
  if (cat.includes('grow media') || cat.includes('media')) return 'GRO';
  if (cat.includes('light')) return 'LIT';
  if (cat.includes('airflow') || cat.includes('fan')) return 'AIR';
  if (cat.includes('irrigation') || cat.includes('pump')) return 'IRR';
  if (cat.includes('container') || cat.includes('pot')) return 'POT';
  if (cat.includes('propagation')) return 'PRO';
  if (cat.includes('seed')) return 'SED';
  if (cat.includes('harvest') || cat.includes('trim')) return 'HAR';
  if (cat.includes('pest')) return 'PES';
  if (cat.includes('odor') || cat.includes('carbon')) return 'ODR';
  if (cat.includes('controller')) return 'CTL';
  if (cat.includes('ph') || cat.includes('meter')) return 'PHM';
  return 'GEN';
}

console.log('=== FINAL CLEANUP ===\n');

const inputPath = path.join(BASE, 'outputs/woocommerce_FINAL_v2.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const TYPE_IDX = 1;
const SKU_IDX = 2;
const NAME_IDX = 3;
const WEIGHT_IDX = 18;
const PRICE_IDX = 25;
const CATEGORY_IDX = 26;
const IMAGE_IDX = 29;

const outputLines = [lines[0]];
let skusGenerated = 0;

// Track stats
let stats = { total: 0, simple: 0, variable: 0, variation: 0 };
let quality = { price: 0, sku: 0, weight: 0, image: 0 };

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[TYPE_IDX];
  
  if (!type) continue;
  stats.total++;
  stats[type]++;
  
  // Generate SKU if missing (except for variable parent products)
  if (!row[SKU_IDX]?.trim() && type !== 'variable') {
    row[SKU_IDX] = generateSku(row[NAME_IDX], row[CATEGORY_IDX]);
    skusGenerated++;
  }
  
  // Count quality metrics
  if (row[PRICE_IDX] && parseFloat(row[PRICE_IDX]) > 0) quality.price++;
  if (row[SKU_IDX]?.trim()) quality.sku++;
  if (row[WEIGHT_IDX] && parseFloat(row[WEIGHT_IDX]) > 0) quality.weight++;
  if (row[IMAGE_IDX]?.trim() && row[IMAGE_IDX].length > 10 && !row[IMAGE_IDX].includes('HMH_logo')) quality.image++;
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write final output
const outputPath = path.join(BASE, 'outputs/woocommerce_READY_TO_IMPORT.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log('=== FINAL VALIDATION ===\n');
console.log(`Total rows: ${stats.total}`);
console.log(`  Simple products: ${stats.simple}`);
console.log(`  Variable products: ${stats.variable}`);
console.log(`  Variations: ${stats.variation}`);
console.log('');
console.log(`SKUs generated: ${skusGenerated}`);
console.log('');
console.log('QUALITY METRICS:');
console.log(`  Price:  ${quality.price}/${stats.total} (${((quality.price/stats.total)*100).toFixed(1)}%)`);
console.log(`  SKU:    ${quality.sku}/${stats.total} (${((quality.sku/stats.total)*100).toFixed(1)}%)`);
console.log(`  Weight: ${quality.weight}/${stats.total} (${((quality.weight/stats.total)*100).toFixed(1)}%)`);
console.log(`  Image:  ${quality.image}/${stats.total} (${((quality.image/stats.total)*100).toFixed(1)}%)`);
console.log('');
console.log(`Output: outputs/woocommerce_READY_TO_IMPORT.csv`);
