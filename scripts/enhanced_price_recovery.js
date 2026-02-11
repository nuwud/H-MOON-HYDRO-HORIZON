/**
 * Enhanced Price Recovery with Parent Inheritance
 * 
 * Strategy:
 * 1. Build parent->price lookup from import data
 * 2. Look up variant prices from WooCommerce by parent name + attribute
 * 3. Fall back to parent price if no specific variant price found
 * 4. Generate SKUs for variations without them
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

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function normalizePrice(price) {
  if (!price) return null;
  const cleaned = String(price).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num.toFixed(2);
}

function normalizeSKU(sku) {
  return String(sku || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function generateVariantSKU(parentSKU, index) {
  // Generate a variant SKU based on parent
  const base = parentSKU || 'HMH00000';
  return `${base}-V${String(index).padStart(2, '0')}`;
}

console.log('=== ENHANCED PRICE RECOVERY ===\n');

// Step 1: Load WooCommerce export with full variant data
console.log('Loading WooCommerce export...');
const wooData = fs.readFileSync(path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv'), 'utf-8');
const wooLines = wooData.split('\n').filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooPriceIdx = wooHeader.findIndex(h => h.toLowerCase() === 'regular price');
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase() === 'product name');
const wooParentIdx = wooHeader.findIndex(h => h.toLowerCase() === 'parent id');

console.log(`  SKU col: ${wooSkuIdx}, Price col: ${wooPriceIdx}, Name col: ${wooNameIdx}`);

// Build WooCommerce price maps
const wooPriceBySKU = new Map();
const wooPriceByName = new Map();

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const sku = normalizeSKU(row[wooSkuIdx]);
  const price = normalizePrice(row[wooPriceIdx]);
  const name = row[wooNameIdx]?.toLowerCase().trim() || '';
  
  if (sku && price) wooPriceBySKU.set(sku, price);
  if (name && price) wooPriceByName.set(name, price);
}

console.log(`  Built lookup: ${wooPriceBySKU.size} SKUs, ${wooPriceByName.size} names\n`);

// Step 2: Load POS inventory
console.log('Loading POS inventory...');
const posData = fs.readFileSync(path.join(BASE, 'CSVs/HMoonHydro_Inventory.csv'), 'utf-8');
const posLines = posData.split('\n').filter(l => l.trim());
const posHeader = parseCSVLine(posLines[0]);

const posSkuIdx = 0;
const posPriceIdx = 8;
const posNameIdx = 1;

const posPriceBySKU = new Map();
const posPriceByName = new Map();

for (let i = 1; i < posLines.length; i++) {
  const row = parseCSVLine(posLines[i]);
  const sku = normalizeSKU(row[posSkuIdx]);
  const price = normalizePrice(row[posPriceIdx]);
  const name = row[posNameIdx]?.toLowerCase().trim() || '';
  
  if (sku && price) posPriceBySKU.set(sku, price);
  if (name && price) posPriceByName.set(name, price);
}

console.log(`  Built lookup: ${posPriceBySKU.size} SKUs, ${posPriceByName.size} names\n`);

// Step 3: Load import file
console.log('Loading import file...');
const importFile = path.join(BASE, 'outputs/woocommerce_import_ready.csv');
const importData = fs.readFileSync(importFile, 'utf-8');
const importLines = importData.split('\n').filter(l => l.trim());
const importHeader = parseCSVLine(importLines[0]);

const impSkuIdx = importHeader.indexOf('SKU');
const impTypeIdx = importHeader.indexOf('Type');
const impPriceIdx = importHeader.indexOf('Regular price');
const impNameIdx = importHeader.indexOf('Name');
const impParentIdx = importHeader.indexOf('Parent');
const impAttr1ValIdx = importHeader.indexOf('Attribute 1 value(s)');

console.log(`  Total rows: ${importLines.length - 1}`);

// Build parent info lookup
const parentInfo = new Map();
let currentParent = null;
let variantIndex = 0;

for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const type = row[impTypeIdx];
  const sku = row[impSkuIdx];
  const name = row[impNameIdx];
  const price = row[impPriceIdx];
  const parent = row[impParentIdx];
  
  if (type === 'simple' || type === 'variable') {
    currentParent = { sku, name, price, handle: parent || name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    variantIndex = 0;
    parentInfo.set(i, currentParent);
  } else if (type === 'variation' && currentParent) {
    variantIndex++;
    parentInfo.set(i, { ...currentParent, variantIndex });
  }
}

// Step 4: Fix prices and SKUs
const stats = {
  total: 0,
  hadPrice: 0,
  fixedFromWoo: 0,
  fixedFromPos: 0,
  fixedFromParent: 0,
  stillMissing: 0,
  skusGenerated: 0
};

const fixedRows = [];
for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const type = row[impTypeIdx];
  const sku = row[impSkuIdx]?.trim();
  const currentPrice = normalizePrice(row[impPriceIdx]);
  const name = row[impNameIdx]?.trim() || '';
  const parent = row[impParentIdx]?.trim() || '';
  
  // Skip variable products (they don't need prices)
  if (type === 'variable') {
    fixedRows.push(row);
    continue;
  }
  
  stats.total++;
  
  // Fix price
  let newPrice = currentPrice;
  if (!currentPrice) {
    const normSku = normalizeSKU(sku);
    const normName = name.toLowerCase();
    const parentData = parentInfo.get(i);
    const parentSku = normalizeSKU(parentData?.sku);
    const parentName = parentData?.name?.toLowerCase() || '';
    
    // Try to find price in order of preference
    if (normSku && wooPriceBySKU.has(normSku)) {
      newPrice = wooPriceBySKU.get(normSku);
      stats.fixedFromWoo++;
    } else if (normSku && posPriceBySKU.has(normSku)) {
      newPrice = posPriceBySKU.get(normSku);
      stats.fixedFromPos++;
    } else if (normName && wooPriceByName.has(normName)) {
      newPrice = wooPriceByName.get(normName);
      stats.fixedFromWoo++;
    } else if (normName && posPriceByName.has(normName)) {
      newPrice = posPriceByName.get(normName);
      stats.fixedFromPos++;
    } else if (parentSku && wooPriceBySKU.has(parentSku)) {
      newPrice = wooPriceBySKU.get(parentSku);
      stats.fixedFromParent++;
    } else if (parentSku && posPriceBySKU.has(parentSku)) {
      newPrice = posPriceBySKU.get(parentSku);
      stats.fixedFromParent++;
    } else if (parentName && wooPriceByName.has(parentName)) {
      newPrice = wooPriceByName.get(parentName);
      stats.fixedFromParent++;
    } else if (parentData?.price) {
      // Last resort: use parent price from import data itself
      newPrice = normalizePrice(parentData.price);
      stats.fixedFromParent++;
    }
    
    if (!newPrice) {
      stats.stillMissing++;
    }
  } else {
    stats.hadPrice++;
  }
  
  row[impPriceIdx] = newPrice || '';
  
  // Fix SKU for variations without one
  let newSku = sku;
  if (type === 'variation' && !sku) {
    const parentData = parentInfo.get(i);
    if (parentData) {
      newSku = generateVariantSKU(parentData.sku, parentData.variantIndex || 1);
      stats.skusGenerated++;
    }
  }
  row[impSkuIdx] = newSku || '';
  
  fixedRows.push(row);
}

console.log('\n=== PRICE RECOVERY RESULTS ===\n');
console.log(`Products needing prices: ${stats.total}`);
console.log(`  Already had price: ${stats.hadPrice}`);
console.log(`  Fixed from WooCommerce: ${stats.fixedFromWoo}`);
console.log(`  Fixed from POS: ${stats.fixedFromPos}`);
console.log(`  Fixed from parent: ${stats.fixedFromParent}`);
console.log(`  Still missing: ${stats.stillMissing}`);
console.log(`\nSKUs generated for variations: ${stats.skusGenerated}`);

const totalFixed = stats.fixedFromWoo + stats.fixedFromPos + stats.fixedFromParent;
const needingFix = stats.total - stats.hadPrice;
const recoveryRate = needingFix > 0 ? ((totalFixed / needingFix) * 100).toFixed(1) : '100';
console.log(`\nRecovery rate: ${recoveryRate}%`);

// Write output
const outputFile = path.join(BASE, 'outputs/woocommerce_import_with_prices.csv');
const outputLines = [
  importHeader.map(escapeCSV).join(','),
  ...fixedRows.map(row => row.map(escapeCSV).join(','))
];

fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
console.log(`\nWrote: ${outputFile}`);

// Validate the output
console.log('\n=== VALIDATION ===\n');
const validationData = fs.readFileSync(outputFile, 'utf-8');
const valLines = validationData.split('\n').filter(l => l.trim());
const valHeader = parseCSVLine(valLines[0]);
const valPriceIdx = valHeader.indexOf('Regular price');
const valTypeIdx = valHeader.indexOf('Type');
const valSkuIdx = valHeader.indexOf('SKU');

let stillMissingPrice = 0;
let stillMissingSku = 0;

for (let i = 1; i < valLines.length; i++) {
  const row = parseCSVLine(valLines[i]);
  const type = row[valTypeIdx];
  const price = row[valPriceIdx]?.trim();
  const sku = row[valSkuIdx]?.trim();
  
  if (type !== 'variable' && !price) stillMissingPrice++;
  if ((type === 'simple' || type === 'variation') && !sku) stillMissingSku++;
}

console.log(`Products still without price: ${stillMissingPrice}`);
console.log(`Products still without SKU: ${stillMissingSku}`);

if (stillMissingPrice === 0 && stillMissingSku === 0) {
  console.log('\n✅ All products have prices and SKUs!');
} else {
  console.log('\n⚠️ Some products still need attention');
}
