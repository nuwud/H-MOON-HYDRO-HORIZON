/**
 * Product Line Completeness Analyzer
 * 
 * Analyzes what sizes you HAVE vs what's AVAILABLE in the industry.
 * Identifies gaps in product lines so you can:
 * - Stock complete product lines like a pro hydro shop
 * - Offer special orders for sizes you don't carry
 * - Plan future inventory expansion
 * 
 * Usage:
 *   node scripts/product_line_analyzer.js                    # Full analysis
 *   node scripts/product_line_analyzer.js --brand="General Hydroponics"
 *   node scripts/product_line_analyzer.js --product="Flora"  # Search product names
 *   node scripts/product_line_analyzer.js --gaps-only        # Show only missing sizes
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs', 'product_lines');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// === INDUSTRY STANDARD SIZE RANGES ===
// These are typical sizes offered by major hydroponic nutrient manufacturers

const STANDARD_LIQUID_SIZES = {
  // Small/Sample
  'sample': { ml: 30, oz: 1, label: '1 oz / 30ml (Sample)' },
  'tiny': { ml: 60, oz: 2, label: '2 oz / 60ml' },
  'small': { ml: 120, oz: 4, label: '4 oz / 120ml' },
  'medium_small': { ml: 250, oz: 8, label: '8 oz / 250ml' },
  
  // Standard Retail
  'pint': { ml: 473, oz: 16, label: '16 oz / Pint / 500ml' },
  'quart': { ml: 946, oz: 32, label: '32 oz / Quart / 1L' },
  'half_gallon': { ml: 1893, oz: 64, label: '64 oz / Half Gallon / 2L' },
  'gallon': { ml: 3785, oz: 128, label: '1 Gallon / 4L' },
  
  // Large Retail / Small Commercial
  '2.5_gallon': { ml: 9464, label: '2.5 Gallon / 10L' },
  '5_gallon': { ml: 18927, label: '5 Gallon / 20L' },
  '6_gallon': { ml: 22712, label: '6 Gallon / 23L' },
  
  // Commercial
  '15_gallon': { ml: 56781, label: '15 Gallon / 55L' },
  '55_gallon': { ml: 208198, label: '55 Gallon Drum / 208L' },
  
  // Industrial / Freight
  '275_gallon': { ml: 1041000, label: '275 Gallon IBC Tote' },
  '330_gallon': { ml: 1249000, label: '330 Gallon IBC Tote' },
  '1000_liter': { ml: 1000000, label: '1000L IBC Tote (264 gal)' },
};

const STANDARD_DRY_SIZES = {
  'packet': { g: 10, oz: 0.35, label: '10g Packet' },
  '1_oz': { g: 28, oz: 1, label: '1 oz / 28g' },
  '2_oz': { g: 57, oz: 2, label: '2 oz / 57g' },
  '100g': { g: 100, oz: 3.5, label: '100g / 3.5 oz' },
  '130g': { g: 130, oz: 4.6, label: '130g' },
  '250g': { g: 250, oz: 8.8, label: '250g / 8 oz' },
  '500g': { g: 500, oz: 17.6, label: '500g / 1.1 lb' },
  '1_kg': { g: 1000, oz: 35.3, label: '1 kg / 2.2 lb' },
  '2_kg': { g: 2000, oz: 70.5, label: '2 kg / 4.4 lb' },
  '2.5_kg': { g: 2500, label: '2.5 kg / 5.5 lb' },
  '5_kg': { g: 5000, label: '5 kg / 11 lb' },
  '10_kg': { g: 10000, label: '10 kg / 22 lb' },
  '20_kg': { g: 20000, label: '20 kg / 44 lb' },
  '25_kg': { g: 25000, label: '25 kg / 55 lb (bag)' },
  '50_lb': { g: 22680, label: '50 lb bag' },
};

// === BRAND PRODUCT LINE KNOWLEDGE ===
// What sizes major brands typically offer

const BRAND_PRODUCT_LINES = {
  'General Hydroponics': {
    lines: {
      'Flora Series': {
        products: ['FloraGro', 'FloraBloom', 'FloraMicro'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '6_gallon', '15_gallon', '55_gallon'],
        type: 'liquid'
      },
      'FloraNova': {
        products: ['FloraNova Grow', 'FloraNova Bloom'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'FloraDuo': {
        products: ['FloraDuo A', 'FloraDuo B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Maxi Series': {
        products: ['MaxiGro', 'MaxiBloom'],
        typicalSizes: ['1_kg', '2.2_lb', '16_lb'],
        type: 'dry'
      },
      'CALiMAGic': {
        products: ['CALiMAGic'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Armor Si': {
        products: ['Armor Si'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Diamond Nectar': {
        products: ['Diamond Nectar'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Liquid KoolBloom': {
        products: ['Liquid KoolBloom'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Dry KoolBloom': {
        products: ['Dry KoolBloom'],
        typicalSizes: ['2_oz', '1_kg', '2.2_lb'],
        type: 'dry'
      },
      'Floralicious Plus': {
        products: ['Floralicious Plus'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'RapidStart': {
        products: ['RapidStart'],
        typicalSizes: ['small', 'pint', 'quart', 'gallon'],
        type: 'liquid'
      },
    }
  },
  'Advanced Nutrients': {
    lines: {
      'pH Perfect Sensi': {
        products: ['Sensi Grow A', 'Sensi Grow B', 'Sensi Bloom A', 'Sensi Bloom B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'pH Perfect Connoisseur': {
        products: ['Connoisseur Grow A', 'Connoisseur Grow B', 'Connoisseur Bloom A', 'Connoisseur Bloom B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Big Bud': {
        products: ['Big Bud Liquid', 'Big Bud Powder'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon', '5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'B-52': {
        products: ['B-52'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon', '5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Bud Candy': {
        products: ['Bud Candy'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Bud Ignitor': {
        products: ['Bud Ignitor'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Overdrive': {
        products: ['Overdrive'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Nirvana': {
        products: ['Nirvana'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Voodoo Juice': {
        products: ['Voodoo Juice'],
        typicalSizes: ['pint', 'quart', 'gallon'],
        type: 'liquid'
      },
      'Piranha': {
        products: ['Piranha Liquid'],
        typicalSizes: ['pint', 'quart', 'gallon'],
        type: 'liquid'
      },
      'Tarantula': {
        products: ['Tarantula Liquid'],
        typicalSizes: ['pint', 'quart', 'gallon'],
        type: 'liquid'
      },
      'Rhino Skin': {
        products: ['Rhino Skin'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
    }
  },
  'Fox Farm': {
    lines: {
      'Trio': {
        products: ['Grow Big', 'Big Bloom', 'Tiger Bloom'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Bush Doctor': {
        products: ['Sledgehammer', 'Kangaroots', 'Microbe Brew', 'Bembe'],
        typicalSizes: ['pint', 'quart', 'gallon'],
        type: 'liquid'
      },
      'Open Sesame': {
        products: ['Open Sesame'],
        typicalSizes: ['1_oz', '100g', '500g'],
        type: 'dry'
      },
      'Beastie Bloomz': {
        products: ['Beastie Bloomz'],
        typicalSizes: ['1_oz', '100g', '500g'],
        type: 'dry'
      },
      'Cha Ching': {
        products: ['Cha Ching'],
        typicalSizes: ['1_oz', '100g', '500g'],
        type: 'dry'
      },
    }
  },
  'Botanicare': {
    lines: {
      'Pure Blend Pro': {
        products: ['Pure Blend Pro Grow', 'Pure Blend Pro Bloom'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'CNS17': {
        products: ['CNS17 Grow', 'CNS17 Bloom', 'CNS17 Ripe'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon', '15_gallon'],
        type: 'liquid'
      },
      'Cal-Mag Plus': {
        products: ['Cal-Mag Plus'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Hydroplex': {
        products: ['Hydroplex'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
      'Sweet': {
        products: ['Sweet Raw', 'Sweet Berry', 'Sweet Citrus', 'Sweet Grape'],
        typicalSizes: ['pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid'
      },
    }
  },
  'Athena': {
    lines: {
      'Pro Line': {
        products: ['Core', 'Grow A', 'Grow B', 'Bloom A', 'Bloom B'],
        typicalSizes: ['gallon', '5_gallon', '15_gallon', '55_gallon', '275_gallon'],
        type: 'liquid',
        note: 'Commercial focus - large sizes standard'
      },
      'Blended Line': {
        products: ['Grow', 'Bloom', 'Balance'],
        typicalSizes: ['gallon', '5_gallon', '15_gallon', '55_gallon'],
        type: 'liquid'
      },
      'Stack': {
        products: ['Cleanse', 'Fade', 'IPM'],
        typicalSizes: ['gallon', '5_gallon'],
        type: 'liquid'
      },
    }
  },
  'Canna': {
    lines: {
      'Coco': {
        products: ['Coco A', 'Coco B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Terra': {
        products: ['Terra Vega', 'Terra Flores'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Aqua': {
        products: ['Aqua Vega A', 'Aqua Vega B', 'Aqua Flores A', 'Aqua Flores B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Boost': {
        products: ['Boost', 'PK 13/14', 'Cannazym', 'Rhizotonic'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
    }
  },
  'House & Garden': {
    lines: {
      'Aqua Flakes': {
        products: ['Aqua Flakes A', 'Aqua Flakes B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon', '6_gallon'],
        type: 'liquid'
      },
      'Coco': {
        products: ['Coco A', 'Coco B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Roots Excelurator': {
        products: ['Roots Excelurator Gold', 'Roots Excelurator Silver'],
        typicalSizes: ['small', 'pint', 'quart', 'gallon'],
        type: 'liquid',
        note: 'Premium pricing - smaller sizes common'
      },
      'Shooting Powder': {
        products: ['Shooting Powder'],
        typicalSizes: ['packet', '1_oz', '100g'],
        type: 'dry'
      },
    }
  },
  "Humboldt's Secret": {
    lines: {
      'Base': {
        products: ['Base A', 'Base B'],
        typicalSizes: ['quart', 'gallon', '2.5_gallon', '5_gallon'],
        type: 'liquid'
      },
      'Golden Tree': {
        products: ['Golden Tree'],
        typicalSizes: ['small', 'pint', 'quart', 'gallon', '2.5_gallon'],
        type: 'liquid',
        note: 'Concentrate - smaller sizes popular'
      },
    }
  },
};

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

// === SIZE EXTRACTION ===
function extractSize(name, optionValue) {
  const text = `${name || ''} ${optionValue || ''}`.toLowerCase();
  
  // Try to extract numeric size with unit
  const patterns = [
    // Liters
    { regex: /(\d+(?:\.\d+)?)\s*l(?:iter|itre)?s?(?!\s*b)/i, unit: 'L', toMl: v => v * 1000 },
    { regex: /(\d+(?:\.\d+)?)\s*ml/i, unit: 'ml', toMl: v => v },
    // Gallons
    { regex: /(\d+(?:\.\d+)?)\s*gal(?:lon)?s?/i, unit: 'gal', toMl: v => v * 3785 },
    // Quarts
    { regex: /(\d+(?:\.\d+)?)\s*(?:qt|quart)s?/i, unit: 'qt', toMl: v => v * 946 },
    // Pints
    { regex: /(\d+(?:\.\d+)?)\s*(?:pt|pint)s?/i, unit: 'pt', toMl: v => v * 473 },
    // Ounces (fluid)
    { regex: /(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?oz(?:ounce)?s?/i, unit: 'oz', toMl: v => v * 29.57 },
    // Kilograms
    { regex: /(\d+(?:\.\d+)?)\s*kg/i, unit: 'kg', toG: v => v * 1000 },
    // Pounds
    { regex: /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)s?/i, unit: 'lb', toG: v => v * 453.6 },
    // Grams
    { regex: /(\d+(?:\.\d+)?)\s*g(?:ram)?s?(?!\s*al)/i, unit: 'g', toG: v => v },
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const value = parseFloat(match[1]);
      return {
        value,
        unit: pattern.unit,
        ml: pattern.toMl ? pattern.toMl(value) : null,
        grams: pattern.toG ? pattern.toG(value) : null,
        display: `${value} ${pattern.unit}`,
        raw: match[0]
      };
    }
  }
  
  return null;
}

// === NORMALIZE SIZE TO STANDARD ===
function normalizeToStandard(size, type = 'liquid') {
  if (!size) return null;
  
  const standards = type === 'liquid' ? STANDARD_LIQUID_SIZES : STANDARD_DRY_SIZES;
  
  // Find closest match
  let closest = null;
  let minDiff = Infinity;
  
  for (const [key, std] of Object.entries(standards)) {
    const stdValue = type === 'liquid' ? std.ml : std.g;
    const sizeValue = type === 'liquid' ? size.ml : size.grams;
    
    if (stdValue && sizeValue) {
      const diff = Math.abs(stdValue - sizeValue) / stdValue;
      if (diff < minDiff && diff < 0.2) { // Within 20%
        minDiff = diff;
        closest = key;
      }
    }
  }
  
  return closest;
}

// === MAIN ANALYSIS ===
async function main() {
  const args = process.argv.slice(2);
  const brandFilter = args.find(a => a.startsWith('--brand='))?.split('=')[1];
  const productFilter = args.find(a => a.startsWith('--product='))?.split('=')[1];
  const gapsOnly = args.includes('--gaps-only');
  
  console.log('\n' + '═'.repeat(80));
  console.log('📦 PRODUCT LINE COMPLETENESS ANALYZER');
  console.log('═'.repeat(80));
  console.log('\nAnalyzing your inventory vs industry standard sizes...\n');
  
  // Load your product data
  const shopifyPath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import.csv');
  const wooPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  
  let products = [];
  
  if (fs.existsSync(shopifyPath)) {
    const data = parseCSV(fs.readFileSync(shopifyPath, 'utf-8'));
    products = data.rows.filter(r => r['Title'] && r['Title'].trim());
    console.log(`📊 Loaded ${products.length} products from Shopify export`);
  }
  
  // Group products by vendor/brand and product line
  const productLines = {};
  
  for (const row of products) {
    const title = row['Title'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const optionValue = row['Option1 Value'] || '';
    const type = row['Type'] || '';
    
    // Extract brand from tags or vendor
    let brand = vendor;
    const brandMatch = tags.match(/brand:([^,]+)/i);
    if (brandMatch) brand = brandMatch[1].trim();
    
    if (!brand || brand === 'Unknown' || brand === 'H Moon Hydro') continue;
    
    // Skip non-nutrient products for this analysis
    if (!type.match(/nutrient|supplement|additive|booster/i) && 
        !tags.match(/nutrient|supplement|additive|booster/i)) continue;
    
    // Apply filters
    if (brandFilter && !brand.toLowerCase().includes(brandFilter.toLowerCase())) continue;
    if (productFilter && !title.toLowerCase().includes(productFilter.toLowerCase())) continue;
    
    // Extract product base name (without size)
    const baseName = title
      .replace(/\s*[-–]\s*\d+.*/i, '')
      .replace(/\s+\d+\s*(ml|l|oz|qt|gal|kg|lb|g)\b.*/i, '')
      .replace(/\s*\(\d+.*\)/i, '')
      .replace(/\s+$/, '')
      .trim();
    
    if (!baseName) continue;
    
    // Extract size
    const size = extractSize(title, optionValue);
    
    // Group
    const key = `${brand}|||${baseName}`;
    if (!productLines[key]) {
      productLines[key] = {
        brand,
        product: baseName,
        variants: [],
        sizes: new Set(),
        sizeDetails: []
      };
    }
    
    if (size) {
      const normalized = normalizeToStandard(size, 'liquid');
      productLines[key].variants.push({
        title,
        size,
        normalized,
        optionValue
      });
      if (normalized) productLines[key].sizes.add(normalized);
      productLines[key].sizeDetails.push(size.display);
    }
  }
  
  // Analyze each product line
  console.log('\n' + '─'.repeat(80));
  console.log('📊 PRODUCT LINE ANALYSIS');
  console.log('─'.repeat(80));
  
  const allResults = [];
  const brands = [...new Set(Object.values(productLines).map(p => p.brand))].sort();
  
  for (const brand of brands) {
    const brandProducts = Object.values(productLines).filter(p => p.brand === brand);
    
    console.log(`\n🏷️  ${brand.toUpperCase()}`);
    console.log('─'.repeat(60));
    
    for (const line of brandProducts) {
      const currentSizes = [...line.sizes].sort();
      const knownLine = BRAND_PRODUCT_LINES[brand]?.lines?.[line.product];
      
      // Determine expected sizes
      let expectedSizes = ['pint', 'quart', 'gallon', '2.5_gallon', '5_gallon']; // Default
      if (knownLine) {
        expectedSizes = knownLine.typicalSizes;
      }
      
      const missingSizes = expectedSizes.filter(s => !currentSizes.includes(s));
      const result = {
        brand,
        product: line.product,
        currentSizes: currentSizes.map(s => STANDARD_LIQUID_SIZES[s]?.label || s),
        currentSizesRaw: line.sizeDetails,
        missingSizes: missingSizes.map(s => STANDARD_LIQUID_SIZES[s]?.label || STANDARD_DRY_SIZES[s]?.label || s),
        expectedSizes: expectedSizes.map(s => STANDARD_LIQUID_SIZES[s]?.label || STANDARD_DRY_SIZES[s]?.label || s),
        completeness: Math.round((currentSizes.length / expectedSizes.length) * 100),
        note: knownLine?.note || ''
      };
      
      allResults.push(result);
      
      // Display
      if (!gapsOnly || missingSizes.length > 0) {
        const icon = result.completeness >= 80 ? '✅' : result.completeness >= 50 ? '⚠️' : '❌';
        console.log(`\n  ${icon} ${line.product}`);
        console.log(`     Completeness: ${result.completeness}% (${currentSizes.length}/${expectedSizes.length} sizes)`);
        console.log(`     Have: ${line.sizeDetails.join(', ') || 'None detected'}`);
        
        if (missingSizes.length > 0) {
          console.log(`     📋 MISSING: ${result.missingSizes.join(', ')}`);
        }
        if (result.note) {
          console.log(`     💡 ${result.note}`);
        }
      }
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('📈 SUMMARY');
  console.log('═'.repeat(80));
  
  const incomplete = allResults.filter(r => r.completeness < 100);
  const missing50 = allResults.filter(r => r.completeness < 50);
  
  console.log(`\n  Total product lines analyzed: ${allResults.length}`);
  console.log(`  Complete (100%): ${allResults.filter(r => r.completeness >= 100).length}`);
  console.log(`  Partial (50-99%): ${allResults.filter(r => r.completeness >= 50 && r.completeness < 100).length}`);
  console.log(`  Minimal (<50%): ${missing50.length}`);
  
  // Commercial size gaps
  const commercialSizes = ['5_gallon', '6_gallon', '15_gallon', '55_gallon', '275_gallon', '1000_liter'];
  const productsWithCommercial = allResults.filter(r => 
    r.currentSizes.some(s => commercialSizes.some(cs => STANDARD_LIQUID_SIZES[cs]?.label === s))
  );
  const productsMissingCommercial = allResults.filter(r => 
    !r.currentSizes.some(s => commercialSizes.some(cs => STANDARD_LIQUID_SIZES[cs]?.label === s))
  );
  
  console.log(`\n  📦 Commercial sizes (5+ gallon):`);
  console.log(`     With commercial sizes: ${productsWithCommercial.length}`);
  console.log(`     Missing commercial sizes: ${productsMissingCommercial.length}`);
  
  // Generate output files
  const outputPath = path.join(OUTPUTS_DIR, `product_line_gaps_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    generated: new Date().toISOString(),
    summary: {
      total: allResults.length,
      complete: allResults.filter(r => r.completeness >= 100).length,
      partial: allResults.filter(r => r.completeness >= 50 && r.completeness < 100).length,
      minimal: missing50.length,
      withCommercial: productsWithCommercial.length,
      missingCommercial: productsMissingCommercial.length,
    },
    productLines: allResults
  }, null, 2));
  
  // Generate CSV for easy review
  const csvPath = path.join(OUTPUTS_DIR, `product_line_gaps_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`);
  const csvRows = ['Brand,Product,Completeness,Current Sizes,Missing Sizes,Note'];
  for (const r of allResults.sort((a, b) => a.completeness - b.completeness)) {
    csvRows.push([
      `"${r.brand}"`,
      `"${r.product}"`,
      `${r.completeness}%`,
      `"${r.currentSizes.join('; ')}"`,
      `"${r.missingSizes.join('; ')}"`,
      `"${r.note}"`
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  
  // Generate special order opportunities report
  const specialOrderPath = path.join(OUTPUTS_DIR, `special_order_opportunities.csv`);
  const specialRows = ['Brand,Product,Size Available to Order,Industry Standard,Note'];
  
  // Add IBC tote opportunities for high-volume products
  const highVolumeProducts = ['FloraGro', 'FloraBloom', 'FloraMicro', 'Cal-Mag', 'pH Up', 'pH Down'];
  const ibcSizes = ['275 Gallon IBC Tote', '330 Gallon IBC Tote', '1000L IBC Tote (264 gal)'];
  
  for (const r of allResults) {
    // Check if any high-volume keyword matches
    const isHighVolume = highVolumeProducts.some(hv => 
      r.product.toLowerCase().includes(hv.toLowerCase().split(' ')[0])
    );
    
    for (const missing of r.missingSizes) {
      specialRows.push([
        `"${r.brand}"`,
        `"${r.product}"`,
        `"${missing}"`,
        `"Yes - Available from manufacturer"`,
        `"${isHighVolume && ibcSizes.includes(missing) ? 'COMMERCIAL - Freight delivery' : 'Standard reorder'}"`
      ].join(','));
    }
  }
  fs.writeFileSync(specialOrderPath, specialRows.join('\n'));
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ FILES GENERATED:');
  console.log('═'.repeat(80));
  console.log(`\n  📄 ${path.relative(process.cwd(), outputPath)}`);
  console.log(`  📄 ${path.relative(process.cwd(), csvPath)}`);
  console.log(`  📄 ${path.relative(process.cwd(), specialOrderPath)}`);
  console.log('\n  The special order opportunities file shows sizes you can offer customers');
  console.log('  even if not in stock - order from distributor or manufacturer direct.');
  console.log('═'.repeat(80));
}

main().catch(console.error);
