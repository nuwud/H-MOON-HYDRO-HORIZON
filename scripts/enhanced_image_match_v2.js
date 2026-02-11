/**
 * Enhanced image matching - Windows compatible
 * Uses glob patterns instead of find command
 */

const fs = require('fs');
const path = require('path');

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
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function getWords(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function wordOverlap(a, b) {
  const wordsA = new Set(getWords(a));
  const wordsB = new Set(getWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(x => wordsB.has(x));
  return intersection.length / Math.min(wordsA.size, wordsB.size);
}

console.log('=== ENHANCED IMAGE MATCHING (Windows) ===\n');

// 1. Build comprehensive image index from local files
console.log('Building local image index...');
const imageIndex = new Map();
const uploadsBase = path.join(BASE, 'hmoonhydro.com/wp-content/uploads');

function indexDir(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        indexDir(fullPath, depth + 1);
      } else if (/\.(jpg|png|webp)$/i.test(item)) {
        // Skip thumbnails (contain size like -300x300)
        if (/-\d+x\d+\./i.test(item)) continue;
        
        const basename = path.basename(item, path.extname(item))
          .replace(/-scaled$/, '')
          .replace(/-\d+$/, '');
        const relativePath = fullPath.replace(BASE + '/', '').replace(/\\/g, '/');
        const url = `https://hmoonhydro.com/${relativePath.replace('hmoonhydro.com/', '')}`;
        
        imageIndex.set(normalize(basename), url);
        // Also index with words for fuzzy matching
        for (const word of getWords(basename)) {
          if (word.length > 3 && !imageIndex.has(word)) {
            imageIndex.set(word, url);
          }
        }
      }
    }
  } catch (e) {}
}

indexDir(uploadsBase);
console.log(`  Indexed ${imageIndex.size} image keys`);

// 2. Build WooCommerce image lookup (with better fuzzy matching)
console.log('Loading WooCommerce export images...');
const wooPath = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split(/\r?\n/).filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase().includes('product name'));
const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooImageIdx = wooHeader.findIndex(h => h.toLowerCase().includes('images'));

const wooByName = new Map();
const wooBySku = new Map();
const wooProducts = [];

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const name = row[wooNameIdx]?.trim();
  const sku = row[wooSkuIdx]?.trim();
  const images = row[wooImageIdx]?.trim();
  
  if (images && images.length > 10) {
    const firstImage = images.split(',')[0].trim();
    if (name) wooByName.set(normalize(name), firstImage);
    if (sku) wooBySku.set(normalize(sku), firstImage);
    wooProducts.push({ name: name || '', sku: sku || '', image: firstImage });
  }
}
console.log(`  Loaded ${wooProducts.length} WooCommerce products with images`);

// 3. Process import file
console.log('Processing import file...');
const inputPath = path.join(BASE, 'outputs/woocommerce_COMPLETE.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const SKU_IDX = 2;
const NAME_IDX = 3;
const IMAGE_IDX = 29;

let alreadyHad = 0;
let matchedBySku = 0;
let matchedByName = 0;
let matchedLocal = 0;
let matchedFuzzy = 0;
let stillMissing = 0;

const outputLines = [lines[0]];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const sku = row[SKU_IDX] || '';
  const name = row[NAME_IDX] || '';
  let image = row[IMAGE_IDX]?.trim();
  
  // Skip if already has good image
  if (image && image.length > 10 && !image.includes('HMH_logo') && !image.includes('placeholder')) {
    alreadyHad++;
    outputLines.push(lines[i]);
    continue;
  }
  
  const normSku = normalize(sku);
  const normName = normalize(name);
  
  // Try SKU match first
  if (normSku && wooBySku.has(normSku)) {
    row[IMAGE_IDX] = wooBySku.get(normSku);
    matchedBySku++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Try exact name match
  if (normName && wooByName.has(normName)) {
    row[IMAGE_IDX] = wooByName.get(normName);
    matchedByName++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Try local image by SKU or name
  if (normSku && imageIndex.has(normSku)) {
    row[IMAGE_IDX] = imageIndex.get(normSku);
    matchedLocal++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  if (normName && imageIndex.has(normName)) {
    row[IMAGE_IDX] = imageIndex.get(normName);
    matchedLocal++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Fuzzy match against WooCommerce products
  let bestMatch = null;
  let bestScore = 0;
  for (const prod of wooProducts) {
    const nameScore = wordOverlap(name, prod.name);
    if (nameScore > bestScore && nameScore > 0.6) {
      bestScore = nameScore;
      bestMatch = prod.image;
    }
  }
  
  if (bestMatch) {
    row[IMAGE_IDX] = bestMatch;
    matchedFuzzy++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Try word-based local image match
  const nameWords = getWords(name);
  for (const word of nameWords) {
    if (word.length > 4 && imageIndex.has(word)) {
      row[IMAGE_IDX] = imageIndex.get(word);
      matchedLocal++;
      outputLines.push(row.map(escapeCSV).join(','));
      break;
    }
  }
  
  if (!row[IMAGE_IDX] || row[IMAGE_IDX].length < 10) {
    stillMissing++;
  }
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_FINAL_v2.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log('\n=== RESULTS ===\n');
console.log(`Already had image: ${alreadyHad}`);
console.log(`Matched by SKU: ${matchedBySku}`);
console.log(`Matched by name (exact): ${matchedByName}`);
console.log(`Matched from local files: ${matchedLocal}`);
console.log(`Matched fuzzy: ${matchedFuzzy}`);
console.log(`Still missing: ${stillMissing}`);

const totalWithImages = alreadyHad + matchedBySku + matchedByName + matchedLocal + matchedFuzzy;
console.log(`\nFINAL IMAGE: ${totalWithImages}/${lines.length - 1} (${((totalWithImages/(lines.length-1))*100).toFixed(1)}%)`);
console.log(`\nOutput: outputs/woocommerce_FINAL_v2.csv`);
