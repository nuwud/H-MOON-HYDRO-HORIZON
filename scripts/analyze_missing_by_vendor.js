/**
 * Analyze products still missing images by vendor
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
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

const csv = fs.readFileSync('outputs/shopify_complete_import.csv', 'utf-8').split('\n');
const header = parseCSVLine(csv[0]);
const handleIdx = header.indexOf('Handle');
const imgIdx = header.indexOf('Image Src');
const vendorIdx = header.indexOf('Vendor');
const titleIdx = header.indexOf('Title');

const byVendor = {};
const seen = new Set();
const missingProducts = [];

csv.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  const handle = cols[handleIdx];
  if (seen.has(handle)) return;
  seen.add(handle);
  
  const vendor = cols[vendorIdx] || 'Unknown';
  const title = cols[titleIdx] || '';
  const hasImg = (cols[imgIdx] || '').startsWith('http');
  
  if (!byVendor[vendor]) {
    byVendor[vendor] = { with: 0, without: 0, products: [] };
  }
  if (hasImg) {
    byVendor[vendor].with++;
  } else {
    byVendor[vendor].without++;
    byVendor[vendor].products.push({ handle, title });
    missingProducts.push({ vendor, handle, title });
  }
});

// Sort by products without images
const sorted = Object.entries(byVendor)
  .map(([vendor, counts]) => ({
    vendor,
    without: counts.without,
    with: counts.with,
    total: counts.with + counts.without,
    coverage: (counts.with / (counts.with + counts.without) * 100).toFixed(0) + '%',
    products: counts.products
  }))
  .sort((a, b) => b.without - a.without);

console.log('=== Products Still Missing Images by Vendor ===\n');
console.log('Vendor                               | Missing | Total | Coverage');
console.log('-'.repeat(65));
sorted.slice(0, 20).forEach(v => {
  const name = v.vendor.slice(0, 35).padEnd(36);
  console.log(`${name}| ${String(v.without).padStart(7)} | ${String(v.total).padStart(5)} | ${v.coverage}`);
});

console.log('\nTotal vendors:', sorted.length);
console.log('Total missing:', sorted.reduce((sum, v) => sum + v.without, 0));

// Show sample products from top vendors with missing images
console.log('\n=== Sample Missing Products by Top Vendors ===\n');
sorted.slice(0, 5).forEach(v => {
  console.log(`\n${v.vendor} (${v.without} missing):`);
  v.products.slice(0, 5).forEach(p => {
    console.log(`  - ${p.handle}: "${p.title.slice(0, 50)}"`);
  });
});

// Save full list
fs.writeFileSync('outputs/missing_images_by_vendor.json', JSON.stringify(sorted, null, 2));
console.log('\nFull list saved to outputs/missing_images_by_vendor.json');
