#!/usr/bin/env npx tsx
/**
 * Fuzzy Match Images - Match Shopify products to WooCommerce images by title
 * 
 * Uses title similarity matching when handles don't match exactly.
 * 
 * Usage:
 *   npx tsx src/cli/fuzzyMatchImages.ts --dry-run
 *   npx tsx src/cli/fuzzyMatchImages.ts --confirm
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.error('❌ Missing SHOPIFY_DOMAIN or SHOPIFY_ADMIN_TOKEN in .env');
  process.exit(1);
}

const GRAPHQL_URL = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`;
const CSV_DIR = resolve(__dirname, '../../../CSVs');
const UPLOADS_DIR = resolve(__dirname, '../../../hmoonhydro.com/wp-content/uploads');
const ATTACHMENTS_FILE = resolve(CSV_DIR, 'wp_attachments.txt');

interface WooProduct {
  id: number;
  title: string;
  slug: string;
  imageId: string;
}

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string } | null;
}

const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;

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

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  
  if (normA === normB) return 1;
  
  // Simple containment check
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.9;
  }
  
  // Word overlap
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  
  const maxWords = Math.max(wordsA.size, wordsB.size);
  if (maxWords === 0) return 0;
  
  return overlap / maxWords;
}

function parseAttachmentPaths(): Map<string, string> {
  console.log('📂 Parsing attachment paths...');
  
  if (!existsSync(ATTACHMENTS_FILE)) {
    console.error(`❌ Attachments file not found`);
    process.exit(1);
  }

  const content = readFileSync(ATTACHMENTS_FILE, 'utf-8');
  const attachments = new Map<string, string>();

  const regex = /\((\d+),\s*(\d+),\s*'_wp_attached_file',\s*'([^']+)'\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, , postId, filePath] = match;
    attachments.set(postId, filePath);
  }

  console.log(`   Found ${attachments.size} attachment file paths`);
  return attachments;
}

function loadWooProducts(): WooProduct[] {
  const lookupPath = resolve(CSV_DIR, 'woo_products_lookup.json');
  if (!existsSync(lookupPath)) {
    console.error('❌ woo_products_lookup.json not found');
    process.exit(1);
  }

  const lookup = JSON.parse(readFileSync(lookupPath, 'utf-8'));
  const products: WooProduct[] = [];

  for (const product of Object.values(lookup) as WooProduct[]) {
    if (product.imageId && product.imageId !== 'NULL' && product.imageId !== '0') {
      products.push(product);
    }
  }

  console.log(`📦 Loaded ${products.length} WooCommerce products with images`);
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
  }

  const withoutImages = products.filter(p => !p.featuredImage);
  console.log(`   Total: ${products.length} products, ${withoutImages.length} without images`);

  return withoutImages;
}

async function uploadImageToShopify(productId: string, imagePath: string): Promise<boolean> {
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const filename = basename(imagePath);
  
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext || 'jpg'] || 'image/jpeg';

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
    return false;
  }

  const target = stagedResult.stagedUploadsCreate.stagedTargets[0];
  
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
    return false;
  }

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
    return false;
  }

  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         FUZZY MATCH IMAGES - TITLE SIMILARITY MATCHING');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN' : '⚠️  LIVE'}`);
  console.log(`📦 Limit: ${limit} products\n`);

  const attachments = parseAttachmentPaths();
  const wooProducts = loadWooProducts();
  const shopifyProducts = await fetchShopifyProductsWithoutImages();

  // Build matches by title similarity
  interface Match {
    shopify: ShopifyProduct;
    woo: WooProduct;
    similarity: number;
    localPath: string;
  }

  const matches: Match[] = [];
  const threshold = 0.7; // Minimum similarity score

  console.log('\n🔍 Finding fuzzy matches...');

  for (const shopifyProduct of shopifyProducts) {
    let bestMatch: { woo: WooProduct; similarity: number } | null = null;

    for (const wooProduct of wooProducts) {
      const similarity = titleSimilarity(shopifyProduct.title, wooProduct.title);
      
      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { woo: wooProduct, similarity };
        }
      }
    }

    if (bestMatch) {
      const filePath = attachments.get(bestMatch.woo.imageId);
      if (filePath) {
        const localPath = resolve(UPLOADS_DIR, filePath);
        if (existsSync(localPath)) {
          matches.push({
            shopify: shopifyProduct,
            woo: bestMatch.woo,
            similarity: bestMatch.similarity,
            localPath,
          });
        }
      }
    }
  }

  console.log(`   Found ${matches.length} fuzzy matches with local images\n`);

  if (matches.length === 0) {
    console.log('✅ No additional matches found!');
    return;
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  const toProcess = matches.slice(0, limit);
  console.log(`🔄 Processing ${toProcess.length} matches...\n`);

  let success = 0, failed = 0;
  const log: Array<{ shopifyTitle: string; wooTitle: string; similarity: number; status: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const match = toProcess[i];
    const shortTitle = match.shopify.title.substring(0, 35) + (match.shopify.title.length > 35 ? '...' : '');
    const simPct = Math.round(match.similarity * 100);

    if (isDryRun) {
      console.log(`   ${i + 1}/${toProcess.length} [DRY RUN] ${shortTitle} (${simPct}% match)`);
      console.log(`      Matched to: ${match.woo.title.substring(0, 40)}`);
      log.push({
        shopifyTitle: match.shopify.title,
        wooTitle: match.woo.title,
        similarity: match.similarity,
        status: 'dry-run',
      });
    } else {
      try {
        const ok = await uploadImageToShopify(match.shopify.id, match.localPath);
        if (ok) {
          console.log(`   ${i + 1}/${toProcess.length} ✅ ${shortTitle} (${simPct}%)`);
          success++;
          log.push({
            shopifyTitle: match.shopify.title,
            wooTitle: match.woo.title,
            similarity: match.similarity,
            status: 'success',
          });
        } else {
          console.log(`   ${i + 1}/${toProcess.length} ❌ ${shortTitle}`);
          failed++;
          log.push({
            shopifyTitle: match.shopify.title,
            wooTitle: match.woo.title,
            similarity: match.similarity,
            status: 'failed',
          });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.log(`   ${i + 1}/${toProcess.length} ❌ ${shortTitle} (error)`);
        failed++;
      }
    }
  }

  writeFileSync(resolve(CSV_DIR, 'fuzzy_match_log.json'), JSON.stringify(log, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📦 Processed: ${toProcess.length} matches`);
  if (isDryRun) {
    console.log('   🔍 Dry run - no uploads made');
    console.log('\n💡 Run with --confirm to upload images');
  } else {
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
