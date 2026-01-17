/**
 * Build Local Image Mapping for Shopify Import
 * 
 * Maps WooCommerce image URLs to local file paths
 * and validates file existence
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UPLOADS_PATH = path.join(ROOT, 'hmoonhydro.com', 'wp-content', 'uploads');
const WOO_MAP_PATH = path.join(ROOT, 'CSVs', 'woo_image_map.json');
const MASTER_CSV_PATH = path.join(ROOT, 'outputs', 'MASTER_IMPORT.csv');

console.log('=== LOCAL IMAGE MAPPING BUILDER ===\n');

// 1. Load existing woo_image_map
const wooMap = require(WOO_MAP_PATH);
console.log('Loaded woo_image_map.json:', Object.keys(wooMap).length, 'entries');

// 2. Build local file index
console.log('Scanning local uploads folder...');

function scanDir(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, files);
      } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)) {
        // Store relative path from uploads folder
        const relPath = fullPath.replace(UPLOADS_PATH, '').replace(/\\/g, '/');
        files.push({
          filename: entry.name.toLowerCase(),
          relativePath: relPath,
          fullPath: fullPath
        });
      }
    }
  } catch (e) {
    // Directory access error, skip
  }
  return files;
}

const localFiles = scanDir(UPLOADS_PATH);
console.log('Found', localFiles.length, 'local image files');

// Create lookup by filename
const filesByName = {};
localFiles.forEach(f => {
  const name = f.filename;
  if (!filesByName[name]) filesByName[name] = [];
  filesByName[name].push(f);
});

// 3. Map WooCommerce URLs to local files
console.log('\nMapping WooCommerce URLs to local files...');

const imageMapping = {};
let matched = 0;
let unmatched = 0;
const unmatchedUrls = [];

Object.values(wooMap).forEach(entry => {
  if (!entry.imageUrl) return;
  
  const url = entry.imageUrl;
  const handle = entry.handle;
  
  // Extract filename from URL
  // URL format: https://hmoonhydro.com/wp-content/uploads/YYYY/MM/filename.jpg
  const urlParts = url.split('/');
  const filename = urlParts[urlParts.length - 1].toLowerCase();
  
  // Try to find matching local file
  const matches = filesByName[filename];
  
  if (matches && matches.length > 0) {
    // Prefer exact path match if URL has year/month
    const yearMatch = url.match(/uploads\/(\d{4})\/(\d{2})\//);
    let bestMatch = matches[0];
    
    if (yearMatch) {
      const expectedPath = `/${yearMatch[1]}/${yearMatch[2]}/`;
      const exactMatch = matches.find(m => m.relativePath.includes(expectedPath));
      if (exactMatch) bestMatch = exactMatch;
    }
    
    imageMapping[handle] = {
      wooUrl: url,
      localPath: bestMatch.relativePath,
      fullPath: bestMatch.fullPath,
      filename: filename
    };
    matched++;
  } else {
    unmatchedUrls.push({ handle, url, filename });
    unmatched++;
  }
});

console.log('Matched:', matched);
console.log('Unmatched:', unmatched);

// 4. Check current MASTER_IMPORT image coverage
console.log('\nAnalyzing MASTER_IMPORT.csv image coverage...');

const csv = fs.readFileSync(MASTER_CSV_PATH, 'utf8').split('\n');
const header = csv[0].split(',');
const handleIdx = header.indexOf('Handle');
const imgSrcIdx = header.indexOf('Image Src');

const productImages = {};
let productsWithImage = 0;
let productsWithoutImage = 0;
const noImageProducts = [];

// Get unique products (first row of each handle)
const seenHandles = new Set();
csv.slice(1).forEach(row => {
  if (!row.trim()) return;
  const cols = row.split(',');
  const handle = cols[handleIdx];
  const imgSrc = cols[imgSrcIdx];
  
  if (!seenHandles.has(handle)) {
    seenHandles.add(handle);
    if (imgSrc && imgSrc.length > 5) {
      productsWithImage++;
      productImages[handle] = imgSrc;
    } else {
      productsWithoutImage++;
      noImageProducts.push(handle);
    }
  }
});

console.log('Products with images in CSV:', productsWithImage);
console.log('Products without images in CSV:', productsWithoutImage);

// 5. How many missing images can we fill from local files?
let canFill = 0;
let cannotFill = 0;
const fillable = [];
const unfillable = [];

noImageProducts.forEach(handle => {
  if (imageMapping[handle]) {
    canFill++;
    fillable.push({
      handle,
      localPath: imageMapping[handle].localPath
    });
  } else {
    cannotFill++;
    unfillable.push(handle);
  }
});

console.log('\nOf', productsWithoutImage, 'products without images:');
console.log('  Can fill from local files:', canFill);
console.log('  Still missing:', cannotFill);

// 6. Save reports
const report = {
  summary: {
    localImagesFound: localFiles.length,
    wooMapEntries: Object.keys(wooMap).length,
    matchedToLocal: matched,
    unmatchedWooUrls: unmatched,
    csvProductsWithImage: productsWithImage,
    csvProductsWithoutImage: productsWithoutImage,
    fillableFromLocal: canFill,
    stillMissing: cannotFill
  },
  imageMapping: imageMapping,
  unmatchedUrls: unmatchedUrls.slice(0, 50), // First 50
  fillableProducts: fillable,
  unfillableProducts: unfillable.slice(0, 100) // First 100
};

const outputPath = path.join(ROOT, 'outputs', 'local_image_mapping.json');
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log('\n✅ Report saved to outputs/local_image_mapping.json');

// 7. Print sample of fillable products
console.log('\n=== SAMPLE FILLABLE PRODUCTS ===');
fillable.slice(0, 10).forEach(p => {
  console.log(`  ${p.handle} → ${p.localPath}`);
});

// 8. Print sample unfillable
console.log('\n=== SAMPLE UNFILLABLE (no local image) ===');
unfillable.slice(0, 10).forEach(h => {
  console.log(`  ${h}`);
});
