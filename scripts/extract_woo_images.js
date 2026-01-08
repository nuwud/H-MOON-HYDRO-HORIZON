const fs = require('fs');
const path = require('path');

// Parse CSV with proper quote handling
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

// Read WooCommerce export
const wooPath = 'CSVs/Products-Export-2025-Oct-29-171532.csv';
const wooContent = fs.readFileSync(wooPath, 'utf8');
const wooLines = wooContent.split('\n');
const wooHeader = parseCSVLine(wooLines[0]);

// Find relevant column indices
const slugIdx = wooHeader.findIndex(h => h.toLowerCase() === 'slug');
const titleIdx = wooHeader.findIndex(h => h.toLowerCase() === 'title');
const imageUrlIdx = wooHeader.findIndex(h => h === 'Image URL');
const imagesFilenameIdx = wooHeader.findIndex(h => h === 'Images Filename');
const imagesPathIdx = wooHeader.findIndex(h => h === 'Images Path');

console.log('WooCommerce columns:');
console.log(`  Slug: ${slugIdx}`);
console.log(`  Title: ${titleIdx}`);
console.log(`  Image URL: ${imageUrlIdx}`);
console.log(`  Images Filename: ${imagesFilenameIdx}`);
console.log(`  Images Path: ${imagesPathIdx}`);
console.log('');

// Build mapping of slug/title to image
const wooImageMap = new Map();

for (let i = 1; i < wooLines.length; i++) {
  const line = wooLines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  const slug = fields[slugIdx]?.toLowerCase() || '';
  const title = fields[titleIdx] || '';
  const imageUrl = fields[imageUrlIdx] || '';
  const imageFilename = fields[imagesFilenameIdx] || '';
  const imagePath = fields[imagesPathIdx] || '';
  
  if (slug && (imageUrl || imageFilename)) {
    wooImageMap.set(slug, {
      slug,
      title,
      imageUrl,
      imageFilename,
      imagePath,
    });
  }
}

console.log(`WooCommerce products with images: ${wooImageMap.size}`);

// Read the still-missing products
const missingProducts = JSON.parse(fs.readFileSync('outputs/still_missing_images.json', 'utf8'));
console.log(`Products missing images: ${missingProducts.length}`);
console.log('');

// Try to match
const matches = [];
const stillMissing = [];

for (const p of missingProducts) {
  const wooData = wooImageMap.get(p.handle);
  
  if (wooData && (wooData.imageUrl || wooData.imageFilename)) {
    matches.push({
      handle: p.handle,
      title: p.title,
      wooImageUrl: wooData.imageUrl,
      wooFilename: wooData.imageFilename,
      wooPath: wooData.imagePath,
    });
  } else {
    stillMissing.push(p);
  }
}

console.log(`=== Results ===`);
console.log(`Matched from WooCommerce: ${matches.length}`);
console.log(`Still missing: ${stillMissing.length}`);
console.log('');

console.log('=== Sample Matches ===');
matches.slice(0, 20).forEach(m => {
  const img = m.wooImageUrl || m.wooFilename || m.wooPath;
  console.log(`${m.handle} → ${img.substring(0, 60)}`);
});

// Save the matches
fs.writeFileSync('outputs/woo_image_matches_v2.json', JSON.stringify(matches, null, 2));
console.log(`\nSaved ${matches.length} matches to outputs/woo_image_matches_v2.json`);

// Check how many have usable URLs vs just filenames
const withUrl = matches.filter(m => m.wooImageUrl && m.wooImageUrl.startsWith('http'));
const withFilename = matches.filter(m => m.wooFilename && !m.wooImageUrl?.startsWith('http'));

console.log(`\n  With direct URL: ${withUrl.length}`);
console.log(`  With filename only: ${withFilename.length}`);
