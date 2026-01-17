/**
 * Create a test wave from FINAL_IMPORT.csv
 * Properly handles CSV quoting
 */

const fs = require('fs');
const path = require('path');
const { parse, stringify } = require('csv-parse/sync');

const ROOT = path.join(__dirname, '..');
const FINAL_CSV = path.join(ROOT, 'outputs', 'FINAL_IMPORT.csv');
const WAVE_CSV = path.join(ROOT, 'outputs', 'waves', 'wave_test.csv');

console.log('Creating test wave from FINAL_IMPORT.csv...');

// Read and parse
const content = fs.readFileSync(FINAL_CSV, 'utf8');
const rows = parse(content, { columns: true, skip_empty_lines: true });

console.log('Total rows:', rows.length);

// Find products to include in test
const testHandles = ['big-bud', 'floragro-1', 'backdraft-damper'];
const testRows = rows.filter(r => testHandles.includes(r.Handle));

console.log('Test rows selected:', testRows.length);

// Write test wave
const header = Object.keys(rows[0]);
const output = [header.join(',')];

testRows.forEach(row => {
  const values = header.map(col => {
    let val = row[col] || '';
    // Quote if contains comma, newline, or quote
    if (val.includes(',') || val.includes('\n') || val.includes('"')) {
      val = '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  });
  output.push(values.join(','));
});

fs.mkdirSync(path.join(ROOT, 'outputs', 'waves'), { recursive: true });
fs.writeFileSync(WAVE_CSV, output.join('\n'));

console.log('✅ Saved to:', WAVE_CSV);
console.log('Rows:', output.length - 1);
