const fs = require('fs');

function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++; }
        else { inQuotes = false; }
      } else { currentField += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { currentField += char; }
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

const c = fs.readFileSync('./outputs/shopify_final_fixed.csv', 'utf-8');
const rows = parseCSV(c);
const h = rows[0];

const idx = {
  handle: h.indexOf('Handle'),
  title: h.indexOf('Title'),
  body: h.indexOf('Body (HTML)'),
  type: h.indexOf('Type'),
  img: h.indexOf('Image Src'),
  weight: h.indexOf('Variant Grams'),
  sku: h.indexOf('Variant SKU')
};

const handles = new Set();
let stats = { total: 0, withBody: 0, withType: 0, withImg: 0, withWeight: 0, cdnOk: 0 };

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const handle = r[idx.handle];
  if (!handles.has(handle)) {
    handles.add(handle);
    stats.total++;
    if (r[idx.body] && r[idx.body].length > 50) stats.withBody++;
    if (r[idx.type]) stats.withType++;
    if (r[idx.img]) stats.withImg++;
    if (r[idx.img] && r[idx.img].includes('cdn.shopify.com/s/files/1/0672/5730/3114')) stats.cdnOk++;
    if (parseFloat(r[idx.weight]) > 0) stats.withWeight++;
  }
}

console.log('════════════════════════════════════════════════════════════');
console.log('   COMPLETE VALIDATION - shopify_final_fixed.csv');
console.log('════════════════════════════════════════════════════════════');
console.log('   Total rows:', rows.length - 1);
console.log('   Unique products:', stats.total);
console.log('');
console.log('   PRODUCT-LEVEL COVERAGE:');
console.log('     ✅ Description:', stats.withBody, '/', stats.total, '(' + (stats.withBody/stats.total*100).toFixed(1) + '%)');
console.log('     ✅ Type:', stats.withType, '/', stats.total, '(' + (stats.withType/stats.total*100).toFixed(1) + '%)');
console.log('     ✅ Image:', stats.withImg, '/', stats.total, '(' + (stats.withImg/stats.total*100).toFixed(1) + '%)');
console.log('     ✅ Weight:', stats.withWeight, '/', stats.total, '(' + (stats.withWeight/stats.total*100).toFixed(1) + '%)');
console.log('     ✅ Correct CDN:', stats.cdnOk, '/', stats.total, '(' + (stats.cdnOk/stats.total*100).toFixed(1) + '%)');
console.log('════════════════════════════════════════════════════════════');
