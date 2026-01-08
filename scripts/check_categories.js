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
const catIdx = h.indexOf('Product Category');
const typeIdx = h.indexOf('Type');

console.log('Product Category column index:', catIdx);
console.log('Type column index:', typeIdx);

// Count category values
const categories = {};
const types = {};
let emptyCat = 0;
let emptyType = 0;
const handles = new Set();

for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][0];
  if (handles.has(handle)) continue;
  handles.add(handle);
  
  const cat = rows[i][catIdx] || '';
  const type = rows[i][typeIdx] || '';
  
  if (!cat || cat.trim() === '') {
    emptyCat++;
  } else {
    categories[cat] = (categories[cat] || 0) + 1;
  }
  
  if (!type || type.trim() === '') {
    emptyType++;
  } else {
    types[type] = (types[type] || 0) + 1;
  }
}

console.log('\nUnique products:', handles.size);
console.log('\n=== PRODUCT CATEGORY ===');
console.log('Empty:', emptyCat);
console.log('Filled:', handles.size - emptyCat);
console.log('\nTop categories:');
Object.entries(categories).sort((a,b) => b[1] - a[1]).slice(0, 15).forEach(([cat, count]) => {
  console.log('  ' + count + 'x: ' + cat.substring(0, 70));
});

console.log('\n=== TYPE ===');
console.log('Empty:', emptyType);
console.log('Filled:', handles.size - emptyType);
console.log('\nTop types:');
Object.entries(types).sort((a,b) => b[1] - a[1]).slice(0, 15).forEach(([type, count]) => {
  console.log('  ' + count + 'x: ' + type);
});
