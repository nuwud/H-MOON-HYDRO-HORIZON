#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: matchImages.ts
 * PURPOSE: Image matching ONLY - maps local WooCommerce images to master products
 * 
 * ⚠️  DO NOT ADD: Consolidation logic, scraping code, or Shopify mutations
 * ⚠️  DO NOT MERGE: Code from consolidateProducts.ts or scrapeHydroStores.ts
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Image Matcher for WooCommerce Uploads
 * 
 * Scans the WooCommerce uploads folder (2019-2025) and matches images to products
 * from master_products.json using multiple strategies:
 * 
 * 1. Exact filename match to product handle
 * 2. SKU/UPC embedded in filename
 * 3. Title similarity (normalized)
 * 4. Woo product slug match
 * 
 * Outputs:
 * - outputs/image_matches.json (full match data)
 * - outputs/image_matches_review.csv (for human review)
 * - Updates master_products.json with matched images
 * 
 * RUN: npx tsx src/cli/matchImages.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const WOO_UPLOADS = path.resolve(PROJECT_ROOT, 'hmoonhydro.com/wp-content/uploads');

// Image file extensions to include
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Thumbnail suffixes to skip (we want originals only)
const THUMBNAIL_PATTERN = /-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i;

interface ImageFile {
  filename: string;
  relativePath: string;  // e.g., "2023/06/product-name.webp"
  absolutePath: string;
  normalized: string;    // Cleaned filename for matching
  year: string;
}

interface MasterProduct {
  handle: string;
  title: string;
  baseTitle?: string;
  vendor?: string;
  variants?: Array<{
    sku?: string;
    barcode?: string;
  }>;
  images?: MatchedImage[];  // Updated to use structured type
}

/**
 * Normalized image match structure for consistent pipeline processing
 */
interface MatchedImage {
  source: 'local' | 'remote';
  originalPath: string;      // Relative path from uploads root (e.g., "2019/08/file.jpg")
  absolutePath: string;      // Full filesystem path
  filename: string;          // Basename only
  matchType: 'exact-handle' | 'sku' | 'upc' | 'title-similarity' | 'filename-contains';
  score: number;             // 0-1 confidence score
  normalizedKey: string;     // The handle/title key used for matching
  position: number;          // Image position (1-based)
}

interface ImageMatch {
  productHandle: string;
  productTitle: string;
  image: MatchedImage;       // Full structured image data
}

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric
    .trim();
}

function extractFilenameBase(filename: string): string {
  // Remove extension and any size suffix
  let base = filename.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
  base = base.replace(/-\d+x\d+$/, '');  // Remove thumbnail suffix
  base = base.replace(/-\d+$/, '');      // Remove trailing numbers (image sequence)
  return base;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  // Word-based matching for better accuracy
  const wordsA = a.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const wordsB = b.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  // Exclude very common/generic words that cause false matches
  const genericWords = new Set(['the', 'and', 'for', 'with', 'pro', 'max', 'new', 'air', 'led', 'kit', 'set', 'mix', 'pot', 'all', 'one', 'two', 'pack', 'pump', 'fan', 'meter']);
  
  const filteredA = wordsA.filter(w => !genericWords.has(w) && w.length >= 4);
  const filteredB = wordsB.filter(w => !genericWords.has(w) && w.length >= 4);
  
  if (filteredA.length === 0 || filteredB.length === 0) return 0;
  
  // Count matching words (exact only, no partial)
  let matchCount = 0;
  for (const wA of filteredA) {
    for (const wB of filteredB) {
      if (wA === wB) {
        matchCount++;
        break;
      }
    }
  }
  
  // Require matching words to cover significant portion
  const totalUnique = new Set([...filteredA, ...filteredB]).size;
  return matchCount / totalUnique;
}

