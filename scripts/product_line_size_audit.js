/**
 * Product Line Size Audit - Consolidated Analysis
 * 
 * Groups products by ACTUAL product line (not individual sizes) and shows:
 * - All sizes you currently stock
 * - All sizes available from manufacturers
 * - Gap analysis for professional inventory planning
 * 
 * Focus on major brands: GH, AN, FoxFarm, Botanicare, Canna, etc.
 * 
 * Usage:
 *   node scripts/product_line_size_audit.js
 *   node scripts/product_line_size_audit.js --brand="General Hydroponics"
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs', 'product_lines');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// === MANUFACTURER SIZE CATALOGS ===
// Real sizes available from major manufacturers

const MANUFACTURER_SIZES = {
  'General Hydroponics': {
    'Flora Series (FloraGro, FloraBloom, FloraMicro)': {
      sizes: ['Pint (473ml)', 'Quart (946ml)', 'Gallon (3.78L)', '2.5 Gallon', '6 Gallon', '15 Gallon', '55 Gallon Drum', '275 Gallon Tote'],
      type: 'liquid',
      note: 'Core 3-part system - high volume product line'
    },
    'FloraNova (Grow & Bloom)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      note: '1-part concentrated formula'
    },
    'CALiMAGic': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid'
    },
    'Armor Si': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid'
    },
    'Diamond Nectar': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid'
    },
    'Liquid KoolBloom': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Dry KoolBloom': {
      sizes: ['2.2 lb', '1 kg', '16 lb'],
      type: 'dry'
    },
    'MaxiGro & MaxiBloom': {
      sizes: ['2.2 lb (1kg)', '16 lb'],
      type: 'dry',
      note: 'Powder nutrients - economical choice'
    },
    'RapidStart': {
      sizes: ['125ml', 'Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      note: 'Root enhancer concentrate'
    },
    'Floralicious Plus': {
      sizes: ['8 oz', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'FloraNectar (Sugar/Pineapple/Fruit)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'BioThrive (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      note: 'Organic/vegan line'
    },
    'pH Up & pH Down': {
      sizes: ['8 oz', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon', '15 Gallon', '55 Gallon'],
      type: 'liquid',
      note: 'High volume consumable'
    },
  },
  
  'Advanced Nutrients': {
    'pH Perfect Sensi (Grow/Bloom A&B)': {
      sizes: ['500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Flagship pH-buffered base nutrients'
    },
    'pH Perfect Connoisseur (Grow/Bloom A&B)': {
      sizes: ['500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Premium line'
    },
    'Big Bud': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Bloom booster - top seller'
    },
    'B-52': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid'
    },
    'Bud Candy': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid'
    },
    'Overdrive': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid'
    },
    'Bud Ignitor': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid'
    },
    'Voodoo Juice': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Beneficial bacteria'
    },
    'Piranha': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid'
    },
    'Tarantula': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid'
    },
    'Rhino Skin': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Silica - popular add-on'
    },
    'Nirvana': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid'
    },
    'Sensizym': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid'
    },
    'Flawless Finish': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid'
    },
  },
  
  'Fox Farm': {
    'Trio (Grow Big, Big Bloom, Tiger Bloom)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Best-selling liquid trio'
    },
    'Sledgehammer': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid'
    },
    'Open Sesame': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - early bloom'
    },
    'Beastie Bloomz': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - mid bloom'
    },
    'Cha Ching': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - late bloom'
    },
    'Kangaroots': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid'
    },
    'Microbe Brew': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid'
    },
    'Happy Frog Jump Start': {
      sizes: ['3 lb', '18 lb'],
      type: 'dry'
    },
  },
  
  'Botanicare': {
    'Pure Blend Pro (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid'
    },
    'CNS17 (Grow, Bloom, Ripe)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid',
      note: 'Professional 1-part formula'
    },
    'Cal-Mag Plus': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Very popular - essential supplement'
    },
    'Hydroplex': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Sweet (Raw, Berry, Citrus, Grape)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Clearex': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Rhizo Blast': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid'
    },
  },
  
  'Canna': {
    'Coco A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid',
      note: 'Industry standard for coco'
    },
    'Terra Vega & Flores': {
      sizes: ['1L', '5L', '10L'],
      type: 'liquid'
    },
    'Aqua Vega/Flores A&B': {
      sizes: ['1L', '5L', '10L'],
      type: 'liquid'
    },
    'Boost': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid'
    },
    'Cannazym': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid'
    },
    'Rhizotonic': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid'
    },
    'PK 13/14': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'Bloom booster'
    },
  },
  
  'House & Garden': {
    'Aqua Flakes A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid'
    },
    'Coco A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid'
    },
    'Roots Excelurator Gold': {
      sizes: ['100ml', '250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      note: 'Premium root stimulator - high margin'
    },
    'Top Booster': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid'
    },
    'Bud-XL': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid'
    },
    'Shooting Powder': {
      sizes: ['sachet (5g)', '65g', '500g', '1kg'],
      type: 'dry'
    },
  },
  
  'Athena': {
    'Pro Line Core': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon', '275 Gallon Tote'],
      type: 'liquid',
      note: 'Commercial focus - bulk pricing'
    },
    'Grow A&B': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon'],
      type: 'liquid'
    },
    'Bloom A&B': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon'],
      type: 'liquid'
    },
    'Balance': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid'
    },
    'Cleanse': {
      sizes: ['Gallon', '5 Gallon'],
      type: 'liquid'
    },
    'IPM': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid'
    },
  },
  
  'Mills Nutrients': {
    'Basis A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid'
    },
    'C4': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid'
    },
    'Start': {
      sizes: ['100ml', '250ml', '1L'],
      type: 'liquid'
    },
    'Ultimate PK': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid'
    },
  },
  
  'Emerald Harvest': {
    'Cali Pro A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid'
    },
    'King Kola': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Honey Chome': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
    'Root Wizard': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid'
    },
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

// === SIZE NORMALIZATION ===
function normalizeSize(text) {
  if (!text) return null;
  text = text.toLowerCase();
  
  // Extract numeric + unit
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*gal/i, fmt: (v) => v >= 2 ? `${v} Gallon` : `${v} Gallon` },
    { regex: /(\d+(?:\.\d+)?)\s*qt/i, fmt: (v) => 'Quart' },
    { regex: /(\d+(?:\.\d+)?)\s*pt/i, fmt: (v) => 'Pint' },
    { regex: /(\d+(?:\.\d+)?)\s*l(?:iter)?(?!\s*b)/i, fmt: (v) => `${v}L` },
    { regex: /(\d+(?:\.\d+)?)\s*ml/i, fmt: (v) => `${v}ml` },
    { regex: /(\d+(?:\.\d+)?)\s*oz/i, fmt: (v) => `${v} oz` },
    { regex: /(\d+(?:\.\d+)?)\s*lb/i, fmt: (v) => `${v} lb` },
    { regex: /(\d+(?:\.\d+)?)\s*kg/i, fmt: (v) => `${v} kg` },
    { regex: /(\d+(?:\.\d+)?)\s*g(?:ram)?(?!\s*al)/i, fmt: (v) => `${v}g` },
  ];
  
  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m) {
      return p.fmt(parseFloat(m[1]));
    }
  }
  return null;
}

// === MATCH PRODUCT TO PRODUCT LINE ===
function matchProductLine(title, brand) {
  title = (title || '').toLowerCase();
  
  const brandLines = MANUFACTURER_SIZES[brand];
  if (!brandLines) return null;
  
  // Matching rules by brand
  const matchRules = {
    'General Hydroponics': [
      { pattern: /flora\s*(gro|grow|micro|bloom)/i, line: 'Flora Series (FloraGro, FloraBloom, FloraMicro)' },
      { pattern: /floranova/i, line: 'FloraNova (Grow & Bloom)' },
      { pattern: /calimagic|cal-?mag/i, line: 'CALiMAGic' },
      { pattern: /armor\s*si/i, line: 'Armor Si' },
      { pattern: /diamond\s*nectar/i, line: 'Diamond Nectar' },
      { pattern: /liquid\s*koolbloom/i, line: 'Liquid KoolBloom' },
      { pattern: /dry\s*koolbloom|koolbloom.*dry/i, line: 'Dry KoolBloom' },
      { pattern: /maxi\s*(gro|bloom)/i, line: 'MaxiGro & MaxiBloom' },
      { pattern: /rapidstart|rapid\s*start/i, line: 'RapidStart' },
      { pattern: /floralicious/i, line: 'Floralicious Plus' },
      { pattern: /floranectar|flora\s*nectar/i, line: 'FloraNectar (Sugar/Pineapple/Fruit)' },
      { pattern: /biothrive/i, line: 'BioThrive (Grow & Bloom)' },
      { pattern: /ph\s*(up|down)/i, line: 'pH Up & pH Down' },
    ],
    'Advanced Nutrients': [
      { pattern: /sensi.*(grow|bloom)/i, line: 'pH Perfect Sensi (Grow/Bloom A&B)' },
      { pattern: /connoisseur/i, line: 'pH Perfect Connoisseur (Grow/Bloom A&B)' },
      { pattern: /big\s*bud/i, line: 'Big Bud' },
      { pattern: /b-?52/i, line: 'B-52' },
      { pattern: /bud\s*candy/i, line: 'Bud Candy' },
      { pattern: /overdrive/i, line: 'Overdrive' },
      { pattern: /bud\s*ignitor/i, line: 'Bud Ignitor' },
      { pattern: /voodoo/i, line: 'Voodoo Juice' },
      { pattern: /piranha/i, line: 'Piranha' },
      { pattern: /tarantula/i, line: 'Tarantula' },
      { pattern: /rhino\s*skin/i, line: 'Rhino Skin' },
      { pattern: /nirvana/i, line: 'Nirvana' },
      { pattern: /sensizym/i, line: 'Sensizym' },
      { pattern: /flawless\s*finish/i, line: 'Flawless Finish' },
    ],
    'Fox Farm': [
      { pattern: /grow\s*big/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
      { pattern: /big\s*bloom/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
      { pattern: /tiger\s*bloom/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
      { pattern: /sledgehammer/i, line: 'Sledgehammer' },
      { pattern: /open\s*sesame/i, line: 'Open Sesame' },
      { pattern: /beastie/i, line: 'Beastie Bloomz' },
      { pattern: /cha\s*ching/i, line: 'Cha Ching' },
      { pattern: /kangaroots/i, line: 'Kangaroots' },
      { pattern: /microbe\s*brew/i, line: 'Microbe Brew' },
    ],
    'Botanicare': [
      { pattern: /pure\s*blend/i, line: 'Pure Blend Pro (Grow & Bloom)' },
      { pattern: /cns\s*17/i, line: 'CNS17 (Grow, Bloom, Ripe)' },
      { pattern: /cal-?mag/i, line: 'Cal-Mag Plus' },
      { pattern: /hydroplex/i, line: 'Hydroplex' },
      { pattern: /sweet/i, line: 'Sweet (Raw, Berry, Citrus, Grape)' },
      { pattern: /clearex/i, line: 'Clearex' },
      { pattern: /rhizo\s*blast/i, line: 'Rhizo Blast' },
    ],
    'Canna': [
      { pattern: /coco\s*(a|b)/i, line: 'Coco A&B' },
      { pattern: /terra/i, line: 'Terra Vega & Flores' },
      { pattern: /aqua/i, line: 'Aqua Vega/Flores A&B' },
      { pattern: /boost/i, line: 'Boost' },
      { pattern: /cannazym/i, line: 'Cannazym' },
      { pattern: /rhizotonic/i, line: 'Rhizotonic' },
      { pattern: /pk\s*13/i, line: 'PK 13/14' },
    ],
    'House & Garden': [
      { pattern: /aqua\s*flakes/i, line: 'Aqua Flakes A&B' },
      { pattern: /roots\s*excelurator/i, line: 'Roots Excelurator Gold' },
      { pattern: /top\s*booster/i, line: 'Top Booster' },
      { pattern: /bud-?xl/i, line: 'Bud-XL' },
      { pattern: /shooting\s*powder/i, line: 'Shooting Powder' },
    ],
    'Athena': [
      { pattern: /core/i, line: 'Pro Line Core' },
      { pattern: /(grow|bloom)\s*(a|b)/i, line: 'Grow A&B' },
      { pattern: /balance/i, line: 'Balance' },
      { pattern: /cleanse/i, line: 'Cleanse' },
      { pattern: /ipm/i, line: 'IPM' },
    ],
  };
  
  const rules = matchRules[brand] || [];
  for (const rule of rules) {
    if (title.match(rule.pattern)) {
      return rule.line;
    }
  }
  return null;
}

// === MAIN ===
async function main() {
  const args = process.argv.slice(2);
  const brandFilter = args.find(a => a.startsWith('--brand='))?.split('=')[1];
  
  console.log('\n' + '═'.repeat(80));
  console.log('📦 PRODUCT LINE SIZE AUDIT - Consolidated Analysis');
  console.log('═'.repeat(80));
  console.log('\nComparing your inventory against manufacturer catalogs...\n');
  
  // Load product data
  const shopifyPath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import.csv');
  const data = parseCSV(fs.readFileSync(shopifyPath, 'utf-8'));
  console.log(`📊 Loaded ${data.rows.length} product records\n`);
  
  // Build inventory by brand/product line
  const inventory = {};
  
  for (const row of data.rows) {
    const title = row['Title'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const optionValue = row['Option1 Value'] || '';
    
    // Get brand
    let brand = vendor;
    const brandMatch = tags.match(/brand:([^,]+)/i);
    if (brandMatch) brand = brandMatch[1].trim();
    
    // Normalize brand name
    if (brand.match(/general\s*hydro/i)) brand = 'General Hydroponics';
    if (brand.match(/advanced\s*nut/i)) brand = 'Advanced Nutrients';
    if (brand.match(/fox\s*farm/i)) brand = 'Fox Farm';
    if (brand.match(/botanicare/i)) brand = 'Botanicare';
    if (brand.match(/^canna$/i)) brand = 'Canna';
    if (brand.match(/house.*garden/i)) brand = 'House & Garden';
    if (brand.match(/athena/i)) brand = 'Athena';
    
    if (!MANUFACTURER_SIZES[brand]) continue;
    if (brandFilter && !brand.toLowerCase().includes(brandFilter.toLowerCase())) continue;
    
    // Match to product line
    const productLine = matchProductLine(title, brand);
    if (!productLine) continue;
    
    // Extract size
    const size = normalizeSize(title) || normalizeSize(optionValue);
    if (!size) continue;
    
    // Track
    const key = `${brand}|||${productLine}`;
    if (!inventory[key]) {
      inventory[key] = {
        brand,
        productLine,
        sizesYouHave: new Set(),
        products: []
      };
    }
    inventory[key].sizesYouHave.add(size);
    inventory[key].products.push({ title, size });
  }
  
  // Generate report
  console.log('═'.repeat(80));
  console.log('📋 PRODUCT LINE SIZE COVERAGE');
  console.log('═'.repeat(80));
  
  const report = [];
  
  for (const [brand, lines] of Object.entries(MANUFACTURER_SIZES)) {
    if (brandFilter && !brand.toLowerCase().includes(brandFilter.toLowerCase())) continue;
    
    console.log(`\n🏷️  ${brand.toUpperCase()}`);
    console.log('─'.repeat(70));
    
    for (const [lineName, lineInfo] of Object.entries(lines)) {
      const key = `${brand}|||${lineName}`;
      const inv = inventory[key];
      
      const haveSizes = inv ? [...inv.sizesYouHave] : [];
      const allSizes = lineInfo.sizes;
      const missingSizes = allSizes.filter(s => {
        // Fuzzy match
        const sNorm = s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return !haveSizes.some(h => {
          const hNorm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          return hNorm.includes(sNorm) || sNorm.includes(hNorm) ||
                 (s.includes('Quart') && h.includes('qt')) ||
                 (s.includes('Gallon') && h.includes('gal')) ||
                 (s.includes('Pint') && h.includes('pt'));
        });
      });
      
      const coverage = Math.round(((allSizes.length - missingSizes.length) / allSizes.length) * 100);
      const icon = coverage >= 80 ? '✅' : coverage >= 50 ? '⚠️' : coverage > 0 ? '📦' : '❌';
      
      console.log(`\n  ${icon} ${lineName}`);
      console.log(`     Coverage: ${coverage}% (${allSizes.length - missingSizes.length}/${allSizes.length} sizes)`);
      console.log(`     Have: ${haveSizes.length > 0 ? haveSizes.join(', ') : '(none)'}`);
      if (missingSizes.length > 0) {
        console.log(`     📋 CAN ORDER: ${missingSizes.join(', ')}`);
      }
      if (lineInfo.note) {
        console.log(`     💡 ${lineInfo.note}`);
      }
      
      report.push({
        brand,
        productLine: lineName,
        coverage: `${coverage}%`,
        sizesYouHave: haveSizes,
        sizesAvailable: allSizes,
        sizesMissing: missingSizes,
        type: lineInfo.type,
        note: lineInfo.note || ''
      });
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('📈 SUMMARY');
  console.log('═'.repeat(80));
  
  const complete = report.filter(r => r.sizesMissing.length === 0).length;
  const partial = report.filter(r => r.sizesMissing.length > 0 && r.sizesYouHave.length > 0).length;
  const missing = report.filter(r => r.sizesYouHave.length === 0).length;
  
  console.log(`\n  Product lines analyzed: ${report.length}`);
  console.log(`  ✅ Complete coverage: ${complete}`);
  console.log(`  ⚠️ Partial coverage: ${partial}`);
  console.log(`  ❌ Not stocked: ${missing}`);
  
  // Top opportunities
  console.log('\n  🎯 TOP OPPORTUNITIES (Popular lines with gaps):');
  const opportunities = report
    .filter(r => r.sizesYouHave.length > 0 && r.sizesMissing.length > 0)
    .slice(0, 10);
  
  for (const opp of opportunities) {
    console.log(`     • ${opp.brand} ${opp.productLine}: Add ${opp.sizesMissing.slice(0, 3).join(', ')}`);
  }
  
  // Commercial/bulk opportunities
  console.log('\n  📦 COMMERCIAL/BULK OPPORTUNITIES:');
  const bulkSizes = ['55 Gallon', '275 Gallon', '15 Gallon', '23L', '20L'];
  for (const r of report) {
    const bulkMissing = r.sizesMissing.filter(s => bulkSizes.some(b => s.includes(b)));
    if (bulkMissing.length > 0 && r.sizesYouHave.length > 0) {
      console.log(`     • ${r.brand} ${r.productLine}: ${bulkMissing.join(', ')}`);
    }
  }
  
  // Save report
  const outputPath = path.join(OUTPUTS_DIR, `size_audit_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  
  // Save as CSV for easy review
  const csvPath = path.join(OUTPUTS_DIR, `size_audit_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`);
  const csvRows = ['Brand,Product Line,Coverage,Sizes You Have,Sizes Missing,Note'];
  for (const r of report) {
    csvRows.push([
      `"${r.brand}"`,
      `"${r.productLine}"`,
      r.coverage,
      `"${r.sizesYouHave.join('; ')}"`,
      `"${r.sizesMissing.join('; ')}"`,
      `"${r.note}"`
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ FILES GENERATED:');
  console.log('═'.repeat(80));
  console.log(`\n  📄 ${path.relative(process.cwd(), outputPath)}`);
  console.log(`  📄 ${path.relative(process.cwd(), csvPath)}`);
  console.log('\n  Use this data to plan inventory expansion and special order offerings.');
  console.log('═'.repeat(80));
}

main().catch(console.error);
