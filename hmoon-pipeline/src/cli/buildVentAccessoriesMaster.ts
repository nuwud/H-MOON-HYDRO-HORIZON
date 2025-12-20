/**
 * Build Master Ventilation Accessories CSV
 * 
 * Merges data from multiple sources into a unified vent accessories master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (costs, stock)
 * 
 * INCLUDES: ducting, clamps, fittings, controllers, dampers, silencers, hangers, vent caps
 * EXCLUDES: inline fans, carbon filters, clip fans, grow tents, oscillating fans
 * 
 * Outputs: CSVs/master_ventilation_accessories.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VentAccessoryProduct {
  // Identity
  master_sku: string;
  handle: string;
  title: string;
  brand: string;
  category: string;
  accessory_type: string;
  
  // Key Specs
  duct_diameter_in: string;
  duct_length_ft: string;
  is_insulated: string;
  clamp_diameter_in: string;
  fitting_type: string;
  controller_type: string;
  
  // Logistics
  weight_lbs: string;
  box_length_in: string;
  box_width_in: string;
  box_height_in: string;
  
  // Pricing
  cost: string;
  map_price: string;
  retail_price: string;
  inventory_qty: string;
  
  // Content
  short_description: string;
  long_description: string;
  
  // Media
  image_primary: string;
  
  // Work queue flags
  needs_diameter: string;
  needs_length: string;
  needs_images: string;
  needs_description: string;
  needs_weight_dims: string;
  spec_source: string;
  
  // Match metadata
  match_confidence: string;
  match_notes: string;
}

interface CsvRow {
  [key: string]: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ventilation Accessory Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

// Positive include patterns - things that ARE vent accessories
const VENT_ACCESSORY_PATTERNS = [
  // Ducting
  /\bduct\b/i,
  /\bducting\b/i,
  /flex\s*duct/i,
  /insulated\s*duct/i,
  /aluminum\s*duct/i,
  
  // Clamps
  /duct\s*clamp/i,
  /hose\s*clamp/i,
  /\bclamp\b.*\d+\s*["'in]/i,
  
  // Fittings
  /\breducer\b/i,
  /duct\s*reducer/i,
  /\bwye\b/i,
  /y-connector/i,
  /\btee\b.*duct/i,
  /\belbow\b/i,
  /\bflange\b/i,
  /\bcoupler\b/i,
  /duct\s*adapter/i,
  /duct\s*connector/i,
  /transition/i,
  
  // Dampers
  /\bdamper\b/i,
  /backdraft/i,
  /back\s*draft/i,
  
  // Controllers
  /speed\s*controller/i,
  /fan\s*controller/i,
  /\bvariac\b/i,
  /fan\s*speed/i,
  /blower\s*controller/i,
  
  // Silencers
  /\bsilencer\b/i,
  /\bmuffler\b/i,
  /noise\s*reducer/i,
  
  // Hangers/straps
  /duct\s*hanger/i,
  /\bstrap\b.*duct/i,
  /rope\s*ratchet/i,
  /adjustable\s*hanger/i,
  
  // Vent caps/louvers
  /vent\s*cap/i,
  /\blouver\b/i,
  /wall\s*vent/i,
  /exhaust\s*cap/i,
  
  // Tape
  /duct\s*tape/i,
  /aluminum\s*tape/i,
  /hvac\s*tape/i,
];

// Hard exclusion patterns - things that are NOT vent accessories
const VENT_EXCLUSION_PATTERNS = [
  // Already in Airflow master
  /inline\s*fan/i,
  /in-line\s*fan/i,
  /\binline\b.*blower/i,
  /carbon\s*filter/i,
  /charcoal\s*filter/i,
  /can\s*filter/i,
  /can-fan/i,
  /can\s*fan/i,
  /phresh\s*filter/i,
  
  // Already in Tents master
  /grow\s*tent/i,
  /tent\s*kit/i,
  
  // Fans (not accessories)
  /clip\s*fan/i,
  /oscillating\s*fan/i,
  /wall\s*fan/i,
  /pedestal\s*fan/i,
  /box\s*fan/i,
  /floor\s*fan/i,
  /cloudray/i,  // AC Infinity clip fans
  
  // CFM in title = probably a fan, not accessory
  /\d+\s*cfm/i,
  
  // Blower without controller context = probably a fan
  /blower.*\d+\s*["']/i,
];

// Brand patterns
const BRAND_PATTERNS: Record<string, RegExp> = {
  'AC Infinity': /ac\s*infinity|cloudline|cloudlab|airtap/i,
  'Can-Fan': /can-fan|can\s*fan/i,
  'Vivosun': /vivosun/i,
  'iPower': /ipower/i,
  'Active Air': /active\s*air/i,
  'Hydrofarm': /hydrofarm/i,
  'Hurricane': /hurricane/i,
  'Vortex': /vortex/i,
  'Phresh': /phresh/i,
  'TerraBloom': /terrabloom/i,
  'Ideal-Air': /ideal-air|ideal\s*air/i,
  'Apollo Horticulture': /apollo/i,
  'Gorilla Grow Tent': /gorilla/i,
  'Secret Jardin': /secret\s*jardin/i,
  'Titan Controls': /titan\s*controls|titan/i,
  'Autopilot': /autopilot/i,
  'Growers Choice': /growers?\s*choice/i,
};

// Brand normalization
const BRAND_ALIASES: Record<string, string> = {
  'AC Infinity': 'AC Infinity',
  'ACINFINITY': 'AC Infinity',
  'Can-Fan': 'Can-Fan',
  'Vivosun': 'Vivosun',
  'VIVOSUN': 'Vivosun',
  'iPower': 'iPower',
  'IPOWER': 'iPower',
};

const BRAND_BLOCKLIST = new Set([
  'h moon hydro',
  'h-moon-hydro',
  'hmoonhydro',
  'hmoon hydro',
  'h moon',
  'hmh',
  'h-moon',
  'hmoon',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectBrand(text: string): string {
  for (const [brand, pattern] of Object.entries(BRAND_PATTERNS)) {
    if (pattern.test(text)) return brand;
  }
  return '';
}

function normalizeBrand(raw: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';

  const cleanedCompact = cleaned.replace(/\s+/g, ' ').trim();
  const lower = cleanedCompact.toLowerCase();

  if (BRAND_BLOCKLIST.has(lower)) return '';
  if (BRAND_ALIASES[cleanedCompact]) return BRAND_ALIASES[cleanedCompact];

  return cleanedCompact
    .split(' ')
    .map(w => (w.toUpperCase() === w ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function getBestBrand(args: {
  combinedText: string;
  vendorBrand?: string;
  shopifyVendor?: string;
  wooBrand?: string;
}): string {
  const fromPatterns = normalizeBrand(detectBrand(args.combinedText));
  if (fromPatterns) return fromPatterns;

  const fromVendor = normalizeBrand(args.vendorBrand || '');
  if (fromVendor) return fromVendor;

  const fromShopify = normalizeBrand(args.shopifyVendor || '');
  if (fromShopify) return fromShopify;

  const fromWoo = normalizeBrand(args.wooBrand || '');
  if (fromWoo) return fromWoo;

  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection & Classification
// ─────────────────────────────────────────────────────────────────────────────

function isVentAccessory(text: string): boolean {
  // First check exclusions
  if (VENT_EXCLUSION_PATTERNS.some(p => p.test(text))) {
    return false;
  }
  // Then check inclusions
  return VENT_ACCESSORY_PATTERNS.some(p => p.test(text));
}

type AccessoryType = 'ducting' | 'clamp' | 'fitting' | 'controller' | 'damper' | 'silencer' | 'hanger' | 'tape' | 'vent_cap' | 'other';

function classifyAccessoryType(text: string): AccessoryType {
  const lower = text.toLowerCase();
  
  // Ducting
  if (/\bduct\b|\bducting\b|flex\s*duct|insulated\s*duct/.test(lower) && 
      !/clamp|reducer|elbow|flange|coupler|adapter|connector|damper|silencer|tape/.test(lower)) {
    return 'ducting';
  }
  
  // Clamps
  if (/clamp/.test(lower)) return 'clamp';
  
  // Fittings
  if (/reducer|wye|y-connector|elbow|flange|coupler|adapter|connector|transition|tee/.test(lower)) {
    return 'fitting';
  }
  
  // Controllers
  if (/controller|variac|speed\s*control|fan\s*speed/.test(lower)) return 'controller';
  
  // Dampers
  if (/damper|backdraft|back\s*draft/.test(lower)) return 'damper';
  
  // Silencers
  if (/silencer|muffler|noise\s*reducer/.test(lower)) return 'silencer';
  
  // Hangers
  if (/hanger|strap|rope\s*ratchet|ratchet/.test(lower)) return 'hanger';
  
  // Tape
  if (/tape/.test(lower)) return 'tape';
  
  // Vent caps
  if (/vent\s*cap|louver|wall\s*vent|exhaust\s*cap/.test(lower)) return 'vent_cap';
  
  return 'other';
}

function classifyFittingType(text: string): string {
  const lower = text.toLowerCase();
  if (/reducer/.test(lower)) return 'reducer';
  if (/wye|y-connector/.test(lower)) return 'wye';
  if (/elbow/.test(lower)) return 'elbow';
  if (/flange/.test(lower)) return 'flange';
  if (/coupler/.test(lower)) return 'coupler';
  if (/adapter|connector/.test(lower)) return 'adapter';
  if (/transition/.test(lower)) return 'transition';
  if (/tee/.test(lower)) return 'tee';
  if (/vent\s*cap/.test(lower)) return 'vent_cap';
  return '';
}

function classifyControllerType(text: string): string {
  const lower = text.toLowerCase();
  if (/variac/.test(lower)) return 'variac';
  if (/digital/.test(lower)) return 'digital';
  if (/temp|humidity|thermo/.test(lower)) return 'temp/humidity';
  if (/controller|speed/.test(lower)) return 'manual';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractDiameter(text: string): string {
  // Match patterns like "4 inch", "6in", "8"", "10 in.", "12-inch"
  const patterns = [
    /(\d+)\s*["'](?:\s*duct|\s*clamp|\s*reducer|\s*elbow|\s*flange)?/i,
    /(\d+)\s*-?\s*in(?:ch)?(?:es)?(?:\s*duct|\s*clamp)?/i,
    /(\d+)\s*in\.?\s*(?:x|\s|duct|clamp|reducer|elbow|flange)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const diameter = parseInt(match[1], 10);
      // Valid duct diameters: 4, 6, 8, 10, 12, 14, 16
      if ([4, 6, 8, 10, 12, 14, 16].includes(diameter)) {
        return diameter.toString();
      }
    }
  }
  return '';
}

function extractLength(text: string): string {
  // Match patterns like "25 ft", "25'", "25 foot", "25ft"
  const patterns = [
    /(\d+)\s*[''](?:\s*duct)?/i,
    /(\d+)\s*-?\s*(?:ft|foot|feet)(?:\s*duct)?/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const length = parseInt(match[1], 10);
      // Reasonable duct lengths: 8, 10, 15, 20, 25, 50
      if (length >= 5 && length <= 100) {
        return length.toString();
      }
    }
  }
  return '';
}

function isInsulated(text: string): string {
  if (/insulated|thermal|double.?layer|lined/i.test(text)) return 'yes';
  if (/non-insulated|uninsulated|single.?layer/i.test(text)) return 'no';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Processing
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔧 Building Ventilation Accessories Master CSV');
  console.log('===============================================\n');

  // Load source files
  console.log('📂 Loading source files...');
  
  const shopifyPath = resolve(CSV_DIR, 'products_export_1.csv');
  const wooPath = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  const vendorPath = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');

  const shopifyRows = existsSync(shopifyPath) ? parseCsv(readFileSync(shopifyPath, 'utf-8')) : [];
  const wooRows = existsSync(wooPath) ? parseCsv(readFileSync(wooPath, 'utf-8')) : [];
  const vendorRows = existsSync(vendorPath) ? parseCsv(readFileSync(vendorPath, 'utf-8')) : [];

  console.log(`   Shopify: ${shopifyRows.length} rows`);
  console.log(`   WooCommerce: ${wooRows.length} rows`);
  console.log(`   Vendor Inventory: ${vendorRows.length} rows`);

  // Filter for vent accessories
  console.log('\n🔍 Filtering for ventilation accessories...');

  // Build lookup maps
  const wooBySlug = new Map<string, CsvRow>();
  const wooBySku = new Map<string, CsvRow>();
  for (const row of wooRows) {
    const slug = row['Slug'] || '';
    const sku = row['Sku'] || '';
    if (slug) wooBySlug.set(slug.toLowerCase(), row);
    if (sku) wooBySku.set(sku.toLowerCase(), row);
  }

  const vendorBySku = new Map<string, CsvRow>();
  const vendorByHandle = new Map<string, CsvRow>();
  for (const row of vendorRows) {
    const sku = row['SKU'] || '';
    const handle = row['Handle'] || '';
    if (sku) vendorBySku.set(sku.toLowerCase(), row);
    if (handle) vendorByHandle.set(handle.toLowerCase(), row);
  }

  // Process Shopify rows
  const products = new Map<string, VentAccessoryProduct>();
  let matchedCount = 0;

  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const sku = row['Variant SKU'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const productType = row['Type'] || '';
    
    if (!handle || !title) continue;
    
    // Skip if already processed (variants)
    if (products.has(handle)) continue;

    // Combined text for detection
    const combinedText = `${title} ${vendor} ${tags} ${productType}`;
    
    if (!isVentAccessory(combinedText)) continue;
    
    matchedCount++;

    // Find matches in other sources
    const wooMatch = wooBySlug.get(handle.toLowerCase()) || wooBySku.get(sku.toLowerCase());
    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(handle.toLowerCase());

    // Extract specs
    const accessoryType = classifyAccessoryType(combinedText);
    const diameter = extractDiameter(combinedText);
    const length = extractLength(combinedText);
    const insulated = isInsulated(combinedText);
    const fittingType = accessoryType === 'fitting' ? classifyFittingType(combinedText) : '';
    const controllerType = accessoryType === 'controller' ? classifyControllerType(combinedText) : '';

    // Get best brand
    const brand = getBestBrand({
      combinedText,
      shopifyVendor: vendor,
      wooBrand: wooMatch?.['Brands'] || '',
    });

    // Determine spec source
    const specSources: string[] = [];
    if (vendorMatch) specSources.push('vendor');
    if (diameter || length || insulated) specSources.push('parsed');
    if (wooMatch) specSources.push('woo');
    specSources.push('shopify');

    // Build product record
    const product: VentAccessoryProduct = {
      master_sku: sku || handle,
      handle,
      title,
      brand: brand || '',
      category: 'Ventilation Accessories',
      accessory_type: accessoryType,
      
      duct_diameter_in: accessoryType === 'ducting' ? diameter : '',
      duct_length_ft: accessoryType === 'ducting' ? length : '',
      is_insulated: accessoryType === 'ducting' ? insulated : '',
      clamp_diameter_in: accessoryType === 'clamp' ? diameter : '',
      fitting_type: fittingType,
      controller_type: controllerType,
      
      weight_lbs: row['Variant Grams'] ? (parseFloat(row['Variant Grams']) / 453.592).toFixed(1) : '',
      box_length_in: '',
      box_width_in: '',
      box_height_in: '',
      
      cost: vendorMatch?.['Price'] || row['Cost per item'] || '',
      map_price: row['Variant Compare At Price'] || '',
      retail_price: row['Variant Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || row['Variant Inventory Qty'] || '0',
      
      short_description: '',
      long_description: wooMatch?.['Product description'] || row['Body (HTML)'] || '',
      
      image_primary: row['Image Src'] || wooMatch?.['Image URL'] || '',
      
      // Work queue flags
      needs_diameter: (accessoryType === 'ducting' || accessoryType === 'clamp' || accessoryType === 'fitting') && !diameter ? 'yes' : 'no',
      needs_length: accessoryType === 'ducting' && !length ? 'yes' : 'no',
      needs_images: !row['Image Src'] && !wooMatch?.['Image URL'] ? 'yes' : 'no',
      needs_description: !wooMatch?.['Product description'] && !row['Body (HTML)'] ? 'yes' : 'no',
      needs_weight_dims: !row['Variant Grams'] || parseFloat(row['Variant Grams']) === 0 ? 'yes' : 'no',
      spec_source: specSources.join('|'),
      
      match_confidence: vendorMatch ? '80' : wooMatch ? '60' : '40',
      match_notes: vendorMatch ? 'Vendor matched' : wooMatch ? 'Woo matched' : 'Shopify only',
    };

    products.set(handle, product);
  }

  // Also scan WooCommerce for products not in Shopify
  for (const row of wooRows) {
    const slug = row['Slug'] || '';
    const title = row['Product Name'] || '';
    const sku = row['Sku'] || '';
    
    if (!slug || !title) continue;
    if (products.has(slug)) continue;

    const combinedText = `${title} ${row['Brands'] || ''} ${row['Product categories'] || ''} ${row['Product tags'] || ''}`;
    
    if (!isVentAccessory(combinedText)) continue;
    
    matchedCount++;

    const accessoryType = classifyAccessoryType(combinedText);
    const diameter = extractDiameter(combinedText);
    const length = extractLength(combinedText);
    const insulated = isInsulated(combinedText);
    const fittingType = accessoryType === 'fitting' ? classifyFittingType(combinedText) : '';
    const controllerType = accessoryType === 'controller' ? classifyControllerType(combinedText) : '';

    const brand = getBestBrand({
      combinedText,
      wooBrand: row['Brands'] || '',
    });

    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(slug.toLowerCase());

    const product: VentAccessoryProduct = {
      master_sku: sku || slug,
      handle: slug,
      title,
      brand: brand || '',
      category: 'Ventilation Accessories',
      accessory_type: accessoryType,
      
      duct_diameter_in: accessoryType === 'ducting' ? diameter : '',
      duct_length_ft: accessoryType === 'ducting' ? length : '',
      is_insulated: accessoryType === 'ducting' ? insulated : '',
      clamp_diameter_in: accessoryType === 'clamp' ? diameter : '',
      fitting_type: fittingType,
      controller_type: controllerType,
      
      weight_lbs: row['Weight'] || '',
      box_length_in: row['Length'] || '',
      box_width_in: row['Width'] || '',
      box_height_in: row['Height'] || '',
      
      cost: vendorMatch?.['Price'] || '',
      map_price: '',
      retail_price: row['Regular Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || '0',
      
      short_description: row['Product short description'] || '',
      long_description: row['Product description'] || '',
      
      image_primary: row['Image URL'] || '',
      
      needs_diameter: (accessoryType === 'ducting' || accessoryType === 'clamp' || accessoryType === 'fitting') && !diameter ? 'yes' : 'no',
      needs_length: accessoryType === 'ducting' && !length ? 'yes' : 'no',
      needs_images: !row['Image URL'] ? 'yes' : 'no',
      needs_description: !row['Product description'] ? 'yes' : 'no',
      needs_weight_dims: !row['Weight'] ? 'yes' : 'no',
      spec_source: vendorMatch ? 'vendor|woo' : 'woo',
      
      match_confidence: vendorMatch ? '60' : '40',
      match_notes: 'Woo only (not in Shopify)',
    };

    products.set(slug, product);
  }

  console.log(`   Found ${matchedCount} accessory rows (${products.size} unique products)`);

  // Generate CSV
  const productList = Array.from(products.values());

  const headers = [
    'master_sku', 'handle', 'title', 'brand', 'category', 'accessory_type',
    'duct_diameter_in', 'duct_length_ft', 'is_insulated', 'clamp_diameter_in', 'fitting_type', 'controller_type',
    'weight_lbs', 'box_length_in', 'box_width_in', 'box_height_in',
    'cost', 'map_price', 'retail_price', 'inventory_qty',
    'short_description', 'long_description', 'image_primary',
    'needs_diameter', 'needs_length', 'needs_images', 'needs_description', 'needs_weight_dims', 'spec_source',
    'match_confidence', 'match_notes',
  ];

  const csvLines = [headers.join(',')];
  for (const p of productList) {
    const values = headers.map(h => {
      const val = (p as any)[h] || '';
      // Escape quotes and wrap in quotes if needed
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvLines.push(values.join(','));
  }

  const outputPath = resolve(CSV_DIR, 'master_ventilation_accessories.csv');
  writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`\n✅ Created master_ventilation_accessories.csv with ${productList.length} products`);

  // Statistics
  console.log('\n📊 Summary:');
  
  // By accessory type
  const byType = new Map<string, number>();
  for (const p of productList) {
    const t = p.accessory_type || 'unknown';
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  console.log('\n📦 By Accessory Type:');
  Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.log(`   ${type}: ${count}`));

  // By brand
  const byBrand = new Map<string, number>();
  for (const p of productList) {
    const b = p.brand || 'Unknown';
    byBrand.set(b, (byBrand.get(b) || 0) + 1);
  }
  console.log('\n🏷️  By Brand:');
  Array.from(byBrand.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([brand, count]) => console.log(`   ${brand}: ${count}`));

  // Work queue stats
  const needsDiameter = productList.filter(p => p.needs_diameter === 'yes').length;
  const needsLength = productList.filter(p => p.needs_length === 'yes').length;
  const needsImages = productList.filter(p => p.needs_images === 'yes').length;
  const needsDesc = productList.filter(p => p.needs_description === 'yes').length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   Needs Diameter: ${needsDiameter}`);
  console.log(`   Needs Length: ${needsLength}`);
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDesc}`);

  // With specs extracted
  const withDiameter = productList.filter(p => p.duct_diameter_in || p.clamp_diameter_in).length;
  const withLength = productList.filter(p => p.duct_length_ft).length;
  
  console.log('\n✨ Specs Extracted:');
  console.log(`   With diameter: ${withDiameter}`);
  console.log(`   With length: ${withLength}`);

  // Sample products
  console.log('\n📋 Sample products (first 10):');
  productList.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title.substring(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Type: ${p.accessory_type}`);
  });

  console.log(`\n📁 Output: CSVs/master_ventilation_accessories.csv`);
  console.log('🎯 Next: Review the CSV, then build Grow Media master');
}

main().catch(console.error);
