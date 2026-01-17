/**
 * extractWooImages.ts
 * 
 * Extract image URLs from WooCommerce export and create a mapping file
 * 
 * Usage:
 *   npx tsx src/cli/extractWooImages.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Convert WooCommerce slug to Shopify handle
function slugToHandle(slug: string): string {
  if (!slug) return '';
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Clean image URL (remove escaping, etc.)
function cleanImageUrl(url: string): string {
  if (!url) return '';
  return url
    .replace(/\\\//g, '/')  // Unescape forward slashes
    .trim();
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         EXTRACT WOOCOMMERCE IMAGE URLS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const content = readFileSync(resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'), 'utf-8');
  const lines = content.split('\n');
  
  const header = parseCsvLine(lines[0]);
  const slugIdx = header.findIndex(h => h.toLowerCase() === 'slug');
  const imgUrlIdx = header.findIndex(h => h === 'Image URL');
  const nameIdx = header.findIndex(h => h === 'Product Name' || h === '"Product Name"');
  
  console.log(`📄 WooCommerce export: ${lines.length - 1} rows`);
  console.log(`   Slug column: ${slugIdx}`);
  console.log(`   Image URL column: ${imgUrlIdx}`);
  console.log(`   Product Name column: ${nameIdx}`);
  
  interface ImageMapping {
    handle: string;
    name: string;
    imageUrl: string;
  }
  
  const imageMap = new Map<string, ImageMapping>();
  let validImages = 0;
  let invalidImages = 0;
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = parseCsvLine(lines[i]);
    const slug = cols[slugIdx] || '';
    const imgUrl = cleanImageUrl(cols[imgUrlIdx] || '');
    const name = cols[nameIdx] || '';
    const handle = slugToHandle(slug);
    
    if (!handle) continue;
    
    if (imgUrl && imgUrl.startsWith('http')) {
      if (!imageMap.has(handle)) {
        imageMap.set(handle, { handle, name, imageUrl: imgUrl });
        validImages++;
      }
    } else {
      if (!imageMap.has(handle)) {
        invalidImages++;
      }
    }
  }
  
  console.log(`\n📷 Products with valid image URLs: ${validImages}`);
  console.log(`   Products without images: ${invalidImages}`);
  
  // Sample
  console.log('\n📝 Sample mappings:');
  let count = 0;
  for (const [handle, data] of imageMap) {
    if (count++ >= 5) break;
    console.log(`   ${handle}`);
    console.log(`     → ${data.imageUrl.slice(0, 70)}...`);
  }
  
  // Save mapping as JSON
  const mappingArray = Array.from(imageMap.values());
  const outputPath = resolve(CSV_DIR, 'woo_image_map.json');
  writeFileSync(outputPath, JSON.stringify(mappingArray, null, 2));
  console.log(`\n✅ Saved mapping to: CSVs/woo_image_map.json`);
  console.log(`   ${mappingArray.length} products with images`);
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
