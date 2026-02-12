/**
 * Fix HMH00000 Placeholder SKUs
 * 
 * Generates unique SKUs for variations that have placeholder HMH00000-VXX SKUs
 * by combining parent handle + variant suffix
 * 
 * Usage: node scripts/fix_placeholder_skus.js
 * Output: outputs/PLACEHOLDER_SKU_FIXES.csv (for WooCommerce import)
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../outputs/WOOCOMMERCE_IMPORT_WITH_SHIPPING.csv');
const OUTPUT_FILE = path.join(__dirname, '../outputs/PLACEHOLDER_SKU_FIXES.csv');

// Read and parse CSV
const content = fs.readFileSync(INPUT_FILE, 'utf8');
const lines = content.split('\n');
const header = lines[0];

// Parse header to find column indices
const headerCols = header.split(',');
const skuIdx = headerCols.indexOf('SKU');
const parentIdx = headerCols.findIndex(h => h.toLowerCase().includes('parent'));

console.log('Scanning for placeholder SKUs...\n');

const fixes = [];
const parentCounters = {};

lines.forEach((line, lineNum) => {
  if (lineNum === 0) return; // Skip header
  if (!line.includes('HMH00000')) return;
  
  // Extract parent handle - look for pattern like ,,,parent-handle,,
  const parentMatch = line.match(/,,,([a-z0-9][a-z0-9-]+),,/i);
  if (!parentMatch) {
    console.log(`Line ${lineNum}: Could not find parent handle`);
    return;
  }
  
  const parentHandle = parentMatch[1];
  
  // Extract current SKU
  const skuMatch = line.match(/HMH00000-V(\d+)/);
  if (!skuMatch) return;
  
  const variantNum = skuMatch[1];
  
  // Generate new unique SKU based on parent handle
  // Format: PARENT-VXXX (e.g., silicium-bloom-V01)
  const handlePrefix = parentHandle
    .replace(/-/g, '')
    .substring(0, 8)
    .toUpperCase();
  
  // Track counter per parent to ensure uniqueness
  if (!parentCounters[parentHandle]) {
    parentCounters[parentHandle] = 0;
  }
  parentCounters[parentHandle]++;
  
  const newSku = `${handlePrefix}-V${String(parentCounters[parentHandle]).padStart(2, '0')}`;
  
  fixes.push({
    oldSku: `HMH00000-V${variantNum}`,
    newSku: newSku,
    parent: parentHandle,
    lineNum: lineNum
  });
});

console.log(`Found ${fixes.length} placeholder SKUs to fix\n`);

// Group by parent for display
const byParent = {};
fixes.forEach(f => {
  if (!byParent[f.parent]) byParent[f.parent] = [];
  byParent[f.parent].push(f);
});

console.log('By parent product:');
Object.entries(byParent).forEach(([parent, items]) => {
  console.log(`  ${parent}: ${items.length} variations`);
  items.forEach(i => console.log(`    ${i.oldSku} → ${i.newSku}`));
});

// Create WooCommerce import CSV with just the SKU updates
const importRows = ['SKU,Meta: _old_sku,Parent'];
fixes.forEach(f => {
  importRows.push(`${f.newSku},${f.oldSku},${f.parent}`);
});

fs.writeFileSync(OUTPUT_FILE, importRows.join('\n'));

console.log(`\n✅ Created: ${OUTPUT_FILE}`);
console.log(`\nTo apply these fixes in WooCommerce:`);
console.log(`1. Go to Products → All Products`);
console.log(`2. Filter by "HMH00000" in SKU search`);
console.log(`3. Use Bulk Edit to update SKUs manually`);
console.log(`\nOr use WP-CLI:`);
console.log(`wp db query "UPDATE wp_postmeta SET meta_value='NEW_SKU' WHERE meta_key='_sku' AND meta_value='OLD_SKU';"`);

// Also create a SQL script for direct database fix
const sqlFile = path.join(__dirname, '../outputs/fix_placeholder_skus.sql');
const sqlLines = ['-- Fix placeholder SKUs in WooCommerce database', '-- Run with: wp db query < fix_placeholder_skus.sql', ''];
fixes.forEach(f => {
  sqlLines.push(`UPDATE wp_postmeta SET meta_value='${f.newSku}' WHERE meta_key='_sku' AND meta_value='${f.oldSku}' LIMIT 1;`);
});
fs.writeFileSync(sqlFile, sqlLines.join('\n'));
console.log(`\n✅ Created: ${sqlFile}`);
