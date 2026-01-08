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

const c = fs.readFileSync('./outputs/shopify_final_fixed.csv', 'utf-8');
const rows = parseCSV(c);
const h = rows[0];

const handleIdx = h.indexOf('Handle');
const titleIdx = h.indexOf('Title');
const opt1Idx = h.indexOf('Option1 Name');
const opt1ValIdx = h.indexOf('Option1 Value');

// Find Big Bud examples
console.log('=== BIG BUD BLOOM BOOSTER EXAMPLES ===\n');
let bigBudCount = 0;
for (let i = 1; i < rows.length; i++) {
  const title = rows[i][titleIdx] || '';
  if (title.toLowerCase().includes('big bud bloom') && bigBudCount < 10) {
    console.log('Handle:', rows[i][handleIdx]);
    console.log('Title:', title);
    console.log('Option1 Name:', rows[i][opt1Idx]);
    console.log('Option1 Value:', rows[i][opt1ValIdx]);
    console.log('---');
    bigBudCount++;
  }
}

// Count handles
const handleCounts = {};
for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][handleIdx];
  if (handle) handleCounts[handle] = (handleCounts[handle] || 0) + 1;
}

const multiVariant = Object.entries(handleCounts).filter(([h, count]) => count > 1);
console.log('\n=== VARIANT ANALYSIS ===');
console.log('Total unique handles:', Object.keys(handleCounts).length);
console.log('Products with multiple variants:', multiVariant.length);
console.log('Single-variant products:', Object.keys(handleCounts).length - multiVariant.length);

if (multiVariant.length > 0) {
  console.log('\nTop 10 multi-variant products:');
  multiVariant.sort((a,b) => b[1] - a[1]).slice(0, 10).forEach(([handle, count]) => {
    console.log('  ' + count + ' variants: ' + handle);
  });
} else {
  console.log('\n⚠️  NO MULTI-VARIANT PRODUCTS FOUND!');
  console.log('Every product has a unique handle - they will import as separate products.');
}
