/**
 * MASTER CSV CLEANER AND FINALIZER
 * 
 * Takes MASTER_IMPORT.csv and:
 * 1. Removes invalid variant rows (empty options, no SKU)
 * 2. Adds images from local WooCommerce files where missing
 * 3. Validates all required fields
 * 4. Outputs clean FINAL_IMPORT.csv ready for Shopify
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MASTER_CSV = path.join(ROOT, 'outputs', 'MASTER_IMPORT.csv');
const IMAGE_MAP = path.join(ROOT, 'outputs', 'extended_image_mapping.json');
const OUTPUT_CSV = path.join(ROOT, 'outputs', 'FINAL_IMPORT.csv');

console.log('=== MASTER CSV CLEANER ===\n');

// Load image mapping
const imageMapping = JSON.parse(fs.readFileSync(IMAGE_MAP, 'utf8')).mappings;
console.log('Loaded image mappings:', Object.keys(imageMapping).length);

// Parse CSV properly (handles quoted fields with commas)
function parseCSVLine(line) {
  const result = [];
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Convert row back to CSV
function toCSVLine(fields) {
  return fields.map(f => {
    if (f === null || f === undefined) f = '';
    f = String(f);
    if (f.includes(',') || f.includes('"') || f.includes('\n')) {
      return '"' + f.replace(/"/g, '""') + '"';
    }
    return f;
  }).join(',');
}

// Read MASTER_IMPORT
const content = fs.readFileSync(MASTER_CSV, 'utf8');
const lines = content.split('\n');
const header = parseCSVLine(lines[0]);

// Column indices
const cols = {
  handle: header.indexOf('Handle'),
  title: header.indexOf('Title'),
  body: header.indexOf('Body (HTML)'),
  vendor: header.indexOf('Vendor'),
  type: header.indexOf('Type'),
  tags: header.indexOf('Tags'),
  published: header.indexOf('Published'),
  opt1Name: header.indexOf('Option1 Name'),
  opt1Val: header.indexOf('Option1 Value'),
  sku: header.indexOf('Variant SKU'),
  price: header.indexOf('Variant Price'),
  imgSrc: header.indexOf('Image Src'),
  imgPos: header.indexOf('Image Position'),
  imgAlt: header.indexOf('Image Alt Text'),
  status: header.indexOf('Status')
};

console.log('Header columns:', header.length);
console.log('Processing', lines.length - 1, 'rows...\n');

// Process rows
const cleanRows = [header]; // Start with header
const issues = [];
let removed = 0;
let imagesAdded = 0;
let rowNum = 1;

// Track products for image insertion
const productImages = {}; // handle -> has image?

lines.slice(1).forEach(line => {
  rowNum++;
  if (!line.trim()) return;
  
  const row = parseCSVLine(line);
  const handle = row[cols.handle] || '';
  const title = row[cols.title] || '';
  const opt1Name = row[cols.opt1Name] || '';
  const opt1Val = row[cols.opt1Val] || '';
  const sku = row[cols.sku] || '';
  const price = row[cols.price] || '';
  const imgSrc = row[cols.imgSrc] || '';
  
  // VALIDATION RULES
  
  // Rule 1: Variant rows (no title) must have valid option value
  if (!title && opt1Name && (!opt1Val || opt1Val === ':' || opt1Val.trim() === '')) {
    issues.push({ rowNum, handle, issue: 'Empty option value', sku });
    removed++;
    return; // Skip this row
  }
  
  // Rule 2: Variant rows should have SKU (warn but don't remove)
  if (!title && opt1Name && (!sku || sku === 'N/A')) {
    // Generate placeholder SKU based on handle
    const newSku = `HMH-GEN-${handle.substring(0, 10).toUpperCase()}`;
    row[cols.sku] = newSku;
    issues.push({ rowNum, handle, issue: 'Missing SKU - generated placeholder', newSku });
  }
  
  // Rule 3: Image-only rows (no title, no option) are okay - keep them
  if (!title && !opt1Name && imgSrc) {
    // This is an additional image row - keep it
    cleanRows.push(row);
    return;
  }
  
  // Rule 4: Add image from WooCommerce if missing
  if (title && !imgSrc && !productImages[handle]) {
    // This is a parent product row without image
    const mapping = imageMapping[handle];
    if (mapping && mapping.localPath) {
      // Convert local path to full URL that Shopify can download
      // For now, use WooCommerce URL (still accessible) or local reference
      const wooUrl = mapping.wooUrl || '';
      if (wooUrl.startsWith('http')) {
        row[cols.imgSrc] = wooUrl;
        row[cols.imgPos] = '1';
        row[cols.imgAlt] = title;
        imagesAdded++;
        productImages[handle] = true;
      }
    }
  }
  
  // Track that this product has been processed
  if (title) {
    productImages[handle] = productImages[handle] || (imgSrc ? true : false);
  }
  
  // Keep this row
  cleanRows.push(row);
});

console.log('=== RESULTS ===');
console.log('Original rows:', lines.length - 1);
console.log('Clean rows:', cleanRows.length - 1);
console.log('Removed rows:', removed);
console.log('Images added:', imagesAdded);

// Write output CSV
const outputContent = cleanRows.map(row => toCSVLine(row)).join('\n');
fs.writeFileSync(OUTPUT_CSV, outputContent);
console.log('\n✅ Saved to:', OUTPUT_CSV);

// Write issues report
const issuesPath = path.join(ROOT, 'outputs', 'cleaning_issues.json');
fs.writeFileSync(issuesPath, JSON.stringify({
  summary: {
    originalRows: lines.length - 1,
    cleanRows: cleanRows.length - 1,
    removedRows: removed,
    imagesAdded: imagesAdded
  },
  issues: issues
}, null, 2));
console.log('Issues report:', issuesPath);

// Final stats
console.log('\n=== FINAL CSV STATS ===');
let uniqueHandles = new Set();
let parentCount = 0;
let variantCount = 0;
let imageRowCount = 0;

cleanRows.slice(1).forEach(row => {
  const handle = row[cols.handle];
  const title = row[cols.title];
  const opt1Name = row[cols.opt1Name];
  
  uniqueHandles.add(handle);
  
  if (title) parentCount++;
  else if (opt1Name) variantCount++;
  else imageRowCount++;
});

console.log('Unique products:', uniqueHandles.size);
console.log('Parent rows:', parentCount);
console.log('Variant rows:', variantCount);
console.log('Image-only rows:', imageRowCount);
