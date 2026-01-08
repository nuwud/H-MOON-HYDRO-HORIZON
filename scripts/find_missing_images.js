#!/usr/bin/env node
/**
 * find_missing_images.js
 * 
 * Analyzes products without images and finds potential sources
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const CSV_PATH = path.join(BASE, 'outputs/shopify_cdn_final.csv');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');
const WOO_EXPORT = path.join(BASE, 'CSVs/Products-Export-2025-Oct-29-171532.csv');

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

// Load manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const manifestFiles = Object.keys(manifest.byFilename);

// Load current CSV
const content = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parseCSV(content);
const header = rows[0];
const imgIdx = header.indexOf('Image Src');
const handleIdx = header.indexOf('Handle');
const titleIdx = header.indexOf('Title');
const typeIdx = header.indexOf('Type');

// Find products without images
const noImage = [];
const seen = new Set();

for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][handleIdx];
  const url = rows[i][imgIdx] || '';
  
  if (!seen.has(handle)) {
    seen.add(handle);
    if (!url.trim()) {
      noImage.push({
        handle,
        title: rows[i][titleIdx],
        type: rows[i][typeIdx],
        row: i
      });
    }
  }
}

console.log('Products without images:', noImage.length);

// Group by type
console.log('\nBy type:');
const byType = {};
noImage.forEach(p => {
  byType[p.type || 'No Type'] = (byType[p.type || 'No Type'] || 0) + 1;
});
Object.entries(byType).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => console.log(' ', t + ':', c));

// Try to find images in manifest by fuzzy matching handle/title
console.log('\nSearching manifest for matches...');
let found = 0;
const matches = [];

for (const p of noImage) {
  // Extract key words from handle
  const words = p.handle.split('-').filter(w => w.length > 3);
  
  // Search manifest
  for (const fn of manifestFiles) {
    const fnLower = fn.toLowerCase();
    const matchCount = words.filter(w => fnLower.includes(w.toLowerCase())).length;
    
    if (matchCount >= 2 || (words.length === 1 && matchCount === 1)) {
      matches.push({
        handle: p.handle,
        filename: fn,
        url: manifest.byFilename[fn].shopifyUrl,
        matchCount
      });
      found++;
      break;
    }
  }
}

console.log('Found potential matches:', found);
if (matches.length > 0) {
  console.log('\nSample matches:');
  matches.slice(0, 10).forEach(m => {
    console.log('  ', m.handle, '->', m.filename);
  });
}

// Save the list
fs.writeFileSync(
  path.join(BASE, 'outputs/products_without_images.json'),
  JSON.stringify(noImage, null, 2)
);
console.log('\nSaved to outputs/products_without_images.json');
