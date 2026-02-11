/**
 * Match products missing images against WooCommerce export and local files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(cell); cell = ''; }
    else cell += c;
  }
  result.push(cell);
  return result;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function normalize(s) {
  return (s || '').trim().toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

console.log('=== IMAGE MATCHING ===\n');

// 1. Build image lookup from WooCommerce export
console.log('Building WooCommerce image lookup...');
const wooPath = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split('\n').filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase().includes('product name'));
const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooImageIdx = wooHeader.findIndex(h => h.toLowerCase().includes('images'));

console.log(`  Product Name col: ${wooNameIdx}, SKU: ${wooSkuIdx}, Images: ${wooImageIdx}`);

const wooImageMap = new Map();
let wooWithImages = 0;

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const name = row[wooNameIdx]?.trim();
  const sku = row[wooSkuIdx]?.trim();
  const images = row[wooImageIdx]?.trim();
  
  if (images && images.length > 10) {
    wooWithImages++;
    // First image from comma-separated list
    const firstImage = images.split(',')[0].trim();
    if (name) wooImageMap.set(normalize(name), firstImage);
    if (sku) wooImageMap.set(normalize(sku), firstImage);
  }
}

console.log(`  Products with images: ${wooWithImages}`);
console.log(`  Lookup keys: ${wooImageMap.size}`);

// 2. Build local file index
console.log('\nBuilding local image index...');
const localImages = new Map();

try {
  const findResult = execSync(
    'find hmoonhydro.com/wp-content/uploads -type f \\( -name "*.jpg" -o -name "*.png" -o -name "*.webp" \\) 2>/dev/null',
    { cwd: BASE, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );
  
  const files = findResult.split('\n').filter(f => f.trim());
  for (const file of files) {
    const basename = path.basename(file, path.extname(file))
      .replace(/-\d+x\d+$/, '') // Remove size suffixes like -300x300
      .replace(/-scaled$/, '')
      .replace(/-\d+$/, '');
    localImages.set(normalize(basename), file);
  }
  console.log(`  Indexed ${localImages.size} unique image names`);
} catch (e) {
  console.log('  Could not index local images');
}

// 3. Process import file
console.log('\nProcessing import file...');
const inputPath = path.join(BASE, 'outputs/shopify_fully_enriched.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

const handleIdx = header.indexOf('Handle');
const titleIdx = header.indexOf('Title');
const skuIdx = header.findIndex(h => h.includes('Variant SKU'));
const imageIdx = header.findIndex(h => h === 'Image Src');

console.log(`  Image column: ${imageIdx}`);

const outputRows = [lines[0]];
let alreadyHadImage = 0;
let matchedFromWoo = 0;
let matchedLocal = 0;
let stillMissing = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const handle = row[handleIdx] || '';
  const title = row[titleIdx] || '';
  const sku = row[skuIdx] || '';
  let image = row[imageIdx]?.trim();
  
  if (image && image.length > 5) {
    alreadyHadImage++;
    outputRows.push(lines[i]);
    continue;
  }
  
  // Try to find image
  const normHandle = normalize(handle);
  const normTitle = normalize(title);
  const normSku = normalize(sku);
  
  // Check WooCommerce
  let found = wooImageMap.get(normTitle) || wooImageMap.get(normSku) || wooImageMap.get(normHandle);
  
  if (found) {
    row[imageIdx] = found;
    matchedFromWoo++;
  } else {
    // Check local files
    found = localImages.get(normHandle) || localImages.get(normTitle) || localImages.get(normSku);
    if (found) {
      // Convert to full URL format
      const localPath = found.replace('hmoonhydro.com/', '');
      row[imageIdx] = `https://hmoonhydro.com/${localPath}`;
      matchedLocal++;
    } else {
      stillMissing++;
    }
  }
  
  outputRows.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/shopify_images_enriched.csv');
fs.writeFileSync(outputPath, outputRows.join('\n'), 'utf-8');

console.log('\n=== RESULTS ===\n');
console.log(`Already had image: ${alreadyHadImage}`);
console.log(`Matched from WooCommerce: ${matchedFromWoo}`);
console.log(`Matched from local files: ${matchedLocal}`);
console.log(`Still missing: ${stillMissing}`);

const totalWithImages = alreadyHadImage + matchedFromWoo + matchedLocal;
const coverage = ((totalWithImages / (lines.length - 1)) * 100).toFixed(1);
console.log(`\nFINAL IMAGE COVERAGE: ${totalWithImages} / ${lines.length - 1} = ${coverage}%`);

console.log(`\nOutput: outputs/shopify_images_enriched.csv`);
