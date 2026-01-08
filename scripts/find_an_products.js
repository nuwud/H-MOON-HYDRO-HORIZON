const fs = require('fs');
const csv = fs.readFileSync('outputs/shopify_complete_import.csv', 'utf8');
const lines = csv.split('\n');
const header = lines[0].split(',').map(h => h.replace(/"/g, ''));
const typeIdx = header.indexOf('Type');
const handleIdx = header.indexOf('Handle');
const imgIdx = header.indexOf('Image Src');
const vendorIdx = header.indexOf('Vendor');
const titleIdx = header.indexOf('Title');

// Find Advanced Nutrients products without images
const anProducts = [];
const seen = new Set();
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].match(/(?:^|,)("(?:[^"]+|"")*"|[^,]*)/g);
  if (!cols) continue;
  const clean = cols.map(c => c.replace(/^,?"|"$/g, '').replace(/""/g, '"'));
  const handle = clean[handleIdx] || '';
  const vendor = clean[vendorIdx] || '';
  const image = clean[imgIdx] || '';
  const title = clean[titleIdx] || '';
  
  if (vendor.toLowerCase().includes('advanced') && !image.startsWith('http') && !seen.has(handle)) {
    seen.add(handle);
    anProducts.push({ handle, title: title.slice(0, 60) });
  }
}
console.log('Advanced Nutrients products without images:', anProducts.length);
anProducts.forEach(p => console.log(p.handle + ' -> ' + p.title));
