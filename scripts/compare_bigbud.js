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
        if (nextChar === '"') { currentField += '"'; i++; }
        else { inQuotes = false; }
      } else { currentField += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { currentField += char; }
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

// Get WooCommerce child names
const woo = fs.readFileSync('CSVs/Products-Export-2025-Oct-29-171532.csv', 'utf-8');
const wooRows = parseCSV(woo);
const wooH = wooRows[0];
const nameIdx = wooH.indexOf('Product Name');
const groupedIdx = wooH.indexOf('Grouped products');
const typeIdx = wooH.indexOf('Type');

const row = wooRows.find(r => r[nameIdx] === 'Big Bud Bloom Booster' && r[typeIdx] === 'grouped');
const children = row[groupedIdx].split('|~|');

console.log('WooCommerce children for Big Bud Bloom Booster:');
children.forEach(c => console.log('  "' + c + '"'));

// Get enriched CSV titles
const enriched = fs.readFileSync('outputs/shopify_final_fixed.csv', 'utf-8');
const enrichedRows = parseCSV(enriched);
const enrichedH = enrichedRows[0];
const titleIdx = enrichedH.indexOf('Title');

console.log('\nEnriched CSV titles containing "Big Bud Bloom Booster":');
for (let i = 1; i < enrichedRows.length; i++) {
  const title = enrichedRows[i][titleIdx] || '';
  if (title.includes('Big Bud Bloom Booster') && !title.includes('Liquid')) {
    console.log('  "' + title + '"');
  }
}

// Check for exact matches
console.log('\nChecking for exact matches (case-insensitive):');
const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');
const enrichedTitles = new Set();
for (let i = 1; i < enrichedRows.length; i++) {
  const title = enrichedRows[i][titleIdx] || '';
  enrichedTitles.add(normalize(title));
}

children.forEach(child => {
  const normChild = normalize(child);
  const found = enrichedTitles.has(normChild);
  console.log('  ' + (found ? '✓' : '✗') + ' "' + child + '"');
});
