const fs = require('fs');

// Proper CSV parser that handles quoted fields with embedded newlines
function parseCsvContent(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      if (char === '\r') i++;
    } else if (char === '\r' && !inQuotes) {
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

const content = fs.readFileSync('./outputs/unified_import.csv', 'utf-8');
const rows = parseCsvContent(content);
const headers = rows[0];

console.log('Total rows:', rows.length - 1);
console.log('Headers:', headers.length, 'columns');
console.log('');

// Find SKU column
const skuIdx = headers.findIndex(h => h === 'Variant SKU');
const handleIdx = headers.findIndex(h => h === 'Handle');
console.log('SKU column index:', skuIdx);
console.log('Handle column index:', handleIdx);
console.log('');

// Check for duplicate SKUs
const skuMap = new Map();
const badRows = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (row.length !== headers.length) {
    badRows.push({ row: i+1, expected: headers.length, got: row.length, handle: row[handleIdx] });
    continue;
  }
  
  const sku = row[skuIdx];
  const handle = row[handleIdx];
  
  if (sku && sku.trim()) {
    if (!skuMap.has(sku)) skuMap.set(sku, []);
    skuMap.get(sku).push({ row: i+1, handle });
  }
}

// Report bad rows (column count mismatch)
console.log('=== ROWS WITH WRONG COLUMN COUNT ===');
console.log('Bad rows:', badRows.length);
badRows.slice(0, 5).forEach(r => console.log(`  Row ${r.row}: expected ${r.expected} cols, got ${r.got} - handle: ${r.handle}`));
console.log('');

// Report duplicate SKUs
const duplicates = [];
for (const [sku, locs] of skuMap.entries()) {
  if (locs.length > 1) {
    duplicates.push({ sku, count: locs.length, handles: [...new Set(locs.map(l => l.handle))] });
  }
}

console.log('=== DUPLICATE SKUs ===');
console.log('Total duplicate SKUs:', duplicates.length);
duplicates.forEach(d => {
  console.log(`  SKU "${d.sku}" appears ${d.count} times in handles: ${d.handles.slice(0,3).join(', ')}${d.handles.length > 3 ? '...' : ''}`);
});
console.log('');

// Summary stats
const uniqueSKUs = skuMap.size;
const withSKU = Array.from(skuMap.values()).flat().length;
console.log('=== SUMMARY ===');
console.log('Rows with valid column count:', rows.length - 1 - badRows.length);
console.log('Rows with SKU:', withSKU);
console.log('Unique SKUs:', uniqueSKUs);
console.log('Duplicate SKUs:', duplicates.length);

// Sample some rows
console.log('');
console.log('=== SAMPLE ROWS ===');
for (const rowIdx of [1, 50, 100, 500, 1000]) {
  if (rowIdx >= rows.length) continue;
  const row = rows[rowIdx];
  console.log(`Row ${rowIdx+1}:`);
  console.log(`  Handle: ${row[handleIdx]}`);
  console.log(`  Title: ${(row[1] || '').substring(0, 40)}...`);
  console.log(`  SKU: ${row[skuIdx]}`);
  console.log(`  Price: ${row[20]}`);
  console.log(`  Status: ${row[32]}`);
  console.log('');
}
