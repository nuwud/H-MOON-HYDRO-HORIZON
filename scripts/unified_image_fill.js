#!/usr/bin/env node
/**
 * unified_image_fill.js
 * Pulls images from ALL available sources:
 * 1. woo_all_image_urls.json (direct WooCommerce URLs)
 * 2. image_matches.json (fuzzy local matches)
 * 3. Local file fuzzy matching (fallback)
 * 
 * Usage: node scripts/unified_image_fill.js [--confirm]
 */

const fs = require('fs');
const path = require('path');

const INPUT_CSV_CANDIDATES = [
  './outputs/woocommerce_import_with_prices.csv',
  './outputs/woocommerce_import_ready.csv'
];
const OUTPUT_CSV = './outputs/woocommerce_FINAL_WITH_IMAGES.csv';
const LOG_FILE = './outputs/unified_image_fill_log.json';

const WOO_BASE_URL = 'https://hmoonhydro.com/wp-content/uploads';
const LOCAL_UPLOADS = './hmoonhydro.com/wp-content/uploads';

function resolveInputCsv(cliArg) {
  if (cliArg) {
    if (!fs.existsSync(cliArg)) {
      console.error(`ERROR: Input CSV not found: ${cliArg}`);
      process.exit(1);
    }
    return cliArg;
  }

  for (const candidate of INPUT_CSV_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }

  console.error(`ERROR: No input CSV found. Checked: ${INPUT_CSV_CANDIDATES.join(', ')}`);
  process.exit(1);
}

// CSV parsing
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = { _raw: values, _index: i };
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

// Normalize handle/slug
function normalizeHandle(text) {
  return (text || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Load source 1: WooCommerce direct URLs
function loadWooUrls() {
  try {
    return JSON.parse(fs.readFileSync('./outputs/woo_all_image_urls.json', 'utf8'));
  } catch (e) {
    console.log('  [WARN] Could not load woo_all_image_urls.json');
    return {};
  }
}

// Load source 2: Fuzzy image matches
function loadImageMatches() {
  try {
    const data = JSON.parse(fs.readFileSync('./outputs/image_matches.json', 'utf8'));
    const result = {};
    for (const [handle, matches] of Object.entries(data)) {
      if (Array.isArray(matches) && matches.length > 0) {
        // Find the best match (highest score, non-thumbnail)
        const best = matches
          .filter(m => !/-\d+x\d+\./.test(m.filename || ''))
          .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (best && best.originalPath) {
          result[handle] = `${WOO_BASE_URL}/${best.originalPath}`;
        }
      }
    }
    return result;
  } catch (e) {
    console.log('  [WARN] Could not load image_matches.json:', e.message);
    return {};
  }
}

// Load source 3: Local image index for fallback matching
function buildLocalIndex() {
  const index = new Map();
  
  function scan(dir, rel = '') {
    try {
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const relPath = rel ? `${rel}/${item}` : item;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scan(full, relPath);
        } else if (/\.(jpg|jpeg|png|webp)$/i.test(item) && !/-\d+x\d+\./.test(item)) {
          const basename = item.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
          const normalized = basename.replace(/[^a-z0-9]/g, '');
          index.set(normalized, `${WOO_BASE_URL}/${relPath}`);
        }
      }
    } catch (e) {}
  }
  
  scan(LOCAL_UPLOADS);
  return index;
}

// Try fuzzy keyword matching against WooCommerce URLs
function fuzzyMatchWoo(name, wooUrls) {
  // Skip generic/short names that match too broadly
  const skipWords = new Set(['the', 'and', 'for', 'with', 'pack', 'size', 'inch', 'round', 'small', 'medium', 'large']);
  
  const keywords = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !skipWords.has(w));
  
  // Need at least 2 meaningful keywords
  if (keywords.length < 2) return null;
  
  let bestMatch = null;
  let bestScore = 0;
  let bestMatchCount = 0;
  
  for (const [slug, url] of Object.entries(wooUrls)) {
    const slugWords = slug.split('-').filter(w => w.length > 2);
    let matches = 0;
    let strongMatches = []; // Track which keywords matched
    
    for (const kw of keywords) {
      // Require exact word match or very close (not just substring)
      const match = slugWords.find(sw => sw === kw || (sw.length > 4 && kw.length > 4 && (sw.startsWith(kw) || kw.startsWith(sw))));
      if (match) {
        matches++;
        strongMatches.push(kw);
      }
    }
    
    // Require at least 2 matching keywords AND 60% overlap
    const score = matches / Math.max(keywords.length, slugWords.length);
    if (matches >= 2 && score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatchCount = matches;
      bestMatch = { url, score, slug, matched: strongMatches.join('+') };
    }
  }
  
  return bestMatch;
}

// Generate handle variations for matching
function generateHandleVariations(name, sku, brand) {
  const variations = new Set();
  
  // Direct handle from name
  const handle = normalizeHandle(name);
  variations.add(handle);
  
  // Without brand prefix
  if (brand) {
    const brandSlug = normalizeHandle(brand);
    if (handle.startsWith(brandSlug + '-')) {
      variations.add(handle.slice(brandSlug.length + 1));
    }
  }
  
  // SKU-based
  if (sku) {
    variations.add(normalizeHandle(sku));
  }
  
  // Key words only (remove size suffixes)
  const noSize = handle.replace(/-\d+(-?oz|-?ml|-?l|-?gal|-?lb|-?qt|-?pt|-?pack|-?pc)$/i, '');
  if (noSize !== handle) variations.add(noSize);
  
  return [...variations];
}

