#!/usr/bin/env npx tsx
/**
 * VERIFY IMPORT
 * Check what products exist in Shopify
 */

import { loadShopifyConfig, executeGraphQL } from '../utils/shopifyAdminGraphql.js';

const config = loadShopifyConfig();

const QUERY_PRODUCTS = `
  query products($query: String, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          productType
          status
          images(first: 1) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 1) {
            edges {
              node {
                sku
                price
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const args = process.argv.slice(2);
  const typeArg = args.find(a => a.startsWith('--type='));
  const productType = typeArg ? typeArg.split('=')[1] : null;
  
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 20;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📦 SHOPIFY PRODUCTS');
  console.log('═'.repeat(60));
  
  const query = productType ? `product_type:${productType}` : null;
  
  const result = await executeGraphQL<any>(config, QUERY_PRODUCTS, { 
    query, 
    first: limit 
  });
  
  const products = result.data?.products?.edges || [];
  
  console.log(`\n   Found: ${products.length} products${productType ? ` (type: ${productType})` : ''}\n`);
  
  for (const edge of products) {
    const p = edge.node;
    const v = p.variants?.edges?.[0]?.node;
    const hasImage = p.images?.edges?.length > 0;
    
    console.log(`   ${hasImage ? '🖼️' : '⬜'} ${p.title}`);
    console.log(`      Type: ${p.productType || 'N/A'}`);
    console.log(`      SKU: ${v?.sku || 'N/A'} | Price: $${v?.price || '?'} | Status: ${p.status}`);
    console.log('');
  }
}

main().catch(console.error);
