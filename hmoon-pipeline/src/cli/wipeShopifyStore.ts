/**
 * wipeShopifyStore.ts
 * 
 * CLI to safely delete ALL products and collections from a Shopify store.
 * 
 * ⚠️  IRREVERSIBLE - Products are permanently deleted!
 * 
 * Usage:
 *   npx tsx src/cli/wipeShopifyStore.ts --dry-run              # Preview what would be deleted
 *   npx tsx src/cli/wipeShopifyStore.ts --confirm              # Actually delete (requires typing domain)
 *   npx tsx src/cli/wipeShopifyStore.ts --scope products       # Delete only products
 *   npx tsx src/cli/wipeShopifyStore.ts --scope collections    # Delete only collections
 *   npx tsx src/cli/wipeShopifyStore.ts --limit 100            # Delete max 100 items
 *   npx tsx src/cli/wipeShopifyStore.ts --pause-ms 500         # Pause 500ms between batches
 * 
 * Environment variables:
 *   SHOPIFY_SHOP_DOMAIN   - e.g., "h-moon-hydro.myshopify.com"
 *   SHOPIFY_ADMIN_TOKEN   - Admin API access token
 *   SHOPIFY_API_VERSION   - Optional, defaults to 2024-01
 */

import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
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

interface WipeOptions {
  dryRun: boolean;
  confirm: boolean;
  force: boolean;  // Skip interactive confirmation
  scope: 'products' | 'collections' | 'all';
  limit: number;
  pauseMs: number;
}

interface WipeLogEntry {
  timestamp: string;
  entity_type: 'product' | 'collection';
  entity_id: string;
  title: string;
  handle: string;
  action: 'delete' | 'skip';
  status: 'success' | 'failed' | 'dry_run';
  error: string;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
}

interface CollectionNode {
  id: string;
  title: string;
  handle: string;
  ruleSet?: { rules: unknown[] } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Helpers
// ─────────────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        SHOPIFY STORE WIPE UTILITY                            ║
║                                                                              ║
║  ⚠️  WARNING: This tool PERMANENTLY DELETES products and collections!        ║
║      This action is IRREVERSIBLE. Use with extreme caution.                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage:
  npx tsx src/cli/wipeShopifyStore.ts [options]

Options:
  --dry-run         Preview what would be deleted (DEFAULT, safe mode)
  --confirm         Actually perform deletions (requires typing domain to confirm)
  --force           Skip interactive confirmation (use with --confirm for scripting)
  --scope <type>    What to delete: products, collections, or all (default: all)
  --limit <n>       Maximum number of items to delete (default: unlimited)
  --pause-ms <n>    Pause between batches in milliseconds (default: 200)
  --help            Show this help message

Environment Variables:
  SHOPIFY_SHOP_DOMAIN   Your Shopify store domain (e.g., h-moon-hydro.myshopify.com)
  SHOPIFY_ADMIN_TOKEN   Your Shopify Admin API access token
  SHOPIFY_API_VERSION   Optional API version (default: 2024-01)

Examples:
  # Preview what would be deleted (safe)
  npx tsx src/cli/wipeShopifyStore.ts --dry-run

  # Delete only products (requires confirmation)
  npx tsx src/cli/wipeShopifyStore.ts --confirm --scope products

