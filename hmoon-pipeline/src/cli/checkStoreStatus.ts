/**
 * checkStoreStatus.ts
 *
 * Check Shopify store status - products, images, SKUs, and import completeness
 *
 * Usage:
 *   npx tsx src/cli/checkStoreStatus.ts
 */

import {
  loadShopifyConfig,
  paginateGraphQL,
  type ShopifyConfig,
} from '../utils/shopifyAdminGraphql.js';

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number;
  images: { nodes: { url: string }[] };
  variants: { nodes: { sku: string }[] };
}

interface CollectionNode {
  id: string;
  title: string;
  handle: string;
  productsCount: { count: number };
}

const PRODUCTS_QUERY = `
  query($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          images(first: 1) { nodes { url } }
          variants(first: 1) { nodes { sku } }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query($cursor: String) {
    collections(first: 250, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          productsCount { count }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`;

async function main() {
  const config = loadShopifyConfig();
  console.log(`🔍 Checking store: ${config.shopDomain}\n`);

  // Fetch all products
  console.log('Fetching products...');
  const products: ProductNode[] = [];
  for await (const product of paginateGraphQL<ProductNode>(
    config,
    PRODUCTS_QUERY,
    {},
    (data: unknown) => (data as { products: { edges: Array<{ node: ProductNode; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).products
  )) {
    products.push(product);
    if (products.length % 500 === 0) {
      console.log(`  ...fetched ${products.length} products`);
    }
  }

  // Fetch all collections
  console.log('Fetching collections...');
  const collections: CollectionNode[] = [];
  for await (const collection of paginateGraphQL<CollectionNode>(
    config,
    COLLECTIONS_QUERY,
    {},
    (data: unknown) => (data as { collections: { edges: Array<{ node: CollectionNode; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).collections
  )) {
    collections.push(collection);
  }

  // Analyze products
  const withImages = products.filter(p => p.images.nodes.length > 0);
  const withSku = products.filter(p => p.variants.nodes[0]?.sku);
  const active = products.filter(p => p.status === 'ACTIVE');
  const draft = products.filter(p => p.status === 'DRAFT');

  console.log('\n═══════════════════════════════════════════');
  console.log('           SHOPIFY STORE STATUS            ');
  console.log('═══════════════════════════════════════════');
  console.log(`\n📦 PRODUCTS: ${products.length}`);
  console.log(`   ├─ Active: ${active.length}`);
  console.log(`   ├─ Draft:  ${draft.length}`);
  
  if (products.length > 0) {
    console.log(`   ├─ With Images: ${withImages.length} (${(withImages.length / products.length * 100).toFixed(1)}%)`);
    console.log(`   └─ With SKU: ${withSku.length} (${(withSku.length / products.length * 100).toFixed(1)}%)`);
  }

  console.log(`\n📁 COLLECTIONS: ${collections.length}`);
  if (collections.length > 0) {
    const sorted = [...collections].sort((a, b) => b.productsCount.count - a.productsCount.count);
    sorted.slice(0, 10).forEach((c, i) => {
      const prefix = i === Math.min(9, sorted.length - 1) ? '└─' : '├─';
      console.log(`   ${prefix} ${c.title}: ${c.productsCount.count} products`);
    });
    if (collections.length > 10) {
      console.log(`   ... and ${collections.length - 10} more`);
    }
  }

  // Expected counts from CSVs
  const expectedReady = 1260;
  const expectedDraft = 273;
  const expectedTotal = expectedReady + expectedDraft;

  console.log('\n═══════════════════════════════════════════');
  console.log('           IMPORT VERIFICATION             ');
  console.log('═══════════════════════════════════════════');
  console.log(`\nExpected: ${expectedTotal} products (${expectedReady} ready + ${expectedDraft} draft)`);
  console.log(`Actual:   ${products.length} products (${active.length} active + ${draft.length} draft)`);

  if (products.length === 0) {
    console.log('\n⚠️  NO PRODUCTS FOUND - Import did not complete or was not started');
    console.log('\n   Next steps:');
    console.log('   1. Go to Shopify Admin → Products → Import');
    console.log('   2. Upload CSVs/shopify_import_ready.csv');
    console.log('   3. Wait for completion, then upload CSVs/shopify_import_draft.csv');
  } else if (products.length < expectedTotal * 0.5) {
    console.log(`\n⚠️  PARTIAL IMPORT - Only ${(products.length / expectedTotal * 100).toFixed(1)}% imported`);
    console.log(`   Missing approximately ${expectedTotal - products.length} products`);
    console.log('\n   The import may have been interrupted. You can:');
    console.log('   1. Re-import the full CSV (duplicates will be skipped by handle)');
    console.log('   2. Or check Shopify Admin → Settings → Notifications for import status');
  } else if (products.length >= expectedTotal * 0.95) {
    console.log('\n✅ IMPORT APPEARS COMPLETE');
  } else {
    console.log(`\n⚠️  IMPORT ${(products.length / expectedTotal * 100).toFixed(1)}% complete`);
  }

  // Image analysis
  const noImages = products.filter(p => p.images.nodes.length === 0);
  if (products.length > 0) {
    console.log('\n═══════════════════════════════════════════');
    console.log('           IMAGE STATUS                    ');
    console.log('═══════════════════════════════════════════');
    console.log(`\n🖼️  Products WITH images:    ${withImages.length} (${(withImages.length / products.length * 100).toFixed(1)}%)`);
    console.log(`   Products WITHOUT images: ${noImages.length} (${(noImages.length / products.length * 100).toFixed(1)}%)`);
    
    if (noImages.length > 0 && noImages.length === products.length) {
      console.log('\n   ⚠️  NO PRODUCTS HAVE IMAGES');
      console.log('   This typically happens when:');
      console.log('   1. Image URLs in CSV are not publicly accessible');
      console.log('   2. Shopify could not fetch images from the URLs');
      console.log('   3. Image column was empty in the CSV');
    } else if (noImages.length > 0) {
      console.log('\n   Sample products missing images:');
      noImages.slice(0, 10).forEach(p => {
        const title = p.title.length > 50 ? p.title.substring(0, 47) + '...' : p.title;
        console.log(`   - ${title}`);
      });
    }
  }

  // SKU analysis
  const noSku = products.filter(p => !p.variants.nodes[0]?.sku);
  if (noSku.length > 0 && products.length > 0) {
    console.log(`\n📋 Products WITHOUT SKU: ${noSku.length} (${(noSku.length / products.length * 100).toFixed(1)}%)`);
  }

  console.log('\n═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
