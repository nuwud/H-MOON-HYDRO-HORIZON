/**
 * Build Extraction Equipment Master
 * 
 * Extracts rosin presses, extraction equipment, concentrate tools from source CSVs
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
// Extraction Equipment Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const INCLUDE_PATTERNS = [
  // Rosin equipment
  /\brosin\s*press/i,
  /\brosin\s*bag/i,
  /\brosin\s*plate/i,
  /\brosin\s*stamp/i,
  /\brosin\s*tech/i,
  /\bpress\s*club/i,
  
  // Extraction tools
  /\bextraction\b/i,
  /\bconcentrate\s*tool/i,
  /\bdab\s*tool/i,
  /\bparchment\s*paper/i,
  /\bptfe\s*sheet/i,
  /\bcollection\s*tool/i,
  
  // Ice water extraction
  /\bbubble\s*bag/i,
  /\bice\s*(?:water\s*)?extract/i,
  /\bhash\s*bag/i,
  /\bwash\s*bag/i,
  /\bmicron\s*bag/i,
  
  // Specific brands
  /\bdulytek\b/i,
  /\bnugsmasher\b/i,
  /\brosineer\b/i,
  /\bjuice\s*box\b/i,
];

const EXCLUDE_PATTERNS = [
  /nutrient|fertilizer|grow\s*medium/i,
  /\btent\b|\bfan\b|\bfilter\b|\blight\b/i,
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

function isExtraction(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(lowerText)) return false;
  }
  
  for (const pattern of INCLUDE_PATTERNS) {
    if (pattern.test(lowerText)) return true;
  }
  
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Building Extraction Equipment Master...\n');
  
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
      
      if (isExtraction(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'Variant SKU', 'sku'),
          price: getColumn(headers, row, 'Variant Price', 'price'),
          vendor: getColumn(headers, row, 'Vendor', 'vendor'),
          brand: getColumn(headers, row, 'Vendor', 'vendor') || 'Unknown',
          category: 'Extraction Equipment',
          tags: getColumn(headers, row, 'Tags', 'tags'),
          source: 'shopify',
        });
      }
    }
    console.log(`   Found ${products.length} extraction items from Shopify`);
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
      
      if (isExtraction(combinedText)) {
        seenHandles.add(handle);
        products.push({
          handle,
          title,
          sku: getColumn(headers, row, 'SKU', 'sku'),
          price: getColumn(headers, row, 'regular_price', 'price'),
          vendor: getColumn(headers, row, 'tax:product_brand', 'brand', 'Vendor'),
          brand: getColumn(headers, row, 'tax:product_brand', 'brand', 'Vendor') || 'Unknown',
          category: 'Extraction Equipment',
          tags: getColumn(headers, row, 'tax:product_tag', 'Tags', 'tags'),
          source: 'woocommerce',
        });
      }
    }
    console.log(`   Found ${products.length - startCount} extraction items from WooCommerce`);
  }
  
  // Write output
  const outputPath = resolve(CSV_DIR, 'master_extraction.csv');
  
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
  
  console.log(`\n✅ Created: master_extraction.csv`);
  console.log(`   Total products: ${products.length}`);
}

main().catch(console.error);
