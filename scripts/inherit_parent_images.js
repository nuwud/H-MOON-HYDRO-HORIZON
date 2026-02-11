/**
 * Inherit images from parent products to variations
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

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

console.log('=== INHERITING IMAGES FROM PARENTS ===\n');

const inputPath = path.join(BASE, 'outputs/woocommerce_BEST.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const TYPE_IDX = 1;
const NAME_IDX = 3;
const PARENT_IDX = 32;  // Parent column
const IMAGE_IDX = 29;

// First pass: collect parent images
const parentImages = new Map();
let currentParent = null;
let currentParentImage = null;

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[TYPE_IDX];
  const name = row[NAME_IDX] || '';
  const image = row[IMAGE_IDX]?.trim();
  
  if (type === 'variable') {
    currentParent = name;
    currentParentImage = (image && image.length > 10 && !image.includes('HMH_logo')) ? image : null;
    if (currentParentImage) {
      parentImages.set(name, currentParentImage);
    }
  }
  
  rows.push(row);
}

console.log(`Found ${parentImages.size} parent products with images`);

// Second pass: inherit images
let inherited = 0;
let alreadyHad = 0;
let stillMissing = 0;

currentParent = null;
currentParentImage = null;

const outputLines = [lines[0]];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const type = row[TYPE_IDX];
  const name = row[NAME_IDX] || '';
  let image = row[IMAGE_IDX]?.trim();
  
  if (type === 'variable') {
    currentParent = name;
    currentParentImage = parentImages.get(name);
  }
  
  const hasGoodImage = image && image.length > 10 && !image.includes('HMH_logo') && !image.includes('placeholder');
  
  if (hasGoodImage) {
    alreadyHad++;
  } else if (type === 'variation' && currentParentImage) {
    row[IMAGE_IDX] = currentParentImage;
    inherited++;
  } else {
    stillMissing++;
  }
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_FINAL_READY.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`\nAlready had image: ${alreadyHad}`);
console.log(`Inherited from parent: ${inherited}`);
console.log(`Still missing: ${stillMissing}`);

const totalWithImages = alreadyHad + inherited;
console.log(`\nFinal image coverage: ${totalWithImages}/${rows.length} (${((totalWithImages/rows.length)*100).toFixed(1)}%)`);
console.log(`\nOutput: outputs/woocommerce_FINAL_READY.csv`);

// Final validation
console.log('\n=== FINAL VALIDATION ===\n');

let stats = { total: 0, price: 0, sku: 0, weight: 0, image: 0 };
const PRICE_IDX = 25;
const SKU_IDX = 2;
const WEIGHT_IDX = 18;

for (const row of rows) {
  const type = row[TYPE_IDX];
  if (!type) continue;
  stats.total++;
  
  if (row[PRICE_IDX] && parseFloat(row[PRICE_IDX]) > 0) stats.price++;
  if (row[SKU_IDX]?.trim()) stats.sku++;
  if (row[WEIGHT_IDX] && parseFloat(row[WEIGHT_IDX]) > 0) stats.weight++;
  
  const img = row[IMAGE_IDX]?.trim();
  if (img && img.length > 10 && !img.includes('HMH_logo')) stats.image++;
}

console.log(`Price:  ${stats.price}/${stats.total} (${((stats.price/stats.total)*100).toFixed(1)}%)`);
console.log(`SKU:    ${stats.sku}/${stats.total} (${((stats.sku/stats.total)*100).toFixed(1)}%)`);
console.log(`Weight: ${stats.weight}/${stats.total} (${((stats.weight/stats.total)*100).toFixed(1)}%)`);
console.log(`Image:  ${stats.image}/${stats.total} (${((stats.image/stats.total)*100).toFixed(1)}%)`);