function strictSimilarity(filename: string, productHandle: string): number {
  // Normalize both strings for comparison
  const fnNorm = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
  const handleNorm = productHandle.toLowerCase().replace(/-/g, '');
  
  // If handle is fully contained in filename (exact substring), high confidence
  if (fnNorm.includes(handleNorm)) {
    return 1.0;
  }
  
  // Extract key identifying words from handle (4+ chars, not generic)
  const genericWords = new Set([
    'the', 'and', 'for', 'with', 'pro', 'max', 'new', 'air', 'led', 'kit', 'set', 
    'mix', 'pot', 'all', 'one', 'two', 'pack', 'pump', 'fan', 'meter', 'light', 
    'grow', 'plant', 'auto', 'box', 'bag', 'jar', 'can', 'bloom', 'veg', 'base', 
    'plus', 'size', 'candy', 'liquid', 'powder', 'gallon', 'quart', 'liter',
    'soil', 'coco', 'hydro', 'organic', 'natural', 'advanced', 'general', 'complete',
    'full', 'half', 'mini', 'mega', 'super', 'ultra', 'deluxe', 'premium', 'special',
    'original', 'classic', 'starter', 'combo', 'bundle', 'system', 'series', 'line',
    'nutrient', 'nutrients', 'formula', 'solution', 'additive', 'supplement', 'booster'
  ]);
  
  const handleWords = productHandle.toLowerCase().split('-').filter(w => w.length >= 4 && !genericWords.has(w));
  
  // If no meaningful words after filtering, fall back to simple containment check
  if (handleWords.length === 0) {
    // Check if at least the first significant part of handle is in filename
    const firstPart = productHandle.toLowerCase().split('-').find(w => w.length >= 3);
    if (firstPart && fnNorm.includes(firstPart)) {
      return 0.5;  // Low confidence
    }
    return 0;
  }
  
  // Check how many key handle words appear in filename
  let matches = 0;
  for (const hw of handleWords) {
    if (fnNorm.includes(hw)) {
      matches++;
    }
  }
  
  // Require ALL key words to match for high confidence
  // Or at least 2 key words if there are many
  if (handleWords.length === 1) {
    // Single key word: must match AND filename shouldn't be too different
    if (matches === 1 && fnNorm.length < handleNorm.length * 2) {
      return 0.8;
    }
  } else if (matches >= Math.max(2, handleWords.length)) {
    return matches / handleWords.length;
  }
  
  return 0;
}

// ============================================================================
// Image Scanner
// ============================================================================

function scanImages(): ImageFile[] {
  console.log('📷 Scanning WooCommerce uploads...');
  const images: ImageFile[] = [];
  
  // Scan year folders (2019-2025)
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  
  for (const year of years) {
    const yearDir = path.join(WOO_UPLOADS, year);
    if (!fs.existsSync(yearDir)) continue;
    
    // Scan month folders
    const months = fs.readdirSync(yearDir).filter(m => /^\d{2}$/.test(m));
    
    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      
      const files = fs.readdirSync(monthDir);
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        
        // Skip thumbnails
        if (THUMBNAIL_PATTERN.test(file)) continue;
        
        const relativePath = `${year}/${month}/${file}`;
        const absolutePath = path.join(monthDir, file);
        
        images.push({
          filename: file,
          relativePath,
          absolutePath,
          normalized: normalizeForMatching(extractFilenameBase(file)),
          year
        });
      }
    }
  }
  
  console.log(`   Found ${images.length} original images (thumbnails excluded)`);
  return images;
}

// ============================================================================
// Image Matcher
// ============================================================================

