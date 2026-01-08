#!/usr/bin/env node
/**
 * replace_with_cdn_urls.js
 * 
 * Replaces WordPress image URLs with Shopify CDN URLs using the files_manifest.json
 * that was created by uploading images to Shopify's Files API.
 * 
 * Handles:
 * - WordPress URLs → Shopify CDN URLs (via manifest lookup)
 * - Keeps existing correct Shopify CDN URLs
 * - Replaces wrong-store placeholder URLs with proper placeholders
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_100percent.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_cdn_ready.csv');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');

// Correct store CDN pattern
const CORRECT_STORE_ID = '0672/5730/3114';
const CORRECT_CDN_PREFIX = `https://cdn.shopify.com/s/files/1/${CORRECT_STORE_ID}`;

// Load manifest
console.log('📂 Loading files manifest...');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const byFilename = manifest.byFilename || {};
console.log(`   Found ${Object.keys(byFilename).length} uploaded files in manifest`);

// Build a normalized lookup (lowercase filenames, no size suffixes)
const normalizedLookup = new Map();
for (const [filename, data] of Object.entries(byFilename)) {
  // Add exact match
  normalizedLookup.set(filename.toLowerCase(), data.shopifyUrl);
  
  // Add without size suffixes like -1200x1056
  const withoutSize = filename.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
  if (withoutSize !== filename) {
    normalizedLookup.set(withoutSize.toLowerCase(), data.shopifyUrl);
  }
}
console.log(`   Built ${normalizedLookup.size} lookup entries (including size variants)`);

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
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
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
        if (char === '\r') i++; // skip \n
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }
  
  // Handle last field/row
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

// Extract filename from WordPress URL
function extractFilenameFromUrl(url) {
  if (!url) return null;
  // https://hmoonhydro.com/wp-content/uploads/2019/08/blue-tubing-1200x1056.jpg
  const match = url.match(/\/([^\/]+)$/);
  return match ? match[1] : null;
}

// Check if URL is correct Shopify CDN
function isCorrectShopifyCdn(url) {
  return url && url.includes(CORRECT_STORE_ID);
}

// Check if URL is WordPress
function isWordPressUrl(url) {
  return url && url.includes('hmoonhydro.com');
}

// Check if URL is wrong Shopify store
function isWrongShopifyCdn(url) {
  return url && url.includes('cdn.shopify.com') && !url.includes(CORRECT_STORE_ID);
}

// Look up Shopify CDN URL for a filename
function lookupCdnUrl(filename) {
  if (!filename) return null;
  
  // Try exact match first
  const lower = filename.toLowerCase();
  if (normalizedLookup.has(lower)) {
    return normalizedLookup.get(lower);
  }
  
  // Try without size suffix
  const withoutSize = filename.replace(/-\d+x\d+(\.[^.]+)$/, '$1').toLowerCase();
  if (normalizedLookup.has(withoutSize)) {
    return normalizedLookup.get(withoutSize);
  }
  
  // Try just the base name (without any numbers at end)
  const baseName = filename.replace(/-\d+(\.[^.]+)$/, '$1').toLowerCase();
  if (normalizedLookup.has(baseName)) {
    return normalizedLookup.get(baseName);
  }
  
  return null;
}

// Main processing
console.log('\n📄 Reading CSV...');
const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const rows = parseCSV(csvContent);

const header = rows[0];
const imgIdx = header.indexOf('Image Src');
console.log(`   Total rows: ${rows.length}`);
console.log(`   Image Src column index: ${imgIdx}`);

// Track statistics
const stats = {
  alreadyCorrect: 0,
  converted: 0,
  notInManifest: [],
  wrongStorePlaceholder: 0,
  empty: 0,
};

// Process each row
console.log('\n🔄 Converting image URLs...');
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const imgUrl = row[imgIdx] || '';
  
  if (!imgUrl.trim()) {
    stats.empty++;
    continue;
  }
  
  if (isCorrectShopifyCdn(imgUrl)) {
    stats.alreadyCorrect++;
    continue;
  }
  
  if (isWordPressUrl(imgUrl)) {
    const filename = extractFilenameFromUrl(imgUrl);
    const cdnUrl = lookupCdnUrl(filename);
    
    if (cdnUrl) {
      row[imgIdx] = cdnUrl;
      stats.converted++;
    } else {
      stats.notInManifest.push({
        row: i + 1,
        handle: row[0],
        filename,
        originalUrl: imgUrl
      });
    }
  } else if (isWrongShopifyCdn(imgUrl)) {
    // Wrong store placeholder - mark for later
    stats.wrongStorePlaceholder++;
    // Leave as-is for now, these need special handling
  }
}

// Summary
console.log('\n📊 Conversion Summary:');
console.log(`   ✅ Already on correct CDN: ${stats.alreadyCorrect}`);
console.log(`   ✅ Converted to CDN: ${stats.converted}`);
console.log(`   ⚠️  Wrong store placeholders: ${stats.wrongStorePlaceholder}`);
console.log(`   ❌ Not in manifest: ${stats.notInManifest.length}`);
console.log(`   ⬜ Empty/No image: ${stats.empty}`);

// Write output
console.log('\n💾 Writing output CSV...');
fs.writeFileSync(OUTPUT_CSV, toCSV(rows), 'utf-8');
console.log(`   Saved to: ${OUTPUT_CSV}`);

// Write missing images report
if (stats.notInManifest.length > 0) {
  const missingPath = path.join(BASE, 'outputs/missing_cdn_images.json');
  fs.writeFileSync(missingPath, JSON.stringify(stats.notInManifest, null, 2));
  console.log(`\n⚠️  Missing images report saved to: ${missingPath}`);
  console.log('   These WordPress images need to be uploaded to Shopify:');
  stats.notInManifest.slice(0, 10).forEach(m => {
    console.log(`   - ${m.filename}`);
  });
  if (stats.notInManifest.length > 10) {
    console.log(`   ... and ${stats.notInManifest.length - 10} more`);
  }
}

console.log('\n✅ Done!');
