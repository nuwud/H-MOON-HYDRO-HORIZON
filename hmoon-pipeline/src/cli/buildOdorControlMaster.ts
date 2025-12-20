#!/usr/bin/env node
/**
 * buildOdorControlMaster.ts
 * =========================
 * Builds master_odor_control.csv from all source CSVs
 * 
 * Odor Control Products:
 * - Carbon filters (can filters, standalone)
 * - ONA gel, blocks, liquid
 * - Ozone generators
 * - Air fresheners (grow-specific)
 * - Neutralizers
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
  { pattern: /\bONA\b/i, brand: 'ONA' },
  { pattern: /\bCan[\s-]?Filter\b/i, brand: 'Can-Filter' },
  { pattern: /\bCan[\s-]?Lite\b/i, brand: 'Can-Lite' },
  { pattern: /\bCan[\s-]?Fan\b/i, brand: 'Can-Fan' },
  { pattern: /\bPhresh\b/i, brand: 'Phresh' },
  { pattern: /\bCarbon\s*Ace\b/i, brand: 'Carbon Ace' },
  { pattern: /\bAC\s*Infinity\b/i, brand: 'AC Infinity' },
  { pattern: /\bVivosun\b/i, brand: 'Vivosun' },
  { pattern: /\bActive\s*Air\b/i, brand: 'Active Air' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bMountain\s*Air\b/i, brand: 'Mountain Air' },
  { pattern: /\bPhat\s*Filter\b/i, brand: 'Phat Filter' },
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
// Odor Control Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const ODOR_PATTERNS = [
  /\bcarbon\s*filter\b/i,
  /\bcharcoal\s*filter\b/i,
  /\bactivated\s*carbon\b/i,
  /\bcan[\s-]?filter\b/i,
  /\bcan[\s-]?lite\b/i,
  /\bphresh\s*filter\b/i,
  /\bphat\s*filter\b/i,
  /\bodor\s*(?:control|neutralizer|eliminator)/i,
  /\bsmell\s*(?:control|eliminator)/i,
  /\bONA\b.*(?:gel|block|liquid|mist|spray)/i,
  /\bONA\b/i,
  /\bozone\s*generator\b/i,
  /\bneutralizer\b/i,
  /\bair\s*(?:purifier|cleaner|freshener)\b.*(?:grow|carbon)/i,
  /\bdeodorizer\b/i,
  /\bscent\s*(?:control|eliminator)/i,
  /\b(?:4|6|8|10|12)"\s*carbon\b/i,
  /\bcarbon.*(?:4|6|8|10|12)"\b/i,
  /\bpre[\s-]?filter\b.*carbon/i,
  /\bcarbon.*(?:scrubber|bed)\b/i,
];

const ODOR_EXCLUSIONS = [
  /\bseed\b/i,
  /\bnutrient/i,
  /\bfertilizer/i,
  /\bsoil\b/i,
  /\bcoco\b/i,
  /\bperlite\b/i,
  /\binline\s*fan\b/i,  // Fans go in airflow
  /\bexhaust\s*fan\b/i,
  /\bduct\b(?!.*filter)/i,
  /\btent\b/i,
  /\blight\b/i,
  /\bled\b/i,
  /\bhps\b/i,
  /\bcontroller\b/i,
  /\btimer\b/i,
  /\bpump\b/i,
  /\btrimmer\b/i,
  /\bpot\b/i,
  /\bbucket\b/i,
  /\bph\b/i,
  /\bclone\b/i,
  /\bwater\s*filter\b/i,  // RO filters go elsewhere
  /\breverse\s*osmosis\b/i,
];

function isOdorControlProduct(text: string): boolean {
  // Check exclusions first
  if (ODOR_EXCLUSIONS.some(p => p.test(text))) {
    // But allow if strong odor control signal
    const hasStrongSignal = /carbon\s*filter|can[\s-]?filter|can[\s-]?lite|phresh|ONA|odor|neutralizer/i.test(text);
    if (!hasStrongSignal) return false;
  }
  
  return ODOR_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Type Classification
// ─────────────────────────────────────────────────────────────────────────────

type OdorType = 
  | 'carbon_filter'
  | 'pre_filter'
  | 'ona_gel'
  | 'ona_block'
  | 'ona_liquid'
  | 'ona_spray'
  | 'ozone_generator'
  | 'neutralizer'
  | 'accessory'
  | 'other';

function classifyOdorType(title: string, description: string): OdorType {
  const text = `${title} ${description}`.toLowerCase();
  
  // ONA products
  if (/\bona\b.*gel/i.test(text)) return 'ona_gel';
  if (/\bona\b.*block/i.test(text)) return 'ona_block';
  if (/\bona\b.*liquid/i.test(text)) return 'ona_liquid';
  if (/\bona\b.*(?:mist|spray)/i.test(text)) return 'ona_spray';
  
  // Pre-filter
  if (/pre[\s-]?filter/i.test(text)) {
    return 'pre_filter';
  }
  
  // Carbon filter
  if (/carbon\s*filter|charcoal\s*filter|can[\s-]?filter|can[\s-]?lite|phresh.*filter|phat.*filter/i.test(text)) {
    return 'carbon_filter';
  }
  
  // Ozone generator
  if (/ozone\s*generator|ozone\s*machine/i.test(text)) {
    return 'ozone_generator';
  }
  
  // Generic neutralizer
  if (/neutralizer|deodorizer|odor\s*(?:control|eliminator)/i.test(text)) {
    return 'neutralizer';
  }
  
  // Accessories
  if (/flange|clamp|strap|reducer.*filter/i.test(text)) {
    return 'accessory';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Size Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface SizeInfo {
  diameter: string;
  cfm: string;
  volume: string;
}

function extractSizeInfo(title: string): SizeInfo {
  const result: SizeInfo = {
    diameter: '',
    cfm: '',
    volume: '',
  };
  
  // Diameter (inches)
  const diamMatch = title.match(/(\d+)(?:"|''|in(?:ch)?)\s*(?:carbon|filter|x)/i);
  if (diamMatch) {
    result.diameter = diamMatch[1] + '"';
  }
  // Also check patterns like "4x12" or "6x16"
  const dimMatch = title.match(/(\d+)\s*x\s*(\d+)/i);
  if (dimMatch && !result.diameter) {
    result.diameter = dimMatch[1] + '"';
  }
  
  // CFM rating
  const cfmMatch = title.match(/(\d+)\s*cfm/i);
  if (cfmMatch) {
    result.cfm = cfmMatch[1] + ' CFM';
  }
  
  // Volume (for ONA products)
  const ozMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:oz|fl\s*oz)\b/i);
  if (ozMatch) {
    result.volume = ozMatch[1] + ' oz';
  }
  const literMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:L|liter|litre)\b/i);
  if (literMatch) {
    result.volume = literMatch[1] + ' L';
  }
  const gramMatch = title.match(/(\d+)\s*(?:g|gram)\b/i);
  if (gramMatch) {
    result.volume = gramMatch[1] + ' g';
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

interface OdorProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  product_type: OdorType;
  diameter: string;
  cfm: string;
  volume: string;
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
  console.log('🌬️  Building Odor Control Master CSV');
  console.log('=====================================\n');
  
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
  const productMap = new Map<string, OdorProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const description = row['Body (HTML)'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const sku = row['Variant SKU'] || '';
    
    const combinedText = `${title} ${description} ${tags}`;
    
    if (!isOdorControlProduct(combinedText)) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.shopify = true;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, tags);
    const productType = classifyOdorType(title, description);
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
      cfm: sizeInfo.cfm,
      volume: sizeInfo.volume,
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
    
    if (!isOdorControlProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.woo = true;
      if (existing.source === 'shopify') existing.source = 'multi';
      continue;
    }
    
    const brand = getBestBrand('', title, tags);
    const productType = classifyOdorType(title, description);
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
      cfm: sizeInfo.cfm,
      volume: sizeInfo.volume,
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
    
    if (!isOdorControlProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.inventory = true;
      if (!existing.sku && sku) existing.sku = sku;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, '');
    const productType = classifyOdorType(title, '');
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
      cfm: sizeInfo.cfm,
      volume: sizeInfo.volume,
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
  console.log(`\n🔍 Filtering for odor control products...`);
  console.log(`   Found ${products.length} odor control products\n`);
  
  if (products.length === 0) {
    console.log('❌ No odor control products found');
    return;
  }
  
  // Write CSV
  const headers = [
    'sku', 'handle', 'title', 'brand', 'vendor', 'product_type',
    'diameter', 'cfm', 'volume', 'source', 'shopify', 'woo', 'inventory',
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
      escapeCsvField(p.cfm),
      escapeCsvField(p.volume),
      p.source,
      p.shopify ? 'TRUE' : 'FALSE',
      p.woo ? 'TRUE' : 'FALSE',
      p.inventory ? 'TRUE' : 'FALSE',
      p.needs_images ? 'TRUE' : 'FALSE',
      p.needs_description ? 'TRUE' : 'FALSE',
      escapeCsvField(p.work_queue),
    ].join(','));
  }
  
  const outputPath = resolve(CSV_DIR, 'master_odor_control.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Created master_odor_control.csv with ${products.length} products\n`);
  
  // Summary stats
  console.log('📊 Summary:\n');
  
  // By type
  const byType = new Map<string, number>();
  for (const p of products) {
    byType.set(p.product_type, (byType.get(p.product_type) || 0) + 1);
  }
  console.log('🌬️  By Product Type:');
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
  
  console.log(`\n📁 Output: CSVs/master_odor_control.csv`);
  console.log('🎯 Next: Run scan:coverage to see updated coverage');
}

main().catch(console.error);
