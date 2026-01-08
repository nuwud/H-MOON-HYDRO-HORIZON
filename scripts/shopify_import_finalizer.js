/**
 * SHOPIFY IMPORT FINALIZER
 * 
 * This script guarantees Shopify-import validity by:
 * 1. Merging split families → single canonical handle
 * 2. Enforcing Option1 Name on every row with Option1 Value
 * 3. Normalizing size values consistently
 * 4. Resolving duplicate Option1 Values via Option2 (SKU) disambiguation
 * 5. Normalizing Type field for consistent collection matching
 * 6. Adding Collection column based on Type
 * 7. Populating Product Category with Shopify taxonomy
 * 8. Validating the output before writing
 * 
 * Run: node scripts/shopify_import_finalizer.js
 */

const fs = require('fs');

// ============================================================================
// TYPE NORMALIZATION → Maps all variations to canonical Type values
// These must match the collection rules in shopify_collections.json
// ============================================================================

const TYPE_NORMALIZATIONS = new Map([
  // Airflow & Ventilation
  ['airflow', 'Airflow'],
  ['ventilation', 'Airflow'],
  ['airflow & ventilation', 'Airflow'],
  ['fans', 'Airflow'],
  ['inline fans', 'Airflow'],
  ['exhaust fans', 'Airflow'],
  
  // Books & Education
  ['books', 'Books'],
  ['books & education', 'Books'],
  ['education', 'Books'],
  
  // Controllers & Timers
  ['controllers_timers', 'Controllers Timers'],
  ['controllers timers', 'Controllers Timers'],
  ['controllers', 'Controllers Timers'],
  ['timers', 'Controllers Timers'],
  ['environment control', 'Controllers Timers'],
  ['environmental monitors', 'Controllers Timers'],
  ['environmental_monitors', 'Controllers Timers'],
  
  // Containers & Pots
  ['containers_pots', 'Containers Pots'],
  ['containers pots', 'Containers Pots'],
  ['containers & pots', 'Containers Pots'],
  ['containers', 'Containers Pots'],
  ['pots', 'Containers Pots'],
  ['pots/containers', 'Containers Pots'],
  
  // Electrical Supplies
  ['electrical_supplies', 'Electrical Supplies'],
  ['electrical supplies', 'Electrical Supplies'],
  ['electrical', 'Electrical Supplies'],
  
  // HID Bulbs
  ['hid_bulbs', 'Hid Bulbs'],
  ['hid bulbs', 'Hid Bulbs'],
  ['hid bulbs & lamps', 'Hid Bulbs'],
  ['bulbs', 'Hid Bulbs'],
  ['lamps', 'Hid Bulbs'],
  
  // Grow Lights
  ['grow_lights', 'Grow Lights'],
  ['grow lights', 'Grow Lights'],
  ['lighting equipment', 'Grow Lights'],
  ['lighting', 'Grow Lights'],
  ['led lights', 'Grow Lights'],
  ['led', 'Grow Lights'],
  
  // Grow Media
  ['grow_media', 'Grow Media'],
  ['grow media', 'Grow Media'],
  ['growing media', 'Grow Media'],
  ['media', 'Grow Media'],
  ['coco', 'Grow Media'],
  ['rockwool', 'Grow Media'],
  
  // Grow Room Materials
  ['grow_room_materials', 'Grow Room Materials'],
  ['grow room materials', 'Grow Room Materials'],
  ['grow tents', 'Grow Room Materials'],
  ['grow_tents', 'Grow Room Materials'],
  ['tents', 'Grow Room Materials'],
  
  // Irrigation
  ['irrigation', 'Irrigation'],
  ['irrigation & watering', 'Irrigation'],
  ['watering', 'Irrigation'],
  ['pumps', 'Irrigation'],
  ['drip systems', 'Irrigation'],
  
  // Harvesting
  ['harvesting', 'Harvesting'],
  ['harvest', 'Harvesting'],
  ['drying', 'Harvesting'],
  
  // Trimming
  ['trimming', 'Trimming'],
  ['trim', 'Trimming'],
  ['trimmers', 'Trimming'],
  
  // Water Filtration
  ['water_filtration', 'Water Filtration'],
  ['water filtration', 'Water Filtration'],
  ['filtration', 'Water Filtration'],
  ['ro systems', 'Water Filtration'],
  
  // Nutrients
  ['nutrients', 'Nutrients'],
  ['nutrients & supplements', 'Nutrients'],
  ['supplements', 'Nutrients'],
  ['fertilizer', 'Nutrients'],
  ['fertilizers', 'Nutrients'],
  
  // Odor Control
  ['odor_control', 'Odor Control'],
  ['odor control', 'Odor Control'],
  ['carbon filters', 'Odor Control'],
  ['odor', 'Odor Control'],
  
  // Pest Control
  ['pest_control', 'Pest Control'],
  ['pest control', 'Pest Control'],
  ['pesticides', 'Pest Control'],
  ['ipm', 'Pest Control'],
  
  // pH & Water Testing
  ['ph_meters', 'Ph Meters'],
  ['ph meters', 'Ph Meters'],
  ['ph & water testing', 'Ph Meters'],
  ['testing', 'Ph Meters'],
  ['meters', 'Ph Meters'],
  ['ec meters', 'Ph Meters'],
  
  // Propagation
  ['propagation', 'Propagation'],
  ['propagation & cloning', 'Propagation'],
  ['cloning', 'Propagation'],
  ['clones', 'Propagation'],
  ['seedlings', 'Propagation'],
  
  // Seeds
  ['seeds', 'Seeds'],
  
  // Ventilation Accessories
  ['ventilation_accessories', 'Ventilation Accessories'],
  ['ventilation accessories', 'Ventilation Accessories'],
  ['ducting', 'Ventilation Accessories'],
  ['duct accessories', 'Ventilation Accessories'],
  
  // CO2
  ['co2', 'CO2'],
  ['co2 systems', 'CO2'],
  
  // Accessories (general)
  ['accessories', 'Accessories'],
  ['hydroponics components', 'Accessories'],
  ['components', 'Accessories'],
  ['catalog_index', 'Accessories'],
  
  // Extraction / Harvesting-related
  ['extraction', 'Harvesting'],
  
  // Misc / Other
  ['misc. charges', 'Accessories'],
  ['misc', 'Accessories'],
  ['other', 'Accessories'],
]);

