const fs = require('fs');

// Proper CSV parser
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

const c = fs.readFileSync('./outputs/shopify_final_fixed.csv', 'utf-8');
const rows = parseCSV(c);
const header = rows[0];
const imgIdx = header.indexOf('Image Src');

console.log('Image Src column index:', imgIdx);
console.log('Total CSV rows:', rows.length);

let cdnCorrect = 0;
let other = [];
let empty = 0;

for (let i = 1; i < rows.length; i++) {
  const url = rows[i][imgIdx] || '';
  if (!url) { empty++; continue; }
  
  if (url.includes('cdn.shopify.com/s/files/1/0672/5730/3114')) {
    cdnCorrect++;
  } else {
    other.push(url);
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('   FINAL VALIDATION - shopify_final_fixed.csv');
console.log('═══════════════════════════════════════════════════════');
console.log('   Total data rows:', rows.length - 1);
console.log('   Correct Shopify CDN:', cdnCorrect);
console.log('   Empty image URLs:', empty);
console.log('   Other URLs:', other.length);

if (other.length > 0) {
  console.log('\n   Non-CDN URLs found:');
  const unique = [...new Set(other)];
  unique.slice(0, 15).forEach(u => console.log('     ' + u.substring(0, 70)));
  if (unique.length > 15) console.log('     ... and', unique.length - 15, 'more');
}

const total = cdnCorrect + other.length + empty;
const pct = ((cdnCorrect / (cdnCorrect + other.length)) * 100).toFixed(1);
console.log('\n   CDN Coverage (of rows with images):', pct + '%');
console.log('═══════════════════════════════════════════════════════');
