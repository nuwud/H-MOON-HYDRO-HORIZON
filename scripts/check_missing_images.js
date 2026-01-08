const fs = require('fs');
const path = require('path');

// Products missing images that we identified with known brands
const BRAND_PRODUCT_FIXES = {
  // Fox Farm - use local WooCommerce images
  'foxfarm-kangaroots': 'https://hmoonhydro.com/wp-content/uploads/2019/08/kangaroots-package.png',
  'foxfarm-sledge-hammer': 'https://hmoonhydro.com/wp-content/uploads/2019/08/sledgehammer-package.png',
  'fox-farm-ph-down-liter': 'https://hmoonhydro.com/wp-content/uploads/2019/08/pHdown.jpg',
  
  // FloraFlex - manufacturer website
  'floraflex-stacker': 'https://floraflex.com/cdn/shop/products/FloraFlex-4-Top-Feed-Bundle-Stacker.jpg',
  'floraflex-6-in-potpro-pot': 'https://floraflex.com/cdn/shop/products/FloraFlex-PotPro-6-Inch.jpg',
  'floraflex-8-in-floracap-2-0': 'https://floraflex.com/cdn/shop/products/FloraFlex-FloraCap-2.0-8-Inch.jpg',
  'floraflex-air-bleed-valve-3-4': 'https://floraflex.com/cdn/shop/products/FloraFlex-Air-Bleed-Valve.jpg',
  'floraflex-floraclip-2-0-1-12-pk': 'https://floraflex.com/cdn/shop/products/FloraFlex-FloraClip-2.0.jpg',
  'floraflex-pot-pro-5-g': 'https://floraflex.com/cdn/shop/products/FloraFlex-PotPro-5-Gallon.jpg',
  
  // Grodan - manufacturer website
  'grodan-hugo-6in-x-6in-x-6in-pre-cut-holes': 'https://www.grodan101.com/sites/default/files/products/Hugo_Block.png',
  'grodan-a-ok-starters-1': 'https://www.grodan101.com/sites/default/files/products/A-OK_Starter_Plugs.png',
  'grodan-gro-6-x-6-x-6-hugo': 'https://www.grodan101.com/sites/default/files/products/Hugo_Block.png',
  'grodan-gro-6x6x4-jumbo': 'https://www.grodan101.com/sites/default/files/products/Gro-Block_Improved.png',
  'grodan-growcubes-box': 'https://www.grodan101.com/sites/default/files/products/Grow-Cubes.png',
  'grodan-improved-cubes-24': 'https://www.grodan101.com/sites/default/files/products/Gro-Block_Improved.png',
  
  // Canna - manufacturer website
  'bloom-grease-canna': 'https://www.canna.com/sites/default/files/styles/product_image/public/products/BIO_CANNACURE_1L.png',
  
  // Advanced Nutrients - manufacturer website
  'hammerhead-pk-4-10-lt': 'https://www.advancednutrients.com/wp-content/uploads/2023/06/hammerhead-1l.png',
  
  // Botanicare
  'botanicare-sweet-raw': 'https://botanicare.com/wp-content/uploads/2023/01/Sweet-Raw.png',
  
  // Mammoth
  'mammoth-canncontrol': 'https://mammothmicrobes.com/wp-content/uploads/2022/04/CannControl-Gallon.png',
};

// Read the CSV
const csvPath = 'outputs/shopify_complete_import.csv';
const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.split('\n');
const header = lines[0];

console.log('=== Applying Final Image Fixes ===\n');

let fixCount = 0;
const newLines = [header];

for (let i = 1; i < lines.length; i++) {
  let line = lines[i];
  if (!line.trim()) continue;
  
  // Extract handle
  const handleMatch = line.match(/^"([^"]+)"/);
  if (!handleMatch) {
    newLines.push(line);
    continue;
  }
  
  const handle = handleMatch[1];
  
  // Check if we have a fix for this handle
  if (BRAND_PRODUCT_FIXES[handle]) {
    const newUrl = BRAND_PRODUCT_FIXES[handle];
    
    // Check if line already has this URL
    if (line.includes(newUrl)) {
      newLines.push(line);
      continue;
    }
    
    // Find and replace the image URL position
    // The Image Src field is column 26 (0-indexed 25)
    // Look for the current image URL or placeholder
    const imgMatch = line.match(/,"(https?:\/\/[^"]*HMH_logo_small[^"]*)"/);
    const emptyImgMatch = line.match(/,"","(\d+)?","[^"]*","FALSE"/);
    
    if (imgMatch) {
      line = line.replace(imgMatch[1], newUrl);
      console.log(`✓ Fixed: ${handle}`);
      console.log(`  → ${newUrl}`);
      fixCount++;
    } else {
      // Need to insert the URL - find the right spot
      // This is trickier, log for manual review
      console.log(`! Needs manual fix: ${handle}`);
    }
  }
  
  newLines.push(line);
}

// Write updated CSV
fs.writeFileSync(csvPath, newLines.join('\n'));

console.log(`\n=== Summary ===`);
console.log(`Fixed: ${fixCount} products`);
console.log(`Pending manual review: ${Object.keys(BRAND_PRODUCT_FIXES).length - fixCount}`);

// Verify the fix
console.log('\n=== Verifying Image Status ===');
const verifyLines = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1);
const handles = new Set();
let withImg = 0, withoutImg = 0;

for (const vline of verifyLines) {
  if (!vline.trim()) continue;
  const hm = vline.match(/^"([^"]+)"/);
  if (!hm) continue;
  if (handles.has(hm[1])) continue;
  handles.add(hm[1]);
  
  const hasRealImg = vline.match(/,"(https?:\/\/[^"]+)"/) && 
                     !vline.includes('HMH_logo_small');
  if (hasRealImg) withImg++;
  else withoutImg++;
}

console.log(`Total products: ${handles.size}`);
console.log(`With images: ${withImg} (${(withImg/handles.size*100).toFixed(1)}%)`);
console.log(`Without images: ${withoutImg} (${(withoutImg/handles.size*100).toFixed(1)}%)`);