// Main
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');
const inputArg = args.find(a => a.endsWith('.csv'));
const INPUT_CSV = resolveInputCsv(inputArg);

console.log('='.repeat(60));
console.log('UNIFIED IMAGE FILL');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLYING CHANGES'}`);
console.log(`Input CSV: ${INPUT_CSV}`);
console.log('');

// Load all sources
console.log('Loading image sources...');
const wooUrls = loadWooUrls();
console.log(`  Source 1 (WooCommerce URLs): ${Object.keys(wooUrls).length} mappings`);

const imageMatches = loadImageMatches();
console.log(`  Source 2 (Fuzzy matches): ${Object.keys(imageMatches).length} mappings`);

const localIndex = buildLocalIndex();
console.log(`  Source 3 (Local files): ${localIndex.size} original images`);
console.log('');

// Load CSV
const data = fs.readFileSync(INPUT_CSV, 'utf8');
const { headers, records } = parseCSV(data);

const imgIdx = headers.indexOf('Images');
if (imgIdx === -1) {
  console.error('ERROR: No "Images" column found');
  process.exit(1);
}

// Process each record missing images
const stats = { filled: 0, stillMissing: 0, fromWoo: 0, fromFuzzy: 0, fromLocal: 0, fromFuzzyWoo: 0 };
const fills = [];
const stillMissing = [];

records.forEach(record => {
  const currentImg = (record.Images || '').trim();
  if (currentImg) return; // Already has image
  
  // Skip variations - they inherit images from parent
  if (record.Type === 'variation') return;
  
  const name = record.Name || '';
  const sku = record.SKU || '';
  const brand = record.Brands || '';
  
  // Skip products with no name (shouldn't happen for non-variations)
  if (!name.trim()) return;
  
  const handle = normalizeHandle(name);
  
  let imageUrl = null;
  let source = null;
  
  // Try variations
  const variations = generateHandleVariations(name, sku, brand);
  
  for (const v of variations) {
    // Source 1: Direct WooCommerce URL
    if (wooUrls[v]) {
      imageUrl = wooUrls[v];
      source = 'woo_direct';
      stats.fromWoo++;
      break;
    }
    
    // Source 2: Fuzzy matches
    if (imageMatches[v]) {
      imageUrl = imageMatches[v];
      source = 'fuzzy_match';
      stats.fromFuzzy++;
      break;
    }
  }
  
  // Source 3: Local index fallback (try normalized name parts)
  if (!imageUrl) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (localIndex.has(normalized)) {
      imageUrl = localIndex.get(normalized);
      source = 'local_index';
      stats.fromLocal++;
    }
  }
  
  // Source 4: Fuzzy keyword matching against WooCommerce URLs
  if (!imageUrl) {
    const fuzzyResult = fuzzyMatchWoo(name, wooUrls);
    if (fuzzyResult) {
      imageUrl = fuzzyResult.url;
      source = `fuzzy_woo(${fuzzyResult.slug})`;
      stats.fromFuzzyWoo++;
    }
  }
  
  if (imageUrl) {
    record._raw[imgIdx] = imageUrl;
    record.Images = imageUrl;
    stats.filled++;
    fills.push({
      sku,
      name: name.substring(0, 50),
      source,
      imageUrl: imageUrl.substring(0, 80)
    });
  } else {
    stats.stillMissing++;
    stillMissing.push({
      sku,
      name: name.substring(0, 50),
      brand,
      type: record.Type
    });
  }
});

console.log('Results:');
console.log('-'.repeat(60));
console.log(`  Filled from WooCommerce URLs: ${stats.fromWoo}`);
console.log(`  Filled from fuzzy matches:    ${stats.fromFuzzy}`);
console.log(`  Filled from fuzzy WooCommerce:${stats.fromFuzzyWoo}`);
console.log(`  Filled from local index:      ${stats.fromLocal}`);
console.log(`  TOTAL FILLED:                 ${stats.filled}`);
console.log(`  Still missing:                ${stats.stillMissing}`);
console.log('');

if (fills.length > 0) {
  console.log('Sample fills (first 20):');
  fills.slice(0, 20).forEach(f => {
    console.log(`  [${f.source}] ${f.sku}: ${f.name.substring(0, 35)}`);
  });
  console.log('');
}

if (stillMissing.length > 0 && stillMissing.length <= 50) {
  console.log('Still missing (all):');
  stillMissing.forEach(m => {
    console.log(`  [${m.brand || 'Unknown'}] ${m.sku}: ${m.name}`);
  });
} else if (stillMissing.length > 50) {
  console.log(`Still missing: ${stillMissing.length} products`);
  console.log('Top brands needing images:');
  const byBrand = {};
  stillMissing.forEach(m => {
    byBrand[m.brand || 'Unknown'] = (byBrand[m.brand || 'Unknown'] || 0) + 1;
  });
  Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([b, c]) => {
    console.log(`  ${c.toString().padStart(4)} - ${b}`);
  });
}
console.log('');

if (!dryRun) {
  // Write output CSV
  const outputLines = [headers.join(',')];
  records.forEach(record => {
    outputLines.push(record._raw.map(v => escapeCSV(v)).join(','));
  });
  fs.writeFileSync(OUTPUT_CSV, outputLines.join('\n'), 'utf8');
  console.log(`✅ Updated CSV: ${OUTPUT_CSV}`);
  
  // Write log
  fs.writeFileSync(LOG_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    fills,
    stillMissing
  }, null, 2), 'utf8');
  console.log(`✅ Log file: ${LOG_FILE}`);
} else {
  console.log('DRY RUN - No files modified');
  console.log('Run with --confirm to apply');
}
