/**
 * Merge weight data into the price-recovered WooCommerce file
 * Takes weights from shopify_fully_enriched.csv and merges into woocommerce_import_with_prices.csv
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

console.log('=== MERGING WEIGHT DATA ===\n');

// Load weight data from enriched Shopify file
console.log('Loading weight data from shopify_fully_enriched.csv...');
const shopifyPath = path.join(BASE, 'outputs/shopify_fully_enriched.csv');
const shopifyData = fs.readFileSync(shopifyPath, 'utf-8');
const shopifyLines = shopifyData.split(/\r?\n/).filter(l => l.trim());
const shopifyHeader = parseCSVLine(shopifyLines[0]);

const shopifySkuIdx = shopifyHeader.findIndex(h => h.includes('Variant SKU'));
const shopifyGramsIdx = shopifyHeader.findIndex(h => h.includes('Variant Grams'));

const weightMap = new Map();

for (let i = 1; i < shopifyLines.length; i++) {
  const row = parseCSVLine(shopifyLines[i]);
  const sku = row[shopifySkuIdx]?.trim().toLowerCase();
  const grams = parseFloat(row[shopifyGramsIdx]);
  
  if (sku && grams > 0) {
    weightMap.set(sku, grams);
  }
}

console.log(`  Loaded ${weightMap.size} SKU -> weight mappings`);

// Load WooCommerce file with prices
console.log('Loading woocommerce_import_with_prices.csv...');
const wooPath = path.join(BASE, 'outputs/woocommerce_import_with_prices.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split(/\r?\n/).filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooSkuIdx = 2;  // SKU column
const wooWeightIdx = 18;  // Weight (lbs) column

console.log(`  Total rows: ${wooLines.length - 1}`);

// Process and merge
const outputLines = [wooLines[0]]; // Keep header
let alreadyHadWeight = 0;
let mergedWeight = 0;
let noWeightAvailable = 0;

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const sku = row[wooSkuIdx]?.trim().toLowerCase();
  let currentWeight = parseFloat(row[wooWeightIdx]);
  
  if (currentWeight > 0) {
    alreadyHadWeight++;
  } else if (sku && weightMap.has(sku)) {
    // Convert grams to lbs
    const grams = weightMap.get(sku);
    const lbs = (grams / 453.592).toFixed(2);
    row[wooWeightIdx] = lbs;
    mergedWeight++;
  } else {
    noWeightAvailable++;
  }
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_FINAL.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log('\n=== MERGE RESULTS ===\n');
console.log(`Already had weight: ${alreadyHadWeight}`);
console.log(`Merged weight: ${mergedWeight}`);
console.log(`No weight available: ${noWeightAvailable}`);

const totalWithWeight = alreadyHadWeight + mergedWeight;
console.log(`\nFINAL WEIGHT: ${totalWithWeight}/${wooLines.length - 1} (${((totalWithWeight/(wooLines.length-1))*100).toFixed(1)}%)`);
console.log(`\nOutput: outputs/woocommerce_FINAL.csv`);
