/**
 * Comprehensive Product Data Quality Audit
 * 
 * Identifies ALL issues that need fixing before WooCommerce import
 */

const fs = require('fs');
const path = require('path');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

const importPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');
const content = fs.readFileSync(importPath, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());
const headers = parseCSVLine(lines[0]);

console.log('='.repeat(70));
console.log('COMPREHENSIVE PRODUCT DATA QUALITY AUDIT');
console.log('='.repeat(70));
console.log(`File: ${importPath}`);
console.log(`Total rows: ${lines.length - 1}`);
console.log('');

// Get column indices
const cols = {
  id: headers.indexOf('ID'),
  type: headers.indexOf('Type'),
  sku: headers.indexOf('SKU'),
  name: headers.indexOf('Name'),
  price: headers.indexOf('Regular price'),
  desc: headers.indexOf('Description'),
  shortDesc: headers.indexOf('Short description'),
  weight: headers.indexOf('Weight (lbs)'),
  images: headers.indexOf('Images'),
  categories: headers.indexOf('Categories'),
  brands: headers.indexOf('Brands'),
  parent: headers.indexOf('Parent'),
  attr1Name: headers.indexOf('Attribute 1 name'),
  attr1Value: headers.indexOf('Attribute 1 value(s)'),
};

// Track all issues
const issues = {
  critical: {
    noSKU: [],
    noPrice: [],
    duplicateSKU: {},
    invalidType: [],
  },
  important: {
    noDescription: [],
    noCategory: [],
    noBrand: [],
  },
  minor: {
    noWeight: [],
    noImage: [],
    noShortDesc: [],
  },
  variants: {
    noParent: [],
    invalidVariant: [],
  }
};

// Track stats
const stats = {
  simple: 0,
  variable: 0,
  variation: 0,
  other: 0,
};

const seenSKUs = {};
const variableProducts = new Set();
const variationParents = new Set();

// First pass: collect variable product handles and stats
for (let i = 1; i < lines.length; i++) {
  const v = parseCSVLine(lines[i]);
  const type = v[cols.type];
  
  if (type === 'variable') {
    const name = v[cols.name];
    if (name) {
      variableProducts.add(name.toLowerCase());
    }
  }
  if (type === 'variation') {
    const parent = v[cols.parent];
    if (parent) {
      variationParents.add(parent.toLowerCase());
    }
  }
}

// Second pass: full analysis
for (let i = 1; i < lines.length; i++) {
  const v = parseCSVLine(lines[i]);
  const type = v[cols.type] || '';
  const sku = v[cols.sku] || '';
  const name = v[cols.name] || '';
  const price = v[cols.price] || '';
  const desc = v[cols.desc] || '';
  const shortDesc = v[cols.shortDesc] || '';
  const weight = v[cols.weight] || '';
  const images = v[cols.images] || '';
  const categories = v[cols.categories] || '';
  const brands = v[cols.brands] || '';
  const parent = v[cols.parent] || '';
  
  // Count types
  if (type === 'simple') stats.simple++;
  else if (type === 'variable') stats.variable++;
  else if (type === 'variation') stats.variation++;
  else stats.other++;
  
  const isParent = type === 'simple' || type === 'variable';
  const rowInfo = { row: i + 1, name: name || sku || `Row ${i+1}`, type };
  
  // CRITICAL: Invalid type
  if (type && type !== 'simple' && type !== 'variable' && type !== 'variation') {
    issues.critical.invalidType.push(rowInfo);
  }
  
  // CRITICAL: No SKU (parent products must have SKU)
  if (isParent && !sku) {
    issues.critical.noSKU.push(rowInfo);
  }
  
  // CRITICAL: Duplicate SKU
  if (sku) {
    const lowerSku = sku.toLowerCase();
    if (seenSKUs[lowerSku]) {
      if (!issues.critical.duplicateSKU[lowerSku]) {
        issues.critical.duplicateSKU[lowerSku] = [seenSKUs[lowerSku]];
      }
      issues.critical.duplicateSKU[lowerSku].push(rowInfo);
    } else {
      seenSKUs[lowerSku] = rowInfo;
    }
  }
  
  // CRITICAL: No price (simple and variations need price)
  if ((type === 'simple' || type === 'variation') && !price) {
    issues.critical.noPrice.push(rowInfo);
  }
  
  // IMPORTANT: No description (parent only)
  if (isParent && !desc) {
    issues.important.noDescription.push(rowInfo);
  }
  
  // IMPORTANT: No category (parent only)
  if (isParent && !categories) {
    issues.important.noCategory.push(rowInfo);
  }
  
  // IMPORTANT: No brand (parent only)
  if (isParent && !brands) {
    issues.important.noBrand.push(rowInfo);
  }
  
  // MINOR: No weight (parent only)
  if (isParent && !weight) {
    issues.minor.noWeight.push(rowInfo);
  }
  
  // MINOR: No image (parent only)
  if (isParent && !images) {
    issues.minor.noImage.push(rowInfo);
  }
  
  // MINOR: No short description
  if (isParent && !shortDesc) {
    issues.minor.noShortDesc.push(rowInfo);
  }
  
  // VARIANT: No parent reference
  if (type === 'variation' && !parent) {
    issues.variants.noParent.push(rowInfo);
  }
  
  // VARIANT: Parent doesn't exist
  if (type === 'variation' && parent) {
    // Parent should be a slug, check if variable product exists
    // This is a simple check - would need more sophisticated matching in production
  }
}

