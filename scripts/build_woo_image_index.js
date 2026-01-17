/**
 * build_woo_image_index.js
 * 
 * Scans WooCommerce wp-content/uploads folder and creates an index of all product images.
 * Maps image filenames to their full paths for matching with product titles.
 */

const fs = require('fs');
const path = require('path');

const WP_UPLOADS = path.join(__dirname, '..', 'hmoonhydro.com', 'wp-content', 'uploads');
const OUTPUT_DIR = path.join(__dirname, '..', 'outputs');

// Image extensions to look for
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Skip WordPress size variants (we want originals)
const SIZE_PATTERN = /-\d+x\d+\.(jpg|jpeg|png|gif|webp)$/i;
const SCALED_PATTERN = /-scaled\.(jpg|jpeg|png|gif|webp)$/i;

function isOriginalImage(filename) {
  // Skip size variants like -100x100.jpg, -324x324.jpg
  if (SIZE_PATTERN.test(filename)) return false;
  // Keep -scaled versions as they're often the largest available
  return true;
}

function normalizeForMatching(str) {
  return str
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(filename) {
  // Remove extension
  const name = path.basename(filename, path.extname(filename));
  // Remove -scaled suffix
  const clean = name.replace(/-scaled$/i, '');
  // Split into words
  return normalizeForMatching(clean).split(' ').filter(w => w.length > 2);
}

async function scanUploads() {
  const images = [];
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  
  for (const year of years) {
    const yearPath = path.join(WP_UPLOADS, year);
    if (!fs.existsSync(yearPath)) continue;
    
    const months = fs.readdirSync(yearPath);
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      if (!fs.statSync(monthPath).isDirectory()) continue;
      
      const files = fs.readdirSync(monthPath);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.includes(ext)) continue;
        if (!isOriginalImage(file)) continue;
        
        const relativePath = `wp-content/uploads/${year}/${month}/${file}`;
        const keywords = extractKeywords(file);
        
        images.push({
          filename: file,
          path: relativePath,
          year,
          month,
          keywords,
          basename: path.basename(file, ext).replace(/-scaled$/i, '')
        });
      }
    }
  }
  
  return images;
}

function buildKeywordIndex(images) {
  const index = {};
  
  for (const img of images) {
    for (const keyword of img.keywords) {
      if (!index[keyword]) index[keyword] = [];
      index[keyword].push(img);
    }
  }
  
  return index;
}

function findMatchingImages(productTitle, keywordIndex, allImages) {
  const titleKeywords = normalizeForMatching(productTitle).split(' ').filter(w => w.length > 2);
  const scores = new Map();
  
  for (const keyword of titleKeywords) {
    const matches = keywordIndex[keyword] || [];
    for (const img of matches) {
      const key = img.path;
      scores.set(key, (scores.get(key) || 0) + 1);
    }
  }
  
  // Sort by score descending
  const results = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([imgPath, score]) => ({
      path: imgPath,
      score,
      matchRatio: score / titleKeywords.length
    }));
  
  return results;
}

async function main() {
  console.log('Scanning WooCommerce uploads folder...');
  const images = await scanUploads();
  console.log(`Found ${images.length} original images`);
  
  // Build keyword index
  const keywordIndex = buildKeywordIndex(images);
  console.log(`Built keyword index with ${Object.keys(keywordIndex).length} unique keywords`);
  
  // Save image index
  const indexOutput = {
    generated: new Date().toISOString(),
    totalImages: images.length,
    images: images.map(img => ({
      filename: img.filename,
      path: img.path,
      basename: img.basename
    }))
  };
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'woo_image_index.json'),
    JSON.stringify(indexOutput, null, 2)
  );
  console.log(`Saved image index to outputs/woo_image_index.json`);
  
  // Create a simpler lookup by normalized basename
  const basenameLookup = {};
  for (const img of images) {
    const key = normalizeForMatching(img.basename);
    if (!basenameLookup[key]) basenameLookup[key] = [];
    basenameLookup[key].push(img.path);
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'woo_image_basename_lookup.json'),
    JSON.stringify(basenameLookup, null, 2)
  );
  console.log(`Saved basename lookup to outputs/woo_image_basename_lookup.json`);
  
  // Print some stats
  const byYear = {};
  for (const img of images) {
    byYear[img.year] = (byYear[img.year] || 0) + 1;
  }
  console.log('\nImages by year:');
  for (const [year, count] of Object.entries(byYear).sort()) {
    console.log(`  ${year}: ${count}`);
  }
  
  // Sample matching test
  console.log('\n--- Sample Matching Test ---');
  const testProducts = [
    'FloraGro General Hydroponics 1 Gallon',
    'Fox Farm Big Bloom Liquid Plant Food',
    'AC Infinity CLOUDLINE T6',
    'MaxiFan 6 Inch Mixed Flow Fan'
  ];
  
  for (const product of testProducts) {
    const matches = findMatchingImages(product, keywordIndex, images);
    console.log(`\n"${product}":`);
    if (matches.length === 0) {
      console.log('  No matches found');
    } else {
      for (const m of matches.slice(0, 3)) {
        console.log(`  [${m.score}] ${m.path}`);
      }
    }
  }
}

main().catch(console.error);
