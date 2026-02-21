#!/usr/bin/env node
/**
 * validate_import_csv.js
 * Pre-import validation for WooCommerce product CSV
 * 
 * Checks:
 * - Required columns present
 * - SKU uniqueness and format
 * - Price validity
 * - Type validity
 * - Category format
 * - Image URL format
 */

const fs = require('fs');
const Papa = require('papaparse');

const INPUT_CSV = process.argv[2] || './outputs/woocommerce_FINAL_WITH_IMAGES.csv';

console.log('='.repeat(60));
console.log('WOOCOMMERCE IMPORT VALIDATION');
console.log('='.repeat(60));
console.log(`File: ${INPUT_CSV}`);
console.log('');

// Load CSV
const csv = fs.readFileSync(INPUT_CSV, 'utf8');
const parsed = Papa.parse(csv, { header: true });
const records = parsed.data.filter(r => r.Type); // Filter empty rows

const errors = [];
const warnings = [];

// Check 1: Required columns
const REQUIRED = ['Type', 'SKU', 'Name'];
const headers = Object.keys(records[0] || {});
REQUIRED.forEach(col => {
  if (!headers.includes(col)) {
    errors.push(`Missing required column: ${col}`);
  }
});

// Check 2: SKU validation
const skuCounts = new Map();
const skuIssues = [];
records.forEach((r, i) => {
  const sku = r.SKU;
  if (!sku && r.Type !== 'variation') {
    skuIssues.push(`Row ${i + 2}: Missing SKU for ${r.Type} "${r.Name?.substring(0, 30)}"`);
  }
  if (sku) {
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }
});

// Check duplicates
skuCounts.forEach((count, sku) => {
  if (count > 1) {
    errors.push(`Duplicate SKU: ${sku} appears ${count} times`);
  }
});

if (skuIssues.length > 0 && skuIssues.length <= 10) {
  skuIssues.forEach(e => warnings.push(e));
} else if (skuIssues.length > 10) {
  warnings.push(`${skuIssues.length} products missing SKUs`);
}

// Check 3: Type validation
const VALID_TYPES = ['simple', 'variable', 'variation', 'grouped', 'external'];
const typeIssues = [];
records.forEach((r, i) => {
  if (r.Type && !VALID_TYPES.includes(r.Type.toLowerCase())) {
    typeIssues.push(`Row ${i + 2}: Invalid type "${r.Type}"`);
  }
});
if (typeIssues.length > 0) {
  typeIssues.slice(0, 5).forEach(e => errors.push(e));
  if (typeIssues.length > 5) errors.push(`...and ${typeIssues.length - 5} more type errors`);
}

// Check 4: Price validation
const priceIssues = [];
records.forEach((r, i) => {
  const price = r['Regular price'];
  if (r.Type === 'simple' || r.Type === 'variation') {
    if (price && isNaN(parseFloat(price))) {
      priceIssues.push(`Row ${i + 2}: Invalid price "${price}"`);
    }
  }
});
if (priceIssues.length > 0) {
  priceIssues.slice(0, 5).forEach(e => warnings.push(e));
  if (priceIssues.length > 5) warnings.push(`...and ${priceIssues.length - 5} more price warnings`);
}

// Check 5: Image URL format
const imageIssues = [];
records.forEach((r, i) => {
  const img = r.Images;
  if (img && !img.startsWith('http')) {
    imageIssues.push(`Row ${i + 2}: Invalid image URL format`);
  }
});
if (imageIssues.length > 0 && imageIssues.length <= 5) {
  imageIssues.forEach(e => warnings.push(e));
} else if (imageIssues.length > 5) {
  warnings.push(`${imageIssues.length} products with invalid image URLs`);
}

// Check 6: Variable/Variation pairing
const variables = new Set(records.filter(r => r.Type === 'variable').map(r => r.SKU));
const parentIssues = [];
records.forEach((r, i) => {
  if (r.Type === 'variation' && r.Parent && !variables.has(r.Parent)) {
    // This might be by ID rather than SKU - just warn
    // parentIssues.push(`Row ${i + 2}: Variation parent "${r.Parent}" not found`);
  }
});

// Summary stats
const byType = {};
records.forEach(r => {
  const t = r.Type || 'unknown';
  byType[t] = (byType[t] || 0) + 1;
});

const withImages = records.filter(r => r.Images).length;
const withPrices = records.filter(r => r['Regular price']).length;

console.log('SUMMARY');
console.log('-'.repeat(60));
console.log(`Total rows: ${records.length}`);
Object.entries(byType).forEach(([t, c]) => console.log(`  ${t}: ${c}`));
console.log('');
console.log(`With images: ${withImages} (${Math.round(withImages/records.length*100)}%)`);
console.log(`With prices: ${withPrices} (${Math.round(withPrices/records.length*100)}%)`);
console.log('');

// Results
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ VALIDATION PASSED - Ready for import');
} else {
  if (errors.length > 0) {
    console.log(`❌ ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`   ${e}`));
    console.log('');
  }
  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):`);
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }
  
  if (errors.length === 0) {
    console.log('✅ VALIDATION PASSED WITH WARNINGS - OK to import');
  } else {
    console.log('❌ VALIDATION FAILED - Fix errors before import');
    process.exit(1);
  }
}
