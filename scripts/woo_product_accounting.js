/**
 * WooCommerce Full Product Accounting Report
 * 
 * Creates a complete inventory of ALL products showing:
 * - Current state (has weight, dimensions, images, descriptions)
 * - What can be fixed from enriched data
 * - What needs manual entry
 * - Category breakdown
 * 
 * Usage:
 *   node scripts/woo_product_accounting.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs', 'woo_updates');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// Parse CSV with proper quote handling
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && (i === 0 || content[i-1] !== '\\')) inQuotes = !inQuotes;
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
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function normalizeHandle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractBaseProductSlug(productName) {
  if (!productName) return '';
  const sizePatterns = [
    /\s+qt$/i, /\s+gal$/i, /\s+\d+\.?\d*\s*gal$/i, /\s+\d+\.?\d*\s*l$/i,
    /\s+\d+\.?\d*\s*ml$/i, /\s+\d+\.?\d*\s*oz$/i, /\s+\d+\.?\d*\s*lb$/i,
    /\s+\d+\s*in\.?$/i, /\s+-\s+\d+.*$/i, /\s+\(\d+.*\)$/i,
    /\s+\d+\s*x\s*\d+.*$/i, /\s+\d+\s*pack$/i, /\s+case.*$/i,
  ];
  let baseName = productName;
  for (const pattern of sizePatterns) baseName = baseName.replace(pattern, '');
  return normalizeHandle(baseName.trim());
}

function getSlugVariations(slug) {
  const variations = [slug];
  if (slug.endsWith('s')) variations.push(slug.slice(0, -1));
  else variations.push(slug + 's');
  return variations;
}

function extractCategory(catString) {
  if (!catString) return 'Uncategorized';
  const decoded = catString.replace(/&amp;/g, '&');
  const parts = decoded.split('>').map(p => p.trim());
  return parts[0] || 'Uncategorized';
}

function findEnrichedMatch(wooProduct, enrichedByHandle) {
  const slug = normalizeHandle(wooProduct['Slug'] || '');
  if (enrichedByHandle[slug]) return enrichedByHandle[slug];
  for (const v of getSlugVariations(slug)) if (enrichedByHandle[v]) return enrichedByHandle[v];
  const titleSlug = normalizeHandle(wooProduct['Product Name'] || '');
  if (enrichedByHandle[titleSlug]) return enrichedByHandle[titleSlug];
  const baseName = extractBaseProductSlug(wooProduct['Product Name'] || '');
  if (baseName && enrichedByHandle[baseName]) return enrichedByHandle[baseName];
  for (const v of getSlugVariations(baseName)) if (enrichedByHandle[v]) return enrichedByHandle[v];
  return null;
}

function gramsToLbs(grams) {
  if (!grams || isNaN(grams)) return 0;
  return parseFloat((parseFloat(grams) / 453.592).toFixed(2));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 WOOCOMMERCE FULL PRODUCT ACCOUNTING');
  console.log('='.repeat(70));
  
  // Load data
  const wooPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  const shopifyPath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import.csv');
  
  const woo = parseCSV(fs.readFileSync(wooPath, 'utf-8'));
  const shopify = parseCSV(fs.readFileSync(shopifyPath, 'utf-8'));
  
  // Build enriched lookup
  const enrichedByHandle = {};
  for (const row of shopify.rows) {
    if (!row['Title'] || !row['Title'].trim()) continue;
    const handle = normalizeHandle(row['Handle'] || '');
    enrichedByHandle[handle] = row;
  }
  
  console.log(`\n📂 Data loaded:`);
  console.log(`   WooCommerce products: ${woo.rows.length}`);
  console.log(`   Enriched products: ${Object.keys(enrichedByHandle).length}`);
  
  // Analyze each product
  const products = [];
  const categories = {};
  
  for (const row of woo.rows) {
    const type = row['Type'] || '';
    if (!['simple', 'grouped', 'variable'].includes(type)) continue;
    
    const enriched = findEnrichedMatch(row, enrichedByHandle);
    const cat = extractCategory(row['Product categories']);
    
    const product = {
      id: row['ID'],
      name: row['Product Name'],
      slug: row['Slug'],
      type: row['Type'],
      category: cat,
      // Current state
      hasWeight: parseFloat(row['Weight']) > 0,
      hasLength: parseFloat(row['Length']) > 0,
      hasWidth: parseFloat(row['Width']) > 0,
      hasHeight: parseFloat(row['Height']) > 0,
      hasDescription: (row['Product description'] || '').trim().length > 50,
      hasImage: (row['Images'] || '').trim().length > 0,
      currentWeight: parseFloat(row['Weight']) || 0,
      // Enriched data available
      matched: !!enriched,
      enrichedWeight: enriched ? gramsToLbs(enriched['Variant Grams']) : 0,
      enrichedDesc: enriched ? (enriched['Body (HTML)'] || '').length > 0 : false,
      enrichedImage: enriched ? (enriched['Image Src'] || '').startsWith('http') : false,
      // Fix status
      canFixWeight: !parseFloat(row['Weight']) && enriched && gramsToLbs(enriched['Variant Grams']) > 0,
      canFixDesc: !(row['Product description'] || '').trim() && enriched && (enriched['Body (HTML)'] || '').trim().length > 0,
      canFixImage: !(row['Images'] || '').trim() && enriched && (enriched['Image Src'] || '').startsWith('http'),
    };
    
    products.push(product);
    
    // Category stats
    if (!categories[cat]) {
      categories[cat] = {
        total: 0,
        matched: 0,
        hasWeight: 0,
        hasDimensions: 0,
        hasDescription: 0,
        hasImage: 0,
        needsWeight: 0,
        canFixWeight: 0,
        canFixDesc: 0,
        canFixImage: 0
      };
    }
    
    const c = categories[cat];
    c.total++;
    if (product.matched) c.matched++;
    if (product.hasWeight) c.hasWeight++;
    if (product.hasLength && product.hasWidth && product.hasHeight) c.hasDimensions++;
    if (product.hasDescription) c.hasDescription++;
    if (product.hasImage) c.hasImage++;
    if (!product.hasWeight) c.needsWeight++;
    if (product.canFixWeight) c.canFixWeight++;
    if (product.canFixDesc) c.canFixDesc++;
    if (product.canFixImage) c.canFixImage++;
  }
  
  // Overall stats
  const totals = {
    total: products.length,
    matched: products.filter(p => p.matched).length,
    hasWeight: products.filter(p => p.hasWeight).length,
    hasDimensions: products.filter(p => p.hasLength && p.hasWidth && p.hasHeight).length,
    hasDescription: products.filter(p => p.hasDescription).length,
    hasImage: products.filter(p => p.hasImage).length,
    canFixWeight: products.filter(p => p.canFixWeight).length,
    canFixDesc: products.filter(p => p.canFixDesc).length,
    canFixImage: products.filter(p => p.canFixImage).length,
  };
  
  console.log('\n' + '='.repeat(70));
  console.log('📈 OVERALL SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  Total Products: ${totals.total}
  
  CURRENT STATE:
  ├─ ✅ Matched to enriched data: ${totals.matched} (${Math.round(totals.matched/totals.total*100)}%)
  ├─ ⚖️  Has weight: ${totals.hasWeight} (${Math.round(totals.hasWeight/totals.total*100)}%)
  ├─ 📐 Has dimensions: ${totals.hasDimensions} (${Math.round(totals.hasDimensions/totals.total*100)}%)
  ├─ 📝 Has description: ${totals.hasDescription} (${Math.round(totals.hasDescription/totals.total*100)}%)
  └─ 🖼️  Has image: ${totals.hasImage} (${Math.round(totals.hasImage/totals.total*100)}%)
  
  CAN FIX FROM ENRICHED DATA:
  ├─ ⚖️  Weight: ${totals.canFixWeight} products
  ├─ 📝 Description: ${totals.canFixDesc} products
  └─ 🖼️  Images: ${totals.canFixImage} products
  
  NEEDS MANUAL ENTRY:
  ├─ ⚖️  Weight: ${totals.total - totals.hasWeight - totals.canFixWeight} products
  └─ 📐 Dimensions: ${totals.total - totals.hasDimensions} products
`);
  
  console.log('='.repeat(70));
  console.log('📋 BY CATEGORY');
  console.log('='.repeat(70));
  console.log('\n| Category | Total | Matched | Has Wt | Has Dim | Can Fix Wt |');
  console.log('|----------|-------|---------|--------|---------|------------|');
  
  const sortedCats = Object.entries(categories).sort((a, b) => b[1].total - a[1].total);
  
  for (const [cat, stats] of sortedCats) {
    console.log(`| ${cat.substring(0, 25).padEnd(25)} | ${String(stats.total).padStart(5)} | ${String(stats.matched).padStart(7)} | ${String(stats.hasWeight).padStart(6)} | ${String(stats.hasDimensions).padStart(7)} | ${String(stats.canFixWeight).padStart(10)} |`);
  }
  
  // Products needing manual weight entry
  const needsManualWeight = products.filter(p => !p.hasWeight && !p.canFixWeight);
  
  console.log('\n' + '='.repeat(70));
  console.log(`⚠️  PRODUCTS NEEDING MANUAL WEIGHT ENTRY: ${needsManualWeight.length}`);
  console.log('='.repeat(70));
  
  // Group by category
  const manualByCategory = {};
  for (const p of needsManualWeight) {
    manualByCategory[p.category] = manualByCategory[p.category] || [];
    manualByCategory[p.category].push(p);
  }
  
  for (const [cat, items] of Object.entries(manualByCategory).sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`\n  ${cat}: ${items.length} products`);
    for (const p of items.slice(0, 3)) {
      console.log(`    - [${p.id}] ${p.name.substring(0, 50)}`);
    }
    if (items.length > 3) console.log(`    ... and ${items.length - 3} more`);
  }
  
  // Save detailed report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: totals,
    categories: categories,
    products: products,
    needsManualWeight: needsManualWeight.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type
    }))
  };
  
  const reportPath = path.join(OUTPUTS_DIR, 'full_product_accounting.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Create CSV for manual weight entry
  const manualWeightCSV = 'ID,Product Name,Category,Type,Current Weight,Enter Weight (lbs),Enter Length,Enter Width,Enter Height\n' +
    needsManualWeight.map(p => 
      `${p.id},"${p.name.replace(/"/g, '""')}","${p.category}",${p.type},${p.currentWeight},,,,`
    ).join('\n');
  
  const manualWeightPath = path.join(OUTPUTS_DIR, 'manual_weight_entry_template.csv');
  fs.writeFileSync(manualWeightPath, manualWeightCSV);
  
  console.log('\n' + '='.repeat(70));
  console.log('📄 FILES GENERATED:');
  console.log('='.repeat(70));
  console.log(`  📊 Full report: outputs/woo_updates/full_product_accounting.json`);
  console.log(`  📝 Manual entry template: outputs/woo_updates/manual_weight_entry_template.csv`);
  console.log('\n  Use the template CSV to fill in weights manually, then import to WooCommerce.');
  console.log('='.repeat(70));
}

main().catch(console.error);
