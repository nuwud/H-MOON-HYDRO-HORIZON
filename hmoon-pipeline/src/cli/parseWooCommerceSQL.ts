/**
 * parseWooCommerceSQL.ts
 * 
 * Parse WooCommerce SQL dump to extract product data:
 * - Descriptions (post_content)
 * - Prices (_price, _regular_price, _sale_price)
 * - Weights (_weight)
 * - Dimensions (_length, _width, _height)
 * - SKUs (_sku)
 * - Images (attachment metadata)
 * 
 * Usage:
 *   npx tsx src/cli/parseWooCommerceSQL.ts
 *   npx tsx src/cli/parseWooCommerceSQL.ts --output woo_products.json
 */

import { createReadStream, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const SQL_FILE = resolve(PROJECT_ROOT, 'hmoonhydro.com/hmoonhydro_com_1.sql');
const CSV_DIR = resolve(PROJECT_ROOT, 'CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WooProduct {
  id: number;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  sku: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  stockQuantity: string;
  stockStatus: string;
  imageId: string;
  galleryImageIds: string;
  // Resolved image paths (added for IMG-001 spec)
  imagePath: string;
  galleryPaths: string[];
}

interface PostRow {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  postType: string;
  postStatus: string;
}

interface MetaRow {
  postId: number;
  metaKey: string;
  metaValue: string;
}

// Attachment ID → file path mapping
const attachmentPaths = new Map<number, string>();

// ─────────────────────────────────────────────────────────────────────────────
// SQL Parsing
// ─────────────────────────────────────────────────────────────────────────────

function extractInsertValues(line: string, tableName: string): string[][] | null {
  // Match INSERT INTO `wp_xxx` or INSERT INTO wp_xxx
  const insertPattern = new RegExp(`INSERT INTO \`?${tableName}\`?\\s+(?:\\([^)]+\\)\\s+)?VALUES\\s*(.+)`, 'i');
  const match = line.match(insertPattern);
  if (!match) return null;
  
  const valuesStr = match[1];
  const rows: string[][] = [];
  
  // Parse VALUES (v1, v2, ...), (v1, v2, ...), ...
  let inQuote = false;
  let escaped = false;
  let currentValue = '';
  let currentRow: string[] = [];
  let depth = 0;
  
  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];
    
    if (escaped) {
      currentValue += char;
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      currentValue += char;
      continue;
    }
    
    if (char === "'" && !escaped) {
      inQuote = !inQuote;
      currentValue += char;
      continue;
    }
    
    if (!inQuote) {
      if (char === '(') {
        depth++;
        if (depth === 1) {
          currentRow = [];
          currentValue = '';
          continue;
        }
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          currentRow.push(currentValue.trim());
          rows.push(currentRow);
          currentValue = '';
          continue;
        }
      } else if (char === ',' && depth === 1) {
        currentRow.push(currentValue.trim());
        currentValue = '';
        continue;
      }
    }
    
    currentValue += char;
  }
  
  return rows.length > 0 ? rows : null;
}

function cleanSqlString(val: string): string {
  if (!val) return '';
  // Remove surrounding quotes
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    val = val.slice(1, -1);
  }
  // Unescape
  return val
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Parser
// ─────────────────────────────────────────────────────────────────────────────

