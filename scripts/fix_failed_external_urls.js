#!/usr/bin/env node
/**
 * fix_failed_external_urls.js
 * 
 * For external URLs that failed to download, this script:
 * 1. Tries to find a matching image already in the manifest using fuzzy matching
 * 2. Falls back to a generic brand placeholder if needed
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_final_all_cdn.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_final_fixed.csv');
const MANIFEST = path.join(BASE, 'outputs/files_manifest.json');
const URL_MAPPING = path.join(BASE, 'outputs/external_url_mapping.json');

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
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Extract product name tokens from URL filename
function extractTokensFromUrl(url) {
  try {
    const filename = url.split('/').pop().split('?')[0];
    const name = filename.replace(/\.[^.]+$/, ''); // Remove extension
    // Split by dashes, underscores, spaces
    const tokens = name.toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
    return tokens;
  } catch {
    return [];
  }
}

// Extract tokens from manifest filename
function extractTokensFromFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// Find best matching image in manifest
function findBestMatch(urlTokens, manifestFiles, manifest) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const filename of manifestFiles) {
    const fileTokens = extractTokensFromFilename(filename);
    
    // Count matching tokens
    let matchCount = 0;
    for (const token of urlTokens) {
      if (fileTokens.some(ft => ft.includes(token) || token.includes(ft))) {
        matchCount++;
      }
    }
    
    // Calculate score
    const score = matchCount / Math.max(urlTokens.length, fileTokens.length);
    
    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      bestMatch = manifest.byFilename[filename];
    }
  }
  
  return bestMatch;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     FIX FAILED EXTERNAL URLS WITH FUZZY MATCHING');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load manifest
  console.log('📋 Loading manifest...');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  const manifestFiles = Object.keys(manifest.byFilename);
  console.log(`   ${manifestFiles.length} files in manifest\n`);

  // Load URL mapping
  console.log('📋 Loading URL mapping...');
  const urlMapping = JSON.parse(fs.readFileSync(URL_MAPPING, 'utf-8'));
  const failedUrls = Object.entries(urlMapping)
    .filter(([url, info]) => info.status === 'failed')
    .map(([url]) => url);
  console.log(`   ${failedUrls.length} failed URLs to fix\n`);

  // Build replacement map for failed URLs
  const replacements = {};
  
  console.log('🔍 Finding best matches for failed URLs...\n');
  for (const url of failedUrls) {
    const tokens = extractTokensFromUrl(url);
    const match = findBestMatch(tokens, manifestFiles, manifest);
    
    const urlShort = url.split('/').pop().substring(0, 50);
    
    if (match) {
      replacements[url] = match.shopifyUrl;
      console.log(`   ✅ ${urlShort}...`);
      console.log(`      → ${match.originalFilename}`);
    } else {
      console.log(`   ❌ ${urlShort}... (no match)`);
    }
  }
  
  const matchedCount = Object.keys(replacements).length;
  console.log(`\n   Matched: ${matchedCount}/${failedUrls.length}\n`);

  // Read CSV
  console.log('📄 Reading CSV...');
  const content = fs.readFileSync(INPUT_CSV, 'utf-8');
  const rows = parseCSV(content);
  const header = rows[0];
  const imgIdx = header.indexOf('Image Src');
  console.log(`   ${rows.length - 1} data rows\n`);

  // Find a generic fallback image from manifest
  const genericImages = manifestFiles.filter(f => 
    f.includes('placeholder') || 
    f.includes('generic') || 
    f.includes('product_image')
  );
  
  // Use first nutrient image as fallback for Advanced Nutrients failures
  const nutrientImages = manifestFiles.filter(f => 
    f.toLowerCase().includes('advanced') ||
    f.toLowerCase().includes('nutrient')
  );
  const fallbackUrl = nutrientImages.length > 0 
    ? manifest.byFilename[nutrientImages[0]]?.shopifyUrl 
    : null;

  if (fallbackUrl) {
    console.log(`   Fallback image: ${nutrientImages[0]}\n`);
  }

  // Replace placeholder URLs with real matches or fallback
  let fixedWithMatch = 0;
  let fixedWithFallback = 0;
  let keptPlaceholder = 0;

  for (let i = 1; i < rows.length; i++) {
    const url = rows[i][imgIdx] || '';
    
    // Check if this is a placeholder URL
    if (url.includes('placeholder_')) {
      // This was a failed external URL - try to find the original URL
      // We need to trace back which external URL this row had
      // Let's just check if we have any matching replacement for this category
      
      // Actually, we need to look at what external URL caused this placeholder
      // The update script would have replaced the external URL with placeholder
      // Let's rebuild by checking failed URLs vs product titles
      keptPlaceholder++;
    }
  }

  // Actually, let me re-process from the original 100% file to properly track
  console.log('📄 Re-reading original CSV for proper tracking...');
  const origContent = fs.readFileSync(path.join(BASE, 'outputs/shopify_100percent_images.csv'), 'utf-8');
  const origRows = parseCSV(origContent);
  
  // Build map: row index -> original URL
  const rowToOriginalUrl = {};
  for (let i = 1; i < origRows.length; i++) {
    const url = origRows[i][imgIdx] || '';
    if (!url.includes('cdn.shopify.com')) {
      rowToOriginalUrl[i] = url;
    }
  }

  // Now process the current CSV
  const currentContent = fs.readFileSync(INPUT_CSV, 'utf-8');
  const currentRows = parseCSV(currentContent);

  fixedWithMatch = 0;
  fixedWithFallback = 0;
  
  for (let i = 1; i < currentRows.length; i++) {
    const currentUrl = currentRows[i][imgIdx] || '';
    
    // If this has a placeholder, find what the original URL was
    if (currentUrl.includes('placeholder_')) {
      const originalUrl = rowToOriginalUrl[i];
      
      if (originalUrl && replacements[originalUrl]) {
        currentRows[i][imgIdx] = replacements[originalUrl];
        fixedWithMatch++;
      } else if (fallbackUrl) {
        currentRows[i][imgIdx] = fallbackUrl;
        fixedWithFallback++;
      }
    }
  }

  console.log(`\n   Fixed with matched image: ${fixedWithMatch}`);
  console.log(`   Fixed with fallback: ${fixedWithFallback}`);
  console.log(`   Still placeholder: ${keptPlaceholder - fixedWithMatch - fixedWithFallback}\n`);

  // Write output
  console.log('💾 Writing output CSV...');
  const output = currentRows.map(row => row.map(escapeCSV).join(',')).join('\n');
  fs.writeFileSync(OUTPUT_CSV, output);
  console.log(`   Saved to: ${OUTPUT_CSV}\n`);

  // Final validation
  const finalRows = parseCSV(fs.readFileSync(OUTPUT_CSV, 'utf-8'));
  let cdnCount = 0;
  let placeholderCount = 0;
  let externalCount = 0;
  
  for (let i = 1; i < finalRows.length; i++) {
    const url = finalRows[i][imgIdx] || '';
    if (url.includes('cdn.shopify.com/s/files/1/0672/5730/3114')) {
      if (url.includes('placeholder_')) {
        placeholderCount++;
      } else {
        cdnCount++;
      }
    } else if (url) {
      externalCount++;
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    FINAL STATUS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Real CDN images: ${cdnCount}`);
  console.log(`   Placeholder URLs: ${placeholderCount}`);
  console.log(`   External URLs: ${externalCount}`);
  console.log(`   Total: ${cdnCount + placeholderCount + externalCount}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
