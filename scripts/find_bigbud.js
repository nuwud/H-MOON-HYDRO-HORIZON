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
const option1ValueIdx = headers.indexOf('Option1 Value');

console.log('=== SEARCHING FOR BIG BUD BLOOM BOOSTER ===\n');

// Find by handle
for (let i = 1; i < rows.length; i++) {
  const handle = rows[i][handleIdx] || '';
  if (handle === 'big-bud-bloom-booster') {
    console.log(`FOUND at row ${i + 1}:`);
    console.log(`  Handle: ${handle}`);
    console.log(`  Title: ${rows[i][titleIdx]}`);
    console.log(`  Option1 Value: ${rows[i][option1ValueIdx]}\n`);
    
    // Check next rows for variants
    let j = i + 1;
    let variantNum = 2;
    while (j < rows.length && !rows[j][handleIdx]) {
      console.log(`VARIANT ${variantNum} at row ${j + 1}:`);
      console.log(`  Handle: (inherited)`);
      console.log(`  Title: (inherited)`);
      console.log(`  Option1 Value: ${rows[j][option1ValueIdx]}\n`);
      j++;
      variantNum++;
    }
    
    console.log(`Total variants: ${variantNum - 1}`);
    break;
  }
}
