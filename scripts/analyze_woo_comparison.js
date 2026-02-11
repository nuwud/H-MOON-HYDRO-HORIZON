/**
 * Compare WooCommerce Export with Refined Import Data
 * 
 * Analyzes SKU overlap, product counts, and coverage gaps
 */

const fs = require('fs');
const path = require('path');

// Parse CSV properly handling quoted fields
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

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

// Load WooCommerce export
console.log('='.repeat(60));
console.log('WooCommerce Data Comparison Analysis');
console.log('='.repeat(60));
console.log('');

const wooExportPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
const importPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');

console.log('Loading WooCommerce Export...');
const wooExport = parseCSV(wooExportPath);
console.log(`  Loaded ${wooExport.rows.length} rows`);

console.log('Loading Import Data...');
const importData = parseCSV(importPath);
console.log(`  Loaded ${importData.rows.length} rows`);

console.log('');
console.log('─'.repeat(60));
console.log('CURRENT WOOCOMMERCE STATE');
console.log('─'.repeat(60));

// Analyze WooCommerce export
const wooTypes = {};
const wooSKUs = new Set();
const wooProductsWithSKU = [];

for (const row of wooExport.rows) {
  const type = row['Type'] || 'unknown';
  wooTypes[type] = (wooTypes[type] || 0) + 1;
  
  const sku = row['Sku'] || '';
  if (sku) {
    wooSKUs.add(sku.toLowerCase());
    wooProductsWithSKU.push({ sku: sku.toLowerCase(), name: row['Product Name'] });
  }
}

console.log('');
console.log('Product Types:');
Object.entries(wooTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

console.log('');
console.log(`Products with SKU: ${wooSKUs.size}`);

console.log('');
console.log('─'.repeat(60));
console.log('IMPORT DATA STATE');
console.log('─'.repeat(60));

// Analyze import data
const importTypes = {};
const importSKUs = new Set();

for (const row of importData.rows) {
  const type = row['Type'] || 'unknown';
  importTypes[type] = (importTypes[type] || 0) + 1;
  
  const sku = row['SKU'] || '';
  if (sku) {
    importSKUs.add(sku.toLowerCase());
  }
}

console.log('');
console.log('Product Types:');
Object.entries(importTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

console.log('');
console.log(`Products with SKU: ${importSKUs.size}`);

console.log('');
console.log('─'.repeat(60));
console.log('SKU OVERLAP ANALYSIS');
console.log('─'.repeat(60));

// Find overlapping SKUs
const overlappingSKUs = [];
const newSKUs = [];
const importOnlySKUs = [];

for (const sku of importSKUs) {
  if (wooSKUs.has(sku)) {
    overlappingSKUs.push(sku);
  } else {
    newSKUs.push(sku);
  }
}

for (const sku of wooSKUs) {
  if (!importSKUs.has(sku)) {
    importOnlySKUs.push(sku);
  }
}

console.log('');
console.log(`SKUs that will UPDATE existing products: ${overlappingSKUs.length}`);
console.log(`SKUs that will CREATE new products: ${newSKUs.length}`);
console.log(`SKUs in WooCommerce but NOT in import: ${importOnlySKUs.length}`);

console.log('');
console.log('─'.repeat(60));
console.log('MERGE STRATEGY');
console.log('─'.repeat(60));
console.log('');
console.log('Recommended approach:');
console.log('  1. Import with "Update existing products" enabled');
console.log('  2. Match by SKU');
console.log(`  3. ${overlappingSKUs.length} products will be updated with new data`);
console.log(`  4. ${newSKUs.length} new products will be created`);
console.log(`  5. ${importOnlySKUs.length} existing products unchanged`);

// Sample of SKUs that won't be updated
if (importOnlySKUs.length > 0) {
  console.log('');
  console.log('Sample SKUs in WooCommerce NOT in import (first 10):');
  importOnlySKUs.slice(0, 10).forEach(sku => {
    const product = wooProductsWithSKU.find(p => p.sku === sku);
    console.log(`  - ${sku}: ${product ? product.name : 'Unknown'}`);
  });
}

// Coverage summary
console.log('');
console.log('─'.repeat(60));
console.log('COVERAGE SUMMARY');
console.log('─'.repeat(60));

const importWithDesc = importData.rows.filter(r => r['Description']).length;
const importWithWeight = importData.rows.filter(r => r['Weight (lbs)']).length;
const importWithImage = importData.rows.filter(r => r['Images']).length;

console.log('');
console.log('Import Data Coverage:');
console.log(`  With Description: ${importWithDesc} (${((importWithDesc/importData.rows.length)*100).toFixed(1)}%)`);
console.log(`  With Weight: ${importWithWeight} (${((importWithWeight/importData.rows.length)*100).toFixed(1)}%)`);
console.log(`  With Image: ${importWithImage} (${((importWithImage/importData.rows.length)*100).toFixed(1)}%)`);

console.log('');
console.log('Analysis complete!');
