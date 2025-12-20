/**
 * Build Master Grow Media CSV
 * 
 * Merges data from multiple sources into a unified grow media master file:
 * - Shopify export (current live products)
 * - WooCommerce export (legacy descriptions, images)
 * - Vendor inventory (costs, stock)
 * 
 * INCLUDES: rockwool, coco, perlite, vermiculite, clay pebbles, soil, plugs, peat
 * EXCLUDES: nutrients, pots/trays, tools, fans, filters, lights, tents
 * 
 * Outputs: CSVs/master_grow_media.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GrowMediaProduct {
  // Identity
  master_sku: string;
  handle: string;
  title: string;
  brand: string;
  category: string;
  media_type: string;
  
  // Pack/Size specs
  volume_l: string;
  volume_cuft: string;
  weight_lbs: string;
  count_each: string;
  dimensions_in: string;
  
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
  needs_volume_weight: string;
  needs_count_pack: string;
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
// Grow Media Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const MEDIA_PATTERNS = [
  // Rockwool
  /rockwool/i,
  /rock\s*wool/i,
  /grodan/i,
  /stonewool/i,
  /mineral\s*wool/i,
  /hugo\s*block/i,
  
  // Coco
  /\bcoco\b/i,
  /coir/i,
  /coconut\s*fiber/i,
  /coco\s*coir/i,
  /botanicare.*coco/i,
  /canna\s*coco/i,
  
  // Perlite/Vermiculite
  /perlite/i,
  /vermiculite/i,
  
  // Clay pebbles
  /clay\s*pebbles/i,
  /hydroton/i,
  /\bleca\b/i,
  /expanded\s*clay/i,
  /grow\s*rocks/i,
  /hydrocorn/i,
  
  // Soil
  /potting\s*soil/i,
  /potting\s*mix/i,
  /foxfarm.*soil/i,
  /ocean\s*forest/i,
  /happy\s*frog/i,
  /coco\s*loco/i,
  /roots\s*organics/i,
  /pro-mix/i,
  /promix/i,
  /super\s*soil/i,
  /living\s*soil/i,
  
  // Plugs/starters
  /rapid\s*rooter/i,
  /root\s*riot/i,
  /starter\s*plug/i,
  /propagation\s*plug/i,
  /grow\s*plug/i,
  /jiffy/i,
  /peat\s*pellet/i,
  /seed\s*starter/i,
  /clone\s*collar/i,
  /neoprene\s*insert/i,
];

// Hard exclusions
const MEDIA_EXCLUSIONS = [
  // Nutrients/additives
  /nutrient/i,
  /fertilizer/i,
  /\bph\b.*(?:up|down|adjust)/i,
  /cal-?mag/i,
  /bloom\s*boost/i,
  /root\s*boost/i,
  /\bppb\b/i,
  /flora.*grow|flora.*bloom|flora.*micro/i,
  
  // Equipment (not media)
  /\bpump\b/i,
  /\bfan\b/i,
  /\bfilter\b/i,
  /\blight\b/i,
  /\btent\b/i,
  /controller/i,
  /timer/i,
  /ballast/i,
  /reflector/i,
  
  // Containers (not media itself)
  /\btray\b/i,
  /\bpot\b(?!ting)/i,  // pot but not potting
  /\bbucket\b/i,
  /reservoir/i,
  /container/i,
  /\bsaucer\b/i,
  
  // Seeds
  /\bseed\b(?!\s*start)/i,  // seed but not seed starter
  /feminised|feminized/i,
  /auto.*flower/i,
];

// Brand patterns for grow media
const BRAND_PATTERNS: Record<string, RegExp> = {
  'Grodan': /grodan/i,
  'FoxFarm': /fox\s*farm|foxfarm/i,
  'Canna': /\bcanna\b/i,
  'Botanicare': /botanicare/i,
  'General Hydroponics': /general\s*hydro|gh\s/i,
  'Roots Organics': /roots\s*organics/i,
  'Mother Earth': /mother\s*earth/i,
  'Viagrow': /viagrow/i,
  'Hydroton': /hydroton/i,
  'Jiffy': /jiffy/i,
  'Rapid Rooter': /rapid\s*rooter/i,
  'Root Riot': /root\s*riot/i,
  'Pro-Mix': /pro-?mix/i,
  'Espoma': /espoma/i,
  'Miracle-Gro': /miracle.?gro/i,
  'Coast of Maine': /coast\s*of\s*maine/i,
  'Black Gold': /black\s*gold/i,
  'Sunshine Mix': /sunshine\s*mix/i,
  'Cyco': /\bcyco\b/i,
  'Atami': /atami/i,
  'Plagron': /plagron/i,
  'BioBizz': /biobizz/i,
  'Gold Label': /gold\s*label/i,
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

function isValidRow(handle: string, title: string): boolean {
  // Must have handle and reasonable title
  if (!handle || handle.length < 3) return false;
  if (!title || title.length < 5) return false;
  if (!/[a-zA-Z]/.test(title)) return false;
  return true;
}

function isGrowMedia(text: string): boolean {
  // Check exclusions first
  if (MEDIA_EXCLUSIONS.some(p => p.test(text))) {
    return false;
  }
  // Then check inclusions
  return MEDIA_PATTERNS.some(p => p.test(text));
}

type MediaType = 'rockwool' | 'coco' | 'perlite' | 'vermiculite' | 'clay_pebbles' | 'soil' | 'plugs' | 'peat' | 'other';

function classifyMediaType(text: string): MediaType {
  const lower = text.toLowerCase();
  
  // Rockwool
  if (/rockwool|rock\s*wool|grodan|stonewool|mineral\s*wool|hugo/.test(lower)) {
    return 'rockwool';
  }
  
  // Coco (but not soil mixes that contain coco)
  if (/\bcoco\b|coir|coconut\s*fiber/.test(lower) && !/soil|potting\s*mix/.test(lower)) {
    return 'coco';
  }
  
  // Perlite
  if (/perlite/.test(lower)) return 'perlite';
  
  // Vermiculite
  if (/vermiculite/.test(lower)) return 'vermiculite';
  
  // Clay pebbles
  if (/clay\s*pebbles|hydroton|leca|expanded\s*clay|grow\s*rocks|hydrocorn/.test(lower)) {
    return 'clay_pebbles';
  }
  
  // Soil (including mixes with coco)
  if (/potting\s*soil|potting\s*mix|ocean\s*forest|happy\s*frog|coco\s*loco|pro-?mix|super\s*soil|living\s*soil/.test(lower)) {
    return 'soil';
  }
  
  // Plugs/starters
  if (/rapid\s*rooter|root\s*riot|starter\s*plug|propagation\s*plug|grow\s*plug|clone\s*collar|neoprene\s*insert/.test(lower)) {
    return 'plugs';
  }
  
  // Peat
  if (/jiffy|peat\s*pellet|peat\s*moss|seed\s*starter/.test(lower)) {
    return 'peat';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractCount(text: string): string {
  // Match patterns like "50 ct", "(50)", "98 plugs", "200 cubes", "pack of 10"
  const patterns = [
    /(\d+)\s*(?:ct|count|pack|pcs?|pieces?)/i,
    /\((\d+)\)/,
    /(\d+)\s*(?:plugs?|cubes?|blocks?|pellets?|inserts?)/i,
    /pack\s*(?:of\s*)?(\d+)/i,
    /(\d+)\s*per\s*(?:pack|bag|case)/i,
    /qty[:\s]*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count < 10000) {
        return count.toString();
      }
    }
  }
  return '';
}

function extractVolumeLiters(text: string): string {
  // Match patterns like "50L", "50 liter", "50 litre"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:L|liter|litre)s?\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function extractVolumeCuFt(text: string): string {
  // Match patterns like "1.5 cu ft", "2 cubic feet", "1.5cf"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:cu\.?\s*ft|cubic\s*f(?:oo|ee)?t|cf)\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function extractWeightLbs(text: string): string {
  // Match patterns like "40 lb", "40lbs", "40 pound"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)s?\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function extractDimensions(text: string): string {
  // Match patterns like "4x4x4", "6" x 6" x 4"", "1.5in x 1.5in"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*["']?\s*x\s*(\d+(?:\.\d+)?)\s*["']?\s*x\s*(\d+(?:\.\d+)?)\s*["']?/i,
    /(\d+(?:\.\d+)?)\s*["']?\s*x\s*(\d+(?:\.\d+)?)\s*["']?/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[3]) {
        return `${match[1]}x${match[2]}x${match[3]}`;
      }
      return `${match[1]}x${match[2]}`;
    }
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Processing
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Building Grow Media Master CSV');
  console.log('==================================\n');

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
  console.log('\n🔍 Filtering for grow media products...');
  const products = new Map<string, GrowMediaProduct>();
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
    
    if (!isGrowMedia(combinedText)) continue;
    
    matchedCount++;

    // Find matches
    const wooMatch = wooBySlug.get(handle.toLowerCase()) || wooBySku.get(sku.toLowerCase());
    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(handle.toLowerCase());

    // Extract specs
    const mediaType = classifyMediaType(combinedText);
    const count = extractCount(combinedText);
    const volumeL = extractVolumeLiters(combinedText);
    const volumeCuFt = extractVolumeCuFt(combinedText);
    const weightLbs = extractWeightLbs(combinedText);
    const dimensions = extractDimensions(combinedText);

    // Get brand
    const brand = getBestBrand({
      combinedText,
      shopifyVendor: vendor,
      wooBrand: wooMatch?.['Brands'] || '',
    });

    // Spec source
    const specSources: string[] = [];
    if (vendorMatch) specSources.push('vendor');
    if (count || volumeL || volumeCuFt || weightLbs || dimensions) specSources.push('parsed');
    if (wooMatch) specSources.push('woo');
    specSources.push('shopify');

    const product: GrowMediaProduct = {
      master_sku: sku || handle,
      handle,
      title,
      brand: brand || '',
      category: 'Grow Media',
      media_type: mediaType,
      
      volume_l: volumeL,
      volume_cuft: volumeCuFt,
      weight_lbs: weightLbs || (row['Variant Grams'] ? (parseFloat(row['Variant Grams']) / 453.592).toFixed(1) : ''),
      count_each: count,
      dimensions_in: dimensions,
      
      cost: vendorMatch?.['Price'] || row['Cost per item'] || '',
      map_price: row['Variant Compare At Price'] || '',
      retail_price: row['Variant Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || row['Variant Inventory Qty'] || '0',
      
      short_description: '',
      long_description: wooMatch?.['Product description'] || row['Body (HTML)'] || '',
      
      image_primary: row['Image Src'] || wooMatch?.['Image URL'] || '',
      
      needs_volume_weight: (!volumeL && !volumeCuFt && !weightLbs) ? 'yes' : 'no',
      needs_count_pack: (mediaType === 'plugs' || mediaType === 'rockwool' || mediaType === 'peat') && !count ? 'yes' : 'no',
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
    
    if (!isGrowMedia(combinedText)) continue;
    
    matchedCount++;

    const mediaType = classifyMediaType(combinedText);
    const count = extractCount(combinedText);
    const volumeL = extractVolumeLiters(combinedText);
    const volumeCuFt = extractVolumeCuFt(combinedText);
    const weightLbs = extractWeightLbs(combinedText) || row['Weight'] || '';
    const dimensions = extractDimensions(combinedText);

    const brand = getBestBrand({
      combinedText,
      wooBrand: row['Brands'] || '',
    });

    const vendorMatch = vendorBySku.get(sku.toLowerCase()) || vendorByHandle.get(slug.toLowerCase());

    const product: GrowMediaProduct = {
      master_sku: sku || slug,
      handle: slug,
      title,
      brand: brand || '',
      category: 'Grow Media',
      media_type: mediaType,
      
      volume_l: volumeL,
      volume_cuft: volumeCuFt,
      weight_lbs: weightLbs,
      count_each: count,
      dimensions_in: dimensions,
      
      cost: vendorMatch?.['Price'] || '',
      map_price: '',
      retail_price: row['Regular Price'] || '',
      inventory_qty: vendorMatch?.['Inventory'] || '0',
      
      short_description: row['Product short description'] || '',
      long_description: row['Product description'] || '',
      
      image_primary: row['Image URL'] || '',
      
      needs_volume_weight: (!volumeL && !volumeCuFt && !weightLbs) ? 'yes' : 'no',
      needs_count_pack: (mediaType === 'plugs' || mediaType === 'rockwool' || mediaType === 'peat') && !count ? 'yes' : 'no',
      needs_images: !row['Image URL'] ? 'yes' : 'no',
      needs_description: !row['Product description'] ? 'yes' : 'no',
      spec_source: vendorMatch ? 'vendor|woo' : 'woo',
      
      match_confidence: vendorMatch ? '60' : '40',
      match_notes: 'Woo only (not in Shopify)',
    };

    products.set(slug, product);
  }

  console.log(`   Found ${matchedCount} media rows (${products.size} unique products)`);

  // Generate CSV
  const productList = Array.from(products.values());

  const headers = [
    'master_sku', 'handle', 'title', 'brand', 'category', 'media_type',
    'volume_l', 'volume_cuft', 'weight_lbs', 'count_each', 'dimensions_in',
    'cost', 'map_price', 'retail_price', 'inventory_qty',
    'short_description', 'long_description', 'image_primary',
    'needs_volume_weight', 'needs_count_pack', 'needs_images', 'needs_description', 'spec_source',
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

  const outputPath = resolve(CSV_DIR, 'master_grow_media.csv');
  writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`\n✅ Created master_grow_media.csv with ${productList.length} products`);

  // Statistics
  console.log('\n📊 Summary:');
  
  // By media type
  const byType = new Map<string, number>();
  for (const p of productList) {
    const t = p.media_type || 'unknown';
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  console.log('\n🌱 By Media Type:');
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
  const needsVolumeWeight = productList.filter(p => p.needs_volume_weight === 'yes').length;
  const needsCountPack = productList.filter(p => p.needs_count_pack === 'yes').length;
  const needsImages = productList.filter(p => p.needs_images === 'yes').length;
  const needsDesc = productList.filter(p => p.needs_description === 'yes').length;

  console.log('\n📋 Work Queue (needs attention):');
  console.log(`   Needs Volume/Weight: ${needsVolumeWeight}`);
  console.log(`   Needs Count/Pack: ${needsCountPack}`);
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDesc}`);

  // Specs extracted
  const withVolume = productList.filter(p => p.volume_l || p.volume_cuft).length;
  const withWeight = productList.filter(p => p.weight_lbs).length;
  const withCount = productList.filter(p => p.count_each).length;
  const withDimensions = productList.filter(p => p.dimensions_in).length;
  
  console.log('\n✨ Specs Extracted:');
  console.log(`   With volume: ${withVolume}`);
  console.log(`   With weight: ${withWeight}`);
  console.log(`   With count: ${withCount}`);
  console.log(`   With dimensions: ${withDimensions}`);

  // Sample products
  console.log('\n📋 Sample products (first 10):');
  productList.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title.substring(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'unknown'} | Type: ${p.media_type}`);
  });

  console.log(`\n📁 Output: CSVs/master_grow_media.csv`);
  console.log('🎯 Next: Review the CSV, then build Nutrients master');
}

main().catch(console.error);
