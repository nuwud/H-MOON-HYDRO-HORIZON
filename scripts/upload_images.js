/**
 * ════════════════════════════════════════════════════════════════════════════════
 * SHOPIFY IMAGE UPLOADER — Push Scraped Images to Shopify
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * Uploads images found by the scraper to Shopify products via GraphQL API.
 * Supports both URL-based images and local file uploads.
 * 
 * Usage:
 *   node scripts/upload_images.js                    # Upload all found images
 *   node scripts/upload_images.js --limit=50        # Upload 50 products
 *   node scripts/upload_images.js --handle=product  # Upload specific product
 *   node scripts/upload_images.js --dry-run         # Preview without uploading
 *   node scripts/upload_images.js --report          # Show upload status
 * 
 * Prerequisites:
 *   - SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN in .env or environment
 *   - Run image_scraper.js first to populate state file
 * 
 * Spec: IMAGE-002 — Robust Product Image Scraping System
 * ════════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env manually (no external dependencies)
function loadEnv() {
  // Try multiple locations
  const locations = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'hmoon-pipeline', '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'hmoon-pipeline', '.env'),
  ];
  
  for (const envPath of locations) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      console.log(`   Loaded env from: ${envPath}`);
      break;
    }
  }
}
loadEnv();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Shopify API
  SHOPIFY_DOMAIN: process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN,
  SHOPIFY_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN,
  API_VERSION: '2024-01',
  
  // Input/Output paths
  SCRAPE_STATE: './outputs/image_scrape_state.json',
  UPLOAD_STATE: './outputs/image_upload_state.json',
  PRODUCTS_CSV: './CSVs/products_export_final.csv',
  
  // Rate limiting
  REQUEST_DELAY_MS: 500,
  MAX_RETRIES: 3,
  BATCH_SIZE: 10,
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function loadScrapeState() {
  if (!fs.existsSync(CONFIG.SCRAPE_STATE)) {
    console.error('❌ No scrape state found. Run image_scraper.js first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG.SCRAPE_STATE, 'utf-8'));
}

function loadUploadState() {
  if (fs.existsSync(CONFIG.UPLOAD_STATE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.UPLOAD_STATE, 'utf-8'));
    } catch (e) {
      console.log('⚠️  Failed to load upload state, starting fresh');
    }
  }
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    stats: {
      total: 0,
      uploaded: 0,
      failed: 0,
      skipped: 0,
    },
    products: {},
  };
}

function saveUploadState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.UPLOAD_STATE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHOPIFY GRAPHQL API
// ═══════════════════════════════════════════════════════════════════════════════

async function shopifyGraphQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query, variables });
    
    const options = {
      hostname: CONFIG.SHOPIFY_DOMAIN,
      path: `/admin/api/${CONFIG.API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': CONFIG.SHOPIFY_TOKEN,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.errors) {
            reject(new Error(data.errors.map(e => e.message).join(', ')));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════

// Cache for product IDs
const productIdCache = new Map();

async function getProductByHandle(handle) {
  // Check cache first
  if (productIdCache.has(handle)) {
    return productIdCache.get(handle);
  }
  
  const query = `
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
        featuredImage { url }
        images(first: 10) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
      }
    }
  `;
  
  const result = await shopifyGraphQL(query, { handle });
  const product = result.data?.productByHandle;
  
  if (product) {
    productIdCache.set(handle, product);
  }
  
  return product;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

async function uploadImageToProduct(productId, imageUrl, altText = '') {
  // Shopify's productCreateMedia mutation for URL-based images
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image {
              url
              altText
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
      alt: altText,
      mediaContentType: 'IMAGE',
    }],
  };
  
  const result = await shopifyGraphQL(mutation, variables);
  
  if (result.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    const errors = result.data.productCreateMedia.mediaUserErrors;
    throw new Error(errors.map(e => e.message).join(', '));
  }
  
  return result.data?.productCreateMedia?.media?.[0];
}

// Alternative: Update product with image URL directly
async function updateProductImage(productId, imageUrl, altText = '') {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          featuredImage { url }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    input: {
      id: productId,
      images: [{
        src: imageUrl,
        altText: altText,
      }],
    },
  };
  
  const result = await shopifyGraphQL(mutation, variables);
  
  if (result.data?.productUpdate?.userErrors?.length > 0) {
    const errors = result.data.productUpdate.userErrors;
    throw new Error(errors.map(e => e.message).join(', '));
  }
  
  return result.data?.productUpdate?.product;
}

// Upload local file using Shopify's staged uploads API
async function uploadLocalFile(productId, localPath, altText = '') {
  const fileName = path.basename(localPath);
  const fileSize = fs.statSync(localPath).size;
  const mimeType = getMimeType(localPath);
  
  // Step 1: Create a staged upload
  const stagedUploadMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const stagedResult = await shopifyGraphQL(stagedUploadMutation, {
    input: [{
      filename: fileName,
      mimeType: mimeType,
      resource: 'IMAGE',
      fileSize: fileSize.toString(),
      httpMethod: 'POST',
    }],
  });
  
  if (stagedResult.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    const errors = stagedResult.data.stagedUploadsCreate.userErrors;
    throw new Error(`Staged upload failed: ${errors.map(e => e.message).join(', ')}`);
  }
  
  const target = stagedResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error('No staged upload target returned');
  }
  
  // Step 2: Upload file to the staged URL
  const fileContent = fs.readFileSync(localPath);
  await uploadToStagedUrl(target.url, target.parameters, fileName, fileContent, mimeType);
  
  // Step 3: Create product image with the staged URL
  const createMediaMutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image { url }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  
  const createResult = await shopifyGraphQL(createMediaMutation, {
    productId,
    media: [{
      originalSource: target.resourceUrl,
      alt: altText,
      mediaContentType: 'IMAGE',
    }],
  });
  
  if (createResult.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    const errors = createResult.data.productCreateMedia.mediaUserErrors;
    throw new Error(`Media creation failed: ${errors.map(e => e.message).join(', ')}`);
  }
  
  return createResult.data?.productCreateMedia?.media?.[0];
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// Upload file to Shopify's staged upload URL
function uploadToStagedUrl(url, parameters, fileName, fileContent, mimeType) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    // Build multipart form data
    let formData = '';
    
    // Add parameters first
    for (const param of parameters) {
      formData += `--${boundary}\r\n`;
      formData += `Content-Disposition: form-data; name="${param.name}"\r\n\r\n`;
      formData += `${param.value}\r\n`;
    }
    
    // Add file
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    formData += `Content-Type: ${mimeType}\r\n\r\n`;
    
    const formDataPrefix = Buffer.from(formData, 'utf-8');
    const formDataSuffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([formDataPrefix, fileContent, formDataSuffix]);
    
    const parsedUrl = new (require('url').URL)(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
    const req = protocol.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(Buffer.concat(chunks).toString());
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Upload timeout'));
    });
    
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Must be http/https URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  
  // Must look like an image
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) return false;
  
  // Exclude known bad patterns
  if (/placeholder|loading|spinner|icon|logo/i.test(url)) return false;
  
  return true;
}

function isLocalImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return false;
  
  // Check for local file path patterns
  if (imagePath.includes('hmoonhydro.com') && imagePath.includes('wp-content')) return true;
  if (imagePath.includes('\\') || imagePath.startsWith('./')) return true;
  
  return false;
}

function resolveLocalImagePath(imagePath) {
  // Normalize path separators
  let normalized = imagePath.replace(/\\/g, '/');
  
  // Build full path
  const fullPath = path.join(process.cwd(), normalized);
  
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  
  return null;
}

function getImageDimensions(imagePath) {
  // Parse dimensions from filename if present (e.g., image-1200x900.jpg)
  const match = imagePath.match(/-(\d+)x(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  return null;
}

function selectBestImage(images) {
  if (!images || images.length === 0) return null;
  
  // Score and rank images
  const scored = images.map(img => {
    let score = 0;
    const dims = getImageDimensions(img);
    
    // Prefer larger images (up to a point)
    if (dims) {
      if (dims.width >= 1200 || dims.height >= 1200) score += 50;
      else if (dims.width >= 800 || dims.height >= 800) score += 40;
      else if (dims.width >= 400 || dims.height >= 400) score += 20;
      else if (dims.width < 200 || dims.height < 200) score -= 20; // Thumbnails
    }
    
    // Prefer square-ish images
    if (dims && Math.abs(dims.width - dims.height) < dims.width * 0.3) {
      score += 10;
    }
    
    // Penalize thumbnails
    if (/100x100|150x150|50x50|thumbnail/i.test(img)) score -= 30;
    
    // Prefer jpgs over other formats
    if (/\.jpg$/i.test(img)) score += 5;
    
    return { img, score, dims };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored[0]?.img || images[0];
}

function generateAltText(handle, title, vendor) {
  // Clean up title
  let alt = title || handle.replace(/-/g, ' ');
  
  // Add vendor if not already present
  if (vendor && !alt.toLowerCase().includes(vendor.toLowerCase())) {
    alt = `${vendor} ${alt}`;
  }
  
  // Add store branding
  alt += ' | H-Moon Hydro';
  
  // Truncate if too long
  return alt.slice(0, 125);
}

async function uploadProductImages(handle, scrapeData, uploadState, dryRun = false) {
  // Skip if already uploaded
  if (uploadState.products[handle]?.status === 'uploaded') {
    return { status: 'skipped', reason: 'already_uploaded' };
  }
  
  // Get images from scrape state
  const images = scrapeData.foundImages || [];
  if (images.length === 0) {
    return { status: 'skipped', reason: 'no_images' };
  }
  
  // Select best image (prefer larger, square-ish images)
  const selectedImage = selectBestImage(images);
  
  // Determine if it's a URL or local path
  const isUrl = isValidImageUrl(selectedImage);
  const isLocal = isLocalImagePath(selectedImage);
  
  if (!isUrl && !isLocal) {
    return { status: 'skipped', reason: 'no_valid_image' };
  }
  
  // For local files, verify existence
  let localPath = null;
  if (isLocal) {
    localPath = resolveLocalImagePath(selectedImage);
    if (!localPath) {
      return { status: 'skipped', reason: 'local_file_not_found' };
    }
  }
  
  // Look up product in Shopify
  let product;
  try {
    product = await getProductByHandle(handle);
  } catch (e) {
    return { status: 'failed', error: `Lookup failed: ${e.message}` };
  }
  
  if (!product) {
    return { status: 'skipped', reason: 'product_not_found' };
  }
  
  // Skip if product already has images
  if (product.featuredImage || product.images?.edges?.length > 0) {
    return { status: 'skipped', reason: 'already_has_image' };
  }
  
  // Generate alt text
  const altText = generateAltText(handle, scrapeData.title, scrapeData.vendor);
  
  if (dryRun) {
    const source = isUrl ? 'URL' : 'LOCAL';
    const displayPath = isUrl ? selectedImage.slice(0, 60) : path.basename(selectedImage);
    console.log(`   [DRY RUN] Would upload ${source}: ${displayPath}`);
    return { status: 'dry_run', imageUrl: selectedImage, source };
  }
  
  // Upload image
  try {
    console.log(`   📤 Uploading ${isUrl ? 'from URL' : 'local file'}...`);
    
    if (isUrl) {
      await updateProductImage(product.id, selectedImage, altText);
    } else {
      // For local files, use staged upload
      await uploadLocalFile(product.id, localPath, altText);
    }
    
    await delay(CONFIG.REQUEST_DELAY_MS);
    
    return { status: 'uploaded', imageUrl: selectedImage };
  } catch (e) {
    return { status: 'failed', error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function generateReport(scrapeState, uploadState) {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 IMAGE UPLOAD REPORT');
  console.log('═'.repeat(70));
  
  // Scrape status
  console.log('\nScraping Status:');
  console.log(`   Products with images found: ${scrapeState.stats.completed}`);
  console.log(`   Products still pending: ${scrapeState.stats.pending}`);
  
  // Upload status
  console.log('\nUpload Status:');
  console.log(`   Uploaded: ${uploadState.stats.uploaded}`);
  console.log(`   Failed: ${uploadState.stats.failed}`);
  console.log(`   Skipped: ${uploadState.stats.skipped}`);
  
  // Detailed breakdown
  const uploadedProducts = Object.entries(uploadState.products)
    .filter(([_, p]) => p.status === 'uploaded');
  const failedProducts = Object.entries(uploadState.products)
    .filter(([_, p]) => p.status === 'failed');
  
  if (failedProducts.length > 0) {
    console.log('\nFailed Uploads:');
    failedProducts.slice(0, 10).forEach(([handle, data]) => {
      console.log(`   ${handle}: ${data.error}`);
    });
    if (failedProducts.length > 10) {
      console.log(`   ... and ${failedProducts.length - 10} more`);
    }
  }
  
  console.log('═'.repeat(70));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(70));
  console.log('📤 SHOPIFY IMAGE UPLOADER');
  console.log('═'.repeat(70));
  
  // Validate config
  if (!CONFIG.SHOPIFY_DOMAIN || !CONFIG.SHOPIFY_TOKEN) {
    console.error('❌ Missing SHOPIFY_DOMAIN or SHOPIFY_ADMIN_TOKEN in environment');
    console.error('   Add to .env file or set environment variables');
    process.exit(1);
  }
  
  console.log(`   Store: ${CONFIG.SHOPIFY_DOMAIN}`);
  
  const args = process.argv.slice(2);
  const flags = {
    dryRun: args.includes('--dry-run'),
    report: args.includes('--report'),
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0,
    handle: args.find(a => a.startsWith('--handle='))?.split('=')[1],
  };
  
  // Load states
  const scrapeState = loadScrapeState();
  const uploadState = loadUploadState();
  
  console.log(`\n📂 Scrape state: ${scrapeState.stats.completed} products with images`);
  
  // Report only mode
  if (flags.report) {
    generateReport(scrapeState, uploadState);
    return;
  }
  
  // Build queue of products with found images
  let queue = Object.entries(scrapeState.products)
    .filter(([handle, data]) => {
      // Must have found images
      if (data.status !== 'found' || !data.foundImages?.length) return false;
      
      // Skip already uploaded
      if (uploadState.products[handle]?.status === 'uploaded') return false;
      
      // Handle filter
      if (flags.handle && handle !== flags.handle) return false;
      
      return true;
    })
    .map(([handle, data]) => ({ handle, ...data }))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  
  if (flags.limit) {
    queue = queue.slice(0, flags.limit);
  }
  
  console.log(`   Queue: ${queue.length} products to upload`);
  
  if (queue.length === 0) {
    console.log('\n✅ Nothing to upload!');
    generateReport(scrapeState, uploadState);
    return;
  }
  
  if (flags.dryRun) {
    console.log('   (DRY RUN - no actual uploads)');
  }
  
  // Process queue
  console.log('\n🚀 Starting upload...\n');
  
  let processed = 0;
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const product of queue) {
    const { handle, title } = product;
    
    console.log(`📦 [${processed + 1}/${queue.length}] ${(title || handle).slice(0, 50)}...`);
    
    try {
      const result = await uploadProductImages(handle, product, uploadState, flags.dryRun);
      
      // Update state
      uploadState.products[handle] = {
        status: result.status,
        imageUrl: result.imageUrl,
        error: result.error,
        reason: result.reason,
        uploadedAt: result.status === 'uploaded' ? new Date().toISOString() : undefined,
      };
      
      if (result.status === 'uploaded') {
        uploaded++;
        console.log(`   ✅ Uploaded!`);
      } else if (result.status === 'failed') {
        failed++;
        console.log(`   ❌ Failed: ${result.error}`);
      } else {
        skipped++;
        console.log(`   ⏭️  Skipped: ${result.reason}`);
      }
      
    } catch (err) {
      failed++;
      uploadState.products[handle] = {
        status: 'failed',
        error: err.message,
      };
      console.log(`   💥 Error: ${err.message}`);
    }
    
    processed++;
    
    // Save state periodically
    if (processed % 10 === 0) {
      uploadState.stats = { total: processed, uploaded, failed, skipped };
      saveUploadState(uploadState);
      console.log(`\n📈 Progress: ${processed}/${queue.length} (${uploaded} uploaded)\n`);
    }
  }
  
  // Final save
  uploadState.stats = { total: processed, uploaded, failed, skipped };
  saveUploadState(uploadState);
  
  // Report
  generateReport(scrapeState, uploadState);
  
  console.log('\n✅ Upload complete!');
  console.log(`   Processed: ${processed}`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
