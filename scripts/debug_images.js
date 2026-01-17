// Debug image matching
const fs = require('fs');
const content = fs.readFileSync('CSVs/products_export_1_cleaned.csv', 'utf8');
const lines = content.split('\n');
const imageMap = JSON.parse(fs.readFileSync('CSVs/woo_image_map.json', 'utf8'));
const wooHandles = new Set(imageMap.map(i => i.handle));

// Get first 10 product handles from CSV that need images
let count = 0;
for (let i = 1; i < lines.length && count < 10; i++) {
  const cols = lines[i].split(',');
  const handle = cols[0]?.replace(/"/g, '');
  const image = cols[32]?.replace(/"/g, '');
  if (handle && (!image || image.length < 10)) {
    console.log('Need image:', handle);
    console.log('  In woo?', wooHandles.has(handle));
    count++;
  }
}
console.log('\nSample woo handles:');
imageMap.slice(0,5).forEach(i => console.log(' ', i.handle));
