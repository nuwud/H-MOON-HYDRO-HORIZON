#!/usr/bin/env node
/**
 * buildIrrigationMaster.ts
 * ========================
 * Builds master_irrigation.csv from all source CSVs
 * 
 * Irrigation & Watering Products:
 * - Pumps (water, air, submersible)
 * - Tubing (vinyl, silicone, drip)
 * - Fittings (barbed, threaded, quick-connect)
 * - Valves (ball, check, float)
 * - Reservoirs (standalone for irrigation)
 * - Drip systems and emitters
 * - Hoses and hose accessories
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Brand patterns
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_BLOCKLIST = /[{}:]|^\d+$|^[A-Z]{20,}$|^(?:the|and|for|with)\s/i;

const BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /\bActive\s*Aqua\b/i, brand: 'Active Aqua' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bEcoPlus\b/i, brand: 'EcoPlus' },
  { pattern: /\bFloraflex\b/i, brand: 'Floraflex' },
  { pattern: /\bNetafim\b/i, brand: 'Netafim' },
  { pattern: /\bRain\s*Bird\b/i, brand: 'Rain Bird' },
  { pattern: /\bDigg.*Drip\b/i, brand: 'Digger Drip' },
  { pattern: /\bHydro\s*Flow\b/i, brand: 'Hydro Flow' },
  { pattern: /\bSuper\s*Sprouter\b/i, brand: 'Super Sprouter' },
  { pattern: /\bGeneral\s*Hydroponics\b/i, brand: 'General Hydroponics' },
  { pattern: /\bBotanicare\b/i, brand: 'Botanicare' },
  { pattern: /\bCurrent\s*Culture\b/i, brand: 'Current Culture' },
  { pattern: /\bAC\s*Infinity\b/i, brand: 'AC Infinity' },
  { pattern: /\bAquaLogic\b/i, brand: 'AquaLogic' },
  { pattern: /\bDanner\b/i, brand: 'Danner' },
  { pattern: /\bPondMaster\b/i, brand: 'Pondmaster' },
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

function getBestBrand(vendor: string, title: string, tags: string): string {
  const detected = detectBrand(title);
  if (detected) return detected;
  
  if (vendor && isValidBrand(vendor)) {
    return vendor.trim();
  }
  
  const tagDetected = detectBrand(tags);
  if (tagDetected) return tagDetected;
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Irrigation Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const IRRIGATION_PATTERNS = [
  /\bpump\b/i,
  /\bwater\s*pump\b/i,
  /\bair\s*pump\b/i,
  /\bsubmersible\b/i,
  /\btubing\b/i,
  /\bhose\b/i,
  /\bfitting\b/i,
  /\bvalve\b/i,
  /\bfloat\b.*(?:valve|switch)/i,
  /\bdrip\b/i,
  /\bemitter\b/i,
  /\bsprayer\b/i,
  /\bspray.*nozzle/i,
  /\bwand\b.*water/i,
  /\bwatering\s*(?:can|wand)/i,
  /\birrigation\b/i,
  /\bbarbed?\b.*(?:fitting|connector)/i,
  /\belbow\b/i,
  /\btee\b.*(?:fitting|connector)/i,
  /\bcoupler\b/i,
  /\bconnector\b/i,
  /\badapter\b/i,
  /\bgrommet\b/i,
  /\bmanifold\b/i,
  /\bair\s*stone\b/i,
  /\baerator\b/i,
  /\bcheck\s*valve\b/i,
  /\bball\s*valve\b/i,
  /\bgate\s*valve\b/i,
  /\bsiphon\b/i,
  /\bflood\s*(?:drain|table|tray)\b/i,
  /\bebb\s*(?:and|&)\s*flow\b/i,
  /\bactive\s*aqua\b/i,
  /\becoplus\b/i,
  /\bfloraflex\b/i,
  /\bhydro\s*flow\b/i,
];

const IRRIGATION_EXCLUSIONS = [
  /\bseed\b/i,
  /\bnutrient/i,
  /\bfertilizer/i,
  /\bsoil\b/i,
  /\bcoco\b/i,
  /\bperlite\b/i,
  /\brockwool\b/i,
  /\bfan\b/i,
  /\bcarbon\s*filter\b/i,
  /\bduct\b/i,
  /\btent\b/i,
  /\blight\b(?!.*water)/i,
  /\bled\b/i,
  /\bhps\b/i,
  /\bcmh\b/i,
  /\bballast\b/i,
  /\btimer\b(?!.*pump)/i,
  /\bcontroller\b(?!.*pump)/i,
  /\btrimmer\b/i,
  /\bscissors\b/i,
  /\bpot\b(?!.*pump)/i,
  /\bbucket\b(?!.*pump)/i,
  /\bph\s*(?:up|down|meter)\b/i,
  /\bcalibration\b/i,
];

function isIrrigationProduct(text: string): boolean {
  // Check exclusions first
  if (IRRIGATION_EXCLUSIONS.some(p => p.test(text))) {
    // But allow if strong irrigation signal
    const hasStrongSignal = /pump|tubing|fitting|valve|drip|irrigation|active\s*aqua|ecoplus|floraflex/i.test(text);
    if (!hasStrongSignal) return false;
  }
  
  return IRRIGATION_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Type Classification
// ─────────────────────────────────────────────────────────────────────────────

type IrrigationType = 
  | 'pump_water'
  | 'pump_air'
  | 'pump_submersible'
  | 'tubing'
  | 'fitting'
  | 'valve'
  | 'hose'
  | 'drip_system'
  | 'emitter'
  | 'air_stone'
  | 'manifold'
  | 'reservoir'
  | 'accessory'
  | 'other';

function classifyIrrigationType(title: string, description: string): IrrigationType {
  const text = `${title} ${description}`.toLowerCase();
  
  // Air pump
  if (/air\s*pump|aerator.*pump/i.test(text)) {
    return 'pump_air';
  }
  
  // Submersible pump
  if (/submersible|underwater.*pump/i.test(text)) {
    return 'pump_submersible';
  }
  
  // Water pump (generic)
  if (/pump/i.test(text) && !/air/i.test(text)) {
    return 'pump_water';
  }
  
  // Tubing
  if (/tubing|tube(?!.*fitting)/i.test(text)) {
    return 'tubing';
  }
  
  // Fittings
  if (/fitting|connector|adapter|elbow|tee|coupler|grommet|barb/i.test(text)) {
    return 'fitting';
  }
  
  // Valves
  if (/valve|float\s*switch/i.test(text)) {
    return 'valve';
  }
  
  // Hose
  if (/\bhose\b/i.test(text)) {
    return 'hose';
  }
  
  // Drip system
  if (/drip\s*(?:system|kit|irrigation)/i.test(text)) {
    return 'drip_system';
  }
  
  // Emitter
  if (/emitter|dripper|sprayer|nozzle/i.test(text)) {
    return 'emitter';
  }
  
  // Air stone
  if (/air\s*stone|diffuser/i.test(text)) {
    return 'air_stone';
  }
  
  // Manifold
  if (/manifold|header/i.test(text)) {
    return 'manifold';
  }
  
  // Reservoir (irrigation specific)
  if (/reservoir.*(?:pump|irrigation)|irrigation.*reservoir/i.test(text)) {
    return 'reservoir';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Size/Flow Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface SizeInfo {
  diameter: string;
  length: string;
  flow_rate: string;
}

function extractSizeInfo(title: string): SizeInfo {
  const result: SizeInfo = {
    diameter: '',
    length: '',
    flow_rate: '',
  };
  
  // Diameter (inches, mm)
  const diamMatch = title.match(/(\d+(?:\/\d+)?)\s*(?:"|inch|in)\s*(?:id|od|diameter|dia)?/i);
  if (diamMatch) {
    result.diameter = diamMatch[1] + '"';
  }
  
  // Length (feet, meters)
  const lengthMatch = title.match(/(\d+)\s*(?:'|ft|feet|foot)\b/i);
  if (lengthMatch) {
    result.length = lengthMatch[1] + ' ft';
  }
  
  // Flow rate (GPH, GPM, LPH)
  const flowMatch = title.match(/(\d+)\s*(?:gph|gpm|lph)\b/i);
  if (flowMatch) {
    const unit = title.match(/gph|gpm|lph/i)?.[0]?.toUpperCase() || 'GPH';
    result.flow_rate = flowMatch[1] + ' ' + unit;
  }
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing
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
// Output Interface
// ─────────────────────────────────────────────────────────────────────────────

interface IrrigationProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  product_type: IrrigationType;
  diameter: string;
  length: string;
  flow_rate: string;
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
  console.log('💧 Building Irrigation & Watering Master CSV');
  console.log('=============================================\n');
  
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
  const productMap = new Map<string, IrrigationProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const description = row['Body (HTML)'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const sku = row['Variant SKU'] || '';
    
    const combinedText = `${title} ${description} ${tags}`;
    
    if (!isIrrigationProduct(combinedText)) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.shopify = true;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, tags);
    const productType = classifyIrrigationType(title, description);
    const sizeInfo = extractSizeInfo(title);
    
    const hasImages = !!(row['Image Src'] || row['Image Position']);
    const hasDescription = description.length > 50;
    
    const workQueue: string[] = [];
    if (!hasImages) workQueue.push('needs_images');
    if (!hasDescription) workQueue.push('needs_description');
    if (productType === 'other') workQueue.push('needs_classification');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor,
      product_type: productType,
      diameter: sizeInfo.diameter,
      length: sizeInfo.length,
      flow_rate: sizeInfo.flow_rate,
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
    
    if (!isIrrigationProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.woo = true;
      if (existing.source === 'shopify') existing.source = 'multi';
      continue;
    }
    
    const brand = getBestBrand('', title, tags);
    const productType = classifyIrrigationType(title, description);
    const sizeInfo = extractSizeInfo(title);
    
    const hasImages = !!(row['Images']);
    const hasDescription = description.length > 50;
    
    const workQueue: string[] = [];
    if (!hasImages) workQueue.push('needs_images');
    if (!hasDescription) workQueue.push('needs_description');
    if (productType === 'other') workQueue.push('needs_classification');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor: '',
      product_type: productType,
      diameter: sizeInfo.diameter,
      length: sizeInfo.length,
      flow_rate: sizeInfo.flow_rate,
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
    
    if (!isIrrigationProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.inventory = true;
      if (!existing.sku && sku) existing.sku = sku;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, '');
    const productType = classifyIrrigationType(title, '');
    const sizeInfo = extractSizeInfo(title);
    
    const workQueue: string[] = ['needs_images', 'needs_description'];
    if (productType === 'other') workQueue.push('needs_classification');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor,
      product_type: productType,
      diameter: sizeInfo.diameter,
      length: sizeInfo.length,
      flow_rate: sizeInfo.flow_rate,
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
  console.log(`\n🔍 Filtering for irrigation products...`);
  console.log(`   Found ${products.length} irrigation products\n`);
  
  if (products.length === 0) {
    console.log('❌ No irrigation products found');
    return;
  }
  
  // Write CSV
  const headers = [
    'sku', 'handle', 'title', 'brand', 'vendor', 'product_type',
    'diameter', 'length', 'flow_rate', 'source', 'shopify', 'woo', 'inventory',
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
      p.product_type,
      escapeCsvField(p.diameter),
      escapeCsvField(p.length),
      escapeCsvField(p.flow_rate),
      p.source,
      p.shopify ? 'TRUE' : 'FALSE',
      p.woo ? 'TRUE' : 'FALSE',
      p.inventory ? 'TRUE' : 'FALSE',
      p.needs_images ? 'TRUE' : 'FALSE',
      p.needs_description ? 'TRUE' : 'FALSE',
      escapeCsvField(p.work_queue),
    ].join(','));
  }
  
  const outputPath = resolve(CSV_DIR, 'master_irrigation.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Created master_irrigation.csv with ${products.length} products\n`);
  
  // Summary stats
  console.log('📊 Summary:\n');
  
  // By type
  const byType = new Map<string, number>();
  for (const p of products) {
    byType.set(p.product_type, (byType.get(p.product_type) || 0) + 1);
  }
  console.log('💧 By Product Type:');
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
  let needsClassification = 0;
  for (const p of products) {
    if (p.needs_images) needsImages++;
    if (p.needs_description) needsDescription++;
    if (p.work_queue.includes('needs_classification')) needsClassification++;
  }
  console.log('\n📋 Work Queue:');
  console.log(`   Needs Images: ${needsImages}`);
  console.log(`   Needs Description: ${needsDescription}`);
  console.log(`   Needs Classification: ${needsClassification}`);
  
  // Sample products
  console.log('\n📋 Sample products (first 10):');
  for (const p of products.slice(0, 10)) {
    console.log(`   ${products.indexOf(p) + 1}. ${p.title.substring(0, 50)}...`);
    console.log(`      Brand: ${p.brand || 'Unknown'} | Type: ${p.product_type}`);
  }
  
  console.log(`\n📁 Output: CSVs/master_irrigation.csv`);
  console.log('🎯 Next: Run scan:coverage to see updated coverage');
}

main().catch(console.error);
