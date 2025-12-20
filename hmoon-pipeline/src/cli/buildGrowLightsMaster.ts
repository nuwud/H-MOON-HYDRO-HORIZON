/**
 * Build Master Grow Lights CSV
 * 
 * Merges data from multiple sources into a unified grow lights master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (dimensions, costs, item numbers)
 * 
 * Outputs: CSVs/master_grow_lights.csv (populated)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GrowLightProduct {
  // Identity
  master_sku: string;
  vendor_item_number: string;
  source_woo_sku: string;
  source_shopify_sku: string;
  source_shopify_handle: string;
  title: string;
  brand: string;
  category: string;
  
  // Light classification
  light_type: string;          // LED, HID, CMH, Fluorescent, Controller
  fixture_or_bulb: string;     // Fixture, Bulb, Ballast, Reflector, Kit
  spectrum: string;            // Full, Veg, Bloom, Dual, UV, IR
  dimmable: string;
  
  // Power specs
  wattage_actual: string;
  wattage_equivalent: string;
  input_voltage: string;
  current_amps: string;
  
  // Performance
  ppf_umol_s: string;
  efficacy_umol_j: string;
  coverage_veg: string;
  coverage_flower: string;
  
  // Kit fields
  is_kit: string;
  kit_components: string;
  kit_notes: string;
  
  // Physical
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  is_fragile: string;
  hazmat_flag: string;
  
  // Compliance
  ul_etl_listed: string;
  warranty_years: string;
  
  // Pricing
  cost: string;
  map_price: string;
  retail_price: string;
  inventory_qty: string;
  
  // Content
  short_description: string;
  long_description: string;
  key_features: string;
  ideal_for: string;
  includes: string;
  
  // SEO
  seo_title: string;
  seo_description: string;
  
  // Media
  image_primary: string;
  image_alt_1: string;
  image_alt_2: string;
  image_alt_3: string;
  spec_sheet_url: string;
  
  // Work queue flags
  needs_wattage: string;
  needs_coverage: string;
  needs_images: string;
  needs_description: string;
  needs_weight_dims: string;
  needs_component_mapping: string;
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
// Grow Light Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const LIGHT_PATTERNS = [
  /\bLED\b/i,
  /grow\s*light/i,
  /\bHPS\b/i,
  /\bMH\b/i,
  /\bCMH\b/i,
  /\bLEC\b/i,
  /\bDE\b.*light/i,
  /\bSE\b.*light/i,
  /quantum\s*board/i,
  /bar\s*light/i,
  /fixture/i,
  /ballast/i,
  /reflector/i,
  /bulb.*\d+w/i,
  /\d+w.*bulb/i,
  /driver/i,
  /spectrum/i,
  /gavita/i,
  /fluence/i,
  /hortilux/i,
  /spider\s*farmer/i,
  /mars\s*hydro/i,
  /sun\s*system/i,
  /phantom/i,
  /iluminar/i,
  /nextlight/i,
  /growers\s*choice/i,
  /eye\s*hortilux/i,
  /ushio/i,
  /solis\s*tek/i,
  /hydrofarm.*light/i,
];

const BRAND_PATTERNS: Record<string, RegExp> = {
  'Gavita': /gavita/i,
  'Fluence': /fluence/i,
  'Spider Farmer': /spider\s*farmer/i,
  'Mars Hydro': /mars\s*hydro/i,
  'Sun System': /sun\s*system/i,
  'Phantom': /phantom/i,
  'Iluminar': /iluminar/i,
  'NextLight': /nextlight|next\s*light/i,
  'Growers Choice': /growers?\s*choice/i,
  'Hortilux': /hortilux|eye\s*hortilux/i,
  'Ushio': /ushio/i,
  'Solis Tek': /solis\s*tek|solistek/i,
  'Hydrofarm': /hydrofarm/i,
  'Luxx': /\bluxx\b/i,
  'Dimlux': /dimlux/i,
  'Nanolux': /nanolux/i,
  'AC Infinity': /ac\s*infinity/i,
  'Kind LED': /kind\s*led/i,
  'California Lightworks': /california\s*light/i,
  'Optic LED': /optic\s*led/i,
  'HLG': /\bhlg\b|horticulture\s*lighting/i,
  'ChilLED': /chilled|chill\s*led/i,
  'Plantmax': /plantmax/i,
  'Solarmax': /solarmax|solar\s*max/i,
  'Maxibright': /maxibright/i,
  'Omega': /\bomega\b/i,
  'Adjusta-Watt': /adjusta-?watt/i,
  'Yield Lab': /yield\s*lab/i,
  'Vivosun': /vivosun/i,
  'iPower': /ipower/i,
  'Agrolux': /agrolux/i,
  'Sunmaster': /sunmaster|sun\s*master/i,
  'Venture': /venture/i,
  'GE': /\bge\b/i,
  'Philips': /philips/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Normalization
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_ALIASES: Record<string, string> = {
  'Spider Farmer': 'Spider Farmer',
  'SpiderFarmer': 'Spider Farmer',
  'Mars Hydro': 'Mars Hydro',
  'MarsHydro': 'Mars Hydro',
  'Sun System': 'Sun System',
  'SunSystem': 'Sun System',
  'Growers Choice': 'Growers Choice',
  'GrowersChoice': 'Growers Choice',
  'Eye Hortilux': 'Hortilux',
  'Hortilux': 'Hortilux',
  'Solis Tek': 'Solis Tek',
  'SolisTek': 'Solis Tek',
  'NextLight': 'NextLight',
  'Next Light': 'NextLight',
  'AC Infinity': 'AC Infinity',
  'ACINFINITY': 'AC Infinity',
  'Kind LED': 'Kind LED',
  'KindLED': 'Kind LED',
  'California Lightworks': 'California Lightworks',
  'HLG': 'HLG',
  'Horticulture Lighting Group': 'HLG',
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
// Spec Extraction
// ─────────────────────────────────────────────────────────────────────────────

function isGrowLight(text: string): boolean {
  return LIGHT_PATTERNS.some(p => p.test(text));
}

function extractWattage(text: string): string {
  // Match patterns like "600W", "1000 watt", "315w"
  const match = text.match(/(\d{2,4})\s*(?:w(?:att)?s?)\b/i);
  return match ? match[1] : '';
}

function extractCoverage(text: string): { veg: string; flower: string } {
  // Match patterns like "4x4", "5'x5'", "4 x 4"
  const match = text.match(/(\d+)\s*[x×']\s*(\d+)/i);
  if (match) {
    const size = `${match[1]}x${match[2]}`;
    return { veg: size, flower: size }; // Default same, can be refined
  }
  return { veg: '', flower: '' };
}

function extractVoltage(text: string): string {
  if (/277\s*v/i.test(text)) return '277V';
  if (/240\s*v/i.test(text)) return '240V';
  if (/120\s*v/i.test(text)) return '120V';
  if (/120[-–]240|universal/i.test(text)) return '120-240V';
  return '';
}

function extractSpectrum(text: string): string {
  if (/full\s*spectrum/i.test(text)) return 'Full';
  if (/\bveg\b/i.test(text) && /\bbloom\b/i.test(text)) return 'Dual';
  if (/\bveg\b/i.test(text)) return 'Veg';
  if (/\bbloom\b|flower/i.test(text)) return 'Bloom';
  if (/\bUV\b/i.test(text)) return 'UV';
  if (/\bIR\b/i.test(text)) return 'IR';
  return '';
}

function detectLightType(text: string): string {
  if (/\bLED\b/i.test(text)) return 'LED';
  if (/\bCMH\b|\bLEC\b/i.test(text)) return 'CMH';
  if (/\bHPS\b/i.test(text)) return 'HPS';
  if (/\bMH\b/i.test(text)) return 'MH';
  if (/\bDE\b/i.test(text)) return 'DE';
  if (/fluorescent|T5|T8/i.test(text)) return 'Fluorescent';
  if (/controller|timer/i.test(text)) return 'Controller';
  return '';
}

function detectFixtureType(text: string): string {
  if (/\bkit\b|\bcombo\b|\bcomplete\b/i.test(text)) return 'Kit';
  if (/\bbulb\b|\blamp\b/i.test(text)) return 'Bulb';
  if (/\bballast\b/i.test(text)) return 'Ballast';
  if (/\breflector\b|\bhood\b/i.test(text)) return 'Reflector';
  if (/\bdriver\b/i.test(text)) return 'Driver';
  if (/fixture|light|bar/i.test(text)) return 'Fixture';
  return 'Fixture';
}

// ─────────────────────────────────────────────────────────────────────────────
// Kit Detection
// ─────────────────────────────────────────────────────────────────────────────

const KIT_PATTERNS = [
  /\bkit\b/i,
  /\bcombo\b/i,
  /\bbundle\b/i,
  /\bpackage\b/i,
  /complete\s*system/i,
  /\bw\/\s*ballast/i,
  /\bw\/\s*bulb/i,
  /\bincl(udes?)?\s*bulb/i,
];

function isKit(text: string): boolean {
  return KIT_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Loaders
// ─────────────────────────────────────────────────────────────────────────────

function loadShopifyProducts(): CsvRow[] {
  const path = resolve(CSV_DIR, 'shopify_export_after_prod__INCLUDE_ALL.csv');
  if (!existsSync(path)) {
    console.warn('⚠️  Shopify export not found:', path);
    return [];
  }
  return parseCsv(readFileSync(path, 'utf-8'));
}

function loadWooProducts(): CsvRow[] {
  const path = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  if (!existsSync(path)) {
    console.warn('⚠️  WooCommerce export not found:', path);
    return [];
  }
  return parseCsv(readFileSync(path, 'utf-8'));
}

function loadVendorInventory(): CsvRow[] {
  const path = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  if (!existsSync(path)) {
    console.warn('⚠️  Vendor inventory not found:', path);
    return [];
  }
  return parseCsv(readFileSync(path, 'utf-8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching Logic
// ─────────────────────────────────────────────────────────────────────────────

function normalizeSku(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface MatchResult {
  woo?: CsvRow;
  vendor?: CsvRow;
  confidence: number;
  notes: string[];
}

function findMatches(
  shopifyRow: CsvRow,
  wooProducts: CsvRow[],
  vendorInventory: CsvRow[]
): MatchResult {
  const shopifySku = normalizeSku(shopifyRow['sku'] || '');
  const shopifyTitle = normalizeTitle(shopifyRow['product_title'] || '');
  const notes: string[] = [];
  let confidence = 0;

  let wooMatch = wooProducts.find(w => normalizeSku(w['Sku'] || '') === shopifySku && shopifySku);
  if (wooMatch) {
    notes.push('Woo matched by SKU');
    confidence += 40;
  } else {
    wooMatch = wooProducts.find(w => {
      const wooTitle = normalizeTitle(w['Product Name'] || '');
      return wooTitle && shopifyTitle && (
        wooTitle.includes(shopifyTitle.slice(0, 20)) ||
        shopifyTitle.includes(wooTitle.slice(0, 20))
      );
    });
    if (wooMatch) {
      notes.push('Woo matched by title (fuzzy)');
      confidence += 20;
    }
  }

  let vendorMatch = vendorInventory.find(v => 
    normalizeSku(v['Item Number'] || '') === shopifySku && shopifySku
  );
  if (vendorMatch) {
    notes.push('Vendor matched by Item Number');
    confidence += 40;
  } else {
    vendorMatch = vendorInventory.find(v => {
      const vendorName = normalizeTitle(v['Item Name'] || '');
      return vendorName && shopifyTitle && (
        vendorName.includes(shopifyTitle.slice(0, 15)) ||
        shopifyTitle.includes(vendorName.slice(0, 15))
      );
    });
    if (vendorMatch) {
      notes.push('Vendor matched by name (fuzzy)');
      confidence += 15;
    }
  }

  return { woo: wooMatch, vendor: vendorMatch, confidence, notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Output
// ─────────────────────────────────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function toCSVRow(product: GrowLightProduct): string {
  const fields = [
    product.master_sku,
    product.vendor_item_number,
    product.source_woo_sku,
    product.source_shopify_sku,
    product.source_shopify_handle,
    product.title,
    product.brand,
    product.category,
    product.light_type,
    product.fixture_or_bulb,
    product.spectrum,
    product.dimmable,
    product.wattage_actual,
    product.wattage_equivalent,
    product.input_voltage,
    product.current_amps,
    product.ppf_umol_s,
    product.efficacy_umol_j,
    product.coverage_veg,
    product.coverage_flower,
    product.is_kit,
    product.kit_components,
    product.kit_notes,
    product.weight_kg,
    product.length_cm,
    product.width_cm,
    product.height_cm,
    product.is_fragile,
    product.hazmat_flag,
    product.ul_etl_listed,
    product.warranty_years,
    product.cost,
    product.map_price,
    product.retail_price,
    product.inventory_qty,
    product.short_description,
    product.long_description,
    product.key_features,
    product.ideal_for,
    product.includes,
    product.seo_title,
    product.seo_description,
    product.image_primary,
    product.image_alt_1,
    product.image_alt_2,
    product.image_alt_3,
    product.spec_sheet_url,
    product.needs_wattage,
    product.needs_coverage,
    product.needs_images,
    product.needs_description,
    product.needs_weight_dims,
    product.needs_component_mapping,
    product.spec_source,
    product.match_confidence,
    product.match_notes,
  ];
  return fields.map(escapeCSV).join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('💡 Building Grow Lights Master CSV');
  console.log('===================================\n');

  // Load all sources
  console.log('📂 Loading source files...');
  const shopifyProducts = loadShopifyProducts();
  const wooProducts = loadWooProducts();
  const vendorInventory = loadVendorInventory();

  console.log(`   Shopify: ${shopifyProducts.length} rows`);
  console.log(`   WooCommerce: ${wooProducts.length} rows`);
  console.log(`   Vendor Inventory: ${vendorInventory.length} rows\n`);

  // Filter to grow light products only
  console.log('🔍 Filtering for grow light products...');
  
  const lightsShopify = shopifyProducts.filter(row => {
    const text = `${row['product_title']} ${row['product_type']} ${row['sku']}`;
    return isGrowLight(text);
  });

  // Deduplicate by product_handle
  const seenHandles = new Set<string>();
  const uniqueLights = lightsShopify.filter(row => {
    const handle = row['product_handle'];
    if (seenHandles.has(handle)) return false;
    seenHandles.add(handle);
    return true;
  });

  console.log(`   Found ${lightsShopify.length} light rows (${uniqueLights.length} unique products)\n`);

  // Build master records
  console.log('🔗 Matching and merging data...');
  const masterProducts: GrowLightProduct[] = [];

  for (const shopifyRow of uniqueLights) {
    const title = shopifyRow['product_title'] || '';
    const sku = shopifyRow['sku'] || '';
    const handle = shopifyRow['product_handle'] || '';
    const combinedText = `${title} ${sku} ${handle}`;

    const matches = findMatches(shopifyRow, wooProducts, vendorInventory);

    // Extract specs
    const wattage = extractWattage(combinedText);
    const coverage = extractCoverage(combinedText);
    const voltage = extractVoltage(combinedText);
    const spectrum = extractSpectrum(combinedText);
    const lightType = detectLightType(combinedText);
    const fixtureType = detectFixtureType(combinedText);

    const brand = getBestBrand({
      combinedText,
      vendorBrand: matches.vendor?.['Brand'] || matches.vendor?.['Manufacturer'] || '',
      shopifyVendor: shopifyRow['product_vendor'] || '',
      wooBrand: matches.woo?.['Brand'] || '',
    });

    const kitDetected = isKit(combinedText);

    // Determine spec source
    const specSources: string[] = [];
    if (matches.vendor) specSources.push('vendor');
    if (matches.woo) specSources.push('woo');
    if (wattage || coverage.veg) specSources.push('parsed');
    const specSource = specSources.length > 0 ? specSources.join('|') : 'shopify';

    // Work queue
    const hasWattage = Boolean(wattage);
    const hasCoverage = Boolean(coverage.veg);
    const hasDescription = Boolean(matches.woo?.['Product description'] || matches.woo?.['Product short description']);
    const hasWeight = Boolean(matches.vendor?.['Weight'] || matches.woo?.['Weight']);

    const product: GrowLightProduct = {
      master_sku: sku || handle,
      vendor_item_number: matches.vendor?.['Item Number'] || '',
      source_woo_sku: matches.woo?.['Sku'] || '',
      source_shopify_sku: sku,
      source_shopify_handle: handle,
      title: title,
      brand: brand,
      category: 'Grow Lights',
      
      light_type: lightType,
      fixture_or_bulb: fixtureType,
      spectrum: spectrum,
      dimmable: /dimmable|dimm?ing/i.test(combinedText) ? 'yes' : '',
      
      wattage_actual: wattage,
      wattage_equivalent: '',
      input_voltage: voltage,
      current_amps: '',
      
      ppf_umol_s: '',
      efficacy_umol_j: '',
      coverage_veg: coverage.veg,
      coverage_flower: coverage.flower,
      
      is_kit: kitDetected ? 'yes' : 'no',
      kit_components: '',
      kit_notes: kitDetected ? 'needs component mapping' : '',
      
      weight_kg: matches.vendor?.['Weight'] || matches.woo?.['Weight'] || '',
      length_cm: matches.vendor?.['Length'] || matches.woo?.['Length'] || '',
      width_cm: matches.vendor?.['Width'] || matches.woo?.['Width'] || '',
      height_cm: matches.vendor?.['Height'] || matches.woo?.['Height'] || '',
      is_fragile: 'yes', // Lights are generally fragile
      hazmat_flag: 'no',
      
      ul_etl_listed: '',
      warranty_years: '',
      
      cost: matches.vendor?.['Average Unit Cost'] || shopifyRow['cost_amount'] || '',
      map_price: matches.vendor?.['MSRP'] || '',
      retail_price: shopifyRow['price'] || matches.vendor?.['Regular Price'] || '',
      inventory_qty: shopifyRow['inv_total_all_locations'] || '',
      
      short_description: matches.woo?.['Product short description'] || '',
      long_description: matches.woo?.['Product description'] || '',
      key_features: '',
      ideal_for: '',
      includes: '',
      
      seo_title: '',
      seo_description: '',
      
      image_primary: '',
      image_alt_1: '',
      image_alt_2: '',
      image_alt_3: '',
      spec_sheet_url: '',
      
      needs_wattage: !hasWattage ? 'yes' : 'no',
      needs_coverage: !hasCoverage ? 'yes' : 'no',
      needs_images: 'yes',
      needs_description: !hasDescription ? 'yes' : 'no',
      needs_weight_dims: !hasWeight ? 'yes' : 'no',
      needs_component_mapping: kitDetected ? 'yes' : 'no',
      spec_source: specSource,
      
      match_confidence: String(matches.confidence),
      match_notes: matches.notes.join('; '),
    };

    masterProducts.push(product);
  }

  // Sort by confidence then title
  masterProducts.sort((a, b) => {
    const confDiff = parseInt(b.match_confidence) - parseInt(a.match_confidence);
    if (confDiff !== 0) return confDiff;
    return a.title.localeCompare(b.title);
  });

  // Write output
  const header = 'master_sku,vendor_item_number,source_woo_sku,source_shopify_sku,source_shopify_handle,title,brand,category,light_type,fixture_or_bulb,spectrum,dimmable,wattage_actual,wattage_equivalent,input_voltage,current_amps,ppf_umol_s,efficacy_umol_j,coverage_veg,coverage_flower,is_kit,kit_components,kit_notes,weight_kg,length_cm,width_cm,height_cm,is_fragile,hazmat_flag,ul_etl_listed,warranty_years,cost,map_price,retail_price,inventory_qty,short_description,long_description,key_features,ideal_for,includes,seo_title,seo_description,image_primary,image_alt_1,image_alt_2,image_alt_3,spec_sheet_url,needs_wattage,needs_coverage,needs_images,needs_description,needs_weight_dims,needs_component_mapping,spec_source,match_confidence,match_notes';
  
  const csvContent = [header, ...masterProducts.map(toCSVRow)].join('\n');
  const outPath = resolve(CSV_DIR, 'master_grow_lights.csv');
  writeFileSync(outPath, csvContent, 'utf-8');

  // Summary
  console.log(`\n✅ Created master_grow_lights.csv with ${masterProducts.length} products\n`);

  // Type breakdown
  const byType: Record<string, number> = {};
  masterProducts.forEach(p => {
    const type = p.light_type || 'Unknown';
    byType[type] = (byType[type] || 0) + 1;
  });

  const byFixture: Record<string, number> = {};
  masterProducts.forEach(p => {
    const type = p.fixture_or_bulb || 'Unknown';
    byFixture[type] = (byFixture[type] || 0) + 1;
  });

  const kits = masterProducts.filter(p => p.is_kit === 'yes').length;
  const highConf = masterProducts.filter(p => parseInt(p.match_confidence) >= 50).length;
  const withWattage = masterProducts.filter(p => p.wattage_actual).length;
  const withCoverage = masterProducts.filter(p => p.coverage_veg).length;

  console.log('📊 Summary:');
  console.log(`   Kits/Combos: ${kits}`);
  console.log(`   High confidence matches (≥50%): ${highConf}`);
  console.log(`   With wattage extracted: ${withWattage}`);
  console.log(`   With coverage extracted: ${withCoverage}`);

  console.log('\n⚡ By Light Type:');
  Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

  console.log('\n🔧 By Fixture Type:');
  Object.entries(byFixture)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

  // Work queue
  const needsWattage = masterProducts.filter(p => p.needs_wattage === 'yes').length;
  const needsCoverage = masterProducts.filter(p => p.needs_coverage === 'yes').length;
  const needsDescription = masterProducts.filter(p => p.needs_description === 'yes').length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   Needs Wattage: ${needsWattage}`);
  console.log(`   Needs Coverage: ${needsCoverage}`);
  console.log(`   Needs Description: ${needsDescription}`);

  // Brand breakdown
  const byBrand: Record<string, number> = {};
  masterProducts.forEach(p => {
    const brand = p.brand || 'Unknown';
    byBrand[brand] = (byBrand[brand] || 0) + 1;
  });
  console.log('\n🏷️  By Brand:');
  Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([brand, count]) => {
      console.log(`   ${brand}: ${count}`);
    });

  // Sample
  console.log('\n📋 Sample products (first 5):');
  masterProducts.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i+1}. ${p.title.slice(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Type: ${p.light_type || '?'} | ${p.wattage_actual || '?'}W`);
  });

  console.log(`\n📁 Output: CSVs/master_grow_lights.csv`);
  console.log('🎯 Next: Review the CSV, then import into Akeneo');
}

main().catch((err) => {
  console.error('❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
