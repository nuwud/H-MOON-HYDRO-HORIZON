#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: wipeProducts.ts
 * PURPOSE: Delete all products from Shopify store (pre-import wipe)
 * 
 * ⚠️  DO NOT ADD: Import logic, scraping code, or file uploads
 * ⚠️  DO NOT MERGE: Code from buildCompleteImport.ts or uploadImagesToShopifyFiles.ts
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Safely wipes all products from the Shopify store before a clean import.
 * Does NOT delete Files (CDN images) - those are needed for import.
 * 
 * Usage:
 *   npx tsx src/cli/wipeProducts.ts --dry-run           # Preview (default)
 *   npx tsx src/cli/wipeProducts.ts --confirm           # Actually delete
 *   npx tsx src/cli/wipeProducts.ts --confirm --limit=50  # Delete first 50
 *   npx tsx src/cli/wipeProducts.ts --collections       # Also wipe collections
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const wipeCollections = args.includes('--collections');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// ============================================================================
// GraphQL
// ============================================================================

async function graphqlRequest(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} - ${text}`);
  }

  return response.json();
}

// ============================================================================
// Fetch All Product IDs
// ============================================================================

async function fetchAllProductIds(): Promise<string[]> {
  console.log('📦 Fetching all product IDs...');
  
  const ids: string[] = [];
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
          title
        }
      }
    }
  `;
  
  while (hasNextPage) {
    const result = await graphqlRequest(query, { cursor });
    const products = result.data?.products?.nodes || [];
    
    for (const p of products) {
      ids.push(p.id);
    }
    
    hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;
    cursor = result.data?.products?.pageInfo?.endCursor || null;
    
    if (ids.length % 500 === 0 && ids.length > 0) {
      console.log(`   ...fetched ${ids.length} products`);
    }
  }
  
  console.log(`   Total products: ${ids.length}`);
  return ids;
}

// ============================================================================
// Fetch All Collection IDs
// ============================================================================

async function fetchAllCollectionIds(): Promise<string[]> {
  console.log('📁 Fetching all collection IDs...');
  
  const ids: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  
  const query = `
    query GetCollections($cursor: String) {
      collections(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
        }
      }
    }
  `;
  
  while (hasNextPage) {
    const result = await graphqlRequest(query, { cursor });
    const collections = result.data?.collections?.nodes || [];
    
    for (const c of collections) {
      ids.push(c.id);
    }
    
    hasNextPage = result.data?.collections?.pageInfo?.hasNextPage || false;
    cursor = result.data?.collections?.pageInfo?.endCursor || null;
  }
  
  console.log(`   Total collections: ${ids.length}`);
  return ids;
}

// ============================================================================
// Delete Products
// ============================================================================

