/**
 * Build Master Controllers & Timers CSV
 * 
 * Merges data from multiple sources into a unified controllers/timers master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (costs, stock)
 * 
 * INCLUDES: timers, thermostats, humidistats, fan controllers, CO2 controllers, environmental controllers
 * EXCLUDES: nutrients, media, lights, pumps, ducting
 * 
 * Outputs: CSVs/master_controllers_timers.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ControllerProduct {
  // Identity
  master_sku: string;
  handle: string;
  title: string;
  brand: string;
  category: string;
  controller_type: string;
  
  // Specs
  is_digital: string;
  voltage: string;
  amperage: string;
  outlet_count: string;
  
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
  needs_images: string;
  needs_description: string;
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
// Row & Brand Validity Guards (reusable across all builders)
// ─────────────────────────────────────────────────────────────────────────────

function isValidRow(handle: string, title: string): boolean {
  if (!handle || handle.length < 3) return false;
  if (!title || title.length < 6) return false;
  if (!/[a-zA-Z]/.test(title)) return false;
  
  // Reject corrupted data (JSON fragments, etc.)
  if (/[{}]/.test(handle)) return false;
  if (/maxscore|error:\d/i.test(title)) return false;
  
  return true;
}

function isValidBrand(brand: string): boolean {
  if (!brand) return false;
  
  // Reject garbage brands
  if (/[{}:]/.test(brand)) return false;
  if (/maxscore|error/i.test(brand)) return false;
  
  // Reject description fragments (too many words or glue words)
  const words = brand.split(/\s+/);
  if (words.length > 5) return false;
  if (/\b(and|with|cost-effective|nutrient|rich|shelf-life|effective|premium)\b/i.test(brand)) return false;
  
  // Reject generic terms
  if (/^(watering|tools|other|unknown|controller|timer)$/i.test(brand)) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const CONTROLLER_PATTERNS = [
  // Timers
  /\btimer\b/i,
  /\btimestat\b/i,
  /24\s*hour/i,
  /mechanical\s*timer/i,
  /digital\s*timer/i,
  /cycle\s*timer/i,
  /interval\s*timer/i,
  
  // Thermostats
  /thermostat/i,
  /temp(?:erature)?\s*controller/i,
  /heat(?:ing)?\s*controller/i,
  /cool(?:ing)?\s*controller/i,
  
  // Humidistats
  /humidistat/i,
  /humidity\s*controller/i,
  /rh\s*controller/i,
  
  // Fan controllers
  /fan\s*controller/i,
  /speed\s*controller/i,
  /\bvariac\b/i,
  /blower\s*controller/i,
  /fan\s*speed/i,
  
  // CO2 controllers
  /co2\s*controller/i,
  /carbon\s*dioxide\s*controller/i,
  /ppm\s*controller/i,
  /co2\s*regulator/i,
  /co2\s*monitor/i,
  
  // Environmental controllers
  /environment(?:al)?\s*controller/i,
  /climate\s*controller/i,
  /grow\s*room\s*controller/i,
  /autopilot/i,
  /inkbird/i,
  /titan\s*controls/i,
  /trolmaster/i,
  /blueprint/i,
  
  // Relay/outlet controllers
  /relay\s*controller/i,
  /outlet\s*controller/i,
  /power\s*strip.*timer/i,
  /smart\s*outlet/i,
  
  // Specific product patterns
  /tsc-\d/i,  // Titan TSC series
  /atlas\s*\d/i,  // Titan Atlas series
  /eos/i,  // Various EOS controllers
  /icc/i,  // Intelligent climate controller
];

// Hard exclusions
const CONTROLLER_EXCLUSIONS = [
  // Nutrients
  /nutrient/i,
  /fertilizer/i,
  /\bcoco\b/i,
  /\bsoil\b/i,
  /rockwool/i,
  /perlite/i,
  /vermiculite/i,
  /hydroton/i,
  
  // Equipment already categorized
  /grow\s*tent/i,
  /\blight\b(?!.*controller)/i,
  /\blamp\b/i,
  /\bbulb\b/i,
  /\bballast\b/i,
  /\bpump\b(?!.*controller)/i,
  /\btubing\b/i,
  
  // Ventilation (already done)
  /duct\s*clamp/i,
  /\breducer\b/i,
  /\bwye\b/i,
  /\bflange\b/i,
  /\bducting\b/i,
  /carbon\s*filter/i,
  /inline\s*fan/i,
  
  // Seeds
  /\bseed\b/i,
  /feminised|feminized/i,
];

// Brand patterns
const BRAND_PATTERNS: Record<string, RegExp> = {
  'Titan Controls': /titan\s*controls|titan|tsc-\d|atlas\s*\d/i,
  'Autopilot': /autopilot/i,
  'Inkbird': /inkbird/i,
  'TrolMaster': /trolmaster/i,
  'Blueprint': /blueprint\s*controller/i,
  'Hydrofarm': /hydrofarm/i,
  'Active Air': /active\s*air/i,
  'iPower': /ipower/i,
  'Vivosun': /vivosun/i,
  'AC Infinity': /ac\s*infinity|cloudline|controller\s*\d+/i,
  'Grozone': /grozone/i,
  'C.A.P.': /c\.?a\.?p\.?|custom\s*automated/i,
  'Sentinel': /sentinel/i,
  'Gavita': /gavita/i,
  'Hortilux': /hortilux/i,
  'Leviton': /leviton/i,
  'Intermatic': /intermatic/i,
  'Woods': /\bwoods\b/i,
  'BN-Link': /bn-?link/i,
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
  if (!isValidBrand(cleaned)) return '';

  const cleanedCompact = cleaned.replace(/\s+/g, ' ').trim();
  const lower = cleanedCompact.toLowerCase();

  if (BRAND_BLOCKLIST.has(lower)) return '';

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

function isController(text: string): boolean {
  if (CONTROLLER_EXCLUSIONS.some(p => p.test(text))) {
    return false;
  }
  return CONTROLLER_PATTERNS.some(p => p.test(text));
}

type ControllerType = 'timer' | 'thermostat' | 'humidistat' | 'fan_controller' | 'co2_controller' | 'env_controller' | 'relay' | 'other';

function classifyControllerType(text: string): ControllerType {
  const lower = text.toLowerCase();
  
  // CO2 controller
  if (/co2|carbon\s*dioxide|ppm\s*controller/i.test(lower)) return 'co2_controller';
  
  // Environmental controller (combo units)
  if (/environment(?:al)?|climate|grow\s*room\s*controller|trolmaster|grozone/i.test(lower)) return 'env_controller';
  
  // Thermostat
  if (/thermostat|temp(?:erature)?\s*controller|heat(?:ing)?\s*controller|cool(?:ing)?\s*controller/i.test(lower)) return 'thermostat';
  
  // Humidistat
  if (/humidistat|humidity\s*controller|rh\s*controller/i.test(lower)) return 'humidistat';
  
  // Fan controller
  if (/fan\s*controller|speed\s*controller|variac|blower\s*controller|fan\s*speed/i.test(lower)) return 'fan_controller';
  
  // Relay
  if (/relay|outlet\s*controller|power\s*strip/i.test(lower)) return 'relay';
  
  // Timer (catch-all for timing devices)
  if (/timer|timestat|24\s*hour|cycle|interval/i.test(lower)) return 'timer';
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec Extraction
// ─────────────────────────────────────────────────────────────────────────────

function isDigital(text: string): string {
  if (/digital|lcd|led\s*display|programmable|smart/i.test(text)) return 'yes';
  if (/mechanical|analog|dial/i.test(text)) return 'no';
  return '';
}

function extractVoltage(text: string): string {
  // Match 120V, 240V, 120/240V patterns
  const match = text.match(/(\d{2,3})\s*[vV](?:olt)?/);
  if (match) {
    const v = parseInt(match[1], 10);
    if (v === 120 || v === 240 || v === 110 || v === 220) {
      return `${v}V`;
    }
  }
  
  // Dual voltage
  if (/120\s*\/\s*240|110\s*\/\s*220/i.test(text)) {
    return '120/240V';
  }
  
  return '';
}

function extractAmperage(text: string): string {
  const match = text.match(/(\d+(?:\.\d+)?)\s*[aA](?:mp)?/);
  if (match) {
    const a = parseFloat(match[1]);
    if (a > 0 && a <= 50) {
      return `${a}A`;
    }
  }
  return '';
}

function extractOutletCount(text: string): string {
  // Match "4 outlet", "8-outlet", etc.
  const match = text.match(/(\d+)\s*-?\s*outlet/i);
  if (match) {
    return match[1];
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Processing
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎛️  Building Controllers & Timers Master CSV');
  console.log('=============================================\n');

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

  // Process products
  console.log('\n🔍 Filtering for controllers & timers...');
  const products = new Map<string, ControllerProduct>();
  let matchedCount = 0;

  // Process Shopify rows
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const sku = row['Variant SKU'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const productType = row['Type'] || '';
    
    if (!isValidRow(handle, title)) continue;
    if (products.has(handle)) continue;

    const combinedText = `${title} ${vendor} ${tags} ${productType}`;
    
    if (!isController(combinedText)) continue;
    
    matchedCount++;

    // Find matches
    const wooMatch = wooBySlug.get(handle.toLowerCase()) || wooBySku.get(sku.toLowerCase());
    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(handle.toLowerCase());

    // Extract specs
    const controllerType = classifyControllerType(combinedText);
    const digital = isDigital(combinedText);
    const voltage = extractVoltage(combinedText);
    const amperage = extractAmperage(combinedText);
    const outlets = extractOutletCount(combinedText);

    // Get brand
    const brand = getBestBrand({
      combinedText,
      shopifyVendor: vendor,
      wooBrand: wooMatch?.['Brands'] || '',
    });

    // Spec source
    const specSources: string[] = [];
    if (vendorMatch) specSources.push('vendor');
    if (voltage || amperage || outlets) specSources.push('parsed');
    if (wooMatch) specSources.push('woo');
    specSources.push('shopify');

    const product: ControllerProduct = {
      master_sku: sku || handle,
      handle,
      title,
      brand: brand || '',
      category: 'Controllers & Timers',
      controller_type: controllerType,
      
      is_digital: digital,
      voltage,
      amperage,
      outlet_count: outlets,
      
      cost: vendorMatch?.['Price'] || row['Cost per item'] || '',
      map_price: row['Variant Compare At Price'] || '',
      retail_price: row['Variant Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || row['Variant Inventory Qty'] || '0',
      
      short_description: '',
      long_description: wooMatch?.['Product description'] || row['Body (HTML)'] || '',
      
      image_primary: row['Image Src'] || wooMatch?.['Image URL'] || '',
      
      needs_images: !row['Image Src'] && !wooMatch?.['Image URL'] ? 'yes' : 'no',
      needs_description: !wooMatch?.['Product description'] && !row['Body (HTML)'] ? 'yes' : 'no',
      spec_source: specSources.join('|'),
      
      match_confidence: vendorMatch ? '80' : wooMatch ? '60' : '40',
      match_notes: vendorMatch ? 'Vendor matched' : wooMatch ? 'Woo matched' : 'Shopify only',
    };

    products.set(handle, product);
  }

  // Also scan WooCommerce
  for (const row of wooRows) {
    const slug = row['Slug'] || '';
    const title = row['Product Name'] || '';
    const sku = row['Sku'] || '';
    
    if (!isValidRow(slug, title)) continue;
    if (products.has(slug)) continue;

    const combinedText = `${title} ${row['Brands'] || ''} ${row['Product categories'] || ''} ${row['Product tags'] || ''}`;
    
    if (!isController(combinedText)) continue;
    
    matchedCount++;

    const controllerType = classifyControllerType(combinedText);
    const digital = isDigital(combinedText);
    const voltage = extractVoltage(combinedText);
    const amperage = extractAmperage(combinedText);
    const outlets = extractOutletCount(combinedText);

    const brand = getBestBrand({
      combinedText,
      wooBrand: row['Brands'] || '',
    });

    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(slug.toLowerCase());

    const product: ControllerProduct = {
      master_sku: sku || slug,
      handle: slug,
      title,
      brand: brand || '',
      category: 'Controllers & Timers',
      controller_type: controllerType,
      
      is_digital: digital,
      voltage,
      amperage,
      outlet_count: outlets,
      
      cost: vendorMatch?.['Price'] || '',
      map_price: '',
      retail_price: row['Regular Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || '0',
      
      short_description: row['Product short description'] || '',
      long_description: row['Product description'] || '',
      
      image_primary: row['Image URL'] || '',
      
      needs_images: !row['Image URL'] ? 'yes' : 'no',
      needs_description: !row['Product description'] ? 'yes' : 'no',
      spec_source: vendorMatch ? 'vendor|woo' : 'woo',
      
      match_confidence: vendorMatch ? '60' : '40',
      match_notes: 'Woo only (not in Shopify)',
    };

    products.set(slug, product);
  }

  console.log(`   Found ${matchedCount} controller rows (${products.size} unique products)`);

  // Generate CSV
  const productList = Array.from(products.values());

  const headers = [
    'master_sku', 'handle', 'title', 'brand', 'category', 'controller_type',
    'is_digital', 'voltage', 'amperage', 'outlet_count',
    'cost', 'map_price', 'retail_price', 'inventory_qty',
    'short_description', 'long_description', 'image_primary',
    'needs_images', 'needs_description', 'spec_source',
    'match_confidence', 'match_notes',
  ];

  const csvLines = [headers.join(',')];
  for (const p of productList) {
    const values = headers.map(h => {
      const val = (p as any)[h] || '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvLines.push(values.join(','));
  }

  const outputPath = resolve(CSV_DIR, 'master_controllers_timers.csv');
  writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`\n✅ Created master_controllers_timers.csv with ${productList.length} products`);

  // Statistics
  console.log('\n📊 Summary:');
  
  // By controller type
  const byType = new Map<string, number>();
  for (const p of productList) {
    const t = p.controller_type || 'unknown';
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  console.log('\n🎛️  By Controller Type:');
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

  // Digital vs analog
  const digital = productList.filter(p => p.is_digital === 'yes').length;
  const analog = productList.filter(p => p.is_digital === 'no').length;
  const unknownDigital = productList.filter(p => !p.is_digital).length;
  console.log('\n💡 Digital vs Analog:');
  console.log(`   Digital: ${digital}`);
  console.log(`   Analog/Mechanical: ${analog}`);
  console.log(`   Unknown: ${unknownDigital}`);

  // Work queue stats
  const needsImages = productList.filter(p => p.needs_images === 'yes').length;
  const needsDesc = productList.filter(p => p.needs_description === 'yes').length;
  const withVoltage = productList.filter(p => p.voltage).length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDesc}`);
  console.log(`   With Voltage Extracted: ${withVoltage}`);

  // Sample products
  console.log('\n📋 Sample products (first 10):');
  productList.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title.substring(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Type: ${p.controller_type} | ${p.voltage || 'no voltage'}`);
  });

  console.log(`\n📁 Output: CSVs/master_controllers_timers.csv`);
  console.log('🎯 Next: Build the master catalog index (A - final step)');
}

main().catch(console.error);