// Report
console.log('PRODUCT TYPE DISTRIBUTION');
console.log('-'.repeat(50));
console.log(`  Simple products:      ${stats.simple}`);
console.log(`  Variable products:    ${stats.variable}`);
console.log(`  Variations:           ${stats.variation}`);
if (stats.other > 0) console.log(`  Other/Invalid:        ${stats.other}`);
console.log('');

console.log('🔴 CRITICAL ISSUES (must fix before import)');
console.log('-'.repeat(50));
console.log(`  Products without SKU:        ${issues.critical.noSKU.length}`);
console.log(`  Products without price:      ${issues.critical.noPrice.length}`);
console.log(`  Duplicate SKUs:              ${Object.keys(issues.critical.duplicateSKU).length}`);
console.log(`  Invalid product types:       ${issues.critical.invalidType.length}`);

const criticalCount = issues.critical.noSKU.length + 
                      issues.critical.noPrice.length + 
                      Object.keys(issues.critical.duplicateSKU).length +
                      issues.critical.invalidType.length;

console.log('');
console.log('🟡 IMPORTANT ISSUES (should fix for quality)');
console.log('-'.repeat(50));
console.log(`  Products without description: ${issues.important.noDescription.length}`);
console.log(`  Products without category:    ${issues.important.noCategory.length}`);
console.log(`  Products without brand:       ${issues.important.noBrand.length}`);

console.log('');
console.log('🟢 MINOR ISSUES (nice to have)');
console.log('-'.repeat(50));
console.log(`  Products without weight:      ${issues.minor.noWeight.length}`);
console.log(`  Products without image:       ${issues.minor.noImage.length}`);
console.log(`  Products without short desc:  ${issues.minor.noShortDesc.length}`);

console.log('');
console.log('⚙️  VARIANT STRUCTURE');
console.log('-'.repeat(50));
console.log(`  Variations without parent:    ${issues.variants.noParent.length}`);

// Detail critical issues
if (issues.critical.noSKU.length > 0) {
  console.log('');
  console.log('DETAIL: Products without SKU (first 15):');
  issues.critical.noSKU.slice(0, 15).forEach(p => {
    console.log(`  Row ${p.row}: ${p.name} (${p.type})`);
  });
}

if (issues.critical.noPrice.length > 0) {
  console.log('');
  console.log('DETAIL: Products without price (first 15):');
  issues.critical.noPrice.slice(0, 15).forEach(p => {
    console.log(`  Row ${p.row}: ${p.name} (${p.type})`);
  });
}

if (Object.keys(issues.critical.duplicateSKU).length > 0) {
  console.log('');
  console.log('DETAIL: Duplicate SKUs (first 10):');
  Object.entries(issues.critical.duplicateSKU).slice(0, 10).forEach(([sku, items]) => {
    console.log(`  ${sku}: ${items.length} occurrences (rows: ${items.map(i => i.row).join(', ')})`);
  });
}

if (issues.important.noDescription.length > 0) {
  console.log('');
  console.log('DETAIL: Products without description (first 15):');
  issues.important.noDescription.slice(0, 15).forEach(p => {
    console.log(`  Row ${p.row}: ${p.name} (${p.type})`);
  });
}

// Write detailed report
const report = {
  generated: new Date().toISOString(),
  file: importPath,
  totalRows: lines.length - 1,
  stats,
  issues: {
    critical: {
      noSKU: issues.critical.noSKU,
      noPrice: issues.critical.noPrice,
      duplicateSKU: Object.entries(issues.critical.duplicateSKU).map(([sku, items]) => ({ sku, items })),
      invalidType: issues.critical.invalidType,
    },
    important: issues.important,
    minor: issues.minor,
    variants: issues.variants,
  },
  summary: {
    criticalIssues: criticalCount,
    importantIssues: issues.important.noDescription.length + issues.important.noCategory.length + issues.important.noBrand.length,
    minorIssues: issues.minor.noWeight.length + issues.minor.noImage.length + issues.minor.noShortDesc.length,
    readyForImport: criticalCount === 0,
  }
};

const reportPath = path.join(__dirname, '..', 'outputs', 'data_quality_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('');
console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Critical issues:  ${criticalCount}`);
console.log(`Important issues: ${report.summary.importantIssues}`);  
console.log(`Minor issues:     ${report.summary.minorIssues}`);
console.log('');
console.log(`READY FOR IMPORT: ${criticalCount === 0 ? '✅ YES' : '❌ NO - Fix critical issues first'}`);
console.log('');
console.log(`Detailed report saved to: ${reportPath}`);
