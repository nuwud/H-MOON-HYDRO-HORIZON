#!/usr/bin/env node
/**
 * Analyzes products to find potential missed variant groupings
 * Looks for patterns like:
 * - Similar product names from same vendor
 * - Sequential SKUs
 * - Size variations not in parentheses
 */

const fs = require('fs');
const path = require('path');

// CSV parser
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++; }
        else { inQuotes = false; }
      } else { currentField += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { currentField += char; }
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

const content = fs.readFileSync('outputs/shopify_properly_grouped.csv', 'utf-8');
const rows = parseCSV(content);
const headers = rows[0];

const idx = {};
headers.forEach((h, i) => { idx[h] = i; });

// Get all products (rows with handles)
const products = [];
for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][idx['Handle']] || '';
  if (handle) {
    products.push({
      handle,
      title: rows[i][idx['Title']] || '',
      vendor: rows[i][idx['Vendor']] || '',
      sku: rows[i][idx['Variant SKU']] || '',
      type: rows[i][idx['Type']] || ''
    });
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('     ANALYZING FOR MISSED VARIANT GROUPINGS');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`Total products to analyze: ${products.length}\n`);

// Pattern 1: Products with sizes NOT in parentheses
console.log('📋 PATTERN 1: Size suffixes without parentheses\n');
const sizePatterns = [
  /\s+(1|2|4|5|10|20|25|50|100)\s*(L|lt|liter|gal|gallon|qt|quart|oz|lb|kg|g|ml)$/i,
  /\s+\d+\s*(pack|count|pc)$/i
];

const potentialGroups = new Map();
for (const product of products) {
  let baseName = product.title;
  let sizeSuffix = '';
  
  for (const pattern of sizePatterns) {
    const match = product.title.match(pattern);
    if (match) {
      sizeSuffix = match[0].trim();
      baseName = product.title.replace(pattern, '').trim();
      break;
    }
  }
  
  if (sizeSuffix) {
    const key = `${product.vendor}|${baseName}`;
    if (!potentialGroups.has(key)) {
      potentialGroups.set(key, []);
    }
    potentialGroups.get(key).push({
      ...product,
      extractedBase: baseName,
      extractedSize: sizeSuffix
    });
  }
}

const multiProducts = Array.from(potentialGroups.entries())
  .filter(([_, prods]) => prods.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (multiProducts.length > 0) {
  console.log(`Found ${multiProducts.length} potential product groups:\n`);
  for (const [key, prods] of multiProducts.slice(0, 15)) {
    const [vendor, baseName] = key.split('|');
    console.log(`${baseName} (${vendor}) - ${prods.length} variants`);
    prods.forEach(p => {
      console.log(`  - ${p.title} → Size: ${p.extractedSize}`);
    });
    console.log();
  }
  if (multiProducts.length > 15) {
    console.log(`... and ${multiProducts.length - 15} more groups\n`);
  }
} else {
  console.log('✓ No patterns found\n');
}

// Pattern 2: Very similar titles from same vendor
console.log('📋 PATTERN 2: Similar titles (same vendor)\n');

function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDist = levenshtein(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDist) / longer.length;
}

function levenshtein(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Group by vendor
const byVendor = new Map();
for (const product of products) {
  if (!byVendor.has(product.vendor)) {
    byVendor.set(product.vendor, []);
  }
  byVendor.get(product.vendor).push(product);
}

const similarGroups = [];
for (const [vendor, prods] of byVendor.entries()) {
  if (prods.length < 2) continue;
  
  // Compare each product with others
  for (let i = 0; i < prods.length; i++) {
    for (let j = i + 1; j < prods.length; j++) {
      const sim = similarity(prods[i].title, prods[j].title);
      if (sim >= 0.75 && sim < 1.0) { // 75%+ similar but not identical
        similarGroups.push({
          vendor,
          similarity: sim,
          products: [prods[i], prods[j]]
        });
      }
    }
  }
}

similarGroups.sort((a, b) => b.similarity - a.similarity);

if (similarGroups.length > 0) {
  console.log(`Found ${similarGroups.length} potential similar product pairs:\n`);
  for (const group of similarGroups.slice(0, 10)) {
    console.log(`${group.vendor} (${(group.similarity * 100).toFixed(1)}% similar)`);
    group.products.forEach(p => {
      console.log(`  - ${p.title}`);
    });
    console.log();
  }
  if (similarGroups.length > 10) {
    console.log(`... and ${similarGroups.length - 10} more pairs\n`);
  }
} else {
  console.log('✓ No highly similar products found\n');
}

// Pattern 3: Sequential SKUs
console.log('📋 PATTERN 3: Sequential/related SKUs\n');

const skuGroups = new Map();
for (const product of products) {
  if (!product.sku) continue;
  
  // Extract base SKU (remove numbers and common suffixes)
  const baseSku = product.sku.replace(/[-_]?\d+[a-z]*$/i, '').replace(/[-_]?(sm|md|lg|xl|s|m|l)$/i, '');
  
  if (baseSku.length >= 3 && baseSku !== product.sku) {
    if (!skuGroups.has(baseSku)) {
      skuGroups.set(baseSku, []);
    }
    skuGroups.get(baseSku).push(product);
  }
}

const multiSkus = Array.from(skuGroups.entries())
  .filter(([_, prods]) => prods.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (multiSkus.length > 0) {
  console.log(`Found ${multiSkus.length} SKU pattern groups:\n`);
  for (const [baseSku, prods] of multiSkus.slice(0, 10)) {
    console.log(`Base SKU: ${baseSku} - ${prods.length} products`);
    prods.forEach(p => {
      console.log(`  - ${p.title} (SKU: ${p.sku})`);
    });
    console.log();
  }
  if (multiSkus.length > 10) {
    console.log(`... and ${multiSkus.length - 10} more groups\n`);
  }
} else {
  console.log('✓ No sequential SKU patterns found\n');
}

// Summary
console.log('═══════════════════════════════════════════════════════════════');
console.log('                         SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total potential missed groupings:`);
console.log(`  - Size suffix pattern: ${multiProducts.length} groups`);
console.log(`  - Similar titles: ${similarGroups.length} pairs`);
console.log(`  - SKU patterns: ${multiSkus.length} groups`);
console.log();

const totalPotential = multiProducts.length + similarGroups.length + multiSkus.length;
if (totalPotential > 0) {
  console.log(`⚠️  Recommend manual review of these ${totalPotential} potential groupings`);
} else {
  console.log(`✓ No obvious missed groupings detected`);
}
console.log('═══════════════════════════════════════════════════════════════');
