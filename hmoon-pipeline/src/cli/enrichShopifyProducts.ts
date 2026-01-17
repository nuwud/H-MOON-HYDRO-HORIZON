/**
 * enrichShopifyProducts.ts
 * 
 * Enrich Shopify products with data from WooCommerce SQL export:
 * - Descriptions
 * - Weights
 * - Dimensions (if we add custom metafields)
 * 
 * Uses Shopify Admin GraphQL API to update products.
 * 
 * Usage:
 *   npx tsx src/cli/enrichShopifyProducts.ts --dry-run       # Preview changes
 *   npx tsx src/cli/enrichShopifyProducts.ts --confirm       # Apply changes
 *   npx tsx src/cli/enrichShopifyProducts.ts --limit 50      # Process max 50
 *   npx tsx src/cli/enrichShopifyProducts.ts --field desc    # Only descriptions
 *   npx tsx src/cli/enrichShopifyProducts.ts --field weight  # Only weights
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
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
}

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  variants: {
    nodes: {
      id: string;
      inventoryItem: {
        measurement: {
          weight: {
            value: number;
            unit: string;
          } | null;
        } | null;
      } | null;
    }[];
  };
}

interface EnrichResult {
  handle: string;
  productId: string;
  updates: string[];
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query($cursor: String) {
    products(first: 100, after: $cursor) {
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          variants(first: 1) {
            nodes {
              id
              inventoryItem {
                measurement {
                  weight {
                    value
                    unit
                  }
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
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

const UPDATE_VARIANT_MUTATION = `
  mutation productVariantUpdate($input: ProductVariantInput!) {
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

// ─────────────────────────────────────────────────────────────────────────────
// HTML Cleanup
// ─────────────────────────────────────────────────────────────────────────────

function cleanDescription(html: string): string {
  if (!html) return '';
  
  // Basic cleanup - preserve formatting but remove problematic content
  return html
    // Remove WordPress shortcodes
    .replace(/\[.*?\]/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Convert line breaks to proper HTML
    .replace(/<br\s*\/?>/gi, '<br>')
    // Remove empty paragraphs
    .replace(/<p>\s*<\/p>/gi, '')
    // Trim
    .trim();
}

function convertWeightToGrams(weight: string, assumePounds: boolean = true): number {
  const numWeight = parseFloat(weight);
  if (isNaN(numWeight) || numWeight <= 0) return 0;
  
  // WooCommerce typically stores weight in lbs for US stores
  // Shopify uses grams internally
  if (assumePounds) {
    return Math.round(numWeight * 453.592); // lbs to grams
  }
  return Math.round(numWeight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1] || '1000') : 1000;
  const fieldArg = args.find(a => a.startsWith('--field'));
  const fieldFilter = fieldArg ? (fieldArg.split('=')[1] || args[args.indexOf('--field') + 1] || 'all') : 'all';
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         ENRICH SHOPIFY PRODUCTS FROM WOOCOMMERCE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n🔧 Mode: ${dryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will update products'}`);
  console.log(`📦 Limit: ${limit} products`);
  console.log(`🎯 Fields: ${fieldFilter}\n`);
  
  // Load WooCommerce data
  const lookupPath = resolve(CSV_DIR, 'woo_products_lookup.json');
  if (!existsSync(lookupPath)) {
    console.error('❌ woo_products_lookup.json not found. Run parseWooCommerceSQL.ts first.');
    process.exit(1);
  }
  
  const wooLookup: Record<string, WooProduct> = JSON.parse(readFileSync(lookupPath, 'utf-8'));
  console.log(`📂 Loaded ${Object.keys(wooLookup).length} WooCommerce products`);
  
  // Connect to Shopify
  const config = loadShopifyConfig();
  console.log(`🏪 Store: ${config.shopDomain}\n`);
  
  // Fetch all Shopify products
  console.log('📦 Fetching Shopify products...');
  const shopifyProducts: ShopifyProduct[] = [];
  for await (const product of paginateGraphQL<ShopifyProduct>(
    config,
    PRODUCTS_QUERY,
    {},
    (data: unknown) => (data as { products: { edges: Array<{ node: ShopifyProduct; cursor: string }>; pageInfo: { hasNextPage: boolean } } }).products
  )) {
    shopifyProducts.push(product);
    if (shopifyProducts.length % 500 === 0) {
      console.log(`   ...fetched ${shopifyProducts.length} products`);
    }
  }
  console.log(`   Total: ${shopifyProducts.length} products\n`);
  
  // Find products that need enrichment
  const needsEnrichment: Array<{ shopify: ShopifyProduct; woo: WooProduct }> = [];
  
  for (const sp of shopifyProducts) {
    const woo = wooLookup[sp.handle.toLowerCase()];
    if (!woo) continue;
    
    const needs: string[] = [];
    
    // Check description
    if (fieldFilter === 'all' || fieldFilter === 'desc') {
      const currentDesc = sp.descriptionHtml?.trim() || '';
      const wooDesc = cleanDescription(woo.description);
      if (currentDesc.length < 50 && wooDesc.length > 50) {
        needs.push('description');
      }
    }
    
    // Check weight
    if (fieldFilter === 'all' || fieldFilter === 'weight') {
      const currentWeight = sp.variants.nodes[0]?.inventoryItem?.measurement?.weight?.value || 0;
      const wooWeight = convertWeightToGrams(woo.weight);
      if (currentWeight === 0 && wooWeight > 0) {
        needs.push('weight');
      }
    }
    
    if (needs.length > 0) {
      needsEnrichment.push({ shopify: sp, woo });
    }
  }
  
  console.log(`📋 Products needing enrichment: ${needsEnrichment.length}`);
  
  if (needsEnrichment.length === 0) {
    console.log('\n✅ All products already have complete data!');
    return;
  }
  
  // Process products
  const toProcess = needsEnrichment.slice(0, limit);
  console.log(`\n🔄 Processing ${toProcess.length} products...\n`);
  
  const results: EnrichResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const { shopify, woo } = toProcess[i];
    const updates: string[] = [];
    
    // Determine what to update
    const currentDesc = shopify.descriptionHtml?.trim() || '';
    const wooDesc = cleanDescription(woo.description);
    const needsDesc = (fieldFilter === 'all' || fieldFilter === 'desc') && 
                      currentDesc.length < 50 && wooDesc.length > 50;
    
    const currentWeight = shopify.variants.nodes[0]?.inventoryItem?.measurement?.weight?.value || 0;
    const wooWeight = convertWeightToGrams(woo.weight);
    const needsWeight = (fieldFilter === 'all' || fieldFilter === 'weight') && 
                        currentWeight === 0 && wooWeight > 0;
    
    if (dryRun) {
      if (needsDesc) updates.push('description');
      if (needsWeight) updates.push(`weight (${woo.weight} lbs → ${wooWeight}g)`);
      
      console.log(`   ${i + 1}/${toProcess.length} [DRY RUN] ${shopify.title.slice(0, 35)}...`);
      console.log(`      Would update: ${updates.join(', ')}`);
      
      results.push({
        handle: shopify.handle,
        productId: shopify.id,
        updates,
        status: 'skipped',
      });
    } else {
      try {
        // Update product description
        if (needsDesc) {
          const resp = await executeGraphQL(config, UPDATE_PRODUCT_MUTATION, {
            input: {
              id: shopify.id,
              descriptionHtml: wooDesc,
            },
          });
          
          const data = resp.data as { productUpdate?: { userErrors?: { message: string }[] } };
          if (data?.productUpdate?.userErrors?.length) {
            throw new Error(data.productUpdate.userErrors[0].message);
          }
          updates.push('description');
        }
        
        // Update variant weight
        if (needsWeight && shopify.variants.nodes[0]) {
          const resp = await executeGraphQL(config, UPDATE_VARIANT_MUTATION, {
            input: {
              id: shopify.variants.nodes[0].id,
              weight: wooWeight,
              weightUnit: 'GRAMS',
            },
          });
          
          const data = resp.data as { productVariantUpdate?: { userErrors?: { message: string }[] } };
          if (data?.productVariantUpdate?.userErrors?.length) {
            throw new Error(data.productVariantUpdate.userErrors[0].message);
          }
          updates.push('weight');
        }
        
        console.log(`   ${i + 1}/${toProcess.length} ✅ ${shopify.title.slice(0, 35)}... (${updates.join(', ')})`);
        results.push({
          handle: shopify.handle,
          productId: shopify.id,
          updates,
          status: 'success',
        });
        successCount++;
        
        // Rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.log(`   ${i + 1}/${toProcess.length} ❌ ${shopify.title.slice(0, 35)}... - ${(err as Error).message}`);
        results.push({
          handle: shopify.handle,
          productId: shopify.id,
          updates: [],
          status: 'failed',
          error: (err as Error).message,
        });
        failCount++;
      }
    }
  }
  
  // Save results
  const logPath = resolve(CSV_DIR, 'enrich_products_log.json');
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📦 Processed: ${toProcess.length} products`);
  if (dryRun) {
    console.log(`   🔍 Dry run - no changes made`);
  } else {
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
  }
  console.log(`\n📄 Log saved: CSVs/enrich_products_log.json`);
  
  if (dryRun) {
    console.log('\n💡 Run with --confirm to apply changes:');
    console.log('   npx tsx src/cli/enrichShopifyProducts.ts --confirm');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
