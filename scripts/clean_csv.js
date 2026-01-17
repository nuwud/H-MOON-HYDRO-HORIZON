/**
 * Clean CSV - Remove corrupted rows and fix issues
 * Removes products that are actually description fragments
 */

const fs = require('fs');
const path = require('path');

// Support command line args for input/output
const args = process.argv.slice(2);
const INPUT_CSV = args[0] || path.join(__dirname, '../CSVs/products_export_final.csv');
const OUTPUT_CSV = args[1] || path.join(__dirname, '../CSVs/products_export_cleaned.csv');

// Patterns that indicate corrupted/invalid product rows
const CORRUPTION_PATTERNS = [
  /^<strong>/i,
  /^The\s+(Dutch|fixture|result|structure|Skunk|leaves|buds|effect|plant|most)/i,
  /^(During|Protection|How|Contrary|Get|This clip|SiLICIUM mono)/i,
  /^(It is a medium|ARE SOLD|Foliar feeding)/i,
  /tax-\d+-inventory/i,
  /^There are specific photoreceptors/i,
];

// Handles known to be corrupted (from audit)
const CORRUPTED_HANDLES = new Set([
  'SiLICIUM mono-silicic acid also ensures that the plant stomata diameter is decreased',
  '<strong>"Closed loop"</strong> systems also evaporate ethanol at open atmosphere temperatures of around 173°F',
  'The Dutch Lighting Diode-Series DC is a high-power LED fixture for indoor hortic',
  'The fixture is fully compatible with all other products in our portfolio. This f',
  'There are specific photoreceptors for UV-B and UV-A that plants use to sense and',
  'Get unprecedented customization capabilities for airflow control using this grow',
  'This clip fan features a robust EC motor specially redesigned in size and constr',
  'Foliar feeding provides nutrients to plants through its leaves and stems',
  'ARE SOLD STRICTLY FOR SOUVENIRS',
  'During 12/12 flower cycles',
  'Protection against diseases',
  'The result is an outstandingly performing autoflowering',
  'The structure of the Skunk Autoflowering is branchy',
  'It is a medium-tall autoflowering',
  'The Skunk Autoflowering stretches fast during the first two weeks of growth',
  'The leaves are dark green',
  'The Skunk Autoflowering is ready in 9 weeks total crop time',
  'The Skunk Autoflowering can take high EC levels',
  'The plant is very robust',
  'The buds are slow to form during the first weeks of flowering',
  'The effect is fast hitting',
  'How ethanol is boiled',
  'The most advanced systems are <strong>"Vacuum Assisted Closed Systems',
  'Contrary to many people\'s first impression',
]);

function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(field);
        if (row.length > 1) rows.push(row);
        row = [];
        field = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        field += char;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function isCorrupted(handle, title) {
  if (!handle || !title) return false;
  
  // Check against known corrupted handles
  if (CORRUPTED_HANDLES.has(handle)) return true;
  
  // Check against patterns (only on handle, not title)
  for (const pattern of CORRUPTION_PATTERNS) {
    if (pattern.test(handle)) return true;
  }
  
  // Handle contains HTML
  if (handle.includes('<') || handle.includes('>')) return true;
  
  // Handle is way too long (likely description fragment) - but allow valid product handles
  // Valid handles use hyphens, so check if it looks like a handle vs description
  if (handle.length > 100 && !handle.match(/^[a-z0-9-]+$/)) return true;
  
  // Handle starts with a sentence fragment (but allow it if it has hyphens like a handle)
  if (/^(The|This|It|Are|During|How|Get|There|Protection|Contrary)\s/i.test(handle) && !handle.includes('-')) return true;
  
  return false;
}

// Main
console.log('🧹 Cleaning CSV - Removing corrupted rows\n');

const content = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(content);
const header = rows[0];
const data = rows.slice(1);

console.log(`📊 Input: ${data.length} rows`);

let removed = 0;
let fixed = 0;
const cleanedData = [];
const removedRows = [];

for (const row of data) {
  const handle = row[0]?.trim() || '';
  const title = row[1]?.trim() || '';
  
  if (isCorrupted(handle, title)) {
    removed++;
    removedRows.push({ handle: handle.substring(0, 60), title: title.substring(0, 40) });
    continue;
  }
  
  // Fix common issues
  // 1. Fix vendor if it's a description fragment
  if (row[3] && row[3].length > 50) {
    row[3] = 'H Moon Hydro';
    fixed++;
  }
  
  cleanedData.push(row);
}

// Write cleaned CSV
const output = [
  header.map(h => escapeCSV(h)).join(','),
  ...cleanedData.map(row => row.map(c => escapeCSV(c)).join(','))
].join('\n');

fs.writeFileSync(OUTPUT_CSV, output);

console.log(`\n✅ Cleaned CSV saved: ${OUTPUT_CSV}`);
console.log(`   Rows removed: ${removed}`);
console.log(`   Rows fixed: ${fixed}`);
console.log(`   Final row count: ${cleanedData.length}`);

console.log('\n❌ Removed rows:');
removedRows.forEach(r => {
  console.log(`   ${r.handle.padEnd(50)} | ${r.title}`);
});

// Save removal log
fs.writeFileSync(
  path.join(__dirname, '../outputs/audit/removed_rows.json'),
  JSON.stringify(removedRows, null, 2)
);
