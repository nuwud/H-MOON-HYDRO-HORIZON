const fs = require('fs');

// Sample from woo_all_image_urls.json
const woo = JSON.parse(fs.readFileSync('outputs/woo_all_image_urls.json', 'utf8'));
console.log('Sample WooCommerce URL keys:');
Object.keys(woo).slice(0, 10).forEach(k => console.log('  ' + k));

// Sample from image_matches.json
const matches = JSON.parse(fs.readFileSync('outputs/image_matches.json', 'utf8'));
console.log('\nSample fuzzy match keys:');
Object.keys(matches).slice(0, 10).forEach(k => console.log('  ' + k));

// Sample missing products from CSV
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
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

const lines = fs.readFileSync('outputs/woocommerce_import_ready.csv', 'utf8').split('\n');
const headers = parseCSVLine(lines[0]);
const nameIdx = headers.indexOf('Name');
const imgIdx = headers.indexOf('Images');
const skuIdx = headers.indexOf('SKU');

console.log('\nSample missing product names (first 15):');
let count = 0;
for (let i = 1; i < lines.length && count < 15; i++) {
  if (!lines[i].trim()) continue;
  const row = parseCSVLine(lines[i]);
  const img = row[imgIdx];
  if (!img || !img.trim()) {
    const name = row[nameIdx];
    const sku = row[skuIdx];
    console.log('  Name: ' + (name || '').substring(0, 45));
    console.log('  SKU:  ' + sku);
    const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    console.log('  Slug: ' + slug);
    
    // Check if any WooCommerce key contains this
    const matching = Object.keys(woo).filter(k => {
      const kNorm = k.toLowerCase();
      const slugParts = slug.split('-').filter(p => p.length > 3);
      return slugParts.some(p => kNorm.includes(p));
    });
    if (matching.length > 0) {
      console.log('  Potential matches: ' + matching.slice(0, 3).join(', '));
    }
    console.log('');
    count++;
  }
}
