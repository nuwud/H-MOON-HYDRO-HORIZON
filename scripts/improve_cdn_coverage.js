#!/usr/bin/env node
/**
 * improve_cdn_coverage.js
 * 
 * Improves image coverage by:
 * 1. Using fuzzy matching against manifest
 * 2. Finding size variants that exist
 * 3. Keeping proper Shopify CDN URLs
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_100percent.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_cdn_final.csv');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');

const CORRECT_STORE_ID = '0672/5730/3114';

// Load manifest
console.log('📂 Loading files manifest...');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const byFilename = manifest.byFilename || {};

// Build multiple lookup strategies
const exactLookup = new Map();      // Exact filename match
const baseLookup = new Map();       // Without size suffix
const stemLookup = new Map();       // First significant word

for (const [filename, data] of Object.entries(byFilename)) {
  const lower = filename.toLowerCase();
  exactLookup.set(lower, data.shopifyUrl);
  
  // Without size suffix
  const withoutSize = lower.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
  if (!baseLookup.has(withoutSize)) {
    baseLookup.set(withoutSize, data.shopifyUrl);
  }
  
  // Stem: first meaningful word
  const stem = lower.replace(/^[^a-z]*/, '').split(/[-_.\d]/)[0];
  if (stem.length > 4 && !stemLookup.has(stem)) {
    stemLookup.set(stem, { filename: lower, url: data.shopifyUrl });
  }
}

console.log(`   Exact entries: ${exactLookup.size}`);
console.log(`   Base entries: ${baseLookup.size}`);
console.log(`   Stem entries: ${stemLookup.size}`);

// Specific known mappings for this project
const KNOWN_MAPPINGS = {
  'grozone_co2.jpg': byFilename['grozone_co2.jpg']?.shopifyUrl || byFilename['grozone_co2d.jpg']?.shopifyUrl,
  'BisonExtractcopy_3d4d82d6-de13-44d3-9648-f399fff099fa2-scaled.webp': 
    byFilename['BisonExtractcopy_3d4d82d6-de13-44d3-9648-f399fff099fa-1-scaled.webp']?.shopifyUrl,
  'safer-brand-organic-disease-control-5450-6-c3_1000-750x750.jpg.webp':
    byFilename['safer-brand-organic-disease-control-5450-6-c3_1000.jpg']?.shopifyUrl,
  '5-gal-fabrc-infinity-1-100x100.jpg.webp':
    byFilename['5-gal-fabrc-infinity-1-200x200.jpg.webp']?.shopifyUrl,
  '2.8-1-100x100.jpg.webp': byFilename['2.8.jpg']?.shopifyUrl,
  '2.8-1.jpg': byFilename['2.8.jpg']?.shopifyUrl,
};

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

function extractFilenameFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/([^\/]+)$/);
  return match ? match[1] : null;
}

function lookupCdnUrl(filename) {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  
  // Check known mappings first
  if (KNOWN_MAPPINGS[filename]) {
    return KNOWN_MAPPINGS[filename];
  }
  
  // Exact match
  if (exactLookup.has(lower)) {
    return exactLookup.get(lower);
  }
  
  // Without size suffix
  const withoutSize = lower.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
  if (baseLookup.has(withoutSize)) {
    return baseLookup.get(withoutSize);
  }
  
  // Try removing various WordPress-added suffixes
  const patterns = [
    lower.replace(/-\d+x\d+.*$/, ''),              // -1200x1056.jpg -> <base>
    lower.replace(/-portrait.*$/, ''),              // -portrait-... -> <base>
    lower.replace(/-square.*$/, ''),                // -square-... -> <base>
    lower.replace(/-circle.*$/, ''),                // -circle-... -> <base>
    lower.replace(/-scaled.*$/, ''),                // -scaled -> <base>
  ];
  
  for (const pattern of patterns) {
    // Try to find any file that starts with this pattern
    for (const [fn, url] of exactLookup) {
      if (fn.startsWith(pattern) && fn.length < pattern.length + 20) {
        return url;
      }
    }
  }
  
  return null;
}

// Main processing
console.log('\n📄 Reading CSV...');
const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const rows = parseCSV(csvContent);

const header = rows[0];
const imgIdx = header.indexOf('Image Src');

const stats = {
  alreadyCorrect: 0,
  converted: 0,
  notFound: 0,
  wrongPlaceholder: 0,
  empty: 0,
};

const notFound = [];

console.log('\n🔄 Processing image URLs...');
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const imgUrl = row[imgIdx] || '';
  
  if (!imgUrl.trim()) {
    stats.empty++;
    continue;
  }
  
  // Already correct
  if (imgUrl.includes(CORRECT_STORE_ID)) {
    stats.alreadyCorrect++;
    continue;
  }
  
  // WordPress URL - try to convert
  if (imgUrl.includes('hmoonhydro.com')) {
    const filename = extractFilenameFromUrl(imgUrl);
    const cdnUrl = lookupCdnUrl(filename);
    
    if (cdnUrl) {
      row[imgIdx] = cdnUrl;
      stats.converted++;
    } else {
      row[imgIdx] = ''; // Clear it
      stats.notFound++;
      notFound.push({ row: i, handle: row[0], filename });
    }
    continue;
  }
  
  // Wrong store placeholder
  if (imgUrl.includes('cdn.shopify.com')) {
    row[imgIdx] = ''; // Clear wrong store URLs
    stats.wrongPlaceholder++;
    continue;
  }
}

console.log('\n📊 Results:');
console.log(`   ✅ Correct CDN: ${stats.alreadyCorrect}`);
console.log(`   ✅ Converted: ${stats.converted}`);
console.log(`   ❌ Not found (cleared): ${stats.notFound}`);
console.log(`   ❌ Wrong placeholders (cleared): ${stats.wrongPlaceholder}`);
console.log(`   ⬜ Empty: ${stats.empty}`);

const totalWithImages = stats.alreadyCorrect + stats.converted;
const totalRows = rows.length - 1;
const coverage = ((totalWithImages / totalRows) * 100).toFixed(1);
console.log(`\n📈 Image Coverage: ${coverage}% (${totalWithImages}/${totalRows})`);

// Save
console.log('\n💾 Saving...');
fs.writeFileSync(OUTPUT_CSV, toCSV(rows), 'utf-8');
console.log(`   Output: ${OUTPUT_CSV}`);

// Save not-found report
if (notFound.length > 0) {
  const reportPath = path.join(BASE, 'outputs/images_not_in_manifest.json');
  fs.writeFileSync(reportPath, JSON.stringify(notFound, null, 2));
  console.log(`   Not found report: ${reportPath}`);
}

console.log('\n✅ Done!');
