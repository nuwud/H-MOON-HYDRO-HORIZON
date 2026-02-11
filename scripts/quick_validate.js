/**
 * Quick validation of woocommerce_import_with_prices.csv
 */
const fs = require('fs');
const path = require('path');

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

const filePath = path.join(BASE, 'outputs/woocommerce_COMPLETE.csv');
const data = fs.readFileSync(filePath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const header = parseCSVLine(lines[0]);
console.log('Columns:', header.length);
console.log('Price col (25):', header[25]);
console.log('SKU col (2):', header[2]);
console.log('Weight col (18):', header[18]);

let total = 0, hasPrice = 0, hasSku = 0, hasWeight = 0, hasImage = 0;
let simples = 0, variables = 0, variations = 0;
let simplesWithPrice = 0, variationsWithPrice = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[1];
  if (!type) continue;
  
  total++;
  const price = parseFloat(row[25]);
  const sku = row[2]?.trim();
  const weight = parseFloat(row[18]);
  const image = row[29]?.trim();
  
  if (price > 0) hasPrice++;
  if (sku) hasSku++;
  if (weight > 0) hasWeight++;
  if (image && image.length > 5) hasImage++;
  
  if (type === 'simple') {
    simples++;
    if (price > 0) simplesWithPrice++;
  } else if (type === 'variable') {
    variables++;
  } else if (type === 'variation') {
    variations++;
    if (price > 0) variationsWithPrice++;
  }
}

console.log('\n=== DATA QUALITY REPORT ===\n');
console.log(`Total rows: ${total}`);
console.log(`Simple products: ${simples}`);
console.log(`Variable products: ${variables}`);
console.log(`Variations: ${variations}`);
console.log('');
console.log(`Price: ${hasPrice}/${total} (${((hasPrice/total)*100).toFixed(1)}%)`);
console.log(`  Simple with price: ${simplesWithPrice}/${simples} (${((simplesWithPrice/simples)*100).toFixed(1)}%)`);
console.log(`  Variations with price: ${variationsWithPrice}/${variations} (${((variationsWithPrice/variations)*100).toFixed(1)}%)`);
console.log(`SKU: ${hasSku}/${total} (${((hasSku/total)*100).toFixed(1)}%)`);
console.log(`Weight: ${hasWeight}/${total} (${((hasWeight/total)*100).toFixed(1)}%)`);
console.log(`Image: ${hasImage}/${total} (${((hasImage/total)*100).toFixed(1)}%)`);
