#!/usr/bin/env node
/**
 * fill_missing_images.js
 * Matches the 458 products missing images to local WooCommerce uploads
 * 
 * Usage: node scripts/fill_missing_images.js [--confirm]
 * Default: dry-run mode
 */

const fs = require('fs');
const path = require('path');

const WOO_UPLOADS = './hmoonhydro.com/wp-content/uploads';
const WOO_BASE_URL = 'https://hmoonhydro.com/wp-content/uploads';
const INPUT_CSV = './outputs/woocommerce_import_ready.csv';
const OUTPUT_CSV = './outputs/woocommerce_import_with_images.csv';
const LOG_FILE = './outputs/image_fill_log.json';

// Simple CSV parser
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = { _raw: values };
    headers.forEach((h, idx) => { record[h] = values[idx] || ''; });
    records.push(record);
  }
  return { headers, records };
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function escapeCSV(value) {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Build local image index
function buildImageIndex() {
  const index = new Map();
  const basenames = new Map();
  
  function scanDir(dir, relativePath = '') {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relPath = relativePath ? `${relativePath}/${item}` : item;
        
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(item)) {
          // Skip WordPress thumbnail sizes
          if (/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i.test(item)) continue;
          
          const basename = item.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
          const url = `${WOO_BASE_URL}/${relPath}`;
          
          index.set(relPath, { basename, url, filename: item });
          
          // Index by normalized basename for fuzzy matching
          const normalized = basename.replace(/[^a-z0-9]/g, '');
          if (!basenames.has(normalized)) {
            basenames.set(normalized, []);
          }
          basenames.get(normalized).push({ path: relPath, url, basename });
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
  
  scanDir(WOO_UPLOADS);
  return { index, basenames };
}

// Normalize text for matching
function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Extract keywords from product name
function getKeywords(name) {
  const stopwords = new Set(['the', 'and', 'for', 'with', 'pack', 'per', 'each', 
    'box', 'case', 'qty', 'size', 'inch', 'gallon', 'liter', 'oz', 'lb', 'watt']);
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

// Score match between product and image
function scoreMatch(productName, sku, imagePath) {
  const imgBasename = path.basename(imagePath).replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
  const prodNorm = normalize(productName);
  const skuNorm = normalize(sku);
  const imgNorm = normalize(imgBasename);
  
  let score = 0;
  
  // Exact SKU match in filename = high confidence
  if (skuNorm && imgNorm.includes(skuNorm)) {
    score += 50;
  }
  
  // Product keywords in filename
  const keywords = getKeywords(productName);
  const imgWords = imgBasename.split(/[^a-z0-9]+/).filter(w => w.length > 2);
  
  let matches = 0;
  for (const kw of keywords) {
    if (imgWords.some(iw => iw.includes(kw) || kw.includes(iw))) {
      matches++;
    }
  }
  
  if (keywords.length > 0) {
    score += (matches / keywords.length) * 40;
  }
  
  // Brand match bonus
  const brands = ['advanced', 'nutrients', 'general', 'hydroponics', 'foxfarm', 
    'canna', 'botanicare', 'humboldt', 'athena', 'aquavita', 'ecoplus', 'ona',
    'sunblaster', 'plantmax', 'canfan', 'atami', 'hydrofarm'];
  for (const brand of brands) {
    if (prodNorm.includes(brand) && imgNorm.includes(brand)) {
      score += 10;
      break;
    }
  }
  
  return score;
}

// Find best image match for a product
function findBestMatch(productName, sku, brand, imageIndex) {
  const candidates = [];
  
  for (const [relPath, info] of imageIndex.index) {
    const score = scoreMatch(productName, sku, relPath);
    if (score > 20) { // Minimum threshold
      candidates.push({ path: relPath, url: info.url, score, basename: info.basename });
    }
  }
  
  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length > 0 && candidates[0].score >= 30) {
    return candidates[0];
  }
  
  return null;
}

// Main
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');

console.log('='.repeat(60));
console.log('FILL MISSING IMAGES');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN (use --confirm to apply)' : 'APPLYING CHANGES'}`);
console.log('');

// Build image index
console.log('Building local image index...');
const imageIndex = buildImageIndex();
console.log(`  Found ${imageIndex.index.size} original images (excluding thumbnails)`);
console.log('');

// Load CSV
const data = fs.readFileSync(INPUT_CSV, 'utf8');
const { headers, records } = parseCSV(data);

// Find products without images
const missingImages = records.filter(r => {
  const img = r.Images || '';
  return !img.trim();
});

console.log(`Products missing images: ${missingImages.length}`);
console.log('');

// Match images
const matches = [];
const noMatch = [];

missingImages.forEach(record => {
  const name = record.Name || '';
  const sku = record.SKU || '';
  const brand = record.Brands || '';
  
  const match = findBestMatch(name, sku, brand, imageIndex);
  
  if (match) {
    matches.push({
      sku,
      name: name.substring(0, 50),
      imageUrl: match.url,
      score: match.score,
      basename: match.basename
    });
    // Update the record
    const imgIdx = headers.indexOf('Images');
    if (imgIdx >= 0) {
      record._raw[imgIdx] = match.url;
      record.Images = match.url;
    }
  } else {
    noMatch.push({
      sku,
      name: name.substring(0, 50),
      brand
    });
  }
});

console.log(`Matched: ${matches.length}`);
console.log(`Still missing: ${noMatch.length}`);
console.log('');

if (matches.length > 0) {
  console.log('Sample matches (first 20):');
  console.log('-'.repeat(60));
  matches.slice(0, 20).forEach(m => {
    console.log(`  [${m.score.toFixed(0)}] ${m.sku}: ${m.basename}`);
  });
  console.log('');
}

if (noMatch.length > 0 && noMatch.length <= 50) {
  console.log('Still missing (need manual sourcing):');
  console.log('-'.repeat(60));
  noMatch.forEach(n => {
    console.log(`  ${n.sku}: ${n.name} [${n.brand}]`);
  });
  console.log('');
}

// Score distribution
const scoreRanges = { '90+': 0, '70-89': 0, '50-69': 0, '30-49': 0 };
matches.forEach(m => {
  if (m.score >= 90) scoreRanges['90+']++;
  else if (m.score >= 70) scoreRanges['70-89']++;
  else if (m.score >= 50) scoreRanges['50-69']++;
  else scoreRanges['30-49']++;
});
console.log('Match confidence distribution:');
Object.entries(scoreRanges).forEach(([range, count]) => {
  if (count > 0) console.log(`  ${range}: ${count}`);
});
console.log('');

if (!dryRun) {
  // Write updated CSV
  const outputLines = [headers.join(',')];
  records.forEach(record => {
    const row = record._raw.map(v => escapeCSV(v));
    outputLines.push(row.join(','));
  });
  fs.writeFileSync(OUTPUT_CSV, outputLines.join('\n'), 'utf8');
  console.log(`✅ Updated CSV written to: ${OUTPUT_CSV}`);
  
  // Write log
  fs.writeFileSync(LOG_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: 'fill_missing_images',
    matched: matches.length,
    still_missing: noMatch.length,
    matches: matches,
    no_match: noMatch
  }, null, 2), 'utf8');
  console.log(`✅ Log written to: ${LOG_FILE}`);
} else {
  console.log('DRY RUN - No files modified');
  console.log('Run with --confirm to apply changes');
}

console.log('');
