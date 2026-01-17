/**
 * Upload Replacement Images to Shopify
 * IMAGE-003 Phase 4: Apply Approved Images
 * 
 * Takes approved images from review process and uploads them to Shopify.
 * Uses GraphQL API to update product images.
 */

require('dotenv').config({ path: './hmoon-pipeline/.env' });
const fs = require('fs');
const https = require('https');

// Configuration
const APPROVED_FILE = './outputs/image_approved.json';
const STATE_FILE = './outputs/image_replacement_state.json';
const LOG_FILE = './outputs/image_upload_log.json';

// Shopify Config
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
  console.error('❌ Missing Shopify credentials. Set SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN in hmoon-pipeline/.env');
  process.exit(1);
}

// GraphQL helper
function graphqlRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: SHOPIFY_DOMAIN,
      path: `/admin/api/${API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.errors) {
            reject(new Error(JSON.stringify(result.errors)));
          } else {
            resolve(result.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Get product by handle
async function getProductByHandle(handle) {
  const query = `
    query GetProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
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
  
  const result = await graphqlRequest(query, { handle });
  return result?.productByHandle;
}

// Add image to product via URL
async function addProductImage(productId, imageUrl, altText) {
  const query = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image {
              url
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    productId,
    media: [{
      originalSource: imageUrl,
      alt: altText || '',
      mediaContentType: 'IMAGE'
    }]
  };
  
  return graphqlRequest(query, variables);
}

// Delete existing product images
async function deleteProductImages(productId, imageIds) {
  const query = `
    mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  
  return graphqlRequest(query, { productId, mediaIds: imageIds });
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  const replaceExisting = args.includes('--replace');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;
  
  console.log('═'.repeat(70));
  console.log('📤 UPLOAD REPLACEMENT IMAGES - Phase 4');
  console.log('═'.repeat(70));
  console.log('');
  
  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No changes will be made');
    console.log('   Use --confirm to actually upload images');
    console.log('   Use --replace to delete existing images first');
    console.log('   Use --limit=N to process only N products');
    console.log('');
  }
  
  // Load approved images
  if (!fs.existsSync(APPROVED_FILE)) {
    console.log('❌ Approved file not found. Create it by:');
    console.log('   1. Open outputs/image_review.html in browser');
    console.log('   2. Review and approve images');
    console.log('   3. Click "Export Approved" and save to outputs/image_approved.json');
    process.exit(1);
  }
  
  const approved = JSON.parse(fs.readFileSync(APPROVED_FILE, 'utf-8'));
  const images = approved.images || [];
  
  console.log(`📋 Loaded ${images.length} approved images\n`);
  
  if (images.length === 0) {
    console.log('No images to upload.');
    process.exit(0);
  }
  
  // Process images
  const log = {
    startedAt: new Date().toISOString(),
    dryRun,
    replaceExisting,
    total: images.length,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    results: []
  };
  
  const toProcess = limit > 0 ? images.slice(0, limit) : images;
  
  for (const item of toProcess) {
    log.processed++;
    console.log(`[${log.processed}/${toProcess.length}] ${item.handle}`);
    
    try {
      // Get product from Shopify
      const product = await getProductByHandle(item.handle);
      
      if (!product) {
        console.log(`   ⚠️ Product not found in Shopify`);
        log.skipped++;
        log.results.push({
          handle: item.handle,
          status: 'skipped',
          reason: 'not-found'
        });
        continue;
      }
      
      const existingImages = product.images?.edges?.map(e => e.node) || [];
      
      if (dryRun) {
        console.log(`   ✓ Would upload: ${item.imageUrl.substring(0, 60)}...`);
        if (replaceExisting && existingImages.length > 0) {
          console.log(`   ✓ Would delete ${existingImages.length} existing images`);
        }
        log.success++;
        log.results.push({
          handle: item.handle,
          status: 'dry-run',
          productId: product.id
        });
      } else {
        // Delete existing images if requested
        if (replaceExisting && existingImages.length > 0) {
          const imageIds = existingImages.map(img => img.id);
          try {
            await deleteProductImages(product.id, imageIds);
            console.log(`   🗑️ Deleted ${imageIds.length} existing images`);
          } catch (e) {
            console.log(`   ⚠️ Failed to delete existing: ${e.message}`);
          }
        }
        
        // Upload new image
        const altText = `${product.title} - H-Moon Hydro`;
        const result = await addProductImage(product.id, item.imageUrl, altText);
        
        if (result?.productCreateMedia?.mediaUserErrors?.length > 0) {
          const errors = result.productCreateMedia.mediaUserErrors;
          console.log(`   ❌ Error: ${errors[0].message}`);
          log.failed++;
          log.results.push({
            handle: item.handle,
            status: 'failed',
            error: errors[0].message
          });
        } else {
          console.log(`   ✅ Uploaded successfully`);
          log.success++;
          log.results.push({
            handle: item.handle,
            status: 'success',
            productId: product.id,
            imageUrl: item.imageUrl
          });
        }
      }
      
      // Rate limiting
      await sleep(300);
      
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      log.failed++;
      log.results.push({
        handle: item.handle,
        status: 'error',
        error: err.message
      });
    }
  }
  
  log.completedAt = new Date().toISOString();
  
  // Save log
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  
  // Summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 UPLOAD SUMMARY');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`   Total:    ${log.total}`);
  console.log(`   Processed: ${log.processed}`);
  console.log(`   Success:   ${log.success}`);
  console.log(`   Failed:    ${log.failed}`);
  console.log(`   Skipped:   ${log.skipped}`);
  console.log('');
  console.log(`📄 Log saved: ${LOG_FILE}`);
  
  if (dryRun) {
    console.log('');
    console.log('💡 Run with --confirm to apply changes');
  }
  
  console.log('═'.repeat(70));
}

main().catch(console.error);
