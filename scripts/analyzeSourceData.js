/**
 * analyzeSourceData.js - Check master_products.json for price/SKU issues
 */
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../outputs/master_products.json'), 'utf-8'));

let withPrice = 0, withSku = 0, totalVariants = 0;
let badSkus = [];
let zeroPrice = [];

for (const p of data) {
  for (const v of (p.variants || [])) {
    totalVariants++;
    if (v.price && v.price > 0) withPrice++;
    if (v.sku && v.sku.trim() && !v.sku.includes('From these sources')) withSku++;
    
    if (v.sku === 'From these sources') {
      badSkus.push({ handle: p.handle, sku: v.sku });
    }
    if (!v.price || v.price === 0) {
      if (zeroPrice.length < 15) {
        zeroPrice.push({ 
          handle: p.handle, 
          title: p.title?.slice(0, 40), 
          price: v.price, 
          sku: v.sku,
          option1: v.option1
        });
      }
    }
  }
}

console.log('═'.repeat(60));
console.log('SOURCE DATA ANALYSIS');
console.log('═'.repeat(60));
console.log(`Total variants: ${totalVariants}`);
console.log(`With valid price: ${withPrice} (${(100*withPrice/totalVariants).toFixed(1)}%)`);
console.log(`With valid SKU: ${withSku} (${(100*withSku/totalVariants).toFixed(1)}%)`);
console.log();
console.log(`Bad SKU "From these sources": ${badSkus.length}`);
badSkus.forEach(x => console.log('  ', x.handle));
console.log();
console.log('Sample zero/empty price:');
zeroPrice.forEach(x => console.log(`  ${x.handle} (${x.option1}) - price: ${x.price}, sku: ${x.sku}`));

// Check the "new millenium" issue
console.log('\n' + '─'.repeat(60));
console.log('SEARCHING FOR PROBLEMATIC PRODUCTS');
console.log('─'.repeat(60));

const problems = data.filter(p => 
  p.title?.includes('New Millenium') || 
  p.handle?.includes('new-millenium') ||
  p.title?.includes('Atami') ||
  p.title?.match(/^\.\s/)
);

console.log(`Found ${problems.length} potentially problematic products:`);
problems.slice(0, 10).forEach(p => {
  console.log(`  Handle: ${p.handle}`);
  console.log(`    Title: ${p.title?.slice(0, 60)}`);
  console.log(`    Variants: ${p.variants?.length}`);
});
