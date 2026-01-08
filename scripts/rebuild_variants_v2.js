#!/usr/bin/env node
/**
 * rebuild_variants_v2.js
 * 
 * Properly groups variants by matching WooCommerce grouped products with enriched CSV
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const WOO_CSV = path.join(BASE, 'CSVs/Products-Export-2025-Oct-29-171532.csv');
const CURRENT_CSV = path.join(BASE, 'outputs/shopify_final_fixed.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_properly_grouped.csv');

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

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Generate handle from title
function generateHandle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 255);
}

// Normalize title for matching (case-insensitive, remove extra spaces)
function normalize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Extract size from title
function extractSize(title) {
  // Look for content in parentheses
  const parenMatch = title.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  
  // Look for size patterns
  const sizeMatch = title.match(/([\d.]+\s*(qt|quart|gal|gallon|lb|lbs|g|oz|ml|l|liter))/i);
  if (sizeMatch) return sizeMatch[1].trim();
  
  return 'Default';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     REBUILD WITH PROPER VARIANT GROUPING V2');
  console.log('═══════════════════════════════════════════════════════════════\\n');

  // Read WooCommerce export
  console.log('📄 Reading WooCommerce export...');
  const wooContent = fs.readFileSync(WOO_CSV, 'utf-8');
  const wooRows = parseCSV(wooContent);
  const wooHeader = wooRows[0];
  
  const wooIdx = {
    name: wooHeader.indexOf('Product Name'),
    type: wooHeader.indexOf('Type'),
    grouped: wooHeader.indexOf('Grouped products')
  };
  
  // Build variant groups: parent name -> array of child names
  const variantGroups = [];
  for (let i = 1; i < wooRows.length; i++) {
    const type = wooRows[i][wooIdx.type] || '';
    if (type === 'grouped') {
      const parentName = wooRows[i][wooIdx.name] || '';
      const groupedStr = wooRows[i][wooIdx.grouped] || '';
      if (groupedStr) {
        const children = groupedStr.split('|~|').map(c => c.trim()).filter(Boolean);
        variantGroups.push({
          parent: parentName,
          parentHandle: generateHandle(parentName),
          children: children
        });
      }
    }
  }
  
  console.log(`   Found ${variantGroups.length} variant groups\\n`);

  // Read enriched CSV
  console.log('📄 Reading enriched CSV...');
  const currentContent = fs.readFileSync(CURRENT_CSV, 'utf-8');
  const currentRows = parseCSV(currentContent);
  const currentHeader = currentRows[0];
  
  const currentIdx = {};
  currentHeader.forEach((h, i) => {
    currentIdx[h] = i;
  });
  
  console.log(`   ${currentRows.length - 1} rows with enrichments\\n`);

  // Build lookup: normalized title -> row index
  const titleToRow = new Map();
  for (let i = 1; i < currentRows.length; i++) {
    const title = currentRows[i][currentIdx['Title']] || '';
    titleToRow.set(normalize(title), i);
  }

  // Build consolidated output
  console.log('🔄 Consolidating variants...');
  const outputRows = [currentHeader];
  const processedRows = new Set();
  let groupedCount = 0;
  let totalVariants = 0;

  // Process each variant group
  for (const group of variantGroups) {
    const matchedRows = [];
    
    // Find rows that match the children
    for (const childName of group.children) {
      const normChild = normalize(childName);
      if (titleToRow.has(normChild)) {
        matchedRows.push(titleToRow.get(normChild));
      }
    }

    // Only group if we have 2+ variants (otherwise leave as single product)
    if (matchedRows.length >= 2) {
      // Sort by title
      matchedRows.sort((a, b) => {
        const titleA = currentRows[a][currentIdx['Title']] || '';
        const titleB = currentRows[b][currentIdx['Title']] || '';
        return titleA.localeCompare(titleB);
      });

      // First row gets full product data
      const firstRow = [...currentRows[matchedRows[0]]];
      firstRow[currentIdx['Handle']] = group.parentHandle;
      firstRow[currentIdx['Title']] = group.parent;
      firstRow[currentIdx['Option1 Name']] = 'Size';
      firstRow[currentIdx['Option1 Value']] = extractSize(currentRows[matchedRows[0]][currentIdx['Title']]);
      outputRows.push(firstRow);
      processedRows.add(matchedRows[0]);

      // Additional variants
      for (let i = 1; i < matchedRows.length; i++) {
        const varRow = [...currentRows[matchedRows[i]]];
        varRow[currentIdx['Handle']] = '';
        varRow[currentIdx['Title']] = '';
        varRow[currentIdx['Body (HTML)']] = '';
        varRow[currentIdx['Vendor']] = '';
        varRow[currentIdx['Product Category']] = '';
        varRow[currentIdx['Type']] = '';
        varRow[currentIdx['Tags']] = '';
        varRow[currentIdx['Option1 Name']] = '';
        varRow[currentIdx['Option1 Value']] = extractSize(currentRows[matchedRows[i]][currentIdx['Title']]);
        outputRows.push(varRow);
        processedRows.add(matchedRows[i]);
      }

      groupedCount++;
      totalVariants += matchedRows.length;
    }
  }

  // Add remaining ungrouped products
  let singleCount = 0;
  for (let i = 1; i < currentRows.length; i++) {
    if (!processedRows.has(i)) {
      outputRows.push(currentRows[i]);
      singleCount++;
    }
  }

  console.log(`   Grouped products: ${groupedCount} (${totalVariants} variants)`);
  console.log(`   Single products: ${singleCount}\\n`);

  // Write output
  console.log('💾 Writing output...');
  const output = outputRows.map(row => row.map(escapeCSV).join(',')).join('\\n');
  fs.writeFileSync(OUTPUT_CSV, output);
  console.log(`   Saved to: ${OUTPUT_CSV}\\n`);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Input rows: ${currentRows.length - 1}`);
  console.log(`   Output rows: ${outputRows.length - 1}`);
  console.log(`   Unique products: ${groupedCount + singleCount}`);
  console.log(`   Multi-variant products: ${groupedCount}`);
  console.log(`   Total variants in groups: ${totalVariants}`);
  console.log(`   Single-variant products: ${singleCount}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
