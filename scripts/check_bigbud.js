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

const c = fs.readFileSync('outputs/shopify_properly_grouped.csv', 'utf-8');
const rows = parseCSV(c);
const h = rows[0];
const handleIdx = h.indexOf('Handle');
const titleIdx = h.indexOf('Title');
const opt1NameIdx = h.indexOf('Option1 Name');
const opt1ValIdx = h.indexOf('Option1 Value');

console.log('\n=== BIG BUD BLOOM BOOSTER VARIANTS ===\n');
let count = 0;
for (let i = 1; i < rows.length && count < 15; i++) {
  const title = rows[i][titleIdx] || '';
  const handle = rows[i][handleIdx] || '';
  if ((title.toLowerCase().includes('big bud bloom') || handle.includes('big-bud-bloom')) && !handle.includes('liquid')) {
    console.log('Row', i + ':');
    console.log('  Handle:', handle || '(empty - inherits from above)');
    console.log('  Title:', title.substring(0, 70) || '(empty - inherits from above)');
    console.log('  Option1 Name:', rows[i][opt1NameIdx]);
    console.log('  Option1 Value:', rows[i][opt1ValIdx]);
    console.log('---');
    count++;
  }
}
