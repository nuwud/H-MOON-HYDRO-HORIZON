/**
 * Analyze SKU formats across data sources to understand matching requirements
 */

const fs = require('fs');

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

console.log('=== SKU FORMAT ANALYSIS ===\n');

// 1. Check WooCommerce export SKUs
console.log('1. WooCommerce Export (CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv)');
const wooData = fs.readFileSync('CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv', 'utf-8');
const wooLines = wooData.split('\n').filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooPriceIdx = wooHeader.findIndex(h => h.toLowerCase() === 'regular price');
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase() === 'product name');

console.log('   SKU col index:', wooSkuIdx, '| Price col index:', wooPriceIdx);

const wooSKUs = [];
for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const sku = row[wooSkuIdx]?.trim();
  const price = row[wooPriceIdx]?.trim();
  if (sku) {
    wooSKUs.push({ sku, price, name: row[wooNameIdx]?.substring(0, 50) });
  }
}

console.log('   Total rows with SKU:', wooSKUs.length);
console.log('\n   Sample WooCommerce SKUs:');
wooSKUs.slice(0, 10).forEach(s => {
  console.log(`     SKU: "${s.sku}" | Price: ${s.price || 'N/A'} | ${s.name}`);
});

// 2. Check POS inventory SKUs
console.log('\n2. POS Inventory (CSVs/HMoonHydro_Inventory.csv)');
const posData = fs.readFileSync('CSVs/HMoonHydro_Inventory.csv', 'utf-8');
const posLines = posData.split('\n').filter(l => l.trim());
const posHeader = parseCSVLine(posLines[0]);

const posSkuIdx = posHeader.findIndex(h => h.toLowerCase().includes('item number'));
const posPriceIdx = posHeader.findIndex(h => h.toLowerCase() === 'regular price');
const posNameIdx = posHeader.findIndex(h => h.toLowerCase().includes('item name'));

console.log('   Item Number col:', posSkuIdx, '| Price col:', posPriceIdx);

const posSKUs = [];
for (let i = 1; i < posLines.length; i++) {
  const row = parseCSVLine(posLines[i]);
  const sku = row[posSkuIdx]?.trim();
  const price = row[posPriceIdx]?.trim();
  if (sku) {
    posSKUs.push({ sku, price, name: row[posNameIdx]?.substring(0, 50) });
  }
}

console.log('   Total rows with Item Number:', posSKUs.length);
console.log('\n   Sample POS Item Numbers:');
posSKUs.slice(0, 10).forEach(s => {
  console.log(`     Item#: "${s.sku}" | Price: ${s.price || 'N/A'} | ${s.name}`);
});

// 3. Check Import file SKUs
console.log('\n3. Import File (outputs/woocommerce_import_ready.csv)');
const impData = fs.readFileSync('outputs/woocommerce_import_ready.csv', 'utf-8');
const impLines = impData.split('\n').filter(l => l.trim());
const impHeader = parseCSVLine(impLines[0]);

const impSkuIdx = impHeader.indexOf('SKU');
const impTypeIdx = impHeader.indexOf('Type');
const impPriceIdx = impHeader.indexOf('Regular price');
const impNameIdx = impHeader.indexOf('Name');

console.log('   SKU col:', impSkuIdx, '| Type col:', impTypeIdx, '| Price col:', impPriceIdx);

const impSKUs = [];
let variationsNeedingPrice = [];
for (let i = 1; i < impLines.length; i++) {
  const row = parseCSVLine(impLines[i]);
  const sku = row[impSkuIdx]?.trim();
  const type = row[impTypeIdx]?.trim();
  const price = row[impPriceIdx]?.trim();
  const name = row[impNameIdx]?.trim();
  
  if (sku) {
    impSKUs.push({ sku, type, price, name: name?.substring(0, 50) });
  }
  
  if (type === 'variation' && !price) {
    variationsNeedingPrice.push({ sku, name });
  }
}

console.log('   Total rows with SKU:', impSKUs.length);
console.log('\n   Sample Import SKUs:');
impSKUs.slice(0, 15).forEach(s => {
  console.log(`     SKU: "${s.sku}" [${s.type}] | Price: ${s.price || 'MISSING'} | ${s.name}`);
});

// 4. Analyze cross-matching potential
console.log('\n\n=== SKU MATCHING ANALYSIS ===\n');

const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Build lookup maps
const wooMap = new Map(wooSKUs.map(s => [normalize(s.sku), s]));
const posMap = new Map(posSKUs.map(s => [normalize(s.sku), s]));

// Check how many import SKUs match
let wooMatches = 0;
let posMatches = 0;
let noMatches = 0;
const unmatchedSamples = [];

for (const imp of impSKUs) {
  const normSku = normalize(imp.sku);
  if (wooMap.has(normSku)) {
    wooMatches++;
  } else if (posMap.has(normSku)) {
    posMatches++;
  } else {
    noMatches++;
    if (unmatchedSamples.length < 10) {
      unmatchedSamples.push(imp);
    }
  }
}

console.log('Import SKUs matching WooCommerce:', wooMatches);
console.log('Import SKUs matching POS (not in Woo):', posMatches);
console.log('Import SKUs with no match:', noMatches);

console.log('\n   Sample unmatched import SKUs:');
unmatchedSamples.forEach(s => {
  console.log(`     "${s.sku}" [${s.type}] - ${s.name}`);
});

// 5. Check for alternate ID in source
console.log('\n\n=== CHECKING SOURCE DATA FOR ALTERNATE IDs ===\n');
const srcData = fs.readFileSync('outputs/shopify_complete_import_enriched.csv', 'utf-8');
const srcLines = srcData.split('\n').filter(l => l.trim());
const srcHeader = parseCSVLine(srcLines[0]);

console.log('Source columns that might contain matching IDs:');
srcHeader.forEach((h, i) => {
  const lh = h.toLowerCase();
  if (lh.includes('sku') || lh.includes('id') || lh.includes('code') || lh.includes('item') || lh.includes('variant')) {
    console.log(`   Col ${i}: "${h}"`);
  }
});

// Check variations needing prices for matching potential
console.log('\n\nVariations needing prices:', variationsNeedingPrice.length);
console.log('Sample variations without price:');
variationsNeedingPrice.slice(0, 10).forEach(v => {
  console.log(`   SKU: "${v.sku}" | Name: ${v.name?.substring(0, 60) || '(no name)'}`);
});
