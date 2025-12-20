/**
 * Build Books & Educational Master
 * 
 * Extracts books, guides, manuals, and educational materials from source CSVs
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
// Books Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const INCLUDE_PATTERNS = [
  // Book keywords
  /\bbook\b/i,
  /\bguide\b.*(?:grower|growing|garden|organic)/i,
  /\bhandbook\b/i,
  /\bmanual\b/i,
  /\bteaming\s*with/i,
  /\bencyclopedia\b/i,
  
  // Specific book titles
  /teaming.*(?:microbes|fungi|nutrients)/i,
  /grower'?s?\s*(?:guide|handbook|bible)/i,
  /cannabis\s*(?:guide|encyclopedia|grow|bible)/i,
  /marijuana\s*(?:guide|horticulture|grow)/i,
  /hydroponics\s*for\s*beginners/i,
  /indoor\s*garden(?:ing)?\s*(?:guide|book)/i,
  
  // Authors/publishers
  /\bed\s*rosenthal\b/i,
  /\bjorge\s*cervantes\b/i,
  /\bdjshort\b/i,
];

const EXCLUDE_PATTERNS = [
  // Physical products with "guide" in name
  /\bph\s*guide/i,
  /\bcolor\s*guide/i,
  /\bfeeding\s*guide/i,
  /\bnutrient.*guide/i,
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
// Product Matching
// ─────────────────────────────────────────────────────────────────────────────

function isBook(text: string): boolean {
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
  console.log('📚 Building Books & Educational Master...\n');
  
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
      
      if (isBook(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'Variant SKU', 'sku'),
          price: getColumn(headers, row, 'Variant Price', 'price'),
          vendor: getColumn(headers, row, 'Vendor', 'vendor'),
          brand: getColumn(headers, row, 'Vendor', 'vendor') || 'Unknown',
          category: 'Books & Educational',
          tags: getColumn(headers, row, 'Tags', 'tags'),
          source: 'shopify',
        });
      }
    }
    console.log(`   Found ${products.length} books from Shopify`);
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
      
      if (isBook(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'SKU', 'sku'),
          price: getColumn(headers, row, 'regular_price', 'price'),
          vendor: getColumn(headers, row, 'tax:product_brand', 'brand', 'Vendor'),
          brand: getColumn(headers, row, 'tax:product_brand', 'brand', 'Vendor') || 'Unknown',
          category: 'Books & Educational',
          tags: getColumn(headers, row, 'tax:product_tag', 'Tags', 'tags'),
          source: 'woocommerce',
        });
      }
    }
    console.log(`   Found ${products.length - startCount} books from WooCommerce`);
  }
  
  // Write output
  const outputPath = resolve(CSV_DIR, 'master_books.csv');
  
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
  
  console.log(`\n✅ Created: master_books.csv`);
  console.log(`   Total products: ${products.length}`);
}

main().catch(console.error);
