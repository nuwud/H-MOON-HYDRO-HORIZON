/**
 * Fix remaining missing SKUs
 * 
 * Generates unique SKUs for products that don't have them
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
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
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

// Simple hash function for consistent SKU generation
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().substring(0, 6);
}

// Category code lookup
const CATEGORY_CODES = {
  'nutrients': 'NUT',
  'grow_media': 'GRO',
  'seeds': 'SED',
  'propagation': 'PRO',
  'irrigation': 'IRR',
  'ph_meters': 'PHM',
  'environmental_monitors': 'ENV',
  'controllers': 'CTL',
  'grow_lights': 'LIT',
  'hid_bulbs': 'HID',
  'airflow': 'AIR',
  'odor_control': 'ODR',
  'water_filtration': 'WTR',
  'containers': 'POT',
  'harvesting': 'HAR',
  'trimming': 'TRM',
  'pest_control': 'PES',
  'co2': 'CO2',
  'grow_room_materials': 'GRM',
  'books': 'BOK',
  'electrical_supplies': 'ELC',
  'extraction': 'EXT',
};

function getCategoryCode(categories) {
  if (!categories) return 'GEN';
  const cat = categories.toLowerCase();
  for (const [key, code] of Object.entries(CATEGORY_CODES)) {
    if (cat.includes(key.replace(/_/g, ' ')) || cat.includes(key)) {
      return code;
    }
  }
  return 'GEN';
}

console.log('=== FIX MISSING SKUs ===\n');

// Load import file
const importFile = path.join(BASE, 'outputs/woocommerce_import_with_prices.csv');
const importData = fs.readFileSync(importFile, 'utf-8');
const importLines = importData.split('\n').filter(l => l.trim());
const header = parseCSVLine(importLines[0]);

const skuIdx = header.indexOf('SKU');
const typeIdx = header.indexOf('Type');
const nameIdx = header.indexOf('Name');
const catIdx = header.indexOf('Categories');
const parentIdx = header.indexOf('Parent');

console.log(`Loaded ${importLines.length - 1} rows`);

// Collect all existing SKUs to avoid duplicates
const existingSKUs = new Set();
for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const sku = row[skuIdx]?.trim();
  if (sku) existingSKUs.add(sku.toLowerCase());
}

console.log(`Found ${existingSKUs.size} existing SKUs\n`);

// Fix missing SKUs
const stats = {
  fixed: 0,
  samples: []
};

let skuCounter = 5000; // Start high to avoid conflicts

const fixedRows = [];
let currentParentSku = null;
let variantCounter = 0;

for (let i = 1; i < importLines.length; i++) {
  const row = parseCSVLine(importLines[i]);
  const type = row[typeIdx];
  const sku = row[skuIdx]?.trim();
  const name = row[nameIdx]?.trim() || '';
  const categories = row[catIdx] || '';
  
  if (type === 'simple' || type === 'variable') {
    currentParentSku = sku;
    variantCounter = 0;
  }
  
  if (!sku && (type === 'simple' || type === 'variation')) {
    let newSku;
    
    if (type === 'variation') {
      // Generate variant SKU based on parent
      variantCounter++;
      const baseSku = currentParentSku || `HMH${String(skuCounter++).padStart(5, '0')}`;
      newSku = `${baseSku}-V${String(variantCounter).padStart(2, '0')}`;
    } else {
      // Generate new unique SKU for simple products
      const catCode = getCategoryCode(categories);
      const hash = hashString(name || String(Date.now()));
      newSku = `HMH-${catCode}-${hash}`;
      
      // Ensure uniqueness
      while (existingSKUs.has(newSku.toLowerCase())) {
        skuCounter++;
        newSku = `HMH-${catCode}-${String(skuCounter).padStart(5, '0')}`;
      }
    }
    
    row[skuIdx] = newSku;
    existingSKUs.add(newSku.toLowerCase());
    stats.fixed++;
    
    if (stats.samples.length < 10) {
      stats.samples.push({ type, name: name.substring(0, 40), newSku });
    }
  }
  
  fixedRows.push(row);
}

console.log(`Generated ${stats.fixed} new SKUs\n`);
console.log('Samples of generated SKUs:');
stats.samples.forEach(s => {
  console.log(`  [${s.type}] "${s.name}" -> ${s.newSku}`);
});

// Write output
const outputLines = [
  header.map(escapeCSV).join(','),
  ...fixedRows.map(row => row.map(escapeCSV).join(','))
];

fs.writeFileSync(importFile, outputLines.join('\n'), 'utf-8');
console.log(`\nUpdated: ${importFile}`);

// Final validation
console.log('\n=== FINAL VALIDATION ===\n');
let stillMissingSku = 0;
let stillMissingPrice = 0;
const priceIdx = header.indexOf('Regular price');

for (const row of fixedRows) {
  const type = row[typeIdx];
  const sku = row[skuIdx]?.trim();
  const price = row[priceIdx]?.trim();
  
  if ((type === 'simple' || type === 'variation') && !sku) stillMissingSku++;
  if (type !== 'variable' && !price) stillMissingPrice++;
}

console.log(`Products without SKU: ${stillMissingSku}`);
console.log(`Products without price: ${stillMissingPrice}`);

if (stillMissingSku === 0 && stillMissingPrice === 0) {
  console.log('\n✅ All products now have SKUs and prices!');
} else {
  console.log('\n⚠️ Still some issues to resolve');
}
