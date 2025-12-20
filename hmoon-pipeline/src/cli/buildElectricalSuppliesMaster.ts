/**
 * Build Electrical Supplies Master
 * 
 * Extracts power cords, extension cables, plugs, sockets, adapters,
 * ballasts, reflectors, and electrical accessories from source CSVs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

interface ProductRow {
  handle: string;
  title: string;
  sku: string;
  price: string;
  vendor: string;
  brand: string;
  category: string;
  tags: string;
  source: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Electrical Supplies Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const INCLUDE_PATTERNS = [
  // Power cords and cables
  /\bpower\s*cord/i,
  /\bextension\s*cord/i,
  /\bheavy\s*duty\s*cord/i,
  /\b240v?\s*cord/i,
  /\b120v?\s*cord/i,
  /\bballast\s*cord/i,
  /\blamp\s*cord/i,
  
  // Plugs and connectors
  /\bnema\s*\d/i,
  /\btwist\s*lock/i,
  /\bplug\s*adapter/i,
  /\boutlet\s*adapter/i,
  /\bpower\s*strip/i,
  /\bsurge\s*protect/i,
  /\bgrounded\s*plug/i,
  
  // Sockets and mogul bases
  /\bmogul\s*socket/i,
  /\bmogul\s*base/i,
  /\blamp\s*socket/i,
  /\bsocket\s*assembly/i,
  /\be39\s*socket/i,
  /\be26\s*socket/i,
  /\bcord\s*set\b/i,
  /\bcordset\b/i,
  
  // Ballasts (electronic and magnetic)
  /\bdigital\s*ballast/i,
  /\belectronic\s*ballast/i,
  /\bmagnetic\s*ballast/i,
  /\bdimmable\s*ballast/i,
  /\bhps\s*ballast/i,
  /\bmh\s*ballast/i,
  /\b1000w?\s*ballast/i,
  /\b600w?\s*ballast/i,
  /\b400w?\s*ballast/i,
  /\bballast.*watt/i,
  
  // Reflectors (lighting related)
  /\ba[\/\\]?c\s*reflector/i,
  /\bcool\s*tube/i,
  /\bcooltube/i,
  /\bair\s*cooled\s*reflector/i,
  /\bhood\s*reflector/i,
  /\bwing\s*reflector/i,
  /\bparabolic\s*reflector/i,
  /\bdouble\s*ended\s*reflector/i,
  /\bde\s*reflector/i,
  /\breflector\s*hood/i,
  
  // Light movers and hangers
  /\blight\s*mover/i,
  /\blight\s*rail/i,
  /\brope\s*ratchet/i,
  /\byoyo\s*hanger/i,
  /\badjustable\s*hanger/i,
  /\blight\s*hanger/i,
  
  // Specific patterns
  /\bphantom.*ballast/i,
  /\blumatek.*ballast/i,
  /\bsun\s*system.*(?:reflector|hood|ballast)/i,
  /\bgavita.*(?:reflector|ballast)/i,
];

const EXCLUDE_PATTERNS = [
  // Complete light fixtures (goes to grow_lights)
  /\bcomplete\s*(?:grow|led)\s*light/i,
  /\bfull\s*spectrum\s*(?:led|grow)/i,
  /\bspider\s*farmer\b/i,
  /\bmars\s*hydro\b.*led/i,
  /\bquantum\s*board/i,
  
  // Nutrients
  /\bnutrient/i,
  /\bfertilizer/i,
  
  // HID Bulbs (separate category)  
  /\bhps\s*bulb/i,
  /\bmh\s*bulb/i,
  /\bhid\s*lamp/i,
  /\bhid\s*bulb/i,
  /\breplacement\s*bulb/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing
// ─────────────────────────────────────────────────────────────────────────────

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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function getColumn(headers: string[], row: string[], ...names: string[]): string {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    if (idx !== -1 && row[idx]) {
      return row[idx].trim();
    }
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection
// ─────────────────────────────────────────────────────────────────────────────

const ELECTRICAL_BRANDS: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /\bPhantom\b/i, brand: 'Phantom' },
  { pattern: /\bLumatek\b/i, brand: 'Lumatek' },
  { pattern: /\bGavita\b/i, brand: 'Gavita' },
  { pattern: /\bNanolux\b/i, brand: 'Nanolux' },
  { pattern: /\bSun\s*System\b/i, brand: 'Sun System' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bSunlight\s*Supply\b/i, brand: 'Sunlight Supply' },
  { pattern: /\bVivosun\b/i, brand: 'Vivosun' },
  { pattern: /\biPower\b/i, brand: 'iPower' },
  { pattern: /\bYield\s*Lab\b/i, brand: 'Yield Lab' },
  { pattern: /\bSolistek\b/i, brand: 'Solistek' },
  { pattern: /\bGalaxy\b/i, brand: 'Galaxy' },
  { pattern: /\bQuantum\b/i, brand: 'Quantum' },
  { pattern: /\bLight\s*Rail\b/i, brand: 'Light Rail' },
  { pattern: /\bApollo\b/i, brand: 'Apollo' },
];

function detectBrand(text: string, vendor?: string): string {
  for (const { pattern, brand } of ELECTRICAL_BRANDS) {
    if (pattern.test(text)) return brand;
  }
  if (vendor && vendor.length > 1 && vendor.length < 30) return vendor;
  return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Matching
// ─────────────────────────────────────────────────────────────────────────────

function isElectricalSupply(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check exclusions first
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(lowerText)) return false;
  }
  
  // Check inclusions
  for (const pattern of INCLUDE_PATTERNS) {
    if (pattern.test(lowerText)) return true;
  }
  
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔌 Building Electrical Supplies Master...\n');
  
  const products: ProductRow[] = [];
  const seenHandles = new Set<string>();
  
  // Load Shopify export
  const shopifyPath = resolve(CSV_DIR, 'products_export_1.csv');
  if (existsSync(shopifyPath)) {
    console.log('📦 Processing Shopify export...');
    const content = readFileSync(shopifyPath, 'utf-8');
    const lines = content.split('\n');
    const headers = parseCsvLine(lines[0]);
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const row = parseCsvLine(line);
      const handle = getColumn(headers, row, 'Handle', 'handle');
      const title = getColumn(headers, row, 'Title', 'title', 'Name');
      
      if (!handle || seenHandles.has(handle)) continue;
      
      const combinedText = [
        title,
        getColumn(headers, row, 'Body (HTML)', 'body_html', 'Description'),
        getColumn(headers, row, 'Tags', 'tags'),
        getColumn(headers, row, 'Product Type', 'product_type'),
      ].join(' ');
      
      if (isElectricalSupply(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'Variant SKU', 'sku'),
          price: getColumn(headers, row, 'Variant Price', 'price'),
          vendor: getColumn(headers, row, 'Vendor', 'vendor'),
          brand: detectBrand(combinedText, getColumn(headers, row, 'Vendor', 'vendor')),
          category: 'Electrical Supplies',
          tags: getColumn(headers, row, 'Tags', 'tags'),
          source: 'shopify',
        });
      }
    }
    console.log(`   Found ${products.length} electrical items from Shopify`);
  }
  
  // Load WooCommerce export
  const wooPath = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  if (existsSync(wooPath)) {
    console.log('🛒 Processing WooCommerce export...');
    const startCount = products.length;
    const content = readFileSync(wooPath, 'utf-8');
    const lines = content.split('\n');
    const headers = parseCsvLine(lines[0]);
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const row = parseCsvLine(line);
      const handle = getColumn(headers, row, 'post_name', 'slug', 'handle') ||
                     getColumn(headers, row, 'SKU', 'sku');
      const title = getColumn(headers, row, 'post_title', 'Name', 'title');
      
      if (!handle || seenHandles.has(handle)) continue;
      
      const combinedText = [
        title,
        getColumn(headers, row, 'post_content', 'Description', 'body'),
        getColumn(headers, row, 'tax:product_cat', 'Categories', 'category'),
        getColumn(headers, row, 'tax:product_tag', 'Tags', 'tags'),
      ].join(' ');
      
      if (isElectricalSupply(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'SKU', 'sku'),
          price: getColumn(headers, row, 'regular_price', 'price'),
          vendor: getColumn(headers, row, 'tax:product_brand', 'brand', 'Vendor'),
          brand: detectBrand(combinedText, getColumn(headers, row, 'tax:product_brand', 'brand')),
          category: 'Electrical Supplies',
          tags: getColumn(headers, row, 'tax:product_tag', 'Tags', 'tags'),
          source: 'woocommerce',
        });
      }
    }
    console.log(`   Found ${products.length - startCount} electrical items from WooCommerce`);
  }
  
  // Write output
  const outputPath = resolve(CSV_DIR, 'master_electrical_supplies.csv');
  
  const csvHeader = 'handle,title,sku,price,vendor,brand,category,tags,source';
  const csvRows = products.map(p => [
    `"${p.handle.replace(/"/g, '""')}"`,
    `"${p.title.replace(/"/g, '""')}"`,
    `"${p.sku.replace(/"/g, '""')}"`,
    `"${p.price}"`,
    `"${p.vendor.replace(/"/g, '""')}"`,
    `"${p.brand.replace(/"/g, '""')}"`,
    `"${p.category}"`,
    `"${p.tags.replace(/"/g, '""')}"`,
    `"${p.source}"`,
  ].join(','));
  
  writeFileSync(outputPath, [csvHeader, ...csvRows].join('\n'));
  
  console.log(`\n✅ Created: master_electrical_supplies.csv`);
  console.log(`   Total products: ${products.length}`);
  
  // Show brand distribution
  const brandCounts = new Map<string, number>();
  products.forEach(p => brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1));
  console.log('\n📊 Brand distribution:');
  Array.from(brandCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([brand, count]) => console.log(`   ${brand}: ${count}`));
}

main().catch(console.error);
