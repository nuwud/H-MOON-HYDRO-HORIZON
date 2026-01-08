/**
 * Fix Broken Image URLs in CSV
 * 
 * Replaces known broken URLs with working alternatives
 */

const fs = require('fs');
const path = require('path');

// Broken URLs -> Working replacements
const URL_FIXES = {
  // Fox Farm - old 2019 URLs no longer work
  'https://foxfarm.com/wp-content/uploads/2019/02/ph-up-qt.png': null, // Remove - no replacement found
  'https://foxfarm.com/wp-content/uploads/2019/02/ph-down-qt.png': null, // Remove
  'https://foxfarm.com/wp-content/uploads/2019/02/beastiebloomz.png': 'https://foxfarm.com/wp-content/uploads/2023/11/BeastieBloomz-6OZ-1125x1500-round2.png',
  'https://foxfarm.com/wp-content/uploads/2019/02/flowerskiss-qt.png': null, // Product discontinued
  'https://foxfarm.com/wp-content/uploads/2019/02/kangaroots-qt.png': null, // Product discontinued
  'https://foxfarm.com/wp-content/uploads/2019/02/sledgehammer-qt.png': null, // Product discontinued
  
  // General Hydroponics - old URL pattern
  'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_Floralicious_Plus-new-quart-1600x1600.png': 'https://generalhydroponics.com/wp-content/uploads/General-Hydroponics_product_floralicious-plus-1pint-1600x1600.png',
};

const csvPath = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const outputPath = path.join(__dirname, '../outputs/shopify_complete_import_fixed.csv');

console.log('Reading CSV...');
let content = fs.readFileSync(csvPath, 'utf8');

let fixCount = 0;
let removeCount = 0;

for (const [brokenUrl, fixedUrl] of Object.entries(URL_FIXES)) {
  const regex = new RegExp(brokenUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const matches = content.match(regex);
  
  if (matches) {
    if (fixedUrl) {
      content = content.replace(regex, fixedUrl);
      console.log(`✅ Fixed: ${brokenUrl.split('/').pop()} -> ${fixedUrl.split('/').pop()} (${matches.length} occurrences)`);
      fixCount += matches.length;
    } else {
      content = content.replace(regex, '');
      console.log(`🗑️ Removed: ${brokenUrl.split('/').pop()} (${matches.length} occurrences)`);
      removeCount += matches.length;
    }
  }
}

fs.writeFileSync(outputPath, content);
fs.copyFileSync(outputPath, csvPath);

console.log(`\nTotal fixes: ${fixCount}`);
console.log(`Total removals: ${removeCount}`);
console.log(`Updated: ${csvPath}`);
