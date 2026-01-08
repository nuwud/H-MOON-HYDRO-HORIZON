const fs = require('fs');

function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

const csvContent = fs.readFileSync('outputs/shopify_properly_grouped.csv', 'utf-8');
const rows = parseCSV(csvContent);
const headers = rows[0];

const handleIdx = headers.indexOf('Handle');
const titleIdx = headers.indexOf('Title');

console.log('=== FIRST 20 PRODUCTS ===\n');

for (let i = 1; i <= 20 && i < rows.length; i++) {
  const row = rows[i];
  const handle = (row[handleIdx] || '').substring(0, 50);
  const title = (row[titleIdx] || '').substring(0, 50);
  
  console.log(`${i}. Handle: ${handle || '[EMPTY]'}`);
  console.log(`   Title: ${title || '[EMPTY]'}\n`);
}

// Count products with handles
let productsWithHandles = 0;
let variantRows = 0;

for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][handleIdx] || '';
  if (handle) {
    productsWithHandles++;
  } else {
    variantRows++;
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Total rows: ${rows.length - 1}`);
console.log(`Products (with handle): ${productsWithHandles}`);
console.log(`Variant rows (no handle): ${variantRows}`);