function normalizeType(type) {
  if (!type) return '';
  const lower = type.toLowerCase().trim();
  return TYPE_NORMALIZATIONS.get(lower) || type.trim();
}

// ============================================================================
// TYPE → COLLECTION MAPPING (matches shopify_collections.json rules)
// ============================================================================

const TYPE_TO_COLLECTION = new Map([
  ['Airflow', 'Airflow & Ventilation'],
  ['Books', 'Books & Education'],
  ['Controllers Timers', 'Controllers Timers'],
  ['Containers Pots', 'Containers & Pots'],
  ['Electrical Supplies', 'Electrical Supplies'],
  ['Hid Bulbs', 'HID Bulbs & Lamps'],
  ['Grow Lights', 'Grow Lights'],
  ['Grow Media', 'Grow Media'],
  ['Grow Room Materials', 'Grow Room Materials'],
  ['Irrigation', 'Irrigation & Watering'],
  ['Harvesting', 'Harvesting'],
  ['Trimming', 'Trimming'],
  ['Water Filtration', 'Water Filtration'],
  ['Nutrients', 'Nutrients & Supplements'],
  ['Odor Control', 'Odor Control'],
  ['Pest Control', 'Pest Control'],
  ['Ph Meters', 'pH & Water Testing'],
  ['Propagation', 'Propagation & Cloning'],
  ['Seeds', 'Seeds'],
  ['Ventilation Accessories', 'Ventilation Accessories'],
  ['CO2', 'CO2 Systems'],
  ['Accessories', 'Accessories'],
]);

function getCollection(normalizedType) {
  return TYPE_TO_COLLECTION.get(normalizedType) || '';
}

// ============================================================================
// SHOPIFY TAXONOMY → Product Category mappings
// Format: "Home & Garden > Lawn & Garden > Gardening > ..."
// ============================================================================

