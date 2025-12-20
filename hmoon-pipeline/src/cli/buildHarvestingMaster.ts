#!/usr/bin/env node
/**
 * buildHarvestingMaster.ts
 * ========================
 * Builds master_harvesting.csv from all source CSVs
 * 
 * Harvesting & Processing Products:
 * - Trimmers (manual, electric, automatic)
 * - Drying racks, hang dryers, drying nets
 * - Trim bags, harvest bags
 * - Trim bins, bowls
 * - Scissors, shears, snips
 * - Curing jars, containers
 * - Humidity packs (Boveda, Integra)
 * - Extraction equipment (bubble bags, presses)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Brand patterns (copied from brand.ts for self-contained builder)
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_BLOCKLIST = /[{}:]|^\d+$|^[A-Z]{20,}$|^(?:the|and|for|with)\s/i;

const BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  // Harvesting-specific brands
  { pattern: /\bTriminator\b/i, brand: 'Triminator' },
  { pattern: /\bTwister\b/i, brand: 'Twister' },
  { pattern: /\bCenturion\s*Pro\b/i, brand: 'Centurion Pro' },
  { pattern: /\bGreenBroz\b/i, brand: 'GreenBroz' },
  { pattern: /\bRisentek\b/i, brand: 'Risentek' },
  { pattern: /\bChikamasa\b/i, brand: 'Chikamasa' },
  { pattern: /\bFiskars\b/i, brand: 'Fiskars' },
  { pattern: /\bBoveda\b/i, brand: 'Boveda' },
  { pattern: /\bIntegra\s*Boost\b/i, brand: 'Integra Boost' },
  { pattern: /\bIntegra\b/i, brand: 'Integra' },
  { pattern: /\bGrove\s*Bags\b/i, brand: 'Grove Bags' },
  { pattern: /\bTurkey\s*Bags\b/i, brand: 'Turkey Bags' },
  { pattern: /\bBubble\s*Magic\b/i, brand: 'Bubble Magic' },
  { pattern: /\bBold\s*Maker\b/i, brand: 'Bold Maker' },
  { pattern: /\bHash\s*Factory\b/i, brand: 'Hash Factory' },
  { pattern: /\bPure\s*Pressure\b/i, brand: 'Pure Pressure' },
  { pattern: /\bNugSmasher\b/i, brand: 'NugSmasher' },
  { pattern: /\bDulytek\b/i, brand: 'Dulytek' },
  { pattern: /\bRosin\s*Tech\b/i, brand: 'Rosin Tech' },
  { pattern: /\bStack\s*!\s*T\b/i, brand: 'Stack!T' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bActive\s*Air\b/i, brand: 'Active Air' },
  { pattern: /\bAC\s*Infinity\b/i, brand: 'AC Infinity' },
  { pattern: /\bSecret\s*Jardin\b/i, brand: 'Secret Jardin' },
  { pattern: /\bGorilla\s*Grow\b/i, brand: 'Gorilla Grow' },
  { pattern: /\bVivosun\b/i, brand: 'Vivosun' },
  { pattern: /\bMars\s*Hydro\b/i, brand: 'Mars Hydro' },
  { pattern: /\bSpider\s*Farmer\b/i, brand: 'Spider Farmer' },
  { pattern: /\bGro\s*Pro\b/i, brand: 'Gro Pro' },
  { pattern: /\bRoot\s*Pouch\b/i, brand: 'Root Pouch' },
  { pattern: /\bUNO\b/i, brand: 'UNO' },
];

function isValidBrand(brand: string): boolean {
  if (!brand || brand.length < 2 || brand.length > 40) return false;
  if (BRAND_BLOCKLIST.test(brand)) return false;
  const words = brand.trim().split(/\s+/);
  if (words.length > 4) return false;
  return true;
}

function detectBrand(text: string): string | null {
  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(text)) return brand;
  }
  return null;
}

function normalizeBrand(brand: string): string {
  if (!brand) return '';
  const lower = brand.toLowerCase().trim();
  
  // Known normalizations
  if (/^uno$/i.test(lower)) return 'UNO';
  if (/boveda/i.test(lower)) return 'Boveda';
  if (/integra/i.test(lower)) return 'Integra';
  if (/fiskars/i.test(lower)) return 'Fiskars';
  if (/chikamasa/i.test(lower)) return 'Chikamasa';
  if (/grove\s*bags/i.test(lower)) return 'Grove Bags';
  if (/stack.*t/i.test(lower)) return 'Stack!T';
  if (/ac\s*infinity/i.test(lower)) return 'AC Infinity';
  if (/hydrofarm/i.test(lower)) return 'Hydrofarm';
  
  return brand.trim();
}

function getBestBrand(vendor: string, title: string, tags: string): string {
  // Try to detect from title first
  const detected = detectBrand(title);
  if (detected) return detected;
  
  // Try vendor
  if (vendor && isValidBrand(vendor)) {
    const normalized = normalizeBrand(vendor);
    if (normalized) return normalized;
  }
  
  // Try tags
  const tagDetected = detectBrand(tags);
  if (tagDetected) return tagDetected;
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Harvesting Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const HARVESTING_PATTERNS = [
  /\btrimmer\b/i,
  /\btrim\s*(?:bin|bowl|tray)\b/i,
  /\bdrying\s*(?:rack|net|screen|tent)\b/i,
  /\bdry\s*rack\b/i,
  /\bhang\s*dry/i,
  /\bharvest\s*(?:bag|container|bin)\b/i,
  /\bscissor/i,
  /\bshear/i,
  /\bsnip/i,
  /\bpruner/i,
  /\bcuring\s*(?:jar|container)\b/i,
  /\bboveda\b/i,
  /\bintegra\s*boost\b/i,
  /\bhumidity\s*pack/i,
  /\bbubble\s*bag/i,
  /\bice\s*(?:hash|extraction)\b/i,
  /\brosin\s*(?:press|bag|filter)\b/i,
  /\bpollen\s*(?:press|box)\b/i,
  /\bextraction\s*(?:bag|tube|kit)\b/i,
  /\bturkey\s*bag/i,
  /\bgrove\s*bag/i,
  /\bcure\s*bag/i,
  /\bchikamasa\b/i,
  /\bfiskars\b/i,
  /\bstack.*t.*dry/i,
  /\btriminator\b/i,
  /\bgreenbroz\b/i,
  /\brisentek\b/i,
  /\btwister.*trim/i,
];

const HARVESTING_EXCLUSIONS = [
  /\bseed\b/i,
  /\bnutrient/i,
  /\bfertilizer/i,
  /\bsoil\b/i,
  /\bcoco\b/i,
  /\bperlite\b/i,
  /\brockwool\b/i,
  /\bfan\b(?!.*trim)/i,
  /\bfilter\b(?!.*rosin)/i,
  /\bcarbon\s*filter/i,
  /\bduct\b/i,
  /\btent\b(?!.*dry)/i,
  /\blight\b(?!.*trim)/i,
  /\bled\b/i,
  /\bhps\b/i,
  /\bcmh\b/i,
  /\bballast\b/i,
  /\breflector\b/i,
  /\bcontroller\b/i,
  /\btimer\b/i,
  /\bpump\b/i,
  /\breservoir\b/i,
  /\bpot\b(?!.*pollen)/i,
  /\bbucket\b/i,
  /\bsaucer\b/i,
];

function isHarvestingProduct(text: string): boolean {
  // Check exclusions first
  if (HARVESTING_EXCLUSIONS.some(p => p.test(text))) {
    // But allow if strong harvesting signal
    const hasStrongSignal = /trimmer|scissor|shear|boveda|rosin|drying\s*rack|bubble\s*bag/i.test(text);
    if (!hasStrongSignal) return false;
  }
  
  return HARVESTING_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Type Classification
// ─────────────────────────────────────────────────────────────────────────────

type HarvestingType = 
  | 'trimmer_manual'
  | 'trimmer_electric'
  | 'trimmer_automatic'
  | 'scissors'
  | 'drying_rack'
  | 'drying_net'
  | 'trim_bin'
  | 'harvest_bag'
  | 'cure_container'
  | 'humidity_pack'
  | 'extraction_bag'
  | 'rosin_press'
  | 'accessory'
  | 'other';

function classifyHarvestingType(title: string, description: string): HarvestingType {
  const text = `${title} ${description}`.toLowerCase();
  
  // Trimmers
  if (/trimmer/i.test(text)) {
    if (/automatic|auto\s*trim|machine/i.test(text)) return 'trimmer_automatic';
    if (/electric|motor|power/i.test(text)) return 'trimmer_electric';
    return 'trimmer_manual';
  }
  
  // Scissors/Shears
  if (/scissor|shear|snip|pruner|chikamasa|fiskars/i.test(text)) {
    return 'scissors';
  }
  
  // Drying
  if (/drying\s*(?:rack|stand)|hang.*dry|dry.*rack|stack.*t/i.test(text)) {
    return 'drying_rack';
  }
  if (/drying\s*(?:net|screen|mesh)/i.test(text)) {
    return 'drying_net';
  }
  
  // Trim bins
  if (/trim\s*(?:bin|bowl|tray)/i.test(text)) {
    return 'trim_bin';
  }
  
  // Bags
  if (/turkey\s*bag|grove\s*bag|harvest\s*bag|cure\s*bag/i.test(text)) {
    return 'harvest_bag';
  }
  
  // Humidity control
  if (/boveda|integra|humidity\s*pack|humidity\s*control/i.test(text)) {
    return 'humidity_pack';
  }
  
  // Curing containers
  if (/curing\s*jar|cure.*container|mason.*jar/i.test(text)) {
    return 'cure_container';
  }
  
  // Extraction
  if (/bubble\s*bag|ice.*bag|extraction\s*(?:bag|tube)/i.test(text)) {
    return 'extraction_bag';
  }
  if (/rosin\s*(?:press|machine)|nug.*smasher|dulytek/i.test(text)) {
    return 'rosin_press';
  }
  
  // Accessories
  if (/replacement|blade|screen|filter.*bag|micron/i.test(text)) {
    return 'accessory';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing (inline for self-contained builder)
// ─────────────────────────────────────────────────────────────────────────────

interface CsvRow {
  [key: string]: string;
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

function parseCsv(content: string): CsvRow[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else if (char !== '\r') {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length < 2) return [];
  
  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Size/Quantity Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface SizeInfo {
  quantity: number | null;
  unit: string;
  packSize: number | null;
  micron: number | null;
}

function extractSizeInfo(title: string): SizeInfo {
  const result: SizeInfo = {
    quantity: null,
    unit: '',
    packSize: null,
    micron: null,
  };
  
  // Micron rating (for bags/screens)
  const micronMatch = title.match(/(\d+)\s*(?:micron|μ|µ)/i);
  if (micronMatch) {
    result.micron = parseInt(micronMatch[1], 10);
  }
  
  // Pack size
  const packMatch = title.match(/(\d+)\s*(?:pack|pk|pcs|pieces|count|ct)\b/i);
  if (packMatch) {
    result.packSize = parseInt(packMatch[1], 10);
  }
  
  // Humidity pack grams (Boveda specific)
  const gramMatch = title.match(/(\d+)\s*(?:gram|g)\b/i);
  if (gramMatch) {
    result.quantity = parseInt(gramMatch[1], 10);
    result.unit = 'g';
  }
  
  // RH percentage (Boveda)
  const rhMatch = title.match(/(\d+)\s*%\s*(?:rh|humidity)/i);
  if (rhMatch) {
    // Store in unit for reference
    result.unit = `${rhMatch[1]}% RH`;
  }
  
  // Dimensions (for racks)
  const dimMatch = title.match(/(\d+)\s*(?:"|inch|in).*(?:diameter|dia|round)/i);
  if (dimMatch) {
    result.quantity = parseInt(dimMatch[1], 10);
    result.unit = 'inch';
  }
  
  // Tier count (for racks)
  const tierMatch = title.match(/(\d+)\s*(?:tier|layer|level)/i);
  if (tierMatch) {
    result.quantity = parseInt(tierMatch[1], 10);
    result.unit = 'tier';
  }
  
  // Gallon (for bags/buckets)
  const galMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:gal(?:lon)?)\b/i);
  if (galMatch) {
    result.quantity = parseFloat(galMatch[1]);
    result.unit = 'gal';
  }
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Interface
// ─────────────────────────────────────────────────────────────────────────────

interface HarvestingProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  harvesting_type: HarvestingType;
  quantity: string;
  unit: string;
  pack_size: string;
  micron: string;
  material: string;
  color: string;
  source: string;
  shopify: boolean;
  woo: boolean;
  inventory: boolean;
  needs_images: boolean;
  needs_description: boolean;
  work_queue: string;
}

function escapeCsvField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌿 Building Harvesting & Processing Master CSV');
  console.log('================================================\n');
  
  // Load source files
  console.log('📂 Loading source files...');
  
  const shopifyPath = resolve(CSV_DIR, 'products_export_1.csv');
  const wooPath = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  const inventoryPath = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  
  let shopifyRows: CsvRow[] = [];
  let wooRows: CsvRow[] = [];
  let inventoryRows: CsvRow[] = [];
  
  if (existsSync(shopifyPath)) {
    shopifyRows = parseCsv(readFileSync(shopifyPath, 'utf-8'));
    console.log(`   Shopify: ${shopifyRows.length} rows`);
  }
  
  if (existsSync(wooPath)) {
    wooRows = parseCsv(readFileSync(wooPath, 'utf-8'));
    console.log(`   WooCommerce: ${wooRows.length} rows`);
  }
  
  if (existsSync(inventoryPath)) {
    inventoryRows = parseCsv(readFileSync(inventoryPath, 'utf-8'));
    console.log(`   Vendor Inventory: ${inventoryRows.length} rows`);
  }
  
  // Process and dedupe
  const productMap = new Map<string, HarvestingProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const description = row['Body (HTML)'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const sku = row['Variant SKU'] || '';
    
    const combinedText = `${title} ${description} ${tags}`;
    
    if (!isHarvestingProduct(combinedText)) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.shopify = true;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, tags);
    const harvestType = classifyHarvestingType(title, description);
    const sizeInfo = extractSizeInfo(title);
    
    const hasImages = !!(row['Image Src'] || row['Image Position']);
    const hasDescription = description.length > 50;
    
    const workQueue: string[] = [];
    if (!hasImages) workQueue.push('needs_images');
    if (!hasDescription) workQueue.push('needs_description');
    if (!sizeInfo.quantity && !sizeInfo.packSize && !sizeInfo.micron) workQueue.push('needs_specs');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor,
      harvesting_type: harvestType,
      quantity: sizeInfo.quantity?.toString() || '',
      unit: sizeInfo.unit,
      pack_size: sizeInfo.packSize?.toString() || '',
      micron: sizeInfo.micron?.toString() || '',
      material: '',
      color: '',
      source: 'shopify',
      shopify: true,
      woo: false,
      inventory: false,
      needs_images: !hasImages,
      needs_description: !hasDescription,
      work_queue: workQueue.join(', '),
    });
  }
  
  // Process WooCommerce
  for (const row of wooRows) {
    const sku = row['SKU'] || '';
    const title = row['Name'] || '';
    const description = row['Description'] || row['Short description'] || '';
    const categories = row['Categories'] || '';
    const tags = row['Tags'] || '';
    
    const combinedText = `${title} ${description} ${categories} ${tags}`;
    
    if (!isHarvestingProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.woo = true;
      if (existing.source === 'shopify') existing.source = 'multi';
      continue;
    }
    
    const brand = getBestBrand('', title, tags);
    const harvestType = classifyHarvestingType(title, description);
    const sizeInfo = extractSizeInfo(title);
    
    const hasImages = !!(row['Images']);
    const hasDescription = description.length > 50;
    
    const workQueue: string[] = [];
    if (!hasImages) workQueue.push('needs_images');
    if (!hasDescription) workQueue.push('needs_description');
    if (!sizeInfo.quantity && !sizeInfo.packSize && !sizeInfo.micron) workQueue.push('needs_specs');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor: '',
      harvesting_type: harvestType,
      quantity: sizeInfo.quantity?.toString() || '',
      unit: sizeInfo.unit,
      pack_size: sizeInfo.packSize?.toString() || '',
      micron: sizeInfo.micron?.toString() || '',
      material: '',
      color: '',
      source: 'woo',
      shopify: false,
      woo: true,
      inventory: false,
      needs_images: !hasImages,
      needs_description: !hasDescription,
      work_queue: workQueue.join(', '),
    });
  }
  
  // Process Inventory
  for (const row of inventoryRows) {
    const sku = row['SKU'] || row['Item Number'] || '';
    const title = row['Item Description'] || row['Product Name'] || row['Description'] || '';
    const vendor = row['Vendor'] || row['Manufacturer'] || '';
    
    const combinedText = `${title} ${vendor}`;
    
    if (!isHarvestingProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.inventory = true;
      if (!existing.sku && sku) existing.sku = sku;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, '');
    const harvestType = classifyHarvestingType(title, '');
    const sizeInfo = extractSizeInfo(title);
    
    const workQueue: string[] = ['needs_images', 'needs_description'];
    if (!sizeInfo.quantity && !sizeInfo.packSize && !sizeInfo.micron) workQueue.push('needs_specs');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor,
      harvesting_type: harvestType,
      quantity: sizeInfo.quantity?.toString() || '',
      unit: sizeInfo.unit,
      pack_size: sizeInfo.packSize?.toString() || '',
      micron: sizeInfo.micron?.toString() || '',
      material: '',
      color: '',
      source: 'inventory',
      shopify: false,
      woo: false,
      inventory: true,
      needs_images: true,
      needs_description: true,
      work_queue: workQueue.join(', '),
    });
  }
  
  const products = Array.from(productMap.values());
  console.log(`\n🔍 Filtering for harvesting products...`);
  console.log(`   Found ${products.length} harvesting products\n`);
  
  if (products.length === 0) {
    console.log('❌ No harvesting products found');
    return;
  }
  
  // Write CSV
  const headers = [
    'sku', 'handle', 'title', 'brand', 'vendor', 'harvesting_type',
    'quantity', 'unit', 'pack_size', 'micron', 'material', 'color',
    'source', 'shopify', 'woo', 'inventory',
    'needs_images', 'needs_description', 'work_queue',
  ];
  
  const csvLines = [headers.join(',')];
  
  for (const p of products) {
    csvLines.push([
      escapeCsvField(p.sku),
      escapeCsvField(p.handle),
      escapeCsvField(p.title),
      escapeCsvField(p.brand),
      escapeCsvField(p.vendor),
      p.harvesting_type,
      p.quantity,
      p.unit,
      p.pack_size,
      p.micron,
      escapeCsvField(p.material),
      escapeCsvField(p.color),
      p.source,
      p.shopify ? 'TRUE' : 'FALSE',
      p.woo ? 'TRUE' : 'FALSE',
      p.inventory ? 'TRUE' : 'FALSE',
      p.needs_images ? 'TRUE' : 'FALSE',
      p.needs_description ? 'TRUE' : 'FALSE',
      escapeCsvField(p.work_queue),
    ].join(','));
  }
  
  const outputPath = resolve(CSV_DIR, 'master_harvesting.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Created master_harvesting.csv with ${products.length} products\n`);
  
  // Summary stats
  console.log('📊 Summary:\n');
  
  // By type
  const byType = new Map<string, number>();
  for (const p of products) {
    byType.set(p.harvesting_type, (byType.get(p.harvesting_type) || 0) + 1);
  }
  console.log('🌿 By Harvesting Type:');
  for (const [type, count] of Array.from(byType.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }
  
  // By brand
  const byBrand = new Map<string, number>();
  for (const p of products) {
    const brand = p.brand || 'Unknown';
    byBrand.set(brand, (byBrand.get(brand) || 0) + 1);
  }
  console.log('\n🏷️  By Brand:');
  for (const [brand, count] of Array.from(byBrand.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`   ${brand}: ${count}`);
  }
  
  // Work queue
  let needsImages = 0;
  let needsDescription = 0;
  let needsSpecs = 0;
  for (const p of products) {
    if (p.needs_images) needsImages++;
    if (p.needs_description) needsDescription++;
    if (p.work_queue.includes('needs_specs')) needsSpecs++;
  }
  console.log('\n📋 Work Queue:');
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDescription}`);
  console.log(`   Needs Specs: ${needsSpecs}`);
  
  // Sample products
  console.log('\n📋 Sample products (first 10):');
  for (const p of products.slice(0, 10)) {
    console.log(`   ${products.indexOf(p) + 1}. ${p.title.substring(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'Unknown'} | Type: ${p.harvesting_type}`);
  }
  
  console.log(`\n📁 Output: CSVs/master_harvesting.csv`);
  console.log('🎯 Next: Run scan:coverage to see updated coverage');
}

main().catch(console.error);
