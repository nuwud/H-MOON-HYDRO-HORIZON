/**
 * Find products missing required fields
 */

const fs = require('fs');

// Parse CSV properly
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  for (const line of lines) {
    const row = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (char === ',' && !inQuotes) { row.push(current.trim()); current = ''; }
      else { current += char; }
    }
    row.push(current.trim());
    rows.push(row);
  }
  return rows;
}

const csv = fs.readFileSync('./CSVs/products_export_ready.csv', 'utf-8');
const rows = parseCSV(csv);
const headers = rows[0];
const idx = {
  handle: headers.indexOf('Handle'),
  title: headers.indexOf('Title'),
  price: headers.indexOf('Variant Price'),
  status: headers.indexOf('Status'),
};

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🔍 FINDING PRODUCTS WITH MISSING REQUIRED FIELDS');
console.log('═══════════════════════════════════════════════════════════════════════\n');

const seen = new Set();
const missingTitle = [];
const missingPrice = [];

rows.slice(1).forEach(row => {
  const handle = row[idx.handle];
  if (!handle || seen.has(handle)) return;
  seen.add(handle);
  
  if (!row[idx.title]) { 
    missingTitle.push(handle);
  }
  if (!row[idx.price]) { 
    missingPrice.push(handle);
  }
});

console.log('📋 Products Missing Title (' + missingTitle.length + '):');
missingTitle.slice(0, 20).forEach(h => console.log('   -', h));
if (missingTitle.length > 20) console.log('   ... and', missingTitle.length - 20, 'more');

console.log('\n💰 Products Missing Price (' + missingPrice.length + '):');
missingPrice.slice(0, 20).forEach(h => console.log('   -', h));
if (missingPrice.length > 20) console.log('   ... and', missingPrice.length - 20, 'more');

console.log('\n═══════════════════════════════════════════════════════════════════════');
