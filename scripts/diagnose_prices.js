/**
 * Diagnose price issues in source and transformed data
 */

const fs = require('fs');
const path = require('path');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

console.log('='.repeat(70));
console.log('PRICE DIAGNOSTIC REPORT');
console.log('='.repeat(70));

// Check source file
const sourcePath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import_enriched.csv');
const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
const sourceLines = sourceContent.split('\n').filter(l => l.trim());
const sourceHeaders = parseCSVLine(sourceLines[0]);

const priceIdx = sourceHeaders.indexOf('Variant Price');
const compareIdx = sourceHeaders.indexOf('Variant Compare At Price');
const titleIdx = sourceHeaders.indexOf('Title');
const handleIdx = sourceHeaders.indexOf('Handle');

console.log('\nSOURCE FILE: shopify_complete_import_enriched.csv');
console.log('-'.repeat(50));
console.log('Total rows:', sourceLines.length - 1);
console.log('Price column index:', priceIdx);
console.log('Compare At Price column index:', compareIdx);

// Count source prices
let sourceWithPrice = 0;
let sourceWithoutPrice = 0;
const sourceMissingPrices = [];

for (let i = 1; i < sourceLines.length; i++) {
  const v = parseCSVLine(sourceLines[i]);
  const price = v[priceIdx] || '';
  const title = v[titleIdx] || '';
  const handle = v[handleIdx] || '';
  
  if (price && price !== '0' && price !== '0.00') {
    sourceWithPrice++;
  } else {
    sourceWithoutPrice++;
    if (sourceMissingPrices.length < 20) {
      sourceMissingPrices.push({
        row: i + 1,
        handle,
        title: title.substring(0, 40),
        isVariant: !title // No title = variant row
      });
    }
  }
}

console.log('Rows WITH price:', sourceWithPrice);
console.log('Rows WITHOUT price:', sourceWithoutPrice);

console.log('\nSource rows missing prices (first 20):');
sourceMissingPrices.forEach(p => {
  console.log(`  Row ${p.row}: ${p.title || '[variant of ' + p.handle + ']'}`);
});

// Now check what WooCommerce needs
console.log('\n');
console.log('='.repeat(70));
console.log('WOOCOMMERCE PRICE REQUIREMENTS');
console.log('='.repeat(70));
console.log('');
console.log('Product Type       | Needs Price?');
console.log('-'.repeat(40));
console.log('simple             | YES - required');
console.log('variable (parent)  | NO - price comes from variations');
console.log('variation (child)  | YES - required');
console.log('');

// Check transformed file
const transformedPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');
const transformedContent = fs.readFileSync(transformedPath, 'utf-8');
const transformedLines = transformedContent.split('\n').filter(l => l.trim());
const transformedHeaders = parseCSVLine(transformedLines[0]);

const wooTypeIdx = transformedHeaders.indexOf('Type');
const wooPriceIdx = transformedHeaders.indexOf('Regular price');
const wooNameIdx = transformedHeaders.indexOf('Name');
const wooSkuIdx = transformedHeaders.indexOf('SKU');

console.log('TRANSFORMED FILE: woocommerce_import_ready.csv');
console.log('-'.repeat(50));

let simpleTotal = 0, simpleWithPrice = 0;
let variableTotal = 0;
let variationTotal = 0, variationWithPrice = 0;
const variationsMissingPrice = [];

for (let i = 1; i < transformedLines.length; i++) {
  const v = parseCSVLine(transformedLines[i]);
  const type = v[wooTypeIdx] || '';
  const price = v[wooPriceIdx] || '';
  const name = v[wooNameIdx] || '';
  const sku = v[wooSkuIdx] || '';
  
  if (type === 'simple') {
    simpleTotal++;
    if (price) simpleWithPrice++;
  } else if (type === 'variable') {
    variableTotal++;
  } else if (type === 'variation') {
    variationTotal++;
    if (price) {
      variationWithPrice++;
    } else {
      if (variationsMissingPrice.length < 30) {
        variationsMissingPrice.push({ row: i + 1, sku, name });
      }
    }
  }
}

console.log('');
console.log('Simple products:   ', simpleTotal, 'with price:', simpleWithPrice, '(' + ((simpleWithPrice/simpleTotal)*100).toFixed(1) + '%)');
console.log('Variable products: ', variableTotal, '(price not required)');
console.log('Variations:        ', variationTotal, 'with price:', variationWithPrice, '(' + ((variationWithPrice/variationTotal)*100).toFixed(1) + '%)');

console.log('');
console.log('VARIATIONS MISSING PRICES (first 30):');
variationsMissingPrice.forEach(p => {
  console.log(`  Row ${p.row}: SKU=${p.sku || 'none'}`);
});

// Solution
console.log('');
console.log('='.repeat(70));
console.log('ROOT CAUSE ANALYSIS');
console.log('='.repeat(70));
console.log('');
console.log('The source data (shopify_complete_import_enriched.csv) has', sourceWithoutPrice, 'rows');
console.log('without prices. These are the rows causing the missing price issue.');
console.log('');
console.log('OPTIONS TO FIX:');
console.log('1. Find prices from another source (POS, WooCommerce export, manufacturer)');
console.log('2. Set a placeholder price ($0.01) and mark for review');
console.log('3. Remove products without prices from import');
console.log('');
