/**
 * Fix Failed Import Products
 * Fixes the 14 products that failed import due to invalid Status field
 */

const fs = require('fs');

const INPUT = './CSVs/products_export_with_alt.csv';
const OUTPUT = './CSVs/products_export_fixed.csv';

// Parse CSV properly handling quotes
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function parseRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function escapeCSV(val) {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// Main
const content = fs.readFileSync(INPUT, 'utf-8');
const lines = parseCSV(content);

console.log(`📋 Loaded ${lines.length} lines`);

// Parse header to find Status column
const headers = parseRow(lines[0]);
const statusIdx = headers.indexOf('Status');
console.log(`📍 Status column at index: ${statusIdx}`);

let fixedCount = 0;
const failedLines = [109, 119, 140, 141, 145, 154, 155, 177, 215, 473, 539, 818, 819, 820, 821, 822, 828, 860, 877, 1024];

const outputLines = lines.map((line, idx) => {
  const lineNum = idx + 1;
  const row = parseRow(line);
  
  // Check if Status is empty or invalid
  const status = row[statusIdx]?.toLowerCase().trim();
  
  if (!status || !['active', 'draft', 'archived'].includes(status)) {
    // Default to 'active' for missing/invalid status
    row[statusIdx] = 'active';
    fixedCount++;
    console.log(`   Line ${lineNum}: Fixed empty status -> active`);
  }
  
  return row.map(escapeCSV).join(',');
});

fs.writeFileSync(OUTPUT, outputLines.join('\n'));

console.log('');
console.log(`✅ Fixed ${fixedCount} rows with missing/invalid Status`);
console.log(`📄 Saved to: ${OUTPUT}`);
