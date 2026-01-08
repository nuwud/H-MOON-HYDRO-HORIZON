#!/usr/bin/env node
const fs = require('fs');

const content = fs.readFileSync('outputs/shopify_properly_grouped.csv', 'utf-8');

// Shopify-style CSV parsing with quote handling
const lines = content.split(/\r?\n/);
let row = [];
let rows = [];
let field = '';
let inQuotes = false;

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx];
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    
    if (inQuotes) {
      if (char === '"' && next === '"') {
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
      } else {
        field += char;
      }
    }
  }
  
  // End of line
  if (inQuotes) {
    // Quoted field continues on next line
    field += '\n';
  } else {
    // End of row
    row.push(field);
    if (row.length > 1) rows.push(row);
    row = [];
    field = '';
  }
}

if (row.length > 0) {
  row.push(field);
  rows.push(row);
}

const headers = rows[0];
const hIdx = headers.indexOf('Handle');
const tIdx = headers.indexOf('Title');
const o1vIdx = headers.indexOf('Option1 Value');

console.log('=== CSV VALIDATION ===\n');
console.log(`Total rows: ${rows.length}`);
console.log(`Header columns: ${headers.length}\n`);

let products = 0;
let variants = 0;
let multiVariantProducts = 0;
let currentProductVariants = 0;

for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][hIdx] || '';
  
  if (handle) {
    // New product
    if (currentProductVariants > 1) {
      multiVariantProducts++;
    }
    products++;
    currentProductVariants = 1;
    
    // Check for Big Bud
    if (handle === 'big-bud-bloom-booster') {
      console.log(`FOUND BIG BUD at row ${i + 1}:`);
      console.log(`  Handle: ${handle}`);
      console.log(`  Title: ${rows[i][tIdx]}`);
      console.log(`  Option1 Value: ${rows[i][o1vIdx]}`);
      console.log(`  Variants:`);
      
      // Count following variants
      let j = i + 1;
      while (j < rows.length && !rows[j][hIdx]) {
        console.log(`    - ${rows[j][o1vIdx]}`);
        j++;
        currentProductVariants++;
      }
      console.log(`  Total: ${currentProductVariants} variants\n`);
    }
  } else {
    // Variant row
    variants++;
    currentProductVariants++;
  }
}

if (currentProductVariants > 1) {
  multiVariantProducts++;
}

console.log('=== SUMMARY ===');
console.log(`Total products: ${products}`);
console.log(`Multi-variant products: ${multiVariantProducts}`);
console.log(`Variant rows: ${variants}`);
console.log(`Total rows (products + variants): ${products + variants}`);
