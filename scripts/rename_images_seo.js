/**
 * rename_images_seo.js
 * 
 * Implements IMG-001 spec: Rename WooCommerce product images to SEO-friendly names
 * Uses canonical product→image mappings from parseWooCommerceSQL.ts output
 * 
 * Input:
 *   - CSVs/woo_products_full.json (with imagePath and galleryPaths)
 *   - hmoonhydro.com/wp-content/uploads/ (source images)
 * 
 * Output:
 *   - outputs/canonical-images/{handle}-{position}.{ext}
 *   - outputs/canonical-images/manifest.json (old→new mappings)
 * 
 * Usage:
 *   node scripts/rename_images_seo.js [--dry-run] [--force]
 *   
 *   --dry-run   Preview without copying (default)
 *   --force     Actually copy and rename images
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const WORKSPACE_ROOT = path.join(__dirname, '..');
const WOO_PRODUCTS = path.join(WORKSPACE_ROOT, 'CSVs', 'woo_products_full.json');
const WP_UPLOADS = path.join(WORKSPACE_ROOT, 'hmoonhydro.com', 'wp-content', 'uploads');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'outputs', 'canonical-images');
const MANIFEST_FILE = path.join(OUTPUT_DIR, 'manifest.json');

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Convert product title to SEO-friendly handle
 * @param {string} title - Product title
 * @returns {string} URL-safe handle
 */
function titleToHandle(title) {
  if (!title) return 'untitled';
  
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/&/g, '-and-')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')    // Non-alphanumeric → dash
    .replace(/-+/g, '-')            // Multiple dashes → single
    .replace(/^-|-$/g, '')          // Trim leading/trailing dashes
    .slice(0, 50);                  // Max length
}

/**
 * Get file extension from path
 * @param {string} filepath 
 * @returns {string} lowercase extension without dot
 */
