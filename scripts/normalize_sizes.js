#!/usr/bin/env node
/**
 * normalize_sizes.js
 * Standardizes all Size attribute values to canonical format
 * 
 * Usage: node scripts/normalize_sizes.js [--confirm]
 * Default: dry-run mode (shows what would change)
 */

const fs = require('fs');
const path = require('path');

// Size normalization mappings
const SIZE_NORMALIZATIONS = {
  // Volume - Liters
  '1 l': '1L', '1 liter': '1L', '1 liters': '1L', '1 lt': '1L', '1 lt.': '1L', '1000ml': '1L', '1000 ml': '1L',
  '4 l': '4L', '4 liter': '4L', '4 lt': '4L', '4 lt.': '4L',
  '10 l': '10L', '10 liter': '10L', '10 liters': '10L', '10 lt': '10L', '10 lt.': '10L',
  '20 lt': '20L', '20 liter': '20L',
  '23 l': '23L', '23 liter': '23L', '23 lt': '23L', '23 liter': '23L',
  '40 lt': '40L', '50 lt': '50L', '50 liter': '50L',
  
  // Volume - Milliliters
  '100 ml': '100ml', '100 ml.': '100ml',
  '125 ml': '125ml', '125 ml.': '125ml',
  '250 ml': '250ml', '250 ml.': '250ml',
  '275 ml': '275ml',
  '500 ml': '500ml', '500 ml.': '500ml',
  '60 ml': '60ml', '80 ml': '80ml',
  '10 ml': '10ml', '10ml.': '10ml', '20 ml': '20ml', '50 ml': '50ml',
  
  // Volume - US Units
  '1 quart': '1 Quart', 'qt.': '1 Quart', 'qt,': '1 Quart', 'quart': '1 Quart',
  '1 pint': '1 Pint', 'pint': '1 Pint', 'pt': '1 Pint', 'pt.': '1 Pint',
  '1 gallon': '1 Gallon', '1 gal': '1 Gallon', 'gal': '1 Gallon', 'gallon': '1 Gallon', '1 galon': '1 Gallon',
  '2 gallon': '2 Gallon', '2 gal': '2 Gallon',
  '2.5 gallon': '2.5 Gallon', '2.5 gal': '2.5 Gallon', '2.5 jug': '2.5 Gallon',
  '3 gallon': '3 Gallon', '3 gal': '3 Gallon',
  '4 gallon': '4 Gallon',
  '5 gallon': '5 Gallon', '5 gal': '5 Gallon', '5 gal.': '5 Gallon', '5  gallon': '5 Gallon',
  '6 gallon': '6 Gallon', '6 gal': '6 Gallon', '6 gall': '6 Gallon',
  '7 gallon': '7 Gallon',
  '10 gallon': '10 Gallon',
  '15 gallon': '15 Gallon', '15 ga': '15 Gallon',
  '18 gallon': '18 Gallon',
  '20 gallon': '20 Gallon', '20 gal.': '20 Gallon',
  '70 gallon': '70 Gallon',
  
  // Weight - Ounces
  '1 oz': '1 oz', '1 oz.': '1 oz', '1oz': '1 oz',
  '2 oz': '2 oz', '2 oz.': '2 oz',
  '4 oz': '4 oz', '4 oz.': '4 oz', '4oz': '4 oz',
  '6 oz': '6 oz', '7 oz': '7 oz',
  '8 oz': '8 oz', '8 oz.': '8 oz', '8oz': '8 oz',
  '12 oz': '12 oz', '12 oz.': '12 oz', '12oz': '12 oz',
  '14 oz': '14 oz',
  '15 oz.': '15 oz',
  '16 oz': '16 oz', '16 oz.': '16 oz', '16oz': '16 oz', '16oz.': '16 oz', '16 0z': '16 oz',
  '24 oz': '24 oz',
  '32 oz': '32 oz', '32 oz.': '32 oz', '32oz': '32 oz',
  '1/2 oz': '0.5 oz', '1/4 oz': '0.25 oz', '1/4 oz.': '0.25 oz',
  
  // Weight - Pounds
  '1 lb': '1 lb', '1 lb.': '1 lb', '1lb': '1 lb', '1 pound': '1 lb',
  '2 lb': '2 lb', '2 pound': '2 lb',
  '3 lb': '3 lb',
  '4 lb': '4 lb', '4 pound': '4 lb',
  '5 lb': '5 lb', '5 lb.': '5 lb', '5lb': '5 lb', '5 pound': '5 lb', '5 pounds': '5 lb',
  '6 lb': '6 lb', '6 pound': '6 lb', '6  pound': '6 lb', '6lb': '6 lb',
  '10 lb': '10 lb', '10 lb.': '10 lb', '10 pound': '10 lb', '10 pounds': '10 lb',
  '11 lb': '11 lb', '11 pounds': '11 lb',
  '12 pounds': '12 lb',
  '15 lb': '15 lb', '15 pound': '15 lb',
  '16 lb': '16 lb',
  '20 lb': '20 lb',
  '25 lb': '25 lb', '25 lb.': '25 lb', '25 pound': '25 lb',
  '40 lb': '40 lb',
  '49 lb': '49 lb',
  '50 pounds': '50 lb',
  '1/2 pound': '0.5 lb',
  
  // Weight - Grams
  '10 grams': '10g', '12 gram': '12g',
  '50 g': '50g', '67 gm': '67g', '67 grams': '67g',
  '90g': '90g',
  '100 g': '100g', '100 gm': '100g',
  '112 g': '112g',
  '130 g': '130g', '130 gm': '130g', '130gm': '130g',
  '150 gm': '150g',
  '224 g': '224g',
  '300 g': '300g',
  '350 gm': '350g',
  '400g': '400g',
  '500 g': '500g', '500g': '500g',
  '600 gm': '600g', '650 gm.': '650g',
  
  // Weight - Kilograms
  '1 kg': '1kg', '1 kg.': '1kg', '1 kilo': '1kg', '1kg 2.2lb': '1kg',
  '2 kg': '2kg', '2.5 kg': '2.5kg', '3 kg': '3kg',
  '10 kg': '10kg', '10kg': '10kg',
  '25 kg': '25kg',
  
  // Dimensions - Inches
  '4 inch': '4 inch', '4 in': '4 inch', '4in': '4 inch',
  '6 inch': '6 inch', '6 in': '6 inch', '6 in.': '6 inch', '6in': '6 inch',
  '8 inch': '8 inch', '8 in': '8 inch',
  '10 inch': '10 inch', '10 in': '10 inch',
  '12 inch': '12 inch', '12 inches': '12 inch',
  '13 inch': '13 inch',
  '16 inches': '16 inch', '17 inches': '17 inch',
  '18 inches': '18 inch',
  '20 inches': '20 inch',
  '24 inches': '24 inch', '24 in.': '24 inch',
  '48 inches s.': '48 inch',
  
  // Count/Pack
  '1 pc': '1 Pc', '1 pice': '1 Pc', '1 piece': '1 Pc', '1 Pc': '1 Pc', '1 PC': '1 Pc',
  '2 pc': '2 Pc', '2 Pc': '2 Pc',
  '6 pc': '6 Pc', '6 Pc': '6 Pc',
  '1 pack': '1 Pack', '1 pk': '1 Pack', '1 Pk': '1 Pack', '1 Pkg': '1 Pack',
  '3 pk': '3 Pack', '5 pack': '5 Pack', '5 Pack': '5 Pack',
  '10 pk': '10 Pack', '10 Pk': '10 Pack',
  '25 pk': '25 Pack', '25 Pk': '25 Pack',
  '6 ct': '6 Pack', '6 Ct': '6 Pack',
  '8 ct': '8 Pack', '8 Ct': '8 Pack',
  '10 ct': '10 Pack', '10 Ct': '10 Pack',
  '12 ct': '12 Pack', '12 Ct': '12 Pack',
  '20 ct': '20 Pack', '20 Ct': '20 Pack',
  '25 ct': '25 Pack', '25 Ct': '25 Pack',
  '45 ct': '45 Pack',
  '50 ct': '50 Pack', '50 Ct': '50 Pack',
  '100 ct': '100 Pack', '100/pk': '100 Pack',
  '200ct': '200 Pack',
  
  // Wattage
  '125 watt': '125W', '150 w': '150W', '150 watt': '150W', '150Watt': '150W',
  '250W': '250W', '250 w': '250W',
  '300 watt': '300W',
  '315 w': '315W', '315 W CMH': '315W',
  '400 w': '400W', '400 watt': '400W', '400W': '400W', '400V': '400W',
  '600 w': '600W', '600 w.': '600W', '600 watt': '600W', '600Watt': '600W', '600 watt cmh': '600W CMH',
  '630 Watt CMH': '630W CMH', '630 CMH': '630W CMH',
  '660 w led': '660W LED',
  '1000 w': '1000W', '1000 watt': '1000W', '1000w': '1000W',
  '2000watt': '2000W', '3000 watt': '3000W', '5000W': '5000W',
  
  // Miscellaneous
  'book': 'Book', 'box': 'Box', 'case': 'Case',
  'kit': 'Kit', 'gallon kit': 'Gallon Kit',
  'large': 'Large', 'medium': 'Medium', 'small': 'Small', 'xl': 'XL',
  'pair': 'Pair',
  'mat': 'Mat', 'slab': 'Slab',
  'trio': 'Trio', 'tri pack': 'Trio', 'tri pk': 'Trio',
  'dual': 'Dual',
  'liter': '1L',
};

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

