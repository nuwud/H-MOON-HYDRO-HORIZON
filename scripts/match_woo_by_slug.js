/**
 * Match Missing Shopify Products with WooCommerce Image URLs - by Slug
 * 
 * Uses slug/handle matching which is more reliable than title matching.
 */

const fs = require('fs');
const path = require('path');

// Parse CSV with proper quote handling
function parseCSVLine(line) {
  const result = [];
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Normalize slug for matching
function normalizeSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/-\d+$/, '') // Remove trailing numbers like -2, -3
    .replace(/[^a-z0-9-]/g, '')
    .trim();
}

// Read Shopify CSV
const shopifyPath = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const wooPath = path.join(__dirname, '../CSVs/Products-Export-2025-Oct-29-171532.csv');

console.log('Reading Shopify CSV...');
const shopifyCSV = fs.readFileSync(shopifyPath, 'utf-8').split('\n');
const shopifyHeader = parseCSVLine(shopifyCSV[0]);
const handleIdx = shopifyHeader.indexOf('Handle');
const titleIdx = shopifyHeader.indexOf('Title');
const imgIdx = shopifyHeader.indexOf('Image Src');

// Find products without images
const missingImages = {};
const seenHandles = new Set();

shopifyCSV.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  const handle = cols[handleIdx];
  const title = cols[titleIdx];
  const img = cols[imgIdx];
  
  if (!seenHandles.has(handle) && !img && handle) {
    const normHandle = normalizeSlug(handle);
    if (!missingImages[normHandle]) {
      missingImages[normHandle] = { handle, title };
    }
    seenHandles.add(handle);
  }
});

console.log(`Found ${Object.keys(missingImages).length} products missing images`);

// Read WooCommerce CSV
console.log('Reading WooCommerce CSV...');
const wooCSV = fs.readFileSync(wooPath, 'utf-8').split('\n');
const wooHeader = parseCSVLine(wooCSV[0]);
const wooTitleIdx = wooHeader.indexOf('Product Name');
const wooImgIdx = wooHeader.indexOf('Image URL');
const wooSlugIdx = wooHeader.indexOf('Slug');

// Build WooCommerce image lookup by slug
const wooImages = {};

wooCSV.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  if (cols.length <= wooSlugIdx) return;
  
  const title = cols[wooTitleIdx] || '';
  const imgUrl = cols[wooImgIdx] || '';
  const slug = cols[wooSlugIdx] || '';
  
  if (slug && imgUrl && imgUrl.includes('http')) {
    const normSlug = normalizeSlug(slug);
    if (!wooImages[normSlug]) {
      wooImages[normSlug] = { title, imgUrl, slug };
    }
  }
});

console.log(`Built WooCommerce lookup with ${Object.keys(wooImages).length} products`);

// Match by normalized slug
const matches = [];
const IMAGE_MAPPINGS = {};

Object.entries(missingImages).forEach(([normHandle, { handle, title }]) => {
  if (wooImages[normHandle]) {
    matches.push({
      handle,
      shopifyTitle: title,
      wooTitle: wooImages[normHandle].title,
      imgUrl: wooImages[normHandle].imgUrl
    });
    IMAGE_MAPPINGS[handle] = wooImages[normHandle].imgUrl;
  }
});

console.log(`\nMatched ${matches.length} products by slug`);

// Output as JS object for apply_external_images.js
console.log('\n=== Add these to IMAGE_MAPPINGS ===\n');
console.log('// WooCommerce matched images');
Object.entries(IMAGE_MAPPINGS).slice(0, 100).forEach(([handle, url]) => {
  console.log(`  '${handle}': '${url}',`);
});

if (Object.keys(IMAGE_MAPPINGS).length > 100) {
  console.log(`  // ... and ${Object.keys(IMAGE_MAPPINGS).length - 100} more`);
}

// Save to JSON
fs.writeFileSync(
  path.join(__dirname, '../outputs/woo_slug_matches.json'),
  JSON.stringify(IMAGE_MAPPINGS, null, 2)
);

console.log(`\nSaved ${Object.keys(IMAGE_MAPPINGS).length} mappings to outputs/woo_slug_matches.json`);
