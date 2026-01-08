/**
 * Quick audit of price columns in the CSV
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../outputs/shopify_complete_import.csv');
const content = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

// Simple split for unquoted header
const header = lines[0].split(',');
console.log('Header columns:', header.length);

// Create header map
const headerMap = {};
header.forEach((h, i) => { headerMap[h.trim()] = i; });
console.log('Variant Price index:', headerMap['Variant Price']);
console.log('Variant Fulfillment Service index:', headerMap['Variant Fulfillment Service']);

// Parse CSV lines properly
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Count stats
let emptyPrice = 0;
let zeroPrice = 0;
let validPrice = 0;
const emptyPriceExamples = [];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const priceRaw = row[headerMap['Variant Price']] || '';
  const price = priceRaw.trim();
  const handle = row[headerMap['Handle']] || '';
  const title = row[headerMap['Title']] || '';
  
  if (!price || price === '') {
    emptyPrice++;
    if (emptyPriceExamples.length < 10) {
      emptyPriceExamples.push({ line: i+1, handle, title: title.substring(0, 40), priceRaw });
    }
  } else if (price === '0' || price === '0.00') {
    zeroPrice++;
  } else {
    validPrice++;
  }
}

console.log('\nPrice summary:');
console.log('  Valid prices:', validPrice);
console.log('  Empty prices:', emptyPrice);
console.log('  Zero prices:', zeroPrice);

console.log('\nEmpty price examples:');
emptyPriceExamples.forEach(e => {
  console.log(`  Line ${e.line}: ${e.handle} (${e.title || 'variant'}) - priceRaw="${e.priceRaw}"`);
});
