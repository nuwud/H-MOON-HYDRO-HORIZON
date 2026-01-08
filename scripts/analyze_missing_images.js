/**
 * Analyze products missing images - grouped by vendor
 */
const fs = require('fs');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else { current += char; }
  }
  result.push(current);
  return result;
}

const csv = fs.readFileSync('outputs/shopify_complete_import.csv', 'utf8');
const lines = csv.split('\n');

const header = parseCSVLine(lines[0]);
const handleIdx = header.indexOf('Handle');
const imgIdx = header.indexOf('Image Src');
const titleIdx = header.indexOf('Title');
const vendorIdx = header.indexOf('Vendor');

const missingByVendor = {};
const withImageByVendor = {};
const seen = new Set();

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = parseCSVLine(lines[i]);
  const handle = cols[handleIdx] || '';
  const img = cols[imgIdx] || '';
  const title = cols[titleIdx] || '';
  const vendor = cols[vendorIdx] || 'Unknown';
  
  if (seen.has(handle)) continue;
  seen.add(handle);
  
  if (!img.startsWith('http')) {
    if (!missingByVendor[vendor]) missingByVendor[vendor] = [];
    missingByVendor[vendor].push({ handle, title: title.slice(0, 60) });
  } else {
    if (!withImageByVendor[vendor]) withImageByVendor[vendor] = 0;
    withImageByVendor[vendor]++;
  }
}

// Show top vendors with missing images
const sorted = Object.entries(missingByVendor).sort((a, b) => b[1].length - a[1].length);
console.log('=== Products Missing Images by Vendor ===\n');

let totalMissing = 0;
sorted.slice(0, 20).forEach(([vendor, products]) => {
  const withImg = withImageByVendor[vendor] || 0;
  const total = products.length + withImg;
  const pct = Math.round((withImg / total) * 100);
  console.log(`${vendor}: ${products.length} missing / ${total} total (${pct}% have images)`);
  products.slice(0, 8).forEach(p => console.log(`  - ${p.handle}`));
  totalMissing += products.length;
  console.log('');
});

console.log(`\nTotal unique products missing images: ${totalMissing}`);
console.log(`Total unique products with images: ${Object.values(withImageByVendor).reduce((a, b) => a + b, 0)}`);
