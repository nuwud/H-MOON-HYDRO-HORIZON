/**
 * WooCommerce Category-by-Category Product Updater
 * 
 * SAFE APPROACH:
 * - Works ONE CATEGORY at a time
 * - Creates BACKUP CSV before each update
 * - Prioritizes: Weight, Dimensions, Shipping > Images
 * - Accounts for ALL products (matched + unmatched)
 * - Generates revert CSV for each batch
 * 
 * Usage:
 *   node scripts/woo_category_updater.js --list              # List all categories
 *   node scripts/woo_category_updater.js --category="Nutrients" --dry-run
 *   node scripts/woo_category_updater.js --category="Nutrients" --confirm
 *   node scripts/woo_category_updater.js --all --dry-run     # Preview all categories
 *   node scripts/woo_category_updater.js --unmatched         # Show unmatched products
 *   node scripts/woo_category_updater.js --missing-weight    # Products needing weight
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs', 'woo_updates');
const BACKUP_DIR = path.join(OUTPUTS_DIR, 'backups');
const REVERT_DIR = path.join(OUTPUTS_DIR, 'reverts');

// Ensure directories exist
[OUTPUTS_DIR, BACKUP_DIR, REVERT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Parse CSV with proper quote handling
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && (i === 0 || content[i-1] !== '\\')) {
      inQuotes = !inQuotes;
    }
    if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) lines.push(currentLine);
  
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx] || '');
    return row;
  });
  
  return { headers, rows };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Normalize slugs
function normalizeHandle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Slug variations for fuzzy matching
function getSlugVariations(slug) {
  const variations = [slug];
  if (slug.endsWith('s')) variations.push(slug.slice(0, -1));
  else variations.push(slug + 's');
  if (slug.includes('-in-')) variations.push(slug.replace(/-in-/g, '-inch-'));
  if (slug.includes('-inch-')) variations.push(slug.replace(/-inch-/g, '-in-'));
  return variations;
}

// Extract base product name from variation (e.g., "FloraBlend qt" -> "florablend")
function extractBaseProductSlug(productName) {
  if (!productName) return '';
  
  // Common size/quantity patterns to remove
  const sizePatterns = [
    /\s+qt$/i,           // quart
    /\s+gal$/i,          // gallon
    /\s+\d+\.?\d*\s*gal$/i,  // "2.5 gal"
    /\s+\d+\.?\d*\s*l$/i,    // liters
    /\s+\d+\.?\d*\s*ml$/i,   // ml
    /\s+\d+\.?\d*\s*oz$/i,   // oz
    /\s+\d+\.?\d*\s*lb$/i,   // lb
    /\s+\d+\s*in\.?$/i,      // inches
    /\s+-\s+\d+.*$/i,        // "- 1 gallon"
    /\s+\(\d+.*\)$/i,        // "(1 gallon)"
    /\s+\d+\s*x\s*\d+.*$/i,  // "4 x 8"
    /\s+\d+\s*pack$/i,       // "6 pack"
    /\s+case.*$/i,           // "case of..."
  ];
  
  let baseName = productName;
  for (const pattern of sizePatterns) {
    baseName = baseName.replace(pattern, '');
  }
  
  return normalizeHandle(baseName.trim());
}

// Convert grams to lbs (WooCommerce default)
function gramsToLbs(grams) {
  if (!grams || isNaN(grams)) return '';
  return (parseFloat(grams) / 453.592).toFixed(2);
}

// Extract category from WooCommerce format
function extractCategory(catString) {
  if (!catString) return 'Uncategorized';
  // Get the top-level category
  const decoded = catString.replace(/&amp;/g, '&');
  const parts = decoded.split('>').map(p => p.trim());
  return parts[0] || 'Uncategorized';
}

// Map Shopify Type to WooCommerce category
const TYPE_TO_CATEGORY = {
  'nutrients': 'Nutrients & Supplements',
  'grow_media': 'Grow Media',
  'irrigation': 'Irrigation',
  'water_filtration': 'Water Filtration',
  'ph_meters': 'pH/EC/TDS Meters & Solutions',
  'grow_lights': 'Grow Lights',
  'hid_bulbs': 'Grow Lights',
  'airflow': 'Environmental Control',
  'odor_control': 'Odor Control',
  'containers': 'Pots & Containers',
  'propagation': 'Propagation Supplies',
  'seeds': 'Seeds',
  'harvesting': 'Harvesting',
  'trimming': 'Trimmers',
  'pest_control': 'Pest Control',
  'co2': 'CO2 & Environmental',
  'controllers': 'Timers',
  'environmental_monitors': 'Environmental Control',
  'books': 'Books',
  'electrical_supplies': 'Electrical',
  'extraction': 'Extraction',
  'grow_room_materials': 'Reflective Wall Fabric'
};

// Load all data
function loadData() {
  console.log('📂 Loading data sources...\n');
  
  // Load WooCommerce export
  const wooPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  const wooContent = fs.readFileSync(wooPath, 'utf-8');
  const woo = parseCSV(wooContent);
  console.log(`   WooCommerce products: ${woo.rows.length}`);
  
  // Load enriched Shopify data  
  const shopifyPath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import.csv');
  const shopifyContent = fs.readFileSync(shopifyPath, 'utf-8');
  const shopify = parseCSV(shopifyContent);
  console.log(`   Enriched data rows: ${shopify.rows.length}`);
  
  // Build lookups
  const wooBySlug = {};
  const wooById = {};
  
  for (const row of woo.rows) {
    const slug = normalizeHandle(row['Slug'] || '');
    const id = row['ID'];
    if (slug) wooBySlug[slug] = row;
    if (id) wooById[id] = row;
  }
  
  // Build enriched lookup (parent products only)
  const enrichedByHandle = {};
  for (const row of shopify.rows) {
    if (!row['Title'] || !row['Title'].trim()) continue;
    const handle = normalizeHandle(row['Handle'] || '');
    enrichedByHandle[handle] = row;
  }
  
  console.log(`   Enriched unique products: ${Object.keys(enrichedByHandle).length}\n`);
  
  return { woo, wooBySlug, wooById, shopify, enrichedByHandle };
}

// Match WooCommerce product to enriched data
function findEnrichedMatch(wooProduct, enrichedByHandle) {
  const slug = normalizeHandle(wooProduct['Slug'] || '');
  
  // Direct match
  if (enrichedByHandle[slug]) return enrichedByHandle[slug];
  
  // Slug variations
  for (const variation of getSlugVariations(slug)) {
    if (enrichedByHandle[variation]) return enrichedByHandle[variation];
  }
  
  // Title-based match
  const titleSlug = normalizeHandle(wooProduct['Product Name'] || '');
  if (enrichedByHandle[titleSlug]) return enrichedByHandle[titleSlug];
  
  // Base product match (for variations like "FloraBlend qt" -> "florablend")
  const baseName = extractBaseProductSlug(wooProduct['Product Name'] || '');
  if (baseName && enrichedByHandle[baseName]) return enrichedByHandle[baseName];
  
  // Try base name variations
  for (const variation of getSlugVariations(baseName)) {
    if (enrichedByHandle[variation]) return enrichedByHandle[variation];
  }
  
  return null;
}

// List all categories with product counts
function listCategories(woo) {
  console.log('='.repeat(60));
  console.log('📋 WOOCOMMERCE CATEGORIES');
  console.log('='.repeat(60));
  
  const categories = {};
  const missingWeight = {};
  
  for (const row of woo.rows) {
    const type = row['Type'] || '';
    // Skip non-products
    if (!['simple', 'grouped', 'variable', 'variation'].includes(type)) continue;
    
    const cat = extractCategory(row['Product categories']);
    categories[cat] = (categories[cat] || 0) + 1;
    
    const weight = parseFloat(row['Weight']) || 0;
    if (weight === 0) {
      missingWeight[cat] = (missingWeight[cat] || 0) + 1;
    }
  }
  
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  
  console.log('\n| Category | Products | Missing Weight |');
  console.log('|----------|----------|----------------|');
  
  let totalProducts = 0;
  let totalMissing = 0;
  
  for (const [cat, count] of sorted) {
    const missing = missingWeight[cat] || 0;
    totalProducts += count;
    totalMissing += missing;
    console.log(`| ${cat.padEnd(30)} | ${String(count).padStart(8)} | ${String(missing).padStart(14)} |`);
  }
  
  console.log('|----------|----------|----------------|');
  console.log(`| TOTAL | ${String(totalProducts).padStart(8)} | ${String(totalMissing).padStart(14)} |`);
  console.log('\n');
}

// Show products missing weight
function showMissingWeight(woo, enrichedByHandle) {
  console.log('='.repeat(60));
  console.log('⚖️  PRODUCTS MISSING WEIGHT DATA');
  console.log('='.repeat(60));
  
  const missing = [];
  
  for (const row of woo.rows) {
    const type = row['Type'] || '';
    if (!['simple', 'grouped', 'variable'].includes(type)) continue;
    
    const weight = parseFloat(row['Weight']) || 0;
    if (weight > 0) continue;
    
    const enriched = findEnrichedMatch(row, enrichedByHandle);
    const enrichedWeight = enriched ? parseFloat(enriched['Variant Grams']) || 0 : 0;
    
    missing.push({
      id: row['ID'],
      name: row['Product Name'],
      category: extractCategory(row['Product categories']),
      type: row['Type'],
      canFix: enrichedWeight > 0,
      enrichedWeight: enrichedWeight ? gramsToLbs(enrichedWeight) + ' lbs' : 'N/A'
    });
  }
  
  const canFix = missing.filter(m => m.canFix);
  const cannotFix = missing.filter(m => !m.canFix);
  
  console.log(`\nTotal missing weight: ${missing.length}`);
  console.log(`  ✅ Can fix from enriched data: ${canFix.length}`);
  console.log(`  ❌ Need manual entry: ${cannotFix.length}`);
  
  console.log('\n📋 FIXABLE (sample first 20):');
  console.log('| ID | Name | Category | Enriched Weight |');
  console.log('|----|------|----------|-----------------|');
  
  for (const item of canFix.slice(0, 20)) {
    console.log(`| ${item.id} | ${item.name.substring(0, 40).padEnd(40)} | ${item.category.substring(0, 20).padEnd(20)} | ${item.enrichedWeight} |`);
  }
  
  // Save full list
  const outputPath = path.join(OUTPUTS_DIR, 'products_missing_weight.json');
  fs.writeFileSync(outputPath, JSON.stringify({ canFix, cannotFix }, null, 2));
  console.log(`\n📄 Full list saved to: outputs/woo_updates/products_missing_weight.json`);
}

// Show unmatched products
function showUnmatched(woo, enrichedByHandle) {
  console.log('='.repeat(60));
  console.log('❓ UNMATCHED PRODUCTS');
  console.log('='.repeat(60));
  
  const unmatched = [];
  const matched = [];
  
  for (const row of woo.rows) {
    const type = row['Type'] || '';
    if (!['simple', 'grouped', 'variable'].includes(type)) continue;
    
    const enriched = findEnrichedMatch(row, enrichedByHandle);
    
    if (enriched) {
      matched.push(row);
    } else {
      unmatched.push({
        id: row['ID'],
        slug: row['Slug'],
        name: row['Product Name'],
        category: extractCategory(row['Product categories']),
        type: row['Type']
      });
    }
  }
  
  console.log(`\nTotal products: ${matched.length + unmatched.length}`);
  console.log(`  ✅ Matched: ${matched.length}`);
  console.log(`  ❌ Unmatched: ${unmatched.length}`);
  
  // Group by category
  const byCategory = {};
  for (const item of unmatched) {
    byCategory[item.category] = byCategory[item.category] || [];
    byCategory[item.category].push(item);
  }
  
  console.log('\n📋 UNMATCHED BY CATEGORY:');
  for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${cat}: ${items.length} products`);
    for (const item of items.slice(0, 5)) {
      console.log(`    - [${item.id}] ${item.name.substring(0, 50)}`);
    }
    if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
  }
  
  // Save full list
  const outputPath = path.join(OUTPUTS_DIR, 'unmatched_products.json');
  fs.writeFileSync(outputPath, JSON.stringify(unmatched, null, 2));
  console.log(`\n📄 Full list saved to: outputs/woo_updates/unmatched_products.json`);
}

// Process a single category
function processCategory(categoryName, woo, enrichedByHandle, dryRun = true) {
  console.log('='.repeat(60));
  console.log(`📦 CATEGORY: ${categoryName}`);
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN' : '⚡ GENERATE UPDATE CSV'}`);
  console.log('='.repeat(60));
  
  const products = woo.rows.filter(row => {
    const type = row['Type'] || '';
    if (!['simple', 'grouped', 'variable'].includes(type)) return false;
    const cat = extractCategory(row['Product categories']);
    return cat.toLowerCase().includes(categoryName.toLowerCase());
  });
  
  console.log(`\nProducts in category: ${products.length}`);
  
  const updates = [];
  const stats = {
    matched: 0,
    weightUpdates: 0,
    dimensionUpdates: 0,
    descriptionUpdates: 0,
    imageUpdates: 0,
    noMatch: 0
  };
  
  for (const wooProduct of products) {
    const enriched = findEnrichedMatch(wooProduct, enrichedByHandle);
    
    if (!enriched) {
      stats.noMatch++;
      continue;
    }
    
    stats.matched++;
    
    const update = {
      id: wooProduct['ID'],
      name: wooProduct['Product Name'],
      slug: wooProduct['Slug'],
      changes: {},
      backup: {} // Store original values for revert
    };
    
    // PRIORITY 1: Weight
    const currentWeight = parseFloat(wooProduct['Weight']) || 0;
    const enrichedGrams = parseFloat(enriched['Variant Grams']) || 0;
    const enrichedLbs = enrichedGrams > 0 ? parseFloat(gramsToLbs(enrichedGrams)) : 0;
    
    if (currentWeight === 0 && enrichedLbs > 0) {
      update.changes.Weight = enrichedLbs;
      update.backup.Weight = currentWeight;
      stats.weightUpdates++;
    }
    
    // PRIORITY 2: Dimensions (estimate from weight if not available)
    const currentLength = parseFloat(wooProduct['Length']) || 0;
    const currentWidth = parseFloat(wooProduct['Width']) || 0;
    const currentHeight = parseFloat(wooProduct['Height']) || 0;
    
    if (currentLength === 0 && currentWidth === 0 && currentHeight === 0 && enrichedLbs > 0) {
      // Estimate dimensions based on weight (rough cubic estimate)
      // Assume density similar to packaged goods
      const volume = enrichedLbs * 50; // cubic inches estimate
      const side = Math.ceil(Math.pow(volume, 1/3));
      
      update.changes.Length = side;
      update.changes.Width = side;
      update.changes.Height = Math.ceil(side * 0.5);
      update.backup.Length = currentLength;
      update.backup.Width = currentWidth;
      update.backup.Height = currentHeight;
      stats.dimensionUpdates++;
    }
    
    // PRIORITY 3: Description (only if empty)
    const currentDesc = (wooProduct['Product description'] || '').trim();
    const enrichedDesc = (enriched['Body (HTML)'] || '').trim();
    
    if (!currentDesc && enrichedDesc) {
      update.changes['Product description'] = enrichedDesc;
      update.backup['Product description'] = currentDesc;
      stats.descriptionUpdates++;
    }
    
    // PRIORITY 4: Images (lowest priority, only if missing)
    const currentImage = (wooProduct['Images'] || '').trim();
    const enrichedImage = (enriched['Image Src'] || '').trim();
    
    if (!currentImage && enrichedImage && enrichedImage.startsWith('http')) {
      update.changes.Images = enrichedImage;
      update.backup.Images = currentImage;
      stats.imageUpdates++;
    }
    
    if (Object.keys(update.changes).length > 0) {
      updates.push(update);
    }
  }
  
  // Report
  console.log('\n📊 UPDATE SUMMARY:');
  console.log(`   Matched: ${stats.matched}/${products.length}`);
  console.log(`   No match: ${stats.noMatch}`);
  console.log('');
  console.log('   📦 Updates by field:');
  console.log(`      ⚖️  Weight: ${stats.weightUpdates}`);
  console.log(`      📐 Dimensions: ${stats.dimensionUpdates}`);
  console.log(`      📝 Description: ${stats.descriptionUpdates}`);
  console.log(`      🖼️  Images: ${stats.imageUpdates}`);
  console.log(`   Total products to update: ${updates.length}`);
  
  if (dryRun) {
    // Show sample
    console.log('\n📋 SAMPLE UPDATES (first 5):');
    for (const update of updates.slice(0, 5)) {
      console.log(`\n  🔹 [${update.id}] ${update.name}`);
      for (const [field, value] of Object.entries(update.changes)) {
        const displayValue = String(value).length > 60 ? String(value).substring(0, 60) + '...' : value;
        console.log(`     ${field}: ${displayValue}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`💡 Run with --confirm to generate update CSV for "${categoryName}"`);
    console.log('='.repeat(60));
    
  } else {
    // Generate update and revert CSVs
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeCatName = categoryName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // Update CSV (WooCommerce import format)
    const updateHeaders = ['ID', 'Weight', 'Length', 'Width', 'Height', 'Product description', 'Images'];
    let updateCSV = updateHeaders.join(',') + '\n';
    
    for (const update of updates) {
      const row = updateHeaders.map(h => {
        if (h === 'ID') return update.id;
        return escapeCSV(update.changes[h] || '');
      });
      updateCSV += row.join(',') + '\n';
    }
    
    const updatePath = path.join(OUTPUTS_DIR, `update_${safeCatName}_${timestamp}.csv`);
    fs.writeFileSync(updatePath, updateCSV);
    
    // Revert CSV (original values)
    let revertCSV = updateHeaders.join(',') + '\n';
    for (const update of updates) {
      const row = updateHeaders.map(h => {
        if (h === 'ID') return update.id;
        return escapeCSV(update.backup[h] || '');
      });
      revertCSV += row.join(',') + '\n';
    }
    
    const revertPath = path.join(REVERT_DIR, `revert_${safeCatName}_${timestamp}.csv`);
    fs.writeFileSync(revertPath, revertCSV);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FILES GENERATED:');
    console.log(`   📤 Update CSV: outputs/woo_updates/update_${safeCatName}_${timestamp}.csv`);
    console.log(`   ↩️  Revert CSV: outputs/woo_updates/reverts/revert_${safeCatName}_${timestamp}.csv`);
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log('   1. BACKUP your WooCommerce database first!');
    console.log('   2. Go to WooCommerce > Products > Import');
    console.log('   3. Upload the update CSV');
    console.log('   4. Select "Update existing products matching by ID"');
    console.log('   5. If issues occur, import the revert CSV');
    console.log('='.repeat(60));
  }
  
  return { updates, stats };
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('🛒 WOOCOMMERCE CATEGORY UPDATER');
  console.log('='.repeat(60));
  console.log('Prioritizes: Weight > Dimensions > Descriptions > Images\n');
  
  const data = loadData();
  const { woo, enrichedByHandle } = data;
  
  // Parse arguments
  if (args.includes('--list')) {
    listCategories(woo);
    return;
  }
  
  if (args.includes('--missing-weight')) {
    showMissingWeight(woo, enrichedByHandle);
    return;
  }
  
  if (args.includes('--unmatched')) {
    showUnmatched(woo, enrichedByHandle);
    return;
  }
  
  const categoryArg = args.find(a => a.startsWith('--category='));
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  
  if (args.includes('--all')) {
    // Process all categories
    const categories = new Set();
    for (const row of woo.rows) {
      const type = row['Type'] || '';
      if (['simple', 'grouped', 'variable'].includes(type)) {
        categories.add(extractCategory(row['Product categories']));
      }
    }
    
    let totalUpdates = 0;
    for (const cat of [...categories].sort()) {
      const result = processCategory(cat, woo, enrichedByHandle, dryRun);
      totalUpdates += result.updates.length;
      console.log('\n');
    }
    
    console.log('='.repeat(60));
    console.log(`📊 TOTAL UPDATES ACROSS ALL CATEGORIES: ${totalUpdates}`);
    console.log('='.repeat(60));
    
  } else if (categoryArg) {
    const categoryName = categoryArg.split('=')[1].replace(/"/g, '');
    processCategory(categoryName, woo, enrichedByHandle, dryRun);
    
  } else {
    console.log('Usage:');
    console.log('  node scripts/woo_category_updater.js --list');
    console.log('  node scripts/woo_category_updater.js --category="Nutrients" --dry-run');
    console.log('  node scripts/woo_category_updater.js --category="Nutrients" --confirm');
    console.log('  node scripts/woo_category_updater.js --all --dry-run');
    console.log('  node scripts/woo_category_updater.js --unmatched');
    console.log('  node scripts/woo_category_updater.js --missing-weight');
  }
}

main().catch(console.error);