  # Delete everything with 500ms pause between batches
  npx tsx src/cli/wipeShopifyStore.ts --confirm --pause-ms 500

Output:
  CSVs/wipe_log.csv - Log of all actions taken
`);
}

function parseArgs(): WipeOptions {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const options: WipeOptions = {
    dryRun: !args.includes('--confirm'),
    confirm: args.includes('--confirm'),
    force: args.includes('--force'),  // Skip interactive confirmation
    scope: 'all',
    limit: Infinity,
    pauseMs: 200,
  };

  const scopeIdx = args.indexOf('--scope');
  if (scopeIdx >= 0 && args[scopeIdx + 1]) {
    const scope = args[scopeIdx + 1];
    if (['products', 'collections', 'all'].includes(scope)) {
      options.scope = scope as WipeOptions['scope'];
    }
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    options.limit = parseInt(args[limitIdx + 1], 10) || Infinity;
  }

  const pauseIdx = args.indexOf('--pause-ms');
  if (pauseIdx >= 0 && args[pauseIdx + 1]) {
    options.pauseMs = parseInt(args[pauseIdx + 1], 10) || 200;
  }

  return options;
}

async function promptConfirmation(domain: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  DANGER ZONE - IRREVERSIBLE ACTION');
    console.log('='.repeat(70));
    console.log(`\nYou are about to PERMANENTLY DELETE data from: ${domain}`);
    console.log('This action CANNOT be undone.\n');
    
    rl.question(`To confirm, type the shop domain exactly (${domain}): `, (answer) => {
      rl.close();
      resolve(answer.trim() === domain);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const logPath = resolve(CSV_DIR, 'wipe_log.csv');

function initLogFile(): void {
  const header = 'timestamp,entity_type,entity_id,title,handle,action,status,error\n';
  writeFileSync(logPath, header, 'utf-8');
}

function logEntry(entry: WipeLogEntry): void {
  const escapeCsv = (s: string) => {
    if (!s) return '';
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const line = [
    entry.timestamp,
    entry.entity_type,
    entry.entity_id,
    escapeCsv(entry.title),
    escapeCsv(entry.handle),
    entry.action,
    entry.status,
    escapeCsv(entry.error),
  ].join(',') + '\n';

  appendFileSync(logPath, line, 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Queries
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query GetProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        cursor
        node {
          id
          title
          handle
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query GetCollections($cursor: String) {
    collections(first: 250, after: $cursor) {
      edges {
        cursor
        node {
          id
          title
          handle
          ruleSet {
            rules {
              column
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

const DELETE_PRODUCT_MUTATION = `
  mutation DeleteProduct($id: ID!) {
    productDelete(input: { id: $id }) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_COLLECTION_MUTATION = `
  mutation DeleteCollection($id: ID!) {
    collectionDelete(input: { id: $id }) {
      deletedCollectionId
      userErrors {
        field
        message
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Wipe Functions
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllProducts(config: ShopifyConfig): Promise<ProductNode[]> {
  console.log('\n📦 Fetching products...');
  const products: ProductNode[] = [];
  
  for await (const product of paginateGraphQL<ProductNode>(
    config,
    PRODUCTS_QUERY,
    {},
    (data: unknown) => (data as { products: { edges: Array<{ node: ProductNode; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).products
  )) {
    products.push(product);
    if (products.length % 250 === 0) {
      console.log(`   Fetched ${products.length} products...`);
    }
  }
  
  console.log(`   Found ${products.length} products total`);
  return products;
}

async function fetchAllCollections(config: ShopifyConfig): Promise<CollectionNode[]> {
  console.log('\n📁 Fetching collections...');
  const collections: CollectionNode[] = [];
  
  for await (const collection of paginateGraphQL<CollectionNode>(
    config,
    COLLECTIONS_QUERY,
    {},
    (data: unknown) => (data as { collections: { edges: Array<{ node: CollectionNode; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).collections
  )) {
    collections.push(collection);
  }
  
  console.log(`   Found ${collections.length} collections total`);
  return collections;
}

async function deleteProducts(
  config: ShopifyConfig,
  products: ProductNode[],
  options: WipeOptions
): Promise<{ success: number; failed: number }> {
  console.log('\n🗑️  Deleting products...');
  let success = 0;
  let failed = 0;
  
  const toDelete = products.slice(0, options.limit);
  
  for (let i = 0; i < toDelete.length; i++) {
    const product = toDelete[i];
    const timestamp = new Date().toISOString();
    
    if (options.dryRun) {
      console.log(`   [DRY RUN] Would delete: ${product.title} (${product.handle})`);
      logEntry({
        timestamp,
        entity_type: 'product',
        entity_id: product.id,
        title: product.title,
        handle: product.handle,
        action: 'delete',
        status: 'dry_run',
        error: '',
      });
      success++;
      continue;
    }
    
    try {
      const response = await executeGraphQL<{
        productDelete: {
          deletedProductId: string | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      }>(config, DELETE_PRODUCT_MUTATION, { id: product.id });
      
      if (response.errors?.length) {
        throw new Error(response.errors.map(e => e.message).join(', '));
      }
      
      const userErrors = response.data?.productDelete?.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(userErrors.map(e => e.message).join(', '));
      }
      
      console.log(`   ✓ Deleted: ${product.title} (${i + 1}/${toDelete.length})`);
      logEntry({
        timestamp,
        entity_type: 'product',
        entity_id: product.id,
        title: product.title,
        handle: product.handle,
        action: 'delete',
        status: 'success',
        error: '',
      });
      success++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ✗ Failed: ${product.title} - ${errorMsg}`);
      logEntry({
        timestamp,
        entity_type: 'product',
        entity_id: product.id,
        title: product.title,
        handle: product.handle,
        action: 'delete',
        status: 'failed',
        error: errorMsg,
      });
      failed++;
    }
    
    // Pause between deletions
    if (options.pauseMs > 0 && i < toDelete.length - 1) {
      await sleep(options.pauseMs);
    }
  }
  
  return { success, failed };
}

