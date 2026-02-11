/**
 * Analyze weight and dimension data across all potential sources
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
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell);
  return result;
}

console.log('=== WEIGHT & DIMENSION DATA SOURCES ===\n');

// 1. WooCommerce Export
console.log('1. WooCommerce Export (CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv)');
const wooData = fs.readFileSync(path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv'), 'utf-8');
const wooLines = wooData.split('\n').filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooWeightIdx = wooHeader.findIndex(h => h.toLowerCase() === 'weight');
const wooLengthIdx = wooHeader.findIndex(h => h.toLowerCase() === 'length');
const wooWidthIdx = wooHeader.findIndex(h => h.toLowerCase() === 'width');
const wooHeightIdx = wooHeader.findIndex(h => h.toLowerCase() === 'height');
const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase() === 'product name');

console.log(`   Total rows: ${wooLines.length - 1}`);
console.log(`   Weight col: ${wooWeightIdx}, Length: ${wooLengthIdx}, Width: ${wooWidthIdx}, Height: ${wooHeightIdx}`);

let wooWithWeight = 0;
let wooWithDimensions = 0;
const wooWeightMap = new Map();
const wooDimensionMap = new Map();

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const sku = row[wooSkuIdx]?.trim().toLowerCase();
  const name = row[wooNameIdx]?.trim().toLowerCase();
  const weight = parseFloat(row[wooWeightIdx]);
  const length = parseFloat(row[wooLengthIdx]);
  const width = parseFloat(row[wooWidthIdx]);
  const height = parseFloat(row[wooHeightIdx]);
  
  if (weight && weight > 0) {
    wooWithWeight++;
    if (sku) wooWeightMap.set(sku, weight);
    if (name) wooWeightMap.set(name, weight);
  }
  
  if (length > 0 && width > 0 && height > 0) {
    wooWithDimensions++;
    if (sku) wooDimensionMap.set(sku, { length, width, height });
    if (name) wooDimensionMap.set(name, { length, width, height });
  }
}

console.log(`   With weight: ${wooWithWeight} (${((wooWithWeight / (wooLines.length - 1)) * 100).toFixed(1)}%)`);
console.log(`   With dimensions: ${wooWithDimensions} (${((wooWithDimensions / (wooLines.length - 1)) * 100).toFixed(1)}%)`);
console.log(`   Weight lookup size: ${wooWeightMap.size}`);
console.log(`   Dimension lookup size: ${wooDimensionMap.size}`);

// 2. POS Inventory
console.log('\n2. POS Inventory (CSVs/HMoonHydro_Inventory.csv)');
const posData = fs.readFileSync(path.join(BASE, 'CSVs/HMoonHydro_Inventory.csv'), 'utf-8');
const posLines = posData.split('\n').filter(l => l.trim());
const posHeader = parseCSVLine(posLines[0]);

// Find weight columns in POS
const weightCols = [];
posHeader.forEach((h, i) => {
  const lh = h.toLowerCase();
  if (lh.includes('weight') || lh.includes('dimension') || lh.includes('length') || lh.includes('width') || lh.includes('height')) {
    weightCols.push({ idx: i, name: h });
  }
});

console.log(`   Total rows: ${posLines.length - 1}`);
if (weightCols.length > 0) {
  console.log('   Weight/dimension columns found:');
  weightCols.forEach(c => console.log(`     Col ${c.idx}: "${c.name}"`));
} else {
  console.log('   No weight/dimension columns found');
}

// 3. Large Shopify files  
console.log('\n3. shopify_final_fixed.csv (23K rows)');
const sfData = fs.readFileSync(path.join(BASE, 'outputs/shopify_final_fixed.csv'), 'utf-8');
const sfLines = sfData.split('\n').filter(l => l.trim());
const sfHeader = parseCSVLine(sfLines[0]);

const sfGramsIdx = sfHeader.findIndex(h => h.toLowerCase().includes('variant grams'));
const sfHandleIdx = sfHeader.findIndex(h => h.toLowerCase() === 'handle');
const sfTitleIdx = sfHeader.findIndex(h => h.toLowerCase() === 'title');
const sfSkuIdx = sfHeader.findIndex(h => h.toLowerCase().includes('variant sku'));

console.log(`   Total rows: ${sfLines.length - 1}`);

let sfWithGrams = 0;
const sfGramsMap = new Map();
const handles = new Set();

for (let i = 1; i < sfLines.length; i++) {
  const row = parseCSVLine(sfLines[i]);
  const grams = parseFloat(row[sfGramsIdx]);
  const handle = row[sfHandleIdx]?.trim().toLowerCase();
  const title = row[sfTitleIdx]?.trim().toLowerCase();
  const sku = row[sfSkuIdx]?.trim().toLowerCase();
  
  if (handle) handles.add(handle);
  
  if (grams && grams > 0) {
    sfWithGrams++;
    if (sku) sfGramsMap.set(sku, grams);
    if (handle) sfGramsMap.set(handle, grams);
    if (title) sfGramsMap.set(title, grams);
  }
}

console.log(`   Unique products: ${handles.size}`);
console.log(`   Rows with grams > 0: ${sfWithGrams} (${((sfWithGrams / (sfLines.length - 1)) * 100).toFixed(1)}%)`);
console.log(`   Weight lookup size: ${sfGramsMap.size}`);

// Sample weights
console.log('\n   Sample weight data (grams):');
let count = 0;
for (const [key, val] of sfGramsMap) {
  if (count++ < 10) {
    console.log(`     "${key.substring(0, 40)}" = ${val}g`);
  }
}

// 4. Summary
console.log('\n\n=== SUMMARY: WEIGHT DATA AVAILABILITY ===\n');
console.log('| Source | Records with Weight | Coverage |');
console.log('|--------|--------------------:|----------|');
console.log(`| WooCommerce Export | ${wooWithWeight} | ${((wooWithWeight / (wooLines.length - 1)) * 100).toFixed(1)}% |`);
console.log(`| shopify_final_fixed | ${sfWithGrams} | ${((sfWithGrams / (sfLines.length - 1)) * 100).toFixed(1)}% |`);

// Combined lookup
const combinedWeights = new Map([...wooWeightMap, ...sfGramsMap]);
console.log(`\nCombined weight lookup: ${combinedWeights.size} unique keys`);

// Check against current import file
console.log('\n\n=== MATCHING AGAINST CURRENT IMPORT ===\n');

const importData = fs.readFileSync(path.join(BASE, 'outputs/shopify_final_ready.csv'), 'utf-8');
const importLines = importData.split('\n').filter(l => l.trim());
const importHeader = parseCSVLine(importLines[0]);

const impHandleIdx = importHeader.indexOf('Handle');
const impSkuIdx = importHeader.findIndex(h => h.toLowerCase().includes('variant sku'));
const impGramsIdx = importHeader.findIndex(h => h.toLowerCase().includes('variant grams'));

let alreadyHasWeight = 0;
let canMatchWeight = 0;
let noWeightAvailable = 0;

for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const handle = row[impHandleIdx]?.trim().toLowerCase();
  const sku = row[impSkuIdx]?.trim().toLowerCase();
  const currentGrams = parseFloat(row[impGramsIdx]);
  
  if (currentGrams && currentGrams > 0) {
    alreadyHasWeight++;
  } else if (combinedWeights.has(sku) || combinedWeights.has(handle)) {
    canMatchWeight++;
  } else {
    noWeightAvailable++;
  }
}

console.log(`File: outputs/shopify_final_ready.csv (${importLines.length - 1} rows)`);
console.log(`  Already has weight: ${alreadyHasWeight}`);
console.log(`  Can match from other sources: ${canMatchWeight}`);
console.log(`  No weight data available: ${noWeightAvailable}`);
console.log(`\nPotential coverage: ${(((alreadyHasWeight + canMatchWeight) / (importLines.length - 1)) * 100).toFixed(1)}%`);
