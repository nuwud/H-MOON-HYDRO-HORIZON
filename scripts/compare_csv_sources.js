/**
 * Analyze multiple Shopify CSV files to find the best source with highest data coverage
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell);
  return result;
}

function analyzeFile(filepath) {
  const filename = path.basename(filepath);
  const data = fs.readFileSync(filepath, 'utf-8');
  const lines = data.split('\n').filter(l => l.trim());
  const header = parseCSVLine(lines[0]);
  
  // Find column indices
  const cols = {
    handle: header.findIndex(h => h.toLowerCase() === 'handle'),
    title: header.findIndex(h => h.toLowerCase() === 'title'),
    body: header.findIndex(h => h.toLowerCase().includes('body')),
    vendor: header.findIndex(h => h.toLowerCase() === 'vendor'),
    variantSku: header.findIndex(h => h.toLowerCase().includes('variant sku')),
    variantGrams: header.findIndex(h => h.toLowerCase().includes('variant grams')),
    variantPrice: header.findIndex(h => h.toLowerCase().includes('variant price')),
    imageSrc: header.findIndex(h => h.toLowerCase().includes('image src')),
    tags: header.findIndex(h => h.toLowerCase() === 'tags'),
    type: header.findIndex(h => h.toLowerCase() === 'type'),
  };
  
  const stats = {
    totalRows: lines.length - 1,
    uniqueHandles: new Set(),
    withTitle: 0,
    withBody: 0,
    withVendor: 0,
    withSku: 0,
    withGrams: 0,
    withPrice: 0,
    withImage: 0,
    withTags: 0,
    withType: 0,
  };
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    
    if (cols.handle >= 0 && row[cols.handle]) stats.uniqueHandles.add(row[cols.handle]);
    if (cols.title >= 0 && row[cols.title]?.trim()) stats.withTitle++;
    if (cols.body >= 0 && row[cols.body]?.trim()) stats.withBody++;
    if (cols.vendor >= 0 && row[cols.vendor]?.trim()) stats.withVendor++;
    if (cols.variantSku >= 0 && row[cols.variantSku]?.trim()) stats.withSku++;
    if (cols.variantGrams >= 0) {
      const g = parseFloat(row[cols.variantGrams]);
      if (g && g > 0) stats.withGrams++;
    }
    if (cols.variantPrice >= 0) {
      const p = parseFloat(row[cols.variantPrice]);
      if (p && p > 0) stats.withPrice++;
    }
    if (cols.imageSrc >= 0 && row[cols.imageSrc]?.trim()) stats.withImage++;
    if (cols.tags >= 0 && row[cols.tags]?.trim()) stats.withTags++;
    if (cols.type >= 0 && row[cols.type]?.trim()) stats.withType++;
  }
  
  return {
    filename,
    totalRows: stats.totalRows,
    uniqueProducts: stats.uniqueHandles.size,
    coverage: {
      title: pct(stats.withTitle, stats.totalRows),
      body: pct(stats.withBody, stats.totalRows),
      vendor: pct(stats.withVendor, stats.totalRows),
      sku: pct(stats.withSku, stats.totalRows),
      grams: pct(stats.withGrams, stats.totalRows),
      price: pct(stats.withPrice, stats.totalRows),
      image: pct(stats.withImage, stats.totalRows),
      tags: pct(stats.withTags, stats.totalRows),
      type: pct(stats.withType, stats.totalRows),
    }
  };
}

function pct(num, total) {
  if (total === 0) return '0.0%';
  return ((num / total) * 100).toFixed(1) + '%';
}

// Files to analyze
const files = [
  'outputs/shopify_final_fixed.csv',
  'outputs/shopify_100percent_images.csv',
  'outputs/shopify_100percent.csv',
  'outputs/shopify_final_ready.csv',
  'outputs/shopify_complete_import_enriched.csv',
  'outputs/woocommerce_import_ready.csv',
];

console.log('=== SHOPIFY CSV DATA COVERAGE ANALYSIS ===\n');

const results = [];

for (const file of files) {
  const fullPath = path.join(BASE, file);
  if (fs.existsSync(fullPath)) {
    try {
      const result = analyzeFile(fullPath);
      results.push(result);
    } catch (err) {
      console.log(`Error analyzing ${file}: ${err.message}`);
    }
  } else {
    console.log(`File not found: ${file}`);
  }
}

// Print comparison table
console.log('FILE COMPARISON');
console.log('═'.repeat(120));
console.log('File'.padEnd(45) + 'Rows'.padStart(8) + 'Products'.padStart(10) + 'Title'.padStart(8) + 'Body'.padStart(8) + 'Vendor'.padStart(8) + 'SKU'.padStart(8) + 'Weight'.padStart(8) + 'Price'.padStart(8) + 'Image'.padStart(8));
console.log('─'.repeat(120));

for (const r of results) {
  console.log(
    r.filename.substring(0,44).padEnd(45) +
    String(r.totalRows).padStart(8) +
    String(r.uniqueProducts).padStart(10) +
    r.coverage.title.padStart(8) +
    r.coverage.body.padStart(8) +
    r.coverage.vendor.padStart(8) +
    r.coverage.sku.padStart(8) +
    r.coverage.grams.padStart(8) +
    r.coverage.price.padStart(8) +
    r.coverage.image.padStart(8)
  );
}

// Find the best file
console.log('\n\n=== RECOMMENDATION ===\n');

// Score each file
const scored = results.map(r => {
  // Parse percentages back to numbers
  const getNum = (pctStr) => parseFloat(pctStr.replace('%', ''));
  const score = 
    getNum(r.coverage.sku) * 2 +      // SKU is critical (2x weight)
    getNum(r.coverage.price) * 2 +    // Price is critical (2x weight)
    getNum(r.coverage.grams) * 1.5 +  // Weight is important (1.5x)
    getNum(r.coverage.image) * 1.5 +  // Image is important (1.5x)
    getNum(r.coverage.body) +
    getNum(r.coverage.vendor) +
    getNum(r.coverage.title);
  return { ...r, score };
});

scored.sort((a, b) => b.score - a.score);

console.log('Ranked by data quality score (SKU/Price weighted 2x, Weight/Image 1.5x):');
scored.forEach((r, i) => {
  console.log(`${i + 1}. ${r.filename} - Score: ${r.score.toFixed(1)}`);
  console.log(`   Weight: ${r.coverage.grams} | Price: ${r.coverage.price} | SKU: ${r.coverage.sku} | Image: ${r.coverage.image}`);
});

console.log(`\n✅ BEST SOURCE: ${scored[0].filename}`);
