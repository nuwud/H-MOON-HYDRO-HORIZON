/**
 * Build Master Nutrients CSV
 * 
 * Merges data from multiple sources into a unified nutrients master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (costs, stock)
 * 
 * INCLUDES: base nutrients, additives, cal-mag, silica, pH control, bloom boosters, dry nutrients
 * EXCLUDES: soils, media, grow equipment, pest control
 * 
 * Outputs: CSVs/master_nutrients.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NutrientProduct {
  // Identity
  master_sku: string;
  handle: string;
  title: string;
  brand: string;
  category: string;
  nutrient_type: string;
  
  // Pack sizing
  form: string;
  size_value: string;
  size_unit: string;
  is_concentrate: string;
  
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
  needs_size: string;
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
// Row Validity (reusable guard against garbage rows)
// ─────────────────────────────────────────────────────────────────────────────

function isValidRow(handle: string, title: string): boolean {
  // Must have handle and reasonable title
  if (!handle || handle.length < 3) return false;
  if (!title || title.length < 6) return false;
  if (!/[a-zA-Z]/.test(title)) return false;
  
  // Reject corrupted data (JSON fragments, etc.)
  if (/[{}]/.test(handle)) return false;
  if (/[{}]/.test(title) && !/\{.*\}/.test(title)) return false; // allow intentional braces
  if (/maxscore|error:\d/i.test(title)) return false;
  
  return true;
}

function isValidBrand(brand: string): boolean {
  if (!brand) return false;
  // Reject garbage brands
  if (/[{}:]/.test(brand)) return false;
  if (/maxscore|error/i.test(brand)) return false;
  if (/^(watering|tools|other|unknown)$/i.test(brand)) return false;
  
  // Reject brands that are too long (likely sentence fragments)
  const wordCount = brand.trim().split(/\s+/).length;
  if (wordCount > 4) return false;
  
  // Reject if it looks like a description fragment
  if (/\b(with|for|and|the|a|an|is|are|was|were|has|have|this|that|from|by)\b/i.test(brand)) return false;
  
  // Reject if contains digits mixed with words (likely SKU or description)
  if (/\d+.*[a-z]+.*\d+/i.test(brand) && !/\d{4}/.test(brand)) return false;
  
  // Reject common garbage patterns
  if (/^\d+\s*(oz|ml|gal|qt|l|lb|g|kg)/i.test(brand)) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutrient Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const NUTRIENT_PATTERNS = [
  // Base nutrients
  /\bnutrient/i,
  /\bfertilizer/i,
  /\bfert\b/i,
  
  // Grow/Bloom/Micro systems
  /flora\s*(gro|grow|bloom|micro)/i,
  /\bgrow\b.*\b(qt|gal|liter|ml|oz)\b/i,
  /\bbloom\b.*\b(qt|gal|liter|ml|oz)\b/i,
  /\bmicro\b.*\b(qt|gal|liter|ml|oz)\b/i,
  /part\s*[ab]/i,
  /base\s*nutrient/i,
  
  // Cal-Mag
  /cal-?mag/i,
  /calcium.*magnesium/i,
  /cali-?magic/i,
  
  // Silica
  /\bsilica\b/i,
  /armor\s*si/i,
  /pro-?silicate/i,
  
  // pH control
  /ph\s*(up|down|adjust)/i,
  /ph\s*control/i,
  
  // Boosters/Additives
  /bloom\s*boost/i,
  /bud\s*boost/i,
  /root\s*boost/i,
  /\bbooster\b/i,
  /\badditive\b/i,
  /\bsupplement\b/i,
  /\benhancer\b/i,
  
  // Dry nutrients
  /dry\s*nutrient/i,
  /water\s*soluble.*fertilizer/i,
  /\bsalts\b.*nutrient/i,
  
  // Common product lines
  /general\s*hydroponics/i,
  /advanced\s*nutrients/i,
  /fox\s*farm.*liquid/i,
  /botanicare.*(?:grow|bloom|pure)/i,
  /canna\s*(?:a|b|pk|boost)/i,
  /hydroponic.*nutrients/i,
  
  // Specific products
  /voodoo\s*juice/i,
  /big\s*bud/i,
  /bud\s*candy/i,
  /overdrive/i,
  /sensi\s*(?:grow|bloom)/i,
  /connoisseur/i,
  /flora.*series/i,
  /maxigro|maxibloom/i,
  /floranova/i,
  /floralicious/i,
  /kool\s*bloom/i,
  /liquid\s*kool/i,
  /diamond\s*nectar/i,
  /rapid\s*start/i,
  /florakleen/i,
  /bio.*thrive/i,
  /bio.*weed/i,
  /bio.*marine/i,
  /bio.*root/i,
  /camg\+/i,
  /florablend/i,
  
  // Size patterns that suggest nutrients (liquid bottles)
  /\b(?:1|2\.5|5|6)\s*gal(?:lon)?/i,
  /\b(?:16|32)\s*oz/i,
  /\b(?:1|4)\s*(?:qt|quart)/i,
  /\b(?:250|500|1000)\s*ml/i,
  /\b(?:1|4|10)\s*(?:l|liter)/i,
];

// Hard exclusions
const NUTRIENT_EXCLUSIONS = [
  // Grow media (already handled)
  /\bsoil\b(?!.*hydro)/i,
  /potting\s*mix/i,
  /\bcoco\b(?!.*nutrient)/i,
  /\bcoir\b/i,
  /rockwool/i,
  /perlite/i,
  /vermiculite/i,
  /hydroton/i,
  /clay\s*pebbles/i,
  /\bleca\b/i,
  /\bplugs?\b/i,
  /rapid\s*rooter/i,
  /root\s*riot/i,
  
  // Equipment
  /\btent\b/i,
  /\bfan\b/i,
  /\bfilter\b/i,
  /\blight\b/i,
  /\bpump\b/i,
  /\btubing\b/i,
  /\btimer\b/i,
  /\bballast\b/i,
  /\breflector\b/i,
  /\bduct\b/i,
  /\bclamp\b/i,
  
  // Seeds
  /\bseed\b(?!\s*start)/i,
  /feminised|feminized/i,
  /auto.*flower/i,
  
  // Pest control (separate category)
  /pest\s*control/i,
  /insecticide/i,
  /fungicide/i,
  /pesticide/i,
  /neem/i,
];

// Brand patterns for nutrients
const BRAND_PATTERNS: Record<string, RegExp> = {
  'General Hydroponics': /general\s*hydro|gh\s|flora\s*(gro|grow|bloom|micro)|floranova|maxigro|maxibloom|diamond\s*nectar|rapid\s*start|florakleen|camg\+|florablend|floralicious|kool\s*bloom/i,
  'Advanced Nutrients': /advanced\s*nutrients|voodoo\s*juice|big\s*bud|bud\s*candy|overdrive|sensi\s*(grow|bloom)|connoisseur|rhino\s*skin|piranha|tarantula|b-?52/i,
  'FoxFarm': /fox\s*farm|foxfarm|big\s*bloom|grow\s*big|tiger\s*bloom|cha\s*ching|beastie|open\s*sesame/i,
  'Botanicare': /botanicare|pure\s*blend|hydroplex|sweet|clearex|cal-?mag\s*plus/i,
  'Canna': /\bcanna\b/i,
  'House & Garden': /house\s*(?:&|and)\s*garden|h&g/i,
  'Cyco': /\bcyco\b/i,
  'Athena': /\bathena\b/i,
  'Mills': /\bmills\b/i,
  'Emerald Harvest': /emerald\s*harvest/i,
  'Roots Organics': /roots\s*organics/i,
  'BioBizz': /biobizz/i,
  'Technaflora': /technaflora/i,
  'Humboldt Nutrients': /humboldt/i,
  'Dutch Master': /dutch\s*master/i,
  'Dyna-Gro': /dyna-?gro/i,
  'Earth Juice': /earth\s*juice/i,
  'Jack\'s Nutrients': /jack'?s\s*(?:nutrients|321|hydro)/i,
  'Plagron': /plagron/i,
  'Remo Nutrients': /remo/i,
  'Green Planet': /green\s*planet/i,
  'Cultured Solutions': /cultured\s*solutions/i,
  'Humboldts Secret': /humboldts?\s*secret/i,
  'Neptune\'s Harvest': /neptune'?s\s*harvest/i,
  'Age Old': /age\s*old/i,
  'Aurora': /\baurora\b/i,
  'Cutting Edge': /cutting\s*edge/i,
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

function isNutrient(text: string): boolean {
  // Check exclusions first
  if (NUTRIENT_EXCLUSIONS.some(p => p.test(text))) {
    return false;
  }
  // Then check inclusions
  return NUTRIENT_PATTERNS.some(p => p.test(text));
}

type NutrientType = 'base' | 'additive' | 'calmag' | 'bloom_booster' | 'silica' | 'ph_control' | 'organic' | 'dry' | 'other';

function classifyNutrientType(text: string): NutrientType {
  const lower = text.toLowerCase();
  
  // pH control
  if (/ph\s*(up|down|adjust|control)/i.test(lower)) return 'ph_control';
  
  // Cal-Mag
  if (/cal-?mag|calcium.*magnesium|cali-?magic/i.test(lower)) return 'calmag';
  
  // Silica
  if (/\bsilica\b|armor\s*si|pro-?silicate/i.test(lower)) return 'silica';
  
  // Bloom boosters
  if (/bloom\s*boost|bud\s*boost|big\s*bud|bud\s*candy|kool\s*bloom|pk\s*\d|overdrive|beastie|cha\s*ching|open\s*sesame/i.test(lower)) {
    return 'bloom_booster';
  }
  
  // Dry nutrients (only if explicitly dry form OR weight-based units without liquid units)
  const hasLiquidUnit = /\b\d+\s*(?:oz|ml|gal|qt|l|lt|ltr|liter|litre)\b/i.test(lower);
  const hasDryUnit = /\b\d+\s*(?:lb|kg|g|gram|pound)\b/i.test(lower);
  if (/dry\s*nutrient|water\s*soluble/i.test(lower) || (hasDryUnit && !hasLiquidUnit)) {
    return 'dry';
  }
  // MaxiGro/MaxiBloom are always dry (powder)
  if (/maxigro|maxibloom/i.test(lower)) {
    return 'dry';
  }
  
  // Organic
  if (/organic|bio.*thrive|bio.*weed|bio.*marine|earth\s*juice|roots\s*organic/i.test(lower)) {
    return 'organic';
  }
  
  // Base nutrients (grow/bloom/micro systems)
  if (/flora\s*(gro|grow|bloom|micro)|part\s*[ab]|sensi\s*(grow|bloom)|connoisseur|base\s*nutrient|grow.*bloom|3-part|2-part/i.test(lower)) {
    return 'base';
  }
  
  // Additives (catch-all for boosters, supplements, enhancers)
  if (/additive|supplement|enhancer|boost|root|voodoo|diamond|rapid\s*start|florakleen|clearex/i.test(lower)) {
    return 'additive';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Size Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface SizeInfo {
  value: string;
  unit: string;
  form: 'liquid' | 'dry' | '';
}

function extractSize(text: string): SizeInfo {
  const lower = text.toLowerCase();
  
  // Gallon patterns
  let match = lower.match(/(\d+(?:\.\d+)?)\s*gal(?:lon)?s?/i);
  if (match) return { value: match[1], unit: 'gal', form: 'liquid' };
  
  // Quart patterns
  match = lower.match(/(\d+(?:\.\d+)?)\s*(?:qt|quart)s?/i);
  if (match) return { value: match[1], unit: 'qt', form: 'liquid' };
  
  // Liter patterns (including lt, ltr)
  match = lower.match(/(\d+(?:\.\d+)?)\s*(?:l|lt|ltr|liter|litre)s?(?![a-z])/i);
  if (match) return { value: match[1], unit: 'l', form: 'liquid' };
  
  // ML patterns
  match = lower.match(/(\d+)\s*ml/i);
  if (match) return { value: match[1], unit: 'ml', form: 'liquid' };
  
  // Oz patterns (liquid)
  match = lower.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
  if (match) return { value: match[1], unit: 'oz', form: 'liquid' };
  
  // Pound patterns (dry)
  match = lower.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)s?/i);
  if (match) return { value: match[1], unit: 'lb', form: 'dry' };
  
  // Kg patterns (dry)
  match = lower.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilogram)s?/i);
  if (match) return { value: match[1], unit: 'kg', form: 'dry' };
  
  // Gram patterns (dry)
  match = lower.match(/(\d+)\s*(?:g|gm|gram)s?(?!\w)/i);
  if (match) return { value: match[1], unit: 'g', form: 'dry' };
  
  // Implicit sizes (standalone unit words without numbers - assume 1)
  if (/\bgallon\b/i.test(lower) && !/\d+\s*gal/i.test(lower)) {
    return { value: '1', unit: 'gal', form: 'liquid' };
  }
  if (/\bquart\b/i.test(lower) && !/\d+\s*(?:qt|quart)/i.test(lower)) {
    return { value: '1', unit: 'qt', form: 'liquid' };
  }
  if (/\bpint\b/i.test(lower) && !/\d+\s*(?:pt|pint)/i.test(lower)) {
    return { value: '1', unit: 'pt', form: 'liquid' };
  }
  if (/\bliter\b|\blitre\b/i.test(lower) && !/\d+\s*(?:l|lt|ltr|liter|litre)/i.test(lower)) {
    return { value: '1', unit: 'l', form: 'liquid' };
  }
  
  return { value: '', unit: '', form: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Processing
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Building Nutrients Master CSV');
  console.log('=================================\n');

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
  console.log('\n🔍 Filtering for nutrient products...');
  const products = new Map<string, NutrientProduct>();
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
    
    if (!isNutrient(combinedText)) continue;
    
    matchedCount++;

    // Find matches
    const wooMatch = wooBySlug.get(handle.toLowerCase()) || wooBySku.get(sku.toLowerCase());
    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(handle.toLowerCase());

    // Extract specs
    const nutrientType = classifyNutrientType(combinedText);
    const sizeInfo = extractSize(combinedText);

    // Get brand
    const brand = getBestBrand({
      combinedText,
      shopifyVendor: vendor,
      wooBrand: wooMatch?.['Brands'] || '',
    });

    // Spec source
    const specSources: string[] = [];
    if (vendorMatch) specSources.push('vendor');
    if (sizeInfo.value) specSources.push('parsed');
    if (wooMatch) specSources.push('woo');
    specSources.push('shopify');

    const product: NutrientProduct = {
      master_sku: sku || handle,
      handle,
      title,
      brand: brand || '',
      category: 'Nutrients',
      nutrient_type: nutrientType,
      
      form: sizeInfo.form,
      size_value: sizeInfo.value,
      size_unit: sizeInfo.unit,
      is_concentrate: '',
      
      cost: vendorMatch?.['Price'] || row['Cost per item'] || '',
      map_price: row['Variant Compare At Price'] || '',
      retail_price: row['Variant Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || row['Variant Inventory Qty'] || '0',
      
      short_description: '',
      long_description: wooMatch?.['Product description'] || row['Body (HTML)'] || '',
      
      image_primary: row['Image Src'] || wooMatch?.['Image URL'] || '',
      
      needs_size: !sizeInfo.value ? 'yes' : 'no',
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
    
    if (!isNutrient(combinedText)) continue;
    
    matchedCount++;

    const nutrientType = classifyNutrientType(combinedText);
    const sizeInfo = extractSize(combinedText);

    const brand = getBestBrand({
      combinedText,
      wooBrand: row['Brands'] || '',
    });

    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(slug.toLowerCase());

    const product: NutrientProduct = {
      master_sku: sku || slug,
      handle: slug,
      title,
      brand: brand || '',
      category: 'Nutrients',
      nutrient_type: nutrientType,
      
      form: sizeInfo.form,
      size_value: sizeInfo.value,
      size_unit: sizeInfo.unit,
      is_concentrate: '',
      
      cost: vendorMatch?.['Price'] || '',
      map_price: '',
      retail_price: row['Regular Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || '0',
      
      short_description: row['Product short description'] || '',
      long_description: row['Product description'] || '',
      
      image_primary: row['Image URL'] || '',
      
      needs_size: !sizeInfo.value ? 'yes' : 'no',
      needs_images: !row['Image URL'] ? 'yes' : 'no',
      needs_description: !row['Product description'] ? 'yes' : 'no',
      spec_source: vendorMatch ? 'vendor|woo' : 'woo',
      
      match_confidence: vendorMatch ? '60' : '40',
      match_notes: 'Woo only (not in Shopify)',
    };

    products.set(slug, product);
  }

  console.log(`   Found ${matchedCount} nutrient rows (${products.size} unique products)`);

  // Generate CSV
  const productList = Array.from(products.values());

  const headers = [
    'master_sku', 'handle', 'title', 'brand', 'category', 'nutrient_type',
    'form', 'size_value', 'size_unit', 'is_concentrate',
    'cost', 'map_price', 'retail_price', 'inventory_qty',
    'short_description', 'long_description', 'image_primary',
    'needs_size', 'needs_images', 'needs_description', 'spec_source',
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

  const outputPath = resolve(CSV_DIR, 'master_nutrients.csv');
  writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`\n✅ Created master_nutrients.csv with ${productList.length} products`);

  // Statistics
  console.log('\n📊 Summary:');
  
  // By nutrient type
  const byType = new Map<string, number>();
  for (const p of productList) {
    const t = p.nutrient_type || 'unknown';
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  console.log('\n🧪 By Nutrient Type:');
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
    .slice(0, 15)
    .forEach(([brand, count]) => console.log(`   ${brand}: ${count}`));

  // By form
  const byForm = new Map<string, number>();
  for (const p of productList) {
    const f = p.form || 'unknown';
    byForm.set(f, (byForm.get(f) || 0) + 1);
  }
  console.log('\n💧 By Form:');
  Array.from(byForm.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([form, count]) => console.log(`   ${form}: ${count}`));

  // Work queue stats
  const needsSize = productList.filter(p => p.needs_size === 'yes').length;
  const withSize = productList.filter(p => p.size_value).length;
  const needsImages = productList.filter(p => p.needs_images === 'yes').length;
  const needsDesc = productList.filter(p => p.needs_description === 'yes').length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   With Size Extracted: ${withSize}`);
  console.log(`   Needs Size: ${needsSize}`);
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDesc}`);

  // Sample products
  console.log('\n📋 Sample products (first 10):');
  productList.slice(0, 10).forEach((p, i) => {
    const size = p.size_value ? `${p.size_value} ${p.size_unit}` : 'no size';
    console.log(`   ${i + 1}. ${p.title.substring(0, 45)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Type: ${p.nutrient_type} | ${size}`);
  });

  console.log(`\n📁 Output: CSVs/master_nutrients.csv`);
  console.log('🎯 Next: Review the CSV, then build Controllers/Timers master');
}

main().catch(console.error);
