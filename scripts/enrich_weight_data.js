/**
 * Enrich import file with weight/dimensions from all available sources
 * Sources: WooCommerce export, POS inventory, shopify_final_fixed
 * 
 * Priority: Current value > WooCommerce > POS > Shopify file
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

function normalize(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

console.log('=== WEIGHT & DIMENSION ENRICHMENT ===\n');

// Build lookup maps from all sources

// 1. WooCommerce Export (has weight AND dimensions in lbs/inches)
console.log('Loading WooCommerce export...');
const wooPath = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split('\n').filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase() === 'product name');
const wooWeightIdx = wooHeader.findIndex(h => h.toLowerCase() === 'weight');
const wooLengthIdx = wooHeader.findIndex(h => h.toLowerCase() === 'length');
const wooWidthIdx = wooHeader.findIndex(h => h.toLowerCase() === 'width');
const wooHeightIdx = wooHeader.findIndex(h => h.toLowerCase() === 'height');

const wooLookup = new Map();

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const sku = normalize(row[wooSkuIdx]);
  const name = normalize(row[wooNameIdx]);
  const weight = parseFloat(row[wooWeightIdx]); // lbs
  const length = parseFloat(row[wooLengthIdx]);
  const width = parseFloat(row[wooWidthIdx]);
  const height = parseFloat(row[wooHeightIdx]);
  
  const data = {};
  if (weight > 0) data.weightLbs = weight;
  if (length > 0 && width > 0 && height > 0) {
    data.length = length;
    data.width = width;
    data.height = height;
  }
  
  if (Object.keys(data).length > 0) {
    if (sku) wooLookup.set(sku, data);
    if (name) wooLookup.set(name, data);
  }
}
console.log(`  Loaded ${wooLookup.size} lookup keys`);

// 2. POS Inventory (weight in lbs)
console.log('Loading POS inventory...');
const posPath = path.join(BASE, 'CSVs/HMoonHydro_Inventory.csv');
const posData = fs.readFileSync(posPath, 'utf-8');
const posLines = posData.split('\n').filter(l => l.trim());
const posHeader = parseCSVLine(posLines[0]);

const posItemNumIdx = 0; // Item Number
const posItemNameIdx = 1; // Item Name
const posWeightIdx = posHeader.findIndex(h => h.toLowerCase() === 'weight');

const posLookup = new Map();

for (let i = 1; i < posLines.length; i++) {
  const row = parseCSVLine(posLines[i]);
  const itemNum = normalize(row[posItemNumIdx]);
  const itemName = normalize(row[posItemNameIdx]);
  const weight = parseFloat(row[posWeightIdx]);
  
  if (weight > 0) {
    const data = { weightLbs: weight };
    if (itemNum) posLookup.set(itemNum, data);
    if (itemName) posLookup.set(itemName, data);
  }
}
console.log(`  Loaded ${posLookup.size} lookup keys`);

// 3. Shopify final_fixed (weight in grams)
console.log('Loading shopify_final_fixed...');
const sfPath = path.join(BASE, 'outputs/shopify_final_fixed.csv');
const sfData = fs.readFileSync(sfPath, 'utf-8');
const sfLines = sfData.split('\n').filter(l => l.trim());
const sfHeader = parseCSVLine(sfLines[0]);

const sfHandleIdx = sfHeader.findIndex(h => h.toLowerCase() === 'handle');
const sfTitleIdx = sfHeader.findIndex(h => h.toLowerCase() === 'title');
const sfSkuIdx = sfHeader.findIndex(h => h.toLowerCase().includes('variant sku'));
const sfGramsIdx = sfHeader.findIndex(h => h.toLowerCase().includes('variant grams'));

const sfLookup = new Map();

for (let i = 1; i < sfLines.length; i++) {
  const row = parseCSVLine(sfLines[i]);
  const handle = normalize(row[sfHandleIdx]);
  const title = normalize(row[sfTitleIdx]);
  const sku = normalize(row[sfSkuIdx]);
  const grams = parseFloat(row[sfGramsIdx]);
  
  if (grams > 0) {
    // Convert grams to lbs for consistency
    const data = { weightLbs: grams / 453.592 };
    if (sku) sfLookup.set(sku, data);
    if (handle) sfLookup.set(handle, data);
    if (title) sfLookup.set(title, data);
  }
}
console.log(`  Loaded ${sfLookup.size} lookup keys`);

// Now process the import file
console.log('\nProcessing import file...');
const importPath = path.join(BASE, 'outputs/shopify_final_ready.csv');
const importData = fs.readFileSync(importPath, 'utf-8');
const importLines = importData.split('\n').filter(l => l.trim());
const importHeader = parseCSVLine(importLines[0]);

const impHandleIdx = importHeader.indexOf('Handle');
const impTitleIdx = importHeader.indexOf('Title');
const impSkuIdx = importHeader.findIndex(h => h.includes('Variant SKU'));
const impGramsIdx = importHeader.findIndex(h => h.includes('Variant Grams'));

console.log(`  Grams column index: ${impGramsIdx}`);
console.log(`  Total rows: ${importLines.length - 1}`);

const outputRows = [importLines[0]]; // Keep header
let enrichedCount = 0;
let alreadyHadWeight = 0;
let couldNotMatch = 0;

const stats = {
  fromWoo: 0,
  fromPOS: 0,
  fromShopify: 0
};

for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const handle = normalize(row[impHandleIdx]);
  const title = normalize(row[impTitleIdx]);
  const sku = normalize(row[impSkuIdx]);
  let grams = parseFloat(row[impGramsIdx]);
  
  if (grams && grams > 0) {
    alreadyHadWeight++;
    outputRows.push(importLines[i]);
    continue;
  }
  
  // Try to find weight from sources (priority order)
  let found = null;
  let source = null;
  
  // Try WooCommerce first (most reliable)
  if (wooLookup.has(sku)) { found = wooLookup.get(sku); source = 'woo'; }
  else if (wooLookup.has(handle)) { found = wooLookup.get(handle); source = 'woo'; }
  else if (wooLookup.has(title)) { found = wooLookup.get(title); source = 'woo'; }
  // Try POS
  else if (posLookup.has(sku)) { found = posLookup.get(sku); source = 'pos'; }
  else if (posLookup.has(handle)) { found = posLookup.get(handle); source = 'pos'; }
  else if (posLookup.has(title)) { found = posLookup.get(title); source = 'pos'; }
  // Try Shopify file
  else if (sfLookup.has(sku)) { found = sfLookup.get(sku); source = 'shopify'; }
  else if (sfLookup.has(handle)) { found = sfLookup.get(handle); source = 'shopify'; }
  else if (sfLookup.has(title)) { found = sfLookup.get(title); source = 'shopify'; }
  
  if (found && found.weightLbs > 0) {
    // Convert lbs to grams for Shopify format
    grams = Math.round(found.weightLbs * 453.592);
    row[impGramsIdx] = grams.toString();
    enrichedCount++;
    
    if (source === 'woo') stats.fromWoo++;
    else if (source === 'pos') stats.fromPOS++;
    else if (source === 'shopify') stats.fromShopify++;
  } else {
    couldNotMatch++;
  }
  
  outputRows.push(row.map(escapeCSV).join(','));
}

// Write enriched file
const outputPath = path.join(BASE, 'outputs/shopify_weight_enriched.csv');
fs.writeFileSync(outputPath, outputRows.join('\n'), 'utf-8');

console.log('\n=== ENRICHMENT RESULTS ===\n');
console.log(`Input file: shopify_final_ready.csv`);
console.log(`Output file: shopify_weight_enriched.csv`);
console.log('');
console.log(`Already had weight: ${alreadyHadWeight}`);
console.log(`Enriched with weight: ${enrichedCount}`);
console.log(`  - From WooCommerce: ${stats.fromWoo}`);
console.log(`  - From POS: ${stats.fromPOS}`);
console.log(`  - From Shopify file: ${stats.fromShopify}`);
console.log(`Could not find weight: ${couldNotMatch}`);
console.log('');

const totalWithWeight = alreadyHadWeight + enrichedCount;
const coverage = ((totalWithWeight / (importLines.length - 1)) * 100).toFixed(1);
console.log(`FINAL WEIGHT COVERAGE: ${totalWithWeight} / ${importLines.length - 1} = ${coverage}%`);
