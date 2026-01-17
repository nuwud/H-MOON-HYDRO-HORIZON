/**
 * Build Shopify Import CSV from WooCommerce Products
 * Version 3: Smart Multi-Option Variant Detection
 * 
 * Key Features:
 * 1. WooCommerce grouped products with children
 * 2. Series pattern detection for ungrouped simple products
 * 3. Multi-option variants when children have different base names
 *    - Option1: Product Type (e.g., FloraGro, Flora Bloom)
 *    - Option2: Size (e.g., 1 qt, 1 gal)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const WOO_EXPORT = path.join(__dirname, '../CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const OUTPUT_DIR = path.join(__dirname, '../outputs/woo_grouped');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'shopify_grouped_import_v3.csv');

// Shopify CSV Header
const SHOPIFY_HEADER = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
  'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
  'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
  'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
  'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
  'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description',
  'Gift Card', 'Status'
];

// Size patterns - ordered from most specific to least specific
const SIZE_PATTERNS = [
  // Parenthesized sizes with optional text: "(130g powder)", "(1 qt)", "(5 gal)"
  /\s*\((\d+(?:\.\d+)?)\s*(qt|qts?|quart|quarts?|pt|pts?|pint|pints?|gal|gallons?|oz|fl\.?\s*oz|liter|liters?|lt?|ml|L|lb|lbs?|kg|g|gm)[^)]*\)\s*$/i,
  
  // No-space patterns: "6oz", "500g", "1qt"
  /\s+(\d+(?:\.\d+)?)(oz|qt|pt|gal|lb|kg|g|ml|L)\.?\s*$/i,
  
  // Standard patterns with number + unit (with optional period after unit)
  /\s*[-–/]?\s*(\d+(?:\.\d+)?)\s*(qt|qts?|quart|quarts?|pt|pts?|pint|pints?|gal|gallons?|oz|fl\.?\s*oz|liter|liters?|lt?|ml|L)\.?\s*$/i,
  /\s*[-–/]?\s*(\d+(?:\.\d+)?)\s*(lb|lbs?|pound|pounds?|kg|g|gm|grams?)\.?\s*$/i,
  /\s*[-–/]?\s*(\d+)\s*(pk|pack|packs?|ct|count|ea|each|per)\.?\s*$/i,
  
  // Sizes at end without leading dash
  /\s+(\d+(?:\.\d+)?)\s*(gal|gallon|gallons?|qt|quart|pt|pint|oz|lb|kg|g|L|ml|liter)\.?\s*$/i,
  
  // Unit-only patterns (no number - assumes 1) - e.g., "FloraBlend qt", "Product gal"
  /\s+(qt|qts?|quart|quarts?|pt|pts?|pint|pints?|gal|gallon|gallons?)$/i,
];

// HTML Entity decoder
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')
    .replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, '...').replace(/&#8217;/g, "'").replace(/&#8211;/g, "-")
    .replace(/&#8243;/g, '"').replace(/&#8242;/g, "'").replace(/&#038;/g, "&");
}

// Strip HTML tags
function stripHtmlTags(str) {
  if (!str) return '';
  return decodeHtmlEntities(str)
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
}

// Normalize for matching
function normalizeForMatch(str) {
  if (!str) return '';
  return decodeHtmlEntities(str).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[''′`]/g, "'").replace(/[""″]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

// Extract base name and size
function extractBaseAndSize(name) {
  if (!name) return { base: null, size: null, originalBase: null };
  const decoded = stripHtmlTags(name);
  
  for (const pattern of SIZE_PATTERNS) {
    const match = decoded.match(pattern);
    if (match) {
      let size;
      // Handle unit-only patterns (no number captured)
      if (match[2]) {
        size = `${match[1]} ${match[2]}`.trim();
      } else {
        // Unit only pattern - match[1] is the unit
        size = `1 ${match[1]}`.trim();
      }
      // Normalize size formatting
      size = size.replace(/\.$/, ''); // Remove trailing period
      const base = decoded.substring(0, match.index).trim();
      if (base.length > 2) {
        return { base: base.toLowerCase(), size, originalBase: base };
      }
    }
  }
  return { base: null, size: null, originalBase: null };
}

// FALLBACK PRICING MAP - Researched online prices for products with missing prices
// Using higher-end prices to ensure margin coverage
const FALLBACK_PRICES = {
  // Clonex products (HydroDynamics/HDI)
  'clonex mist': 22.00,                     // Walmart: $17.99-$22.03 → use $22
  'clonex mist 100': 22.00,                 // 100ml version
  'hydrodynamics clonex mist': 22.00,
  'hydrodyamics clonex mist': 22.00,        // Note typo in WooCommerce data
  
  // Athena Products
  'athena blended line': 115.00,            // Walmart: Starter Kit $113.99 → $115
  'athena camg': 49.00,                     // Walmart: CaMg Gallon $45.00 → $49
  'athena ca-mg': 49.00,
  
  // Books
  'teaming with bacteria': 27.00,           // Barnes & Noble: ~$24.95 paperback → $27
  
  // Scietetics Products (estimated from similar products)
  'scietetics foundation powder': 29.00,    // Estimated similar to grow media additives
  'scietetics coco': 12.00,                 // Coco blocks range $6-20 → $12 for 8" block
  
  // Category placeholder
  'seeds': 15.00,                           // Placeholder for category page (varies by seed)
};

// VENDOR NORMALIZATION MAP - Consolidate variations to canonical names
const VENDOR_NORMALIZE = {
  'GH': 'General Hydroponics',
  'gh': 'General Hydroponics',
  'Humboldt': 'Humboldt Nutrients',
  'humboldt': 'Humboldt Nutrients',
  'ONA': 'ONA Products',
  'Ona': 'ONA Products',
  'TNC': 'TNC Products',
  'HDI': 'HydroDynamics',
};

// Normalize vendor name
function normalizeVendor(vendor) {
  if (!vendor) return '';
  const trimmed = vendor.trim();
  return VENDOR_NORMALIZE[trimmed] || trimmed;
}

// Truncate option value to max length with ellipsis
function truncateOption(value, maxLength = 40) {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength - 3) + '...';
}

// Generate tags from product data
function generateTags(productType, category, vendor, existingTags) {
  const tags = new Set();
  
  // Add existing tags
  if (existingTags) {
    existingTags.split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed) tags.add(trimmed);
    });
  }
  
  // Add product type as tag (cleaned)
  if (productType) {
    const cleanType = decodeHtmlEntities(productType).replace(/&/g, 'and').trim();
    if (cleanType && cleanType.length > 2 && cleanType.length < 50) {
      tags.add(cleanType);
    }
  }
  
  // Add vendor as tag
  if (vendor && vendor.length > 2 && vendor.length < 40) {
    tags.add(vendor);
  }
  
  // Add category-based tags
  if (category) {
    const catLower = category.toLowerCase();
    if (catLower.includes('nutrient')) tags.add('Nutrients');
    if (catLower.includes('light')) tags.add('Grow Lights');
    if (catLower.includes('seed')) tags.add('Seeds');
    if (catLower.includes('hydro')) tags.add('Hydroponics');
    if (catLower.includes('organic')) tags.add('Organic');
  }
  
  return [...tags].join(', ');
}

// Helper function to find fallback price by matching product handle/title
function getFallbackPrice(handle, title) {
  const search = (handle + ' ' + title).toLowerCase();
  for (const [pattern, price] of Object.entries(FALLBACK_PRICES)) {
    if (search.includes(pattern)) {
      return price.toFixed(2);
    }
  }
  return null;
}

// Known brands for vendor extraction (expanded v4)
const KNOWN_BRANDS = [
  // Major nutrient brands
  'General Hydroponics', 'Fox Farm', 'FoxFarm', 'Advanced Nutrients', 'Botanicare',
  'Canna', 'House & Garden', 'Humboldt Nutrients', 'Nectar for the Gods', 'Roots Organics',
  'Soul', 'Technaflora', 'Emerald Harvest', 'Cutting Edge', 'Cyco', 'Dutch Master',
  'Dyna-Gro', 'Earth Juice', 'Grotek', 'Humboldts Secret', 'Ionic',
  'Mills', 'Remo', 'Plagron', 'BioBizz', 'Athena', 'HydroDynamics', 'Clonex', 'Scietetics',
  
  // Lighting brands
  'AC Infinity', 'AC INFINITY', 'Spider Farmer', 'Mars Hydro', 'Gavita', 'Luxx', 'Fluence',
  'HLG', 'Hydrofarm', 'Sun System', 'SunBlaster', 'SolarMax', 'EYE Hortilux', 'Hortilux',
  'Philips', 'BADBOY',
  
  // Grow equipment
  'Gorilla Grow', 'Secret Jardin', 'Vivosun', 'BloomBoss', 'Floraflex', 'Autopot',
  'Netafim', 'Current Culture', 'Titan Controls', 'Inkbird', 'Light Rail',
  
  // Meters & monitoring  
  'Bluelab', 'Hanna', 'Milwaukee', 'Apera', 'HM Digital', 'Green Air', 'GreenAir',
  
  // Growing media
  'Grodan', 'Rockwool', 'Coco Coir', 'Mother Earth', 'Root Pouch', 'Royal Gold',
  
  // Beneficials & additives
  'Great White', 'Mammoth P', 'Mammoth', 'Recharge', 'Real Growers', 'Tribus',
  'SLF-100', 'Hygrozyme', 'Plant Success', 'Xtreme Gardening', 'Mykos', 'Myco',
  
  // Odor & pest control
  'ONA Products', 'Doktor Doom', 'Safer',
  
  // Seeds
  'GreenHouse Seed', 'Atlas Seed', 'Emerald Triangle',
  
  // Other brands
  'B\'Cuzz', 'BCUZZ', 'Atami', 'Bio Green', 'Aptus', 'Green Planet', 'Rasta Bob',
  'Liquid Carbo', 'Plantmax', 'PlantMax', 'UltraGrow', 'Ultragrow', 'Control Wizard',
  'Ed Rosenthal', 'Snapture', 'TRIMPRO', 'CAN', 'Can-Lite', 'Max-Fan', 'Vortex',
  'Mag Drive', 'TimeMist', 'Block-IR', 'TNC',
  
  // GH product lines (detected as brands for vendor assignment)
  'Rapidstart', 'Rapid Start', 'CALiMAGic', 'Floralicious', 'Diamond Nectar',
  'Armor Si', 'KoolBloom', 'Florakleen', 'Sensi', 'Big Bud', 'Overdrive',
  'Voodoo Juice', 'Bud Candy', 'pH Perfect', 'Connoisseur', 'Kushie Kush',
  'Bud Ignitor', 'Rhino Skin', 'Nirvana', 'Piranha', 'Tarantula', 'Grow Big',
  'Tiger Bloom', 'Big Bloom', 'Cha Ching', 'Open Sesame', 'Beastie Bloomz',
  'Happy Frog', 'Ocean Forest', 'Azos', 'Hydroguard', 'UC Roots', 'Coco Loco'
];

// Product name patterns that indicate specific brands (expanded v4)
const BRAND_PRODUCT_PATTERNS = [
  // HydroDynamics / Clonex products
  { pattern: /^(hydrodyamics|hydrodynamics)/i, brand: 'HydroDynamics' },
  { pattern: /^clonex/i, brand: 'HydroDynamics' },
  { pattern: /ionic.*\b(grow|bloom)\b/i, brand: 'HydroDynamics' },
  
  // Athena products
  { pattern: /^athena\s/i, brand: 'Athena' },
  
  // General Hydroponics products
  { pattern: /^flora\s*(blend|gro|grow|bloom|micro|nova|kleen|shield|nectar|duo|licious)/i, brand: 'General Hydroponics' },
  { pattern: /^(biothrive|biobud|biomarine|bioweed|bioroot|bioponic)/i, brand: 'General Hydroponics' },
  { pattern: /^(maxi\s*(gro|bloom)|camg\+?|diamond\s*(black|nectar)|armor\s*si)/i, brand: 'General Hydroponics' },
  { pattern: /^(koolbloom|rapid\s*start|liquid\s*koolbloom)/i, brand: 'General Hydroponics' },
  { pattern: /^(flora\s*series|floranova|floraduo)/i, brand: 'General Hydroponics' },
  { pattern: /^(calimagic|defguard|bio\s*(thrive|marine|weed|root))/i, brand: 'General Hydroponics' },
  
  // Advanced Nutrients products
  { pattern: /^(big\s*bud|bud\s*(boom|start|candy|ignitor)|overdrive|voodoo\s*juice)/i, brand: 'Advanced Nutrients' },
  { pattern: /^(sensi|connoisseur|kushie|rhino\s*skin|nirvana|piranha|tarantula)/i, brand: 'Advanced Nutrients' },
  { pattern: /^(ph\s*perfect|jungle\s*juice)/i, brand: 'Advanced Nutrients' },
  { pattern: /^(carbo\s*(load|blast)|bud\s*factor|final\s*phase|b-?52)/i, brand: 'Advanced Nutrients' },
  { pattern: /^(bud\s*blood|revive|sensizym)/i, brand: 'Advanced Nutrients' },
  
  // Fox Farm products  
  { pattern: /^(grow\s*big|tiger\s*bloom|big\s*bloom|cha\s*ching|open\s*sesame|beastie)/i, brand: 'Fox Farm' },
  { pattern: /^(happy\s*frog|ocean\s*forest|coco\s*loco|bush\s*doctor)/i, brand: 'Fox Farm' },
  
  // Botanicare products
  { pattern: /^(pure\s*blend|liquid\s*karma|silica\s*blast|cal-?mag|hydroguard)/i, brand: 'Botanicare' },
  
  // Technaflora products
  { pattern: /^(better\s*bloom|jungle\s*green|yield\s*up|bc\s*(grow|bloom|boost))/i, brand: 'Technaflora' },
  { pattern: /^(awesome\s*blossoms|thrive\s*alive|sugar\s*daddy|root\s*66)/i, brand: 'Technaflora' },
  { pattern: /^(magical|pura\s*vida)/i, brand: 'Technaflora' },
  
  // Humboldt Nutrients products (expanded - catches all Humboldt product lines)
  { pattern: /^humboldt\s+(grow|bloom|micro|honey|roots|sticky)/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(hum-?bolt|flavor-?ful|mayan\s*microzyme|prozyme|myco\s*(madness|maximum))/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(royal\s*(black|gold|flush)|ginormous|grow\s*natural|bloom\s*natural)/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(deuce\s*deuce|dueceduece|hydro-?deuce|equilibrium|the\s*hammer)/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(ton\s*o\s*bud|calyx\s*magnum|prop-?o-?gator)/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(double\s*super|suck\s*it\s*up|verde)/i, brand: 'Humboldt Nutrients' },
  { pattern: /^(big\s*up\s*powder|sea\s*cal|sea\s*mag|master\s*[ab]|oneness|calcarb)/i, brand: 'Humboldt Nutrients' },
  
  // ONA Products (odor control)
  { pattern: /^ona\s+(block|liquid|gel|mist|spray)/i, brand: 'ONA Products' },
  
  // Emerald Harvest products
  { pattern: /^(cali\s*pro|honey\s*chome|king\s*kola|emerald\s*goddess)/i, brand: 'Emerald Harvest' },
  { pattern: /^(root\s*wizard|sturdy\s*stalk)/i, brand: 'Emerald Harvest' },
  
  // Lighting brands
  { pattern: /^sunblaster/i, brand: 'SunBlaster' },
  { pattern: /^solarmax/i, brand: 'SolarMax' },
  { pattern: /hortilux/i, brand: 'EYE Hortilux' },
  { pattern: /^philips/i, brand: 'Philips' },
  { pattern: /^badboy/i, brand: 'BADBOY' },
  
  // Equipment brands
  { pattern: /^doktor\s*doom/i, brand: 'Doktor Doom' },
  { pattern: /^safer\s/i, brand: 'Safer' },
  { pattern: /^timemist/i, brand: 'TimeMist' },
  { pattern: /^tnc\s/i, brand: 'TNC' },
  { pattern: /vortex\s*(powerfan|fan)/i, brand: 'Vortex' },
  { pattern: /^green\s*air/i, brand: 'Green Air' },
  { pattern: /^snapture/i, brand: 'Snapture' },
  { pattern: /^mag\s*drive/i, brand: 'Mag Drive' },
  { pattern: /^light\s*rail/i, brand: 'Light Rail' },
  { pattern: /^block-?ir/i, brand: 'Block-IR' },
  { pattern: /^plantacillin/i, brand: 'Humboldt Nutrients' },
  
  // Filters & fans
  { pattern: /^can\s*\d+\s*filter/i, brand: 'CAN' },
  { pattern: /^can-?lite/i, brand: 'Can-Lite' },
  { pattern: /^max-?fan/i, brand: 'Can' },
  { pattern: /^(original\s*)?can\s*fan/i, brand: 'CAN' },
  { pattern: /^profilter/i, brand: 'CAN' },
  
  // Trimming
  { pattern: /^trimpro/i, brand: 'TRIMPRO' },
  { pattern: /^the\s*trimpro/i, brand: 'TRIMPRO' },
  
  // Root/propagation
  { pattern: /^root\s*pouch/i, brand: 'Root Pouch' },
];

// Extract brand/vendor from product name (with normalization)
function extractVendor(name, existingVendor) {
  // Normalize existing vendor first
  if (existingVendor && existingVendor.trim()) {
    return normalizeVendor(existingVendor.trim());
  }
  if (!name) return '';
  
  const decoded = stripHtmlTags(name);
  const lowerName = decoded.toLowerCase();
  
  // First check product name patterns
  for (const { pattern, brand } of BRAND_PRODUCT_PATTERNS) {
    if (pattern.test(decoded)) {
      return normalizeVendor(brand);
    }
  }
  
  // Then check for brand names in product name
  for (const brand of KNOWN_BRANDS) {
    if (lowerName.includes(brand.toLowerCase())) {
      return normalizeVendor(brand);
    }
  }
  return '';
}

// Generate handle
function generateHandle(title) {
  return stripHtmlTags(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 100);
}

// Escape CSV
function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Parse CSV
function parseCSV(content) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i], nextChar = content[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field.trim()); field = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(field.trim());
        if (row.length > 1 || row[0]) rows.push(row);
        row = []; field = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { field += char; }
    }
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] || '');
    return obj;
  });
}

// Analyze children to determine option structure
function analyzeChildren(children) {
  // Extract base names from children
  const baseNames = new Set();
  const sizes = [];
  
  for (const child of children) {
    const { base, size, originalBase } = extractBaseAndSize(child.name);
    if (base && size) {
      baseNames.add(originalBase);
      sizes.push(size);
    } else {
      // No size pattern - treat whole name as the variant
      baseNames.add(child.name);
    }
  }
  
  // If all children share the same base name -> single option (Size)
  // If children have different base names -> two options (Product, Size)
  return {
    needsTwoOptions: baseNames.size > 1,
    uniqueBaseNames: [...baseNames],
    hasSize: sizes.length > 0
  };
}

// Main processing
async function buildGroupedVariants() {
  console.log('📖 Reading WooCommerce export...');
  const content = fs.readFileSync(WOO_EXPORT, 'utf-8');
  const products = parseCSV(content);
  console.log(`   Found ${products.length} total products`);
  
  // Index products
  const productsByName = new Map();
  const productsByNormalized = new Map();
  products.forEach(p => {
    const name = p['Product Name']?.trim();
    if (name) {
      productsByName.set(name.toLowerCase(), p);
      productsByNormalized.set(normalizeForMatch(name), p);
    }
  });
  
  const shopifyRows = [];
  const processedProducts = new Set();
  let processedGroups = 0;
  let multiOptionGroups = 0;
  let seriesDetected = 0;
  let standaloneCount = 0;
  
  // =========================================
  // PHASE 1: Process WooCommerce Grouped Products
  // =========================================
  console.log('\n📦 Phase 1: Processing WooCommerce grouped products...');
  const groupedProducts = products.filter(p => p['Type'] === 'grouped');
  console.log(`   Found ${groupedProducts.length} grouped products`);
  
  // Track which product rows (by Woo row index) have been used
  const usedProductIndices = new Set();
  products.forEach((p, idx) => p._rowIndex = idx);
  
  for (const parent of groupedProducts) {
    const parentName = parent['Product Name']?.trim();
    const childrenField = parent['Grouped products']?.trim();
    if (!childrenField) continue;
    
    // Mark parent as processed
    processedProducts.add(parentName.toLowerCase());
    
    const childNames = childrenField.split('|~|').map(c => c.trim()).filter(c => c);
    const children = [];
    const seenChildSKUs = new Set(); // Dedupe within this group
    
    for (const childName of childNames) {
      let child = productsByName.get(childName.toLowerCase());
      if (!child) child = productsByNormalized.get(normalizeForMatch(childName));
      if (child) {
        const childKey = child['Product Name']?.toLowerCase().trim();
        const sku = child['Sku'] || '';
        
        // Skip if this child was already used in another group OR duplicate within this group
        if (processedProducts.has(childKey) || usedProductIndices.has(child._rowIndex)) continue;
        if (sku && seenChildSKUs.has(sku)) continue; // Same SKU = duplicate
        
        children.push({ name: childName, data: child });
        processedProducts.add(childKey);
        usedProductIndices.add(child._rowIndex);
        if (sku) seenChildSKUs.add(sku);
      }
    }
    
    if (children.length === 0) continue;
    
    const handle = generateHandle(parentName);
    const analysis = analyzeChildren(children);
    const parentVendor = extractVendor(parentName, parent['Brands']);
    
    if (analysis.needsTwoOptions && analysis.hasSize) {
      // Multi-option structure: Option1=Product, Option2=Size
      multiOptionGroups++;
      
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const { originalBase, size } = extractBaseAndSize(child.name);
        const isFirst = i === 0;
        const vendor = extractVendor(child.name, child.data['Brands']) || parentVendor;
        
        shopifyRows.push({
          Handle: handle,
          Title: isFirst ? stripHtmlTags(parentName) : '',
          'Body (HTML)': isFirst ? (parent['Product description'] || child.data['Product description'] || '') : '',
          Vendor: isFirst ? vendor : '',
          'Product Category': isFirst ? (parent['Product categories'] || '') : '',
          Type: isFirst ? (parent['Product categories']?.split('>')[0]?.trim() || '') : '',
          Tags: isFirst ? (parent['Product tags'] || '') : '',
          Published: isFirst ? 'TRUE' : '',
          'Option1 Name': isFirst ? 'Product' : '',
          'Option1 Value': stripHtmlTags(originalBase || child.name),
          'Option2 Name': isFirst ? 'Size' : '',
          'Option2 Value': size || 'Default',
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': child.data['Sku'] || '',
          'Variant Grams': Math.round((parseFloat(child.data['Weight']) || 0) * 453.592),
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': child.data['Stock'] || '0',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': child.data['Regular Price'] || child.data['Price'] || '',
          'Variant Compare At Price': child.data['Sale Price'] ? child.data['Regular Price'] : '',
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Barcode': child.data['GTIN, UPC, EAN, or ISBN'] || '',
          'Image Src': isFirst ? (child.data['Image URL'] || '') : '',
          'Image Position': isFirst ? '1' : '',
          'Image Alt Text': isFirst ? stripHtmlTags(parentName) : '',
          'SEO Title': isFirst ? (parent['SEO Title'] || stripHtmlTags(parentName)) : '',
          'SEO Description': isFirst ? (parent['SEO Meta Description'] || '') : '',
          'Gift Card': isFirst ? 'FALSE' : '',
          Status: isFirst ? 'active' : ''
        });
      }
    } else {
      // Single option structure
      const hasVolume = children.some(c => /\b(qt|qts?|pt|gal|oz|liter|L|ml)\b/i.test(c.name));
      const optionName = hasVolume ? 'Size' : 'Variant';
      
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const { size } = extractBaseAndSize(child.name);
        const isFirst = i === 0;
        const vendor = extractVendor(child.name, child.data['Brands']) || parentVendor;
        
        shopifyRows.push({
          Handle: handle,
          Title: isFirst ? stripHtmlTags(parentName) : '',
          'Body (HTML)': isFirst ? (parent['Product description'] || child.data['Product description'] || '') : '',
          Vendor: isFirst ? vendor : '',
          'Product Category': isFirst ? (parent['Product categories'] || '') : '',
          Type: isFirst ? (parent['Product categories']?.split('>')[0]?.trim() || '') : '',
          Tags: isFirst ? (parent['Product tags'] || '') : '',
          Published: isFirst ? 'TRUE' : '',
          'Option1 Name': isFirst ? optionName : '',
          'Option1 Value': stripHtmlTags(size || child.name),
          'Option2 Name': '',
          'Option2 Value': '',
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': child.data['Sku'] || '',
          'Variant Grams': Math.round((parseFloat(child.data['Weight']) || 0) * 453.592),
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': child.data['Stock'] || '0',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': child.data['Regular Price'] || child.data['Price'] || '',
          'Variant Compare At Price': child.data['Sale Price'] ? child.data['Regular Price'] : '',
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Barcode': child.data['GTIN, UPC, EAN, or ISBN'] || '',
          'Image Src': isFirst ? (child.data['Image URL'] || '') : '',
          'Image Position': isFirst ? '1' : '',
          'Image Alt Text': isFirst ? stripHtmlTags(parentName) : '',
          'SEO Title': isFirst ? (parent['SEO Title'] || stripHtmlTags(parentName)) : '',
          'SEO Description': isFirst ? (parent['SEO Meta Description'] || '') : '',
          'Gift Card': isFirst ? 'FALSE' : '',
          Status: isFirst ? 'active' : ''
        });
      }
    }
    
    processedGroups++;
    processedProducts.add(parentName.toLowerCase());
  }
  console.log(`   Processed ${processedGroups} grouped products (${multiOptionGroups} with multi-option variants)`);
  
  // =========================================
  // PHASE 2: Detect Series in Simple Products
  // =========================================
  console.log('\n🔍 Phase 2: Detecting series patterns...');
  
  const simpleProducts = products.filter(p => 
    p['Type'] === 'simple' && 
    !processedProducts.has(p['Product Name']?.toLowerCase().trim()) &&
    !usedProductIndices.has(p._rowIndex)
  );
  
  const seriesGroups = new Map();
  for (const product of simpleProducts) {
    const name = product['Product Name']?.trim();
    const { base, size, originalBase } = extractBaseAndSize(name);
    if (base && size) {
      if (!seriesGroups.has(base)) {
        seriesGroups.set(base, { originalBase, products: [] });
      }
      seriesGroups.get(base).products.push({ name, size, data: product });
    }
  }
  
  for (const [base, group] of seriesGroups) {
    if (group.products.length < 2) continue;
    
    const handle = generateHandle(group.originalBase);
    
    // Deduplicate by size (same size = skip) and by row index
    const seenSizes = new Set();
    const prods = group.products.filter(p => {
      if (usedProductIndices.has(p.data._rowIndex)) return false;
      if (seenSizes.has(p.size)) return false;
      seenSizes.add(p.size);
      return true;
    });
    
    if (prods.length < 2) continue; // Need at least 2 for variant grouping
    
    for (let i = 0; i < prods.length; i++) {
      const p = prods[i];
      const isFirst = i === 0;
      const vendor = extractVendor(p.name, p.data['Brands']);
      
      shopifyRows.push({
        Handle: handle,
        Title: isFirst ? stripHtmlTags(group.originalBase) : '',
        'Body (HTML)': isFirst ? (p.data['Product description'] || '') : '',
        Vendor: isFirst ? vendor : '',
        'Product Category': isFirst ? (p.data['Product categories'] || '') : '',
        Type: isFirst ? (p.data['Product categories']?.split('>')[0]?.trim() || '') : '',
        Tags: isFirst ? (p.data['Product tags'] || '') : '',
        Published: isFirst ? 'TRUE' : '',
        'Option1 Name': isFirst ? 'Size' : '',
        'Option1 Value': p.size,
        'Option2 Name': '',
        'Option2 Value': '',
        'Option3 Name': '',
        'Option3 Value': '',
        'Variant SKU': p.data['Sku'] || '',
        'Variant Grams': Math.round((parseFloat(p.data['Weight']) || 0) * 453.592),
        'Variant Inventory Tracker': 'shopify',
        'Variant Inventory Qty': p.data['Stock'] || '0',
        'Variant Inventory Policy': 'deny',
        'Variant Fulfillment Service': 'manual',
        'Variant Price': p.data['Regular Price'] || p.data['Price'] || '',
        'Variant Compare At Price': p.data['Sale Price'] ? p.data['Regular Price'] : '',
        'Variant Requires Shipping': 'TRUE',
        'Variant Taxable': 'TRUE',
        'Variant Barcode': p.data['GTIN, UPC, EAN, or ISBN'] || '',
        'Image Src': isFirst ? (p.data['Image URL'] || '') : '',
        'Image Position': isFirst ? '1' : '',
        'Image Alt Text': isFirst ? stripHtmlTags(group.originalBase) : '',
        'SEO Title': isFirst ? (p.data['SEO Title'] || stripHtmlTags(group.originalBase)) : '',
        'SEO Description': isFirst ? (p.data['SEO Meta Description'] || '') : '',
        'Gift Card': isFirst ? 'FALSE' : '',
        Status: isFirst ? 'active' : ''
      });
      
      processedProducts.add(p.name.toLowerCase());
      usedProductIndices.add(p.data._rowIndex);
    }
    seriesDetected++;
  }
  console.log(`   Detected ${seriesDetected} series patterns`);
  
  // =========================================
  // PHASE 3: Standalone Products
  // =========================================
  console.log('\n📦 Phase 3: Processing standalone products...');
  
  const remainingProducts = products.filter(p => {
    const name = p['Product Name']?.toLowerCase().trim();
    return p['Type'] === 'simple' && 
           !processedProducts.has(name) && 
           !usedProductIndices.has(p._rowIndex);
  });
  
  // Track handles to prevent duplicate standalone products
  const usedHandles = new Set();
  
  for (const product of remainingProducts) {
    const name = product['Product Name']?.trim();
    if (!name) continue;
    
    const handle = generateHandle(name);
    if (usedHandles.has(handle)) continue; // Skip duplicate handles
    usedHandles.add(handle);
    
    const vendor = extractVendor(name, product['Brands']);
    
    shopifyRows.push({
      Handle: handle,
      Title: stripHtmlTags(name),
      'Body (HTML)': product['Product description'] || '',
      Vendor: vendor,
      'Product Category': product['Product categories'] || '',
      Type: product['Product categories']?.split('>')[0]?.trim() || '',
      Tags: product['Product tags'] || '',
      Published: 'TRUE',
      'Option1 Name': 'Title',
      'Option1 Value': 'Default Title',
      'Option2 Name': '',
      'Option2 Value': '',
      'Option3 Name': '',
      'Option3 Value': '',
      'Variant SKU': product['Sku'] || '',
      'Variant Grams': Math.round((parseFloat(product['Weight']) || 0) * 453.592),
      'Variant Inventory Tracker': 'shopify',
      'Variant Inventory Qty': product['Stock'] || '0',
      'Variant Inventory Policy': 'deny',
      'Variant Fulfillment Service': 'manual',
      'Variant Price': product['Regular Price'] || product['Price'] || '',
      'Variant Compare At Price': product['Sale Price'] ? product['Regular Price'] : '',
      'Variant Requires Shipping': 'TRUE',
      'Variant Taxable': 'TRUE',
      'Variant Barcode': product['GTIN, UPC, EAN, or ISBN'] || '',
      'Image Src': product['Image URL'] || '',
      'Image Position': '1',
      'Image Alt Text': stripHtmlTags(name),
      'SEO Title': product['SEO Title'] || stripHtmlTags(name),
      'SEO Description': product['SEO Meta Description'] || '',
      'Gift Card': 'FALSE',
      Status: 'active'
    });
    standaloneCount++;
  }
  console.log(`   Added ${standaloneCount} standalone products`);
  
  // =========================================
  // POST-PROCESSING IMPROVEMENTS (v4)
  // =========================================
  
  // 1. Fix HTML entities in Type field
  console.log('\n🔧 Post-processing: Fixing HTML entities...');
  let htmlFixed = 0;
  for (const row of shopifyRows) {
    if (row.Type && row.Type.includes('&')) {
      row.Type = decodeHtmlEntities(row.Type);
      htmlFixed++;
    }
    // Also fix Body HTML entities in display fields
    if (row.Title && row.Title.includes('&#')) {
      row.Title = decodeHtmlEntities(row.Title);
    }
  }
  console.log(`   Fixed HTML entities in ${htmlFixed} Type fields`);
  
  // 2. Truncate long option values
  console.log('\n🔧 Post-processing: Truncating long option values...');
  let truncated = 0;
  for (const row of shopifyRows) {
    if (row['Option1 Value'] && row['Option1 Value'].length > 40) {
      row['Option1 Value'] = truncateOption(row['Option1 Value'], 40);
      truncated++;
    }
    if (row['Option2 Value'] && row['Option2 Value'].length > 40) {
      row['Option2 Value'] = truncateOption(row['Option2 Value'], 40);
      truncated++;
    }
  }
  console.log(`   Truncated ${truncated} long option values`);
  
  // 3. Clean up mixed "Default" values in multi-option products
  console.log('\n🔧 Post-processing: Cleaning mixed Default variants...');
  const handleGroups = new Map();
  for (const row of shopifyRows) {
    if (!handleGroups.has(row.Handle)) handleGroups.set(row.Handle, []);
    handleGroups.get(row.Handle).push(row);
  }
  
  let defaultsCleaned = 0;
  for (const [handle, rows] of handleGroups) {
    const opt2Values = rows.map(r => r['Option2 Value']).filter(v => v);
    const hasDefault = opt2Values.includes('Default');
    const hasOther = opt2Values.some(v => v && v !== 'Default');
    
    if (hasDefault && hasOther) {
      // Mixed case - replace "Default" with "Standard" or extract from Option1
      for (const row of rows) {
        if (row['Option2 Value'] === 'Default') {
          // Try to infer from Option1 Value or use "Standard"
          row['Option2 Value'] = 'Standard';
          defaultsCleaned++;
        }
      }
    }
  }
  console.log(`   Cleaned ${defaultsCleaned} mixed Default values`);
  
  // 3b. Remove duplicate option combinations (can happen after truncation)
  console.log('\n🔧 Post-processing: Removing duplicate option combos...');
  const seenCombos = new Set();
  const deduplicatedRows = [];
  let dupesRemoved = 0;
  
  for (const row of shopifyRows) {
    const key = `${row.Handle}|${row['Option1 Value']}|${row['Option2 Value']}`;
    if (seenCombos.has(key)) {
      dupesRemoved++;
      continue; // Skip duplicate
    }
    seenCombos.add(key);
    deduplicatedRows.push(row);
  }
  
  // Replace shopifyRows with deduplicated version
  shopifyRows.length = 0;
  shopifyRows.push(...deduplicatedRows);
  console.log(`   Removed ${dupesRemoved} duplicate option combinations`);
  
  // 4. Generate tags for products without tags
  console.log('\n🔧 Post-processing: Generating tags...');
  let tagsGenerated = 0;
  for (const row of shopifyRows) {
    if (row.Title) { // First row of product
      const newTags = generateTags(row.Type, row['Product Category'], row.Vendor, row.Tags);
      if (newTags && newTags !== row.Tags) {
        row.Tags = newTags;
        tagsGenerated++;
      }
    }
  }
  console.log(`   Generated/enhanced tags for ${tagsGenerated} products`);
  
  // 5. Apply fallback prices for products with missing/zero prices
  console.log('\n🔧 Post-processing: Applying fallback prices...');
  let fallbackApplied = 0;
  for (const row of shopifyRows) {
    const price = parseFloat(row['Variant Price'] || '0');
    if (!price || price === 0) {
      const fallbackPrice = getFallbackPrice(row.Handle || '', row.Title || '');
      if (fallbackPrice) {
        row['Variant Price'] = fallbackPrice;
        fallbackApplied++;
        console.log(`   💵 Applied fallback price $${fallbackPrice} to: ${row.Title || row.Handle}`);
      }
    }
  }
  console.log(`   Applied ${fallbackApplied} fallback prices from online research`);
  
  // Post-process: Mark remaining products with missing/zero prices as draft
  console.log('\n🔧 Post-processing: Checking for remaining missing prices...');
  const handlesWithBadPrices = new Set();
  for (const row of shopifyRows) {
    const price = parseFloat(row['Variant Price'] || '0');
    if (!price || price === 0) {
      handlesWithBadPrices.add(row.Handle);
    }
  }
  
  let draftCount = 0;
  for (const row of shopifyRows) {
    if (handlesWithBadPrices.has(row.Handle) && row.Status === 'active') {
      row.Status = 'draft';
      draftCount++;
    }
  }
  console.log(`   Marked ${draftCount} products as draft (still missing price after fallback)`);
  
  // Write output
  console.log('\n📝 Writing Shopify import CSV...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const csvContent = [
    SHOPIFY_HEADER.join(','),
    ...shopifyRows.map(row => SHOPIFY_HEADER.map(h => escapeCSV(row[h] || '')).join(','))
  ].join('\n');
  
  fs.writeFileSync(OUTPUT_FILE, csvContent);
  
  // Summary
  console.log('\n✅ Complete!');
  console.log(`   📊 WooCommerce grouped: ${processedGroups} (${multiOptionGroups} multi-option)`);
  console.log(`   🔍 Series detected: ${seriesDetected}`);
  console.log(`   📦 Standalone: ${standaloneCount}`);
  console.log(`   📋 Total rows: ${shopifyRows.length}`);
  console.log(`\n   Output: ${OUTPUT_FILE}`);
}

buildGroupedVariants().catch(console.error);
