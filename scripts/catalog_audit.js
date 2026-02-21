#!/usr/bin/env node
/**
 * Catalog Structure Audit
 * Analyzes WooCommerce import file for structural integrity
 */

const fs = require('fs');
const path = require('path');

// Simple CSV parser
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
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

const csvPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');
const data = fs.readFileSync(csvPath, 'utf8');
const records = parseCSV(data);

console.log('=' .repeat(60));
console.log('H-MOON HYDRO CATALOG STRUCTURE AUDIT');
console.log('=' .repeat(60));
console.log(`File: woocommerce_import_ready.csv`);
console.log(`Total Rows: ${records.length}`);
console.log('');

// 1. Product Type Distribution
console.log('─'.repeat(60));
console.log('1. PRODUCT TYPE DISTRIBUTION');
console.log('─'.repeat(60));
const types = {};
records.forEach(r => {
  const t = r.Type || 'EMPTY';
  types[t] = (types[t] || 0) + 1;
});
Object.entries(types).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
  const pct = ((count / records.length) * 100).toFixed(1);
  console.log(`  ${type.padEnd(15)} ${String(count).padStart(5)}  (${pct}%)`);
});

// 2. Attribute Standardization Analysis
console.log('\n' + '─'.repeat(60));
console.log('2. ATTRIBUTE STANDARDIZATION');
console.log('─'.repeat(60));
const attrNames = {};
const attrValues = {};
records.forEach(r => {
  for (let i = 1; i <= 3; i++) {
    const name = r[`Attribute ${i} name`];
    const value = r[`Attribute ${i} value(s)`];
    if (name) {
      attrNames[name] = (attrNames[name] || 0) + 1;
      if (!attrValues[name]) attrValues[name] = new Set();
      if (value) {
        value.split('|').forEach(v => attrValues[name].add(v.trim()));
      }
    }
  }
});
console.log('Attribute Names Used:');
Object.entries(attrNames).sort((a,b) => b[1] - a[1]).forEach(([name, count]) => {
  const values = attrValues[name] ? [...attrValues[name]].slice(0, 10).join(', ') : '';
  console.log(`  ${name.padEnd(20)} ${String(count).padStart(4)} products`);
  if (values) console.log(`    Sample values: ${values.substring(0, 60)}...`);
});

// Check for attribute problems
const variableProducts = records.filter(r => r.Type === 'variable');
const variations = records.filter(r => r.Type === 'variation');
const parentsWithoutAttr = variableProducts.filter(r => !r['Attribute 1 name']).length;
const variationsWithoutAttr = variations.filter(r => !r['Attribute 1 name'] && !r['Attribute 1 value(s)']).length;

console.log('\nAttribute Issues:');
console.log(`  Variable products without attributes: ${parentsWithoutAttr}`);
console.log(`  Variations without attribute values: ${variationsWithoutAttr}`);

// 3. SKU Integrity
console.log('\n' + '─'.repeat(60));
console.log('3. SKU INTEGRITY');
console.log('─'.repeat(60));
const skus = records.map(r => r.SKU).filter(s => s && s.trim());
const skuCounts = {};
skus.forEach(s => { skuCounts[s] = (skuCounts[s] || 0) + 1; });
const duplicates = Object.entries(skuCounts).filter(([s, c]) => c > 1);
const blankSkus = records.filter(r => !r.SKU || !r.SKU.trim()).length;

console.log(`  Total rows with SKU:    ${skus.length}`);
console.log(`  Unique SKUs:            ${Object.keys(skuCounts).length}`);
console.log(`  Blank/Empty SKUs:       ${blankSkus}`);
console.log(`  Duplicate SKU entries:  ${duplicates.length}`);

if (duplicates.length > 0) {
  console.log('\n  Sample Duplicates (first 10):');
  duplicates.slice(0, 10).forEach(([sku, count]) => {
    console.log(`    ${sku} appears ${count} times`);
  });
}

// 4. Variable/Variation Linkage
console.log('\n' + '─'.repeat(60));
console.log('4. VARIABLE PRODUCT STRUCTURE');
console.log('─'.repeat(60));
const parentSlugs = new Map();
variableProducts.forEach(p => {
  // Try to derive slug from Name
  const slug = p.Name ? p.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : '';
  if (slug) parentSlugs.set(slug, p.SKU);
});

const linkedVariations = variations.filter(v => v.Parent && v.Parent.trim());
const orphanVariations = variations.filter(v => !v.Parent || !v.Parent.trim());

console.log(`  Variable (parent) products: ${variableProducts.length}`);
console.log(`  Variation rows:             ${variations.length}`);
console.log(`  Variations with Parent set: ${linkedVariations.length}`);
console.log(`  Orphan variations:          ${orphanVariations.length}`);

// Check variation-to-parent ratio
const variationsPerParent = {};
linkedVariations.forEach(v => {
  variationsPerParent[v.Parent] = (variationsPerParent[v.Parent] || 0) + 1;
});
const avgVariations = Object.values(variationsPerParent).reduce((a,b) => a+b, 0) / Object.keys(variationsPerParent).length || 0;
console.log(`  Avg variations per parent:  ${avgVariations.toFixed(1)}`);

// 5. Category Analysis
console.log('\n' + '─'.repeat(60));
console.log('5. CATEGORY TAXONOMY');
console.log('─'.repeat(60));
const topLevelCats = {};
const fullCatPaths = new Set();
const productsNoCat = [];
records.filter(r => r.Type !== 'variation').forEach(r => {
  const cats = r.Categories || '';
  if (!cats.trim()) {
    productsNoCat.push(r.SKU);
    return;
  }
  cats.split(',').forEach(cat => {
    const trimmed = cat.trim();
    if (!trimmed) return;
    fullCatPaths.add(trimmed);
    const topLevel = trimmed.split('>')[0].trim();
    topLevelCats[topLevel] = (topLevelCats[topLevel] || 0) + 1;
  });
});

