#!/usr/bin/env node
/**
 * buildPropagationMaster.ts
 * =========================
 * Builds master_propagation.csv from all source CSVs
 * 
 * Propagation Products:
 * - Cloning supplies (gels, powders, machines)
 * - Domes and trays
 * - Heat mats
 * - Humidity domes
 * - Rooting cubes/plugs
 * - Seedling supplies
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
  { pattern: /\bClonex\b/i, brand: 'Clonex' },
  { pattern: /\bTurbo\s*Klone\b/i, brand: 'TurboKlone' },
  { pattern: /\bEZ\s*Clone\b/i, brand: 'EZ-Clone' },
  { pattern: /\bSuper\s*Sprouter\b/i, brand: 'Super Sprouter' },
  { pattern: /\bRoot\s*Riot\b/i, brand: 'Root Riot' },
  { pattern: /\bRapid\s*Rooter\b/i, brand: 'Rapid Rooter' },
  { pattern: /\bGrodan\b/i, brand: 'Grodan' },
  { pattern: /\bOasis\b.*(?:cube|plug)/i, brand: 'Oasis' },
  { pattern: /\bJiffy\b/i, brand: 'Jiffy' },
  { pattern: /\bDip.*N.*Grow\b/i, brand: "Dip 'N Grow" },
  { pattern: /\bRootone\b/i, brand: 'Rootone' },
  { pattern: /\bPower\s*Clone\b/i, brand: 'PowerClone' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bActive\s*Air\b/i, brand: 'Active Air' },
  { pattern: /\bVivosun\b/i, brand: 'Vivosun' },
  { pattern: /\bGeneral\s*Hydroponics\b/i, brand: 'General Hydroponics' },
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
// Propagation Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const PROPAGATION_PATTERNS = [
  /\bclone\b/i,
  /\bcloning\b/i,
  /\brooting\s*(?:gel|powder|hormone|solution)/i,
  /\broot\s*(?:gel|powder)/i,
  /\bpropagation\b/i,
  /\bpropagate\b/i,
  /\bseedling\b/i,
  /\bdome\b/i,
  /\bhumidity\s*dome/i,
  /\bheat\s*mat\b/i,
  /\bseedling\s*mat/i,
  /\bwarming\s*mat/i,
  /\bstarter\s*(?:tray|plug|cube)/i,
  /\broot\s*riot\b/i,
  /\brapid\s*rooter\b/i,
  /\bclonex\b/i,
  /\bturbo\s*klone\b/i,
  /\bez\s*clone\b/i,
  /\bsuper\s*sprouter\b/i,
  /\bjiffy\b.*(?:pellet|pot|plug)/i,
  /\baero.*clone/i,
  /\bclone\s*machine\b/i,
  /\bscalpel\b/i,
  /\bsnips\b.*(?:clone|cutting)/i,
  /\bcutting.*(?:tool|blade)/i,
  /\bplant\s*insert/i,
];

const PROPAGATION_EXCLUSIONS = [
  /\bseed\b(?!ling)/i,
  /\bnutrient(?!.*clone)/i,
  /\bfertilizer/i,
  /\bsoil\b(?!.*seedling)/i,
  /\bcoco\b(?!.*plug)/i,
  /\bperlite\b/i,
  /fan|filter|duct/i,
  /\btent\b/i,
  /\blight\b(?!.*seed.*heat)/i,
  /\bled\b/i,
  /\bhps\b/i,
  /\bcontroller\b/i,
  /\btimer\b(?!.*heat)/i,
  /\bpump\b/i,
  /\btrimmer\b/i,
  /\bscissors\b(?!.*clone)/i,
  /\bpot\b(?!.*jiffy)/i,
  /\bbucket\b/i,
];

function isPropagationProduct(text: string): boolean {
  // Check exclusions first
  if (PROPAGATION_EXCLUSIONS.some(p => p.test(text))) {
    // But allow if strong propagation signal
    const hasStrongSignal = /clone|rooting|propagat|seedling|dome|heat\s*mat|clonex|turbo\s*klone|root\s*riot|rapid\s*rooter|super\s*sprouter/i.test(text);
    if (!hasStrongSignal) return false;
  }
  
  return PROPAGATION_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Type Classification
// ─────────────────────────────────────────────────────────────────────────────

type PropagationType = 
  | 'cloning_gel'
  | 'cloning_powder'
  | 'cloning_solution'
  | 'clone_machine'
  | 'dome'
  | 'tray'
  | 'heat_mat'
  | 'starter_plug'
  | 'starter_cube'
  | 'insert'
  | 'cutting_tool'
  | 'accessory'
  | 'other';

function classifyPropagationType(title: string, description: string): PropagationType {
  const text = `${title} ${description}`.toLowerCase();
  
  // Cloning gel
  if (/rooting\s*gel|clone.*gel|clonex.*gel|gel.*clone/i.test(text)) {
    return 'cloning_gel';
  }
  
  // Cloning powder
  if (/rooting\s*powder|clone.*powder|rootone|powder.*root/i.test(text)) {
    return 'cloning_powder';
  }
  
  // Cloning solution
  if (/rooting\s*(?:solution|concentrate)|clone.*solution|dip.*grow/i.test(text)) {
    return 'cloning_solution';
  }
  
  // Clone machine
  if (/clone\s*machine|turbo\s*klone|ez\s*clone|aero.*clone|cloner/i.test(text)) {
    return 'clone_machine';
  }
  
  // Dome
  if (/dome|humidity\s*cover/i.test(text)) {
    return 'dome';
  }
  
  // Tray
  if (/tray|flat/i.test(text) && !/dome/i.test(text)) {
    return 'tray';
  }
  
  // Heat mat
  if (/heat\s*mat|seedling\s*mat|warming\s*mat|propagation\s*mat/i.test(text)) {
    return 'heat_mat';
  }
  
  // Starter plugs
  if (/plug|peat.*pellet|jiffy.*pellet|root\s*riot|rapid\s*rooter/i.test(text)) {
    return 'starter_plug';
  }
  
  // Starter cubes
  if (/cube|rockwool\s*(?:starter|cube)|oasis.*cube|grodan.*starter/i.test(text)) {
    return 'starter_cube';
  }
  
  // Inserts
  if (/insert|cell\s*pack/i.test(text)) {
    return 'insert';
  }
  
  // Cutting tools
  if (/scalpel|snip|blade|razor.*clone/i.test(text)) {
    return 'cutting_tool';
  }
  
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Size Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface SizeInfo {
  volume: string;
  count: string;
  dimensions: string;
}

function extractSizeInfo(title: string): SizeInfo {
  const result: SizeInfo = {
    volume: '',
    count: '',
    dimensions: '',
  };
  
  // Volume (ml, oz)
  const mlMatch = title.match(/(\d+)\s*(?:ml|mL)\b/i);
  if (mlMatch) {
    result.volume = mlMatch[1] + ' ml';
  }
  const ozMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:oz|fl\s*oz)\b/i);
  if (ozMatch && !result.volume) {
    result.volume = ozMatch[1] + ' oz';
  }
  
  // Count (pack, tray)
  const countMatch = title.match(/(\d+)\s*(?:pack|pk|ct|count|cell|site|plug|cube)/i);
  if (countMatch) {
    result.count = countMatch[1];
  }
  
  // Dimensions (for mats, trays)
  const dimMatch = title.match(/(\d+)\s*x\s*(\d+)/i);
  if (dimMatch) {
    result.dimensions = `${dimMatch[1]}x${dimMatch[2]}`;
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

interface PropagationProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  product_type: PropagationType;
  volume: string;
  count: string;
  dimensions: string;
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
  console.log('🌱 Building Propagation Master CSV');
  console.log('===================================\n');
  
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
  const productMap = new Map<string, PropagationProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = row['Handle'] || '';
    const title = row['Title'] || '';
    const description = row['Body (HTML)'] || '';
    const vendor = row['Vendor'] || '';
    const tags = row['Tags'] || '';
    const sku = row['Variant SKU'] || '';
    
    const combinedText = `${title} ${description} ${tags}`;
    
    if (!isPropagationProduct(combinedText)) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.shopify = true;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, tags);
    const productType = classifyPropagationType(title, description);
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
      volume: sizeInfo.volume,
      count: sizeInfo.count,
      dimensions: sizeInfo.dimensions,
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
    
    if (!isPropagationProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.woo = true;
      if (existing.source === 'shopify') existing.source = 'multi';
      continue;
    }
    
    const brand = getBestBrand('', title, tags);
    const productType = classifyPropagationType(title, description);
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
      volume: sizeInfo.volume,
      count: sizeInfo.count,
      dimensions: sizeInfo.dimensions,
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
    
    if (!isPropagationProduct(combinedText)) continue;
    
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    const key = sku || handle;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.inventory = true;
      if (!existing.sku && sku) existing.sku = sku;
      continue;
    }
    
    const brand = getBestBrand(vendor, title, '');
    const productType = classifyPropagationType(title, '');
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
      volume: sizeInfo.volume,
      count: sizeInfo.count,
      dimensions: sizeInfo.dimensions,
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
  console.log(`\n🔍 Filtering for propagation products...`);
  console.log(`   Found ${products.length} propagation products\n`);
  
  if (products.length === 0) {
    console.log('❌ No propagation products found');
    return;
  }
  
  // Write CSV
  const headers = [
    'sku', 'handle', 'title', 'brand', 'vendor', 'product_type',
    'volume', 'count', 'dimensions', 'source', 'shopify', 'woo', 'inventory',
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
      escapeCsvField(p.volume),
      p.count,
      p.dimensions,
      p.source,
      p.shopify ? 'TRUE' : 'FALSE',
      p.woo ? 'TRUE' : 'FALSE',
      p.inventory ? 'TRUE' : 'FALSE',
      p.needs_images ? 'TRUE' : 'FALSE',
      p.needs_description ? 'TRUE' : 'FALSE',
      escapeCsvField(p.work_queue),
    ].join(','));
  }
  
  const outputPath = resolve(CSV_DIR, 'master_propagation.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Created master_propagation.csv with ${products.length} products\n`);
  
  // Summary stats
  console.log('📊 Summary:\n');
  
  // By type
  const byType = new Map<string, number>();
  for (const p of products) {
    byType.set(p.product_type, (byType.get(p.product_type) || 0) + 1);
  }
  console.log('🌱 By Product Type:');
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
  
  console.log(`\n📁 Output: CSVs/master_propagation.csv`);
  console.log('🎯 Next: Run scan:coverage to see updated coverage');
}

main().catch(console.error);
