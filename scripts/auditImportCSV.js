/**
 * auditImportCSV.js - Comprehensive audit of the Shopify import CSV
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const content = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

console.log('═'.repeat(70));
console.log('           SHOPIFY IMPORT CSV AUDIT');
console.log('═'.repeat(70));
console.log(`File: ${CSV_PATH}`);
console.log(`Total rows: ${lines.length - 1} (excluding header)`);

// Parse CSV properly
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

const header = parseCSVLine(lines[0]);
console.log(`Columns: ${header.length}`);

const headerMap = {};
header.forEach((h, i) => headerMap[h.trim()] = i);

const issues = {
  emptyTitle: [],
  emptyBody: [],
  emptyVendor: [],
  badVendor: [],
  emptyType: [],
  emptyTags: [],
  emptyPrice: [],
  zeroPrice: [],
  emptySku: [],
  badOption1Value: [],
  titleStartsWithDot: [],
  emptyHandle: [],
  badWeight: [],
  missingImage: [],
  duplicateSku: new Map(),
  option1Issues: [],
};

const handleToProducts = new Map();
const skuCounts = new Map();
let totalProducts = 0;
let totalVariants = 0;
let totalImageRows = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const handle = row[headerMap['Handle']] || '';
  const title = row[headerMap['Title']] || '';
  const body = row[headerMap['Body (HTML)']] || '';
  const vendor = row[headerMap['Vendor']] || '';
  const type = row[headerMap['Type']] || '';
  const tags = row[headerMap['Tags']] || '';
  const price = row[headerMap['Variant Price']] || '';
  const sku = row[headerMap['Variant SKU']] || '';
  const option1Name = row[headerMap['Option1 Name']] || '';
  const option1Value = row[headerMap['Option1 Value']] || '';
  const weight = row[headerMap['Variant Grams']] || '';
  const imageSrc = row[headerMap['Image Src']] || '';
  const imagePosition = row[headerMap['Image Position']] || '';
  
  // Main product row vs variant row vs image-only row
  const isMainRow = title.trim().length > 0;
  const isImageOnlyRow = !isMainRow && !option1Value.trim() && imageSrc.trim().length > 0;
  const isVariantRow = !isMainRow && option1Value.trim().length > 0;
  
  if (isMainRow) {
    totalProducts++;
    
    // Track handle -> title for grouping check
    if (!handleToProducts.has(handle)) {
      handleToProducts.set(handle, { titles: new Set(), count: 0 });
    }
    handleToProducts.get(handle).titles.add(title);
    handleToProducts.get(handle).count++;
    
    if (!body.trim()) issues.emptyBody.push({ line: i, handle, title: title.substring(0, 50) });
    if (!vendor.trim()) issues.emptyVendor.push({ line: i, handle, title: title.substring(0, 50) });
    if (vendor === 'Unknown') issues.badVendor.push({ line: i, handle, title: title.substring(0, 50), vendor });
    if (!type.trim()) issues.emptyType.push({ line: i, handle, title: title.substring(0, 50) });
    if (title.startsWith('. ') || title.startsWith('.')) issues.titleStartsWithDot.push({ line: i, handle, title });
    if (!imageSrc.trim()) issues.missingImage.push({ line: i, handle, title: title.substring(0, 50) });
  } else if (isImageOnlyRow) {
    totalImageRows++;
    // Image-only rows don't need price/sku - skip those checks
    continue;
  } else {
    totalVariants++;
  }
  
  // Check all rows (products + variants, but NOT image-only rows)
  if (!handle) issues.emptyHandle.push(i);
  if (!price || parseFloat(price) === 0) issues.zeroPrice.push({ line: i, handle, title: title || '(variant)', sku, price });
  if (!sku.trim()) issues.emptySku.push({ line: i, handle });
  if (weight === '0' || weight === '' || parseFloat(weight) === 0) issues.badWeight.push({ line: i, handle, sku });
  
  // Track SKU duplicates
  if (sku.trim()) {
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }
  
  // Check Option1 value issues - "4 inch" for non-inch products
  if (option1Value.match(/^\d+\s*inch$/i) && title && !title.toLowerCase().includes('inch') && !title.includes('/')) {
    issues.option1Issues.push({ line: i, handle, title: title.substring(0, 40), option1Value });
  }
}

// Find duplicate SKUs
for (const [sku, count] of skuCounts) {
  if (count > 1) {
    issues.duplicateSku.set(sku, count);
  }
}

// Find handles with different titles (grouping issues)
let groupingIssues = [];
for (const [handle, data] of handleToProducts) {
  if (data.titles.size > 1) {
    groupingIssues.push({ handle, titles: [...data.titles] });
  }
}

console.log('\n' + '─'.repeat(70));
console.log('STATISTICS');
console.log('─'.repeat(70));
console.log(`Total products (rows with titles): ${totalProducts}`);
console.log(`Total variant rows (additional sizes): ${totalVariants}`);
console.log(`Total image-only rows (extra images): ${totalImageRows}`);
console.log(`Unique handles: ${handleToProducts.size}`);

console.log('\n' + '─'.repeat(70));
console.log('CRITICAL ISSUES (must fix)');
console.log('─'.repeat(70));
console.log(`❌ Empty Handle: ${issues.emptyHandle.length}`);
console.log(`❌ Empty SKU: ${issues.emptySku.length}`);
console.log(`❌ Zero/Empty Price: ${issues.zeroPrice.length}`);
console.log(`❌ Duplicate SKUs: ${issues.duplicateSku.size}`);
console.log(`❌ Titles starting with dot: ${issues.titleStartsWithDot.length}`);
console.log(`❌ Handle grouping conflicts: ${groupingIssues.length}`);

console.log('\n' + '─'.repeat(70));
console.log('WARNINGS (should fix)');
console.log('─'.repeat(70));
console.log(`⚠️  Empty Body (no description): ${issues.emptyBody.length}`);
console.log(`⚠️  Empty/Unknown Vendor: ${issues.emptyVendor.length + issues.badVendor.length}`);
console.log(`⚠️  Empty Type: ${issues.emptyType.length}`);
console.log(`⚠️  Missing Image: ${issues.missingImage.length}`);
console.log(`⚠️  Zero/Missing Weight: ${issues.badWeight.length}`);
console.log(`⚠️  Option1 Value issues: ${issues.option1Issues.length}`);

// Show samples
if (issues.titleStartsWithDot.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Titles starting with dot');
  console.log('─'.repeat(70));
  issues.titleStartsWithDot.slice(0, 10).forEach(x => console.log(`  Line ${x.line}: "${x.title}"`));
}

if (issues.option1Issues.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Option1 Value issues (e.g., "4 inch" for non-inch products)');
  console.log('─'.repeat(70));
  issues.option1Issues.slice(0, 10).forEach(x => console.log(`  Line ${x.line}: "${x.title}" has Option1="${x.option1Value}"`));
}

if (issues.duplicateSku.size > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Duplicate SKUs');
  console.log('─'.repeat(70));
  let count = 0;
  for (const [sku, n] of issues.duplicateSku) {
    if (count++ >= 10) break;
    console.log(`  SKU "${sku}" appears ${n} times`);
  }
}

if (groupingIssues.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Handle grouping conflicts (different titles for same handle)');
  console.log('─'.repeat(70));
  groupingIssues.slice(0, 5).forEach(x => {
    console.log(`  Handle: ${x.handle}`);
    x.titles.forEach(t => console.log(`    - "${t}"`));
  });
}

if (issues.zeroPrice.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Zero/Empty Price');
  console.log('─'.repeat(70));
  issues.zeroPrice.slice(0, 10).forEach(x => console.log(`  Line ${x.line}: ${x.handle} (SKU: ${x.sku}) price="${x.price}"`));
}

if (issues.badVendor.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE: Bad Vendor ("Unknown")');
  console.log('─'.repeat(70));
  issues.badVendor.slice(0, 10).forEach(x => console.log(`  "${x.title}" -> vendor="${x.vendor}"`));
}

console.log('\n' + '═'.repeat(70));
console.log('AUDIT COMPLETE');
console.log('═'.repeat(70));
