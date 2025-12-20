/**
 * backupShopifyStore.ts
 * 
 * Exports all products and collections from Shopify to local JSON files
 * Run this before wiping the store!
 * 
 * Usage:
 *   npx tsx src/cli/backupShopifyStore.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadShopifyConfig,
  executeGraphQL,
  paginateGraphQL,
} from '../utils/shopifyAdminGraphql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Queries
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          tags
          status
          createdAt
          updatedAt
          seo {
            title
            description
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 20) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                barcode
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          options {
            id
            name
            values
          }
          metafields(first: 50) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          seo {
            title
            description
          }
          image {
            url
            altText
          }
          ruleSet {
            appliedDisjunctively
            rules {
              column
              relation
              condition
            }
          }
          productsCount {
            count
          }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║               SHOPIFY STORE BACKUP UTILITY                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Load config
  let config;
  try {
    config = loadShopifyConfig();
  } catch (err) {
    console.error(`❌ Configuration error: ${(err as Error).message}`);
    console.log('\nMake sure you have set these environment variables:');
    console.log('  SHOPIFY_DOMAIN=your-store.myshopify.com');
    console.log('  SHOPIFY_ADMIN_TOKEN=shpat_xxxxx\n');
    process.exit(1);
  }

  console.log(`🏪 Store: ${config.shopDomain}`);
  console.log(`📅 Backup started: ${new Date().toISOString()}`);
  console.log('');

  // Create backup directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = resolve(__dirname, `../../backups/${timestamp}`);
  mkdirSync(backupDir, { recursive: true });
  console.log(`📁 Backup directory: backups/${timestamp}`);
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Backup Products
  // ─────────────────────────────────────────────────────────────────────────
  console.log('📦 Fetching products...');
  
  const allProducts: unknown[] = [];
  let productCursor: string | null = null;
  let productPage = 0;

  interface ProductsResponse {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: Array<{ node: unknown }>;
    };
  }

  while (true) {
    productPage++;
    const result: Awaited<ReturnType<typeof executeGraphQL<ProductsResponse>>> = 
      await executeGraphQL<ProductsResponse>(config, PRODUCTS_QUERY, { first: 50, after: productCursor });

    if (result.errors?.length) {
      console.error('GraphQL errors:', result.errors);
      break;
    }

    const products: ProductsResponse['products'] | undefined = result.data?.products;
    if (!products) break;

    const nodes = products.edges.map((e: { node: unknown }) => e.node);
    allProducts.push(...nodes);
    
    process.stdout.write(`   Page ${productPage}: ${nodes.length} products (${allProducts.length} total)\r`);

    if (!products.pageInfo.hasNextPage) break;
    productCursor = products.pageInfo.endCursor;
  }

  console.log(`\n   ✅ Fetched ${allProducts.length} products`);

  // Save products
  const productsFile = resolve(backupDir, 'products.json');
  writeFileSync(productsFile, JSON.stringify(allProducts, null, 2));
  console.log(`   💾 Saved to: products.json`);

  // ─────────────────────────────────────────────────────────────────────────
  // Backup Collections
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📁 Fetching collections...');

  const allCollections: unknown[] = [];
  let collectionCursor: string | null = null;
  let collectionPage = 0;

  interface CollectionsResponse {
    collections: {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: Array<{ node: unknown }>;
    };
  }

  while (true) {
    collectionPage++;
    const result: Awaited<ReturnType<typeof executeGraphQL<CollectionsResponse>>> = 
      await executeGraphQL<CollectionsResponse>(config, COLLECTIONS_QUERY, { first: 50, after: collectionCursor });

    if (result.errors?.length) {
      console.error('GraphQL errors:', result.errors);
      break;
    }

    const collections: CollectionsResponse['collections'] | undefined = result.data?.collections;
    if (!collections) break;

    const nodes = collections.edges.map((e: { node: unknown }) => e.node);
    allCollections.push(...nodes);
    
    process.stdout.write(`   Page ${collectionPage}: ${nodes.length} collections (${allCollections.length} total)\r`);

    if (!collections.pageInfo.hasNextPage) break;
    collectionCursor = collections.pageInfo.endCursor;
  }

  console.log(`\n   ✅ Fetched ${allCollections.length} collections`);

  // Save collections
  const collectionsFile = resolve(backupDir, 'collections.json');
  writeFileSync(collectionsFile, JSON.stringify(allCollections, null, 2));
  console.log(`   💾 Saved to: collections.json`);

  // ─────────────────────────────────────────────────────────────────────────
  // Create backup manifest
  // ─────────────────────────────────────────────────────────────────────────
  const manifest = {
    timestamp: new Date().toISOString(),
    store: config.shopDomain,
    counts: {
      products: allProducts.length,
      collections: allCollections.length,
    },
    files: ['products.json', 'collections.json'],
  };

  const manifestFile = resolve(backupDir, 'manifest.json');
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('📊 BACKUP COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`\n📁 Location: backups/${timestamp}/`);
  console.log(`   📦 products.json     (${allProducts.length} products)`);
  console.log(`   📁 collections.json  (${allCollections.length} collections)`);
  console.log(`   📋 manifest.json     (backup metadata)`);
  console.log('\n✅ You can now safely run the wipe command.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
