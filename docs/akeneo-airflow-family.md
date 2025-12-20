/**
 * Build Master Airflow CSV
 * 
 * Merges data from multiple sources into a unified airflow products master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (dimensions, costs, item numbers)
 * 
 * Outputs: CSVs/master_airflow.csv (populated)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AirflowProduct {
  master_sku: string;
  vendor_item_number: string;
  source_woo_sku: string;
  source_shopify_sku: string;
  source_shopify_handle: string;
  title: string;
  brand: string;
  category: string;
  is_inline_fan: string;
  is_carbon_filter: string;
  airflow_cfm: string;
  fan_diameter_in: string;
  duct_size_in: string;
  max_static_pressure_inwg: string;
  power_watts: string;
  input_voltage: string;
  current_amps: string;
  speed_control_included: string;
  controller_compatible: string;
  noise_level_db: string;
  fan_type: string;
  filter_diameter_in: string;
  filter_length_in: string;
  flange_size_in: string;
  bed_depth_in: string;
  carbon_type: string;
  max_cfm_rating: string;
  pre_filter_included: string;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  is_fragile: string;
  hazmat_flag: string;
  cost: string;
  map_price: string;
  retail_price: string;
  inventory_qty: string;
  short_description: string;
  long_description: string;
  key_features: string;
  ideal_for: string;
  includes: string;
  seo_title: string;
  seo_description: string;
  image_primary: string;
  image_alt_1: string;
  image_alt_2: string;
  image_alt_3: string;
  spec_sheet_url: string;
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
// Airflow Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const FAN_PATTERNS = [
  /inline\s*fan/i,
  /exhaust\s*fan/i,
  /duct\s*fan/i,
  /booster\s*fan/i,
  /cloudline/i,
  /ac\s*infinity.*fan/i,
  /can-?fan/i,
  /hyper\s*fan/i,
  /max\s*fan/i,
  /vortex.*fan/i,
  /mixed\s*flow/i,
  /centrifugal.*fan/i,
  /\bcfm\b.*fan/i,
  /fan.*\bcfm\b/i,
];

const FILTER_PATTERNS = [
  /carbon\s*filter/i,
  /charcoal\s*filter/i,
  /odor\s*filter/i,
  /can-?filter/i,
  /can-?lite/i,
  /phresh\s*filter/i,
  /mountain\s*air/i,
  /air\s*scrubber/i,
  /activated\s*carbon/i,
];

const BRAND_PATTERNS: Record<string, RegExp> = {
  'AC Infinity': /ac\s*infinity/i,
  'Can-Fan': /can-?fan/i,
  'Can-Filters': /can-?filter|can-?lite/i,
  'Phresh': /phresh/i,
  'Vortex': /vortex/i,
  'Hyper Fan': /hyper\s*fan/i,
  'Max Fan': /max\s*fan/i,
  'Vivosun': /vivosun/i,
  'iPower': /ipower/i,
  'Hurricane': /hurricane/i,
  'Active Air': /active\s*air/i,
  'Mountain Air': /mountain\s*air/i,
};

function isAirflowProduct(text: string): { isFan: boolean; isFilter: boolean } {
  const isFan = FAN_PATTERNS.some(p => p.test(text));
  const isFilter = FILTER_PATTERNS.some(p => p.test(text));
  return { isFan, isFilter };
}

function detectBrand(text: string): string {
  for (const [brand, pattern] of Object.entries(BRAND_PATTERNS)) {
    if (pattern.test(text)) return brand;
  }
  return '';
}

function extractCfm(text: string): string {
  // Match patterns like "400 CFM", "400cfm", "CFM: 400"
  const match = text.match(/(\d{2,4})\s*cfm/i) || text.match(/cfm[:\s]*(\d{2,4})/i);
  return match ? match[1] : '';
}

function extractDiameter(text: string): string {
  // Match patterns like "6 inch", "6in", "6\"", "8-inch"
  const match = text.match(/(\d{1,2})[\s-]*(?:inch|in|")/i);
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

  // Try to match WooCommerce by SKU
  let wooMatch = wooProducts.find(w => normalizeSku(w['Sku'] || '') === shopifySku && shopifySku);
  if (wooMatch) {
    notes.push('Woo matched by SKU');
    confidence += 40;
  } else {
    // Fallback: title similarity
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

  // Try to match Vendor by Item Number = SKU
  let vendorMatch = vendorInventory.find(v => 
    normalizeSku(v['Item Number'] || '') === shopifySku && shopifySku
  );
  if (vendorMatch) {
    notes.push('Vendor matched by Item Number');
    confidence += 40;
  } else {
    // Fallback: title/name similarity
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

  return {
    woo: wooMatch,
    vendor: vendorMatch,
    confidence,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Output
// ─────────────────────────────────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (!value) return '';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function toCSVRow(product: AirflowProduct): string {
  const fields = [
    product.master_sku,
    product.vendor_item_number,
    product.source_woo_sku,
    product.source_shopify_sku,
    product.source_shopify_handle,
    product.title,
    product.brand,
    product.category,
    product.is_inline_fan,
    product.is_carbon_filter,
    product.airflow_cfm,
    product.fan_diameter_in,
    product.duct_size_in,
    product.max_static_pressure_inwg,
    product.power_watts,
    product.input_voltage,
    product.current_amps,
    product.speed_control_included,
    product.controller_compatible,
    product.noise_level_db,
    product.fan_type,
    product.filter_diameter_in,
    product.filter_length_in,
    product.flange_size_in,
    product.bed_depth_in,
    product.carbon_type,
    product.max_cfm_rating,
    product.pre_filter_included,
    product.weight_kg,
    product.length_cm,
    product.width_cm,
    product.height_cm,
    product.is_fragile,
    product.hazmat_flag,
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
    product.match_confidence,
    product.match_notes,
  ];
  return fields.map(escapeCSV).join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌬️  Building Airflow Master CSV');
  console.log('================================\n');

  // Load all sources
  console.log('📂 Loading source files...');
  const shopifyProducts = loadShopifyProducts();
  const wooProducts = loadWooProducts();
  const vendorInventory = loadVendorInventory();

  console.log(`   Shopify: ${shopifyProducts.length} rows`);
  console.log(`   WooCommerce: ${wooProducts.length} rows`);
  console.log(`   Vendor Inventory: ${vendorInventory.length} rows\n`);

  // Filter to airflow products only
  console.log('🔍 Filtering for airflow products (fans + filters)...');
  
  const airflowShopify = shopifyProducts.filter(row => {
    const text = `${row['product_title']} ${row['product_type']} ${row['sku']}`;
    const { isFan, isFilter } = isAirflowProduct(text);
    return isFan || isFilter;
  });

  // Deduplicate by product_handle (Shopify exports have multiple rows per variant)
  const seenHandles = new Set<string>();
  const uniqueAirflow = airflowShopify.filter(row => {
    const handle = row['product_handle'];
    if (seenHandles.has(handle)) return false;
    seenHandles.add(handle);
    return true;
  });

  console.log(`   Found ${airflowShopify.length} airflow rows (${uniqueAirflow.length} unique products)\n`);

  // Build master records
  console.log('🔗 Matching and merging data...');
  const masterProducts: AirflowProduct[] = [];

  for (const shopifyRow of uniqueAirflow) {
    const title = shopifyRow['product_title'] || '';
    const sku = shopifyRow['sku'] || '';
    const handle = shopifyRow['product_handle'] || '';
    const combinedText = `${title} ${sku} ${handle}`;

    const { isFan, isFilter } = isAirflowProduct(combinedText);
    const matches = findMatches(shopifyRow, wooProducts, vendorInventory);

    // Extract specs from title/description
    const cfm = extractCfm(combinedText);
    const diameter = extractDiameter(combinedText);
    const brand = detectBrand(combinedText) || shopifyRow['product_vendor'] || '';

    // Build merged record
    const product: AirflowProduct = {
      // Identity
      master_sku: sku || handle,
      vendor_item_number: matches.vendor?.['Item Number'] || '',
      source_woo_sku: matches.woo?.['Sku'] || '',
      source_shopify_sku: sku,
      source_shopify_handle: handle,
      title: title,
      brand: brand,
      category: isFan ? 'Inline Fans' : isFilter ? 'Carbon Filters' : 'Airflow',
      is_inline_fan: isFan ? 'yes' : 'no',
      is_carbon_filter: isFilter ? 'yes' : 'no',

      // Fan specs
      airflow_cfm: cfm,
      fan_diameter_in: isFan ? diameter : '',
      duct_size_in: diameter,
      max_static_pressure_inwg: '',
      power_watts: '',
      input_voltage: '',
      current_amps: '',
      speed_control_included: '',
      controller_compatible: '',
      noise_level_db: '',
      fan_type: '',

      // Filter specs
      filter_diameter_in: isFilter ? diameter : '',
      filter_length_in: '',
      flange_size_in: isFilter ? diameter : '',
      bed_depth_in: '',
      carbon_type: '',
      max_cfm_rating: isFilter ? cfm : '',
      pre_filter_included: '',

      // Physical
      weight_kg: matches.vendor?.['Weight'] || matches.woo?.['Weight'] || '',
      length_cm: matches.vendor?.['Length'] || matches.woo?.['Length'] || '',
      width_cm: matches.vendor?.['Width'] || matches.woo?.['Width'] || '',
      height_cm: matches.vendor?.['Height'] || matches.woo?.['Height'] || '',
      is_fragile: 'no',
      hazmat_flag: 'no',

      // Pricing
      cost: matches.vendor?.['Average Unit Cost'] || shopifyRow['cost_amount'] || '',
      map_price: matches.vendor?.['MSRP'] || '',
      retail_price: shopifyRow['price'] || matches.vendor?.['Regular Price'] || '',
      inventory_qty: shopifyRow['inv_total_all_locations'] || '',

      // Content - prefer WooCommerce for rich descriptions
      short_description: matches.woo?.['Product short description'] || '',
      long_description: matches.woo?.['Product description'] || '',
      key_features: '',
      ideal_for: '',
      includes: '',

      // SEO
      seo_title: '',
      seo_description: '',

      // Media
      image_primary: '',
      image_alt_1: '',
      image_alt_2: '',
      image_alt_3: '',
      spec_sheet_url: '',

      // Match metadata
      match_confidence: String(matches.confidence),
      match_notes: matches.notes.join('; '),
    };

    masterProducts.push(product);
  }

  // Sort by confidence (highest first) then by title
  masterProducts.sort((a, b) => {
    const confDiff = parseInt(b.match_confidence) - parseInt(a.match_confidence);
    if (confDiff !== 0) return confDiff;
    return a.title.localeCompare(b.title);
  });

  // Write output
  const header = 'master_sku,vendor_item_number,source_woo_sku,source_shopify_sku,source_shopify_handle,title,brand,category,is_inline_fan,is_carbon_filter,airflow_cfm,fan_diameter_in,duct_size_in,max_static_pressure_inwg,power_watts,input_voltage,current_amps,speed_control_included,controller_compatible,noise_level_db,fan_type,filter_diameter_in,filter_length_in,flange_size_in,bed_depth_in,carbon_type,max_cfm_rating,pre_filter_included,weight_kg,length_cm,width_cm,height_cm,is_fragile,hazmat_flag,cost,map_price,retail_price,inventory_qty,short_description,long_description,key_features,ideal_for,includes,seo_title,seo_description,image_primary,image_alt_1,image_alt_2,image_alt_3,spec_sheet_url,match_confidence,match_notes';
  
  const csvContent = [header, ...masterProducts.map(toCSVRow)].join('\n');
  const outPath = resolve(CSV_DIR, 'master_airflow.csv');
  writeFileSync(outPath, csvContent, 'utf-8');

  // Summary
  console.log(`\n✅ Created master_airflow.csv with ${masterProducts.length} products\n`);

  const fans = masterProducts.filter(p => p.is_inline_fan === 'yes').length;
  const filters = masterProducts.filter(p => p.is_carbon_filter === 'yes').length;
  const highConf = masterProducts.filter(p => parseInt(p.match_confidence) >= 50).length;
  const withCfm = masterProducts.filter(p => p.airflow_cfm).length;
  const withDiameter = masterProducts.filter(p => p.fan_diameter_in || p.filter_diameter_in).length;

  console.log('📊 Summary:');
  console.log(`   Inline Fans: ${fans}`);
  console.log(`   Carbon Filters: ${filters}`);
  console.log(`   High confidence matches (≥50%): ${highConf}`);
  console.log(`   With CFM extracted: ${withCfm}`);
  console.log(`   With diameter extracted: ${withDiameter}`);

  // Show sample
  console.log('\n📋 Sample products (first 5):');
  masterProducts.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i+1}. ${p.title.slice(0, 50)}...`);
    console.log(`      SKU: ${p.master_sku} | Brand: ${p.brand || 'unknown'} | CFM: ${p.airflow_cfm || '?'} | ${p.fan_diameter_in || p.filter_diameter_in || '?'}"`);
  });

  console.log(`\n📁 Output: CSVs/master_airflow.csv`);
  console.log('🎯 Next: Review the CSV, then import into Akeneo');
}

main().catch((err) => {
  console.error('❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
