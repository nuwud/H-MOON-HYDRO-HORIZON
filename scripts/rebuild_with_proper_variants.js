#!/usr/bin/env node
/**
 * rebuild_with_proper_variants.js
 * 
 * Rebuilds the Shopify CSV with proper variant grouping by:
 * 1. Reading WooCommerce grouped products data
 * 2. Consolidating variants under shared handles
 * 3. Preserving all enrichments (descriptions, images, weights) from current CSV
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

// Normalize product name (strip size/variant info)
function normalizeProductName(name) {
  // Remove common size indicators
  return name
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove anything in parentheses
    .replace(/\s+[\d.]+\s*(qt|quart|gal|gallon|lb|lbs|pound|oz|ounce|ml|l|liter|g|gram|kg|inch|ft|foot)/gi, '')
    .replace(/\s+-\s+[\d.]+.*$/i, '') // Remove " - 1 qt" style suffixes
    .trim();
}

// Extract size/variant from title
function extractVariantInfo(title) {
  // Look for size in parentheses
  const parenMatch = title.match(/\(([^)]+)\)/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }
  
  // Look for size patterns
  const sizeMatch = title.match(/([\d.]+\s*(qt|quart|gal|gallon|lb|lbs|pound|oz|ounce|ml|l|liter|g|gram|kg|inch|ft|foot))/i);
  if (sizeMatch) {
    return sizeMatch[1].trim();
  }
  
  return 'Default';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     REBUILD CSV WITH PROPER VARIANT GROUPING');
  console.log('═══════════════════════════════════════════════════════════════\\n');

  // Read WooCommerce export
  console.log('📄 Reading WooCommerce export...');
  const wooContent = fs.readFileSync(WOO_CSV, 'utf-8');
  const wooRows = parseCSV(wooContent);
  const wooHeader = wooRows[0];
  
  const wooIdx = {
    name: wooHeader.indexOf('Product Name'),
    type: wooHeader.indexOf('Type'),
    grouped: wooHeader.indexOf('Grouped products'),
    parent: wooHeader.indexOf('Parent')
  };
  
  console.log(`   ${wooRows.length - 1} WooCommerce products\\n`);

  // Build parent-child relationships
  console.log('🔗 Building variant groups...');
  const variantGroups = new Map(); // parent handle -> child titles
  
  for (let i = 1; i < wooRows.length; i++) {
    const type = wooRows[i][wooIdx.type] || '';
    const name = wooRows[i][wooIdx.name] || '';
    const groupedStr = wooRows[i][wooIdx.grouped] || '';
    
    if (type === 'grouped' && groupedStr) {
      // This is a parent product with children
      const handle = generateHandle(name);
      const children = groupedStr.split('|~|').map(c => c.trim()).filter(Boolean);
      variantGroups.set(handle, {
        parentName: name,
        children: children,
        baseHandle: handle
      });
    }
  }
  
  console.log(`   Found ${variantGroups.size} variant groups\\n`);

  // Read current enriched CSV
  console.log('📄 Reading enriched CSV...');
  const currentContent = fs.readFileSync(CURRENT_CSV, 'utf-8');
  const currentRows = parseCSV(currentContent);
  const currentHeader = currentRows[0];
  
  const currentIdx = {};
  currentHeader.forEach((h, i) => {
    currentIdx[h] = i;
  });
  
  console.log(`   ${currentRows.length - 1} rows with enrichments\\n`);

  // Build lookup: normalized title -> row data
  const productLookup = new Map();
  for (let i = 1; i < currentRows.length; i++) {
    const title = currentRows[i][currentIdx['Title']] || '';
    const handle = currentRows[i][currentIdx['Handle']] || '';
    const normalized = normalizeProductName(title);
    
    if (!productLookup.has(handle)) {
      productLookup.set(handle, []);
    }
    productLookup.set(normalized, [...(productLookup.get(normalized) || []), i]);
  }

  // Build consolidated variant structure
  console.log('🔄 Consolidating variants...');
  const outputRows = [currentHeader];
  const processedHandles = new Set();
  const stats = { grouped: 0, single: 0, totalVariants: 0 };

  for (let i = 1; i < currentRows.length; i++) {
    const handle = currentRows[i][currentIdx['Handle']] || '';
    
    if (processedHandles.has(handle)) continue;
    
    const title = currentRows[i][currentIdx['Title']] || '';
    const normalized = normalizeProductName(title);
    
    // Check if this product should be part of a variant group
    let isPartOfGroup = false;
    let groupInfo = null;
    
    for (const [parentHandle, info] of variantGroups) {
      const parentNorm = normalizeProductName(info.parentName);
      
      // Check if this product matches the parent or any children
      if (normalized === parentNorm || 
          info.children.some(child => normalizeProductName(child) === normalized)) {
        isPartOfGroup = true;
        groupInfo = { handle: parentHandle, ...info };
        break;
      }
    }

    if (isPartOfGroup && groupInfo) {
      // This is part of a variant group - consolidate all variants
      const variants = [];
      
      // Find all rows that belong to this variant group
      for (let j = 1; j < currentRows.length; j++) {
        const varTitle = currentRows[j][currentIdx['Title']] || '';
        const varNorm = normalizeProductName(varTitle);
        const parentNorm = normalizeProductName(groupInfo.parentName);
        
        if (varNorm === parentNorm || 
            groupInfo.children.some(child => normalizeProductName(child) === varNorm)) {
          variants.push(j);
        }
      }

      // Sort variants by title
      variants.sort((a, b) => {
        const titleA = currentRows[a][currentIdx['Title']] || '';
        const titleB = currentRows[b][currentIdx['Title']] || '';
        return titleA.localeCompare(titleB);
      });

      // First variant gets full product data
      const firstRow = [...currentRows[variants[0]]];
      firstRow[currentIdx['Handle']] = groupInfo.handle;
      firstRow[currentIdx['Title']] = groupInfo.parentName;
      firstRow[currentIdx['Option1 Name']] = 'Size';
      firstRow[currentIdx['Option1 Value']] = extractVariantInfo(currentRows[variants[0]][currentIdx['Title']]);
      outputRows.push(firstRow);

      // Additional variants have empty handle/title
      for (let v = 1; v < variants.length; v++) {
        const varRow = [...currentRows[variants[v]]];
        varRow[currentIdx['Handle']] = ''; // Empty for additional variants
        varRow[currentIdx['Title']] = '';
        varRow[currentIdx['Body (HTML)']] = '';
        varRow[currentIdx['Vendor']] = '';
        varRow[currentIdx['Product Category']] = '';
        varRow[currentIdx['Type']] = '';
        varRow[currentIdx['Tags']] = '';
        varRow[currentIdx['Option1 Name']] = ''; // Empty - inherits from first row
        varRow[currentIdx['Option1 Value']] = extractVariantInfo(currentRows[variants[v]][currentIdx['Title']]);
        outputRows.push(varRow);
      }

      // Mark all these handles as processed
      variants.forEach(v => {
        processedHandles.add(currentRows[v][currentIdx['Handle']]);
      });

      stats.grouped++;
      stats.totalVariants += variants.length;

    } else {
      // Single product - no variants
      outputRows.push(currentRows[i]);
      processedHandles.add(handle);
      stats.single++;
    }
  }

  console.log(`   Grouped products: ${stats.grouped} (${stats.totalVariants} variants)`);
  console.log(`   Single products: ${stats.single}\\n`);

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
  console.log(`   Unique products: ${stats.grouped + stats.single}`);
  console.log(`   Multi-variant products: ${stats.grouped}`);
  console.log(`   Single-variant products: ${stats.single}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
