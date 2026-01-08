/**
 * analyzeCSVGaps.js - Find all data gaps in the import CSV
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const content = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const header = parseCSVLine(lines[0]);
const headerMap = {};
header.forEach((h, i) => headerMap[h.trim()] = i);

const products = new Map();
const zeroPriceProducts = [];
const noDescProducts = [];
const noImageProducts = [];
const noSkuProducts = [];
const noWeightProducts = [];
const noVendorProducts = [];

for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  const handle = cols[headerMap['Handle']] || '';
  const title = cols[headerMap['Title']] || '';
  const body = cols[headerMap['Body (HTML)']] || '';
  const vendor = cols[headerMap['Vendor']] || '';
  const price = cols[headerMap['Variant Price']] || '';
  const sku = cols[headerMap['Variant SKU']] || '';
  const image = cols[headerMap['Image Src']] || '';
  const weight = cols[headerMap['Variant Grams']] || '';
  
  const isMainRow = title.trim().length > 0;
  
  if (isMainRow) {
    products.set(handle, { 
      title, 
      body, 
      vendor,
      hasImage: !!image.trim(),
      variants: [],
      line: i
    });
  }
  
  // Track variant data
  const priceNum = parseFloat(price) || 0;
  const weightNum = parseFloat(weight) || 0;
  if (products.has(handle)) {
    products.get(handle).variants.push({ 
      price: priceNum, 
      sku: sku.trim(), 
      weight: weightNum,
      line: i 
    });
  }
}

// Analyze gaps
for (const [handle, p] of products) {
  const hasValidPrice = p.variants.some(v => v.price > 0);
  const hasDesc = p.body.trim().length > 50;
  const hasAllSkus = p.variants.every(v => v.sku);
  const hasWeight = p.variants.some(v => v.weight > 0);
  const hasVendor = p.vendor.trim() && p.vendor !== 'Unknown';
  
  if (!hasValidPrice) {
    zeroPriceProducts.push({ handle, title: p.title, vendor: p.vendor, line: p.line });
  }
  if (!hasDesc) {
    noDescProducts.push({ handle, title: p.title, vendor: p.vendor });
  }
  if (!p.hasImage) {
    noImageProducts.push({ handle, title: p.title, vendor: p.vendor });
  }
  if (!hasAllSkus) {
    noSkuProducts.push({ handle, title: p.title, variantCount: p.variants.length });
  }
  if (!hasWeight) {
    noWeightProducts.push({ handle, title: p.title, vendor: p.vendor });
  }
  if (!hasVendor) {
    noVendorProducts.push({ handle, title: p.title });
  }
}

console.log('═'.repeat(70));
console.log('           CSV DATA GAP ANALYSIS');
console.log('═'.repeat(70));
console.log(`Total products: ${products.size}`);
console.log('');

console.log('─'.repeat(70));
console.log('CRITICAL GAPS (blocks import or usability)');
console.log('─'.repeat(70));
console.log(`❌ Products with ZERO PRICE: ${zeroPriceProducts.length}`);
console.log(`❌ Products missing ALL variant SKUs: ${noSkuProducts.length}`);

console.log('');
console.log('─'.repeat(70));
console.log('QUALITY GAPS (affects SEO and customer experience)');
console.log('─'.repeat(70));
console.log(`⚠️  Products without description: ${noDescProducts.length}`);
console.log(`⚠️  Products without images: ${noImageProducts.length}`);
console.log(`⚠️  Products without weight: ${noWeightProducts.length}`);
console.log(`⚠️  Products without vendor: ${noVendorProducts.length}`);

// Group zero-price by vendor
console.log('');
console.log('─'.repeat(70));
console.log('ZERO PRICE PRODUCTS BY VENDOR');
console.log('─'.repeat(70));
const byVendor = {};
zeroPriceProducts.forEach(p => {
  const v = p.vendor || '(empty)';
  byVendor[v] = (byVendor[v] || 0) + 1;
});
Object.entries(byVendor).sort((a,b) => b[1]-a[1]).forEach(([v,c]) => {
  console.log(`  ${v}: ${c}`);
});

// Sample zero-price products
console.log('');
console.log('─'.repeat(70));
console.log('SAMPLE ZERO PRICE PRODUCTS');
console.log('─'.repeat(70));
zeroPriceProducts.slice(0, 30).forEach(p => {
  console.log(`  ${p.handle}`);
  console.log(`    Title: ${p.title.slice(0, 50)}`);
});

// Check source data for these products
console.log('');
console.log('─'.repeat(70));
console.log('CHECKING SOURCE DATA FOR ZERO-PRICE PRODUCTS');
console.log('─'.repeat(70));

const masterPath = path.join(__dirname, '../outputs/master_products.json');
if (fs.existsSync(masterPath)) {
  const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  const masterByHandle = new Map(masterData.map(p => [p.handle, p]));
  
  let foundInSource = 0;
  let hasPriceInSource = 0;
  
  for (const zp of zeroPriceProducts.slice(0, 10)) {
    const source = masterByHandle.get(zp.handle);
    if (source) {
      foundInSource++;
      const sourcePrice = source.variants?.[0]?.price;
      if (sourcePrice && sourcePrice > 0) {
        hasPriceInSource++;
        console.log(`  ${zp.handle}: Source has price $${sourcePrice}`);
      } else {
        console.log(`  ${zp.handle}: Source also has no price`);
      }
    } else {
      console.log(`  ${zp.handle}: NOT FOUND in source`);
    }
  }
  
  console.log(`\n  Found in source: ${foundInSource}/10`);
  console.log(`  Has price in source: ${hasPriceInSource}/10`);
}

// Output for fixing
console.log('');
console.log('═'.repeat(70));
console.log('EXPORT LISTS FOR FIXING');
console.log('═'.repeat(70));

// Save zero-price handles for investigation
const zeroPriceHandles = zeroPriceProducts.map(p => p.handle);
fs.writeFileSync(
  path.join(__dirname, '../outputs/zero_price_handles.json'),
  JSON.stringify(zeroPriceHandles, null, 2)
);
console.log(`Saved ${zeroPriceHandles.length} zero-price handles to outputs/zero_price_handles.json`);

// Save no-description handles
const noDescHandles = noDescProducts.map(p => ({ handle: p.handle, vendor: p.vendor }));
fs.writeFileSync(
  path.join(__dirname, '../outputs/no_description_handles.json'),
  JSON.stringify(noDescHandles, null, 2)
);
console.log(`Saved ${noDescHandles.length} no-description handles to outputs/no_description_handles.json`);
