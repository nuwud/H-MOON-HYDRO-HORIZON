#!/usr/bin/env npx tsx
/**
 * Import Missing Products to Shopify
 * 
 * Compares CSV import file against current store products
 * and creates any missing products via GraphQL API.
 * 
 * Usage:
 *   npx tsx src/cli/importMissingProducts.ts --dry-run
 *   npx tsx src/cli/importMissingProducts.ts --confirm
 *   npx tsx src/cli/importMissingProducts.ts --confirm --limit 50
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
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

interface CsvProduct {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string;
  published: string;
  sku: string;
  grams: string;
  price: string;
  compareAtPrice: string;
  status: string;
}

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;
const includeDrafts = args.includes('--drafts');

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

function loadCsvProducts(filename: string): CsvProduct[] {
  const csvPath = resolve(CSV_DIR, filename);
  if (!existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    return [];
  }

  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  const headers = parseCsvLine(lines[0]);
  
  // Find column indices
  const handleIdx = headers.findIndex(h => h.toLowerCase() === 'handle');
  const titleIdx = headers.findIndex(h => h.toLowerCase() === 'title');
  const bodyIdx = headers.findIndex(h => h.toLowerCase().includes('body'));
  const vendorIdx = headers.findIndex(h => h.toLowerCase() === 'vendor');
  const typeIdx = headers.findIndex(h => h.toLowerCase() === 'type');
  const tagsIdx = headers.findIndex(h => h.toLowerCase() === 'tags');
  const publishedIdx = headers.findIndex(h => h.toLowerCase() === 'published');
  const skuIdx = headers.findIndex(h => h.toLowerCase().includes('sku'));
  const gramsIdx = headers.findIndex(h => h.toLowerCase().includes('grams'));
  const priceIdx = headers.findIndex(h => h.toLowerCase().includes('variant price'));
  const compareIdx = headers.findIndex(h => h.toLowerCase().includes('compare'));
  const statusIdx = headers.findIndex(h => h.toLowerCase() === 'status');

  const products: CsvProduct[] = [];
  const seenHandles = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const handle = values[handleIdx];
    
    // Skip duplicate handles (variant rows)
    if (!handle || seenHandles.has(handle)) continue;
    seenHandles.add(handle);

    products.push({
      handle,
      title: values[titleIdx] || '',
      bodyHtml: values[bodyIdx] || '',
      vendor: values[vendorIdx] || '',
      productType: values[typeIdx] || '',
      tags: values[tagsIdx] || '',
      published: values[publishedIdx] || 'true',
      sku: values[skuIdx] || '',
      grams: values[gramsIdx] || '0',
      price: values[priceIdx] || '0',
      compareAtPrice: values[compareIdx] || '',
      status: values[statusIdx] || 'active',
    });
  }

  return products;
}

async function fetchExistingHandles(): Promise<Set<string>> {
  console.log('📦 Fetching existing products from Shopify...');

  const handles = new Set<string>();
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
          handle
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await graphqlRequest(query, { cursor });
    const batch = data.products.nodes;
    batch.forEach((p: { handle: string }) => handles.add(p.handle));
    
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;

    if (handles.size % 500 === 0) {
      console.log(`   ...fetched ${handles.size} products`);
    }
  }

  console.log(`   Total: ${handles.size} existing products`);
  return handles;
}

async function createProduct(product: CsvProduct): Promise<boolean> {
  // Step 1: Create the product (without variants - new API requirement)
  const createMutation = `
    mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const weight = parseFloat(product.grams) || 0;
  const price = parseFloat(product.price) || 0;
  const compareAt = parseFloat(product.compareAtPrice) || undefined;

  const productInput: Record<string, unknown> = {
    handle: product.handle,
    title: product.title || product.handle,
    descriptionHtml: product.bodyHtml,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags ? product.tags.split(',').map(t => t.trim()) : [],
    status: product.status.toUpperCase() === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
  };

  try {
    const createResult = await graphqlRequest(createMutation, { input: productInput });
    
    if (createResult.productCreate.userErrors?.length > 0) {
      console.error(`   Error creating product: ${createResult.productCreate.userErrors[0].message}`);
      return false;
    }

    const productId = createResult.productCreate.product?.id;
    if (!productId) {
      console.error('   Error: No product ID returned');
      return false;
    }

    // Step 2: Update the default variant with price, weight, SKU
    const variantQuery = `
      query GetVariants($productId: ID!) {
        product(id: $productId) {
          variants(first: 1) {
            nodes {
              id
            }
          }
        }
      }
    `;

    const variantData = await graphqlRequest(variantQuery, { productId });
    const variantId = variantData.product?.variants?.nodes?.[0]?.id;

    if (variantId) {
      const updateVariantMutation = `
        mutation UpdateVariant($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variantInput: Record<string, unknown> = {
        id: variantId,
        sku: product.sku,
        price: price.toFixed(2),
        compareAtPrice: compareAt ? compareAt.toFixed(2) : null,
      };

      await graphqlRequest(updateVariantMutation, { input: variantInput });
    }

    return true;
  } catch (error) {
    console.error(`   Error: ${error}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         IMPORT MISSING PRODUCTS TO SHOPIFY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will create products'}`);
  console.log(`📦 Limit: ${limit} products`);
  console.log(`📋 Include drafts: ${includeDrafts ? 'Yes' : 'No'}`);
  console.log('');

  // Load CSV products
  console.log('📂 Loading products from CSV files...');
  const readyProducts = loadCsvProducts('shopify_import_ready.csv');
  console.log(`   Ready products: ${readyProducts.length}`);

  let draftProducts: CsvProduct[] = [];
  if (includeDrafts) {
    draftProducts = loadCsvProducts('shopify_import_draft.csv');
    console.log(`   Draft products: ${draftProducts.length}`);
  }

  const allCsvProducts = [...readyProducts, ...draftProducts];
  console.log(`   Total in CSV: ${allCsvProducts.length}`);

  // Get existing handles
  const existingHandles = await fetchExistingHandles();

  // Find missing products
  const missingProducts = allCsvProducts.filter(p => !existingHandles.has(p.handle));
  console.log(`\n📊 Analysis:`);
  console.log(`   In CSV: ${allCsvProducts.length}`);
  console.log(`   In Shopify: ${existingHandles.size}`);
  console.log(`   Missing: ${missingProducts.length}`);
  console.log('');

  if (missingProducts.length === 0) {
    console.log('✅ All products are already imported!');
    return;
  }

  // Process missing products
  const toProcess = missingProducts.slice(0, limit);
  console.log(`🔄 Processing ${toProcess.length} missing products...\n`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  const log: Array<{ handle: string; title: string; status: string; error?: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const shortTitle = product.title.substring(0, 40) + (product.title.length > 40 ? '...' : '');

    if (isDryRun) {
      console.log(`   ${i + 1}/${toProcess.length} [DRY RUN] ${shortTitle}`);
      console.log(`      Handle: ${product.handle}, Price: $${product.price}`);
      log.push({ handle: product.handle, title: product.title, status: 'dry-run' });
      results.skipped++;
    } else {
      const success = await createProduct(product);
      
      if (success) {
        console.log(`   ${i + 1}/${toProcess.length} ✅ ${shortTitle}`);
        log.push({ handle: product.handle, title: product.title, status: 'success' });
        results.success++;
      } else {
        console.log(`   ${i + 1}/${toProcess.length} ❌ ${shortTitle}`);
        log.push({ handle: product.handle, title: product.title, status: 'failed' });
        results.failed++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Save log
  const logPath = resolve(CSV_DIR, 'import_missing_log.json');
  writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📦 Processed: ${toProcess.length} products`);
  if (isDryRun) {
    console.log('   🔍 Dry run - no products created');
  } else {
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
  }

  if (missingProducts.length > toProcess.length) {
    console.log(`\n⚠️  ${missingProducts.length - toProcess.length} more products remaining`);
  }

  console.log(`\n📄 Log saved: CSVs/import_missing_log.json`);

  if (isDryRun) {
    console.log('\n💡 Run with --confirm to create products:');
    console.log('   npx tsx src/cli/importMissingProducts.ts --confirm');
    console.log('   npx tsx src/cli/importMissingProducts.ts --confirm --drafts');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
