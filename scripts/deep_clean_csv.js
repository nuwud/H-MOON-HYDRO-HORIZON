/**
 * Deep CSV Cleaner - Aggressively remove all malformed rows
 * A valid Shopify product handle must be lowercase with hyphens only
 */

const fs = require('fs');
const path = require('path');

const INPUT_CSV = './CSVs/products_export_cleaned.csv';
const OUTPUT_CSV = './CSVs/products_export_ready.csv';

// Valid handle pattern: lowercase letters, numbers, hyphens only
const VALID_HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(field);
        if (row.length > 1) rows.push(row);
        row = [];
        field = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        field += char;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function isValidProductRow(handle, title, price) {
  // Must have a handle
  if (!handle || handle.trim() === '') return false;
  
  const h = handle.trim();
  
  // Handle must match Shopify pattern (lowercase, hyphens, numbers)
  if (!VALID_HANDLE_PATTERN.test(h)) {
    return false;
  }
  
  // Handle shouldn't be too short (likely fragment)
  if (h.length < 3) return false;
  
  // Should have either a title or a price (variant rows might not have title)
  // But primary product rows should have both
  
  return true;
}

// Main
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧹 DEEP CSV CLEANER - Remove All Malformed Rows');
console.log('═══════════════════════════════════════════════════════════════════════\n');

const content = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(content);
const header = rows[0];
const data = rows.slice(1);

console.log('📊 Input rows:', data.length);

const handleIdx = 0;
const titleIdx = 1;
const priceIdx = header.indexOf('Variant Price');

const cleanedData = [];
const removedRows = [];

for (const row of data) {
  const handle = row[handleIdx]?.trim() || '';
  const title = row[titleIdx]?.trim() || '';
  const price = row[priceIdx]?.trim() || '';
  
  if (isValidProductRow(handle, title, price)) {
    cleanedData.push(row);
  } else {
    removedRows.push({ 
      handle: handle.substring(0, 50) || '(empty)', 
      title: title.substring(0, 30) || '(empty)',
      reason: !VALID_HANDLE_PATTERN.test(handle) ? 'invalid handle format' : 'other'
    });
  }
}

console.log('✅ Valid rows:', cleanedData.length);
console.log('❌ Removed rows:', removedRows.length);

if (removedRows.length > 0) {
  console.log('\n📋 Removed rows:');
  removedRows.forEach(r => {
    console.log(`   "${r.handle}" (${r.reason})`);
  });
}

// Write cleaned CSV
const output = [
  header.map(h => escapeCSV(h)).join(','),
  ...cleanedData.map(row => row.map(c => escapeCSV(c)).join(','))
].join('\n');

fs.writeFileSync(OUTPUT_CSV, output);

console.log('\n📁 Output:', OUTPUT_CSV);
console.log('═══════════════════════════════════════════════════════════════════════\n');

// Validate the output
const uniqueHandles = new Set(cleanedData.map(r => r[handleIdx]?.trim()).filter(Boolean));
console.log('📊 VALIDATION:');
console.log('   Unique products:', uniqueHandles.size);
console.log('   Total rows:', cleanedData.length);
