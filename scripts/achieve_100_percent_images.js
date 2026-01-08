#!/usr/bin/env node
/**
 * achieve_100_percent_images.js
 * 
 * Gets to 100% image coverage by using multiple sources:
 * 1. Shopify CDN (from manifest)
 * 2. WooCommerce image URLs
 * 3. Manufacturer URLs (Advanced Nutrients, GH, etc.)
 * 4. Category-based placeholders from correct store
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_cdn_final.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_100percent_images.csv');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');
const IMAGE_MATCHES_PATH = path.join(BASE, 'outputs/image_matches.json');
const WOO_IMAGE_MAP = path.join(BASE, 'CSVs/woo_image_map.json');

const CORRECT_STORE_ID = '0672/5730/3114';

// Category placeholder mapping - use generic product images from CDN
// These are valid product images already in the store
const CATEGORY_PLACEHOLDERS = {
  'nutrients': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/b7df26ed__advancedBudBlood.jpg',
  'Nutrients': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/b7df26ed__advancedBudBlood.jpg',
  'irrigation': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/94a8f978__bucket_baskets3.jpg',
  'grow_media': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/0e7ca816__coco_coir.jpg',
  'propagation': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/0e7ca816__coco_coir.jpg',
  'pest_control': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/e9dff368__backdraft_dampers.jpg',
  'grow_lights': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'Lighting Equipment': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'containers_pots': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/94a8f978__bucket_baskets3.jpg',
  'Pots/Containers': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/94a8f978__bucket_baskets3.jpg',
  'Environment Control': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/e9dff368__backdraft_dampers.jpg',
  'Accessories': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'airflow': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/e9dff368__backdraft_dampers.jpg',
  'water_filtration': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/94a8f978__bucket_baskets3.jpg',
  'Hydroponics Components': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/94a8f978__bucket_baskets3.jpg',
  'controllers_timers': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'harvesting': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'Components': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'ph_meters': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'hid_bulbs': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'Bulbs': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'extraction': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'Media': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/0e7ca816__coco_coir.jpg',
  'books': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'electrical_supplies': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'co2': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/c6b21032__grozone_co2.jpg',
  'catalog_index': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
  'accessories': 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg',
};

// Default placeholder for any missing
const DEFAULT_PLACEHOLDER = 'https://cdn.shopify.com/s/files/1/0672/5730/3114/files/10d51f3d__e40_adapter.jpg';

// Load manifest
console.log('📂 Loading data sources...');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const byFilename = manifest.byFilename || {};

// Build lookup from manifest
const manifestLookup = new Map();
for (const [filename, data] of Object.entries(byFilename)) {
  manifestLookup.set(filename.toLowerCase(), data.shopifyUrl);
  const withoutSize = filename.replace(/-\d+x\d+(\.[^.]+)$/, '$1').toLowerCase();
  if (!manifestLookup.has(withoutSize)) {
    manifestLookup.set(withoutSize, data.shopifyUrl);
  }
}

// Load image_matches.json
let imageMatches = {};
if (fs.existsSync(IMAGE_MATCHES_PATH)) {
  imageMatches = JSON.parse(fs.readFileSync(IMAGE_MATCHES_PATH, 'utf-8'));
}

// Load woo_image_map.json
let wooImageMap = new Map();
if (fs.existsSync(WOO_IMAGE_MAP)) {
  const wooData = JSON.parse(fs.readFileSync(WOO_IMAGE_MAP, 'utf-8'));
  for (const entry of wooData) {
    if (entry.handle && entry.imageUrl) {
      wooImageMap.set(entry.handle.toLowerCase(), entry.imageUrl);
    }
  }
}

console.log(`   Manifest: ${manifestLookup.size} entries`);
console.log(`   Image matches: ${Object.keys(imageMatches).length} entries`);
console.log(`   Woo image map: ${wooImageMap.size} entries`);

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

// Find image for a product
function findImageUrl(handle, type) {
  // 1. Check image_matches
  if (imageMatches[handle] && imageMatches[handle].length > 0) {
    const match = imageMatches[handle][0];
    const fn = match.filename?.toLowerCase();
    if (fn && manifestLookup.has(fn)) {
      return { url: manifestLookup.get(fn), source: 'image_matches' };
    }
  }
  
  // 2. Check woo image map
  if (wooImageMap.has(handle.toLowerCase())) {
    const wooUrl = wooImageMap.get(handle.toLowerCase());
    // Extract filename and check manifest
    const fnMatch = wooUrl.match(/\/([^\/]+)$/);
    if (fnMatch) {
      const fn = fnMatch[1].toLowerCase();
      if (manifestLookup.has(fn)) {
        return { url: manifestLookup.get(fn), source: 'woo_map->manifest' };
      }
      // If it's a manufacturer URL, use it directly
      if (!wooUrl.includes('hmoonhydro.com')) {
        return { url: wooUrl, source: 'woo_map_external' };
      }
    }
  }
  
  // 3. Try fuzzy match in manifest by handle words
  const words = handle.split('-').filter(w => w.length > 3);
  for (const [fn, url] of manifestLookup) {
    const matchCount = words.filter(w => fn.includes(w)).length;
    if (matchCount >= 2) {
      return { url, source: 'fuzzy_manifest' };
    }
  }
  
  // 4. Category placeholder
  if (type && CATEGORY_PLACEHOLDERS[type]) {
    return { url: CATEGORY_PLACEHOLDERS[type], source: 'category_placeholder' };
  }
  
  // 5. Default placeholder
  return { url: DEFAULT_PLACEHOLDER, source: 'default_placeholder' };
}

// Main processing
console.log('\n📄 Reading CSV...');
const content = fs.readFileSync(INPUT_CSV, 'utf-8');
const rows = parseCSV(content);
const header = rows[0];
const imgIdx = header.indexOf('Image Src');
const handleIdx = header.indexOf('Handle');
const typeIdx = header.indexOf('Type');

const stats = {
  alreadyHasImage: 0,
  fromImageMatches: 0,
  fromWooMap: 0,
  fromFuzzy: 0,
  fromCategoryPlaceholder: 0,
  fromDefaultPlaceholder: 0,
};

// Track which handles we've processed (for first variant only)
const processedHandles = new Set();

console.log('\n🔄 Processing...');
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const handle = row[handleIdx];
  const url = row[imgIdx] || '';
  const type = row[typeIdx];
  
  // If already has a valid image, skip
  if (url.trim() && (url.includes('cdn.shopify.com') || url.includes('http'))) {
    stats.alreadyHasImage++;
    continue;
  }
  
  // Only process first variant for each product
  if (!processedHandles.has(handle)) {
    processedHandles.add(handle);
    
    const result = findImageUrl(handle, type);
    row[imgIdx] = result.url;
    
    switch (result.source) {
      case 'image_matches': stats.fromImageMatches++; break;
      case 'woo_map->manifest':
      case 'woo_map_external': stats.fromWooMap++; break;
      case 'fuzzy_manifest': stats.fromFuzzy++; break;
      case 'category_placeholder': stats.fromCategoryPlaceholder++; break;
      case 'default_placeholder': stats.fromDefaultPlaceholder++; break;
    }
  } else {
    // For subsequent variants, copy from first variant
    // Find the first row with this handle that has an image
    for (let j = 1; j < i; j++) {
      if (rows[j][handleIdx] === handle && rows[j][imgIdx]) {
        row[imgIdx] = rows[j][imgIdx];
        break;
      }
    }
  }
}

console.log('\n📊 Results:');
console.log(`   Already had images: ${stats.alreadyHasImage}`);
console.log(`   From image_matches: ${stats.fromImageMatches}`);
console.log(`   From woo_image_map: ${stats.fromWooMap}`);
console.log(`   From fuzzy manifest: ${stats.fromFuzzy}`);
console.log(`   Category placeholders: ${stats.fromCategoryPlaceholder}`);
console.log(`   Default placeholders: ${stats.fromDefaultPlaceholder}`);

// Write output
console.log('\n💾 Saving...');
fs.writeFileSync(OUTPUT_CSV, toCSV(rows), 'utf-8');
console.log(`   Output: ${OUTPUT_CSV}`);

// Validate
let empty = 0;
for (let i = 1; i < rows.length; i++) {
  if (!rows[i][imgIdx]?.trim()) empty++;
}
const coverage = (((rows.length - 1 - empty) / (rows.length - 1)) * 100).toFixed(1);
console.log(`\n📈 Image Coverage: ${coverage}%`);
console.log(`   Empty rows: ${empty}`);

console.log('\n✅ Done!');
