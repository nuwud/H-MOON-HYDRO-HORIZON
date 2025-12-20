/**
 * Build Master Grow Tents CSV
 * 
 * Merges data from multiple sources into a unified grow tents master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (dimensions, costs, item numbers)
 * 
 * Outputs: CSVs/master_grow_tents.csv (populated)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GrowTentProduct {
  // Identity
  master_sku: string;
  vendor_item_number: string;
  source_woo_sku: string;
  source_shopify_sku: string;
  source_shopify_handle: string;
  title: string;
  brand: string;
  category: string;
  
  // Core Tent Specs
  tent_width_in: string;
  tent_depth_in: string;
  tent_height_in: string;
  tent_size_label: string;
  material: string;
  frame_diameter_mm: string;
  door_count: string;
  window_count: string;
  vent_count: string;
  
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
  
  // Work queue flags
  needs_images: string;
  needs_description: string;
  needs_dimensions: string;
  needs_weight: string;
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
// Grow Tent Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const TENT_PATTERNS = [
  /grow\s*tent/i,
  /grow\s*room/i,
  /\btent\b.*\d+\s*x\s*\d+/i,
  /\d+\s*x\s*\d+.*\btent\b/i,
  /gorilla\s*grow/i,
  /secret\s*jardin/i,
  /mammoth\s*tent/i,
  /lighthouse.*tent/i,
  /apollo.*tent/i,
  /vivosun.*tent/i,
  /mars\s*hydro.*tent/i,
  /coolgrowing/i,
  /hydroplanet.*tent/i,
  /quictent/i,
  /opulent\s*systems/i,
  /agromax.*tent/i,
  /hydrocrunch.*tent/i,
  /yield\s*lab.*tent/i,
];

// Patterns that EXCLUDE a product from being a tent (accessories that mention "tent")
const TENT_EXCLUSION_PATTERNS = [
  /tent\s*clip\s*fan/i,        // Clip fans for tents
  /tent\s*fan/i,                // General tent fans
  /clip\s*fan.*tent/i,          // Clip fan for tent
  /oscillating\s*fan/i,         // Oscillating fans
  /\bfan\b.*\d+\s*["']/i,       // "Fan 9 inch" style
  /\btent\s*pole/i,             // Replacement tent poles
  /tent\s*connector/i,          // Tent connectors
  /tent\s*hook/i,               // Tent hooks
  /tent\s*clip/i,               // Tent clips
  /tent\s*strap/i,              // Tent straps
  /tent\s*hanger/i,             // Hangers for tents
  /for\s*grow\s*tent/i,         // "For grow tent" accessories
  /cloudray/i,                  // AC Infinity CLOUDRAY = clip fans, not tents
];

const BRAND_PATTERNS: Record<string, RegExp> = {
  'Gorilla Grow Tent': /gorilla\s*grow/i,
  'Secret Jardin': /secret\s*jardin/i,
  'Mammoth': /mammoth/i,
  'Lighthouse Hydro': /lighthouse/i,
  'Apollo Horticulture': /apollo/i,
  'Vivosun': /vivosun/i,
  'Mars Hydro': /mars\s*hydro/i,
  'CoolGrows': /coolgrowing|coolgrows/i,
  'Hydroplanet': /hydroplanet/i,
  'Quictent': /quictent/i,
  'Opulent Systems': /opulent\s*systems/i,
  'AgroMax': /agromax/i,
  'Hydro Crunch': /hydrocrunch|hydro\s*crunch/i,
  'Yield Lab': /yield\s*lab/i,
  'iPower': /ipower/i,
  'TopoGrow': /topogrow|topo\s*grow/i,
  'AC Infinity': /ac\s*infinity|cloudlab/i,  // CLOUDLAB is AC Infinity tent line
  'Spider Farmer': /spider\s*farmer/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Normalization
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_ALIASES: Record<string, string> = {
  'Gorilla Grow Tent': 'Gorilla Grow Tent',
  'Gorilla Grow': 'Gorilla Grow Tent',
  'GorillaTent': 'Gorilla Grow Tent',
  'Secret Jardin': 'Secret Jardin',
  'SecretJardin': 'Secret Jardin',
  'Vivosun': 'Vivosun',
  'VIVOSUN': 'Vivosun',
  'Mars Hydro': 'Mars Hydro',
  'MarsHydro': 'Mars Hydro',
  'AC Infinity': 'AC Infinity',
  'ACINFINITY': 'AC Infinity',
  'Spider Farmer': 'Spider Farmer',
  'SpiderFarmer': 'Spider Farmer',
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

function isGrowTent(text: string): boolean {
  // First check exclusions - accessories that mention "tent" but aren't tents
  if (TENT_EXCLUSION_PATTERNS.some(p => p.test(text))) {
    return false;
  }
  // Then check inclusion patterns
  return TENT_PATTERNS.some(p => p.test(text));
}

interface TentDimensions {
  width: string;
  depth: string;
  height: string;
  sizeLabel: string;
}

function extractTentSize(text: string): TentDimensions {
  // Match patterns like "4x4", "5'x5'", "48x48x80", "4 x 4 x 6.5"
  // Common formats:
  // - 4x4 (feet, square tent)
  // - 2x4 (feet, rectangular)
  // - 48x48x80 (inches)
  // - 4'x4'x6.5' (feet with quotes)
  
  let width = '';
  let depth = '';
  let height = '';
  let sizeLabel = '';

  // Try to match WxDxH pattern first (most complete)
  const wxdxhMatch = text.match(/(\d+(?:\.\d+)?)\s*['"]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['"]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['"]?/i);
  if (wxdxhMatch) {
    let w = parseFloat(wxdxhMatch[1]);
    let d = parseFloat(wxdxhMatch[2]);
    let h = parseFloat(wxdxhMatch[3]);
    
    // If all values are small (likely feet), convert to inches
    if (w <= 12 && d <= 12 && h <= 12) {
      width = String(Math.round(w * 12));
      depth = String(Math.round(d * 12));
      height = String(Math.round(h * 12));
      sizeLabel = `${wxdxhMatch[1]}x${wxdxhMatch[2]}`;
    } else {
      // Already in inches
      width = String(Math.round(w));
      depth = String(Math.round(d));
      height = String(Math.round(h));
      // Create size label in feet
      const wFt = Math.round(w / 12);
      const dFt = Math.round(d / 12);
      sizeLabel = `${wFt}x${dFt}`;
    }
    return { width, depth, height, sizeLabel };
  }

  // Try WxD pattern (height separate or missing)
  const wxdMatch = text.match(/(\d+(?:\.\d+)?)\s*['"]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['"]?(?:\s*(?:grow\s*tent|tent))?/i);
  if (wxdMatch) {
    let w = parseFloat(wxdMatch[1]);
    let d = parseFloat(wxdMatch[2]);
    
    // If values are small (likely feet), convert to inches
    if (w <= 12 && d <= 12) {
      width = String(Math.round(w * 12));
      depth = String(Math.round(d * 12));
      sizeLabel = `${wxdMatch[1]}x${wxdMatch[2]}`;
    } else {
      width = String(Math.round(w));
      depth = String(Math.round(d));
      const wFt = Math.round(w / 12);
      const dFt = Math.round(d / 12);
      sizeLabel = `${wFt}x${dFt}`;
    }
  }

  // Try to extract height separately
  const heightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:tall|height|h\b)/i) ||
                      text.match(/height[:\s]*(\d+(?:\.\d+)?)\s*(?:in|inch|")?/i) ||
                      text.match(/(\d{2,3})\s*(?:in|inch|")?\s*(?:tall|height|h\b)/i);
  if (heightMatch && !height) {
    let h = parseFloat(heightMatch[1]);
    // If small number, assume feet
    if (h <= 10) {
      height = String(Math.round(h * 12));
    } else {
      height = String(Math.round(h));
    }
  }

  return { width, depth, height, sizeLabel };
}

function extractMaterial(text: string): string {
  if (/600D/i.test(text)) return '600D Oxford';
  if (/1680D/i.test(text)) return '1680D Oxford';
  if (/oxford/i.test(text)) return 'Oxford';
  if (/mylar/i.test(text)) return 'Mylar';
  if (/diamond/i.test(text)) return 'Diamond Reflective';
  return '';
}

function extractFrameDiameter(text: string): string {
  const match = text.match(/(\d+)\s*mm\s*(?:poles?|frame|steel)/i) ||
                text.match(/(?:poles?|frame)[:\s]*(\d+)\s*mm/i);
  return match ? match[1] : '';
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

function toCSVRow(product: GrowTentProduct): string {
  const fields = [
    product.master_sku,
    product.vendor_item_number,
    product.source_woo_sku,
    product.source_shopify_sku,
    product.source_shopify_handle,
    product.title,
    product.brand,
    product.category,
    product.tent_width_in,
    product.tent_depth_in,
    product.tent_height_in,
    product.tent_size_label,
    product.material,
    product.frame_diameter_mm,
    product.door_count,
    product.window_count,
    product.vent_count,
    product.weight_lbs,
    product.box_length_in,
    product.box_width_in,
    product.box_height_in,
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
    product.needs_images,
    product.needs_description,
    product.needs_dimensions,
    product.needs_weight,
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
  console.log('🏕️  Building Grow Tents Master CSV');
  console.log('===================================\n');

  // Load all sources
  console.log('📂 Loading source files...');
  const shopifyProducts = loadShopifyProducts();
  const wooProducts = loadWooProducts();
  const vendorInventory = loadVendorInventory();

  console.log(`   Shopify: ${shopifyProducts.length} rows`);
  console.log(`   WooCommerce: ${wooProducts.length} rows`);
  console.log(`   Vendor Inventory: ${vendorInventory.length} rows\n`);

  // Filter to grow tent products only
  console.log('🔍 Filtering for grow tent products...');
  
  const tentsShopify = shopifyProducts.filter(row => {
    const text = `${row['product_title']} ${row['product_type']} ${row['sku']}`;
    return isGrowTent(text);
  });

  // Deduplicate by product_handle
  const seenHandles = new Set<string>();
  const uniqueTents = tentsShopify.filter(row => {
    const handle = row['product_handle'];
    if (seenHandles.has(handle)) return false;
    seenHandles.add(handle);
    return true;
  });

  console.log(`   Found ${tentsShopify.length} tent rows (${uniqueTents.length} unique products)\n`);

  // Build master records
  console.log('🔗 Matching and merging data...');
  const masterProducts: GrowTentProduct[] = [];

  for (const shopifyRow of uniqueTents) {
    const title = shopifyRow['product_title'] || '';
    const sku = shopifyRow['sku'] || '';
    const handle = shopifyRow['product_handle'] || '';
    const combinedText = `${title} ${sku} ${handle}`;

    const matches = findMatches(shopifyRow, wooProducts, vendorInventory);

    // Extract specs
    const dimensions = extractTentSize(combinedText);
    const material = extractMaterial(combinedText);
    const frameDiameter = extractFrameDiameter(combinedText);

    const brand = getBestBrand({
      combinedText,
      vendorBrand: matches.vendor?.['Brand'] || matches.vendor?.['Manufacturer'] || '',
      shopifyVendor: shopifyRow['product_vendor'] || '',
      wooBrand: matches.woo?.['Brand'] || '',
    });

    // Determine spec source
    const specSources: string[] = [];
    if (matches.vendor) specSources.push('vendor');
    if (matches.woo) specSources.push('woo');
    if (dimensions.width || dimensions.sizeLabel) specSources.push('parsed');
    const specSource = specSources.length > 0 ? specSources.join('|') : 'shopify';

    // Work queue
    const hasDimensions = Boolean(dimensions.width && dimensions.depth);
    const hasDescription = Boolean(matches.woo?.['Product description'] || matches.woo?.['Product short description']);
    const hasWeight = Boolean(matches.vendor?.['Weight'] || matches.woo?.['Weight']);

    const product: GrowTentProduct = {
      master_sku: sku || handle,
      vendor_item_number: matches.vendor?.['Item Number'] || '',
      source_woo_sku: matches.woo?.['Sku'] || '',
      source_shopify_sku: sku,
      source_shopify_handle: handle,
      title: title,
      brand: brand,
      category: 'Grow Tents',
      
      tent_width_in: dimensions.width,
      tent_depth_in: dimensions.depth,
      tent_height_in: dimensions.height,
      tent_size_label: dimensions.sizeLabel,
      material: material,
      frame_diameter_mm: frameDiameter,
      door_count: '',
      window_count: '',
      vent_count: '',
      
      weight_lbs: matches.vendor?.['Weight'] || matches.woo?.['Weight'] || '',
      box_length_in: matches.vendor?.['Length'] || '',
      box_width_in: matches.vendor?.['Width'] || '',
      box_height_in: matches.vendor?.['Height'] || '',
      
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
      
      needs_images: 'yes',
      needs_description: !hasDescription ? 'yes' : 'no',
      needs_dimensions: !hasDimensions ? 'yes' : 'no',
      needs_weight: !hasWeight ? 'yes' : 'no',
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
  const header = 'master_sku,vendor_item_number,source_woo_sku,source_shopify_sku,source_shopify_handle,title,brand,category,tent_width_in,tent_depth_in,tent_height_in,tent_size_label,material,frame_diameter_mm,door_count,window_count,vent_count,weight_lbs,box_length_in,box_width_in,box_height_in,cost,map_price,retail_price,inventory_qty,short_description,long_description,key_features,ideal_for,includes,seo_title,seo_description,image_primary,image_alt_1,image_alt_2,image_alt_3,needs_images,needs_description,needs_dimensions,needs_weight,spec_source,match_confidence,match_notes';
  
  const csvContent = [header, ...masterProducts.map(toCSVRow)].join('\n');
  const outPath = resolve(CSV_DIR, 'master_grow_tents.csv');
  writeFileSync(outPath, csvContent, 'utf-8');

  // Summary
  console.log(`\n✅ Created master_grow_tents.csv with ${masterProducts.length} products\n`);

  // Size breakdown
  const bySize: Record<string, number> = {};
  masterProducts.forEach(p => {
    const size = p.tent_size_label || 'Unknown';
    bySize[size] = (bySize[size] || 0) + 1;
  });

  const highConf = masterProducts.filter(p => parseInt(p.match_confidence) >= 50).length;
  const withDimensions = masterProducts.filter(p => p.tent_width_in && p.tent_depth_in).length;
  const withHeight = masterProducts.filter(p => p.tent_height_in).length;
  const withMaterial = masterProducts.filter(p => p.material).length;

  console.log('📊 Summary:');
  console.log(`   High confidence matches (≥50%): ${highConf}`);
  console.log(`   With W×D dimensions: ${withDimensions}`);
  console.log(`   With height: ${withHeight}`);
  console.log(`   With material: ${withMaterial}`);

  console.log('\n📐 By Size:');
  Object.entries(bySize)
    .sort((a, b) => b[1] - a[1])
    .forEach(([size, count]) => {
      console.log(`   ${size}: ${count}`);
    });

  // Work queue
  const needsDimensions = masterProducts.filter(p => p.needs_dimensions === 'yes').length;
  const needsDescription = masterProducts.filter(p => p.needs_description === 'yes').length;
  const needsWeight = masterProducts.filter(p => p.needs_weight === 'yes').length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   Needs Dimensions: ${needsDimensions}`);
  console.log(`   Needs Description: ${needsDescription}`);
  console.log(`   Needs Weight: ${needsWeight}`);

  // Brand breakdown
  const byBrand: Record<string, number> = {};
  masterProducts.forEach(p => {
    const brand = p.brand || 'Unknown';
    byBrand[brand] = (byBrand[brand] || 0) + 1;
  });
  console.log('\n🏷️  By Brand:');
  Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([brand, count]) => {
      console.log(`   ${brand}: ${count}`);
    });

  // Sample
  console.log('\n📋 Sample products (first 5):');
  masterProducts.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i+1}. ${p.title.slice(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Size: ${p.tent_size_label || '?'} | ${p.tent_width_in || '?'}×${p.tent_depth_in || '?'}×${p.tent_height_in || '?'}"`);
  });

  console.log(`\n📁 Output: CSVs/master_grow_tents.csv`);
  console.log('🎯 Next: Review the CSV, then import into Akeneo');
}

main().catch((err) => {
  console.error('❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
