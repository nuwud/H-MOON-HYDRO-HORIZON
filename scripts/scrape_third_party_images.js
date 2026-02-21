#!/usr/bin/env node
/**
 * scrape_third_party_images.js
 * Scrape product images from manufacturer websites for third-party brands
 * 
 * Usage:
 *   node scripts/scrape_third_party_images.js              # Dry run
 *   node scripts/scrape_third_party_images.js --execute    # Download images
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const INPUT_CSV = './outputs/third_party_images_needed.csv';
const OUTPUT_DIR = './outputs/scraped_images';
const OUTPUT_JSON = './outputs/scraped_image_urls.json';

// Known product image URL patterns for manufacturers
const MANUFACTURER_PATTERNS = {
  'Advanced Nutrients': {
    baseUrl: 'https://advancednutrients.com/products/',
    imagePattern: 'https://advancednutrients.com/cdn/',
    searchUrl: 'https://advancednutrients.com/search?q='
  },
  'FloraFlex': {
    baseUrl: 'https://floraflex.com/products/',
    imagePattern: 'https://cdn.shopify.com/s/files/'
  },
  'General Hydroponics': {
    baseUrl: 'https://generalhydroponics.com/products/',
    imagePattern: 'https://generalhydroponics.com/cdn/'
  },
  'Fox Farm': {
    baseUrl: 'https://foxfarm.com/product/',
    imagePattern: 'https://foxfarm.com/wp-content/uploads/'
  },
  'Gavita': {
    baseUrl: 'https://gavita.com/product/',
    imagePattern: 'https://gavita.com/wp-content/uploads/'
  }
};

// Alternative sources - industry retailers with good images
const FALLBACK_RETAILERS = [
  'https://www.htgsupply.com/',
  'https://www.growershouse.com/',
  'https://hydrobuilder.com/'
];

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Simple CSV parse (handles quoted fields)
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

// Extract base product name (without size)
function getBaseProductName(name) {
  // Remove size suffixes like "250ml", "1L", "4L", "10L", "23L"
  return name
    .replace(/\s+\d+(\.\d+)?\s*(ml|l|lt|gal|oz|lb|kg|g|liter)s?$/i, '')
    .replace(/\s+-\s*$/, '')
    .trim();
}

console.log('='.repeat(60));
console.log('THIRD-PARTY IMAGE SCRAPER');
console.log('='.repeat(60));

// Load products needing images
const csvContent = fs.readFileSync(INPUT_CSV, 'utf8');
const products = parseCSV(csvContent);

console.log(`Loaded ${products.length} products needing images`);
console.log('');

// Group by base product (so we don't scrape same product multiple times)
const byBase = new Map();
products.forEach(p => {
  const baseName = getBaseProductName(p.Name);
  const key = `${p.Brand}:${baseName}`;
  if (!byBase.has(key)) {
    byBase.set(key, {
      brand: p.Brand,
      baseName,
      variants: [],
      manufacturerUrl: p['Manufacturer URL']
    });
  }
  byBase.get(key).variants.push(p);
});

console.log(`Unique base products: ${byBase.size}`);
console.log('');

// Summary by brand
const brandSummary = {};
byBase.forEach(v => {
  brandSummary[v.brand] = (brandSummary[v.brand] || 0) + 1;
});

console.log('By brand:');
Object.entries(brandSummary)
  .sort((a, b) => b[1] - a[1])
  .forEach(([brand, count]) => {
    console.log(`  ${count} - ${brand}`);
  });

console.log('');
console.log('Base products to scrape:');
byBase.forEach((v, key) => {
  console.log(`  ${v.baseName} (${v.variants.length} variants) - ${v.brand}`);
});

// Generate search URLs
console.log('');
console.log('='.repeat(60));
console.log('SEARCH URLs FOR MANUAL LOOKUP');
console.log('='.repeat(60));

byBase.forEach((v, key) => {
  const searchQuery = encodeURIComponent(v.baseName);
  
  // Manufacturer search
  const mfgConfig = MANUFACTURER_PATTERNS[v.brand];
  if (mfgConfig && mfgConfig.searchUrl) {
    console.log(`${v.brand} - ${v.baseName}:`);
    console.log(`  ${mfgConfig.searchUrl}${searchQuery}`);
  } else if (v.manufacturerUrl) {
    console.log(`${v.brand} - ${v.baseName}:`);
    console.log(`  ${v.manufacturerUrl}search?q=${searchQuery}`);
  }
  
  // Google Image search as fallback
  console.log(`  https://www.google.com/search?tbm=isch&q=${searchQuery}+${encodeURIComponent(v.brand)}`);
  console.log('');
});

// Save for later processing
const output = {
  generated: new Date().toISOString(),
  totalProducts: products.length,
  uniqueBaseProducts: byBase.size,
  baseProducts: []
};

byBase.forEach((v, key) => {
  output.baseProducts.push({
    brand: v.brand,
    baseName: v.baseName,
    variants: v.variants.map(p => ({ sku: p.SKU, name: p.Name })),
    manufacturerUrl: v.manufacturerUrl,
    searchUrl: v.manufacturerUrl ? `${v.manufacturerUrl}search?q=${encodeURIComponent(v.baseName)}` : null,
    imageUrl: null // To be filled manually or by scraper
  });
});

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
console.log(`Saved lookup data to: ${OUTPUT_JSON}`);
