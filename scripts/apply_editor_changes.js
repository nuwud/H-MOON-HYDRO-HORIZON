/**
 * Apply Product Editor Changes to Shopify
 * EDIT-001: Push edits from product_edits.json to Shopify via GraphQL
 * 
 * Usage:
 *   node scripts/apply_editor_changes.js --dry-run     # Preview only
 *   node scripts/apply_editor_changes.js --confirm     # Actually apply
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Config
const EDITS_FILE = './outputs/product_edits.json';
const RESULTS_FILE = './outputs/shopify_update_results.json';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'h-moon-hydro.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = '2024-01';

const dryRun = !process.argv.includes('--confirm');

// GraphQL helper
async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  
  const data = await response.json();
  
  if (data.errors) {
    throw new Error(data.errors.map(e => e.message).join(', '));
  }
  
  // Check rate limiting
  const cost = data.extensions?.cost;
  if (cost && cost.throttleStatus.currentlyAvailable < 100) {
    const waitMs = Math.ceil((100 - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate * 1000);
    console.log(`   ⏳ Rate limit: waiting ${waitMs}ms`);
    await sleep(waitMs);
  }
  
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get product ID by handle
async function getProductIdByHandle(handle) {
  const query = `
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
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
  
  const data = await shopifyGraphQL(query, { handle });
  return data.data?.productByHandle;
}

// Update product
async function updateProduct(productId, updates) {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const input = {
    id: productId
  };
  
  if (updates.title) input.title = updates.title;
  if (updates.body) input.descriptionHtml = updates.body;
  if (updates.vendor) input.vendor = updates.vendor;
  if (updates.tags) input.tags = updates.tags.split(',').map(t => t.trim());
  if (updates.seoTitle || updates.seoDesc) {
    input.seo = {
      title: updates.seoTitle || undefined,
      description: updates.seoDesc || undefined
    };
  }
  
  const data = await shopifyGraphQL(mutation, { input });
  
  if (data.data?.productUpdate?.userErrors?.length) {
    throw new Error(data.data.productUpdate.userErrors.map(e => e.message).join(', '));
  }
  
  return data.data?.productUpdate?.product;
}

// Add image to product
async function addProductImage(productId, imageUrl, altText) {
  const mutation = `
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
  
  const data = await shopifyGraphQL(mutation, {
    productId,
    media: [{
      originalSource: imageUrl,
      alt: altText || '',
      mediaContentType: 'IMAGE'
    }]
  });
  
  if (data.data?.productCreateMedia?.mediaUserErrors?.length) {
    throw new Error(data.data.productCreateMedia.mediaUserErrors.map(e => e.message).join(', '));
  }
  
  return data.data?.productCreateMedia?.media;
}

// Main
async function main() {
  console.log('═'.repeat(70));
  console.log('📤 APPLY PRODUCT EDITS TO SHOPIFY');
  console.log('═'.repeat(70));
  console.log('');
  
  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No changes will be made');
    console.log('   Use --confirm to actually apply changes');
    console.log('');
  }
  
  if (!SHOPIFY_TOKEN) {
    console.error('❌ Missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_ADMIN_TOKEN');
    process.exit(1);
  }
  
  // Load edits
  if (!fs.existsSync(EDITS_FILE)) {
    console.log('❌ No edits file found: ' + EDITS_FILE);
    console.log('   Export from Product Editor first');
    process.exit(1);
  }
  
  const editsData = JSON.parse(fs.readFileSync(EDITS_FILE, 'utf-8'));
  const edits = editsData.edits || editsData;
  const handles = Object.keys(edits);
  
  console.log(`📋 Found ${handles.length} edited products\n`);
  
  const results = {
    timestamp: new Date().toISOString(),
    dryRun,
    success: [],
    failed: [],
    skipped: []
  };
  
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    const edit = edits[handle];
    
    console.log(`[${i + 1}/${handles.length}] ${edit.title || handle}`);
    
    try {
      // Get product from Shopify
      const product = await getProductIdByHandle(handle);
      
      if (!product) {
        console.log(`   ⚠️ Product not found in Shopify`);
        results.skipped.push({ handle, reason: 'Not found in Shopify' });
        continue;
      }
      
      if (dryRun) {
        console.log(`   ✓ Would update: ${product.title}`);
        if (edit.title !== product.title) console.log(`     - Title: "${edit.title}"`);
        if (edit.body) console.log(`     - Description: ${edit.body.length} chars`);
        if (edit.vendor) console.log(`     - Vendor: ${edit.vendor}`);
        if (edit.images) console.log(`     - Images: ${edit.images.length}`);
        
        results.success.push({ handle, productId: product.id, action: 'would update' });
      } else {
        // Actually update
        await updateProduct(product.id, edit);
        console.log(`   ✅ Updated`);
        
        // Handle new images
        const existingUrls = new Set(product.images.edges.map(e => e.node.url));
        const newImages = (edit.images || []).filter(img => !existingUrls.has(img.src) && img.src.startsWith('http'));
        
        if (newImages.length > 0) {
          console.log(`   📷 Adding ${newImages.length} new images...`);
          for (const img of newImages) {
            try {
              await addProductImage(product.id, img.src, img.alt || edit.title);
              console.log(`      ✓ Added: ${img.src.substring(0, 50)}...`);
            } catch (imgErr) {
              console.log(`      ⚠️ Failed: ${imgErr.message}`);
            }
            await sleep(300);
          }
        }
        
        results.success.push({ handle, productId: product.id, action: 'updated' });
      }
      
      await sleep(200);
      
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.failed.push({ handle, error: err.message });
    }
  }
  
  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`❌ Failed:  ${results.failed.length}`);
  console.log(`⚠️ Skipped: ${results.skipped.length}`);
  console.log('');
  console.log(`📄 Results saved: ${RESULTS_FILE}`);
  
  if (dryRun && results.success.length > 0) {
    console.log('');
    console.log('💡 Run with --confirm to apply these changes');
  }
}

main().catch(console.error);
