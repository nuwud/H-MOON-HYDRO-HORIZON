#!/usr/bin/env npx tsx
/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: buildCompleteImport.ts
 * PURPOSE: Import CSV generation ONLY - converts master_products + images to Shopify CSV
 * 
 * ⚠️  DO NOT ADD: Consolidation logic, scraping code, or Shopify GraphQL mutations
 * ⚠️  DO NOT MERGE: Code from consolidateProducts.ts or scrapeHydroStores.ts
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * Complete Store Import Builder
 * 
 * Builds a comprehensive Shopify import package from:
 * - master_products.json (consolidated WooCommerce + POS data)
 * - Local WooCommerce images (2019-2025 uploads)
 * - category_index_draft.csv (product categories)
 * 
 * Features:
 * - Matches local images to products
 * - Assigns categories from draft CSV
 * - Sets sell-when-OOS for unknown inventory
 * - Generates gap report for fortified scraping
 * 
 * RUN: npx tsx src/cli/buildCompleteImport.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../../');
const CSV_DIR = path.join(BASE_DIR, 'CSVs');
const OUTPUT_DIR = path.join(BASE_DIR, 'outputs');
const UPLOADS_DIR = path.join(BASE_DIR, 'hmoonhydro.com/wp-content/uploads');

// ============================================================================
// TYPES
// ============================================================================

interface ConsolidatedProduct {
  handle: string;
  title: string;
  baseTitle: string;
  descriptionHtml: string;
  vendor: string;
  manufacturer: string;
  productType: string;
  tags: string[];
  options: { name: string; values: string[] }[];
  variants: {
    title: string;
    option1: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    cost: number;
    upc: string;
    weight: number;
    inventoryQty: number;
    wooSku?: string;
    posItemNumber?: string;
  }[];
  images: string[];
  status: 'active' | 'draft';
  sources: { wooCommerce: boolean; pos: boolean };
  confidence: number;
}

interface CategoryEntry {
  key: string;
  sku: string;
  handle: string;
  title: string;
  primary_category: string;
  categories: string;
  brand: string;
}

// ============================================================================
// VARIANT GROUPING - Fix products that should be variants but have separate handles
// ============================================================================

/**
 * Comprehensive size patterns for parsing sizes from product titles
 * Returns { normalized: string, order: number } or null
 */