function matchImagesToProducts(images: ImageFile[], products: MasterProduct[]): Map<string, ImageMatch[]> {
  console.log('🔍 Matching images to products...');
  
  const matches = new Map<string, ImageMatch[]>();
  
  // Helper to create a structured match
  function createMatch(
    prod: MasterProduct, 
    img: ImageFile, 
    matchType: MatchedImage['matchType'], 
    score: number,
    normalizedKey: string
  ): ImageMatch {
    return {
      productHandle: prod.handle,
      productTitle: prod.title,
      image: {
        source: 'local',
        originalPath: img.relativePath,
        absolutePath: img.absolutePath,
        filename: img.filename,
        matchType,
        score,
        normalizedKey,
        position: 1  // Will be updated when adding to matches
      }
    };
  }
  
  // Build lookup indices
  const imageByNormalized = new Map<string, ImageFile[]>();
  for (const img of images) {
    const existing = imageByNormalized.get(img.normalized) || [];
    existing.push(img);
    imageByNormalized.set(img.normalized, existing);
  }
  
  // Build SKU/UPC lookup from products
  const skuToProduct = new Map<string, MasterProduct>();
  const upcToProduct = new Map<string, MasterProduct>();
  
  for (const prod of products) {
    for (const variant of prod.variants || []) {
      if (variant.sku) {
        skuToProduct.set(normalizeForMatching(variant.sku), prod);
      }
      if (variant.barcode) {
        upcToProduct.set(variant.barcode, prod);
      }
    }
  }
  
  let matched = 0;
  let unmatched = 0;
  
  for (const img of images) {
    let bestMatch: ImageMatch | null = null;
    
    // Strategy 1: Exact handle match
    const normalizedFilename = img.normalized;
    for (const prod of products) {
      const normalizedHandle = normalizeForMatching(prod.handle);
      
      if (normalizedFilename === normalizedHandle) {
        bestMatch = createMatch(prod, img, 'exact-handle', 1.0, normalizedHandle);
        break;
      }
    }
    
    // Strategy 2: SKU in filename (only for SKUs that look like product codes, not simple numbers)
    if (!bestMatch) {
      for (const [sku, prod] of skuToProduct) {
        // Skip short numeric SKUs (too prone to false matches)
        if (/^\d{1,5}$/.test(sku)) continue;
        
        // SKU must be at least 5 chars and contain letters, or be very specific
        if (sku.length >= 5 && /[a-z]/.test(sku) && normalizedFilename.includes(sku)) {
          bestMatch = createMatch(prod, img, 'sku', 0.9, sku);
          break;
        }
      }
    }
    
    // Strategy 3: UPC in filename
    if (!bestMatch) {
      for (const [upc, prod] of upcToProduct) {
        if (upc.length >= 8 && img.filename.includes(upc)) {
          bestMatch = createMatch(prod, img, 'upc', 0.95, upc);
          break;
        }
      }
    }
    
    // Strategy 4: Strict filename-to-handle word matching
    if (!bestMatch) {
      let highestSim = 0;
      let bestProd: MasterProduct | null = null;
      
      for (const prod of products) {
        // Use strict word-based matching
        const sim = strictSimilarity(img.filename, prod.handle);
        
        // Require at least 70% of handle words to be in filename
        if (sim > highestSim && sim >= 0.7) {
          highestSim = sim;
          bestProd = prod;
        }
      }
      
      if (bestProd && highestSim >= 0.7) {
        bestMatch = createMatch(bestProd, img, 'title-similarity', highestSim, bestProd.handle);
      }
    }
    
    // Strategy 5: Filename contains product handle or key words (must match 3+ words)
    if (!bestMatch) {
      for (const prod of products) {
        const handleWords = prod.handle.split('-').filter(w => w.length >= 3);
        const filenameBase = extractFilenameBase(img.filename).toLowerCase();
        const filenameWords = filenameBase.split(/[-_\s]+/).filter(w => w.length >= 3);
        
        // Count matching words
        const matchCount = handleWords.filter(hw => filenameWords.some(fw => fw === hw)).length;
        
        // Require at least 3 matching words AND 70% coverage
        if (matchCount >= 3 && matchCount >= handleWords.length * 0.7) {
          bestMatch = createMatch(prod, img, 'filename-contains', matchCount / handleWords.length, prod.handle);
          break;
        }
      }
    }
    
    if (bestMatch) {
      matched++;
      const existing = matches.get(bestMatch.productHandle) || [];
      bestMatch.image.position = existing.length + 1;
      existing.push(bestMatch);
      matches.set(bestMatch.productHandle, existing);
    } else {
      unmatched++;
    }
  }
  
  console.log(`   Matched: ${matched} images`);
  console.log(`   Unmatched: ${unmatched} images`);
  console.log(`   Products with images: ${matches.size}`);
  
  return matches;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('              IMAGE MATCHER - WooCommerce to Products          ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Load master products
  const masterPath = path.join(OUTPUTS_DIR, 'master_products.json');
  if (!fs.existsSync(masterPath)) {
    console.error('❌ master_products.json not found. Run consolidateProducts.ts first.');
    process.exit(1);
  }
  
  const products: MasterProduct[] = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  console.log(`📦 Loaded ${products.length} products\n`);
  
  // Scan images
  const images = scanImages();
  console.log();
  
  // Match images to products
  const matches = matchImagesToProducts(images, products);
  console.log();
  
  // Save image_matches.json with full structured data
  const matchesObj: Record<string, MatchedImage[]> = {};
  for (const [handle, imgs] of matches) {
    matchesObj[handle] = imgs.map(m => m.image);
  }
  
  const matchesPath = path.join(OUTPUTS_DIR, 'image_matches.json');
  fs.writeFileSync(matchesPath, JSON.stringify(matchesObj, null, 2));
  console.log(`✅ Saved image matches to: outputs/image_matches.json`);
  
  // Save review CSV
  const reviewPath = path.join(OUTPUTS_DIR, 'image_matches_review.csv');
  const csvRows = ['Handle,Title,Filename,Relative Path,Match Type,Score,Position'];
  
  for (const [handle, imgs] of matches) {
    for (const m of imgs) {
      csvRows.push([
        handle,
        `"${m.productTitle.replace(/"/g, '""')}"`,
        m.image.filename,
        m.image.originalPath,
        m.image.matchType,
        m.image.score.toFixed(2),
        m.image.position
      ].join(','));
    }
  }
  
  fs.writeFileSync(reviewPath, csvRows.join('\n'));
  console.log(`✅ Saved review CSV to: outputs/image_matches_review.csv`);
  
  // Update master_products.json with structured images
  let updatedCount = 0;
  for (const prod of products) {
    const prodMatches = matches.get(prod.handle);
    if (prodMatches && prodMatches.length > 0) {
      // Sort by matchType priority, then score
      const typePriority: Record<string, number> = {
        'exact-handle': 1,
        'upc': 2,
        'sku': 3,
        'filename-contains': 4,
        'title-similarity': 5
      };
      prodMatches.sort((a, b) => {
        const typeDiff = (typePriority[a.image.matchType] || 99) - (typePriority[b.image.matchType] || 99);
        if (typeDiff !== 0) return typeDiff;
        return b.image.score - a.image.score;
      });
      prod.images = prodMatches.map(m => m.image);
      updatedCount++;
    }
  }
  
  fs.writeFileSync(masterPath, JSON.stringify(products, null, 2));
  console.log(`✅ Updated ${updatedCount} products in master_products.json with images`);
  
  // Summary stats
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        MATCH SUMMARY                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const matchTypes = new Map<string, number>();
  let totalImages = 0;
  
  for (const imgs of matches.values()) {
    for (const m of imgs) {
      totalImages++;
      matchTypes.set(m.image.matchType, (matchTypes.get(m.image.matchType) || 0) + 1);
    }
  }
  
  console.log(`\nTotal products: ${products.length}`);
  console.log(`Products with images: ${matches.size} (${(matches.size / products.length * 100).toFixed(1)}%)`);
  console.log(`Total matched images: ${totalImages}`);
  console.log(`Average images per matched product: ${(totalImages / matches.size).toFixed(1)}`);
  
  console.log('\nMatch type breakdown:');
  for (const [type, count] of matchTypes) {
    console.log(`  ${type}: ${count} (${(count / totalImages * 100).toFixed(1)}%)`);
  }
  
  // Products without images
  const noImages = products.filter(p => !p.images || p.images.length === 0);
  console.log(`\nProducts still needing images: ${noImages.length}`);
  
  if (noImages.length > 0 && noImages.length <= 20) {
    console.log('  Sample:');
    noImages.slice(0, 10).forEach(p => console.log(`    - ${p.title}`));
  }
  
  console.log('\n✅ Image matching complete!');
}

main().catch(console.error);
