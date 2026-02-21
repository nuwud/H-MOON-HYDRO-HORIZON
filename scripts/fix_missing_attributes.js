#!/usr/bin/env node
/**
 * fix_missing_attributes.js
 * Adds Size attribute to variable products that are missing it
 * 
 * Usage: node scripts/fix_missing_attributes.js [--confirm]
 * Default: dry-run mode (shows what would change)
 */

const fs = require('fs');
const path = require('path');

// Simple CSV parser
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = {};
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

function extractSizeFromName(name) {
  if (!name) return null;
  
  // Common patterns for sizes in product names
  const patterns = [
    // Volume patterns
    /(\d+(?:\.\d+)?)\s*(?:ml|ML)/i,
    /(\d+(?:\.\d+)?)\s*(?:l|L|liter|liters|Lt)/i,
    /(\d+(?:\.\d+)?)\s*(?:gal|gallon)/i,
    /(\d+(?:\.\d+)?)\s*(?:qt|quart)/i,
    
    // Weight patterns
    /(\d+(?:\.\d+)?)\s*(?:oz|ounce)/i,
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)/i,
    /(\d+(?:\.\d+)?)\s*(?:kg|kilo)/i,
    /(\d+(?:\.\d+)?)\s*(?:g|gm|gram)(?!\w)/i,
    
    // Dimension patterns
    /(\d+(?:\.\d+)?)\s*(?:in|inch|")/i,
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')/i,
    
    // Wattage patterns
    /(\d+(?:\.\d+)?)\s*(?:w|watt)/i,
    
    // Count patterns
    /(\d+)\s*(?:pc|pk|pack|ct)/i,
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      // Return the full matched size string
      return match[0].trim();
    }
  }
  
  // Try to find size in parentheses
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1];
    // Check if it looks like a size
    if (/\d/.test(inner) && /[a-z]/i.test(inner)) {
      return inner.trim();
    }
  }
  
  return null;
}

// Main
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');

const inputPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');
const outputPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_with_attrs.csv');
const logPath = path.join(__dirname, '..', 'outputs', 'attribute_fix_log.json');

console.log('='.repeat(60));
console.log('FIX MISSING ATTRIBUTES');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN (use --confirm to apply)' : 'APPLYING CHANGES'}`);
console.log('');

const data = fs.readFileSync(inputPath, 'utf8');
const { headers, records } = parseCSV(data);

// Find variable products without attributes
const variablesWithoutAttr = records.filter(r => 
  r.Type === 'variable' && !r['Attribute 1 name']
);

console.log(`Variable products without attributes: ${variablesWithoutAttr.length}`);
console.log('');

const changes = [];
const needsManualReview = [];

variablesWithoutAttr.forEach(record => {
  const name = record.Name || '';
  const sku = record.SKU || '';
  
  // Try to extract size from name
  const sizeFromName = extractSizeFromName(name);
  
  // Check if there are variations for this product
  const parentSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const variations = records.filter(r => r.Type === 'variation' && r.Parent === parentSlug);
  
  // Collect sizes from variations
  const variationSizes = variations
    .map(v => v['Attribute 1 value(s)'] || extractSizeFromName(v.Name) || '')
    .filter(s => s);
  
  if (variationSizes.length > 0) {
    // We have variations with sizes - use those
    const allSizes = [...new Set(variationSizes)].join(' | ');
    changes.push({
      sku: sku,
      name: name.substring(0, 50),
      action: 'ADD_ATTRIBUTE',
      attribute_name: 'Size',
      attribute_values: allSizes,
      source: 'variations'
    });
    record['Attribute 1 name'] = 'Size';
    record['Attribute 1 value(s)'] = allSizes;
    record['Attribute 1 visible'] = '1';
    record['Attribute 1 global'] = '1';
  } else if (sizeFromName) {
    // Extract from product name
    changes.push({
      sku: sku,
      name: name.substring(0, 50),
      action: 'ADD_ATTRIBUTE',
      attribute_name: 'Size',
      attribute_values: sizeFromName,
      source: 'product_name'
    });
    record['Attribute 1 name'] = 'Size';
    record['Attribute 1 value(s)'] = sizeFromName;
    record['Attribute 1 visible'] = '1';
    record['Attribute 1 global'] = '1';
  } else {
    // No size found - needs manual review
    needsManualReview.push({
      sku: sku,
      name: name,
      variations_count: variations.length,
      reason: 'No size pattern found in name or variations'
    });
  }
});

console.log(`Products auto-fixed: ${changes.length}`);
console.log(`Products needing manual review: ${needsManualReview.length}`);
console.log('');

if (changes.length > 0) {
  console.log('Sample fixes (first 15):');
  console.log('-'.repeat(60));
  changes.slice(0, 15).forEach(c => {
    console.log(`  ${c.sku}: Add Size = "${c.attribute_values}" (from ${c.source})`);
  });
  console.log('');
}

if (needsManualReview.length > 0) {
  console.log('Needs manual review:');
  console.log('-'.repeat(60));
  needsManualReview.forEach(r => {
    console.log(`  ${r.sku}: ${r.name.substring(0, 50)}`);
  });
  console.log('');
}

if (!dryRun) {
  // Write fixed CSV
  const outputLines = [headers.join(',')];
  records.forEach(record => {
    const row = headers.map(h => escapeCSV(record[h]));
    outputLines.push(row.join(','));
  });
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
  console.log(`✅ Fixed CSV written to: ${outputPath}`);
  
  // Write log
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: 'fix_missing_attributes',
    auto_fixed: changes.length,
    needs_manual: needsManualReview.length,
    changes: changes,
    manual_review: needsManualReview
  }, null, 2), 'utf8');
  console.log(`✅ Change log written to: ${logPath}`);
} else {
  console.log('DRY RUN - No files modified');
  console.log('Run with --confirm to apply changes');
}

console.log('');
