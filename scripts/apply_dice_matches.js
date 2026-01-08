const fs = require('fs');

// Parse CSV properly
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

function buildCSVLine(fields) {
  return fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
}

// Load dice matches
const diceMatches = JSON.parse(fs.readFileSync('outputs/dice_image_matches.json', 'utf8'));
console.log(`Loaded ${diceMatches.length} dice matches`);

// Create URL map from local paths
const matchMap = new Map();
for (const m of diceMatches) {
  // Convert local path to URL
  // hmoonhydro.com/wp-content/uploads/2019/08/file.jpg → https://hmoonhydro.com/wp-content/uploads/2019/08/file.jpg
  const url = 'https://' + m.imagePath.replace(/\\/g, '/');
  matchMap.set(m.handle, { url, score: m.score });
}

// Read CSV
const csvPath = 'outputs/shopify_complete_import.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');
const header = lines[0];
const headerFields = parseCSVLine(header);

const imgSrcIdx = headerFields.findIndex(h => h.toLowerCase().includes('image src'));
const imgPosIdx = headerFields.findIndex(h => h.toLowerCase().includes('image position'));

console.log(`Image Src column: ${imgSrcIdx}`);

let fixCount = 0;
const newLines = [header];
const applied = new Set();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const fields = parseCSVLine(line);
  const handle = fields[0];
  
  // Check if this handle needs fixing and hasn't been fixed yet
  const match = matchMap.get(handle);
  const hasExistingImage = fields[imgSrcIdx] && 
                           fields[imgSrcIdx].startsWith('http') && 
                           !fields[imgSrcIdx].includes('HMH_logo_small');
  
  if (match && !hasExistingImage && !applied.has(handle)) {
    // Only apply if score >= 0.5 (medium+ confidence)
    if (match.score >= 0.5) {
      fields[imgSrcIdx] = match.url;
      if (!fields[imgPosIdx]) {
        fields[imgPosIdx] = '1';
      }
      console.log(`✓ ${handle} → ${match.url.split('/').pop()} (${(match.score*100).toFixed(0)}%)`);
      fixCount++;
      applied.add(handle);
      newLines.push(buildCSVLine(fields));
      continue;
    }
  }
  
  newLines.push(line);
}

fs.writeFileSync(csvPath, newLines.join('\n'));

console.log(`\n=== Applied ${fixCount} Dice-matched images ===`);

// Verify final status
console.log('\n=== Final Image Status ===');
const verifyContent = fs.readFileSync(csvPath, 'utf8');
const verifyLines = verifyContent.split('\n').slice(1);

const products = new Map();
for (const vline of verifyLines) {
  if (!vline.trim()) continue;
  const vfields = parseCSVLine(vline);
  const handle = vfields[0];
  const imgSrc = vfields[imgSrcIdx];
  const hasImg = imgSrc && imgSrc.startsWith('http') && !imgSrc.includes('HMH_logo_small');
  
  if (!products.has(handle) || hasImg) {
    products.set(handle, hasImg);
  }
}

const withImg = [...products.values()].filter(v => v).length;
const total = products.size;
const withoutImg = total - withImg;

console.log(`Total products: ${total}`);
console.log(`With images: ${withImg} (${(withImg/total*100).toFixed(1)}%)`);
console.log(`Without images: ${withoutImg} (${(withoutImg/total*100).toFixed(1)}%)`);
