/**
 * Post-Consolidation Variant Grouper
 * 
 * Fixes the "split family" problem where products that should be variants
 * (same product, different sizes) have different handles.
 * 
 * Rules:
 * 1. Group by vendor + baseTitle (title with size stripped)
 * 2. Merge all variants under a single canonical handle
 * 3. Normalize size values (1 Gallon → 1 gal, etc.)
 * 4. Deduplicate variants with same normalized size
 * 5. Ensure Option1 Name = "Size" on every row with Option1 Value
 */

const fs = require('fs');

// Size normalization map
const SIZE_NORMALIZATIONS = {
  // Gallons
  'gallon': '1 gal',
  '1 gallon': '1 gal',
  '1gal': '1 gal',
  '1 gal': '1 gal',
  'gal': '1 gal',
  '2.5 gallon': '2.5 gal',
  '2.5gal': '2.5 gal',
  '5 gallon': '5 gal',
  '5gal': '5 gal',
  
  // Quarts
  'quart': '1 qt',
  '1 quart': '1 qt',
  '1qt': '1 qt',
  '1 qt': '1 qt',
  'qt': '1 qt',
  
  // Liters
  '1 liter': '1 L',
  '1 litre': '1 L',
  '1l': '1 L',
  '1 l': '1 L',
  '1lt': '1 L',
  '1 lt': '1 L',
  'liter': '1 L',
  'litre': '1 L',
  '4l': '4 L',
  '4 l': '4 L',
  '10l': '10 L',
  '10 l': '10 L',
  
  // Milliliters
  '100ml': '100 ml',
  '100 ml': '100 ml',
  '250ml': '250 ml',
  '250 ml': '250 ml',
  '500ml': '500 ml',
  '500 ml': '500 ml',
  
  // Ounces
  '32oz': '32 oz',
  '32 oz': '32 oz',
  '16oz': '16 oz',
  '16 oz': '16 oz',
  '8oz': '8 oz',
  '8 oz': '8 oz',
};

function normalizeSize(size) {
  if (!size) return '';
  const lower = size.toLowerCase().trim();
  return SIZE_NORMALIZATIONS[lower] || size.trim();
}

// Extract base title by removing size patterns
function extractBaseTitle(title) {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  
  // Remove parenthetical sizes: "Product (1 gal)"
  t = t.replace(/\([^)]*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b[^)]*\)/gi, '');
  
  // Remove trailing size patterns: "Product 1gal", "Product 500ml"
  t = t.replace(/\b\d+(\.\d+)?\s*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b\.?$/gi, '');
  
  // Remove trailing size words: "Product Gallon"
  t = t.replace(/\b(gallon|quart|liter|litre)\s*$/gi, '');
  
  // Clean up
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/[-–—]+$/, '').trim();
  
  return t;
}

// Parse CSV properly
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function buildCSVLine(fields) {
  return fields.map(f => `"${(f || '').replace(/"/g, '""')}"`).join(',');
}

// Extract size from title or handle
function extractSizeFromText(text) {
  if (!text) return '';
  
  // Common size patterns
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

// Main processing
console.log('=== Post-Consolidation Variant Grouper ===\n');

const csvPath = 'outputs/shopify_complete_import.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');
const header = lines[0];
const headerFields = parseCSVLine(header);

// Find column indices
const handleIdx = 0;
const titleIdx = 1;
const vendorIdx = 3;
const opt1NameIdx = headerFields.findIndex(h => h === 'Option1 Name');
const opt1ValIdx = headerFields.findIndex(h => h === 'Option1 Value');
const priceIdx = headerFields.findIndex(h => h === 'Variant Price');
const skuIdx = headerFields.findIndex(h => h === 'Variant SKU');

console.log(`Column indices: Title=${titleIdx}, Vendor=${vendorIdx}, Option1Name=${opt1NameIdx}, Option1Value=${opt1ValIdx}`);

// First pass: Group products by vendor + baseTitle
const productGroups = new Map(); // key -> array of {lineIdx, fields, handle, title, vendor}

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  const handle = fields[handleIdx];
  const title = fields[titleIdx];
  const vendor = (fields[vendorIdx] || '').toLowerCase().trim();
  
  // Skip variant rows (no title) for grouping purposes
  // But we'll include them when processing
  if (title) {
    const baseTitle = extractBaseTitle(title);
    const groupKey = `${vendor}|${baseTitle}`;
    
    if (!productGroups.has(groupKey)) {
      productGroups.set(groupKey, []);
    }
    productGroups.get(groupKey).push({
      lineIdx: i,
      handle,
      title,
      vendor,
      baseTitle,
      fields,
    });
  }
}