console.log('Top-Level Categories:');
Object.entries(topLevelCats).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`  ${cat.padEnd(35)} ${count}`);
});
console.log(`\n  Total unique category paths: ${fullCatPaths.size}`);
console.log(`  Products without categories: ${productsNoCat.length}`);

// 6. Price Analysis
console.log('\n' + '─'.repeat(60));
console.log('6. PRICE COVERAGE');
console.log('─'.repeat(60));
let withPrice = 0, withoutPrice = 0, zeroPrice = 0;
records.filter(r => r.Type !== 'variation').forEach(r => {
  const price = r['Regular price'];
  if (!price || price.trim() === '') withoutPrice++;
  else if (parseFloat(price) === 0) zeroPrice++;
  else withPrice++;
});
console.log(`  Products with valid price:  ${withPrice}`);
console.log(`  Products missing price:     ${withoutPrice}`);
console.log(`  Products with $0 price:     ${zeroPrice}`);

// 7. Image Analysis
console.log('\n' + '─'.repeat(60));
console.log('7. IMAGE COVERAGE');
console.log('─'.repeat(60));
let noImage = 0, hmoonImages = 0, shopifyImages = 0, externalImages = 0;
records.forEach(r => {
  const img = r.Images || '';
  if (!img.trim()) noImage++;
  else if (img.includes('hmoonhydro.com')) hmoonImages++;
  else if (img.includes('cdn.shopify.com')) shopifyImages++;
  else externalImages++;
});
console.log(`  Products without images:    ${noImage}`);
console.log(`  Images from hmoonhydro.com: ${hmoonImages}`);
console.log(`  Images from Shopify CDN:    ${shopifyImages}`);
console.log(`  External source images:     ${externalImages}`);

// 8. Brand Analysis
console.log('\n' + '─'.repeat(60));
console.log('8. BRAND COVERAGE');
console.log('─'.repeat(60));
const brands = {};
records.filter(r => r.Type !== 'variation').forEach(r => {
  const brand = r.Brands || 'MISSING';
  brands[brand] = (brands[brand] || 0) + 1;
});
console.log(`  Unique brands: ${Object.keys(brands).length}`);
console.log('  Top 15 brands:');
Object.entries(brands).sort((a,b) => b[1] - a[1]).slice(0, 15).forEach(([brand, count]) => {
  console.log(`    ${brand.padEnd(30)} ${count}`);
});

// 9. Description Analysis
console.log('\n' + '─'.repeat(60));
console.log('9. DESCRIPTION QUALITY');
console.log('─'.repeat(60));
let noDesc = 0, shortDesc = 0, medDesc = 0, longDesc = 0;
records.filter(r => r.Type !== 'variation').forEach(r => {
  const desc = (r.Description || '').length;
  if (desc === 0) noDesc++;
  else if (desc < 100) shortDesc++;
  else if (desc < 500) medDesc++;
  else longDesc++;
});
console.log(`  No description:             ${noDesc}`);
console.log(`  Short (<100 chars):         ${shortDesc}`);
console.log(`  Medium (100-500 chars):     ${medDesc}`);
console.log(`  Long (>500 chars):          ${longDesc}`);

// 10. Summary Score
console.log('\n' + '='.repeat(60));
console.log('CATALOG MATURITY SCORECARD');
console.log('='.repeat(60));

const simpleCount = types.simple || 0;
const variableCount = types.variable || 0;
const variationCount = types.variation || 0;
const totalProducts = simpleCount + variableCount;

const scores = {
  'SKU Integrity': (Object.keys(skuCounts).length / records.length) * 100,
  'Price Coverage': (withPrice / totalProducts) * 100,
  'Category Coverage': ((totalProducts - productsNoCat.length) / totalProducts) * 100,
  'Image Coverage': ((records.length - noImage) / records.length) * 100,
  'Variable Structure': linkedVariations.length > 0 ? (linkedVariations.length / variations.length) * 100 : 100,
  'Attribute Standardization': variableProducts.length > 0 ? ((variableProducts.length - parentsWithoutAttr) / variableProducts.length) * 100 : 100,
  'Description Coverage': ((totalProducts - noDesc) / totalProducts) * 100
};

let totalScore = 0;
Object.entries(scores).forEach(([metric, score]) => {
  const displayScore = Math.min(100, score).toFixed(0);
  const status = score >= 90 ? '✅' : score >= 70 ? '⚠️' : '❌';
  console.log(`  ${status} ${metric.padEnd(25)} ${displayScore}%`);
  totalScore += Math.min(100, score);
});

const overallScore = (totalScore / Object.keys(scores).length).toFixed(0);
console.log('─'.repeat(60));
console.log(`  OVERALL MATURITY SCORE: ${overallScore}%`);
console.log('');

// Critical Issues Summary
console.log('CRITICAL ISSUES TO ADDRESS:');
if (duplicates.length > 0) console.log(`  ❌ ${duplicates.length} duplicate SKUs need resolution`);
if (orphanVariations.length > 0) console.log(`  ❌ ${orphanVariations.length} orphan variations (no parent linkage)`);
if (parentsWithoutAttr > 0) console.log(`  ❌ ${parentsWithoutAttr} variable products missing attributes`);
if (productsNoCat.length > 0) console.log(`  ⚠️ ${productsNoCat.length} products without categories`);
if (noImage > 0) console.log(`  ⚠️ ${noImage} products without images`);
if (withoutPrice > 0) console.log(`  ❌ ${withoutPrice} products missing prices`);

console.log('\n' + '='.repeat(60));
