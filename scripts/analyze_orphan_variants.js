/**
 * Orphan Variant Analysis Script
 * Analyzes orphan products from WooCommerce to find size variants
 * that should belong to grouped parents.
 */
const fs = require('fs');
const path = require('path');

const rawFile = path.join(__dirname, '..', 'reports', 'orphan_analysis_raw.txt');
const lines = fs.readFileSync(rawFile, 'utf-8').split('\n');

// Parse parents and orphans
const parents = [];
const orphans = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('PARENT|')) {
    const parts = trimmed.split('|');
    parents.push({
      id: parts[1],
      title: parts[2],
      childCount: parseInt(parts[3]) || 0,
      category: parts[4] || ''
    });
  } else if (trimmed.startsWith('ORPHAN|')) {
    const parts = trimmed.split('|');
    orphans.push({
      id: parts[1],
      title: parts[2],
      sku: parts[3] || '',
      price: parts[4] || '',
      category: parts[5] || '',
      flags: parts[6] || ''
    });
  }
}

// Size patterns to detect
const sizePatterns = [
  // Volume - liters
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:Lt|Ltr|Liter|Litre|liter|litre|lt)\b/i, type: 'volume', unit: 'Lt' },
  { regex: /\b(\d+(?:\.\d+)?)\s*L\b/, type: 'volume', unit: 'L' },  // capital L only
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:ml|mL|ML)\b/i, type: 'volume', unit: 'ml' },
  // Volume - gallons/quarts
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:Gal|gal|Gallon|gallon)\.?\b/i, type: 'volume', unit: 'Gal' },
  { regex: /\bGallon\b/i, type: 'volume', unit: 'Gallon' },
  { regex: /\b(?:Quart|Qt|qt)\.?\b/i, type: 'volume', unit: 'Qt' },
  { regex: /\bPint\b/i, type: 'volume', unit: 'Pint' },
  // Weight
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:lb|lbs)\.?\b/i, type: 'weight', unit: 'lb' },
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:kg|KG)\b/i, type: 'weight', unit: 'kg' },
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:gm|grams?|g)\b/i, type: 'weight', unit: 'g' },
  // Ounces
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:oz|OZ|ounce)\.?\b/i, type: 'weight/volume', unit: 'oz' },
  // Count/Pack
  { regex: /\b(\d+)\s*(?:pack|pk)\b/i, type: 'count', unit: 'pack' },
  { regex: /\b(\d+)\s*(?:ct|count)\b/i, type: 'count', unit: 'ct' },
  // Cubic feet
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:cu\.?\s*ft|cu\.?\s*feet|cubic\s*feet?)\.?\b/i, type: 'volume', unit: 'cu ft' },
  { regex: /\b(\d+(?:\.\d+)?)\s*cf\.?\b/i, type: 'volume', unit: 'cf' },
  // Generic sizes in parens
  { regex: /\((?:Small|Medium|Large|XL|XXL|Mini|Jumbo)\)/i, type: 'generic', unit: 'size' },
  // Parenthesized sizes
  { regex: /\((\d+(?:\.\d+)?)\s*(?:Lt|L|ml|gal|qt|oz|lb|kg|g|cu\s*ft)\)/i, type: 'paren-size', unit: 'paren' },
  // Bag/Bucket containers
  { regex: /\bBag\b/i, type: 'container', unit: 'Bag' },
  { regex: /\bBucket\b/i, type: 'container', unit: 'Bucket' },
  // Watt (for bulbs)
  { regex: /\b(\d+)\s*(?:Watt|W)\b/i, type: 'power', unit: 'W' },
  // Inch sizes
  { regex: /\b(\d+(?:\.\d+)?)\s*(?:in|inch|")\b/i, type: 'dimension', unit: 'in' },
  // Foot lengths for rolls
  { regex: /\b(\d+)\s*(?:ft|foot|feet|')\.?\s*(?:Roll|roll)?\b/i, type: 'length', unit: 'ft' },
];

// Extract size info from a title
function extractSize(title) {
  const sizes = [];
  for (const pat of sizePatterns) {
    const match = title.match(pat.regex);
    if (match) {
      sizes.push({
        matched: match[0],
        value: match[1] || match[0],
        type: pat.type,
        unit: pat.unit
      });
    }
  }
  return sizes;
}

// Strip size patterns from title to get base name
function getBaseName(title, sizes) {
  let base = title;
  for (const s of sizes) {
    base = base.replace(s.matched, '');
  }
  // Clean up
  base = base.replace(/\s*[-–—]\s*$/, '');     // trailing dashes
  base = base.replace(/^\s*[-–—]\s*/, '');     // leading dashes
  base = base.replace(/\(\s*\)/g, '');          // empty parens
  base = base.replace(/\s+/g, ' ');             // multiple spaces
  base = base.replace(/[,;]\s*$/g, '');         // trailing punctuation
  base = base.trim();
  return base;
}

// Normalize title for comparison
function normalize(str) {
  return str.toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score
function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  
  // Exact match
  if (na === nb) return 1.0;
  
  // Substring match
  if (nb.includes(na) || na.includes(nb)) {
    const shorter = na.length < nb.length ? na : nb;
    const longer = na.length < nb.length ? nb : na;
    return shorter.length / longer.length;
  }
  
  // Word overlap
  const wordsA = na.split(' ').filter(w => w.length > 1);
  const wordsB = nb.split(' ').filter(w => w.length > 1);
  const common = wordsA.filter(w => wordsB.includes(w));
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  return common.length / Math.max(wordsA.length, wordsB.length);
}

// Find best parent match for an orphan base name
function findBestParent(baseName, orphanCategory) {
  let bestMatch = null;
  let bestScore = 0;
  
  const normBase = normalize(baseName);
  if (normBase.length < 3) return null;
  
  for (const parent of parents) {
    const normParent = normalize(parent.title);
    let score = similarity(baseName, parent.title);
    
    // Category match bonus
    const catA = normalize(orphanCategory);
    const catB = normalize(parent.category);
    if (catA && catB && (catA.includes(catB) || catB.includes(catA) || catA === catB)) {
      score += 0.15;
    }
    
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = { ...parent, score };
    }
  }
  
  return bestMatch;
}

// Analyze all orphans
const orphansWithSizes = [];
const orphansWithoutSizes = [];
const matched = [];
const unmatched = [];
const orphanGroups = {};  // base name -> orphans (for finding orphan families)

for (const orphan of orphans) {
  const sizes = extractSize(orphan.title);
  
  if (sizes.length > 0) {
    const baseName = getBaseName(orphan.title, sizes);
    const bestParent = findBestParent(baseName, orphan.category);
    
    const entry = {
      ...orphan,
      sizes,
      baseName,
      bestParent
    };
    
    orphansWithSizes.push(entry);
    
    if (bestParent) {
      matched.push(entry);
    } else {
      unmatched.push(entry);
    }
    
    // Group by normalized base name
    const normBase = normalize(baseName);
    if (!orphanGroups[normBase]) {
      orphanGroups[normBase] = [];
    }
    orphanGroups[normBase].push(entry);
    
  } else {
    orphansWithoutSizes.push(orphan);
    
    // Also check if no-size orphans share a base name with other orphans
    const normTitle = normalize(orphan.title);
    if (!orphanGroups[normTitle]) {
      orphanGroups[normTitle] = [];
    }
    orphanGroups[normTitle].push({ ...orphan, baseName: orphan.title, sizes: [] });
  }
}

// Find orphan families (multiple orphans sharing a base name)
const orphanFamilies = {};
for (const [base, members] of Object.entries(orphanGroups)) {
  if (members.length >= 2) {
    orphanFamilies[base] = members;
  }
}

// =========== OUTPUT REPORT ===========
const report = [];
report.push('# Orphan Variant Analysis Report');
report.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
report.push('');

report.push('## Summary');
report.push(`| Metric | Count |`);
report.push(`|--------|-------|`);
report.push(`| Total parents parsed | ${parents.length} |`);
report.push(`| Total orphans parsed | ${orphans.length} |`);
report.push(`| Orphans with size patterns | ${orphansWithSizes.length} |`);
report.push(`| Orphans WITHOUT size patterns | ${orphansWithoutSizes.length} |`);
report.push(`| Orphans matched to a parent | ${matched.length} |`);
report.push(`| Orphans with size but NO parent match | ${unmatched.length} |`);
report.push(`| Orphan family groups (shared base name) | ${Object.keys(orphanFamilies).length} |`);
report.push('');

// == SECTION 1: Matched orphans ==
report.push('---');
report.push('## 1. Orphans With Size Patterns That Match a Parent');
report.push(`**${matched.length} orphans** should be linked as variants of existing parents.`);
report.push('');
report.push('| Orphan ID | Orphan Title | Detected Size | Base Name | Parent ID | Parent Title | Score | Category Match? |');
report.push('|-----------|-------------|---------------|-----------|-----------|-------------|-------|----------------|');

for (const m of matched.sort((a, b) => b.bestParent.score - a.bestParent.score)) {
  const sizeStr = m.sizes.map(s => s.matched).join(', ');
  const catMatch = normalize(m.category).includes(normalize(m.bestParent.category)) ||
                   normalize(m.bestParent.category).includes(normalize(m.category)) ? '✅' : '❌';
  report.push(`| ${m.id} | ${m.title} | ${sizeStr} | ${m.baseName} | ${m.bestParent.id} | ${m.bestParent.title} | ${m.bestParent.score.toFixed(2)} | ${catMatch} |`);
}
report.push('');

// == SECTION 2: Unmatched orphans with size ==
report.push('---');
report.push('## 2. Orphans With Size Patterns But NO Parent Match');
report.push(`**${unmatched.length} orphans** have size patterns but don't match any existing parent.`);
report.push('');
report.push('| Orphan ID | Orphan Title | Detected Size | Base Name | Category | Flags |');
report.push('|-----------|-------------|---------------|-----------|----------|-------|');

for (const u of unmatched) {
  const sizeStr = u.sizes.map(s => s.matched).join(', ');
  report.push(`| ${u.id} | ${u.title} | ${sizeStr} | ${u.baseName} | ${u.category} | ${u.flags} |`);
}
report.push('');

// == SECTION 3: Orphan families (candidates for NEW grouped parents) ==
report.push('---');
report.push('## 3. Orphan Families (Candidates for NEW Grouped Parents)');
report.push(`**${Object.keys(orphanFamilies).length} groups** of orphans share a base name and could become new grouped/variable products.`);
report.push('');

const sortedFamilies = Object.entries(orphanFamilies).sort((a, b) => b[1].length - a[1].length);
for (const [base, members] of sortedFamilies) {
  report.push(`### "${members[0].baseName}" (${members.length} orphans)`);
  report.push('| ID | Title | Size | Price | Category |');
  report.push('|----|-------|------|-------|----------|');
  for (const m of members) {
    const sizeStr = m.sizes ? m.sizes.map(s => s.matched).join(', ') : '(none)';
    report.push(`| ${m.id} | ${m.title} | ${sizeStr} | ${m.price || '-'} | ${m.category} |`);
  }
  report.push('');
}

// == SECTION 4: Truly standalone orphans ==
const standaloneOrphans = orphansWithoutSizes.filter(o => {
  const normTitle = normalize(o.title);
  return !orphanFamilies[normTitle];
});

report.push('---');
report.push('## 4. Truly Standalone Orphans (No Size, No Family)');
report.push(`**${standaloneOrphans.length} orphans** have no size pattern and don't share a base name with other orphans.`);
report.push('');
report.push('| ID | Title | SKU | Price | Category | Flags |');
report.push('|----|-------|-----|-------|----------|-------|');
for (const o of standaloneOrphans) {
  report.push(`| ${o.id} | ${o.title} | ${o.sku} | ${o.price || '-'} | ${o.category} | ${o.flags} |`);
}

const reportText = report.join('\n');
const outPath = path.join(__dirname, '..', 'reports', 'orphan_variant_analysis.md');
fs.writeFileSync(outPath, reportText, 'utf-8');
console.log(`Report written to ${outPath}`);
console.log(`\n=== SUMMARY ===`);
console.log(`Parents: ${parents.length}`);
console.log(`Orphans: ${orphans.length}`);
console.log(`With size patterns: ${orphansWithSizes.length}`);
console.log(`Matched to parent: ${matched.length}`);
console.log(`Unmatched (size, no parent): ${unmatched.length}`);
console.log(`Orphan families: ${Object.keys(orphanFamilies).length}`);
console.log(`Truly standalone: ${standaloneOrphans.length}`);
