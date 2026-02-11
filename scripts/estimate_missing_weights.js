/**
 * Estimate weights for products without weight data based on category
 * Uses typical industry weights for hydroponic products
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

// Estimated weights by category/type (in grams)
const WEIGHT_ESTIMATES = {
  // Nutrients - based on typical liquid nutrients
  'nutrients': {
    'ml': { '100': 150, '250': 350, '500': 650, '946': 1200, '1000': 1250, '1l': 1250, '2.5l': 2900, '4l': 4500, '1gal': 4500, '5gal': 20000, '10l': 11000, '20l': 22000 },
    'default': 1000 // 1kg default for nutrients
  },
  'grow media': { 'default': 5000 }, // 11 lbs typical bag
  'grow_media': { 'default': 5000 },
  'coco': { 'default': 5000 },
  'hydroton': { 'default': 10000 },
  'perlite': { 'default': 3000 },
  'rockwool': { 'default': 500 },
  
  // Seeds - very light
  'seeds': { 'default': 50 },
  
  // Propagation
  'propagation': { 'default': 300 },
  'cloning': { 'default': 200 },
  'trays': { 'default': 400 },
  
  // Irrigation
  'irrigation': { 'default': 500 },
  'tubing': { 'default': 300 },
  'fittings': { 'default': 100 },
  'pump': { 'default': 1500 },
  
  // pH/EC
  'ph': { 'default': 500 },
  'meters': { 'default': 300 },
  
  // Lights
  'lights': { 'default': 5000 },
  'grow_lights': { 'default': 5000 },
  'led': { 'default': 4000 },
  'hid': { 'default': 3000 },
  'bulbs': { 'default': 500 },
  'ballast': { 'default': 5000 },
  'reflector': { 'default': 2000 },
  
  // Airflow
  'fans': { 'default': 2000 },
  'airflow': { 'default': 2000 },
  'inline': { 'default': 3000 },
  'ducting': { 'default': 1000 },
  
  // Odor control
  'carbon': { 'default': 5000 },
  'filter': { 'default': 5000 },
  'odor': { 'default': 1000 },
  
  // Containers
  'containers': { 'default': 500 },
  'pots': { 'default': 300 },
  'buckets': { 'default': 500 },
  'fabric': { 'default': 200 },
  
  // Harvesting/Trimming
  'harvest': { 'default': 500 },
  'trimming': { 'default': 400 },
  'scissors': { 'default': 150 },
  'drying': { 'default': 1000 },
  
  // Pest control
  'pest': { 'default': 500 },
  'spray': { 'default': 600 },
  
  // CO2
  'co2': { 'default': 2000 },
  
  // Books
  'books': { 'default': 500 },
  
  // Controllers
  'controller': { 'default': 1000 },
  'timer': { 'default': 300 },
  
  // Default fallback
  '_default': { 'default': 500 }
};

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

function estimateWeight(title, tags, type) {
  const text = `${title} ${tags} ${type}`.toLowerCase();
  
  // Try to extract size from title
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(ml|l|liter|litre|gal|gallon|oz|qt|quart)/i);
  
  // Find matching category
  for (const [cat, weights] of Object.entries(WEIGHT_ESTIMATES)) {
    if (text.includes(cat)) {
      if (sizeMatch && weights[sizeMatch[1] + sizeMatch[2]?.toLowerCase()]) {
        return weights[sizeMatch[1] + sizeMatch[2].toLowerCase()];
      }
      if (sizeMatch && weights[sizeMatch[1]]) {
        return weights[sizeMatch[1]];
      }
      return weights.default || 500;
    }
  }
  
  // Size-based estimates for liquids
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2]?.toLowerCase() || '';
    
    if (unit.includes('gal')) return num * 4500;
    if (unit === 'l' || unit.includes('liter')) return num * 1100;
    if (unit === 'ml') return num * 1.1;
    if (unit === 'oz') return num * 35;
    if (unit === 'qt') return num * 1100;
  }
  
  return WEIGHT_ESTIMATES._default.default;
}

console.log('=== WEIGHT ESTIMATION FOR MISSING DATA ===\n');

// Load weight-enriched file
const inputPath = path.join(BASE, 'outputs/shopify_weight_enriched.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

const handleIdx = header.indexOf('Handle');
const titleIdx = header.indexOf('Title');
const tagsIdx = header.indexOf('Tags');
const typeIdx = header.indexOf('Type');
const gramsIdx = header.findIndex(h => h.includes('Variant Grams'));
const imageIdx = header.findIndex(h => h === 'Image Src');

console.log(`Processing ${lines.length - 1} rows...`);

const outputRows = [lines[0]];
let hadWeight = 0;
let estimated = 0;
let hadImage = 0;
let noImage = 0;

const missingImageProducts = [];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const handle = row[handleIdx] || '';
  const title = row[titleIdx] || '';
  const tags = row[tagsIdx] || '';
  const type = row[typeIdx] || '';
  let grams = parseFloat(row[gramsIdx]);
  const image = row[imageIdx]?.trim();
  
  // Track images
  if (image && image.length > 5) {
    hadImage++;
  } else {
    noImage++;
    if (title) {
      missingImageProducts.push({ handle, title: title.substring(0, 50) });
    }
  }
  
  // Estimate weight if missing
  if (!grams || grams <= 0) {
    grams = estimateWeight(title, tags, type);
    row[gramsIdx] = Math.round(grams).toString();
    estimated++;
  } else {
    hadWeight++;
  }
  
  outputRows.push(row.map(escapeCSV).join(','));
}

// Write final file
const outputPath = path.join(BASE, 'outputs/shopify_fully_enriched.csv');
fs.writeFileSync(outputPath, outputRows.join('\n'), 'utf-8');

console.log('\n=== RESULTS ===\n');
console.log('WEIGHT:');
console.log(`  Already had weight: ${hadWeight}`);
console.log(`  Estimated weight: ${estimated}`);
console.log(`  TOTAL WITH WEIGHT: ${hadWeight + estimated} / ${lines.length - 1} = 100%`);

console.log('\nIMAGES:');
console.log(`  Has image: ${hadImage} (${((hadImage / (lines.length - 1)) * 100).toFixed(1)}%)`);
console.log(`  Missing image: ${noImage} (${((noImage / (lines.length - 1)) * 100).toFixed(1)}%)`);

console.log(`\nOutput: outputs/shopify_fully_enriched.csv`);

// Write list of products missing images
if (missingImageProducts.length > 0) {
  const imageListPath = path.join(BASE, 'outputs/products_needing_images.csv');
  const imageListContent = 'Handle,Title\n' + missingImageProducts
    .filter((p, i, arr) => arr.findIndex(x => x.handle === p.handle) === i) // unique
    .map(p => `"${p.handle}","${p.title}"`)
    .join('\n');
  fs.writeFileSync(imageListPath, imageListContent);
  console.log(`\nProducts needing images saved to: outputs/products_needing_images.csv`);
}
