/**
 * Post-Consolidation Variant Grouper v2
 * 
 * Fixes:
 * 1. Groups products by vendor + baseTitle → single handle
 * 2. Normalizes size values
 * 3. Deduplicates variants keeping the BEST one (has price/SKU)
 * 4. Ensures Option1 Name = "Size" on every row with Option1 Value
 * 5. Sets "Default Title" for single-variant products
 */

const fs = require('fs');

// Size normalization map
const SIZE_NORMALIZATIONS = {
  'gallon': '1 gal', '1 gallon': '1 gal', '1gal': '1 gal', '1 gal': '1 gal', 'gal': '1 gal',
  '2.5 gallon': '2.5 gal', '2.5gal': '2.5 gal', '5 gallon': '5 gal', '5gal': '5 gal',
  'quart': '1 qt', '1 quart': '1 qt', '1qt': '1 qt', '1 qt': '1 qt', 'qt': '1 qt',
  '1 liter': '1 L', '1 litre': '1 L', '1l': '1 L', '1 l': '1 L', '1lt': '1 L', '1 lt': '1 L',
  'liter': '1 L', 'litre': '1 L', '4l': '4 L', '4 l': '4 L', '10l': '10 L', '10 l': '10 L',
  '100ml': '100 ml', '100 ml': '100 ml', '250ml': '250 ml', '250 ml': '250 ml',
  '500ml': '500 ml', '500 ml': '500 ml',
  '32oz': '32 oz', '32 oz': '32 oz', '16oz': '16 oz', '16 oz': '16 oz',
  '8oz': '8 oz', '8 oz': '8 oz',
};

function normalizeSize(size) {
  if (!size) return '';
  const lower = size.toLowerCase().trim();
  return SIZE_NORMALIZATIONS[lower] || size.trim();
}

function extractBaseTitle(title) {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  t = t.replace(/\([^)]*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b[^)]*\)/gi, '');
  t = t.replace(/\b\d+(\.\d+)?\s*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b\.?$/gi, '');
  t = t.replace(/\b(gallon|quart|liter|litre)\s*$/gi, '');
  t = t.replace(/\s+/g, ' ').trim().replace(/[-–—]+$/, '').trim();
  return t;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else { current += char; }
  }
  fields.push(current);
  return fields;
}

function buildCSVLine(fields) {
  return fields.map(f => `"${(f || '').replace(/"/g, '""')}"`).join(',');
}

function extractSizeFromText(text) {
  if (!text) return '';
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(gal|gallon)/i,
    /(\d+(?:\.\d+)?)\s*(qt|quart)/i,
    /(\d+(?:\.\d+)?)\s*(l|lt|liter|litre)\b/i,
    /(\d+(?:\.\d+)?)\s*(ml)/i,
    /(\d+(?:\.\d+)?)\s*(oz)/i,
    /\b(gallon|quart)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && match[2]) {
        const num = match[1];
        const unit = match[2].toLowerCase();
        if (unit.includes('gal')) return `${num} gal`;
        if (unit.includes('qt') || unit.includes('quart')) return `${num} qt`;
        if (unit === 'l' || unit === 'lt' || unit.includes('liter') || unit.includes('litre')) return `${num} L`;
        if (unit === 'ml') return `${num} ml`;
        if (unit === 'oz') return `${num} oz`;
      } else if (match[1]) {
        if (match[1].toLowerCase() === 'gallon') return '1 gal';
        if (match[1].toLowerCase() === 'quart') return '1 qt';
      }
    }
  }
  return '';
}

// Variant quality score (higher = better)
function variantScore(fields, priceIdx, skuIdx, invIdx) {
  let score = 0;
  const price = parseFloat(fields[priceIdx]) || 0;
  if (price > 0) score += 10;
  if (fields[skuIdx]?.trim()) score += 5;
  const inv = parseInt(fields[invIdx]) || 0;
  if (inv > 0) score += 3;
  return score;
}

console.log('=== Post-Consolidation Variant Grouper v2 ===\n');

const csvPath = 'outputs/shopify_complete_import.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');
const header = lines[0];
const headerFields = parseCSVLine(header);

const handleIdx = 0;
const titleIdx = 1;
const vendorIdx = 3;
const opt1NameIdx = headerFields.findIndex(h => h === 'Option1 Name');
const opt1ValIdx = headerFields.findIndex(h => h === 'Option1 Value');
const priceIdx = headerFields.findIndex(h => h === 'Variant Price');
const skuIdx = headerFields.findIndex(h => h === 'Variant SKU');
const invIdx = headerFields.findIndex(h => h === 'Variant Inventory Qty');

console.log(`Columns: Opt1Name=${opt1NameIdx}, Opt1Val=${opt1ValIdx}, Price=${priceIdx}, SKU=${skuIdx}`);

// First pass: Collect all rows by handle
const rowsByHandle = new Map();
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const fields = parseCSVLine(line);
  const handle = fields[handleIdx];
  if (!rowsByHandle.has(handle)) {
    rowsByHandle.set(handle, []);
  }
  rowsByHandle.get(handle).push({ lineIdx: i, fields });
}

// Second pass: Group handles by vendor + baseTitle to find split families
const productGroups = new Map();
for (const [handle, rows] of rowsByHandle) {
  // Find the primary row (has title)
  const primaryRow = rows.find(r => r.fields[titleIdx]?.trim());
  if (!primaryRow) continue;
  
  const title = primaryRow.fields[titleIdx];
  const vendor = (primaryRow.fields[vendorIdx] || '').toLowerCase().trim();
  const baseTitle = extractBaseTitle(title);
  const groupKey = `${vendor}|${baseTitle}`;
  
  if (!productGroups.has(groupKey)) {
    productGroups.set(groupKey, []);
  }
  productGroups.get(groupKey).push({ handle, rows, title, vendor, baseTitle });
}

