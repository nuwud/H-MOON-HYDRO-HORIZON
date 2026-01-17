/**
 * Extract image URLs from fresh WooCommerce export
 * Creates extended image mapping for MASTER_IMPORT
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WOO_EXPORT = path.join(ROOT, 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
const UPLOADS_PATH = path.join(ROOT, 'hmoonhydro.com', 'wp-content', 'uploads');

console.log('=== EXTRACT IMAGES FROM WOOCOMMERCE EXPORT ===\n');

// Parse CSV (handling quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
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

// Read WooCommerce export
const wooContent = fs.readFileSync(WOO_EXPORT, 'utf8');
const wooLines = wooContent.split('\n');
const wooHeader = parseCSVLine(wooLines[0]);

// Find relevant columns
const cols = {
  sku: wooHeader.indexOf('SKU'),
  name: wooHeader.indexOf('Name'),
  slug: wooHeader.indexOf('Slug'),
  imageUrl: wooHeader.indexOf('Image URL'),
  imagesPath: wooHeader.indexOf('Images Path'),
  type: wooHeader.indexOf('Type')
};

console.log('Column indices:', cols);
console.log('Total rows:', wooLines.length - 1);

// Extract image data
const imageData = {};
let withImage = 0;
let withoutImage = 0;

wooLines.slice(1).forEach((line, idx) => {
  if (!line.trim()) return;
  
  const row = parseCSVLine(line);
  const sku = row[cols.sku] || '';
  const name = row[cols.name] || '';
  const slug = row[cols.slug] || '';
  const imageUrl = row[cols.imageUrl] || '';
  const imagesPath = row[cols.imagesPath] || '';
  const type = row[cols.type] || '';
  
  // Generate handle from slug
  const handle = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  if (imageUrl || imagesPath) {
    // Use imageUrl first, fall back to imagesPath
    const imgSource = imageUrl || imagesPath;
    
    imageData[handle] = {
      handle,
      name,
      sku,
      imageUrl: imgSource,
      type
    };
    withImage++;
  } else {
    withoutImage++;
  }
});

console.log('\nProducts with images:', withImage);
console.log('Products without images:', withoutImage);

// Now match to local files
console.log('\nMatching to local files...');

// Build local file index (quick scan)
function getLocalFiles(dir, files = {}) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getLocalFiles(fullPath, files);
      } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)) {
        const filename = entry.name.toLowerCase();
        const relPath = fullPath.replace(UPLOADS_PATH, '').replace(/\\/g, '/');
        if (!files[filename]) files[filename] = [];
        files[filename].push(relPath);
      }
    }
  } catch (e) {}
  return files;
}

const localFileIndex = getLocalFiles(UPLOADS_PATH);
console.log('Local file index built:', Object.keys(localFileIndex).length, 'unique filenames');

// Match image URLs to local files
const mappedImages = {};
let matched = 0;
let unmatched = 0;

Object.entries(imageData).forEach(([handle, data]) => {
  if (!data.imageUrl) return;
  
  // Extract filename from URL
  // Handles various URL formats
  let filename = '';
  
  if (data.imageUrl.includes('/')) {
    filename = data.imageUrl.split('/').pop().toLowerCase();
  } else {
    filename = data.imageUrl.toLowerCase();
  }
  
  // Remove query strings
  filename = filename.split('?')[0];
  
  const localMatches = localFileIndex[filename];
  
  if (localMatches && localMatches.length > 0) {
    mappedImages[handle] = {
      handle,
      name: data.name,
      sku: data.sku,
      wooUrl: data.imageUrl,
      localPath: localMatches[0], // First match
      allLocalPaths: localMatches
    };
    matched++;
  } else {
    unmatched++;
  }
});

console.log('Matched to local files:', matched);
console.log('Could not match:', unmatched);

// Save extended mapping
const outputPath = path.join(ROOT, 'outputs', 'extended_image_mapping.json');
fs.writeFileSync(outputPath, JSON.stringify({
  summary: {
    wooProductsWithImage: withImage,
    wooProductsWithoutImage: withoutImage,
    matchedToLocal: matched,
    unmatched: unmatched
  },
  mappings: mappedImages
}, null, 2));

console.log('\n✅ Saved to outputs/extended_image_mapping.json');

// Sample output
console.log('\n=== SAMPLE MAPPINGS ===');
Object.values(mappedImages).slice(0, 10).forEach(m => {
  console.log(`${m.handle}: ${m.localPath}`);
});
