/**
 * Find WooCommerce products missing from import
 */
const fs = require('fs');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

const content = fs.readFileSync('CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv', 'utf-8');
const lines = content.split('\n').filter(l => l.trim());
const headers = parseCSVLine(lines[0]);
const skuIdx = headers.indexOf('Sku');
const nameIdx = headers.indexOf('Product Name');
const typeIdx = headers.indexOf('Type');

const importContent = fs.readFileSync('outputs/woocommerce_import_ready.csv', 'utf-8');
const importLines = importContent.split('\n').filter(l => l.trim());
const importHeaders = parseCSVLine(importLines[0]);
const importSkuIdx = importHeaders.indexOf('SKU');
const importSKUs = new Set();
for (let i = 1; i < importLines.length; i++) {
  const v = parseCSVLine(importLines[i]);
  if (v[importSkuIdx]) importSKUs.add(v[importSkuIdx].toLowerCase());
}

console.log('Products in WooCommerce NOT in import data:');
console.log('============================================');
const missing = [];
for (let i = 1; i < lines.length; i++) {
  const v = parseCSVLine(lines[i]);
  const sku = (v[skuIdx] || '').toLowerCase();
  const type = v[typeIdx] || '';
  const name = v[nameIdx] || 'Unknown';
  if (sku && !importSKUs.has(sku) && (type === 'simple' || type === 'grouped' || type === 'variable')) {
    missing.push({ sku, name, type });
  }
}

missing.slice(0, 30).forEach(p => console.log(`${p.sku}: ${p.name.substring(0, 50)} (${p.type})`));
console.log('...');
console.log(`Total valid products not in import: ${missing.length}`);

// Write full list to file
fs.writeFileSync('outputs/woo_products_not_in_import.csv', 
  'SKU,Name,Type\n' + missing.map(p => `"${p.sku}","${p.name}","${p.type}"`).join('\n')
);
console.log('\nFull list saved to: outputs/woo_products_not_in_import.csv');
