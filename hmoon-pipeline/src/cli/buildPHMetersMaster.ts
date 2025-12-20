#!/usr/bin/env node
/**
 * buildPHMetersMaster.ts
 * ======================
 * Builds master_ph_meters.csv from all source CSVs
 * 
 * pH/EC Meters & Testing Products:
 * - pH meters (digital, pen-style)
 * - EC/TDS/PPM meters
 * - Combo pH/EC meters
 * - Calibration solutions
 * - Storage solutions
 * - Replacement electrodes/probes
 * - pH test kits (drops, strips)
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
  { pattern: /\bBluelab\b/i, brand: 'Bluelab' },
  { pattern: /\bHanna\b/i, brand: 'Hanna Instruments' },
  { pattern: /\bApera\b/i, brand: 'Apera Instruments' },
  { pattern: /\bMilwaukee\b/i, brand: 'Milwaukee Instruments' },
  { pattern: /\bOakton\b/i, brand: 'Oakton' },
  { pattern: /\bEssential\b.*\bpH\b/i, brand: 'Essential pH' },
  { pattern: /\bHM\s*Digital\b/i, brand: 'HM Digital' },
  { pattern: /\bGeneral\s*Hydroponics\b/i, brand: 'General Hydroponics' },
  { pattern: /\bGrowBoss\b/i, brand: 'GrowBoss' },
  { pattern: /\bGrowBright\b/i, brand: 'GrowBright' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bActive\s*Air\b/i, brand: 'Active Air' },
  { pattern: /\bAC\s*Infinity\b/i, brand: 'AC Infinity' },
  { pattern: /\bAutopilot\b/i, brand: 'Autopilot' },
  { pattern: /\bPulse\b/i, brand: 'Pulse' },
  { pattern: /\bTrolMaster\b/i, brand: 'TrolMaster' },
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
// pH/EC Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const PHEC_PATTERNS = [
  /\bph\s*meter\b/i,
  /\bph\s*pen\b/i,
  /\bph\s*tester\b/i,
  /\bec\s*meter\b/i,
  /\btds\s*meter\b/i,
  /\bppm\s*meter\b/i,
  /\bconductivity\s*meter\b/i,
  /\bph\s*(?:up|down|adjust)/i,
  /\bcalibration\s*solution/i,
  /\bstorage\s*solution/i,
  /\belectrode/i,
  /\bprobe\b.*(?:ph|ec|replacement)/i,
  /\bph\s*test\s*kit/i,
  /\bph\s*(?:drops|strips)/i,
  /\bbluelab/i,
  /\bhanna.*(?:meter|solution|electrode)/i,
  /\bapera\b/i,
  /\bmilwaukee.*(?:ph|ec|meter)/i,
  /\b(?:4\.0|7\.0|10\.0)\s*(?:ph\s*)?(?:calibration|buffer)/i,
  /\b1413\s*(?:ec|µs|calibration)/i,
  /\bguard\s*ii?\b.*(?:ph|monitor)/i,
  /\btruncheon\b/i,
  /\bcleaning\s*solution.*(?:probe|electrode)/i,
];

const PHEC_EXCLUSIONS = [
  /\bseed\b/i,
  /\bnutrient(?!.*calibration)/i,
  /\bfertilizer(?!.*test)/i,
  /\bsoil\b(?!.*ph.*test)/i,
  /\bcoco\b/i,
  /\bperlite\b/i,
  /\brockwool\b/i,
  /fan|filter|duct|tent|light|led|hps/i,
  /controller(?!.*ph)/i,
  /timer|pump|reservoir/i,
  /\bpot\b|\bbucket\b|\bsaucer\b/i,
  /trimmer|scissors|drying/i,
  /\bph\s*(?:up|down)\b.*(?:gal|gallon|quart|liter)/i, // pH adjusters are nutrients
];

function isPHECProduct(text: string): boolean {
  // Check exclusions first
  if (PHEC_EXCLUSIONS.some(p => p.test(text))) {
    // But allow if strong pH/EC signal
    const hasStrongSignal = /\b(?:meter|tester|pen|electrode|probe|calibration|bluelab|hanna|apera)\b/i.test(text);
    if (!hasStrongSignal) return false;
  }
  
  return PHEC_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Type Classification
// ─────────────────────────────────────────────────────────────────────────────

type PHECType = 
  | 'ph_meter'
  | 'ec_meter'
  | 'combo_meter'
  | 'calibration_solution'
  | 'storage_solution'
  | 'cleaning_solution'
  | 'electrode'
  | 'test_kit'
  | 'accessory'
  | 'other';

function classifyPHECType(title: string, description: string): PHECType {
  const text = `${title} ${description}`.toLowerCase();
  
  // Combo meter
  if (/ph.*ec|ec.*ph|combo.*meter|ph\/ec|ec\/ph/i.test(text)) {
    return 'combo_meter';
  }
  
  // pH meter
  if (/ph\s*(?:meter|pen|tester|monitor)\b/i.test(text) && !/ec|tds|ppm|conductivity/i.test(text)) {
    return 'ph_meter';
  }
  
  // EC/TDS meter
  if (/(?:ec|tds|ppm|conductivity)\s*(?:meter|pen|tester|monitor)\b/i.test(text)) {
    return 'ec_meter';
  }
  
  // Calibration solution
  if (/calibration|buffer\s*solution|(?:4\.0|7\.0|10\.0|1413)\s*(?:solution|calibration)/i.test(text)) {
    return 'calibration_solution';
  }
  
  // Storage solution
  if (/storage\s*solution|electrode\s*storage/i.test(text)) {
    return 'storage_solution';
  }
  
  // Cleaning solution
  if (/cleaning\s*solution|probe\s*clean/i.test(text)) {
    return 'cleaning_solution';
  }
  
  // Electrode/probe
  if (/electrode|replacement\s*probe|probe.*replacement/i.test(text)) {
    return 'electrode';
  }
  
  // Test kit
  if (/test\s*kit|ph\s*(?:drops|strips)/i.test(text)) {
    return 'test_kit';
  }
  
  // General pH or EC product (meters)
  if (/bluelab|hanna|apera|milwaukee/i.test(text)) {
    if (/ph/i.test(text) && /ec|conductivity/i.test(text)) return 'combo_meter';
    if (/ph/i.test(text)) return 'ph_meter';
    if (/ec|conductivity|tds|ppm/i.test(text)) return 'ec_meter';
  }
  
  // Accessories
  if (/carry\s*case|lanyard|holder|cap/i.test(text)) {
    return 'accessory';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume/Size Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractVolume(title: string): { quantity: number | null; unit: string } {
  // ml/mL
  const mlMatch = title.match(/(\d+)\s*(?:ml|mL)\b/i);
  if (mlMatch) {
    return { quantity: parseInt(mlMatch[1], 10), unit: 'ml' };
  }
  
  // oz
  const ozMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:oz|fl\s*oz)\b/i);
  if (ozMatch) {
    return { quantity: parseFloat(ozMatch[1]), unit: 'oz' };
  }
  
  // L/liter
  const literMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:L|liter|litre)\b/i);
  if (literMatch) {
    return { quantity: parseFloat(literMatch[1]), unit: 'L' };
  }
  
  return { quantity: null, unit: '' };
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

interface PHECProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  product_type: PHECType;
  volume: string;
  volume_unit: string;
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
  console.log('🔬 Building pH/EC Meters Master CSV');
  console.log('====================================\n');
  
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
  const productMap = new Map<string, PHECProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const description = row['Body (HTML)'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const sku = row['Variant SKU'] || '';
    
    const combinedText = `${title} ${description} ${tags}`;
    
    if (!isPHECProduct(combinedText)) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.shopify = true;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, tags);
    const productType = classifyPHECType(title, description);
    const volume = extractVolume(title);
    
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
      volume: volume.quantity?.toString() || '',
      volume_unit: volume.unit,
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
    
    if (!isPHECProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.woo = true;
      if (existing.source === 'shopify') existing.source = 'multi';
      continue;
    }
    
    const brand = getBestBrand('', title, tags);
    const productType = classifyPHECType(title, description);
    const volume = extractVolume(title);
    
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
      volume: volume.quantity?.toString() || '',
      volume_unit: volume.unit,
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
    
    if (!isPHECProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.inventory = true;
      if (!existing.sku && sku) existing.sku = sku;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, '');
    const productType = classifyPHECType(title, '');
    const volume = extractVolume(title);
    
    const workQueue: string[] = ['needs_images', 'needs_description'];
    if (productType === 'other') workQueue.push('needs_classification');
    
    productMap.set(key, {
      sku,
      handle,
      title,
      brand,
      vendor,
      product_type: productType,
      volume: volume.quantity?.toString() || '',
      volume_unit: volume.unit,
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
  console.log(`\n🔍 Filtering for pH/EC products...`);
  console.log(`   Found ${products.length} pH/EC products\n`);
  
  if (products.length === 0) {
    console.log('❌ No pH/EC products found');
    return;
  }
  
  // Write CSV
  const headers = [
    'sku', 'handle', 'title', 'brand', 'vendor', 'product_type',
    'volume', 'volume_unit', 'source', 'shopify', 'woo', 'inventory',
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
      p.volume,
      p.volume_unit,
      p.source,
      p.shopify ? 'TRUE' : 'FALSE',
      p.woo ? 'TRUE' : 'FALSE',
      p.inventory ? 'TRUE' : 'FALSE',
      p.needs_images ? 'TRUE' : 'FALSE',
      p.needs_description ? 'TRUE' : 'FALSE',
      escapeCsvField(p.work_queue),
    ].join(','));
  }
  
  const outputPath = resolve(CSV_DIR, 'master_ph_meters.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Created master_ph_meters.csv with ${products.length} products\n`);
  
  // Summary stats
  console.log('📊 Summary:\n');
  
  // By type
  const byType = new Map<string, number>();
  for (const p of products) {
    byType.set(p.product_type, (byType.get(p.product_type) || 0) + 1);
  }
  console.log('🔬 By Product Type:');
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
  
  console.log(`\n📁 Output: CSVs/master_ph_meters.csv`);
  console.log('🎯 Next: Run scan:coverage to see updated coverage');
}

main().catch(console.error);
