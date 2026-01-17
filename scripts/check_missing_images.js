const fs = require('fs');
const wooImages = JSON.parse(fs.readFileSync('CSVs/woo_image_map.json', 'utf8'));
const wooHandleMap = {};
for (const item of wooImages) {
  wooHandleMap[item.handle.toLowerCase()] = item.imageUrl;
}

const content = fs.readFileSync('CSVs/products_export_final.csv', 'utf8');
const lines = content.split('\n').slice(1);

let noImage = 0, canMatch = 0, cantMatch = 0;
const canMatchList = [];
const cantMatchList = [];

for (const line of lines) {
  const parts = line.split(',');
  const handle = parts[0] ? parts[0].replace(/""/g, '"').replace(/^"|"$/g, '').toLowerCase() : '';
  const imgSrc = parts[32] || '';
  
  if (handle.length < 3 || handle.startsWith('<')) continue;
  
  // Check if no image
  if (imgSrc.length < 10) {
    noImage++;
    if (wooHandleMap[handle]) {
      canMatch++;
      canMatchList.push({ handle, wooImg: wooHandleMap[handle] });
    } else {
      cantMatch++;
      cantMatchList.push(handle);
    }
  }
}
console.log('Products missing images:', noImage);
console.log('Can match from WooCommerce:', canMatch);
console.log('Cannot match:', cantMatch);

console.log('\nFirst 10 matchable:');
canMatchList.slice(0, 10).forEach(m => console.log(' ', m.handle));

console.log('\nFirst 10 unmatchable:');
cantMatchList.slice(0, 10).forEach(h => console.log(' ', h));