function getExtension(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Check if file is a valid image
 * @param {string} filepath 
 * @returns {boolean}
 */
function isValidImage(filepath) {
  const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
  return validExts.includes(getExtension(filepath));
}

/**
 * Check if path is likely a resized variant (contains dimensions)
 * @param {string} filename 
 * @returns {boolean}
 */
function isResizedVariant(filename) {
  // Match patterns like: image-300x300.jpg, image-1024x768.png
  return /-\d+x\d+\.\w+$/.test(filename);
}

/**
 * Generate SEO-friendly alt text for a product image
 * @param {object} product - Product object with title, vendor, sku
 * @param {number} position - Image position (1 = main, 2+ = gallery)
 * @param {string} [context] - Optional context hint
 * @returns {string} Alt text
 */
function generateAltText(product, position, context = '') {
  const title = product.title || 'Product';
  const vendor = product.vendor || '';
  
  // Clean up title for alt text
  let altBase = title
    .replace(/[\[\]\(\)]/g, '')  // Remove brackets
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim();
  
  // Add vendor if not already in title
  if (vendor && !altBase.toLowerCase().includes(vendor.toLowerCase())) {
    altBase = `${vendor} ${altBase}`;
  }
  
  // Position suffix
  let suffix = '';
  if (position === 1) {
    suffix = ' - Main Product Image';
  } else if (position === 2) {
    suffix = ' - Alternate View';
  } else if (position > 2) {
    suffix = ` - Image ${position}`;
  }
  
  // Context additions
  if (context) {
    suffix = ` - ${context}`;
  }
  
  // Shopify alt text limit is 512 chars, keep it reasonable
  const alt = `${altBase}${suffix}`.slice(0, 200);
  
  return alt;
}

// ═══════════════════════════════════════════════════════════════
// Main Logic
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--force');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         IMG-001: SEO-FRIENDLY IMAGE RENAME');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n🔧 Mode: ${dryRun ? 'DRY RUN (use --force to apply)' : '⚠️  LIVE MODE - Files will be copied'}`);
  
  // Load products
  if (!fs.existsSync(WOO_PRODUCTS)) {
    console.error(`\n❌ Products file not found: ${WOO_PRODUCTS}`);
    console.log('   Run: npx tsx hmoon-pipeline/src/cli/parseWooCommerceSQL.ts first');
    process.exit(1);
  }
  
  const products = JSON.parse(fs.readFileSync(WOO_PRODUCTS, 'utf8'));
  console.log(`\n📦 Loaded ${products.length} products`);
  
  // Check uploads folder
  if (!fs.existsSync(WP_UPLOADS)) {
    console.error(`\n❌ WP uploads folder not found: ${WP_UPLOADS}`);
    process.exit(1);
  }
  
  // Create output directory
  if (!dryRun && !fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`\n📁 Created output directory: ${OUTPUT_DIR}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Build rename manifest
  // ═══════════════════════════════════════════════════════════════
  
  const manifest = {
    createdAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'live',
    stats: {
      productsProcessed: 0,
      productsWithImages: 0,
      imagesFound: 0,
      imagesMissing: 0,
      imagesRenamed: 0,
      galleryImagesRenamed: 0
    },
    mappings: [],
    errors: []
  };
  
  const handleCounts = new Map(); // Track used handles for uniqueness
  
  console.log('\n🔄 Processing products...\n');
  
  for (const product of products) {
    manifest.stats.productsProcessed++;
    
    // Skip products without images
    if (!product.imagePath) continue;
    manifest.stats.productsWithImages++;
    
    // Generate base handle
    let baseHandle = titleToHandle(product.title);
    
    // Ensure uniqueness
    const count = handleCounts.get(baseHandle) || 0;
    if (count > 0) {
      baseHandle = `${baseHandle}-${count + 1}`;
    }
    handleCounts.set(baseHandle, count + 1);
    
    // Process main image
    const mainImagePath = path.join(WP_UPLOADS, product.imagePath);
    const mainImageExists = fs.existsSync(mainImagePath);
    
    if (mainImageExists) {
      const ext = getExtension(product.imagePath);
      const newName = `${baseHandle}-1.${ext}`;
      const newPath = path.join(OUTPUT_DIR, newName);
      
      const altText = generateAltText(product, 1);
      
      manifest.mappings.push({
        productId: product.id,
        productTitle: product.title,
        sku: product.sku,
        vendor: product.vendor || '',
        position: 1,
        originalPath: product.imagePath,
        newFilename: newName,
        altText: altText,
        type: 'main'
      });
      
      manifest.stats.imagesFound++;
      manifest.stats.imagesRenamed++;
      
      if (!dryRun) {
        try {
          fs.copyFileSync(mainImagePath, newPath);
        } catch (err) {
          manifest.errors.push({
            productId: product.id,
            path: product.imagePath,
            error: err.message
          });
        }
      }
      
      if (manifest.stats.imagesRenamed <= 10) {
        console.log(`   ✓ ${product.imagePath.split('/').pop()}`);
        console.log(`     → ${newName}`);
      }
    } else {
      manifest.stats.imagesMissing++;
      manifest.errors.push({
        productId: product.id,
        productTitle: product.title,
        path: product.imagePath,
        error: 'File not found'
      });
    }
    
    // Process gallery images
    if (product.galleryPaths && product.galleryPaths.length > 0) {
      let position = 2; // Main image is position 1
      
      for (const galleryPath of product.galleryPaths) {
        const galleryFullPath = path.join(WP_UPLOADS, galleryPath);
        
        if (fs.existsSync(galleryFullPath)) {
          const ext = getExtension(galleryPath);
          const newName = `${baseHandle}-${position}.${ext}`;
          const newPath = path.join(OUTPUT_DIR, newName);
          const galleryAltText = generateAltText(product, position);
          
          manifest.mappings.push({
            productId: product.id,
            productTitle: product.title,
            sku: product.sku,
            vendor: product.vendor || '',
            position: position,
            originalPath: galleryPath,
            newFilename: newName,
            altText: galleryAltText,
            type: 'gallery'
          });
          
          manifest.stats.imagesFound++;
          manifest.stats.galleryImagesRenamed++;
          
          if (!dryRun) {
            try {
              fs.copyFileSync(galleryFullPath, newPath);
            } catch (err) {
              manifest.errors.push({
                productId: product.id,
                path: galleryPath,
                error: err.message
              });
            }
          }
          
          position++;
        } else {
          manifest.stats.imagesMissing++;
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📊 Statistics:`);
  console.log(`   Products processed: ${manifest.stats.productsProcessed}`);
  console.log(`   Products with images: ${manifest.stats.productsWithImages}`);
  console.log(`   Images found: ${manifest.stats.imagesFound}`);
  console.log(`   Images missing: ${manifest.stats.imagesMissing}`);
  console.log(`   Main images renamed: ${manifest.stats.imagesRenamed}`);
  console.log(`   Gallery images renamed: ${manifest.stats.galleryImagesRenamed}`);
  
  if (manifest.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${manifest.errors.length}`);
    manifest.errors.slice(0, 5).forEach(err => {
      console.log(`   - ${err.productTitle || err.productId}: ${err.error}`);
    });
    if (manifest.errors.length > 5) {
      console.log(`   ... and ${manifest.errors.length - 5} more`);
    }
  }
  
  // Save manifest
  if (!dryRun) {
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`\n✅ Manifest saved: ${MANIFEST_FILE}`);
    console.log(`✅ Images copied to: ${OUTPUT_DIR}`);
  } else {
    // Save preview manifest even in dry-run
    const previewManifest = path.join(WORKSPACE_ROOT, 'outputs', 'image-rename-preview.json');
    if (!fs.existsSync(path.dirname(previewManifest))) {
      fs.mkdirSync(path.dirname(previewManifest), { recursive: true });
    }
    fs.writeFileSync(previewManifest, JSON.stringify(manifest, null, 2));
    console.log(`\n📝 Preview manifest saved: ${previewManifest}`);
    console.log(`\n💡 To apply changes, run: node scripts/rename_images_seo.js --force`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
