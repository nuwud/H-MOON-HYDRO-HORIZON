/**
 * Analyze source data parent-child structure for variations
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

const data = fs.readFileSync('outputs/shopify_complete_import_enriched.csv', 'utf-8');
const lines = data.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

const handleIdx = header.indexOf('Handle');
const titleIdx = header.indexOf('Title');
const opt1Idx = header.indexOf('Option1 Value');
const varSkuIdx = header.indexOf('Variant SKU');
const varPriceIdx = header.indexOf('Variant Price');

console.log('Handle col:', handleIdx);
console.log('Title col:', titleIdx);
console.log('Variant SKU col:', varSkuIdx);
console.log('Variant Price col:', varPriceIdx);

// Analyze variations without prices
let parentInfo = {};
let variationsWithoutPrice = [];
let totalVariations = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const handle = row[handleIdx] || '';
  const title = row[titleIdx] || '';
  const opt1 = row[opt1Idx] || '';
  const varSku = row[varSkuIdx] || '';
  const varPrice = row[varPriceIdx] || '';
  
  // If has title, it's a parent row - store info
  if (title) {
    parentInfo[handle] = { title, handle, sku: varSku, price: varPrice };
  } else if (handle in parentInfo) {
    // This is a variant row
    totalVariations++;
    if (!varPrice) {
      const parent = parentInfo[handle];
      variationsWithoutPrice.push({
        handle,
        parentTitle: parent.title,
        parentSku: parent.sku,
        parentPrice: parent.price,
        opt1,
        varSku,
      });
    }
  }
}

console.log('\n=== VARIATION ANALYSIS ===\n');
console.log('Total variations:', totalVariations);
console.log('Variations without price:', variationsWithoutPrice.length);

console.log('\nSample variations missing prices (with parent info):');
variationsWithoutPrice.slice(0, 20).forEach(v => {
  console.log(`  Parent: "${v.parentTitle.substring(0, 40)}" (SKU: ${v.parentSku}) [Parent price: ${v.parentPrice}]`);
  console.log(`    -> Variant: Option="${v.opt1}" SKU="${v.varSku}"`);
});

// Check if parent prices are available to inherit
let canInheritPrice = 0;
let noParentPrice = 0;

for (const v of variationsWithoutPrice) {
  if (v.parentPrice) {
    canInheritPrice++;
  } else {
    noParentPrice++;
  }
}

console.log('\n=== PRICE INHERITANCE POTENTIAL ===\n');
console.log('Can inherit parent price:', canInheritPrice);
console.log('Parent has no price either:', noParentPrice);

if (noParentPrice > 0) {
  console.log('\nSample variations where parent also has no price:');
  variationsWithoutPrice.filter(v => !v.parentPrice).slice(0, 10).forEach(v => {
    console.log(`  "${v.parentTitle.substring(0, 50)}" Handle: ${v.handle}`);
  });
}