// Find groups with multiple products that should be merged
const splitFamilies = [];
for (const [key, products] of productGroups) {
  const uniqueHandles = new Set(products.map(p => p.handle));
  if (uniqueHandles.size > 1) {
    splitFamilies.push({
      key,
      handles: [...uniqueHandles],
      products,
    });
  }
}

console.log(`\nFound ${splitFamilies.length} split families to merge\n`);

// Build a map of handle -> canonical handle (for merging)
const handleMergeMap = new Map();
for (const family of splitFamilies) {
  // Choose the "best" handle as canonical (shortest, or has the most description)
  const sorted = family.products.sort((a, b) => {
    // Prefer handle without size suffix
    const aHasSize = /-\d*(gal|qt|ml|l|oz)/i.test(a.handle) || /-\d+$/.test(a.handle);
    const bHasSize = /-\d*(gal|qt|ml|l|oz)/i.test(b.handle) || /-\d+$/.test(b.handle);
    if (aHasSize !== bHasSize) return aHasSize ? 1 : -1;
    
    // Prefer shorter handle
    return a.handle.length - b.handle.length;
  });
  
  const canonicalHandle = sorted[0].handle;
  
  for (const product of family.products) {
    if (product.handle !== canonicalHandle) {
      handleMergeMap.set(product.handle, canonicalHandle);
    }
  }
}

console.log(`Will merge ${handleMergeMap.size} handles into canonical products\n`);

// Second pass: Process all rows and apply fixes
const newRows = [header];
const seenVariants = new Map(); // handle -> Set of normalized sizes
let fixedRows = 0;
let mergedRows = 0;
let deduplicatedRows = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  let handle = fields[handleIdx];
  let title = fields[titleIdx];
  let opt1Name = fields[opt1NameIdx];
  let opt1Val = fields[opt1ValIdx];
  
  // 1. Apply handle merging
  if (handleMergeMap.has(handle)) {
    const oldHandle = handle;
    handle = handleMergeMap.get(handle);
    fields[handleIdx] = handle;
    mergedRows++;
    
    // If this was a primary product row, make it a variant row
    // (clear title, keep other data)
    if (title) {
      // Extract size from the old title/handle if not already set
      if (!opt1Val) {
        const sizeFromTitle = extractSizeFromText(title);
        const sizeFromHandle = extractSizeFromText(oldHandle);
        opt1Val = sizeFromTitle || sizeFromHandle || 'Default';
        fields[opt1ValIdx] = opt1Val;
      }
      // Clear title for merged variant rows (only first row of product keeps title)
      // Actually, we need to check if canonical handle already has a title row
    }
  }
  
  // 2. Normalize size values
  if (opt1Val) {
    const normalized = normalizeSize(opt1Val);
    if (normalized !== opt1Val) {
      fields[opt1ValIdx] = normalized;
      opt1Val = normalized;
      fixedRows++;
    }
  }
  
  // 3. Ensure Option1 Name = "Size" if Option1 Value is set
  if (opt1Val && !opt1Name) {
    fields[opt1NameIdx] = 'Size';
    opt1Name = 'Size';
    fixedRows++;
  }
  
  // 4. Deduplicate variants with same size under same handle
  if (!seenVariants.has(handle)) {
    seenVariants.set(handle, new Set());
  }
  
  const variantKey = normalizeSize(opt1Val) || 'default';
  if (seenVariants.get(handle).has(variantKey)) {
    // Skip this duplicate variant
    deduplicatedRows++;
    continue;
  }
  seenVariants.get(handle).add(variantKey);
  
  newRows.push(buildCSVLine(fields));
}

// Write output
const outputPath = 'outputs/shopify_complete_import_grouped.csv';
fs.writeFileSync(outputPath, newRows.join('\n'));

console.log('=== Results ===');
console.log(`Original rows: ${lines.length - 1}`);
console.log(`Output rows: ${newRows.length - 1}`);
console.log(`Merged handles: ${mergedRows}`);
console.log(`Fixed Option fields: ${fixedRows}`);
console.log(`Deduplicated variants: ${deduplicatedRows}`);
console.log(`\nWritten to: ${outputPath}`);

// Show sample of merged families
console.log('\n=== Sample Merged Families ===');
let shown = 0;
for (const [oldHandle, newHandle] of handleMergeMap) {
  if (shown++ < 10) {
    console.log(`  ${oldHandle} → ${newHandle}`);
  }
}
