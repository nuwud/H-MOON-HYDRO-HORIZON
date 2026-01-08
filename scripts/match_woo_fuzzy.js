/**
 * Aggressive WooCommerce Image Matching
 * 
 * Uses multiple strategies to match products between Shopify and WooCommerce
 */

const fs = require('fs');
const path = require('path');

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

// Normalize for matching
function normalize(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get key tokens from product name
function getKeyTokens(name) {
  const normalized = normalize(name);
  // Remove common words
  const stopwords = new Set(['the', 'a', 'an', 'for', 'with', 'and', 'or', 'of', 'in', 'to', 'by']);
  const tokens = normalized.split(' ').filter(t => t.length > 2 && !stopwords.has(t));
  return new Set(tokens);
}

// Calculate token overlap score
function tokenOverlap(set1, set2) {
  if (set1.size === 0 || set2.size === 0) return 0;
  let common = 0;
  for (const t of set1) {
    if (set2.has(t)) common++;
  }
  // Jaccard similarity
  return common / (set1.size + set2.size - common);
}

console.log('Reading Shopify CSV...');
const shopifyPath = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const shopifyCSV = fs.readFileSync(shopifyPath, 'utf-8').split('\n');
const shopifyHeader = parseCSVLine(shopifyCSV[0]);
const handleIdx = shopifyHeader.indexOf('Handle');
const titleIdx = shopifyHeader.indexOf('Title');
const imgIdx = shopifyHeader.indexOf('Image Src');

// Get products without images
const missingProducts = [];
const seenHandles = new Set();

shopifyCSV.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  const handle = cols[handleIdx];
  const title = cols[titleIdx];
  const img = cols[imgIdx];
  
  if (!seenHandles.has(handle) && !img && handle) {
    missingProducts.push({ handle, title, tokens: getKeyTokens(title) });
    seenHandles.add(handle);
  }
});

console.log(`Products missing images: ${missingProducts.length}`);

// Read WooCommerce CSV
console.log('Reading WooCommerce CSV...');
const wooPath = path.join(__dirname, '../CSVs/Products-Export-2025-Oct-29-171532.csv');
const wooCSV = fs.readFileSync(wooPath, 'utf-8').split('\n');
const wooHeader = parseCSVLine(wooCSV[0]);
const wooTitleIdx = wooHeader.indexOf('Product Name');
const wooImgIdx = wooHeader.indexOf('Image URL');
const wooSlugIdx = wooHeader.indexOf('Slug');

// Build WooCommerce products with images
const wooProducts = [];
wooCSV.slice(1).filter(Boolean).forEach(line => {
  const cols = parseCSVLine(line);
  if (cols.length <= wooImgIdx) return;
  
  const title = cols[wooTitleIdx] || '';
  const imgUrl = cols[wooImgIdx] || '';
  const slug = cols[wooSlugIdx] || '';
  
  if (imgUrl && imgUrl.includes('http')) {
    wooProducts.push({
      title,
      slug,
      imgUrl,
      tokens: getKeyTokens(title)
    });
  }
});

console.log(`WooCommerce products with images: ${wooProducts.length}`);

// Match using token overlap
const matches = [];
const matchThreshold = 0.45; // 45% token overlap required

for (const shopProduct of missingProducts) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const wooProduct of wooProducts) {
    const score = tokenOverlap(shopProduct.tokens, wooProduct.tokens);
    if (score > bestScore && score >= matchThreshold) {
      bestScore = score;
      bestMatch = wooProduct;
    }
  }
  
  if (bestMatch) {
    matches.push({
      handle: shopProduct.handle,
      shopifyTitle: shopProduct.title,
      wooTitle: bestMatch.title,
      imgUrl: bestMatch.imgUrl,
      score: bestScore.toFixed(2)
    });
  }
}

console.log(`\nMatched ${matches.length} products with token overlap >= ${matchThreshold}`);

// Generate IMAGE_MAPPINGS
const IMAGE_MAPPINGS = {};
matches.forEach(m => {
  IMAGE_MAPPINGS[m.handle] = m.imgUrl;
});

console.log('\n=== Add these to IMAGE_MAPPINGS ===\n');
console.log('// WooCommerce fuzzy-matched images');
matches.slice(0, 100).forEach(m => {
  console.log(`  '${m.handle}': '${m.imgUrl}', // score: ${m.score} - "${m.wooTitle.slice(0, 40)}"`);
});

if (matches.length > 100) {
  console.log(`  // ... and ${matches.length - 100} more`);
}

// Save to JSON
fs.writeFileSync(
  path.join(__dirname, '../outputs/woo_fuzzy_matches.json'),
  JSON.stringify(IMAGE_MAPPINGS, null, 2)
);

console.log(`\nSaved ${Object.keys(IMAGE_MAPPINGS).length} mappings to outputs/woo_fuzzy_matches.json`);

// Show some sample matches for review
console.log('\n=== Sample Matches for Review ===');
matches.slice(0, 20).forEach(m => {
  console.log(`\nShopify: "${m.shopifyTitle.slice(0, 50)}"`);
  console.log(`WooCom:  "${m.wooTitle.slice(0, 50)}"`);
  console.log(`Score:   ${m.score}`);
});