async function deleteCollections(
  config: ShopifyConfig,
  collections: CollectionNode[],
  options: WipeOptions
): Promise<{ success: number; failed: number }> {
  console.log('\n🗑️  Deleting collections...');
  let success = 0;
  let failed = 0;
  
  const toDelete = collections.slice(0, options.limit);
  
  for (let i = 0; i < toDelete.length; i++) {
    const collection = toDelete[i];
    const timestamp = new Date().toISOString();
    const collectionType = collection.ruleSet?.rules?.length ? 'smart' : 'manual';
    
    if (options.dryRun) {
      console.log(`   [DRY RUN] Would delete ${collectionType} collection: ${collection.title}`);
      logEntry({
        timestamp,
        entity_type: 'collection',
        entity_id: collection.id,
        title: collection.title,
        handle: collection.handle,
        action: 'delete',
        status: 'dry_run',
        error: '',
      });
      success++;
      continue;
    }
    
    try {
      const response = await executeGraphQL<{
        collectionDelete: {
          deletedCollectionId: string | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      }>(config, DELETE_COLLECTION_MUTATION, { id: collection.id });
      
      if (response.errors?.length) {
        throw new Error(response.errors.map(e => e.message).join(', '));
      }
      
      const userErrors = response.data?.collectionDelete?.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(userErrors.map(e => e.message).join(', '));
      }
      
      console.log(`   ✓ Deleted ${collectionType}: ${collection.title} (${i + 1}/${toDelete.length})`);
      logEntry({
        timestamp,
        entity_type: 'collection',
        entity_id: collection.id,
        title: collection.title,
        handle: collection.handle,
        action: 'delete',
        status: 'success',
        error: '',
      });
      success++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ✗ Failed: ${collection.title} - ${errorMsg}`);
      logEntry({
        timestamp,
        entity_type: 'collection',
        entity_id: collection.id,
        title: collection.title,
        handle: collection.handle,
        action: 'delete',
        status: 'failed',
        error: errorMsg,
      });
      failed++;
    }
    
    // Pause between deletions
    if (options.pauseMs > 0 && i < toDelete.length - 1) {
      await sleep(options.pauseMs);
    }
  }
  
  return { success, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs();
  
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║               SHOPIFY STORE WIPE UTILITY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  // Load config
  let config: ShopifyConfig;
  try {
    config = loadShopifyConfig();
  } catch (error) {
    console.error('\n❌ Configuration error:', (error as Error).message);
    console.log('\nMake sure you have set these environment variables:');
    console.log('  SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com');
    console.log('  SHOPIFY_ADMIN_TOKEN=shpat_xxxxx');
    process.exit(1);
  }
  
  console.log(`\n📍 Store: ${config.shopDomain}`);
  console.log(`📋 Scope: ${options.scope}`);
  console.log(`🔢 Limit: ${options.limit === Infinity ? 'unlimited' : options.limit}`);
  console.log(`⏱️  Pause: ${options.pauseMs}ms between operations`);
  console.log(`🔒 Mode: ${options.dryRun ? 'DRY RUN (safe preview)' : '⚠️  LIVE DELETE'}`);
  
  // Confirmation for live mode
  if (options.confirm && !options.dryRun) {
    if (options.force) {
      console.log('\n⚡ Force mode - skipping interactive confirmation');
      console.log('✓ Proceeding with deletion...');
    } else {
      const confirmed = await promptConfirmation(config.shopDomain);
      if (!confirmed) {
        console.log('\n❌ Confirmation failed. Aborting.');
        process.exit(1);
      }
      console.log('\n✓ Confirmed. Proceeding with deletion...');
    }
  }
  
  // Initialize log file
  initLogFile();
  console.log(`\n📝 Logging to: CSVs/wipe_log.csv`);
  
  const stats = {
    productsSuccess: 0,
    productsFailed: 0,
    collectionsSuccess: 0,
    collectionsFailed: 0,
  };
  
  // Delete products
  if (options.scope === 'products' || options.scope === 'all') {
    const products = await fetchAllProducts(config);
    if (products.length > 0) {
      const result = await deleteProducts(config, products, options);
      stats.productsSuccess = result.success;
      stats.productsFailed = result.failed;
    }
  }
  
  // Delete collections
  if (options.scope === 'collections' || options.scope === 'all') {
    const collections = await fetchAllCollections(config);
    if (collections.length > 0) {
      const result = await deleteCollections(config, collections, options);
      stats.collectionsSuccess = result.success;
      stats.collectionsFailed = result.failed;
    }
  }
  
  // Summary
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('📊 WIPE SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`\n${options.dryRun ? '🔒 DRY RUN - No actual deletions performed' : '⚠️  LIVE RUN - Deletions performed'}`);
  console.log(`\n📦 Products: ${stats.productsSuccess} ${options.dryRun ? 'would be deleted' : 'deleted'}, ${stats.productsFailed} failed`);
  console.log(`📁 Collections: ${stats.collectionsSuccess} ${options.dryRun ? 'would be deleted' : 'deleted'}, ${stats.collectionsFailed} failed`);
  console.log(`\n📝 Log saved: CSVs/wipe_log.csv`);
  
  if (options.dryRun) {
    console.log('\n💡 To actually delete, run with --confirm flag');
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
