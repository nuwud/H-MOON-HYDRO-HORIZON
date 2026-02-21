const fs = require('fs');

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record = {};
    headers.forEach((h, idx) => { record[h] = values[idx] || ''; });
    records.push(record);
  }
  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const data = fs.readFileSync('outputs/woocommerce_import_ready.csv', 'utf8');
const records = parseCSV(data);

// Find variables without attributes
const varsNoAttr = records.filter(r => r.Type === 'variable' && !r['Attribute 1 name']);
console.log('Variable products WITHOUT attributes (' + varsNoAttr.length + ' total):');
varsNoAttr.slice(0, 20).forEach(r => console.log('  ' + r.SKU + ' - ' + (r.Name || '').substring(0, 50)));

// Analyze what size values look like
const sizeValues = new Set();
records.forEach(r => {
  const val = r['Attribute 1 value(s)'];
  if (val) val.split('|').forEach(v => sizeValues.add(v.trim()));
});

console.log('\n\nAll unique Size/Attribute values (' + sizeValues.size + ' total):');
const sorted = [...sizeValues].sort();
console.log(sorted.join('\n'));

// Check for non-standard size formats
console.log('\n\n=== SIZE VALUE STANDARDIZATION ISSUES ===');
const sizePatterns = {
  volume: [],
  dimension: [],
  count: [],
  wattage: [],
  weight: [],
  other: []
};

sorted.forEach(v => {
  const lower = v.toLowerCase();
  if (/\d+\s*(oz|ml|l|liter|litre|qt|quart|gal|gallon)/.test(lower)) sizePatterns.volume.push(v);
  else if (/\d+\s*(in|inch|ft|feet|"|')/.test(lower)) sizePatterns.dimension.push(v);
  else if (/\d+\s*(pc|pk|pack|ct|count|set)/.test(lower)) sizePatterns.count.push(v);
  else if (/\d+\s*(w|watt)/.test(lower)) sizePatterns.wattage.push(v);
  else if (/\d+\s*(lb|lbs|kg|g|gram|pound)/.test(lower)) sizePatterns.weight.push(v);
  else sizePatterns.other.push(v);
});

Object.entries(sizePatterns).forEach(([type, values]) => {
  if (values.length > 0) {
    console.log('\n' + type.toUpperCase() + ' (' + values.length + '):');
    values.slice(0, 15).forEach(v => console.log('  ' + v));
  }
});
