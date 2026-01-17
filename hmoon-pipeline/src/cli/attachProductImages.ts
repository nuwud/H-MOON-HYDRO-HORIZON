/**
 * attachProductImages.ts
 * 
 * Attach images to Shopify products using URLs from WooCommerce export.
 * Uses Shopify Admin GraphQL API to add images to products that don't have any.
 * 
 * Usage:
 *   npx tsx src/cli/attachProductImages.ts --dry-run     # Preview only
 *   npx tsx src/cli/attachProductImages.ts --confirm     # Actually attach images
 *   npx tsx src/cli/attachProductImages.ts --limit 100   # Process max 100 products
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadShopifyConfig,
  executeGraphQL,
  paginateGraphQL,
  type ShopifyConfig,
} from '../utils/shopifyAdminGraphql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImageMapping {
  handle: string;
  name: string;
  imageUrl: string;
}

interface ProductNode {
  id: string;
  handle: string;
  title: string;
  images: { nodes: { id: string; url: string }[] };
}

interface AttachResult {
  handle: string;
  productId: string;
  imageUrl: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Mutations
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          id
          handle
          title
          images(first: 1) { nodes { id url } }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`;

// Use productCreateMedia to attach image from URL
const ATTACH_IMAGE_MUTATION = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          image {
            url
          }
        }
      }
      mediaUserErrors {
        field
        message
        code
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Load Image Mappings
// ─────────────────────────────────────────────────────────────────────────────

function loadImageMappings(): Map<string, ImageMapping> {
  const filePath = resolve(CSV_DIR, 'woo_image_map.json');
  if (!existsSync(filePath)) {
    throw new Error('woo_image_map.json not found. Run extractWooImages.ts first.');
  }
  
  const data: ImageMapping[] = JSON.parse(readFileSync(filePath, 'utf-8'));
  const map = new Map<string, ImageMapping>();
  
  for (const item of data) {
    map.set(item.handle.toLowerCase(), item);
  }
  
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach Image to Product
// ─────────────────────────────────────────────────────────────────────────────

async function attachImage(
  config: ShopifyConfig, 
  productId: string, 
  imageUrl: string,
  altText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await executeGraphQL(config, ATTACH_IMAGE_MUTATION, {
      productId,
      media: [{
        originalSource: imageUrl,
        alt: altText,
        mediaContentType: 'IMAGE',
      }],
    });
    
    if (response.errors?.length) {
      return { success: false, error: response.errors[0].message };
    }
    
    const data = response.data as { productCreateMedia?: { mediaUserErrors?: { message: string }[] } };
    if (data?.productCreateMedia?.mediaUserErrors?.length) {
      return { success: false, error: data.productCreateMedia.mediaUserErrors[0].message };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1] || '1000') : 1000;
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         ATTACH PRODUCT IMAGES VIA SHOPIFY API');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n🔧 Mode: ${dryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will attach images'}`);
  console.log(`📦 Limit: ${limit} products\n`);
  
  const config = loadShopifyConfig();
  console.log(`🏪 Store: ${config.shopDomain}`);
  
  // Load image mappings
  console.log('\n📷 Loading image mappings...');
  const imageMap = loadImageMappings();
  console.log(`   Found ${imageMap.size} products with WooCommerce images`);
  
  // Fetch all products from Shopify
  console.log('\n📦 Fetching products from Shopify...');
  const products: ProductNode[] = [];
  for await (const product of paginateGraphQL<ProductNode>(
    config,
    PRODUCTS_QUERY,
    {},
    (data: unknown) => (data as { products: { edges: Array<{ node: ProductNode; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).products
  )) {
    products.push(product);
    if (products.length % 500 === 0) {
      console.log(`   ...fetched ${products.length} products`);
    }
  }
  console.log(`   Total products in store: ${products.length}`);
  
  // Find products without images that have mappings
  const productsNeedingImages = products.filter(p => 
    p.images.nodes.length === 0 && imageMap.has(p.handle.toLowerCase())
  );
  
  console.log(`\n📋 Products without images: ${products.filter(p => p.images.nodes.length === 0).length}`);
  console.log(`   With matching image URLs: ${productsNeedingImages.length}`);
  
  if (productsNeedingImages.length === 0) {
    console.log('\n✅ No products need images attached.');
    return;
  }
  
  // Process products
  const toProcess = productsNeedingImages.slice(0, limit);
  console.log(`\n🔄 Processing ${toProcess.length} products...`);
  
  const results: AttachResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const mapping = imageMap.get(product.handle.toLowerCase())!;
    
    if (dryRun) {
      console.log(`   ${i + 1}/${toProcess.length} [DRY RUN] Would attach: ${product.title.slice(0, 40)}...`);
      results.push({
        handle: product.handle,
        productId: product.id,
        imageUrl: mapping.imageUrl,
        status: 'skipped',
      });
      skipCount++;
    } else {
      const { success, error } = await attachImage(
        config, 
        product.id, 
        mapping.imageUrl,
        product.title
      );
      
      if (success) {
        console.log(`   ${i + 1}/${toProcess.length} ✅ ${product.title.slice(0, 40)}...`);
        results.push({
          handle: product.handle,
          productId: product.id,
          imageUrl: mapping.imageUrl,
          status: 'success',
        });
        successCount++;
      } else {
        console.log(`   ${i + 1}/${toProcess.length} ❌ ${product.title.slice(0, 40)}... - ${error}`);
        results.push({
          handle: product.handle,
          productId: product.id,
          imageUrl: mapping.imageUrl,
          status: 'failed',
          error,
        });
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  
  // Save results log
  const logPath = resolve(CSV_DIR, 'image_attach_log.json');
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📦 Processed: ${toProcess.length} products`);
  if (dryRun) {
    console.log(`   🔍 Dry run - no changes made`);
    console.log(`   📷 Would attach: ${skipCount} images`);
  } else {
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
  }
  console.log(`\n📄 Log saved: CSVs/image_attach_log.json`);
  
  if (dryRun) {
    console.log('\n💡 Run with --confirm to actually attach images:');
    console.log('   npx tsx src/cli/attachProductImages.ts --confirm');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
