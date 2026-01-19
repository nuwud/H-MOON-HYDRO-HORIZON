/**
 * Smart Weight Finder & Estimator for WooCommerce Products
 * 
 * SOURCES (in priority order):
 * 1. POS Inventory data (CSVs/HMoonHydro_Inventory.csv)
 * 2. Product name parsing (extract size indicators)
 * 3. Child product weights (for grouped products)
 * 4. Category-based estimation
 * 5. Online lookup (manufacturer websites)
 * 
 * Usage:
 *   node scripts/smart_weight_finder.js --dry-run    # Preview estimates
 *   node scripts/smart_weight_finder.js --confirm    # Generate update CSV
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs', 'woo_updates');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// === CSV PARSING ===
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && (i === 0 || content[i-1] !== '\\')) inQuotes = !inQuotes;
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else if (char !== '\r') {
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

// === WEIGHT ESTIMATION LOGIC ===

// Standard weights for liquid nutrients (water-based, ~8.34 lbs/gallon)
const LIQUID_WEIGHTS = {
  'ml': 0.0022,      // 1ml = 0.0022 lbs
  'oz': 0.065,       // 1 fl oz = 0.065 lbs
  'pt': 1.04,        // 1 pint = 1.04 lbs
  'qt': 2.09,        // 1 quart = 2.09 lbs
  'quart': 2.09,
  'l': 2.2,          // 1 liter = 2.2 lbs
  'liter': 2.2,
  'litre': 2.2,
  'gal': 8.5,        // 1 gallon = 8.5 lbs (with container)
  'gallon': 8.5,
};

// Standard container weights to add
const CONTAINER_WEIGHTS = {
  'ml': 0.05,        // Small bottle
  'oz': 0.1,         // Small bottle
  'pt': 0.2,         // Pint bottle
  'qt': 0.3,         // Quart bottle
  'l': 0.3,          // Liter bottle
  'gal': 0.5,        // Gallon jug
  '2.5gal': 0.8,     // 2.5 gallon jug
  '5gal': 2.0,       // 5 gallon bucket
  '6gal': 2.5,       // 6 gallon bucket
  '10gal': 4.0,      // 10 gallon container
};

// Powder/dry product weights (lighter than liquids)
const DRY_WEIGHTS = {
  'oz': 0.0625,      // 1 oz dry weight
  'lb': 1.0,
  'lbs': 1.0,
  'kg': 2.2,
  'g': 0.0022,
};

// Category-based default weights (for items without size indicators)
const CATEGORY_DEFAULTS = {
  'Nutrients & Supplements': { weight: 3.0, note: 'Default nutrient bottle (qt)' },
  'pH/EC/TDS Meters & Solutions': { weight: 0.5, note: 'Average meter/solution' },
  'Grow Lights Ballast': { weight: 15.0, note: 'Average ballast/reflector' },
  'Air Filtration': { weight: 8.0, note: 'Average filter' },
  'Environmental Control': { weight: 5.0, note: 'Average fan/controller' },
  'Propagation Supplies': { weight: 1.0, note: 'Average tray/dome' },
  'Pest Control': { weight: 1.5, note: 'Average spray bottle' },
  'Odor Control': { weight: 2.0, note: 'Average gel/spray' },
  'Pots & Containers': { weight: 0.5, note: 'Average pot (varies by size)' },
  'Books': { weight: 1.5, note: 'Average book' },
  'Timers': { weight: 0.5, note: 'Average timer' },
  'Fittings & Parts': { weight: 0.25, note: 'Average fitting' },
  'Water Filtration': { weight: 3.0, note: 'Average filter system' },
  'Trimmers': { weight: 10.0, note: 'Average trimmer' },
  'Water Pumps': { weight: 2.0, note: 'Average pump' },
  'Growing Medium': { weight: 25.0, note: 'Average bag (cu ft)' },
  'Cannabis Seeds': { weight: 0.1, note: 'Seed packet' },
  'Philips': { weight: 0.5, note: 'Average bulb' },
  'default': { weight: 2.0, note: 'Generic default' }
};

// Parse size from product name
function extractSizeFromName(name) {
  if (!name || typeof name !== 'string') return null;
  
  const nameLower = name.toLowerCase();
  
  // Pattern matches for various size formats
  const patterns = [
    // Gallons: "2.5 gal", "1 gallon", "5-gal", etc.
    /(\d+\.?\d*)\s*[-]?\s*(gal(?:lon)?s?)\b/i,
    // Liters: "1 l", "1 liter", "500ml", etc.
    /(\d+\.?\d*)\s*[-]?\s*(l(?:iter|itre)?s?|ml)\b/i,
    // Quarts: "1 qt", "1 quart"
    /(\d+\.?\d*)\s*[-]?\s*(qt|quart)s?\b/i,
    // Pints: "1 pt", "1 pint"
    /(\d+\.?\d*)\s*[-]?\s*(pt|pint)s?\b/i,
    // Ounces: "8 oz", "16oz", "32 fl oz"
    /(\d+\.?\d*)\s*[-]?\s*(?:fl\.?\s*)?(oz|ounce)s?\b/i,
    // Pounds: "5 lb", "22 lbs", "2.2lb"
    /(\d+\.?\d*)\s*[-]?\s*(lb|lbs|pound)s?\b/i,
    // Kilograms: "1 kg", "2.2kg"
    /(\d+\.?\d*)\s*[-]?\s*(kg|kilogram)s?\b/i,
    // Grams: "100g", "500 grams"
    /(\d+\.?\d*)\s*[-]?\s*(g(?:ram)?s?)\b(?!\s*al)/i,  // negative lookahead to avoid "gal"
    // Cubic feet: "1.5 cu ft", "2 cubic feet"
    /(\d+\.?\d*)\s*(?:cu\.?|cubic)\s*(ft\.?|feet|foot)\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = nameLower.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        value: parseFloat(match[1]),
        unit: match[2].toLowerCase().replace(/s$/, '')
      };
    }
  }
  
  // Check for common shorthand in product names
  if (nameLower.includes(' qt') || nameLower.endsWith(' qt')) return { value: 1, unit: 'qt' };
  if (nameLower.includes(' gal') || nameLower.endsWith(' gal')) return { value: 1, unit: 'gal' };
  if (nameLower.includes(' pint') || nameLower.endsWith(' pt')) return { value: 1, unit: 'pt' };
  
  return null;
}

// Determine if product is liquid or dry
function isLiquidProduct(name, category) {
  const nameLower = (name || '').toLowerCase();
  const catLower = (category || '').toLowerCase();
  
  // Dry product indicators
  const dryIndicators = ['powder', 'granular', 'dry', 'pellet', 'crystal', 'seed', 'book', 'meter', 'timer', 'fan', 'filter', 'pot', 'container', 'tent', 'light', 'bulb', 'ballast', 'reflector'];
  
  for (const indicator of dryIndicators) {
    if (nameLower.includes(indicator) || catLower.includes(indicator)) {
      return false;
    }
  }
  
  // Liquid product indicators
  const liquidIndicators = ['nutrient', 'supplement', 'solution', 'liquid', 'flora', 'bloom', 'grow', 'hydro', 'organic', 'cal-mag', 'ph'];
  
  for (const indicator of liquidIndicators) {
    if (nameLower.includes(indicator) || catLower.includes(indicator)) {
      return true;
    }
  }
  
  // Default based on category
  if (catLower.includes('nutrient')) return true;
  if (catLower.includes('ph') && catLower.includes('solution')) return true;
  
  return false;
}

// Calculate weight from size
function calculateWeightFromSize(size, isLiquid, productName) {
  if (!size) return null;
  
  let unit = size.unit;
  let value = size.value;
  
  // Normalize units
  if (unit === 'liter' || unit === 'litre') unit = 'l';
  if (unit === 'gallon') unit = 'gal';
  if (unit === 'quart') unit = 'qt';
  if (unit === 'pint') unit = 'pt';
  if (unit === 'ounce') unit = 'oz';
  if (unit === 'pound') unit = 'lb';
  if (unit === 'gram') unit = 'g';
  if (unit === 'kilogram') unit = 'kg';
  
  // Handle cubic feet (grow media)
  if (unit === 'ft' || unit === 'feet' || unit === 'foot') {
    // 1 cubic foot of grow media ≈ 10-30 lbs depending on type
    return {
      weight: Math.round(value * 20 * 100) / 100,  // Estimate 20 lbs per cubic foot
      method: 'size_calculation',
      note: `${value} cu ft @ ~20 lbs/cu ft`
    };
  }
  
  // Calculate liquid or dry weight
  const weights = isLiquid ? LIQUID_WEIGHTS : DRY_WEIGHTS;
  const containerWeight = CONTAINER_WEIGHTS[unit] || 0.2;
  
  if (weights[unit]) {
    let productWeight = value * weights[unit];
    
    // Handle larger containers
    if (unit === 'gal' && value >= 2.5) {
      const containerKey = value >= 5 ? '5gal' : '2.5gal';
      productWeight += CONTAINER_WEIGHTS[containerKey] || 0.5;
    } else {
      productWeight += containerWeight;
    }
    
    return {
      weight: Math.round(productWeight * 100) / 100,
      method: 'size_calculation',
      note: `${value} ${unit} ${isLiquid ? 'liquid' : 'dry'} + container`
    };
  }
  
  return null;
}

// Load and index POS data
function loadPOSData() {
  const posPath = path.join(__dirname, '..', 'CSVs', 'HMoonHydro_Inventory.csv');
  if (!fs.existsSync(posPath)) return {};
  
  const content = fs.readFileSync(posPath, 'utf-8');
  const pos = parseCSV(content);
  
  const posByName = {};
  const posBySKU = {};
  
  for (const row of pos.rows) {
    const name = (row['Item Name'] || '').toLowerCase().trim();
    const sku = (row['Item Number'] || '').trim();
    const weight = parseFloat(row['Weight']) || 0;
    
    if (weight > 0) {
      if (name) posByName[name] = { weight, source: 'POS' };
      if (sku) posBySKU[sku] = { weight, source: 'POS' };
    }
  }
  
  return { posByName, posBySKU };
}

// Load WooCommerce data for child product lookups
function loadWooData() {
  const wooPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  const content = fs.readFileSync(wooPath, 'utf-8');
  return parseCSV(content);
}

// Find weight from child products (for grouped products)
function findChildWeight(parentId, wooRows) {
  // Find children that reference this parent
  const children = wooRows.filter(row => {
    const grouped = row['Grouped products'] || '';
    return grouped.includes(parentId) || 
           (row['Parent'] && row['Parent'] === parentId);
  });
  
  // Also find by similar name pattern
  const parent = wooRows.find(r => r['ID'] === parentId);
  if (parent) {
    const parentName = (parent['Product Name'] || '').toLowerCase();
    const nameMatches = wooRows.filter(row => {
      const childName = (row['Product Name'] || '').toLowerCase();
      const childWeight = parseFloat(row['Weight']) || 0;
      return childWeight > 0 && 
             childName.includes(parentName.split(' ')[0]) &&
             row['ID'] !== parentId;
    });
    
    if (nameMatches.length > 0) {
      // Return the most common weight among children
      const weights = nameMatches.map(r => parseFloat(r['Weight'])).filter(w => w > 0);
      if (weights.length > 0) {
        const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
        return {
          weight: Math.round(avgWeight * 100) / 100,
          method: 'child_average',
          note: `Average of ${weights.length} similar products`
        };
      }
    }
  }
  
  return null;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  
  console.log('\n' + '='.repeat(70));
  console.log('🔍 SMART WEIGHT FINDER & ESTIMATOR');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN (preview)' : '⚡ GENERATE UPDATE CSV'}`);
  console.log('\nSources:');
  console.log('  1. POS Inventory data');
  console.log('  2. Product name parsing (size indicators)');
  console.log('  3. Child product weights (for grouped products)');
  console.log('  4. Category-based estimation');
  console.log('');
  
  // Load data
  const { posByName, posBySKU } = loadPOSData();
  console.log(`📊 POS products with weight: ${Object.keys(posByName).length}`);
  
  const woo = loadWooData();
  console.log(`📊 WooCommerce products: ${woo.rows.length}`);
  
  // Load products needing weight
  const templatePath = path.join(OUTPUTS_DIR, 'manual_weight_entry_template.csv');
  const template = parseCSV(fs.readFileSync(templatePath, 'utf-8'));
  console.log(`📊 Products needing weight: ${template.rows.length}`);
  console.log('');
  
  // Process each product
  const results = [];
  const stats = {
    pos: 0,
    calculated: 0,
    childAverage: 0,
    categoryDefault: 0,
    noEstimate: 0
  };
  
  for (const row of template.rows) {
    const id = row['ID'];
    const name = row['Product Name'] || '';
    const category = row['Category'] || '';
    const type = row['Type'] || '';
    
    let estimate = null;
    
    // 1. Try POS lookup
    const nameLower = (name || '').toLowerCase().trim();
    if (posByName[nameLower]) {
      estimate = { ...posByName[nameLower], method: 'pos_lookup' };
      stats.pos++;
    }
    
    // 2. Try size extraction from name
    if (!estimate) {
      const size = extractSizeFromName(name);
      if (size) {
        const isLiquid = isLiquidProduct(name, category);
        const calc = calculateWeightFromSize(size, isLiquid, name);
        if (calc) {
          estimate = calc;
          stats.calculated++;
        }
      }
    }
    
    // 3. Try child product weight (for grouped products)
    if (!estimate && type === 'grouped') {
      const childWeight = findChildWeight(id, woo.rows);
      if (childWeight) {
        estimate = childWeight;
        stats.childAverage++;
      }
    }
    
    // 4. Category-based default
    if (!estimate) {
      const catDefault = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS['default'];
      estimate = {
        weight: catDefault.weight,
        method: 'category_default',
        note: catDefault.note
      };
      stats.categoryDefault++;
    }
    
    results.push({
      id,
      name,
      category,
      type,
      estimatedWeight: estimate.weight,
      method: estimate.method,
      note: estimate.note,
      confidence: estimate.method === 'pos_lookup' ? 'HIGH' :
                  estimate.method === 'size_calculation' ? 'HIGH' :
                  estimate.method === 'child_average' ? 'MEDIUM' :
                  'LOW'
    });
  }
  
  // Report
  console.log('='.repeat(70));
  console.log('📊 ESTIMATION RESULTS');
  console.log('='.repeat(70));
  console.log(`
  Found weights by method:
  ├─ 🎯 POS Lookup (HIGH confidence): ${stats.pos}
  ├─ 📐 Size Calculation (HIGH): ${stats.calculated}
  ├─ 👶 Child Average (MEDIUM): ${stats.childAverage}
  └─ 📁 Category Default (LOW): ${stats.categoryDefault}
  
  Total estimated: ${results.length}
`);
  
  // Show samples by confidence
  console.log('='.repeat(70));
  console.log('📋 SAMPLE ESTIMATES BY CONFIDENCE');
  console.log('='.repeat(70));
  
  for (const conf of ['HIGH', 'MEDIUM', 'LOW']) {
    const items = results.filter(r => r.confidence === conf);
    console.log(`\n${conf} CONFIDENCE (${items.length} products):`);
    
    for (const item of items.slice(0, 5)) {
      console.log(`  [${item.id}] ${item.name.substring(0, 40).padEnd(40)} → ${item.estimatedWeight} lbs (${item.method})`);
      if (item.note) console.log(`           Note: ${item.note}`);
    }
    if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
  }
  
  if (dryRun) {
    console.log('\n' + '='.repeat(70));
    console.log('💡 Run with --confirm to generate update CSV');
    console.log('='.repeat(70));
  } else {
    // Generate CSV
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Full estimates CSV
    let csv = 'ID,Product Name,Category,Type,Estimated Weight (lbs),Method,Confidence,Note\n';
    for (const r of results) {
      csv += `${r.id},"${r.name.replace(/"/g, '""')}","${r.category}",${r.type},${r.estimatedWeight},${r.method},${r.confidence},"${(r.note || '').replace(/"/g, '""')}"\n`;
    }
    
    const estimatesPath = path.join(OUTPUTS_DIR, `weight_estimates_${timestamp}.csv`);
    fs.writeFileSync(estimatesPath, csv);
    
    // WooCommerce import CSV (only ID and Weight)
    let importCSV = 'ID,Weight\n';
    for (const r of results) {
      importCSV += `${r.id},${r.estimatedWeight}\n`;
    }
    
    const importPath = path.join(OUTPUTS_DIR, `weight_import_${timestamp}.csv`);
    fs.writeFileSync(importPath, importCSV);
    
    // High confidence only
    const highConf = results.filter(r => r.confidence === 'HIGH');
    let highConfCSV = 'ID,Weight\n';
    for (const r of highConf) {
      highConfCSV += `${r.id},${r.estimatedWeight}\n`;
    }
    
    const highConfPath = path.join(OUTPUTS_DIR, `weight_import_high_confidence_${timestamp}.csv`);
    fs.writeFileSync(highConfPath, highConfCSV);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ FILES GENERATED:');
    console.log('='.repeat(70));
    console.log(`  📊 Full estimates: outputs/woo_updates/weight_estimates_${timestamp}.csv`);
    console.log(`  📤 WooCommerce import (all): outputs/woo_updates/weight_import_${timestamp}.csv`);
    console.log(`  🎯 High confidence only: outputs/woo_updates/weight_import_high_confidence_${timestamp}.csv`);
    console.log('\n  RECOMMENDATION: Start with high confidence imports, then review others.');
    console.log('='.repeat(70));
  }
}

main().catch(console.error);
