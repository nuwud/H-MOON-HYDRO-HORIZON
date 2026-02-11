/**
 * Final Data Quality Report
 * 
 * Quick validation of the fixed import file
 */

const fs = require('fs');
const path = require('path');

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

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const importFile = path.join(BASE, 'outputs/woocommerce_import_with_prices.csv');

const data = fs.readFileSync(importFile, 'utf-8');
const lines = data.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

// Column indices
const cols = {
  type: header.indexOf('Type'),
  sku: header.indexOf('SKU'),
  name: header.indexOf('Name'),
  price: header.indexOf('Regular price'),
  desc: header.indexOf('Short description'),
  fullDesc: header.indexOf('Description'),
  weight: header.indexOf('Weight (lbs)'),
  image: header.indexOf('Images'),
  cats: header.indexOf('Categories'),
  brand: header.indexOf('Brands'),
  parent: header.indexOf('Parent'),
};

console.log('=== FINAL DATA QUALITY REPORT ===\n');
console.log(`File: ${importFile}\n`);

// Stats by type
const stats = {
  simple: { total: 0, withSku: 0, withPrice: 0, withDesc: 0, withWeight: 0, withImage: 0, withCat: 0, withBrand: 0 },
  variable: { total: 0, withSku: 0, withPrice: 0, withDesc: 0, withWeight: 0, withImage: 0, withCat: 0, withBrand: 0 },
  variation: { total: 0, withSku: 0, withPrice: 0, withDesc: 0, withWeight: 0, withImage: 0, withCat: 0, withBrand: 0 },
};

const issues = {
  missingPrice: [],
  missingSku: [],
  missingDesc: [],
  missingWeight: [],
  missingImage: [],
  missingCat: [],
  missingBrand: [],
};

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const type = row[cols.type];
  const sku = row[cols.sku]?.trim();
  const name = row[cols.name]?.trim();
  const price = row[cols.price]?.trim();
  const desc = row[cols.desc]?.trim() || row[cols.fullDesc]?.trim();
  const weight = row[cols.weight]?.trim();
  const image = row[cols.image]?.trim();
  const cats = row[cols.cats]?.trim();
  const brand = row[cols.brand]?.trim();
  
  const s = stats[type];
  if (!s) continue;
  
  s.total++;
  if (sku) s.withSku++;
  else if (type !== 'variable') issues.missingSku.push({ type, name: name?.substring(0, 50) });
  
  if (price) s.withPrice++;
  else if (type !== 'variable') issues.missingPrice.push({ type, sku, name: name?.substring(0, 50) });
  
  if (desc) s.withDesc++;
  else if (type !== 'variation') issues.missingDesc.push({ type, sku, name: name?.substring(0, 50) });
  
  if (weight && weight !== '0' && weight !== '0.00') s.withWeight++;
  else if (type !== 'variable') issues.missingWeight.push({ type, sku, name: name?.substring(0, 50) });
  
  if (image) s.withImage++;
  else issues.missingImage.push({ type, sku, name: name?.substring(0, 50) });
  
  if (cats) s.withCat++;
  else if (type !== 'variation') issues.missingCat.push({ type, sku, name: name?.substring(0, 50) });
  
  if (brand) s.withBrand++;
  else if (type !== 'variation') issues.missingBrand.push({ type, sku, name: name?.substring(0, 50) });
}

// Summary table
console.log('PRODUCT COUNTS BY TYPE');
console.log('═'.repeat(60));
console.log(`  Simple products:   ${stats.simple.total}`);
console.log(`  Variable products: ${stats.variable.total}`);
console.log(`  Variations:        ${stats.variation.total}`);
console.log(`  TOTAL:             ${stats.simple.total + stats.variable.total + stats.variation.total}`);

console.log('\n\nDATA COVERAGE (% complete)');
console.log('═'.repeat(60));

function pct(have, total) {
  if (total === 0) return '--';
  return ((have / total) * 100).toFixed(1) + '%';
}

console.log('                Simple      Variable    Variation');
console.log('─'.repeat(60));
console.log(`SKU:            ${pct(stats.simple.withSku, stats.simple.total).padStart(8)}     ${pct(stats.variable.withSku, stats.variable.total).padStart(8)}     ${pct(stats.variation.withSku, stats.variation.total).padStart(8)}`);
console.log(`Price:          ${pct(stats.simple.withPrice, stats.simple.total).padStart(8)}     n/a          ${pct(stats.variation.withPrice, stats.variation.total).padStart(8)}`);
console.log(`Description:    ${pct(stats.simple.withDesc, stats.simple.total).padStart(8)}     ${pct(stats.variable.withDesc, stats.variable.total).padStart(8)}     n/a`);
console.log(`Weight:         ${pct(stats.simple.withWeight, stats.simple.total).padStart(8)}     n/a          ${pct(stats.variation.withWeight, stats.variation.total).padStart(8)}`);
console.log(`Image:          ${pct(stats.simple.withImage, stats.simple.total).padStart(8)}     ${pct(stats.variable.withImage, stats.variable.total).padStart(8)}     ${pct(stats.variation.withImage, stats.variation.total).padStart(8)}`);
console.log(`Category:       ${pct(stats.simple.withCat, stats.simple.total).padStart(8)}     ${pct(stats.variable.withCat, stats.variable.total).padStart(8)}     n/a`);
console.log(`Brand:          ${pct(stats.simple.withBrand, stats.simple.total).padStart(8)}     ${pct(stats.variable.withBrand, stats.variable.total).padStart(8)}     n/a`);

console.log('\n\nISSUES SUMMARY');
console.log('═'.repeat(60));
console.log(`  CRITICAL:`);
console.log(`    Missing SKU:         ${issues.missingSku.length} ${issues.missingSku.length === 0 ? '✅' : '❌'}`);
console.log(`    Missing Price:       ${issues.missingPrice.length} ${issues.missingPrice.length === 0 ? '✅' : '❌'}`);
console.log(`  IMPORTANT:`);
console.log(`    Missing Description: ${issues.missingDesc.length}`);
console.log(`    Missing Category:    ${issues.missingCat.length}`);
console.log(`    Missing Brand:       ${issues.missingBrand.length}`);
console.log(`  MINOR:`);
console.log(`    Missing Weight:      ${issues.missingWeight.length}`);
console.log(`    Missing Image:       ${issues.missingImage.length}`);

// Overall readiness
const criticalIssues = issues.missingSku.length + issues.missingPrice.length;

console.log('\n\n' + '═'.repeat(60));
if (criticalIssues === 0) {
  console.log('✅ IMPORT READY - No critical issues');
  console.log('\nThe file can be imported to WooCommerce. Minor issues');
  console.log('(weights, images, brands) can be fixed post-import.');
} else {
  console.log('❌ NOT READY - Critical issues must be fixed');
}
console.log('═'.repeat(60));
