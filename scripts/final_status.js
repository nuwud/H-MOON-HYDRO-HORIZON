const fs = require('fs');

// Parse CSV properly
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const csvPath = 'outputs/shopify_complete_import.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');
const header = lines[0];
const headerFields = parseCSVLine(header);

const imgSrcIdx = headerFields.findIndex(h => h.toLowerCase().includes('image src'));
const vendorIdx = 3;

const products = new Map();
const withoutImages = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  const handle = fields[0];
  const title = fields[1];
  const vendor = fields[vendorIdx] || 'No Vendor';
  const imgSrc = fields[imgSrcIdx];
  const hasImg = imgSrc && imgSrc.startsWith('http') && !imgSrc.includes('HMH_logo_small');
  
  if (!products.has(handle)) {
    products.set(handle, { handle, title, vendor, hasImage: hasImg, imgSrc: hasImg ? imgSrc : null });
  } else if (hasImg && !products.get(handle).hasImage) {
    products.get(handle).hasImage = true;
    products.get(handle).imgSrc = imgSrc;
  }
}

const all = [...products.values()];
const withImages = all.filter(p => p.hasImage);
const missing = all.filter(p => !p.hasImage);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║              FINAL IMAGE STATUS REPORT                        ║');
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Total unique products:     ${products.size.toString().padStart(5)}                           ║`);
console.log(`║  With images:               ${withImages.length.toString().padStart(5)} (${(withImages.length/products.size*100).toFixed(1)}%)                    ║`);
console.log(`║  Without images:            ${missing.length.toString().padStart(5)} (${(missing.length/products.size*100).toFixed(1)}%)                     ║`);
console.log('╚════════════════════════════════════════════════════════════════╝');

// Group missing by vendor
const byVendor = {};
for (const p of missing) {
  const v = p.vendor || 'No Vendor';
  if (!byVendor[v]) byVendor[v] = [];
  byVendor[v].push(p.handle);
}

console.log('\n=== Missing Images by Vendor ===');
const sorted = Object.entries(byVendor).sort((a,b) => b[1].length - a[1].length);
for (const [vendor, handles] of sorted.slice(0, 15)) {
  console.log(`  ${vendor.padEnd(40)} ${handles.length}`);
}

// Image sources breakdown
const byDomain = {};
for (const p of withImages) {
  try {
    const domain = new URL(p.imgSrc).hostname;
    if (!byDomain[domain]) byDomain[domain] = 0;
    byDomain[domain]++;
  } catch (e) {}
}

console.log('\n=== Image Sources ===');
const domainSorted = Object.entries(byDomain).sort((a,b) => b[1] - a[1]);
for (const [domain, count] of domainSorted) {
  console.log(`  ${domain.padEnd(40)} ${count}`);
}

// Save missing list
fs.writeFileSync('outputs/final_missing_images.json', JSON.stringify(missing.map(p => ({
  handle: p.handle,
  title: p.title,
  vendor: p.vendor
})), null, 2));

console.log(`\nSaved ${missing.length} missing products to outputs/final_missing_images.json`);
