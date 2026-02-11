/**
 * Convert enriched Shopify CSV to WooCommerce format
 * Final step: Creates woocommerce_final_import.csv
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(cell); cell = ''; }
    else cell += c;
  }
  result.push(cell);
  return result;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// WooCommerce CSV columns
const WOO_HEADER = [
  'ID',                    // Leave blank for new
  'Type',                  // simple, variable, variation
  'SKU',
  'Name',
  'Published',             // 1
  'Is featured?',          // 0
  'Visibility in catalog', // visible
  'Short description',
  'Description',
  'Date sale price starts',
  'Date sale price ends',
  'Tax status',            // taxable
  'Tax class',
  'In stock?',             // 1
  'Stock',
  'Low stock amount',
  'Backorders allowed?',   // 0
  'Sold individually?',    // 0
  'Weight (lbs)',          // Converted from grams
  'Length (in)',
  'Width (in)',
  'Height (in)',
  'Allow customer reviews?', // 1
  'Purchase note',
  'Sale price',
  'Regular price',
  'Categories',
  'Tags',
  'Shipping class',
  'Images',
  'Download limit',
  'Download expiry days',
  'Parent',                // For variations
  'Grouped products',
  'Upsells',
  'Cross-sells',
  'External URL',
  'Button text',
  'Position',
  'Attribute 1 name',
  'Attribute 1 value(s)',
  'Attribute 1 visible',
  'Attribute 1 global',
  'Attribute 2 name',
  'Attribute 2 value(s)',
  'Attribute 2 visible',
  'Attribute 2 global',
  'Meta: _manufacturer',
  'Meta: _brand'
];

console.log('=== CONVERTING TO WOOCOMMERCE FORMAT ===\n');

// Load enriched Shopify CSV
const inputPath = path.join(BASE, 'outputs/shopify_images_enriched.csv');
const data = fs.readFileSync(inputPath, 'utf-8');
const lines = data.split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);

// Map Shopify columns
const col = {
  handle: header.indexOf('Handle'),
  title: header.indexOf('Title'),
  body: header.indexOf('Body (HTML)'),
  vendor: header.indexOf('Vendor'),
  type: header.indexOf('Type'),
  tags: header.indexOf('Tags'),
  published: header.indexOf('Published'),
  opt1Name: header.indexOf('Option1 Name'),
  opt1Value: header.indexOf('Option1 Value'),
  opt2Name: header.indexOf('Option2 Name'),
  opt2Value: header.indexOf('Option2 Value'),
  sku: header.findIndex(h => h.includes('Variant SKU')),
  grams: header.findIndex(h => h.includes('Variant Grams')),
  price: header.findIndex(h => h === 'Variant Price'),
  comparePrice: header.findIndex(h => h === 'Variant Compare At Price'),
  image: header.findIndex(h => h === 'Image Src'),
  variantImage: header.findIndex(h => h === 'Variant Image')
};

console.log('Shopify column mapping:', col);

// Group by handle (product)
const products = new Map();

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  const handle = row[col.handle];
  
  if (!products.has(handle)) {
    products.set(handle, []);
  }
  products.get(handle).push(row);
}

console.log(`Found ${products.size} unique products`);

// Convert to WooCommerce
const wooRows = [];
let simpleCount = 0;
let variableCount = 0;
let variationCount = 0;

for (const [handle, rows] of products) {
  const first = rows[0];
  const hasVariants = rows.length > 1 || (first[col.opt1Value] && first[col.opt1Value] !== 'Default Title');
  
  if (hasVariants) {
    // Variable product with variations
    variableCount++;
    
    // Parent product
    const parent = {
      ID: '',
      Type: 'variable',
      SKU: '',
      Name: first[col.title],
      Published: first[col.published] === 'true' ? '1' : '0',
      'Is featured?': '0',
      'Visibility in catalog': 'visible',
      'Short description': '',
      Description: first[col.body] || '',
      'Date sale price starts': '',
      'Date sale price ends': '',
      'Tax status': 'taxable',
      'Tax class': '',
      'In stock?': '1',
      Stock: '',
      'Low stock amount': '',
      'Backorders allowed?': '0',
      'Sold individually?': '0',
      'Weight (lbs)': '',
      'Length (in)': '',
      'Width (in)': '',
      'Height (in)': '',
      'Allow customer reviews?': '1',
      'Purchase note': '',
      'Sale price': '',
      'Regular price': '',
      Categories: mapCategory(first[col.type], first[col.tags]),
      Tags: first[col.tags] || '',
      'Shipping class': '',
      Images: first[col.image] || '',
      'Download limit': '',
      'Download expiry days': '',
      Parent: '',
      'Grouped products': '',
      Upsells: '',
      'Cross-sells': '',
      'External URL': '',
      'Button text': '',
      Position: '0',
      'Attribute 1 name': first[col.opt1Name] || 'Size',
      'Attribute 1 value(s)': rows.map(r => r[col.opt1Value]).filter(Boolean).join(' | '),
      'Attribute 1 visible': '1',
      'Attribute 1 global': '1',
      'Attribute 2 name': first[col.opt2Name] || '',
      'Attribute 2 value(s)': rows.map(r => r[col.opt2Value]).filter(Boolean).join(' | '),
      'Attribute 2 visible': first[col.opt2Name] ? '1' : '',
      'Attribute 2 global': first[col.opt2Name] ? '1' : '',
      'Meta: _manufacturer': first[col.vendor] || '',
      'Meta: _brand': first[col.vendor] || ''
    };
    wooRows.push(parent);
    
    // Variations
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      variationCount++;
      
      const grams = parseFloat(r[col.grams]) || 0;
      const weightLbs = grams > 0 ? (grams / 453.592).toFixed(2) : '';
      
      const variation = {
        ID: '',
        Type: 'variation',
        SKU: r[col.sku] || '',
        Name: '',
        Published: '1',
        'Is featured?': '',
        'Visibility in catalog': '',
        'Short description': '',
        Description: '',
        'Date sale price starts': '',
        'Date sale price ends': '',
        'Tax status': '',
        'Tax class': '',
        'In stock?': '1',
        Stock: '',
        'Low stock amount': '',
        'Backorders allowed?': '',
        'Sold individually?': '',
        'Weight (lbs)': weightLbs,
        'Length (in)': '',
        'Width (in)': '',
        'Height (in)': '',
        'Allow customer reviews?': '',
        'Purchase note': '',
        'Sale price': r[col.comparePrice] && parseFloat(r[col.comparePrice]) > parseFloat(r[col.price]) ? r[col.price] : '',
        'Regular price': r[col.comparePrice] && parseFloat(r[col.comparePrice]) > parseFloat(r[col.price]) ? r[col.comparePrice] : r[col.price],
        Categories: '',
        Tags: '',
        'Shipping class': '',
        Images: r[col.variantImage] || r[col.image] || '',
        'Download limit': '',
        'Download expiry days': '',
        Parent: `id:${first[col.title]}`,
        'Grouped products': '',
        Upsells: '',
        'Cross-sells': '',
        'External URL': '',
        'Button text': '',
        Position: String(j),
        'Attribute 1 name': first[col.opt1Name] || 'Size',
        'Attribute 1 value(s)': r[col.opt1Value] || '',
        'Attribute 1 visible': '',
        'Attribute 1 global': '',
        'Attribute 2 name': first[col.opt2Name] || '',
        'Attribute 2 value(s)': r[col.opt2Value] || '',
        'Attribute 2 visible': '',
        'Attribute 2 global': '',
        'Meta: _manufacturer': '',
        'Meta: _brand': ''
      };
      wooRows.push(variation);
    }
  } else {
    // Simple product
    simpleCount++;
    const grams = parseFloat(first[col.grams]) || 0;
    const weightLbs = grams > 0 ? (grams / 453.592).toFixed(2) : '';
    
    const simple = {
      ID: '',
      Type: 'simple',
      SKU: first[col.sku] || '',
      Name: first[col.title],
      Published: first[col.published] === 'true' ? '1' : '0',
      'Is featured?': '0',
      'Visibility in catalog': 'visible',
      'Short description': '',
      Description: first[col.body] || '',
      'Date sale price starts': '',
      'Date sale price ends': '',
      'Tax status': 'taxable',
      'Tax class': '',
      'In stock?': '1',
      Stock: '',
      'Low stock amount': '',
      'Backorders allowed?': '0',
      'Sold individually?': '0',
      'Weight (lbs)': weightLbs,
      'Length (in)': '',
      'Width (in)': '',
      'Height (in)': '',
      'Allow customer reviews?': '1',
      'Purchase note': '',
      'Sale price': first[col.comparePrice] && parseFloat(first[col.comparePrice]) > parseFloat(first[col.price]) ? first[col.price] : '',
      'Regular price': first[col.comparePrice] && parseFloat(first[col.comparePrice]) > parseFloat(first[col.price]) ? first[col.comparePrice] : first[col.price],
      Categories: mapCategory(first[col.type], first[col.tags]),
      Tags: first[col.tags] || '',
      'Shipping class': '',
      Images: first[col.image] || '',
      'Download limit': '',
      'Download expiry days': '',
      Parent: '',
      'Grouped products': '',
      Upsells: '',
      'Cross-sells': '',
      'External URL': '',
      'Button text': '',
      Position: '0',
      'Attribute 1 name': '',
      'Attribute 1 value(s)': '',
      'Attribute 1 visible': '',
      'Attribute 1 global': '',
      'Attribute 2 name': '',
      'Attribute 2 value(s)': '',
      'Attribute 2 visible': '',
      'Attribute 2 global': '',
      'Meta: _manufacturer': first[col.vendor] || '',
      'Meta: _brand': first[col.vendor] || ''
    };
    wooRows.push(simple);
  }
}

function mapCategory(type, tags) {
  // Map Shopify type/tags to WooCommerce categories
  const text = `${type || ''} ${tags || ''}`.toLowerCase();
  const categories = [];
  
  if (text.includes('nutrient')) categories.push('Nutrients');
  if (text.includes('grow media') || text.includes('coco') || text.includes('perlite')) categories.push('Grow Media');
  if (text.includes('light') || text.includes('led') || text.includes('hid')) categories.push('Grow Lights');
  if (text.includes('fan') || text.includes('airflow') || text.includes('ventilation')) categories.push('Airflow & Ventilation');
  if (text.includes('ph') || text.includes('meter')) categories.push('pH & Meters');
  if (text.includes('propagation') || text.includes('clone')) categories.push('Propagation');
  if (text.includes('seed')) categories.push('Seeds');
  if (text.includes('irrigation') || text.includes('pump') || text.includes('tubing')) categories.push('Irrigation');
  if (text.includes('container') || text.includes('pot') || text.includes('bucket')) categories.push('Containers');
  if (text.includes('harvest') || text.includes('trim')) categories.push('Harvesting');
  if (text.includes('pest') || text.includes('insect')) categories.push('Pest Control');
  if (text.includes('odor') || text.includes('carbon') || text.includes('filter')) categories.push('Odor Control');
  if (text.includes('controller') || text.includes('timer')) categories.push('Controllers');
  if (text.includes('book')) categories.push('Books');
  
  return categories.length > 0 ? categories.join(' > ') : 'Uncategorized';
}

// Build CSV
const csvLines = [WOO_HEADER.join(',')];

for (const row of wooRows) {
  const line = WOO_HEADER.map(h => escapeCSV(row[h] || '')).join(',');
  csvLines.push(line);
}

// Write output
const outputPath = path.join(BASE, 'outputs/woocommerce_final_import.csv');
fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');

console.log('\n=== CONVERSION COMPLETE ===\n');
console.log(`Simple products: ${simpleCount}`);
console.log(`Variable products: ${variableCount}`);
console.log(`Variations: ${variationCount}`);
console.log(`Total rows: ${wooRows.length}`);
console.log(`\nOutput: outputs/woocommerce_final_import.csv`);

// Validate
let hasPrice = 0;
let hasSku = 0;
let hasWeight = 0;
let hasImage = 0;

for (const row of wooRows) {
  if (row['Regular price'] && parseFloat(row['Regular price']) > 0) hasPrice++;
  if (row.SKU && row.SKU.length > 0) hasSku++;
  if (row['Weight (lbs)'] && parseFloat(row['Weight (lbs)']) > 0) hasWeight++;
  if (row.Images && row.Images.length > 5) hasImage++;
}

console.log('\n=== VALIDATION ===\n');
console.log(`With price: ${hasPrice} / ${wooRows.length} (${((hasPrice/wooRows.length)*100).toFixed(1)}%)`);
console.log(`With SKU: ${hasSku} / ${wooRows.length} (${((hasSku/wooRows.length)*100).toFixed(1)}%)`);
console.log(`With weight: ${hasWeight} / ${wooRows.length} (${((hasWeight/wooRows.length)*100).toFixed(1)}%)`);
console.log(`With image: ${hasImage} / ${wooRows.length} (${((hasImage/wooRows.length)*100).toFixed(1)}%)`);
