#!/usr/bin/env npx tsx
/**
 * Upload Local WooCommerce Images to Shopify
 * 
 * Reads WooCommerce SQL to map image IDs to file paths,
 * then uploads local images to Shopify products that are missing images.
 * 
 * Usage:
 *   npx tsx src/cli/uploadLocalImages.ts --dry-run
 *   npx tsx src/cli/uploadLocalImages.ts --confirm
 *   npx tsx src/cli/uploadLocalImages.ts --confirm --limit 50
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.error('❌ Missing SHOPIFY_DOMAIN or SHOPIFY_ADMIN_TOKEN in .env');
  process.exit(1);
}

const GRAPHQL_URL = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`;
const CSV_DIR = resolve(__dirname, '../../../CSVs');
const WOO_DIR = resolve(__dirname, '../../../hmoonhydro.com');
const UPLOADS_DIR = resolve(WOO_DIR, 'wp-content/uploads');
const ATTACHMENTS_FILE = resolve(CSV_DIR, 'wp_attachments.txt');

interface AttachmentMap {
  [imageId: string]: string; // imageId -> relative file path
}

interface WooProduct {
  id: number;
  title: string;
  slug: string;
  imageId: string;
  galleryImageIds: string;
}

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string } | null;
}

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

async function graphqlRequest(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

function parseAttachmentPaths(): AttachmentMap {
  console.log('📂 Parsing attachment paths from extracted file...');
  
  if (!existsSync(ATTACHMENTS_FILE)) {
    console.error(`❌ Attachments file not found: ${ATTACHMENTS_FILE}`);
    console.error('   Run: grep "_wp_attached_file" hmoonhydro_com_1.sql | grep -oE "\\([0-9]+,\\s*[0-9]+,\\s*\'_wp_attached_file\',\\s*\'[^\']+\'\\)" > ../CSVs/wp_attachments.txt');
    process.exit(1);
  }

  const content = readFileSync(ATTACHMENTS_FILE, 'utf-8');
  const attachments: AttachmentMap = {};

  // Pattern: (meta_id, post_id, '_wp_attached_file', 'path/to/file')
  // The post_id is the attachment/image ID
  const regex = /\((\d+),\s*(\d+),\s*'_wp_attached_file',\s*'([^']+)'\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, , postId, filePath] = match;
    attachments[postId] = filePath;
  }

  console.log(`   Found ${Object.keys(attachments).length} attachment file paths`);
  return attachments;
}

function loadWooProducts(): Map<string, WooProduct> {
  const lookupPath = resolve(CSV_DIR, 'woo_products_lookup.json');
  if (!existsSync(lookupPath)) {
    console.error('❌ woo_products_lookup.json not found. Run parseWooCommerceSQL.ts first.');
    process.exit(1);
  }

  const lookup = JSON.parse(readFileSync(lookupPath, 'utf-8'));
  const products = new Map<string, WooProduct>();

  for (const [key, product] of Object.entries(lookup)) {
    const p = product as WooProduct;
    // Index by slug (which matches Shopify handle)
    if (p.slug && p.slug !== String(p.id)) {
      products.set(p.slug, p);
    }
  }

  console.log(`📦 Loaded ${products.size} WooCommerce products with slugs`);
  return products;
}

async function fetchShopifyProductsWithoutImages(): Promise<ShopifyProduct[]> {
  console.log('🏪 Fetching Shopify products...');

  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = `
    query GetProducts($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          handle
          title
          featuredImage {
            url
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await graphqlRequest(query, { cursor });
    const batch = data.products.nodes as ShopifyProduct[];
    products.push(...batch);
    
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;

    if (products.length % 500 === 0) {
      console.log(`   ...fetched ${products.length} products`);
    }
  }

  // Filter to only products WITHOUT images
  const withoutImages = products.filter(p => !p.featuredImage);
  console.log(`   Total: ${products.length} products, ${withoutImages.length} without images`);

  return withoutImages;
}

function findLocalImagePath(imageId: string, attachments: AttachmentMap): string | null {
  const relativePath = attachments[imageId];
  if (!relativePath) return null;

  const fullPath = resolve(UPLOADS_DIR, relativePath);
  if (existsSync(fullPath)) {
    return fullPath;
  }

  // Try without year/month prefix (in case structure differs)
  const filename = basename(relativePath);
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  for (const year of years) {
    for (const month of months) {
      const altPath = resolve(UPLOADS_DIR, year, month, filename);
      if (existsSync(altPath)) {
        return altPath;
      }
    }
  }

  return null;
}

async function uploadImageToShopify(productId: string, imagePath: string): Promise<boolean> {
  // Read the image file and convert to base64
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const filename = basename(imagePath);
  
  // Determine mime type
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext || 'jpg'] || 'image/jpeg';

  // First, create a staged upload
  const stagedUploadQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const stagedResult = await graphqlRequest(stagedUploadQuery, {
    input: [{
      resource: 'PRODUCT_IMAGE',
      filename: filename,
      mimeType: mimeType,
      fileSize: imageBuffer.length.toString(),
      httpMethod: 'POST',
    }],
  });

  if (stagedResult.stagedUploadsCreate.userErrors?.length > 0) {
    console.error('   Staged upload error:', stagedResult.stagedUploadsCreate.userErrors);
    return false;
  }

  const target = stagedResult.stagedUploadsCreate.stagedTargets[0];
  
  // Upload the file to the staged URL
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([imageBuffer], { type: mimeType }), filename);

  const uploadResponse = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResponse.ok) {
    console.error('   Upload failed:', uploadResponse.status);
    return false;
  }

  // Now attach the uploaded image to the product
  const attachQuery = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;

  const attachResult = await graphqlRequest(attachQuery, {
    productId: productId,
    media: [{
      originalSource: target.resourceUrl,
      mediaContentType: 'IMAGE',
    }],
  });

  if (attachResult.productCreateMedia.mediaUserErrors?.length > 0) {
    console.error('   Attach error:', attachResult.productCreateMedia.mediaUserErrors);
    return false;
  }

  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         UPLOAD LOCAL WOOCOMMERCE IMAGES TO SHOPIFY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will upload images'}`);
  console.log(`📦 Limit: ${limit} products`);
  console.log('');

  // Step 1: Parse attachment paths from SQL
  const attachments = parseAttachmentPaths();

  // Step 2: Load WooCommerce products
  const wooProducts = loadWooProducts();

  // Step 3: Fetch Shopify products without images
  const shopifyProducts = await fetchShopifyProductsWithoutImages();

  // Step 4: Match and prepare uploads
  interface UploadTask {
    shopifyProduct: ShopifyProduct;
    wooProduct: WooProduct;
    localPath: string;
  }

  const uploadTasks: UploadTask[] = [];
  let matchedWithImage = 0;
  let matchedNoImage = 0;
  let noMatch = 0;

  for (const shopifyProduct of shopifyProducts) {
    const wooProduct = wooProducts.get(shopifyProduct.handle);
    
    if (!wooProduct) {
      noMatch++;
      continue;
    }

    if (!wooProduct.imageId || wooProduct.imageId === 'NULL' || wooProduct.imageId === '0') {
      matchedNoImage++;
      continue;
    }

    const localPath = findLocalImagePath(wooProduct.imageId, attachments);
    if (localPath) {
      uploadTasks.push({
        shopifyProduct,
        wooProduct,
        localPath,
      });
      matchedWithImage++;
    } else {
      matchedNoImage++;
    }
  }

  console.log('');
  console.log('📊 Matching Results:');
  console.log(`   Products without images: ${shopifyProducts.length}`);
  console.log(`   Matched with local image: ${matchedWithImage}`);
  console.log(`   Matched but no image file: ${matchedNoImage}`);
  console.log(`   No WooCommerce match: ${noMatch}`);
  console.log('');

  if (uploadTasks.length === 0) {
    console.log('✅ No images to upload!');
    return;
  }

  // Step 5: Process uploads
  const toProcess = uploadTasks.slice(0, limit);
  console.log(`🔄 Processing ${toProcess.length} uploads...\n`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  const log: Array<{ handle: string; title: string; status: string; imagePath?: string; error?: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const task = toProcess[i];
    const shortTitle = task.shopifyProduct.title.substring(0, 40) + (task.shopifyProduct.title.length > 40 ? '...' : '');

    if (isDryRun) {
      console.log(`   ${i + 1}/${toProcess.length} [DRY RUN] ${shortTitle}`);
      console.log(`      Would upload: ${basename(task.localPath)}`);
      log.push({
        handle: task.shopifyProduct.handle,
        title: task.shopifyProduct.title,
        status: 'dry-run',
        imagePath: task.localPath,
      });
      results.skipped++;
    } else {
      try {
        const success = await uploadImageToShopify(task.shopifyProduct.id, task.localPath);
        
        if (success) {
          console.log(`   ${i + 1}/${toProcess.length} ✅ ${shortTitle}`);
          log.push({
            handle: task.shopifyProduct.handle,
            title: task.shopifyProduct.title,
            status: 'success',
            imagePath: task.localPath,
          });
          results.success++;
        } else {
          console.log(`   ${i + 1}/${toProcess.length} ❌ ${shortTitle} (upload failed)`);
          log.push({
            handle: task.shopifyProduct.handle,
            title: task.shopifyProduct.title,
            status: 'failed',
            imagePath: task.localPath,
          });
          results.failed++;
        }

        // Rate limiting - 2 requests per second to be safe
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.log(`   ${i + 1}/${toProcess.length} ❌ ${shortTitle} (${error})`);
        log.push({
          handle: task.shopifyProduct.handle,
          title: task.shopifyProduct.title,
          status: 'error',
          error: String(error),
        });
        results.failed++;
      }
    }
  }

  // Save log
  const logPath = resolve(CSV_DIR, 'upload_images_log.json');
  writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📦 Processed: ${toProcess.length} products`);
  if (isDryRun) {
    console.log('   🔍 Dry run - no uploads made');
  } else {
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
  }

  console.log(`\n📄 Log saved: CSVs/upload_images_log.json`);

  if (isDryRun) {
    console.log('\n💡 Run with --confirm to upload images:');
    console.log('   npx tsx src/cli/uploadLocalImages.ts --confirm');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
