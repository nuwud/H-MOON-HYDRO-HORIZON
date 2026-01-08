const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const CURRENT_CSV = path.join(BASE, 'outputs/shopify_final_fixed.csv');

// CSV parser
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

// Get base name by removing size/variant info
function getBaseName(title) {
  return title
    // Remove content in parentheses
    .replace(/\s*\([^)]*\)\s*/g, '')
    // Remove size patterns not in parentheses
    .replace(/\s+[\d.]+\s*(qt|quart|gal|gallon|lb|lbs|pound|oz|ounce|ml|l|liter|g|gram|kg|inch|ft|foot|pack|bag)\b/gi, '')
    // Remove trailing numbers and units
    .replace(/[\s-]+[\d.]+\s*(qt|gal|lb|oz|ml|l|g|kg|inch|ft|pack|bag)?$/i, '')
    .trim();
}

const content = fs.readFileSync(CURRENT_CSV, 'utf-8');
const rows = parseCSV(content);
const headers = rows[0];
const idx = {};
headers.forEach((h, i) => idx[h] = i);

console.log('=== BIG BUD PRODUCTS ===\n');

for (let i = 1; i < rows.length; i++) {
  const title = rows[i][idx['Title']] || '';
  if (title.toLowerCase().includes('big bud bloom')) {
    const baseName = getBaseName(title);
    console.log(`Row ${i + 1}:`);
    console.log(`  Original: "${title}"`);
    console.log(`  Base name: "${baseName}"`);
    console.log();
  }
}
