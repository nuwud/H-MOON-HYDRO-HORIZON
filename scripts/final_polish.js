/**
 * Final polish - generate SKUs for all products and maximize data coverage
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

function generateSku(name, type) {
  const prefix = type === 'variable' ? 'VAR' : 'HMH';
  const hash = crypto.createHash('md5').update(name || 'x').digest('hex').substring(0, 8).toUpperCase();
  return `${prefix}-${hash}`;
}

console.log('=== FINAL POLISH ===\n');

const inputPath = path.join(BASE, 'outputs/woocommerce_FINAL_READY.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const TYPE_IDX = 1;
const SKU_IDX = 2;
const NAME_IDX = 3;
const WEIGHT_IDX = 18;
const PRICE_IDX = 25;
const IMAGE_IDX = 29;

const outputLines = [lines[0]];
let skusAdded = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[TYPE_IDX];
  const name = row[NAME_IDX] || '';
  
  if (!type) continue;
  
  // Generate SKU if missing
  if (!row[SKU_IDX]?.trim()) {
    row[SKU_IDX] = generateSku(name, type);
    skusAdded++;
  }
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/WOOCOMMERCE_IMPORT_FINAL.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`SKUs added: ${skusAdded}`);

// Final count
let stats = { total: 0, price: 0, sku: 0, weight: 0, image: 0 };

for (let i = 1; i < outputLines.length; i++) {
  const row = parseCSVLine(outputLines[i]);
  const type = row[TYPE_IDX];
  if (!type) continue;
  
  stats.total++;
  if (row[PRICE_IDX] && parseFloat(row[PRICE_IDX]) > 0) stats.price++;
  if (row[SKU_IDX]?.trim()) stats.sku++;
  if (row[WEIGHT_IDX] && parseFloat(row[WEIGHT_IDX]) > 0) stats.weight++;
  const img = row[IMAGE_IDX]?.trim();
  if (img && img.length > 10 && !img.includes('HMH_logo')) stats.image++;
}

console.log('\n╔══════════════════════════════════════════╗');
console.log('║     FINAL WOOCOMMERCE IMPORT FILE        ║');
console.log('╠══════════════════════════════════════════╣');
console.log(`║  Total Products: ${stats.total.toString().padStart(5)}                   ║`);
console.log('╠══════════════════════════════════════════╣');
console.log(`║  Price:   ${stats.price}/${stats.total}  (${((stats.price/stats.total)*100).toFixed(1).padStart(5)}%)          ║`);
console.log(`║  SKU:     ${stats.sku}/${stats.total}  (${((stats.sku/stats.total)*100).toFixed(1).padStart(5)}%)          ║`);
console.log(`║  Weight:  ${stats.weight}/${stats.total}  (${((stats.weight/stats.total)*100).toFixed(1).padStart(5)}%)          ║`);
console.log(`║  Image:   ${stats.image}/${stats.total}  (${((stats.image/stats.total)*100).toFixed(1).padStart(5)}%)          ║`);
console.log('╠══════════════════════════════════════════╣');
console.log('║  File: outputs/WOOCOMMERCE_IMPORT_FINAL.csv ║');
console.log('╚══════════════════════════════════════════╝');
