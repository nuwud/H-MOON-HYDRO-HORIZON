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
const option1NameIdx = headers.indexOf('Option1 Name');
const option1ValueIdx = headers.indexOf('Option1 Value');

console.log('=== BIG BUD BLOOM BOOSTER STRUCTURE ===\n');

let inBigBud = false;
let variantCount = 0;
let mainHandle = '';

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const handle = row[handleIdx] || '';
  const title = row[titleIdx] || '';
  const option1Name = row[option1NameIdx] || '';
  const option1Value = row[option1ValueIdx] || '';

  // Check if this is a Big Bud product
  if (handle.includes('big-bud-bloom') || title.toLowerCase().includes('big bud bloom')) {
    if (!inBigBud) {
      // First row of product
      console.log(`ROW ${i + 1}: MAIN PRODUCT`);
      console.log(`  Handle: ${handle}`);
      console.log(`  Title: ${title}`);
      console.log(`  Option1 Name: ${option1Name}`);
      console.log(`  Option1 Value: ${option1Value}`);
      inBigBud = true;
      mainHandle = handle;
      variantCount = 1;
    }
  } else if (inBigBud && !handle && !title) {
    // Variant row (empty handle and title)
    variantCount++;
    console.log(`\nROW ${i + 1}: VARIANT ${variantCount}`);
    console.log(`  Handle: (inherited from "${mainHandle}")`);
    console.log(`  Title: (inherited)`);
    console.log(`  Option1 Name: ${option1Name}`);
    console.log(`  Option1 Value: ${option1Value}`);
  } else if (inBigBud && handle) {
    // New product started, end Big Bud section
    console.log(`\n--- Total variants: ${variantCount} ---\n`);
    inBigBud = false;
  }
}

if (inBigBud) {
  console.log(`\n--- Total variants: ${variantCount} ---`);
}
