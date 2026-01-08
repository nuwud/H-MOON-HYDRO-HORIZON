#!/usr/bin/env node
/**
 * finalize_cdn_csv.js
 * 
 * Final pass to fix remaining image issues in shopify_cdn_ready.csv:
 * 1. Replace wrong-store placeholders with a proper placeholder URL
 * 2. Handle missing images with placeholder
 * 
 * Creates shopify_final_import.csv ready for Shopify upload
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_cdn_ready.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_final_import.csv');

// Correct store CDN pattern
const CORRECT_STORE_ID = '0672/5730/3114';

// A simple generic product placeholder - can be empty if no image is preferred
// Shopify will display a placeholder automatically if no image is provided
const PLACEHOLDER_IMAGE = ''; // Empty = Shopify's default placeholder

// Proper CSV parser that handles quoted fields with embedded newlines
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

// Serialize to CSV with proper quoting
function toCSV(rows) {
  return rows.map(row => 
    row.map(field => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    }).join(',')
  ).join('\n');
}

// Check if URL is correct Shopify CDN
function isCorrectShopifyCdn(url) {
  return url && url.includes(CORRECT_STORE_ID);
}

// Check if URL is WordPress
function isWordPressUrl(url) {
  return url && url.includes('hmoonhydro.com');
}

// Main processing
console.log('📄 Reading CSV...');
const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const rows = parseCSV(csvContent);

const header = rows[0];
const imgIdx = header.indexOf('Image Src');
console.log(`   Total rows: ${rows.length}`);

// Track statistics
const stats = {
  correctCdn: 0,
  wordpress: 0,
  wrongPlaceholder: 0,
  empty: 0,
  fixed: 0
};

// Process each row
console.log('\n🔄 Finalizing image URLs...');
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const imgUrl = row[imgIdx] || '';
  
  if (!imgUrl.trim()) {
    stats.empty++;
    continue;
  }
  
  if (isCorrectShopifyCdn(imgUrl)) {
    stats.correctCdn++;
    continue;
  }
  
  if (isWordPressUrl(imgUrl)) {
    // Still WordPress - replace with placeholder or empty
    row[imgIdx] = PLACEHOLDER_IMAGE;
    stats.wordpress++;
    stats.fixed++;
    continue;
  }
  
  if (imgUrl.includes('cdn.shopify.com') && !imgUrl.includes(CORRECT_STORE_ID)) {
    // Wrong store placeholder
    row[imgIdx] = PLACEHOLDER_IMAGE;
    stats.wrongPlaceholder++;
    stats.fixed++;
    continue;
  }
}

// Summary
console.log('\n📊 Final Summary:');
console.log(`   ✅ Correct Shopify CDN: ${stats.correctCdn}`);
console.log(`   ⚠️  WordPress URLs cleared: ${stats.wordpress}`);
console.log(`   ⚠️  Wrong placeholders cleared: ${stats.wrongPlaceholder}`);
console.log(`   ⬜ Empty/No image: ${stats.empty}`);
console.log(`   🔧 Total fixed: ${stats.fixed}`);

const totalWithImages = stats.correctCdn;
const totalRows = rows.length - 1;
const coverage = ((totalWithImages / totalRows) * 100).toFixed(1);
console.log(`\n📈 Image Coverage: ${coverage}% (${totalWithImages}/${totalRows} rows with valid CDN images)`);

// Write output
console.log('\n💾 Writing final CSV...');
fs.writeFileSync(OUTPUT_CSV, toCSV(rows), 'utf-8');
console.log(`   Saved to: ${OUTPUT_CSV}`);

console.log('\n✅ Done! CSV is ready for Shopify import.');
console.log('\n⚠️  Note: Products without images will use Shopify\'s default placeholder.');
console.log('    You can upload missing images later via Shopify Admin.');