// Build handle merge map
const handleMergeMap = new Map();
let splitFamilyCount = 0;

for (const [key, products] of productGroups) {
  if (products.length <= 1) continue;
  splitFamilyCount++;
  
  // Choose canonical handle (shortest without size suffix)
  const sorted = [...products].sort((a, b) => {
    const aHasSize = /-\d*(gal|qt|ml|l|oz)/i.test(a.handle) || /-\d+$/.test(a.handle);
    const bHasSize = /-\d*(gal|qt|ml|l|oz)/i.test(b.handle) || /-\d+$/.test(b.handle);
    if (aHasSize !== bHasSize) return aHasSize ? 1 : -1;
    return a.handle.length - b.handle.length;
  });
  
  const canonicalHandle = sorted[0].handle;
  for (const product of products) {
    if (product.handle !== canonicalHandle) {
      handleMergeMap.set(product.handle, canonicalHandle);
    }
  }
}

console.log(`Split families found: ${splitFamilyCount}`);
console.log(`Handles to merge: ${handleMergeMap.size}`);

// Third pass: Build final output with proper grouping and deduplication
const finalRowsByHandle = new Map();

for (const [handle, rows] of rowsByHandle) {
  const targetHandle = handleMergeMap.get(handle) || handle;
  
  if (!finalRowsByHandle.has(targetHandle)) {
    finalRowsByHandle.set(targetHandle, []);
  }
  
  for (const row of rows) {
    const fields = [...row.fields]; // Clone
    const originalHandle = fields[handleIdx];
    fields[handleIdx] = targetHandle;
    
    // Extract/normalize size
    let opt1Val = fields[opt1ValIdx]?.trim() || '';
    if (!opt1Val) {
      // Try to extract from title or original handle
      const sizeFromTitle = extractSizeFromText(fields[titleIdx] || '');
      const sizeFromHandle = extractSizeFromText(originalHandle);
      opt1Val = sizeFromTitle || sizeFromHandle;
    }
    opt1Val = normalizeSize(opt1Val);
    fields[opt1ValIdx] = opt1Val;
    
    // Ensure Option1 Name if Option1 Value is set
    if (opt1Val && !fields[opt1NameIdx]?.trim()) {
      fields[opt1NameIdx] = 'Size';
    }
    
    finalRowsByHandle.get(targetHandle).push({
      fields,
      opt1Val,
      score: variantScore(fields, priceIdx, skuIdx, invIdx),
      hasTitle: !!fields[titleIdx]?.trim(),
    });
  }
}

// Fourth pass: Deduplicate and build final CSV
const newRows = [header];
let deduplicatedCount = 0;
let defaultTitleCount = 0;

for (const [handle, rows] of finalRowsByHandle) {
  // Group by Option1 Value
  const bySize = new Map();
  for (const row of rows) {
    const sizeKey = row.opt1Val || '__default__';
    if (!bySize.has(sizeKey)) {
      bySize.set(sizeKey, []);
    }
    bySize.get(sizeKey).push(row);
  }
  
  // For each size, keep best variant
  const keptRows = [];
  for (const [sizeKey, variants] of bySize) {
    // Sort by: hasTitle first, then score
    variants.sort((a, b) => {
      if (a.hasTitle !== b.hasTitle) return a.hasTitle ? -1 : 1;
      return b.score - a.score;
    });
    
    keptRows.push(variants[0]);
    deduplicatedCount += variants.length - 1;
  }
  
  // Sort kept rows: primary (has title) first
  keptRows.sort((a, b) => {
    if (a.hasTitle !== b.hasTitle) return a.hasTitle ? -1 : 1;
    return 0;
  });
  
  // If single variant with no size, set "Default Title"
  if (keptRows.length === 1 && !keptRows[0].opt1Val) {
    keptRows[0].fields[opt1ValIdx] = 'Default Title';
    keptRows[0].fields[opt1NameIdx] = 'Title';
    defaultTitleCount++;
  }
  
  // If multiple variants but some have no size, assign "Default" 
  if (keptRows.length > 1) {
    for (const row of keptRows) {
      if (!row.fields[opt1ValIdx]) {
        row.fields[opt1ValIdx] = 'Default';
        row.fields[opt1NameIdx] = 'Size';
      }
    }
  }
  
  for (const row of keptRows) {
    newRows.push(buildCSVLine(row.fields));
  }
}

const outputPath = 'outputs/shopify_complete_import_grouped.csv';
fs.writeFileSync(outputPath, newRows.join('\n'));

console.log('\n=== Results ===');
console.log(`Original rows: ${lines.length - 1}`);
console.log(`Output rows: ${newRows.length - 1}`);
console.log(`Deduplicated variants: ${deduplicatedCount}`);
console.log(`Set "Default Title": ${defaultTitleCount}`);
console.log(`\nWritten to: ${outputPath}`);

// Verify
console.log('\n=== Verification ===');
const verifyRows = newRows.slice(1).map(r => parseCSVLine(r));
const emptyOpt1 = verifyRows.filter(f => !f[opt1ValIdx]?.trim()).length;
const uniqueHandles = new Set(verifyRows.map(f => f[handleIdx])).size;
console.log(`Unique handles: ${uniqueHandles}`);
console.log(`Rows with empty Option1 Value: ${emptyOpt1}`);