async function parseSQL(): Promise<Map<number, WooProduct>> {
  console.log('📄 Parsing WooCommerce SQL dump...');
  console.log(`   File: ${SQL_FILE}`);
  
  if (!existsSync(SQL_FILE)) {
    throw new Error(`SQL file not found: ${SQL_FILE}`);
  }
  
  const posts = new Map<number, PostRow>();
  const postMeta = new Map<number, Map<string, string>>();
  
  const fileStream = createReadStream(SQL_FILE, { encoding: 'utf8' });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let lineCount = 0;
  let postsFound = 0;
  let metaFound = 0;
  let currentLine = '';
  
  for await (const line of rl) {
    lineCount++;
    if (lineCount % 100000 === 0) {
      console.log(`   ...processed ${lineCount.toLocaleString()} lines (${postsFound} products, ${metaFound} meta)`);
    }
    
    // Handle multi-line statements
    currentLine += line;
    if (!line.endsWith(';')) {
      continue;
    }
    
    const fullLine = currentLine;
    currentLine = '';
    
    // Parse wp_posts for products
    if (fullLine.includes('wp_posts') && fullLine.includes('INSERT INTO')) {
      const rows = extractInsertValues(fullLine, 'wp_posts');
      if (rows) {
        for (const row of rows) {
          // wp_posts columns: ID, post_author, post_date, post_date_gmt, post_content, post_title, 
          // post_excerpt, post_status, comment_status, ping_status, post_password, post_name, ...
          // Column order may vary, but typically:
          // 0=ID, 4=post_content, 5=post_title, 6=post_excerpt, 7=post_status, 11=post_name (slug), 20=post_type
          
          if (row.length < 21) continue;
          
          const id = parseInt(cleanSqlString(row[0]));
          const postType = cleanSqlString(row[20]);
          
          if (postType === 'product' && !isNaN(id)) {
            posts.set(id, {
              id,
              title: cleanSqlString(row[5]),
              slug: cleanSqlString(row[11]),
              content: cleanSqlString(row[4]),
              excerpt: cleanSqlString(row[6]),
              postType,
              postStatus: cleanSqlString(row[7]),
            });
            postsFound++;
          }
        }
      }
    }
    
    // Parse wp_postmeta for product metadata
    if (fullLine.includes('wp_postmeta') && fullLine.includes('INSERT INTO')) {
      const rows = extractInsertValues(fullLine, 'wp_postmeta');
      if (rows) {
        for (const row of rows) {
          // wp_postmeta: meta_id, post_id, meta_key, meta_value
          if (row.length < 4) continue;
          
          const postId = parseInt(cleanSqlString(row[1]));
          const metaKey = cleanSqlString(row[2]);
          const metaValue = cleanSqlString(row[3]);
          
          if (!isNaN(postId) && metaKey.startsWith('_')) {
            if (!postMeta.has(postId)) {
              postMeta.set(postId, new Map());
            }
            postMeta.get(postId)!.set(metaKey, metaValue);
            metaFound++;
            
            // Capture attachment file paths for image resolution
            if (metaKey === '_wp_attached_file') {
              attachmentPaths.set(postId, metaValue);
            }
          }
        }
      }
    }
  }
  
  console.log(`   🖼️  Found ${attachmentPaths.size} attachment file paths`);
  
  console.log(`\n   ✅ Parsed ${lineCount.toLocaleString()} lines`);
  console.log(`   📦 Found ${postsFound} products`);
  console.log(`   📋 Found ${metaFound} meta entries`);
  
  // Combine posts and metadata
  const products = new Map<number, WooProduct>();
  
  for (const [id, post] of posts) {
    const meta = postMeta.get(id) || new Map();
    
    // Resolve thumbnail path from attachment ID
    const thumbnailId = meta.get('_thumbnail_id') || '';
    const imagePath = thumbnailId ? (attachmentPaths.get(parseInt(thumbnailId)) || '') : '';
    
    // Resolve gallery paths from comma-separated attachment IDs
    const galleryIdsStr = meta.get('_product_image_gallery') || '';
    const galleryPaths: string[] = [];
    if (galleryIdsStr) {
      const galleryIds = galleryIdsStr.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
      for (const gid of galleryIds) {
        const gpath = attachmentPaths.get(gid);
        if (gpath) galleryPaths.push(gpath);
      }
    }
    
    products.set(id, {
      id,
      title: post.title,
      slug: post.slug,
      description: post.content,
      shortDescription: post.excerpt,
      sku: meta.get('_sku') || '',
      price: meta.get('_price') || '',
      regularPrice: meta.get('_regular_price') || '',
      salePrice: meta.get('_sale_price') || '',
      weight: meta.get('_weight') || '',
      length: meta.get('_length') || '',
      width: meta.get('_width') || '',
      height: meta.get('_height') || '',
      stockQuantity: meta.get('_stock') || '',
      stockStatus: meta.get('_stock_status') || '',
      imageId: thumbnailId,
      galleryImageIds: galleryIdsStr,
      imagePath,
      galleryPaths,
    });
  }
  
  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         PARSE WOOCOMMERCE SQL DATABASE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const products = await parseSQL();
  
  // Convert to array
  const productArray = Array.from(products.values());
  
  // Summary statistics
  const withDesc = productArray.filter(p => p.description.length > 50);
  const withPrice = productArray.filter(p => p.price);
  const withWeight = productArray.filter(p => p.weight);
  const withDimensions = productArray.filter(p => p.length || p.width || p.height);
  const withSku = productArray.filter(p => p.sku);
  const withImage = productArray.filter(p => p.imagePath);
  const withGallery = productArray.filter(p => p.galleryPaths.length > 0);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📦 Total Products: ${productArray.length}`);
  console.log(`   With Description: ${withDesc.length} (${Math.round(withDesc.length/productArray.length*100)}%)`);
  console.log(`   With Price: ${withPrice.length} (${Math.round(withPrice.length/productArray.length*100)}%)`);
  console.log(`   With Weight: ${withWeight.length} (${Math.round(withWeight.length/productArray.length*100)}%)`);
  console.log(`   With Dimensions: ${withDimensions.length} (${Math.round(withDimensions.length/productArray.length*100)}%)`);
  console.log(`   With SKU: ${withSku.length} (${Math.round(withSku.length/productArray.length*100)}%)`);
  console.log(`   With Main Image: ${withImage.length} (${Math.round(withImage.length/productArray.length*100)}%)`);
  console.log(`   With Gallery: ${withGallery.length} (${Math.round(withGallery.length/productArray.length*100)}%)`);
  
  // Sample products with images
  console.log('\n📝 Sample products with resolved images:');
  productArray.filter(p => p.imagePath).slice(0, 5).forEach(p => {
    console.log(`\n   ${p.title}`);
    console.log(`   └─ SKU: ${p.sku || 'N/A'}, Price: $${p.price || 'N/A'}`);
    console.log(`   └─ Image: ${p.imagePath}`);
    if (p.galleryPaths.length > 0) {
      console.log(`   └─ Gallery: ${p.galleryPaths.length} images`);
    }
  });
  
  // Save to JSON
  const outputPath = resolve(CSV_DIR, 'woo_products_full.json');
  writeFileSync(outputPath, JSON.stringify(productArray, null, 2));
  console.log(`\n✅ Saved to: CSVs/woo_products_full.json`);
  
  // Also create a handle-keyed lookup for easy merging
  const handleMap: Record<string, WooProduct> = {};
  for (const p of productArray) {
    if (p.slug) {
      handleMap[p.slug.toLowerCase()] = p;
    }
  }
  const lookupPath = resolve(CSV_DIR, 'woo_products_lookup.json');
  writeFileSync(lookupPath, JSON.stringify(handleMap, null, 2));
  console.log(`✅ Saved lookup: CSVs/woo_products_lookup.json`);
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