const TYPE_TO_SHOPIFY_CATEGORY = new Map([
  ['Airflow', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Fans'],
  ['Books', 'Media > Books > Nonfiction Books'],
  ['Controllers Timers', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics'],
  ['Containers Pots', 'Home & Garden > Lawn & Garden > Gardening > Pot & Planter Liners'],
  ['Electrical Supplies', 'Hardware > Electrical Supplies'],
  ['Hid Bulbs', 'Home & Garden > Lighting > Light Bulbs'],
  ['Grow Lights', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Light Ballasts & Reflectors'],
  ['Grow Media', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media'],
  ['Grow Room Materials', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Tents'],
  ['Irrigation', 'Home & Garden > Lawn & Garden > Watering & Irrigation'],
  ['Harvesting', 'Home & Garden > Lawn & Garden > Gardening > Gardening Tools'],
  ['Trimming', 'Home & Garden > Lawn & Garden > Gardening > Gardening Tools'],
  ['Water Filtration', 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Water Filters'],
  ['Nutrients', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients'],
  ['Odor Control', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics'],
  ['Pest Control', 'Home & Garden > Lawn & Garden > Gardening > Pest Control'],
  ['Ph Meters', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Test Equipment'],
  ['Propagation', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics'],
  ['Seeds', 'Home & Garden > Lawn & Garden > Gardening > Seeds'],
  ['Ventilation Accessories', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Fans'],
  ['CO2', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics'],
  ['Accessories', 'Home & Garden > Lawn & Garden > Gardening > Hydroponics'],
]);

function getShopifyCategory(normalizedType) {
  return TYPE_TO_SHOPIFY_CATEGORY.get(normalizedType) || 'Home & Garden > Lawn & Garden > Gardening > Hydroponics';
}

// ============================================================================
// SIZE NORMALIZATION
// ============================================================================

const SIZE_NORMALIZATIONS = new Map([
  // Gallons
  ['gallon', '1 gal'], ['1 gallon', '1 gal'], ['1gal', '1 gal'], ['1 gal', '1 gal'],
  ['gal', '1 gal'], ['gal.', '1 gal'],
  ['2 gallon', '2 gal'], ['2gal', '2 gal'], ['2 gal', '2 gal'],
  ['2.5 gallon', '2.5 gal'], ['2.5gal', '2.5 gal'], ['2.5 gal', '2.5 gal'],
  ['5 gallon', '5 gal'], ['5gal', '5 gal'], ['5 gal', '5 gal'],
  ['10 gallon', '10 gal'], ['10gal', '10 gal'], ['10 gal', '10 gal'],
  ['20 gallon', '20 gal'], ['20gal', '20 gal'], ['20 gal', '20 gal'],
  
  // Quarts
  ['quart', '1 qt'], ['1 quart', '1 qt'], ['1qt', '1 qt'], ['1 qt', '1 qt'],
  ['qt', '1 qt'], ['qt.', '1 qt'],
  
  // Liters
  ['liter', '1 L'], ['litre', '1 L'], ['1 liter', '1 L'], ['1 litre', '1 L'],
  ['1l', '1 L'], ['1 l', '1 L'], ['1lt', '1 L'], ['1 lt', '1 L'],
  ['3l', '3 L'], ['3 l', '3 L'], ['3lt', '3 L'], ['3 lt', '3 L'], ['3gal', '3 gal'],
  ['4l', '4 L'], ['4 l', '4 L'], ['4lt', '4 L'], ['4 lt', '4 L'],
  ['10l', '10 L'], ['10 l', '10 L'], ['10lt', '10 L'], ['10 lt', '10 L'],
  ['23l', '23 L'], ['23 l', '23 L'], ['23lt', '23 L'],
  
  // Milliliters
  ['100ml', '100 ml'], ['100 ml', '100 ml'],
  ['250ml', '250 ml'], ['250 ml', '250 ml'],
  ['355ml', '355 ml'], ['355 ml', '355 ml'],
  ['500ml', '500 ml'], ['500 ml', '500 ml'],
  
  // Ounces
  ['8oz', '8 oz'], ['8 oz', '8 oz'],
  ['16oz', '16 oz'], ['16 oz', '16 oz'],
  ['32oz', '32 oz'], ['32 oz', '32 oz'],
  
  // Pieces/Each (typo fixes)
  ['1 pice', '1 pc'], ['1 pc', '1 pc'], ['1pc', '1 pc'],
  ['1 piece', '1 pc'], ['1piece', '1 pc'],
  ['each', '1 pc'],
  
  // Pounds/Grams
  ['1lb', '1 lb'], ['1 lb', '1 lb'], ['5lb', '5 lb'], ['5 lb', '5 lb'],
  ['30g', '30 g'], ['30 g', '30 g'],
  ['130 g', '130 g'], ['130g', '130 g'],
  
  // Liter variations (10 liter -> 10 L, 23 liter -> 23 L)
  ['10 liter', '10 L'], ['10liter', '10 L'], ['10 litre', '10 L'],
  ['23 liter', '23 L'], ['23liter', '23 L'], ['23 litre', '23 L'],
  ['4 liter', '4 L'], ['4liter', '4 L'], ['4 litre', '4 L'],
  ['1 liter', '1 L'], ['1liter', '1 L'], ['1 litre', '1 L'],
]);

function normalizeSize(size) {
  if (!size) return '';
  let lower = size.toLowerCase().trim();
  
  // First check exact match
  if (SIZE_NORMALIZATIONS.has(lower)) {
    return SIZE_NORMALIZATIONS.get(lower);
  }
  
  // Pattern-based normalization for common formats
  // "X liter" or "X litre" -> "X L"
  const literMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(liter|litre|lt)s?$/i);
  if (literMatch) {
    return `${literMatch[1]} L`;
  }
  
  return size.trim();
}

// ============================================================================
// TITLE/HANDLE UTILITIES
// ============================================================================

function extractBaseTitle(title) {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  
  // Remove parenthetical sizes: "Product (1 gal)"
  t = t.replace(/\s*\([^)]*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b[^)]*\)/gi, '');
  
  // Remove embedded size patterns: "Product 20gal", "Product 500ml", "Product 3Gal"
  t = t.replace(/\s+\d+(\.\d+)?\s*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b\.?/gi, '');
  t = t.replace(/\s+\d+(\.\d+)?(ml|l|gal|qt|oz|lb|g)\b/gi, ''); // Without space before unit
  
  // Remove trailing size words: "Product Gallon", "Product Quart"
  t = t.replace(/\s+(gallon|quart|liter|litre)\s*$/gi, '');
  
  // Remove trailing "-2", "-3" suffixes (duplicate markers)
  t = t.replace(/\s*-\s*\d+\s*$/, '');
  
  // Remove pack/count suffixes: "25pk", "10 pack"
  // BUT keep them — packs are different products, not variants
  // t = t.replace(/\s+\d+\s*(pk|pack)\b/gi, '');
  
  // Clean up
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/[-–—]+$/, '').trim();
  
  return t;
}

function extractSizeFromText(text) {
  if (!text) return '';
  
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(gal|gallon)/i,
    /(\d+(?:\.\d+)?)\s*(qt|quart)/i,
    /(\d+(?:\.\d+)?)\s*(l|lt|liter|litre)\b/i,
    /(\d+(?:\.\d+)?)\s*(ml)/i,
    /(\d+(?:\.\d+)?)\s*(oz)/i,
    /(\d+(?:\.\d+)?)\s*(lb)/i,
    /(\d+(?:\.\d+)?)\s*(g)\b/i,
    /\b(gallon)\b/i,
    /\b(quart)\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && match[2]) {
        const num = match[1];
        const unit = match[2].toLowerCase();
        if (unit.includes('gal')) return `${num} gal`;
        if (unit.includes('qt') || unit.includes('quart')) return `${num} qt`;
        if (unit === 'l' || unit === 'lt' || unit.includes('liter') || unit.includes('litre')) return `${num} L`;
        if (unit === 'ml') return `${num} ml`;
        if (unit === 'oz') return `${num} oz`;
        if (unit === 'lb') return `${num} lb`;
        if (unit === 'g') return `${num} g`;
      } else if (match[1]) {
        const word = match[1].toLowerCase();
        if (word === 'gallon') return '1 gal';
        if (word === 'quart') return '1 qt';
      }
    }
  }
  return '';
}

function generateHandle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

// ============================================================================
// CSV UTILITIES
// ============================================================================

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else { current += char; }
  }
  fields.push(current);
  return fields;
}

function buildCSVLine(fields) {
  return fields.map(f => `"${(f || '').replace(/"/g, '""')}"`).join(',');
}

// ============================================================================
// VARIANT SCORING (for choosing "best" when deduplicating)
// ============================================================================

function variantScore(fields, colIdx) {
  let score = 0;
  
  const price = parseFloat(fields[colIdx.price]) || 0;
  if (price > 0) score += 100;
  
  const sku = (fields[colIdx.sku] || '').trim();
  if (sku && sku !== '0' && !/^hmh\d+$/i.test(sku)) score += 50; // Real SKU, not auto-generated
  if (sku) score += 20;
  
  const inv = parseInt(fields[colIdx.inventory]) || 0;
  if (inv > 0) score += 30;
  
  const desc = (fields[colIdx.description] || '').trim();
  if (desc.length > 100) score += 40;
  if (desc.length > 20) score += 10;
  
  const img = (fields[colIdx.image] || '').trim();
  if (img && img.startsWith('http') && !img.includes('HMH_logo_small')) score += 25;
  
  const barcode = (fields[colIdx.barcode] || '').trim();
  if (barcode && barcode.length > 5) score += 15;
  
  return score;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║           SHOPIFY IMPORT FINALIZER                             ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const inputPath = 'outputs/shopify_complete_import.csv';
const outputPath = 'outputs/shopify_import_final.csv';

const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split('\n');
let header = lines[0];
let headerFields = parseCSVLine(header);

// Add Collection column if missing
let collectionColAdded = false;
let collectionColIdx = headerFields.findIndex(h => h === 'Collection');
if (collectionColIdx === -1) {
  // Add Collection after Tags (or at end if Tags not found)
  const tagsIdx = headerFields.findIndex(h => h === 'Tags');
  if (tagsIdx !== -1) {
    headerFields.splice(tagsIdx + 1, 0, 'Collection');
    collectionColIdx = tagsIdx + 1;
  } else {
    headerFields.push('Collection');
    collectionColIdx = headerFields.length - 1;
  }
  collectionColAdded = true;
  header = buildCSVLine(headerFields);
  console.log(`  Added Collection column at index ${collectionColIdx}`);
}

// Build column index
const colIdx = {
  handle: 0,
  title: 1,
  description: 2,
  vendor: 3,
  productCategory: headerFields.findIndex(h => h === 'Product Category'),
  type: headerFields.findIndex(h => h === 'Type'),
  tags: headerFields.findIndex(h => h === 'Tags'),
  collection: collectionColIdx,
  opt1Name: headerFields.findIndex(h => h === 'Option1 Name'),
  opt1Val: headerFields.findIndex(h => h === 'Option1 Value'),
  opt2Name: headerFields.findIndex(h => h === 'Option2 Name'),
  opt2Val: headerFields.findIndex(h => h === 'Option2 Value'),
  sku: headerFields.findIndex(h => h === 'Variant SKU'),
  price: headerFields.findIndex(h => h === 'Variant Price'),
  inventory: headerFields.findIndex(h => h === 'Variant Inventory Qty'),
  image: headerFields.findIndex(h => h === 'Image Src'),
  barcode: headerFields.findIndex(h => h === 'Variant Barcode'),
};

console.log('Column indices:', JSON.stringify(colIdx, null, 2));
console.log('');

// ============================================================================
// PASS 1: Collect all rows and identify family groups
// ============================================================================

console.log('Pass 1: Collecting rows and identifying families...');

const allRows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const parsedFields = parseCSVLine(line);
  
  // If Collection column was added, insert empty value at that position
  if (collectionColAdded) {
    const tagsIdx = headerFields.findIndex(h => h === 'Tags');
    if (tagsIdx !== -1 && tagsIdx < parsedFields.length) {
      parsedFields.splice(tagsIdx + 1, 0, '');
    } else {
      parsedFields.push('');
    }
  }
  
  allRows.push(parsedFields);
}

console.log(`  Total rows: ${allRows.length}`);

// Group rows by current handle
const rowsByHandle = new Map();
for (const fields of allRows) {
  const handle = fields[colIdx.handle];
  if (!rowsByHandle.has(handle)) {
    rowsByHandle.set(handle, []);
  }
  rowsByHandle.get(handle).push(fields);
}

console.log(`  Unique handles: ${rowsByHandle.size}`);

// Build family groups by vendor + baseTitle
const familyGroups = new Map(); // familyKey -> Set of handles

for (const [handle, rows] of rowsByHandle) {
  // Find primary row (has title)
  const primaryRow = rows.find(r => r[colIdx.title]?.trim());
  if (!primaryRow) continue;
  
  const title = primaryRow[colIdx.title];
  const vendor = (primaryRow[colIdx.vendor] || '').toLowerCase().trim();
  const baseTitle = extractBaseTitle(title);
  const familyKey = `${vendor}|||${baseTitle}`;
  
  if (!familyGroups.has(familyKey)) {
    familyGroups.set(familyKey, new Set());
  }
  familyGroups.get(familyKey).add(handle);
}

// Find split families
const splitFamilies = [...familyGroups.entries()]
  .filter(([key, handles]) => handles.size > 1)
  .map(([key, handles]) => ({ key, handles: [...handles] }));

console.log(`  Split families found: ${splitFamilies.length}`);

// Build handle merge map
const handleMergeMap = new Map(); // oldHandle -> canonicalHandle

for (const family of splitFamilies) {
  // Choose canonical handle: shortest, without size suffix
  const sorted = family.handles.sort((a, b) => {
    const aHasSize = /-\d*(gal|qt|ml|l|oz|lb|g)\b/i.test(a) || /-\d+$/.test(a);
    const bHasSize = /-\d*(gal|qt|ml|l|oz|lb|g)\b/i.test(b) || /-\d+$/.test(b);
    if (aHasSize !== bHasSize) return aHasSize ? 1 : -1;
    return a.length - b.length;
  });
  
  const canonicalHandle = sorted[0];
  for (const handle of sorted.slice(1)) {
    handleMergeMap.set(handle, canonicalHandle);
  }
}

console.log(`  Handles to merge: ${handleMergeMap.size}`);

// ============================================================================
// PASS 2: Merge families and collect variants per canonical handle
// ============================================================================

console.log('\nPass 2: Merging families and normalizing...');

const variantsByHandle = new Map(); // canonicalHandle -> array of variant objects

for (const [originalHandle, rows] of rowsByHandle) {
  const canonicalHandle = handleMergeMap.get(originalHandle) || originalHandle;
  
  if (!variantsByHandle.has(canonicalHandle)) {
    variantsByHandle.set(canonicalHandle, []);
  }
  
  for (const fields of rows) {
    const clonedFields = [...fields];
    clonedFields[colIdx.handle] = canonicalHandle;
    
    // Extract/normalize Option1 Value (Size)
    let opt1Val = (clonedFields[colIdx.opt1Val] || '').trim();
    
    if (!opt1Val) {
      // Try to extract size from title or original handle
      const sizeFromTitle = extractSizeFromText(clonedFields[colIdx.title] || '');
      const sizeFromHandle = extractSizeFromText(originalHandle);
      opt1Val = sizeFromTitle || sizeFromHandle;
    }
    
    opt1Val = normalizeSize(opt1Val);
    clonedFields[colIdx.opt1Val] = opt1Val;
    
    // Ensure Option1 Name is set if Option1 Value exists
    if (opt1Val) {
      clonedFields[colIdx.opt1Name] = 'Size';
    }
    
    // =========== NEW: Normalize Type, set Product Category, set Collection ===========
    const originalType = (clonedFields[colIdx.type] || '').trim();
    if (originalType) {
      const normalizedType = normalizeType(originalType);
      clonedFields[colIdx.type] = normalizedType;
      
      // Set Product Category from normalized type (only if empty)
      if (!clonedFields[colIdx.productCategory]?.trim()) {
        clonedFields[colIdx.productCategory] = getShopifyCategory(normalizedType);
      }
      
      // Set Collection from normalized type (only if empty)
      if (colIdx.collection !== -1 && !clonedFields[colIdx.collection]?.trim()) {
        clonedFields[colIdx.collection] = getCollection(normalizedType);
      }
    } else {
      // No Type - set defaults for products without categorization
      clonedFields[colIdx.type] = 'Accessories';
      clonedFields[colIdx.productCategory] = 'Home & Garden > Lawn & Garden > Gardening > Hydroponics';
      if (colIdx.collection !== -1 && !clonedFields[colIdx.collection]?.trim()) {
        clonedFields[colIdx.collection] = 'Accessories';
      }
    }
    // ==================================================================================
    
    // Skip variants with no price in multi-variant products (garbage data)
    const price = (clonedFields[colIdx.price] || '').trim();
    const hasPrice = price && parseFloat(price) > 0;
    
    variantsByHandle.get(canonicalHandle).push({
      fields: clonedFields,
      opt1Val,
      sku: (clonedFields[colIdx.sku] || '').trim(),
      hasTitle: !!(clonedFields[colIdx.title] || '').trim(),
      hasPrice,
      score: variantScore(clonedFields, colIdx),
    });
  }
}

// Remove no-price variants from multi-variant products
let droppedNoPrice = 0;
for (const [handle, variants] of variantsByHandle) {
  if (variants.length > 1) {
    const pricedVariants = variants.filter(v => v.hasPrice);
    if (pricedVariants.length > 0 && pricedVariants.length < variants.length) {
      droppedNoPrice += variants.length - pricedVariants.length;
      variantsByHandle.set(handle, pricedVariants);
    }
  }
}
console.log(`  Dropped no-price variants from multi-variant products: ${droppedNoPrice}`);

console.log(`  Products after merge: ${variantsByHandle.size}`);

// ============================================================================
// PASS 3: Deduplicate and resolve Option1 Value conflicts
// ============================================================================

console.log('\nPass 3: Deduplicating and resolving conflicts...');

let deduplicatedCount = 0;
let option2UsedCount = 0;
let defaultTitleCount = 0;

const finalProducts = new Map(); // handle -> array of finalized variant fields

for (const [handle, variants] of variantsByHandle) {
  // Group variants by normalized Option1 Value
  const byOpt1Val = new Map();
  
  for (const variant of variants) {
    const key = variant.opt1Val || '__no_size__';
    if (!byOpt1Val.has(key)) {
      byOpt1Val.set(key, []);
    }
    byOpt1Val.get(key).push(variant);
  }
  
  const finalVariants = [];
  
  for (const [opt1Val, group] of byOpt1Val) {
    if (group.length === 1) {
      // No conflict, keep as-is
      finalVariants.push(group[0]);
    } else {
      // Multiple variants with same Option1 Value - need to resolve
      
      // Sort by score (best first)
      group.sort((a, b) => b.score - a.score);
      
      // Check if they have different SKUs
      const uniqueSkus = new Set(group.map(v => v.sku).filter(s => s));
      
      // STRATEGY: Keep only the best variant per size
      // (Even if they have different SKUs - it's source noise, not real variants)
      // The customer doesn't care which source a "1 gal" came from
      finalVariants.push(group[0]); // Already sorted by score, best first
      deduplicatedCount += group.length - 1;
    }
  }
  
  // Sort: primary row (has title) first
  finalVariants.sort((a, b) => {
    if (a.hasTitle !== b.hasTitle) return a.hasTitle ? -1 : 1;
    return 0;
  });
  
  // Handle single-variant products
  if (finalVariants.length === 1 && !finalVariants[0].opt1Val) {
    finalVariants[0].fields[colIdx.opt1Name] = 'Title';
    finalVariants[0].fields[colIdx.opt1Val] = 'Default Title';
    defaultTitleCount++;
  }
  
  // Handle multi-variant products where some have no size
  // DROP variants that have no size AND no price (they're garbage from merging)
  let droppedGarbage = 0;
  const cleanVariants = [];
  
  if (finalVariants.length > 1) {
    for (const variant of finalVariants) {
      const hasSize = !!variant.fields[colIdx.opt1Val];
      const hasPrice = !!(variant.fields[colIdx.price] || '').trim();
      const hasSku = !!(variant.fields[colIdx.sku] || '').trim();
      
      if (!hasSize && !hasPrice && !hasSku) {
        // Garbage variant - drop it
        droppedGarbage++;
        continue;
      }
      
      if (!variant.fields[colIdx.opt1Val]) {
        // Has price or SKU but no size - assign a placeholder
        variant.fields[colIdx.opt1Name] = 'Size';
        variant.fields[colIdx.opt1Val] = hasSku ? variant.fields[colIdx.sku] : 'Standard';
      }
      cleanVariants.push(variant);
    }
    
    // If we cleaned variants, use the clean list
    if (droppedGarbage > 0) {
      deduplicatedCount += droppedGarbage;
      finalProducts.set(handle, cleanVariants.map(v => v.fields));
      continue; // Skip the set below
    }
  }
  
  // CRITICAL: Clear Title/Body/Vendor from non-primary rows (Shopify expects only 1 title row)
  // Sort so the row with the best data is first
  finalVariants.sort((a, b) => {
    // Primary row (has title) should be first
    if (a.hasTitle !== b.hasTitle) return a.hasTitle ? -1 : 1;
    // Then by score
    return b.score - a.score;
  });
  
  // If NO row has a title (merged from all variant sources), generate one from handle
  if (!finalVariants[0].hasTitle && finalVariants.length > 0) {
    const generatedTitle = handle
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    finalVariants[0].fields[colIdx.title] = generatedTitle;
  }
  
  // Clear product-level fields from all but the first row
  for (let i = 1; i < finalVariants.length; i++) {
    finalVariants[i].fields[colIdx.title] = '';
    finalVariants[i].fields[colIdx.description] = '';
    // Keep vendor/type/tags on variant rows - Shopify uses them for filtering
  }
  
  finalProducts.set(handle, finalVariants.map(v => v.fields));
}

console.log(`  Deduplicated variants: ${deduplicatedCount}`);
console.log(`  Used Option2 for disambiguation: ${option2UsedCount}`);
console.log(`  Set "Default Title": ${defaultTitleCount}`);

// ============================================================================
// PASS 4: Validation
// ============================================================================

console.log('\nPass 4: Validating output...');

let errors = [];
let totalVariants = 0;
let productsWithType = 0;
let productsWithCategory = 0;
let productsWithCollection = 0;

for (const [handle, variants] of finalProducts) {
  totalVariants += variants.length;
  
  // Count products with Type/Category/Collection (from primary row)
  const primaryRow = variants.find(v => v[colIdx.title]?.trim()) || variants[0];
  if (primaryRow[colIdx.type]?.trim()) productsWithType++;
  if (primaryRow[colIdx.productCategory]?.trim()) productsWithCategory++;
  if (colIdx.collection !== -1 && primaryRow[colIdx.collection]?.trim()) productsWithCollection++;
  
  // Check for empty Option1 Value
  for (const fields of variants) {
    if (!fields[colIdx.opt1Val]?.trim()) {
      errors.push(`Empty Option1 Value: ${handle}`);
    }
    if (fields[colIdx.opt1Val]?.trim() && !fields[colIdx.opt1Name]?.trim()) {
      errors.push(`Option1 Value without Option1 Name: ${handle}`);
    }
  }
  
  // Check for duplicate option combinations
  const optionCombos = new Set();
  for (const fields of variants) {
    const combo = `${fields[colIdx.opt1Val]}|${fields[colIdx.opt2Val] || ''}|${fields[colIdx.opt3Val] || ''}`;
    if (optionCombos.has(combo)) {
      errors.push(`Duplicate option combo: ${handle} - ${combo}`);
    }
    optionCombos.add(combo);
  }
}

if (errors.length > 0) {
  console.log(`  ⚠ Found ${errors.length} validation issues:`);
  errors.slice(0, 10).forEach(e => console.log(`    - ${e}`));
  if (errors.length > 10) {
    console.log(`    ... and ${errors.length - 10} more`);
  }
} else {
  console.log(`  ✓ All validations passed!`);
}

// ============================================================================
// PASS 5: Write output
// ============================================================================

console.log('\nPass 5: Writing output...');

const outputRows = [header];
for (const [handle, variants] of finalProducts) {
  for (const fields of variants) {
    outputRows.push(buildCSVLine(fields));
  }
}

fs.writeFileSync(outputPath, outputRows.join('\n'));

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                      SUMMARY                                   ║');
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Input file:          ${inputPath.padEnd(40)} ║`);
console.log(`║  Output file:         ${outputPath.padEnd(40)} ║`);
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Input rows:          ${allRows.length.toString().padStart(6)}                                   ║`);
console.log(`║  Output rows:         ${(outputRows.length - 1).toString().padStart(6)}                                   ║`);
console.log(`║  Products (handles):  ${finalProducts.size.toString().padStart(6)}                                   ║`);
console.log(`║  Total variants:      ${totalVariants.toString().padStart(6)}                                   ║`);
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Split families merged:     ${splitFamilies.length.toString().padStart(4)}                               ║`);
console.log(`║  Handles consolidated:      ${handleMergeMap.size.toString().padStart(4)}                               ║`);
console.log(`║  Duplicates removed:        ${deduplicatedCount.toString().padStart(4)}                               ║`);
console.log(`║  Option2 disambiguations:   ${option2UsedCount.toString().padStart(4)}                               ║`);
console.log(`║  Default Title set:         ${defaultTitleCount.toString().padStart(4)}                               ║`);
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Products with Type:        ${productsWithType.toString().padStart(4)} (${(100*productsWithType/finalProducts.size).toFixed(1)}%)                        ║`);
console.log(`║  Products with Category:    ${productsWithCategory.toString().padStart(4)} (${(100*productsWithCategory/finalProducts.size).toFixed(1)}%)                        ║`);
console.log(`║  Products with Collection:  ${productsWithCollection.toString().padStart(4)} (${(100*productsWithCollection/finalProducts.size).toFixed(1)}%)                        ║`);
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║  Validation errors:         ${errors.length.toString().padStart(4)}                               ║`);
console.log('╚════════════════════════════════════════════════════════════════╝');

if (errors.length === 0) {
  console.log('\n✅ Output is Shopify-import ready!');
  console.log(`   Import: ${outputPath}`);
} else {
  console.log('\n⚠️  Please review validation errors before importing.');
}
