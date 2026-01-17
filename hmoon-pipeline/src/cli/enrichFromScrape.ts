#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: enrichFromScrape.ts
 * PURPOSE: Apply scraped product data to Shopify products via GraphQL
 * 
 * Takes scraped data from outputs/scraped/*.json and enriches Shopify products
 * with images, descriptions, and metafields.
 * 
 * Usage:
 *   npx tsx src/cli/enrichFromScrape.ts --source=grease --dry-run
 *   npx tsx src/cli/enrichFromScrape.ts --source=grease --confirm
 *   npx tsx src/cli/enrichFromScrape.ts --source=all --confirm
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const SCRAPED_DIR = path.resolve(OUTPUTS_DIR, 'scraped');
const MANIFEST_PATH = path.resolve(OUTPUTS_DIR, 'files_manifest.json');

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// ============================================================================
// Types
// ============================================================================

interface ScrapedProduct {
  handle: string;
  title: string;
  vendor: string;
  source: string;
  images: {
    main: string;
    gallery: string[];
  };
  description?: string;
  specs?: Record<string, string>;
  scrapedAt: string;
}

interface ScrapeResult {
  source: string;
  scrapedAt: string;
  products: ScrapedProduct[];
  errors: string[];
  stats: {
    total: number;
    withImages: number;
    withDescriptions: number;
  };
}

interface ManifestEntry {
  originalFilename: string;
  shopifyFilename: string;
  sha1: string;
  shopifyUrl: string;
  shopifyFileId: string;
  uploadedAt: string;
  originalPath: string;
  sizeBytes: number;
}

interface FilesManifest {
  byFilename: Record<string, ManifestEntry>;
  bySha1: Record<string, ManifestEntry>;
  stats: {
    totalUploaded: number;
    lastUpdated: string;
  };
}

interface EnrichmentResult {
  handle: string;
  success: boolean;
  changes: string[];
  error?: string;
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'grease';
const isDryRun = !args.includes('--confirm');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// ============================================================================
// Shopify GraphQL Client
// ============================================================================

async function shopifyGraphQL(query: string, variables: Record<string, unknown> = {}): Promise<any> {
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
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  
  return data;
}

// ============================================================================
// Lookup Product by Handle
// ============================================================================

async function getProductByHandle(handle: string): Promise<any> {
  const query = `
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
        descriptionHtml
        images(first: 10) {
          edges {
            node {
              id
              url
            }
          }
        }
      }
    }
  `;
  
  const result = await shopifyGraphQL(query, { handle });
  return result.data?.productByHandle;
}

// ============================================================================
// Update Product
// ============================================================================

async function updateProduct(productId: string, updates: {
  descriptionHtml?: string;
}): Promise<boolean> {
  const query = `
    mutation updateProduct($input: ProductInput!) {
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
  
  const result = await shopifyGraphQL(query, {
    input: {
      id: productId,
      ...updates,
    },
  });
  
  if (result.data?.productUpdate?.userErrors?.length > 0) {
    console.error('Update errors:', result.data.productUpdate.userErrors);
    return false;
  }
  
  return true;
}

// ============================================================================
// Attach Image to Product
// ============================================================================

async function attachImageToProduct(productId: string, imageUrl: string, altText: string): Promise<boolean> {
  const query = `
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
  
  const result = await shopifyGraphQL(query, {
    productId,
    media: [{
      originalSource: imageUrl,
      alt: altText,
      mediaContentType: 'IMAGE',
    }],
  });
  
  if (result.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    console.error('Media errors:', result.data.productCreateMedia.mediaUserErrors);
    return false;
  }
  
  return true;
}

// ============================================================================
// Main Enrichment Logic
// ============================================================================

async function enrichProduct(
  scraped: ScrapedProduct,
  manifest: FilesManifest,
  dryRun: boolean
): Promise<EnrichmentResult> {
  const changes: string[] = [];
  
  // 1. Find product in Shopify
  const product = await getProductByHandle(scraped.handle);
  
  if (!product) {
    return {
      handle: scraped.handle,
      success: false,
      changes: [],
      error: 'Product not found in Shopify',
    };
  }
  
  // 2. Check if image needs updating
  const currentImageCount = product.images.edges.length;
  let imageUrl: string | undefined;
  
  if (scraped.images.main) {
    // Look up in manifest by filename
    const filename = path.basename(scraped.images.main);
    const manifestEntry = manifest.byFilename[filename];
    
    if (manifestEntry) {
      imageUrl = manifestEntry.shopifyUrl;
      changes.push(`Image: ${filename} → CDN`);
    } else {
      changes.push(`Image: ${filename} (not in CDN manifest - needs upload)`);
    }
  }
  
  // 3. Check if description needs updating
  const currentDesc = product.descriptionHtml || '';
  const newDesc = scraped.description;
  
  if (newDesc && (!currentDesc || currentDesc.length < 100)) {
    changes.push(`Description: ${currentDesc.length} chars → ${newDesc.length} chars`);
  }
  
  // 4. Apply changes if not dry run
  if (!dryRun && changes.length > 0) {
    try {
      // Update description if we have one
      if (newDesc && (!currentDesc || currentDesc.length < 100)) {
        await updateProduct(product.id, { descriptionHtml: `<p>${newDesc}</p>` });
      }
      
      // Attach image if we have CDN URL and product has no images
      if (imageUrl && currentImageCount === 0) {
        await attachImageToProduct(product.id, imageUrl, scraped.title);
      }
      
      // Throttle to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (err: any) {
      return {
        handle: scraped.handle,
        success: false,
        changes,
        error: err.message,
      };
    }
  }
  
  return {
    handle: scraped.handle,
    success: true,
    changes,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ENRICH FROM SCRAPE - H-Moon Hydro Pipeline');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing Shopify credentials. Set SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN.');
    process.exit(1);
  }
  
  console.log(`  Source: ${sourceArg}`);
  console.log(`  Dry Run: ${isDryRun}`);
  console.log(`  Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log('');
  
  // Load scraped data
  const scrapePath = path.join(SCRAPED_DIR, `${sourceArg}.json`);
  
  if (!fs.existsSync(scrapePath)) {
    console.error(`❌ Scrape file not found: ${scrapePath}`);
    console.log(`   Run: npm run scrape:${sourceArg} first`);
    process.exit(1);
  }
  
  const scrapeData: ScrapeResult = JSON.parse(fs.readFileSync(scrapePath, 'utf-8'));
  console.log(`  Loaded ${scrapeData.products.length} scraped products\n`);
  
  // Load manifest
  let manifest: FilesManifest = { byFilename: {}, bySha1: {}, stats: { totalUploaded: 0, lastUpdated: '' } };
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    console.log(`  Loaded manifest with ${manifest.stats.totalUploaded} CDN entries\n`);
  } else {
    console.log('  ⚠️  No files_manifest.json found. Images may not have CDN URLs.\n');
  }
  
  // Process products
  const results: EnrichmentResult[] = [];
  const productsToProcess = scrapeData.products.slice(0, limit);
  
  for (let i = 0; i < productsToProcess.length; i++) {
    const product = productsToProcess[i];
    console.log(`[${i + 1}/${productsToProcess.length}] ${product.handle}`);
    
    const result = await enrichProduct(product, manifest, isDryRun);
    results.push(result);
    
    if (result.changes.length > 0) {
      result.changes.forEach(c => console.log(`    ${isDryRun ? '[DRY RUN] ' : ''}${c}`));
    }
    
    if (result.error) {
      console.log(`    ❌ ${result.error}`);
    }
    
    console.log('');
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const withChanges = results.filter(r => r.changes.length > 0);
  
  console.log(`  Processed: ${results.length}`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  With changes: ${withChanges.length}`);
  
  if (isDryRun) {
    console.log('\n  [DRY RUN] No changes applied. Use --confirm to apply.');
  }
  
  // Save log
  const logPath = path.join(OUTPUTS_DIR, `enrichment_${sourceArg}_log.json`);
  fs.writeFileSync(logPath, JSON.stringify({
    source: sourceArg,
    dryRun: isDryRun,
    processedAt: new Date().toISOString(),
    results,
  }, null, 2));
  console.log(`\n  Log saved to: ${logPath}`);
  
  console.log('');
}

main().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
