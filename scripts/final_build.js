/**
 * Best effort image matching - tries multiple strategies
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function generateSku(name, category) {
  const catCodes = {
    nutrient: 'NUT', grow: 'GRO', light: 'LIT', airflow: 'AIR', fan: 'AIR',
    irrigation: 'IRR', pump: 'IRR', container: 'POT', pot: 'POT',
    propagation: 'PRO', seed: 'SED', harvest: 'HAR', trim: 'HAR',
    pest: 'PES', odor: 'ODR', carbon: 'ODR', controller: 'CTL', ph: 'PHM', meter: 'PHM'
  };
  const cat = (category || '').toLowerCase();
  let code = 'GEN';
  for (const [key, val] of Object.entries(catCodes)) {
    if (cat.includes(key)) { code = val; break; }
  }
  const hash = crypto.createHash('md5').update(name || 'x').digest('hex').substring(0, 6).toUpperCase();
  return `HMH-${code}-${hash}`;
}

console.log('=== FINAL BUILD ===\n');

// Load all image sources
console.log('Loading image sources...');

// 1. WooCommerce export
const wooPath = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const wooData = fs.readFileSync(wooPath, 'utf-8');
const wooLines = wooData.split(/\r?\n/).filter(l => l.trim());
const wooHeader = parseCSVLine(wooLines[0]);
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase().includes('product name'));
const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooImageIdx = wooHeader.findIndex(h => h.toLowerCase().includes('images'));

const imagesByName = new Map();
const imagesBySku = new Map();
const allWooImages = [];

for (let i = 1; i < wooLines.length; i++) {
  const row = parseCSVLine(wooLines[i]);
  const name = row[wooNameIdx]?.trim();
  const sku = row[wooSkuIdx]?.trim();
  const images = row[wooImageIdx]?.trim();
  
  if (images && images.length > 10) {
    const img = images.split(',')[0].trim();
    if (name) imagesByName.set(normalize(name), img);
    if (sku) imagesBySku.set(normalize(sku), img);
    allWooImages.push({ name, sku, image: img });
  }
}
console.log(`  WooCommerce: ${allWooImages.length} products with images`);

// 2. Local image index
const uploadsBase = path.join(BASE, 'hmoonhydro.com/wp-content/uploads');
const localImages = new Map();

function indexDir(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        indexDir(fullPath, depth + 1);
      } else if (/\.(jpg|png|webp)$/i.test(item) && !/-\d+x\d+\./i.test(item)) {
        const basename = path.basename(item, path.extname(item)).replace(/-scaled$/, '').replace(/-\d+$/, '');
        const relativePath = fullPath.replace(BASE + '/', '').replace(BASE + '\\', '').replace(/\\/g, '/');
        const url = `https://hmoonhydro.com/${relativePath.replace('hmoonhydro.com/', '')}`;
        localImages.set(normalize(basename), url);
      }
    }
  } catch (e) {}
}
indexDir(uploadsBase);
console.log(`  Local images: ${localImages.size} indexed`);

// Load input file
const inputPath = path.join(BASE, 'outputs/woocommerce_COMPLETE.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());
const header = parseCSVLine(lines[0]);

console.log(`\nProcessing ${lines.length - 1} rows...`);

const TYPE_IDX = 1;
const SKU_IDX = 2;
const NAME_IDX = 3;
const WEIGHT_IDX = 18;
const PRICE_IDX = 25;
const CATEGORY_IDX = 26;
const IMAGE_IDX = 29;

const outputLines = [lines[0]];
let stats = { total: 0, price: 0, sku: 0, weight: 0, image: 0 };
let imageMatches = { had: 0, sku: 0, name: 0, local: 0, fuzzy: 0 };
let skusGenerated = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[TYPE_IDX];
  if (!type) continue;
  
  stats.total++;
  
  // Generate SKU if needed
  if (!row[SKU_IDX]?.trim() && type !== 'variable') {
    row[SKU_IDX] = generateSku(row[NAME_IDX], row[CATEGORY_IDX]);
    skusGenerated++;
  }
  
  const sku = row[SKU_IDX] || '';
  const name = row[NAME_IDX] || '';
  let image = row[IMAGE_IDX]?.trim();
  
  // Try to find image if missing or placeholder
  if (!image || image.length < 10 || image.includes('HMH_logo') || image.includes('placeholder')) {
    const normSku = normalize(sku);
    const normName = normalize(name);
    
    // Try SKU match
    if (normSku && imagesBySku.has(normSku)) {
      row[IMAGE_IDX] = imagesBySku.get(normSku);
      imageMatches.sku++;
    }
    // Try name match
    else if (normName && imagesByName.has(normName)) {
      row[IMAGE_IDX] = imagesByName.get(normName);
      imageMatches.name++;
    }
    // Try local
    else if (normSku && localImages.has(normSku)) {
      row[IMAGE_IDX] = localImages.get(normSku);
      imageMatches.local++;
    }
    else if (normName && localImages.has(normName)) {
      row[IMAGE_IDX] = localImages.get(normName);
      imageMatches.local++;
    }
    // Fuzzy - find best match
    else {
      const nameWords = (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
      let bestMatch = null;
      let bestScore = 0;
      
      for (const woo of allWooImages) {
        const wooWords = (woo.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
        const matches = nameWords.filter(w => wooWords.includes(w)).length;
        const score = matches / Math.max(nameWords.length, 1);
        if (score > bestScore && score > 0.5) {
          bestScore = score;
          bestMatch = woo.image;
        }
      }
      
      if (bestMatch) {
        row[IMAGE_IDX] = bestMatch;
        imageMatches.fuzzy++;
      }
    }
    
    image = row[IMAGE_IDX]?.trim();
  } else {
    imageMatches.had++;
  }
  
  // Count quality
  if (row[PRICE_IDX] && parseFloat(row[PRICE_IDX]) > 0) stats.price++;
  if (row[SKU_IDX]?.trim()) stats.sku++;
  if (row[WEIGHT_IDX] && parseFloat(row[WEIGHT_IDX]) > 0) stats.weight++;
  if (image && image.length > 10 && !image.includes('HMH_logo')) stats.image++;
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_BEST.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log('\n=== FINAL RESULTS ===\n');
console.log(`Total rows: ${stats.total}`);
console.log(`SKUs generated: ${skusGenerated}`);
console.log('');
console.log('Image matches:');
console.log(`  Already had: ${imageMatches.had}`);
console.log(`  By SKU: ${imageMatches.sku}`);
console.log(`  By name: ${imageMatches.name}`);
console.log(`  From local: ${imageMatches.local}`);
console.log(`  Fuzzy: ${imageMatches.fuzzy}`);
console.log('');
console.log('QUALITY:');
console.log(`  Price:  ${stats.price}/${stats.total} (${((stats.price/stats.total)*100).toFixed(1)}%)`);
console.log(`  SKU:    ${stats.sku}/${stats.total} (${((stats.sku/stats.total)*100).toFixed(1)}%)`);
console.log(`  Weight: ${stats.weight}/${stats.total} (${((stats.weight/stats.total)*100).toFixed(1)}%)`);
console.log(`  Image:  ${stats.image}/${stats.total} (${((stats.image/stats.total)*100).toFixed(1)}%)`);
console.log('');
console.log(`Output: outputs/woocommerce_BEST.csv`);