function normalizeSize(value) {
  if (!value) return value;
  
  // Handle pipe-separated values
  if (value.includes('|')) {
    return value.split('|').map(v => normalizeSize(v.trim())).join(' | ');
  }
  
  const lower = value.toLowerCase().trim();
  
  // Direct lookup
  if (SIZE_NORMALIZATIONS[lower]) {
    return SIZE_NORMALIZATIONS[lower];
  }
  
  // Return as-is if no match (preserve original)
  return value.trim();
}

// Main
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');

const inputPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv');
const outputPath = path.join(__dirname, '..', 'outputs', 'woocommerce_import_normalized.csv');
const logPath = path.join(__dirname, '..', 'outputs', 'size_normalization_log.json');

console.log('='.repeat(60));
console.log('SIZE NORMALIZATION');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN (use --confirm to apply)' : 'APPLYING CHANGES'}`);
console.log('');

const data = fs.readFileSync(inputPath, 'utf8');
const { headers, records } = parseCSV(data);

const changes = [];
let changedCount = 0;

records.forEach(record => {
  const attrField = 'Attribute 1 value(s)';
  const original = record[attrField];
  
  if (original) {
    const normalized = normalizeSize(original);
    if (normalized !== original) {
      changes.push({
        sku: record.SKU,
        name: record.Name ? record.Name.substring(0, 40) : '',
        before: original,
        after: normalized
      });
      changedCount++;
      record[attrField] = normalized;
    }
  }
});

console.log(`Products with size changes: ${changedCount}`);
console.log('');

if (changes.length > 0) {
  console.log('Sample changes (first 20):');
  console.log('-'.repeat(60));
  changes.slice(0, 20).forEach(c => {
    console.log(`  ${c.sku}: "${c.before}" → "${c.after}"`);
  });
  console.log('');
}

if (!dryRun) {
  // Write normalized CSV
  const outputLines = [headers.join(',')];
  records.forEach(record => {
    const row = headers.map(h => escapeCSV(record[h]));
    outputLines.push(row.join(','));
  });
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
  console.log(`✅ Normalized CSV written to: ${outputPath}`);
  
  // Write log
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: 'size_normalization',
    total_changes: changedCount,
    changes: changes
  }, null, 2), 'utf8');
  console.log(`✅ Change log written to: ${logPath}`);
} else {
  console.log('DRY RUN - No files modified');
  console.log('Run with --confirm to apply changes');
}

console.log('');
