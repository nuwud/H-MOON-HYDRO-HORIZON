const fs = require('fs');
const wooImages = JSON.parse(fs.readFileSync('CSVs/woo_image_map.json', 'utf8'));

// Get product handles from final CSV
const content = fs.readFileSync('CSVs/products_export_final.csv', 'utf8');
const lines = content.split('\n').slice(1);

let matched = 0, notMatched = 0;
const wooHandleSet = new Set(wooImages.map(i => i.handle.toLowerCase()));

for (const line of lines.slice(0, 50)) {
  const handle = line.split(',')[0];
  if (!handle) continue;
  const cleanHandle = handle.replace(/"/g, '').toLowerCase();
  if (!cleanHandle || cleanHandle.startsWith('<')) continue;
  
  if (wooHandleSet.has(cleanHandle)) {
    console.log('OK', cleanHandle);
    matched++;
  } else {
    console.log('XX', cleanHandle);
    notMatched++;
  }
}
console.log('\nMatched:', matched, 'Not matched:', notMatched);
