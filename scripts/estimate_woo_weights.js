/**
 * Estimate weights for remaining products without weight data
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

// Weight estimates by category (in lbs)
const WEIGHT_LBS = {
  'nutrients': 2.2,
  'grow media': 11,
  'grow_media': 11,
  'coco': 11,
  'perlite': 7,
  'rockwool': 1,
  'seeds': 0.1,
  'propagation': 0.7,
  'cloning': 0.5,
  'irrigation': 1.1,
  'tubing': 0.7,
  'pump': 3.3,
  'ph': 1.1,
  'meters': 0.7,
  'lights': 11,
  'grow_lights': 11,
  'led': 9,
  'hid': 7,
  'bulbs': 1.1,
  'ballast': 11,
  'reflector': 4.5,
  'fans': 4.5,
  'airflow': 4.5,
  'ducting': 2.2,
  'carbon': 11,
  'filter': 11,
  'odor': 2.2,
  'containers': 1.1,
  'pots': 0.7,
  'buckets': 1.1,
  'fabric': 0.5,
  'harvest': 1.1,
  'trimming': 0.9,
  'scissors': 0.3,
  'pest': 1.1,
  'co2': 4.5,
  'books': 1.1,
  'controller': 2.2,
  'timer': 0.7,
  '_default': 1.1
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

function estimateWeightLbs(name, category, tags) {
  const text = `${name} ${category} ${tags}`.toLowerCase();
  
  // Size-based estimates
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(ml|l|liter|litre|gal|gallon|oz|qt|quart)/i);
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    
    if (unit.includes('gal')) return (num * 9.5).toFixed(2);
    if (unit === 'l' || unit.includes('liter')) return (num * 2.4).toFixed(2);
    if (unit === 'ml') return (num * 0.0024).toFixed(2);
    if (unit === 'oz') return (num * 0.08).toFixed(2);
    if (unit === 'qt') return (num * 2.4).toFixed(2);
  }
  
  // Category-based estimates
  for (const [cat, weight] of Object.entries(WEIGHT_LBS)) {
    if (cat !== '_default' && text.includes(cat)) {
      return weight.toFixed(2);
    }
  }
  
  return WEIGHT_LBS._default.toFixed(2);
}

console.log('=== WEIGHT ESTIMATION ===\n');

const inputPath = path.join(BASE, 'outputs/woocommerce_FINAL.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split(/\r?\n/).filter(l => l.trim());

// Column indices for WooCommerce format
const NAME_IDX = 3;
const WEIGHT_IDX = 18;
const CATEGORY_IDX = 26;
const TAGS_IDX = 27;

const outputLines = [lines[0]];
let hadWeight = 0;
let estimated = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const currentWeight = parseFloat(row[WEIGHT_IDX]);
  
  if (currentWeight > 0) {
    hadWeight++;
    outputLines.push(lines[i]);
    continue;
  }
  
  // Estimate weight
  const name = row[NAME_IDX] || '';
  const category = row[CATEGORY_IDX] || '';
  const tags = row[TAGS_IDX] || '';
  
  const estimatedWeight = estimateWeightLbs(name, category, tags);
  row[WEIGHT_IDX] = estimatedWeight;
  estimated++;
  
  outputLines.push(row.map(escapeCSV).join(','));
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_COMPLETE.csv');
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`Already had weight: ${hadWeight}`);
console.log(`Estimated weight: ${estimated}`);
console.log(`Total: ${hadWeight + estimated} = 100%`);
console.log(`\nOutput: outputs/woocommerce_COMPLETE.csv`);
