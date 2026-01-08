const fs = require('fs');
const path = require('path');

// Get all local images (originals only, not thumbnails)
const uploadsDir = 'hmoonhydro.com/wp-content/uploads';

function getAllImages(dir) {
  const images = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      images.push(...getAllImages(fullPath));
    } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
      // Skip thumbnails (contain dimensions like -300x200)
      if (!/-\d+x\d+\./.test(entry.name)) {
        images.push({
          path: fullPath,
          name: entry.name,
          nameNoExt: entry.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').toLowerCase(),
        });
      }
    }
  }
  return images;
}

console.log('Scanning local images...');
const localImages = getAllImages(uploadsDir);
console.log(`Found ${localImages.length} original images\n`);

// Build a lookup map with normalized names
const imageMap = new Map();
for (const img of localImages) {
  // Normalize: lowercase, remove special chars, collapse spaces
  const normalized = img.nameNoExt
    .replace(/[_\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!imageMap.has(normalized)) {
    imageMap.set(normalized, img);
  }
  
  // Also add without common suffixes
  const withoutSuffix = normalized
    .replace(/\s*(package|product|image|img|photo|pic|\d+oz|\d+ml|\d+gal|\d+qt|\d+lt)\s*/gi, ' ')
    .trim();
  if (withoutSuffix && !imageMap.has(withoutSuffix)) {
    imageMap.set(withoutSuffix, img);
  }
}

// Parse CSV to get products missing images
function parseCSVLine(line) {
  const fields = [];
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
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const csvPath = 'outputs/shopify_complete_import.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');
const header = lines[0];
const headerFields = parseCSVLine(header);

const imgSrcIdx = headerFields.findIndex(h => h.toLowerCase().includes('image src'));
const titleIdx = 1;

// Find products without images
const missingProducts = [];
const seenHandles = new Set();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  const handle = fields[0];
  const title = fields[titleIdx];
  const imgSrc = fields[imgSrcIdx];
  
  if (seenHandles.has(handle)) continue;
  seenHandles.add(handle);
  
  const hasImage = imgSrc && imgSrc.startsWith('http') && !imgSrc.includes('HMH_logo_small');
  if (!hasImage && title) {
    missingProducts.push({ handle, title, lineIdx: i });
  }
}

console.log(`Products missing images: ${missingProducts.length}\n`);

// Try to match each missing product to a local image
const matches = [];
const noMatch = [];

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeForMatch(text).split(' ').filter(t => t.length > 1);
}

function tokenOverlap(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const overlap = tokens2.filter(t => set1.has(t)).length;
  return overlap / Math.max(tokens1.length, tokens2.length);
}

for (const product of missingProducts) {
  const handleNorm = normalizeForMatch(product.handle.replace(/-/g, ' '));
  const titleNorm = normalizeForMatch(product.title);
  const handleTokens = tokenize(product.handle.replace(/-/g, ' '));
  const titleTokens = tokenize(product.title);
  
  let bestMatch = null;
  let bestScore = 0;
  
  // Try exact match on handle
  if (imageMap.has(handleNorm)) {
    bestMatch = imageMap.get(handleNorm);
    bestScore = 1.0;
  }
  
  // Try exact match on title
  if (!bestMatch && imageMap.has(titleNorm)) {
    bestMatch = imageMap.get(titleNorm);
    bestScore = 1.0;
  }
  
  // Try fuzzy matching
  if (!bestMatch) {
    for (const [imgName, img] of imageMap.entries()) {
      const imgTokens = imgName.split(' ').filter(t => t.length > 1);
      
      // Try both handle and title tokens
      const handleOverlap = tokenOverlap(handleTokens, imgTokens);
      const titleOverlap = tokenOverlap(titleTokens, imgTokens);
      const score = Math.max(handleOverlap, titleOverlap);
      
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = img;
      }
    }
  }
  
  if (bestMatch && bestScore >= 0.5) {
    matches.push({
      handle: product.handle,
      title: product.title,
      imagePath: bestMatch.path,
      imageName: bestMatch.name,
      score: bestScore,
      lineIdx: product.lineIdx,
    });
  } else {
    noMatch.push(product);
  }
}

console.log(`=== Matching Results ===`);
console.log(`Matched: ${matches.length}`);
console.log(`No match: ${noMatch.length}\n`);

// Show some matches
console.log('=== Sample Matches ===');
matches.slice(0, 20).forEach(m => {
  console.log(`${m.handle} → ${m.imageName} (score: ${m.score.toFixed(2)})`);
});

// Show products still missing
console.log('\n=== Still Missing (sample) ===');
noMatch.slice(0, 20).forEach(p => {
  console.log(`  ${p.handle}: ${p.title}`);
});

// Save matches for applying
fs.writeFileSync('outputs/local_image_matches.json', JSON.stringify(matches, null, 2));
console.log(`\nSaved ${matches.length} matches to outputs/local_image_matches.json`);

// Also save list of still-missing for review
fs.writeFileSync('outputs/still_missing_images.json', JSON.stringify(noMatch.map(p => ({
  handle: p.handle,
  title: p.title
})), null, 2));
console.log(`Saved ${noMatch.length} still-missing to outputs/still_missing_images.json`);
