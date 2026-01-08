#!/usr/bin/env node
/**
 * validate_final_csv.js
 * 
 * Validates the final CSV is ready for Shopify import
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const CSV_PATH = path.join(BASE, 'outputs/shopify_100percent_images.csv');

const CORRECT_STORE_ID = '0672/5730/3114';

// Proper CSV parser
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
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

// Main
const content = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parseCSV(content);
const header = rows[0];

// Find column indices
const imgIdx = header.indexOf('Image Src');
const handleIdx = header.indexOf('Handle');
const descIdx = header.indexOf('Body (HTML)');
const weightIdx = header.indexOf('Variant Grams');
const typeIdx = header.indexOf('Type');

// Count metrics
let correctCdn = 0;
let empty = 0;
let wordpress = 0;
let wrongCdn = 0;
let other = 0;

// Track unique products
const handles = new Set();
let productsWithImages = 0;
let productsWithDescriptions = 0;
let productsWithWeight = 0;
let productsWithType = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const handle = row[handleIdx];
  const url = row[imgIdx] || '';
  const desc = row[descIdx] || '';
  const weight = row[weightIdx] || '';
  const type = row[typeIdx] || '';
  
  // Track unique products
  if (!handles.has(handle)) {
    handles.add(handle);
    
    // Count as having image if URL is not empty
    if (url.trim()) {
      productsWithImages++;
    }
    if (desc.trim() && desc.length > 50) {
      productsWithDescriptions++;
    }
    if (weight.trim() && parseFloat(weight) > 0) {
      productsWithWeight++;
    }
    if (type.trim()) {
      productsWithType++;
    }
  }
  
  // Count image URL types
  if (!url.trim()) {
    empty++;
  } else if (url.includes(CORRECT_STORE_ID)) {
    correctCdn++;
  } else if (url.includes('hmoonhydro.com')) {
    wordpress++;
  } else if (url.includes('cdn.shopify.com')) {
    wrongCdn++;
  } else {
    other++;
  }
}

const totalRows = rows.length - 1;
const totalProducts = handles.size;

console.log('\n📊 FINAL CSV VALIDATION');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`📄 File: ${CSV_PATH}`);
console.log(`📝 Total Rows: ${totalRows}`);
console.log(`📦 Unique Products: ${totalProducts}`);
console.log('');

console.log('🖼️  IMAGE URLS:');
console.log(`   ✅ Correct Shopify CDN: ${correctCdn} (${((correctCdn / totalRows) * 100).toFixed(1)}%)`);
console.log(`   ⬜ Empty (no image): ${empty} (${((empty / totalRows) * 100).toFixed(1)}%)`);
console.log(`   ❌ WordPress URLs: ${wordpress}`);
console.log(`   ❌ Wrong CDN: ${wrongCdn}`);
console.log(`   ❓ Other: ${other}`);
console.log('');

console.log('📦 PRODUCT COVERAGE:');
console.log(`   🖼️  With Images: ${productsWithImages}/${totalProducts} (${((productsWithImages / totalProducts) * 100).toFixed(1)}%)`);
console.log(`   📝 With Description: ${productsWithDescriptions}/${totalProducts} (${((productsWithDescriptions / totalProducts) * 100).toFixed(1)}%)`);
console.log(`   ⚖️  With Weight: ${productsWithWeight}/${totalProducts} (${((productsWithWeight / totalProducts) * 100).toFixed(1)}%)`);
console.log(`   🏷️  With Type: ${productsWithType}/${totalProducts} (${((productsWithType / totalProducts) * 100).toFixed(1)}%)`);
console.log('');

const isReady = wordpress === 0 && wrongCdn === 0;
console.log('═══════════════════════════════════════════════════════════════');
if (isReady) {
  console.log('✅ CSV IS READY FOR SHOPIFY IMPORT!');
  console.log('   All image URLs are either empty or use correct Shopify CDN.');
} else {
  console.log('❌ CSV NOT READY - has invalid URLs:');
  if (wordpress > 0) console.log(`   - ${wordpress} WordPress URLs`);
  if (wrongCdn > 0) console.log(`   - ${wrongCdn} wrong Shopify CDN URLs`);
}
console.log('═══════════════════════════════════════════════════════════════');
