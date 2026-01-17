/**
 * Generate SEO-friendly alt text for all product images
 * Adds alt text to Image Alt Text column in the final CSV
 */

const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(__dirname, '../CSVs/products_export_final_ready.csv');
const OUTPUT_CSV = path.join(__dirname, '../CSVs/products_export_with_alt.csv');

// Proper CSV parser
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
    if (row.length > 1) rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Generate alt text from product data
function generateAltText(title, vendor, option1Value) {
  let alt = '';
  
  // Start with vendor/brand if available
  if (vendor && vendor.length > 1 && vendor !== 'H Moon Hydro' && vendor !== 'UNO') {
    alt = vendor + ' ';
  }
  
  // Clean HTML tags from title
  let cleanTitle = title
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/\s*-\s*\d+\s*(gal|gallon|qt|quart|oz|lb|lbs|kg|gm|gram|ml|liter|l|pack)s?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  alt += cleanTitle;
  
  // Add variant option if exists and is meaningful
  if (option1Value && option1Value.length > 0 && option1Value !== 'Default Title') {
    alt += ' - ' + option1Value;
  }
  
  // Add store name for branding
  alt += ' | H-Moon Hydro';
  
  // Truncate to 125 chars max
  if (alt.length > 125) {
    alt = alt.substring(0, 122) + '...';
  }
  
  return alt;
}

// Main
console.log('Generating SEO Alt Text for Product Images\n');

const content = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(content);
const header = rows[0];
const data = rows.slice(1);

// Find column indices
const COL = {};
header.forEach((h, i) => {
  const name = h.trim().toLowerCase().replace(/\s+/g, '_');
  COL[name] = i;
});

const handleCol = COL['handle'];
const titleCol = COL['title'];
const vendorCol = COL['vendor'];
const option1Col = COL['option1_value'];
const imgCol = COL['image_src'];
const altCol = COL['image_alt_text'];

console.log('Columns: Title=' + titleCol + ', Vendor=' + vendorCol + ', Image=' + imgCol + ', Alt=' + altCol);

let altAdded = 0;
let skipped = 0;

for (const row of data) {
  const title = row[titleCol] ? row[titleCol].trim() : '';
  const vendor = row[vendorCol] ? row[vendorCol].trim() : '';
  const option1 = row[option1Col] ? row[option1Col].trim() : '';
  const imgSrc = row[imgCol] || '';
  const currentAlt = row[altCol] || '';
  
  // Only add alt text if image exists and alt is missing
  if (imgSrc.length > 10 && currentAlt.length < 5 && title) {
    row[altCol] = generateAltText(title, vendor, option1);
    altAdded++;
  } else if (currentAlt.length >= 5) {
    skipped++;
  }
}

// Write output
const output = [
  header.map(h => escapeCSV(h)).join(','),
  ...data.map(row => row.map(c => escapeCSV(c)).join(','))
].join('\n');

fs.writeFileSync(OUTPUT_CSV, output);

console.log('\nComplete!');
console.log('Output: ' + OUTPUT_CSV);
console.log('\nResults:');
console.log('   Alt text added: ' + altAdded);
console.log('   Already had alt: ' + skipped);

// Show some examples
console.log('\nSample alt text generated:');
let shown = 0;
for (const row of data) {
  const alt = row[altCol] || '';
  if (alt.length > 10 && shown < 5) {
    console.log('   "' + alt + '"');
    shown++;
  }
}
