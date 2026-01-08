/**
 * Match Missing Shopify Products with WooCommerce Image URLs
 * 
 * Reads the WooCommerce export and finds image URLs for products
 * that are missing images in the Shopify import.
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

// Normalize title for matching
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Read Shopify CSV to find products missing images
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
  
  if (!seenHandles.has(handle) && !img && title) {
    missingImages[normalizeTitle(title)] = { handle, title };
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

console.log(`WooCommerce columns - Title: ${wooTitleIdx}, Image URL: ${wooImgIdx}, Slug: ${wooSlugIdx}`);

// Build WooCommerce image lookup
const wooImages = {};
let wooWithImages = 0;

wooCSV.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  if (cols.length < wooImgIdx) return;
  
  const title = cols[wooTitleIdx] || '';
  const imgUrl = cols[wooImgIdx] || '';
  const slug = cols[wooSlugIdx] || '';
  
  if (title && imgUrl && imgUrl.includes('http')) {
    wooWithImages++;
    const normalized = normalizeTitle(title);
    if (!wooImages[normalized]) {
      wooImages[normalized] = { title, imgUrl, slug };
    }
  }
});

console.log(`Found ${wooWithImages} WooCommerce products with images`);
console.log(`Built lookup with ${Object.keys(wooImages).length} unique titles`);

// Match missing Shopify products with WooCommerce images
const matches = [];
let matched = 0;

Object.entries(missingImages).forEach(([normTitle, { handle, title }]) => {
  if (wooImages[normTitle]) {
    matched++;
    matches.push({
      handle,
      shopifyTitle: title,
      wooTitle: wooImages[normTitle].title,
      imgUrl: wooImages[normTitle].imgUrl
    });
  }
});

console.log(`\nMatched ${matched} products with WooCommerce images`);

// Output matches as image mappings
console.log('\n=== Add these to IMAGE_MAPPINGS ===\n');
matches.slice(0, 50).forEach(m => {
  console.log(`  '${m.handle}': '${m.imgUrl}',`);
});

if (matches.length > 50) {
  console.log(`  ... and ${matches.length - 50} more`);
}

// Save full matches to file
const outputPath = path.join(__dirname, '../outputs/woo_image_matches.json');
fs.writeFileSync(outputPath, JSON.stringify(matches, null, 2));
console.log(`\nFull matches saved to: ${outputPath}`);

// Also save as CSV for easy review
const csvOutput = ['Handle,Shopify Title,WooCommerce Image URL'];
matches.forEach(m => {
  csvOutput.push(`"${m.handle}","${m.shopifyTitle}","${m.imgUrl}"`);
});
fs.writeFileSync(path.join(__dirname, '../outputs/woo_image_matches.csv'), csvOutput.join('\n'));
console.log('CSV saved to: outputs/woo_image_matches.csv');
