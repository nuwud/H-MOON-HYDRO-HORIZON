/**
 * Enhanced image matching using fuzzy search against local WooCommerce backup
 * and manufacturer image URLs
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
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWords(s) {
  return normalize(s).split(' ').filter(w => w.length > 2);
}

function similarity(a, b) {
  const wordsA = new Set(extractWords(a));
  const wordsB = new Set(extractWords(b));
  const intersection = [...wordsA].filter(x => wordsB.has(x));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}

console.log('=== ENHANCED IMAGE MATCHING ===\n');

// 1. Index all local images
console.log('Indexing local images...');
let localImages = [];
try {
  const result = execSync(
    'find hmoonhydro.com/wp-content/uploads -type f \\( -name "*.jpg" -o -name "*.png" -o -name "*.webp" \\) 2>/dev/null | head -5000',
    { cwd: BASE, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );
  localImages = result.split('\n').filter(f => f.trim());
} catch (e) {
  console.log('  Local image scan failed, trying alternative...');
}

// Build searchable index
const imageIndex = [];
for (const img of localImages) {
  const basename = path.basename(img, path.extname(img))
    .replace(/-\d+x\d+$/, '')
    .replace(/-scaled$/, '')
    .replace(/-\d+$/, '');
  imageIndex.push({
    path: img,
    name: basename,
    normalized: normalize(basename)
  });
}
console.log(`  Indexed ${imageIndex.length} images`);

// 2. Build WooCommerce image lookup
console.log('Loading WooCommerce export images...');
const wooPath = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split(/\r?\n/).filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);

const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase().includes('product name'));
const wooImageIdx = wooHeader.findIndex(h => h.toLowerCase().includes('images'));

const wooImageMap = new Map();
for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const name = row[wooNameIdx]?.trim();
  const images = row[wooImageIdx]?.trim();
  if (name && images && images.length > 10) {
    const firstImage = images.split(',')[0].trim();
    wooImageMap.set(normalize(name), firstImage);
  }
}
console.log(`  Loaded ${wooImageMap.size} WooCommerce image mappings`);

// 3. Load import file
console.log('Processing import file...');
const inputPath = path.join(BASE, 'outputs/woocommerce_COMPLETE.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

const NAME_IDX = 3;
const IMAGE_IDX = 29;

let alreadyHad = 0;
let matchedWoo = 0;
let matchedLocal = 0;
let matchedFuzzy = 0;
let stillMissing = 0;

const outputLines = [lines[0]];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const name = row[NAME_IDX] || '';
  let image = row[IMAGE_IDX]?.trim();
  
  if (image && image.length > 10 && !image.includes('HMH_logo')) {
    alreadyHad++;
    outputLines.push(lines[i]);
    continue;
  }
  
  const normName = normalize(name);
  
  // Try WooCommerce exact match
  if (wooImageMap.has(normName)) {
    row[IMAGE_IDX] = wooImageMap.get(normName);
    matchedWoo++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Try fuzzy match against WooCommerce
  let bestMatch = null;
  let bestScore = 0;
  for (const [wooName, wooImage] of wooImageMap) {
    const score = similarity(normName, wooName);
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = wooImage;
    }
  }
  
  if (bestMatch) {
    row[IMAGE_IDX] = bestMatch;
    matchedFuzzy++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  // Try local image fuzzy match
  let bestLocal = null;
  let bestLocalScore = 0;
  for (const img of imageIndex) {
    const score = similarity(normName, img.normalized);
    if (score > bestLocalScore && score > 0.4) {
      bestLocalScore = score;
      bestLocal = img.path;
    }
  }
  
  if (bestLocal) {
    const localUrl = `https://hmoonhydro.com/${bestLocal.replace('hmoonhydro.com/', '')}`;
    row[IMAGE_IDX] = localUrl;
    matchedLocal++;
    outputLines.push(row.map(escapeCSV).join(','));
    continue;
  }
  
  stillMissing++;
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_FINAL_ENHANCED.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log('\n=== RESULTS ===\n');
console.log(`Already had image: ${alreadyHad}`);
console.log(`Matched from WooCommerce (exact): ${matchedWoo}`);
console.log(`Matched from WooCommerce (fuzzy): ${matchedFuzzy}`);
console.log(`Matched from local files: ${matchedLocal}`);
console.log(`Still missing: ${stillMissing}`);

const totalWithImages = alreadyHad + matchedWoo + matchedFuzzy + matchedLocal;
console.log(`\nFINAL IMAGE: ${totalWithImages}/${lines.length - 1} (${((totalWithImages/(lines.length-1))*100).toFixed(1)}%)`);
console.log(`\nOutput: outputs/woocommerce_FINAL_ENHANCED.csv`);