const SIZE_PARSE_PATTERNS: { pattern: RegExp; normalized: (m: RegExpMatchArray) => string; order: number }[] = [
  // Metric liquid measures - ml
  { pattern: /\b(50)\s*ml\b/i, normalized: () => '50 ml', order: 1 },
  { pattern: /\b(80)\s*ml\b/i, normalized: () => '80 ml', order: 2 },
  { pattern: /\b(100)\s*ml\b/i, normalized: () => '100 ml', order: 3 },
  { pattern: /\b(125)\s*ml\b/i, normalized: () => '125 ml', order: 4 },
  { pattern: /\b(200)\s*ml\b/i, normalized: () => '200 ml', order: 5 },
  { pattern: /\b(250)\s*ml\b/i, normalized: () => '250 ml', order: 6 },
  { pattern: /\b(275)\s*ml\b/i, normalized: () => '275 ml', order: 7 },
  { pattern: /\b(300)\s*ml\b/i, normalized: () => '300 ml', order: 8 },
  { pattern: /\b(500)\s*ml\b/i, normalized: () => '500 ml', order: 10 },
  { pattern: /\b(1000)\s*ml\b/i, normalized: () => '1 L', order: 15 },

  // Metric liquid measures - liters (order matters: longer patterns first!)
  { pattern: /\b(23)[\s-]*(?:l|lt|liter|litre)s?\b/i, normalized: () => '23 L', order: 32 },
  { pattern: /\b(20)[\s-]*(?:l|lt|liter|litre)s?\b/i, normalized: () => '20 L', order: 30 },
  { pattern: /\b(10)[\s-]*(?:l|lt|liter|litre)s?\b/i, normalized: () => '10 L', order: 25 },
  { pattern: /\b(5)[\s-]*(?:l|lt|liter|litre)s?\b/i, normalized: () => '5 L', order: 22 },
  { pattern: /\b(4)[\s-]*(?:l|lt|liter|litre)s?\b/i, normalized: () => '4 L', order: 20 },
  { pattern: /\b(1)[\s-]+(?:l|lt|liter|litre)s?\b/i, normalized: () => '1 L', order: 15 },  // requires space after 1
  { pattern: /\b(1)(?:l|lt)\b/i, normalized: () => '1 L', order: 15 },  // 1l, 1lt (no space)
  { pattern: /(?<!\d[\s-]*)\b(lt|liter|litre)s?\b/i, normalized: () => '1 L', order: 15 },  // standalone "Lt" = 1 L (no number before)

  // US liquid measures
  { pattern: /\b(2)\s*oz\b/i, normalized: () => '2 oz', order: 1 },
  { pattern: /\b(4)\s*oz\b/i, normalized: () => '4 oz', order: 2 },
  { pattern: /\b(6)\s*oz\b/i, normalized: () => '6 oz', order: 3 },
  { pattern: /\b(8)\s*oz\b/i, normalized: () => '8 oz', order: 4 },
  { pattern: /\b(12)\s*oz\b/i, normalized: () => '12 oz', order: 5 },
  { pattern: /\b(16)\s*oz\b/i, normalized: () => '16 oz', order: 6 },
  { pattern: /\b(32)\s*oz\b/i, normalized: () => '32 oz', order: 7 },
  { pattern: /\bpint\b/i, normalized: () => 'Pint', order: 6 },
  { pattern: /\b(?:qt|quart)s?\b/i, normalized: () => 'Quart', order: 10 },
  { pattern: /\b(1\/2|0\.5)\s*gal(?:lon)?s?\b/i, normalized: () => '1/2 Gallon', order: 15 },
  { pattern: /\b(?<![\d.])(gal|gallon)(?:s)?\b(?!\s*\d)/i, normalized: () => 'Gallon', order: 20 },
  { pattern: /\b(1)[\s-]*gal(?:lon)?s?\b/i, normalized: () => 'Gallon', order: 20 },
  { pattern: /\b(2\.5|2\s*1\/2)\s*gal(?:lon)?s?\b/i, normalized: () => '2.5 Gallon', order: 25 },
  { pattern: /\b(5)\s*gal(?:lon)?s?\b/i, normalized: () => '5 Gallon', order: 30 },
  { pattern: /\b(6)\s*gal(?:lon)?s?\b/i, normalized: () => '6 Gallon', order: 32 },
  { pattern: /\b(10)\s*gal(?:lon)?s?\b/i, normalized: () => '10 Gallon', order: 35 },
  { pattern: /\b(15)\s*gal(?:lon)?s?\b/i, normalized: () => '15 Gallon', order: 38 },
  { pattern: /\b(55)\s*gal(?:lon)?s?\b/i, normalized: () => '55 Gallon', order: 40 },

  // Weight measures - grams
  { pattern: /\b(30)\s*g\b/i, normalized: () => '30 g', order: 0.5 },
  { pattern: /\b(40)\s*g\b/i, normalized: () => '40 g', order: 1 },
  { pattern: /\b(50)\s*g\b/i, normalized: () => '50 g', order: 2 },
  { pattern: /\b(56)\s*g\b/i, normalized: () => '56 g', order: 3 },
  { pattern: /\b(90)\s*g\b/i, normalized: () => '90 g', order: 4 },
  { pattern: /\b(112)\s*g\b/i, normalized: () => '112 g', order: 5 },
  { pattern: /\b(130)\s*g\b/i, normalized: () => '130 g', order: 6 },
  { pattern: /\b(224)\s*g\b/i, normalized: () => '224 g', order: 7 },
  { pattern: /\b(300)\s*g\b/i, normalized: () => '300 g', order: 8 },
  { pattern: /\b(400)\s*g\b/i, normalized: () => '400 g', order: 9 },
  { pattern: /\b(500)\s*g\b/i, normalized: () => '500 g', order: 10 },

  // Weight measures - kilograms
  { pattern: /\b(1)\s*kg\b/i, normalized: () => '1 kg', order: 15 },
  { pattern: /\b(2)\s*kg\b/i, normalized: () => '2 kg', order: 18 },
  { pattern: /\b(2\.26)\s*kg\b/i, normalized: () => '2.26 kg', order: 19 },
  { pattern: /\b(2\.5)\s*kg\b/i, normalized: () => '2.5 kg', order: 20 },
  { pattern: /\b(5)\s*kg\b/i, normalized: () => '5 kg', order: 25 },
  { pattern: /\b(10)\s*kg\b/i, normalized: () => '10 kg', order: 30 },

  // Weight measures - pounds
  { pattern: /\b(1)\s*lb\b/i, normalized: () => '1 lb', order: 15 },
  { pattern: /\b(2)\s*lb\b/i, normalized: () => '2 lb', order: 20 },
  { pattern: /\b(5)\s*lb\b/i, normalized: () => '5 lb', order: 25 },
  { pattern: /\b(10)\s*lb\b/i, normalized: () => '10 lb', order: 30 },
  { pattern: /\b(15)\s*lb\b/i, normalized: () => '15 lb', order: 32 },
  { pattern: /\b(20)\s*lb\b/i, normalized: () => '20 lb', order: 35 },
  { pattern: /\b(25)\s*lb\b/i, normalized: () => '25 lb', order: 38 },
  { pattern: /\b(40)\s*lb\b/i, normalized: () => '40 lb', order: 40 },
  { pattern: /\b(50)\s*lb\b/i, normalized: () => '50 lb', order: 45 },

  // Dimensions (inches)
  { pattern: /\b(4)\s*(?:"|inch|in)\b/i, normalized: () => '4 inch', order: 4 },
  { pattern: /\b(6)\s*(?:"|inch|in)\b/i, normalized: () => '6 inch', order: 6 },
  { pattern: /\b(8)\s*(?:"|inch|in)\b/i, normalized: () => '8 inch', order: 8 },
  { pattern: /\b(10)\s*(?:"|inch|in)\b/i, normalized: () => '10 inch', order: 10 },
  { pattern: /\b(12)\s*(?:"|inch|in)\b/i, normalized: () => '12 inch', order: 12 },

  // Wattage
  { pattern: /\b(150)\s*w(?:att)?s?\b/i, normalized: () => '150W', order: 150 },
  { pattern: /\b(250)\s*w(?:att)?s?\b/i, normalized: () => '250W', order: 250 },
  { pattern: /\b(315)\s*w(?:att)?s?\b/i, normalized: () => '315W', order: 315 },
  { pattern: /\b(400)\s*w(?:att)?s?\b/i, normalized: () => '400W', order: 400 },
  { pattern: /\b(600)\s*w(?:att)?s?\b/i, normalized: () => '600W', order: 600 },
  { pattern: /\b(1000)\s*w(?:att)?s?\b/i, normalized: () => '1000W', order: 1000 },

  // Count-based sizes
  { pattern: /\b(10)\s*ct\b/i, normalized: () => '10 ct', order: 10 },
  { pattern: /\b(25)\s*ct\b/i, normalized: () => '25 ct', order: 25 },
  { pattern: /\b(50)\s*ct\b/i, normalized: () => '50 ct', order: 50 },
  { pattern: /\b(100)\s*ct\b/i, normalized: () => '100 ct', order: 100 },
];

/**
 * Parse size from a product title or variant title
 */
function parseSize(text: string): { normalized: string; order: number } | null {
  for (const { pattern, normalized, order } of SIZE_PARSE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { normalized: normalized(match), order };
    }
  }
  return null;
}

/**
 * Extract base title by removing size tokens
 */
function extractBaseTitleForGrouping(title: string): string {
  let base = title;
  
  // First, normalize common variations before pattern matching
  base = base
    .replace(/(\d+)-liter\b/gi, '$1 L')   // "1-liter" -> "1 L"
    .replace(/(\d+)-litre\b/gi, '$1 L')   // "1-litre" -> "1 L"
    .replace(/(\d+)-l\b/gi, '$1 L')       // "1-l" -> "1 L"
    .replace(/(\d+)-gal\b/gi, '$1 gallon') // "1-gal" -> "1 gallon"
    .replace(/(\d+)-qt\b/gi, '$1 quart'); // "1-qt" -> "1 quart"
  
  // Remove size patterns from title
  for (const { pattern } of SIZE_PARSE_PATTERNS) {
    base = base.replace(pattern, '');
  }
  
  // Also remove common suffix patterns
  base = base
    .replace(/\s*[-–]\s*$/, '')           // trailing dash
    .replace(/\s*\(\s*\)\s*$/, '')        // empty parens
    .replace(/\s*,\s*$/, '')              // trailing comma
    .replace(/\s+/g, ' ')                 // multiple spaces
    .trim();
  
  return base;
}

/**
 * Create a normalized key for grouping
 * Uses ONLY the base title (ignoring vendor) for more aggressive grouping
 */
function createGroupingKey(product: ConsolidatedProduct): string {
  const baseTitle = extractBaseTitleForGrouping(product.title);
  
  // Normalize: lowercase, remove non-alphanumeric
  const normalizedTitle = baseTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Don't use vendor in key - products with same base title but different
  // vendor metadata should still group (they're the same product)
  return normalizedTitle;
}

/**
 * Group products that should be variants of the same parent
 */
function groupProductsIntoVariantFamilies(products: ConsolidatedProduct[]): ConsolidatedProduct[] {
  console.log('\n🔗 Grouping products into variant families...');
  
  // Group by baseTitle + vendor
  const groups = new Map<string, ConsolidatedProduct[]>();
  const ungroupable: ConsolidatedProduct[] = [];
  
  for (const product of products) {
    const size = parseSize(product.title);
    
    // Only group products that have a parseable size
    if (!size) {
      ungroupable.push(product);
      continue;
    }
    
    // DON'T group products that already have multiple variants - they're already consolidated
    if (product.variants.length > 1) {
      console.log(`   ⚠️ Skipping grouping for ${product.handle} - already has ${product.variants.length} variants`);
      ungroupable.push(product);
      continue;
    }
    
    const key = createGroupingKey(product);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(product);
  }
  
  const result: ConsolidatedProduct[] = [];
  let groupedCount = 0;
  let mergedProductCount = 0;
  
  // Track all handles to avoid collisions (ungroupable products keep their handles)
  const usedHandles = new Set<string>(ungroupable.map(p => p.handle));
  
  for (const [key, members] of groups) {
    if (members.length === 1) {
      // Single product - keep as-is but fix its option value
      const product = members[0];
      const size = parseSize(product.title);
      if (size && product.variants.length > 0) {
        product.variants[0].option1 = size.normalized;
        product.options = [{ name: 'Size', values: [size.normalized] }];
      }
      usedHandles.add(product.handle);
      result.push(product);
    } else {
      // Multiple products - merge into one with variants
      groupedCount++;
      mergedProductCount += members.length;
      
      // Sort by size order
      members.sort((a, b) => {
        const sizeA = parseSize(a.title);
        const sizeB = parseSize(b.title);
        return (sizeA?.order || 999) - (sizeB?.order || 999);
      });
      
      // Use first product as base (after sorting)
      const baseProduct = { ...members[0] };
      const baseTitle = extractBaseTitleForGrouping(baseProduct.title);
      
      // Create new handle from base title
      let newHandle = baseTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
      
      // Deduplicate handle if it's already used
      if (usedHandles.has(newHandle)) {
        let suffix = 2;
        while (usedHandles.has(`${newHandle}-${suffix}`)) {
          suffix++;
        }
        const oldHandle = newHandle;
        newHandle = `${newHandle}-${suffix}`;
        console.log(`   ⚠️ Handle collision: "${oldHandle}" → "${newHandle}"`);
      }
      usedHandles.add(newHandle);
      
      baseProduct.handle = newHandle;
      baseProduct.title = baseTitle;
      baseProduct.baseTitle = baseTitle;
      
      // Collect all unique sizes - track best variant per size
      const sizeVariants = new Map<string, { variant: ConsolidatedProduct['variants'][0]; member: ConsolidatedProduct }>();
      
      for (const member of members) {
        const sizeFromTitle = parseSize(member.title);
        
        // For each member's variants, pick the best one per size
        for (const variant of member.variants) {
          // Use variant's existing option1 if valid, otherwise parse from title
          let sizeValue: string;
          if (variant.option1 && variant.option1 !== 'Default' && variant.option1 !== '1 Pc') {
            sizeValue = variant.option1;
          } else {
            sizeValue = sizeFromTitle?.normalized || 'Default';
          }
          
          const existingEntry = sizeVariants.get(sizeValue);
          
          if (!existingEntry) {
            sizeVariants.set(sizeValue, { 
              variant: { ...variant, option1: sizeValue, title: sizeValue },
              member 
            });
          } else {
            // Keep the one with more data (has SKU, has price, has inventory)
            const existingScore = (existingEntry.variant.sku ? 1 : 0) + 
                                  (existingEntry.variant.price > 0 ? 1 : 0) +
                                  (existingEntry.variant.inventoryQty > 0 ? 1 : 0) +
                                  (existingEntry.variant.upc ? 1 : 0);
            const newScore = (variant.sku ? 1 : 0) + 
                            (variant.price > 0 ? 1 : 0) +
                            (variant.inventoryQty > 0 ? 1 : 0) +
                            (variant.upc ? 1 : 0);
            
            if (newScore > existingScore) {
              console.log(`   🔄 Replacing duplicate "${sizeValue}" variant (better data) in ${member.handle}`);
              sizeVariants.set(sizeValue, { 
                variant: { ...variant, option1: sizeValue, title: sizeValue },
                member 
              });
            } else {
              console.log(`   ⚠️ Skipping duplicate size "${sizeValue}" in ${member.handle}`);
            }
          }
        }
        
        // Merge images
        for (const img of member.images) {
          if (!baseProduct.images.includes(img)) {
            baseProduct.images.push(img);
          }
        }
        
        // Use best description
        if (member.descriptionHtml && member.descriptionHtml.length > (baseProduct.descriptionHtml?.length || 0)) {
          baseProduct.descriptionHtml = member.descriptionHtml;
        }
        
        // Merge tags
        for (const tag of member.tags) {
          if (!baseProduct.tags.includes(tag)) {
            baseProduct.tags.push(tag);
          }
        }
        
        // Combine sources
        if (member.sources.wooCommerce) baseProduct.sources.wooCommerce = true;
        if (member.sources.pos) baseProduct.sources.pos = true;
      }
      
      // Sort variants by size order and convert Map to array
      const sortedVariants = Array.from(sizeVariants.entries())
        .sort((a, b) => {
          const sizeA = SIZE_PARSE_PATTERNS.find(p => p.normalized({} as RegExpMatchArray) === a[0]);
          const sizeB = SIZE_PARSE_PATTERNS.find(p => p.normalized({} as RegExpMatchArray) === b[0]);
          return (sizeA?.order || 999) - (sizeB?.order || 999);
        })
        .map(([sizeValue, entry]) => entry.variant);
      
      baseProduct.variants = sortedVariants;
      baseProduct.options = [{ name: 'Size', values: Array.from(sizeVariants.keys()) }];
      
      result.push(baseProduct);
    }
  }
  
  // Add ungroupable products as-is
  result.push(...ungroupable);
  
  console.log(`   📦 Original products: ${products.length}`);
  console.log(`   🔗 Grouped ${mergedProductCount} products into ${groupedCount} variant families`);
  console.log(`   📊 Final product count: ${result.length}`);
  
  return result;
}

// ============================================================================
// DATA CLEANING - Remove corrupted/garbage entries
// ============================================================================

/**
 * Detect and remove corrupted product entries that have:
 * - Description text as title/handle
 * - Extremely long handles (>100 chars with description-like content)
 * - SKUs that contain description text
 * - Titles that start with lowercase (likely parsed incorrectly)
 * - Zero price with no valid SKU
 */
function cleanCorruptedProducts(products: ConsolidatedProduct[]): ConsolidatedProduct[] {
  const clean: ConsolidatedProduct[] = [];
  const removed: { handle: string; reason: string }[] = [];
  
  for (const p of products) {
    let isCorrupted = false;
    let reason = '';
    
    // Handle is too long and looks like description text
    if (p.handle.length > 80 && /was-able-to|laboratories|recommended|description/i.test(p.handle)) {
      isCorrupted = true;
      reason = 'Handle contains description text';
    }
    
    // Title looks like a sentence/paragraph (description mistaken as title)
    if (p.title.length > 100 && /\.\s+[A-Z]/.test(p.title)) {
      isCorrupted = true;
      reason = 'Title contains multiple sentences (likely description)';
    }
    
    // Handle contains HTML-like patterns
    if (/<\/?\w+>/.test(p.handle) || /<\/?\w+>/.test(p.title)) {
      isCorrupted = true;
      reason = 'Contains HTML tags in handle/title';
    }
    
    // SKU is clearly corrupted (contains description-like text)
    const hasCorruptedSku = p.variants.some(v => 
      v.sku && (
        v.sku.includes('From these sources') ||
        v.sku.length > 50 ||
        /professionally|recommended|delivers|provides/i.test(v.sku)
      )
    );
    if (hasCorruptedSku) {
      // Clean the SKU instead of removing product
      for (const v of p.variants) {
        if (v.sku && (v.sku.includes('From these sources') || v.sku.length > 50 || /professionally|recommended/i.test(v.sku))) {
          v.sku = ''; // Clear corrupted SKU
        }
      }
    }
    
    // Title starts with number followed by description (misaligned CSV parsing)
    if (/^\d+-[a-z]+-\d+-[a-z]+-\d+-[a-z]+/.test(p.handle) && p.handle.length > 70) {
      isCorrupted = true;
      reason = 'Handle looks like corrupted CSV data';
    }
    
    if (isCorrupted) {
      removed.push({ handle: p.handle.slice(0, 60), reason });
    } else {
      // Clean the title
      p.title = cleanTitle(p.title);
      clean.push(p);
    }
  }
  
  if (removed.length > 0) {
    console.log(`🧹 Found ${removed.length} corrupted entries:`);
    for (const r of removed.slice(0, 10)) {
      console.log(`   ❌ ${r.handle}... (${r.reason})`);
    }
    if (removed.length > 10) {
      console.log(`   ... and ${removed.length - 10} more`);
    }
  }
  
  return clean;
}

interface LocalImage {
  filename: string;
  relativePath: string;
  year: string;
  month: string;
  normalizedName: string;
  keywords: Set<string>;
}

interface ImageMatch {
  product: ConsolidatedProduct;
  images: { path: string; score: number }[];
}

// Manifest entry from uploadImagesToShopifyFiles.ts
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
  stats: { totalUploaded: number; lastUpdated: string };
}

// ============================================================================
// IMAGE SCANNING & MATCHING
// ============================================================================

// Load WooCommerce image matches
interface WooImageMatches {
  [handle: string]: string[];
}

function loadWooImageMatches(): WooImageMatches {
  const matches: WooImageMatches = {};
  
  // Load primary matches file (has array format)
  const matchesPath = path.join(OUTPUT_DIR, 'woo_image_matches.json');
  if (fs.existsSync(matchesPath)) {
    const primaryMatches = JSON.parse(fs.readFileSync(matchesPath, 'utf-8'));
    for (const [handle, urls] of Object.entries(primaryMatches)) {
      matches[handle] = Array.isArray(urls) ? urls as string[] : [urls as string];
    }
    console.log(`📷 Loaded WooCommerce image matches: ${Object.keys(primaryMatches).length} products`);
  }
  
  // Load expanded URL file (has single URL format)
  const allUrlsPath = path.join(OUTPUT_DIR, 'woo_all_image_urls.json');
  if (fs.existsSync(allUrlsPath)) {
    const allUrls = JSON.parse(fs.readFileSync(allUrlsPath, 'utf-8'));
    let added = 0;
    for (const [handle, url] of Object.entries(allUrls)) {
      if (!matches[handle]) {
        matches[handle] = [url as string];
        added++;
      }
    }
    console.log(`📷 Added ${added} additional WooCommerce URLs from woo_all_image_urls.json`);
  }
  
  if (Object.keys(matches).length === 0) {
    console.log('⚠️  No WooCommerce image matches found');
  }
  
  return matches;
}

// Load files manifest for CDN URL resolution
function loadFilesManifest(): FilesManifest | null {
  const manifestPath = path.join(OUTPUT_DIR, 'files_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`📋 Loaded files manifest: ${Object.keys(manifest.byFilename).length} files`);
    return manifest;
  }
  console.log('⚠️  No files_manifest.json found - images will be local paths');
  return null;
}

// Resolve local image path to CDN URL using manifest
function resolveImageUrl(localPath: string, manifest: FilesManifest | null): string | null {
  if (!manifest) return null;
  
  // Extract filename from path
  const filename = path.basename(localPath);
  
  // Look up by filename
  const entry = manifest.byFilename[filename];
  if (entry) {
    return entry.shopifyUrl;
  }
  
  return null;
}

function scanLocalImages(): LocalImage[] {
  console.log('📷 Scanning local WooCommerce images...');
  const images: LocalImage[] = [];
  
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  
  for (const year of years) {
    const yearDir = path.join(UPLOADS_DIR, year);
    if (!fs.existsSync(yearDir)) continue;
    
    let monthDirs: string[] = [];
    try {
      monthDirs = fs.readdirSync(yearDir).filter(m => /^\d{2}$/.test(m));
    } catch (e) { continue; }
    
    for (const month of monthDirs) {
      const monthDir = path.join(yearDir, month);
      
      try {
        const files = fs.readdirSync(monthDir);
        
        for (const file of files) {
          // Only original images, not thumbnails
          if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) continue;
          if (/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i.test(file)) continue;
          
          const normalizedName = normalizeImageName(file);
          const keywords = new Set(normalizedName.split(/\s+/).filter(w => w.length > 2));
          
          images.push({
            filename: file,
            relativePath: `${year}/${month}/${file}`,
            year,
            month,
            normalizedName,
            keywords,
          });
        }
      } catch (e) {
        // Skip unreadable directories
      }
    }
  }
  
  console.log(`   Found ${images.length} original images\n`);
  return images;
}

function normalizeImageName(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/-+/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchProductToImages(product: ConsolidatedProduct, images: LocalImage[]): { path: string; score: number }[] {
  const productNorm = normalizeText(product.title);
  const productWords = new Set(productNorm.split(/\s+/).filter(w => w.length > 2));
  
  // Also extract brand keywords
  const vendorWords = new Set(
    normalizeText(product.vendor || '').split(/\s+/).filter(w => w.length > 2)
  );
  const manufacturerWords = new Set(
    normalizeText(product.manufacturer || '').split(/\s+/).filter(w => w.length > 2)
  );
  
  // Combine all product keywords
  const allProductWords = new Set([...productWords, ...vendorWords, ...manufacturerWords]);
  
  const matches: { image: LocalImage; score: number }[] = [];
  
  for (const image of images) {
    let score = 0;
    
    // Word overlap scoring
    for (const word of productWords) {
      if (image.keywords.has(word)) score += 1;
    }
    
    // Brand bonus
    for (const word of vendorWords) {
      if (image.keywords.has(word)) score += 0.5;
    }
    for (const word of manufacturerWords) {
      if (image.keywords.has(word)) score += 0.5;
    }
    
    // SKU match bonus
    for (const variant of product.variants) {
      const skuNorm = normalizeText(variant.sku || '');
      if (skuNorm.length >= 4 && image.normalizedName.includes(skuNorm)) {
        score += 3;
      }
    }
    
    // Normalize score
    const normalizedScore = score / Math.max(productWords.size, 1);
    
    if (normalizedScore >= 0.4) { // At least 40% relevance
      matches.push({ image, score: normalizedScore });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, 5).map(m => ({
    path: m.image.relativePath,
    score: m.score,
  }));
}

// ============================================================================
// CATEGORY LOADING
// ============================================================================

// Auto-generated categories from pattern matching
interface AutoCategories {
  [handle: string]: string;
}

function loadAutoCategories(): AutoCategories {
  const autoCatPath = path.join(OUTPUT_DIR, 'auto_categories.json');
  if (fs.existsSync(autoCatPath)) {
    const autoCats = JSON.parse(fs.readFileSync(autoCatPath, 'utf-8'));
    console.log(`📂 Loaded auto-categories: ${Object.keys(autoCats).length} products`);
    return autoCats;
  }
  console.log('⚠️  No auto_categories.json found');
  return {};
}

function loadCategories(): Map<string, CategoryEntry> {
  const categoryFile = path.join(CSV_DIR, 'category_index_draft.csv');
  if (!fs.existsSync(categoryFile)) {
    console.warn('⚠️ Category index not found');
    return new Map();
  }
  
  const content = fs.readFileSync(categoryFile, 'utf-8');
  const lines = content.split('\n');
  const categories = new Map<string, CategoryEntry>();
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    if (values.length < 7) continue;
    
    const entry: CategoryEntry = {
      key: values[0] || '',
      sku: values[1] || '',
      handle: values[2] || '',
      title: values[3] || '',
      primary_category: values[4] || '',
      categories: values[5] || '',
      brand: values[6] || '',
    };
    
    // Index by multiple keys for better matching
    const normalizedTitle = normalizeText(entry.title);
    categories.set(normalizedTitle, entry);
    
    // Also index by key if it's different
    if (entry.key) {
      categories.set(entry.key.toLowerCase(), entry);
    }
  }
  
  console.log(`📁 Loaded ${categories.size} category mappings\n`);
  return categories;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Pattern-based category detection for products not in category_index or auto_categories
const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: 'grow_lights',
    patterns: [
      /\bt[- ]?5\b/i, /\badd-?a-?lamp\b/i, /\brail\b.*\blight/i, /\blamp\b.*\bsystem/i,
      /\blight\s*mover/i, /\bluminaire/i, /\bhid\b.*\blight/i, /\bgrow\s*light/i,
      /\be-?papillon\b/i, /\bgreenpower\s*luminaire/i,
      /\bphilips\s*light/i, /\bplant\s*max\b/i, /\bplantmax\b/i, /\bsunblaster\b/i,
      /\blight\s*stand\b/i, /\blamp\s*stabilizer\b/i, /\brobo-?stick\b/i,
      /\bextender\s*rail\b/i, /\brail\s*only\b/i, /\btrolley\b/i, /\bsnapstand\b/i,
      /\buno.*brilliant/i, /\bbrilliant.*series/i
    ]
  },
  {
    category: 'hid_bulbs',
    patterns: [
      /\bchm\b/i, /\bcmh\b/i, /\bmetal\s*halide/i, /\bhps\b.*\blamp/i, /\bmh\b.*\blamp/i,
      /\btriphosphor\b/i, /\bhigh\s*output.*lamp/i, /\bbulb\b.*\b\d+\s*w/i,
      /\bhigh\s*pressure\s*sodium\b/i, /\b\d+\s*[wW]\s*(?:hps|mh)\b/i, /\b[34]k\b.*\blamp/i,
      /\b600\s*3k\b/i, /\bshps\b/i, /\bhortilux.*\d+.*hps/i, /\bhortilux\b/i
    ]
  },
  {
    category: 'controllers_timers',
    patterns: [
      /\blight\s*switcher/i, /\btimer\b/i, /\bcontroller\b/i, /\bbattery\s*backup/i,
      /\bswitcher\b/i, /\brelay\b/i
    ]
  },
  {
    category: 'containers_pots',
    patterns: [
      /\bmesh\s*basket/i, /\btray\b/i, /\bpot\b/i, /\bcontainer\b/i,
      /\bbucket\b/i, /\bsaucer\b/i, /\bplanter\b/i, /\broot\s*master\b/i,
      /\bgro\s*pro\b/i
    ]
  },
  {
    category: 'propagation',
    patterns: [
      /\brooting\s*block/i, /\bclone\b/i, /\bseedling\b/i, /\bpropagat/i,
      /\brooting\s*gel/i, /\brooting\s*hormone/i, /\bstarter\s*plug/i
    ]
  },
  {
    category: 'irrigation',
    patterns: [
      /\bsprayline/i, /\bdrip\b/i, /\bsplitter\b/i, /\bconnector/i,
      /\bfitting/i, /\btubing\b/i, /\bpump\b/i, /\bbarb\b/i, /\binlet\b/i,
      /\bsubmersible\s*pump/i, /\baquaspinner/i, /\bwaterfarm\b/i, /\bgrowing\s*chamber\b/i,
      /\bwater\s*farm\b/i, /\bhydro.*system\b/i
    ]
  },
  {
    category: 'pest_control',
    patterns: [
      /\bplant\s*wash/i, /\bpest\b/i, /\binsect/i, /\bfungicid/i,
      /\bneem\b/i, /\bazasol/i, /\bpyrethrin/i, /\bdead\s*bug\b/i,
      /\bfogger\b/i, /\bdoktor\s*doom\b/i, /\bcaptain\s*jack/i,
      /\bpm\s*wash\b/i, /\bpower\s*wash\b/i, /\bgreen\s*label.*wash/i, /\bnpk.*wash/i,
      /\bsticky.*trap\b/i, /\bwhitefly\b/i, /\bpoddy\s*mouth\b/i
    ]
  },
  {
    category: 'nutrients',
    patterns: [
      /\bnutri/i, /\bfertiliz/i, /\bbloom\b.*\bboost/i, /\broot\s*stimul/i,
      /\bgrow\s*formula/i, /\bph\s*(?:up|down)\b/i, /\bextract\b/i, /\bbiobud\b/i,
      /\bbiomarine\b/i, /\bbioweed\b/i, /\bcalimagic\b/i, /\bcamg\b/i,
      /\bcarboload\b/i, /\bflavor[- ]?ful\b/i, /\bequinox\b/i, /\bautumn\b/i,
      /\bvegan\s*mix\b/i, /\bflorablend\b/i, /\bfloragro\b/i, /\bflorakleen\b/i,
      /\bfloralicious\b/i, /\bkoolbloom\b/i, /\bmaxibloom\b/i, /\bginormous\b/i,
      /\bhum-?bolt\b/i, /\bhydro[- ]?deuce\b/i, /\bgrow\s*grease\b/i, /\bsugar\s*load\b/i,
      /\bmaxigro\b/i, /\bprozyme\b/i, /\bsledgehammer\b/i, /\brose.*flower\b/i,
      /\bspring\s*\d/i, /\bsummer\s*\d/i, /\bmulti\s*\d/i
    ]
  },
  {
    category: 'accessories',
    patterns: [
      /\bstorage\s*bag/i, /\bbatter(?:y|ies)\b/i, /\baccessor/i, /\breplacement\b/i,
      /\bprobe\b/i, /\bcomponent/i, /\brebuild\s*kit\b/i, /\bo-?ring\b/i,
      /\blid\s*only\b/i, /\bfloat\s*kit\b/i, /\bt-?label/i, /\blabel.*pk\b/i,
      /\bscoop\b/i, /\bplant\s*support/i, /\bdolly/i, /\bpeel.*stick.*zipper\b/i,
      /\bsite\s*plug\b/i, /\bflowmaster\b/i, /\brope\s*ratchet/i
    ]
  },
  {
    category: 'grow_media',
    patterns: [
      /\bcoco\b/i, /\brockwool\b/i, /\bgrow\s*stone/i, /\bperlite\b/i,
      /\bvermiculite\b/i, /\bhydroton\b/i, /\bsubstrate\b/i, /\bbamboo\s*pole/i,
      /\bmycorrhizae\b/i, /\bgypsum\b/i, /\bbamboo.*super\s*pole/i, /\bbond.*bamboo/i
    ]
  },
  {
    category: 'airflow',
    patterns: [
      /\bpedestal\s*fan\b/i, /\boscillating\b/i, /\bexhaust\b/i, /\bbooster\b.*\bfan/i,
      /\bventilation\b/i, /\bduct\s*fan\b/i, /\bq-?max\b/i, /\bultra\s*quiet\s*fan\b/i,
      /\bin-?line\s*blower/i, /\buno.*blower/i, /\b2-?speed.*blower/i
    ]
  },
  {
    category: 'co2',
    patterns: [
      /\bco2\b/i, /\bcarbon\s*dioxide\b/i, /\bco2\s*tank\b/i,
      /\bpropane\b/i, /\bgen.*propane/i, /\bco2\s*gen/i,
      /\bgen-?\d+e?ng?\b/i, /\bnatural\s*gas.*gen/i
    ]
  },
  {
    category: 'ph_meters',
    patterns: [
      /\bec\s*\/?\s*tds\b/i, /\bph\s*meter\b/i, /\bec\s*meter\b/i, /\btds\s*meter\b/i,
      /\bcombo\s*meter\b/i, /\bwaterproof.*meter\b/i, /\bcalibration\s*solution/i,
      /\btds\s*monitor\b/i, /\bgrowboss\b/i, /\bnutradip\b/i, /\bgenesis.*calibration\b/i
    ]
  },
  {
    category: 'grow_room_materials',
    patterns: [
      /\bblock-?ir\b/i, /\binfra-?red\s*barrier\b/i, /\bmylar\b/i, /\breflective\b/i,
      /\bflashgro\b/i
    ]
  },
  {
    category: 'extraction',
    patterns: [
      /\bextractor\b/i, /\bethanol\b/i, /\bbotanical\s*extract/i, /\bclosed[- ]?loop\b/i,
      /\brosin.*press\b/i, /\bsource\s*turbo\b/i, /\bpayload.*kit\b/i, /\bpneumatic.*element\b/i
    ]
  },
  {
    category: 'water_filtration',
    patterns: [
      /\bwater.*filter/i, /\bpurification.*filter/i, /\breverse\s*osmosis/i,
      /\bro\s*system\b/i, /\bwater.*purif/i, /\bfiltration\s*system/i
    ]
  }
];

function detectCategoryByPattern(title: string): string | null {
  const titleLower = title.toLowerCase();
  
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(titleLower)) {
        return category;
      }
    }
  }
  
  return null;
}

function findCategoryForProduct(
  product: ConsolidatedProduct, 
  categories: Map<string, CategoryEntry>,
  autoCategories: AutoCategories
): CategoryEntry | null {
  const productNorm = normalizeText(product.title);
  
  // Priority 1: Exact match in category index
  if (categories.has(productNorm)) {
    return categories.get(productNorm)!;
  }
  
  // Priority 2: Try handle-based key
  const handleKey = `title:${product.handle.replace(/-/g, '')}`;
  if (categories.has(handleKey)) {
    return categories.get(handleKey)!;
  }
  
  // Priority 3: Fuzzy match by word overlap
  const productWords = productNorm.split(/\s+/).filter(w => w.length > 2);
  
  for (const [key, entry] of categories) {
    const keyWords = new Set(key.split(/\s+/).filter(w => w.length > 2));
    
    let matches = 0;
    for (const word of productWords) {
      if (keyWords.has(word)) matches++;
    }
    
    // Match if at least 60% of product words match
    if (matches >= Math.max(2, productWords.length * 0.6)) {
      return entry;
    }
  }
  
  // Priority 4: Use auto-generated category
  if (autoCategories[product.handle]) {
    return {
      key: product.handle,
      sku: '',
      handle: product.handle,
      title: product.title,
      primary_category: autoCategories[product.handle],
      categories: autoCategories[product.handle],
      brand: product.vendor || '',
    };
  }
  
  // Priority 5: Pattern-based detection
  const patternCategory = detectCategoryByPattern(product.title);
  if (patternCategory) {
    return {
      key: product.handle,
      sku: '',
      handle: product.handle,
      title: product.title,
      primary_category: patternCategory,
      categories: patternCategory,
      brand: product.vendor || '',
    };
  }
  
  return null;
}

// ============================================================================
// ENHANCED PRODUCT WITH MATCHED DATA
// ============================================================================

interface EnhancedProduct extends ConsolidatedProduct {
  matchedImages: string[];
  matchedCategory: CategoryEntry | null;
  inventoryPolicy: 'deny' | 'continue';
  qualityScore: number;
}

function enhanceProducts(
  products: ConsolidatedProduct[],
  images: LocalImage[],
  categories: Map<string, CategoryEntry>,
  manifest: FilesManifest | null,
  wooImageMatches: WooImageMatches,
  autoCategories: AutoCategories
): EnhancedProduct[] {
  console.log('🔗 Matching images and categories to products...\n');
  
  let imageMatches = 0;
  let categoryMatches = 0;
  let cdnResolved = 0;
  let wooMatched = 0;
  let existingKept = 0;
  let autoCatUsed = 0;
  
  const enhanced: EnhancedProduct[] = products.map(product => {
    let matchedImages: string[] = [];
    
    // Priority 1: Use existing product images (from Shopify CDN)
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const validExisting = product.images.filter(img => 
        typeof img === 'string' && img && (img.includes('cdn.shopify.com') || img.includes('hmoonhydro.com'))
      );
      if (validExisting.length > 0) {
        matchedImages = validExisting;
        existingKept++;
      }
    }
    
    // Priority 2: Use WooCommerce image matches (resolve to CDN if possible)
    if (matchedImages.length === 0 && wooImageMatches[product.handle]) {
      const wooUrls = wooImageMatches[product.handle];
      for (const wooUrl of wooUrls) {
        // Try to resolve to CDN by extracting filename
        const filename = wooUrl.split('/').pop() || '';
        if (manifest && manifest.byFilename[filename]) {
          matchedImages.push(manifest.byFilename[filename].shopifyUrl);
          cdnResolved++;
        } else {
          // Keep the external URL - Shopify will download it during import
          matchedImages.push(wooUrl);
        }
      }
      if (matchedImages.length > 0) wooMatched++;
    }
    
    // Priority 3: Match from scanned local images
    if (matchedImages.length === 0) {
      const imageResults = matchProductToImages(product, images);
      for (const r of imageResults) {
        const cdnUrl = resolveImageUrl(r.path, manifest);
        if (cdnUrl) {
          matchedImages.push(cdnUrl);
          cdnResolved++;
        } else {
          // Fallback to local path (will need manual handling)
          matchedImages.push(r.path);
        }
      }
    }
    
    if (matchedImages.length > 0) imageMatches++;
    
    // Match category (uses auto-categories as fallback)
    const matchedCategory = findCategoryForProduct(product, categories, autoCategories);
    if (matchedCategory) {
      categoryMatches++;
      if (autoCategories[product.handle]) autoCatUsed++;
    }
    
    // Determine inventory policy
    // If any variant has real inventory > 0, we have accurate data
    const hasRealInventory = product.variants.some(v => v.inventoryQty > 0);
    const inventoryPolicy = hasRealInventory ? 'deny' : 'continue';
    
    // Calculate quality score
    let qualityScore = product.confidence;
    if (matchedImages.length > 0) qualityScore += 10;
    if (matchedCategory) qualityScore += 10;
    if (product.variants.some(v => v.weight > 0)) qualityScore += 5;
    qualityScore = Math.min(100, qualityScore);
    
    return {
      ...product,
      matchedImages,
      matchedCategory,
      inventoryPolicy,
      qualityScore,
    };
  });
  
  console.log(`   📸 Image matches: ${imageMatches}/${products.length} (${(imageMatches/products.length*100).toFixed(1)}%)`);
  console.log(`      - Existing CDN images: ${existingKept}`);
  console.log(`      - WooCommerce matches: ${wooMatched}`);
  console.log(`      - Local file matches: ${cdnResolved}`);
  console.log(`   📁 Category matches: ${categoryMatches}/${products.length} (${(categoryMatches/products.length*100).toFixed(1)}%)`);
  console.log(`      - From auto-categorization: ${autoCatUsed}`);
  
  return enhanced;
}

// ============================================================================
// CSV GENERATION
// ============================================================================

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // CRITICAL: Remove newlines/carriage returns - they break CSV rows
  str = str.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Always escape quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  // Always wrap in quotes for safety (Shopify handles this fine)
  return `"${escaped}"`;
}

/**
 * Clean product title - remove leading dots, extra whitespace, HTML entities
 */
function cleanTitle(title: string | undefined | null): string {
  if (!title) return '';
  let t = title.trim();
  // Remove leading dots (". Product Name" -> "Product Name")
  t = t.replace(/^\.+\s*/, '');
  // Decode common HTML entities
  t = t.replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
  // Remove inline HTML tags from title (but keep content)
  t = t.replace(/<br\s*\/?>/gi, ' ')
       .replace(/<\/?b>/gi, '')
       .replace(/<\/?i>/gi, '')
       .replace(/<\/?strong>/gi, '')
       .replace(/<\/?em>/gi, '');
  // Collapse multiple spaces
  t = t.replace(/\s+/g, ' ').trim();
  // Remove trailing dots/punctuation (". " at end)
  t = t.replace(/[\.\s]+$/, '');
  return t;
}

function isValidImageUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const u = url.trim();
  // Must be a valid https URL
  if (!/^https?:\/\/.+/i.test(u)) return false;
  // Must be either Shopify CDN or WooCommerce source URL
  if (!u.includes('cdn.shopify.com/s/files/') && !u.includes('hmoonhydro.com/')) return false;
  // No spaces or weird chars
  if (u.includes(' ')) return false;
  return true;
}

function clampTitle(s: string | undefined | null, max = 255): string {
  const t = (s || '').trim();
  return t.length > max ? t.slice(0, max - 1).trim() : t;
}

function generateShopifyCSV(products: EnhancedProduct[]): string[] {
  const rows: string[] = [];
  
  // Standard Shopify CSV headers
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
    'SEO Title', 'SEO Description', 'Variant Weight Unit', 'Cost per item', 'Status'
  ];
  rows.push(headers.join(','));
  
  let skippedZeroPriceVariants = 0;
  
  for (const product of products) {
    const productType = product.matchedCategory?.primary_category || product.productType || '';
    
    // Build tags
    const allTags = [
      ...product.tags,
      product.matchedCategory?.categories?.split(',').map(c => c.trim()) || [],
      product.matchedCategory?.brand ? `brand:${product.matchedCategory.brand}` : null,
    ].flat().filter(Boolean) as string[];
    
    // Filter out variants with $0 price
    const validVariants = product.variants.filter(v => v.price && v.price > 0);
    if (validVariants.length === 0) {
      // If ALL variants have $0 price, skip the entire product
      continue;
    }
    
    // Track how many we skipped
    skippedZeroPriceVariants += product.variants.length - validVariants.length;
    
    // First variant row includes product-level data
    for (let varIdx = 0; varIdx < validVariants.length; varIdx++) {
      const variant = validVariants[varIdx];
      const isFirstVariant = varIdx === 0;
      
      // Weight in grams (convert from lbs)
      const weightGrams = Math.round((variant.weight || 0) * 453.592);
      
      // SEO description from HTML description
      const seoDesc = (product.descriptionHtml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      
      // Clean and clamp title to 255 chars (Shopify limit)
      const clampedTitle = clampTitle(cleanTitle(product.title));
      
      // Clean vendor - don't use "Unknown" as vendor
      const vendorRaw = product.vendor || product.manufacturer || '';
      const vendor = vendorRaw === 'Unknown' ? '' : vendorRaw;
      
      // Only include first image if it's a valid CDN URL
      const firstImageUrl = product.matchedImages.length > 0 ? product.matchedImages[0] : '';
      const hasValidFirstImage = isValidImageUrl(firstImageUrl);
      
      const row = [
        escapeCSV(product.handle),
        isFirstVariant ? escapeCSV(clampedTitle) : '""',
        isFirstVariant ? escapeCSV(product.descriptionHtml) : '""',
        isFirstVariant ? escapeCSV(vendor) : '""',
        '""', // Product Category - Shopify auto-maps
        isFirstVariant ? escapeCSV(productType) : '""',
        isFirstVariant ? escapeCSV(allTags.join(', ')) : '""',
        '"TRUE"', // Published
        escapeCSV(product.options.length > 0 ? product.options[0].name : ''),
        escapeCSV(variant.option1 !== 'Default' ? variant.option1 : ''),
        '""', '""', '""', '""', // Option2, Option3
        escapeCSV(variant.sku || ''),
        escapeCSV(String(weightGrams)),
        '"shopify"',
        escapeCSV(String(Math.max(0, variant.inventoryQty))),
        escapeCSV(product.inventoryPolicy),
        '"manual"',
        escapeCSV(variant.price.toFixed(2)),
        escapeCSV(variant.compareAtPrice ? variant.compareAtPrice.toFixed(2) : ''),
        '"TRUE"',
        '"TRUE"',
        escapeCSV(variant.upc || ''),
        isFirstVariant && hasValidFirstImage ? escapeCSV(firstImageUrl) : '""',
        isFirstVariant && hasValidFirstImage ? '"1"' : '""',
        isFirstVariant ? escapeCSV(clampedTitle) : '""',
        '"FALSE"',
        isFirstVariant ? escapeCSV(clampedTitle.slice(0, 70)) : '""',
        isFirstVariant ? escapeCSV(seoDesc) : '""',
        '"lb"',
        escapeCSV(variant.cost ? variant.cost.toFixed(2) : ''),
        '"active"',
      ];
      
      rows.push(row.join(','));
    }
    
    // Additional image rows - ONLY for valid CDN URLs
    for (let imgIdx = 1; imgIdx < product.matchedImages.length; imgIdx++) {
      const imgUrl = product.matchedImages[imgIdx];
      // Skip invalid URLs entirely
      if (!isValidImageUrl(imgUrl)) continue;
      
      const imgRow = new Array(headers.length).fill('""');
      imgRow[0] = escapeCSV(product.handle);
      imgRow[25] = escapeCSV(imgUrl);
      imgRow[26] = escapeCSV(String(imgIdx + 1));
      imgRow[27] = escapeCSV(clampTitle(cleanTitle(product.title)));
      rows.push(imgRow.join(','));
    }
  }
  
  if (skippedZeroPriceVariants > 0) {
    console.log(`   ⚠️  Skipped ${skippedZeroPriceVariants} variants with $0 price`);
  }
  
  return rows;
}

// ============================================================================
// GAP ANALYSIS
// ============================================================================

interface GapReport {
  timestamp: string;
  summary: {
    total: number;
    withImages: number;
    withCategories: number;
    withDescriptions: number;
    withWeight: number;
    withUPC: number;
    withInventory: number;
  };
  needsWeight: { handle: string; title: string; vendor: string }[];
  needsDescription: { handle: string; title: string; vendor: string }[];
  needsDimensions: { handle: string; title: string; vendor: string }[];
  lowQuality: { handle: string; title: string; qualityScore: number }[];
}

function generateGapReport(products: EnhancedProduct[]): GapReport {
  const withImages = products.filter(p => p.matchedImages.length > 0);
  const withCategories = products.filter(p => p.matchedCategory !== null);
  const withDescriptions = products.filter(p => p.descriptionHtml && p.descriptionHtml.length > 50);
  const withWeight = products.filter(p => p.variants.some(v => v.weight > 0));
  const withUPC = products.filter(p => p.variants.some(v => v.upc));
  const withInventory = products.filter(p => p.variants.some(v => v.inventoryQty > 0));
  
  const needsWeight = products
    .filter(p => !p.variants.some(v => v.weight > 0))
    .slice(0, 500)
    .map(p => ({ handle: p.handle, title: p.title, vendor: p.vendor }));
  
  const needsDescription = products
    .filter(p => !p.descriptionHtml || p.descriptionHtml.length < 50)
    .slice(0, 500)
    .map(p => ({ handle: p.handle, title: p.title, vendor: p.vendor }));
  
  const lowQuality = products
    .filter(p => p.qualityScore < 40)
    .sort((a, b) => a.qualityScore - b.qualityScore)
    .slice(0, 200)
    .map(p => ({ handle: p.handle, title: p.title, qualityScore: p.qualityScore }));
  
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: products.length,
      withImages: withImages.length,
      withCategories: withCategories.length,
      withDescriptions: withDescriptions.length,
      withWeight: withWeight.length,
      withUPC: withUPC.length,
      withInventory: withInventory.length,
    },
    needsWeight,
    needsDescription,
    needsDimensions: needsWeight, // Same products typically need dimensions too
    lowQuality,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const useEnriched = args.includes('--enriched') || args.includes('--source=enriched');
  const skipNoPrice = args.includes('--skip-no-price');
  
  console.log('🚀 COMPLETE STORE IMPORT BUILDER');
  console.log('=' .repeat(60));
  console.log('');
  console.log('This script will:');
  console.log('  1. Load consolidated products from master_products.json');
  console.log('  2. Scan WooCommerce images (2019-2025)');
  console.log('  3. Match images to products');
  console.log('  4. Assign categories from category_index_draft.csv');
  console.log('  5. Set inventory policies (sell-when-OOS for unknown)');
  console.log('  6. Generate Shopify import CSV');
  console.log('  7. Create gap report for fortified scraping');
  console.log('');
  
  if (useEnriched) {
    console.log('📌 Using ENRICHED products (master_products_enriched.json)');
  }
  if (skipNoPrice) {
    console.log('📌 Skipping products with no price');
  }
  console.log('');
  
  // 1. Load master products (prefer enriched if available and flag is set)
  let masterPath = path.join(OUTPUT_DIR, 'master_products.json');
  const enrichedPath = path.join(OUTPUT_DIR, 'master_products_enriched.json');
  
  if (useEnriched && fs.existsSync(enrichedPath)) {
    masterPath = enrichedPath;
    console.log('✅ Using enriched products file');
  } else if (useEnriched) {
    console.log('⚠️  Enriched file not found, using master_products.json');
    console.log('   Run: npx tsx src/cli/enrichMasterProducts.ts first\n');
  }
  
  if (!fs.existsSync(masterPath)) {
    console.error('❌ master_products.json not found!');
    console.error('   Run: npx tsx src/cli/consolidateProducts.ts');
    process.exit(1);
  }
  
  let products: ConsolidatedProduct[] = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  console.log(`📦 Loaded ${products.length} products\n`);
  
  // 1.1 Clean corrupted products
  const beforeClean = products.length;
  products = cleanCorruptedProducts(products);
  if (products.length < beforeClean) {
    console.log(`🧹 Removed ${beforeClean - products.length} corrupted products\n`);
  }
  
  // 1.2 Filter out products with no price (if flag is set)
  if (skipNoPrice) {
    const beforePrice = products.length;
    products = products.filter(p => p.variants.some(v => v.price && v.price > 0));
    if (products.length < beforePrice) {
      console.log(`💰 Removed ${beforePrice - products.length} products with no price\n`);
    }
  }
  
  // 1.5 Group products into variant families (fix ungrouped sizes)
  const groupedProducts = groupProductsIntoVariantFamilies(products);
  
  // 2. Scan local images
  const images = scanLocalImages();
  
  // 2.5 Load WooCommerce image matches
  const wooImageMatches = loadWooImageMatches();
  
  // 3. Load categories
  const categories = loadCategories();
  
  // 3.5 Load files manifest (CDN URLs from uploadImagesToShopifyFiles.ts)
  const manifest = loadFilesManifest();
  
  // 3.6 Load auto-generated categories
  const autoCategories = loadAutoCategories();
  
  // 4. Enhance products with images and categories (resolves to CDN URLs if manifest exists)
  const enhanced = enhanceProducts(groupedProducts, images, categories, manifest, wooImageMatches, autoCategories);
  
  // 5. Generate Shopify CSV
  console.log('\n📝 Generating Shopify import CSV...');
  const csvRows = generateShopifyCSV(enhanced);
  
  const csvPath = path.join(OUTPUT_DIR, 'shopify_complete_import.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`   ✅ Saved: ${csvPath}`);
  console.log(`   📊 Total rows: ${csvRows.length - 1}`);
  
  // 6. Generate gap report
  console.log('\n📊 Generating gap report...');
  const gapReport = generateGapReport(enhanced);
  
  const gapPath = path.join(OUTPUT_DIR, 'gap_report.json');
  fs.writeFileSync(gapPath, JSON.stringify(gapReport, null, 2));
  console.log(`   ✅ Saved: ${gapPath}`);
  
  // 7. Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('=' .repeat(60));
  console.log(`   Total Products:      ${gapReport.summary.total}`);
  console.log(`   With Images:         ${gapReport.summary.withImages} (${(gapReport.summary.withImages/gapReport.summary.total*100).toFixed(1)}%)`);
  console.log(`   With Categories:     ${gapReport.summary.withCategories} (${(gapReport.summary.withCategories/gapReport.summary.total*100).toFixed(1)}%)`);
  console.log(`   With Descriptions:   ${gapReport.summary.withDescriptions} (${(gapReport.summary.withDescriptions/gapReport.summary.total*100).toFixed(1)}%)`);
  console.log(`   With Weight:         ${gapReport.summary.withWeight} (${(gapReport.summary.withWeight/gapReport.summary.total*100).toFixed(1)}%)`);
  console.log(`   With UPC:            ${gapReport.summary.withUPC} (${(gapReport.summary.withUPC/gapReport.summary.total*100).toFixed(1)}%)`);
  console.log(`   With Inventory:      ${gapReport.summary.withInventory} (${(gapReport.summary.withInventory/gapReport.summary.total*100).toFixed(1)}%)`);
  
  console.log('\n' + '=' .repeat(60));
  console.log('📋 GAPS TO FILL (via fortified scraping):');
  console.log('=' .repeat(60));
  console.log(`   Need Weight:         ${gapReport.needsWeight.length}`);
  console.log(`   Need Description:    ${gapReport.needsDescription.length}`);
  console.log(`   Low Quality (<40):   ${gapReport.lowQuality.length}`);
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 NEXT STEPS:');
  console.log('=' .repeat(60));
  console.log('1. Review shopify_complete_import.csv');
  console.log('2. Upload WooCommerce images to Shopify CDN');
  console.log('3. Update CSV with Shopify image URLs');
  console.log('4. Wipe store: Products → Select All → Delete');
  console.log('5. Import CSV: Products → Import → Upload');
  console.log('6. Run fortified scraper for weight/dimensions');
  console.log('=' .repeat(60));
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