async function deleteProduct(id: string): Promise<boolean> {
  const mutation = `
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const result = await graphqlRequest(mutation, {
    input: { id }
  });
  
  if (result.data?.productDelete?.userErrors?.length > 0) {
    console.error(`   ❌ Error: ${result.data.productDelete.userErrors[0].message}`);
    return false;
  }
  
  return !!result.data?.productDelete?.deletedProductId;
}

// ============================================================================
// Delete Collections
// ============================================================================

async function deleteCollection(id: string): Promise<boolean> {
  const mutation = `
    mutation collectionDelete($input: CollectionDeleteInput!) {
      collectionDelete(input: $input) {
        deletedCollectionId
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const result = await graphqlRequest(mutation, {
    input: { id }
  });
  
  if (result.data?.collectionDelete?.userErrors?.length > 0) {
    console.error(`   ❌ Error: ${result.data.collectionDelete.userErrors[0].message}`);
    return false;
  }
  
  return !!result.data?.collectionDelete?.deletedCollectionId;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('              SHOPIFY STORE WIPE (Pre-Import Clean)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Validate environment
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing Shopify credentials in .env');
    process.exit(1);
  }

  console.log(`🏪 Store: ${SHOPIFY_DOMAIN}`);
  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will DELETE data'}`);
  if (limit < Infinity) {
    console.log(`📦 Limit: ${limit} items`);
  }
  console.log(`📁 Collections: ${wipeCollections ? 'WILL be deleted' : 'will NOT be deleted'}`);
  console.log();

  // Fetch product IDs
  const productIds = await fetchAllProductIds();
  
  // Fetch collection IDs if requested
  let collectionIds: string[] = [];
  if (wipeCollections) {
    collectionIds = await fetchAllCollectionIds();
  }

  // Summary
  console.log('\n📊 Wipe plan:');
  console.log(`   Products to delete: ${Math.min(productIds.length, limit)}`);
  if (wipeCollections) {
    console.log(`   Collections to delete: ${Math.min(collectionIds.length, limit)}`);
  }
  console.log(`   Files (CDN): ✅ WILL BE KEPT (needed for import)`);
  console.log();

  if (isDryRun) {
    console.log('🔸 DRY RUN - No data will be deleted');
    console.log('   Run with --confirm to delete');
    
    if (productIds.length > 0) {
      console.log('\n   Sample products that would be deleted:');
      // Fetch titles for sample
      const sampleQuery = `
        query GetSample($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
            }
          }
        }
      `;
      const sampleResult = await graphqlRequest(sampleQuery, { 
        ids: productIds.slice(0, 5) 
      });
      const samples = sampleResult.data?.nodes || [];
      samples.forEach((p: any) => console.log(`     - ${p.title}`));
      if (productIds.length > 5) {
        console.log(`     ... and ${productIds.length - 5} more`);
      }
    }
    
    return;
  }

  // ⚠️ LIVE MODE - Actually delete
  console.log('⚠️  STARTING DELETION...\n');
  
  // Save backup of what we're deleting
  const backupPath = path.join(OUTPUTS_DIR, 'wipe_backup.json');
  const backup = {
    timestamp: new Date().toISOString(),
    productIds,
    collectionIds: wipeCollections ? collectionIds : [],
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup saved: ${backupPath}\n`);

  // Delete products
  const productsToDelete = productIds.slice(0, limit);
  let deletedProducts = 0;
  let failedProducts = 0;
  
  console.log(`🗑️  Deleting ${productsToDelete.length} products...`);
  
  for (let i = 0; i < productsToDelete.length; i++) {
    const id = productsToDelete[i];
    const progress = `[${i + 1}/${productsToDelete.length}]`;
    
    const success = await deleteProduct(id);
    if (success) {
      deletedProducts++;
      if (deletedProducts % 50 === 0) {
        console.log(`   ${progress} Deleted ${deletedProducts} products...`);
      }
    } else {
      failedProducts++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`   ✅ Deleted: ${deletedProducts}`);
  if (failedProducts > 0) {
    console.log(`   ❌ Failed: ${failedProducts}`);
  }

  // Delete collections if requested
  let deletedCollections = 0;
  let failedCollections = 0;
  
  if (wipeCollections && collectionIds.length > 0) {
    const collectionsToDelete = collectionIds.slice(0, limit);
    console.log(`\n🗑️  Deleting ${collectionsToDelete.length} collections...`);
    
    for (let i = 0; i < collectionsToDelete.length; i++) {
      const id = collectionsToDelete[i];
      
      const success = await deleteCollection(id);
      if (success) {
        deletedCollections++;
      } else {
        failedCollections++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`   ✅ Deleted: ${deletedCollections}`);
    if (failedCollections > 0) {
      console.log(`   ❌ Failed: ${failedCollections}`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        WIPE SUMMARY                            ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Products deleted: ${deletedProducts}`);
  if (wipeCollections) {
    console.log(`Collections deleted: ${deletedCollections}`);
  }
  console.log(`Files (CDN): ✅ KEPT`);
  console.log(`\n🎯 Next: Import your clean CSV`);
  console.log(`   npx tsx src/cli/buildCompleteImport.ts`);
  console.log(`   Then: Admin → Products → Import → Upload shopify_complete_import.csv`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
