const fs = require('fs');
const path = require('path');

// Dice coefficient for string similarity
function dice(str1, str2) {
  const bigrams1 = new Set();
  const bigrams2 = new Set();
  
  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.slice(i, i + 2));
  }
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.slice(i, i + 2));
  }
  
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) intersection++;
  }
  
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

// Normalize for comparison
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

// Get all original images
const uploadsDir = 'hmoonhydro.com/wp-content/uploads';

function getAllImages(dir) {
  const images = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        images.push(...getAllImages(fullPath));
      } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
        // Skip thumbnails and very small images
        if (!/-\d+x\d+\./.test(entry.name) && !entry.name.includes('100x100')) {
          images.push({
            path: fullPath,
            name: entry.name,
            normalized: normalize(entry.name.replace(/\.(jpg|jpeg|png|webp)$/i, '')),
          });
        }
      }
    }
  } catch (e) {}
  return images;
}

console.log('Loading local images...');
const localImages = getAllImages(uploadsDir);
console.log(`Found ${localImages.length} original images`);

// Read still-missing products
const missing = JSON.parse(fs.readFileSync('outputs/still_missing_images.json', 'utf8'));
console.log(`Products missing images: ${missing.length}\n`);

// Try aggressive matching
const matches = [];
const noMatch = [];

for (const product of missing) {
  const handleNorm = normalize(product.handle.replace(/-/g, ''));
  const titleNorm = normalize(product.title);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const img of localImages) {
    // Skip placeholder images
    if (img.name.toLowerCase().includes('hmh_logo') || 
        img.name.toLowerCase().includes('placeholder')) continue;
    
    // Calculate Dice coefficient
    const handleScore = dice(handleNorm, img.normalized);
    const titleScore = dice(titleNorm, img.normalized);
    const score = Math.max(handleScore, titleScore);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = img;
    }
  }
  
  // Lower threshold to 0.4 for more matches
  if (bestMatch && bestScore >= 0.4) {
    matches.push({
      handle: product.handle,
      title: product.title,
      imagePath: bestMatch.path,
      imageName: bestMatch.name,
      score: bestScore,
    });
  } else {
    noMatch.push({
      handle: product.handle,
      title: product.title,
      bestScore: bestScore,
      bestMatch: bestMatch?.name || 'none',
    });
  }
}

console.log(`=== Dice Matching Results ===`);
console.log(`Matched (score >= 0.4): ${matches.length}`);
console.log(`No match: ${noMatch.length}\n`);

// Group matches by score range
const highScore = matches.filter(m => m.score >= 0.7);
const medScore = matches.filter(m => m.score >= 0.5 && m.score < 0.7);
const lowScore = matches.filter(m => m.score < 0.5);

console.log(`  High confidence (>=0.7): ${highScore.length}`);
console.log(`  Medium confidence (0.5-0.7): ${medScore.length}`);
console.log(`  Low confidence (0.4-0.5): ${lowScore.length}`);

console.log('\n=== High Confidence Matches ===');
highScore.slice(0, 15).forEach(m => {
  console.log(`${m.handle} → ${m.imageName} (${(m.score*100).toFixed(0)}%)`);
});

console.log('\n=== Medium Confidence Matches ===');
medScore.slice(0, 15).forEach(m => {
  console.log(`${m.handle} → ${m.imageName} (${(m.score*100).toFixed(0)}%)`);
});

console.log('\n=== Sample Non-Matches (with best attempt) ===');
noMatch.slice(0, 15).forEach(m => {
  console.log(`${m.handle} → best: ${m.bestMatch} (${(m.bestScore*100).toFixed(0)}%)`);
});

// Save high+medium confidence matches for review
const goodMatches = [...highScore, ...medScore];
fs.writeFileSync('outputs/dice_image_matches.json', JSON.stringify(goodMatches, null, 2));
console.log(`\nSaved ${goodMatches.length} good matches to outputs/dice_image_matches.json`);
