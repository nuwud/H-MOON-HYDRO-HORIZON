#!/usr/bin/env npx tsx
/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: importProducts.ts
 * PURPOSE: Import products to Shopify via Admin API (bulk create)
 * 
 * Imports products from the generated CSV using Shopify's Admin GraphQL API.
 * Handles rate limiting, batching, and error recovery.
 * 
 * Usage:
 *   npx tsx src/cli/importProducts.ts --dry-run         # Preview (default)
 *   npx tsx src/cli/importProducts.ts --confirm         # Actually import
 *   npx tsx src/cli/importProducts.ts --confirm --limit=50   # Import first 50
 *   npx tsx src/cli/importProducts.ts --resume          # Resume from last position
 * ════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// CLI Arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const isResume = args.includes('--resume');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// ============================================================================
// CSV PARSING
// ============================================================================

interface CSVRow {
  [key: string]: string;
}

interface Product {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  published: boolean;
  options: { name: string; values: string[] }[];
  variants: Variant[];
  images: { src: string; altText: string; position: number }[];
  seoTitle: string;
  seoDescription: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

interface Variant {
  option1: string;
  option2: string;
  option3: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  weight: number;
  weightUnit: string;
  inventoryQty: number;
  inventoryPolicy: string;
  barcode: string;
  cost: string;
  requiresShipping: boolean;
  taxable: boolean;
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

function loadProductsFromCSV(csvPath: string): Product[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const headerLine = parseCSVLine(lines[0]);
  const headerMap: Record<string, number> = {};
  headerLine.forEach((h, i) => headerMap[h.trim()] = i);
  
  const products: Map<string, Product> = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const get = (key: string) => cols[headerMap[key]] || '';
    
    const handle = get('Handle');
    const title = get('Title');
    
    // Is this a new product row or a variant/image row?
    const isProductRow = title.trim().length > 0;
    
    if (isProductRow) {
      // New product
      const product: Product = {
        handle,
        title,
        bodyHtml: get('Body (HTML)'),
        vendor: get('Vendor'),
        productType: get('Type'),
        tags: get('Tags') ? get('Tags').split(',').map(t => t.trim()) : [],
        published: get('Published') === 'TRUE',
        options: [],
        variants: [],
        images: [],
        seoTitle: get('SEO Title'),
        seoDescription: get('SEO Description'),
        status: get('Status')?.toUpperCase() === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
      };
      
      // Parse options
      const option1Name = get('Option1 Name');
      if (option1Name && option1Name !== 'Title') {
        product.options.push({ name: option1Name, values: [] });
      }
      
      // Add first variant
      const variant = parseVariant(cols, headerMap);
      product.variants.push(variant);
      if (product.options.length > 0 && variant.option1) {
        product.options[0].values.push(variant.option1);
      }
      
      // Add image if present
      const imgSrc = get('Image Src');
      if (imgSrc) {
        product.images.push({
          src: imgSrc,
          altText: get('Image Alt Text') || product.title,
          position: parseInt(get('Image Position')) || 1,
        });
      }
      
      products.set(handle, product);
    } else {
      // Variant or image row for existing product
      const product = products.get(handle);
      if (!product) continue;
      
      const imgSrc = get('Image Src');
      const variantSku = get('Variant SKU');
      const variantPrice = get('Variant Price');
      
      // Is this an image-only row?
      if (imgSrc && !variantPrice) {
        product.images.push({
          src: imgSrc,
          altText: get('Image Alt Text') || product.title,
          position: parseInt(get('Image Position')) || product.images.length + 1,
        });
      } else {
        // Variant row
        const variant = parseVariant(cols, headerMap);
        product.variants.push(variant);
        if (product.options.length > 0 && variant.option1 && !product.options[0].values.includes(variant.option1)) {
          product.options[0].values.push(variant.option1);
        }
      }
    }
  }
  
  return Array.from(products.values());
}

function parseVariant(cols: string[], headerMap: Record<string, number>): Variant {
  const get = (key: string) => cols[headerMap[key]] || '';
  
  return {
    option1: get('Option1 Value'),
    option2: get('Option2 Value'),
    option3: get('Option3 Value'),
    sku: get('Variant SKU'),
    price: get('Variant Price') || '0',
    compareAtPrice: get('Variant Compare At Price'),
    weight: parseFloat(get('Variant Grams')) || 0,
    weightUnit: 'GRAMS',
    inventoryQty: parseInt(get('Variant Inventory Qty')) || 0,
    inventoryPolicy: get('Variant Inventory Policy')?.toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'DENY',
    barcode: get('Variant Barcode'),
    cost: get('Cost per item'),
    requiresShipping: get('Variant Requires Shipping') === 'TRUE',
    taxable: get('Variant Taxable') === 'TRUE',
  };
}

// ============================================================================
// GRAPHQL OPERATIONS
// ============================================================================

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

async function executeGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<GraphQLResponse<T>> {
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
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function createProduct(product: Product): Promise<{ success: boolean; productId?: string; error?: string }> {
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  // Build input
  const input: Record<string, unknown> = {
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.bodyHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags,
    status: product.status,
    seo: {
      title: product.seoTitle || product.title,
      description: product.seoDescription || '',
    },
  };
  
  // Add options if present
  if (product.options.length > 0) {
    input.options = product.options.map(o => o.name);
  }
  
  // Add variants
  input.variants = product.variants.map(v => {
    const variant: Record<string, unknown> = {
      price: v.price || '0',
      sku: v.sku || undefined,
      barcode: v.barcode || undefined,
      weight: v.weight,
      weightUnit: 'GRAMS',
      inventoryPolicy: v.inventoryPolicy,
      requiresShipping: v.requiresShipping,
      taxable: v.taxable,
    };
    
    if (v.compareAtPrice) {
      variant.compareAtPrice = v.compareAtPrice;
    }
    
    // Options
    if (v.option1) variant.options = [v.option1];
    
    return variant;
  });
  
  // Build media (images)
  const media = product.images
    .filter(img => img.src.startsWith('https://'))
    .map(img => ({
      originalSource: img.src,
      alt: img.altText,
      mediaContentType: 'IMAGE' as const,
    }));
  
  try {
    const response = await executeGraphQL<{
      productCreate: {
        product: { id: string; handle: string; title: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(mutation, { input, media: media.length > 0 ? media : undefined });
    
    if (response.errors) {
      return { success: false, error: response.errors[0]?.message };
    }
    
    const result = response.data?.productCreate;
    if (result?.userErrors?.length) {
      return { success: false, error: result.userErrors.map(e => e.message).join(', ') };
    }
    
    if (!result?.product) {
      return { success: false, error: 'No product returned' };
    }
    
    return { success: true, productId: result.product.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

interface ProgressState {
  lastProcessedIndex: number;
  successCount: number;
  failCount: number;
  createdProductIds: string[];
  failedHandles: string[];
  startedAt: string;
  updatedAt: string;
}

const PROGRESS_FILE = path.join(OUTPUT_DIR, 'import_progress.json');

function loadProgress(): ProgressState | null {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveProgress(state: ProgressState): void {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('           SHOPIFY PRODUCT IMPORT');
  console.log('═'.repeat(60));
  console.log('');
  
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing SHOPIFY_DOMAIN or SHOPIFY_ADMIN_TOKEN in .env');
    process.exit(1);
  }
  
  console.log(`🏪 Store: ${SHOPIFY_DOMAIN}`);
  console.log(`🔧 Mode: ${isDryRun ? '👀 DRY RUN (preview only)' : '⚠️  LIVE IMPORT'}`);
  console.log('');
  
  // Load CSV
  const csvPath = path.join(OUTPUT_DIR, 'shopify_complete_import.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV not found:', csvPath);
    console.error('   Run: npx tsx src/cli/buildCompleteImport.ts');
    process.exit(1);
  }
  
  console.log('📦 Loading products from CSV...');
  const products = loadProductsFromCSV(csvPath);
  console.log(`   Found ${products.length} products\n`);
  
  // Skip products with zero price (can't import without price)
  const validProducts = products.filter(p => {
    const hasValidPrice = p.variants.some(v => parseFloat(v.price) > 0);
    return hasValidPrice;
  });
  console.log(`   Valid for import: ${validProducts.length} (with price > 0)`);
  console.log(`   Skipped: ${products.length - validProducts.length} (zero/empty price)\n`);
  
  // Resume from previous state?
  let startIndex = 0;
  let state: ProgressState = {
    lastProcessedIndex: -1,
    successCount: 0,
    failCount: 0,
    createdProductIds: [],
    failedHandles: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  if (isResume) {
    const existingState = loadProgress();
    if (existingState) {
      startIndex = existingState.lastProcessedIndex + 1;
      state = existingState;
      console.log(`📍 Resuming from index ${startIndex}`);
      console.log(`   Previous: ${state.successCount} success, ${state.failCount} failed\n`);
    }
  }
  
  // Apply limit
  const endIndex = Math.min(startIndex + limit, validProducts.length);
  const toProcess = validProducts.slice(startIndex, endIndex);
  
  console.log(`📊 Import plan:`);
  console.log(`   Products to import: ${toProcess.length}`);
  console.log(`   From index: ${startIndex}`);
  console.log(`   To index: ${endIndex - 1}`);
  console.log('');
  
  if (isDryRun) {
    console.log('─'.repeat(60));
    console.log('DRY RUN - Sample products:');
    console.log('─'.repeat(60));
    for (const p of toProcess.slice(0, 5)) {
      console.log(`  ${p.handle}`);
      console.log(`    Title: ${p.title.slice(0, 50)}`);
      console.log(`    Variants: ${p.variants.length}`);
      console.log(`    Price: $${p.variants[0]?.price || 'N/A'}`);
      console.log(`    Images: ${p.images.length}`);
    }
    if (toProcess.length > 5) {
      console.log(`  ... and ${toProcess.length - 5} more`);
    }
    console.log('');
    console.log('Run with --confirm to actually import');
    return;
  }
  
  // Live import
  console.log('─'.repeat(60));
  console.log('🚀 STARTING IMPORT');
  console.log('─'.repeat(60));
  
  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const globalIndex = startIndex + i;
    
    process.stdout.write(`[${globalIndex + 1}/${validProducts.length}] ${product.handle.slice(0, 40).padEnd(40)} `);
    
    const result = await createProduct(product);
    
    if (result.success) {
      state.successCount++;
      state.createdProductIds.push(result.productId!);
      console.log('✅');
    } else {
      state.failCount++;
      state.failedHandles.push(product.handle);
      console.log(`❌ ${result.error?.slice(0, 50)}`);
    }
    
    state.lastProcessedIndex = globalIndex;
    
    // Save progress every 10 products
    if ((i + 1) % 10 === 0) {
      saveProgress(state);
    }
    
    // Rate limiting - 2 requests per second
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Final save
  saveProgress(state);
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 IMPORT COMPLETE');
  console.log('═'.repeat(60));
  console.log(`   ✅ Success: ${state.successCount}`);
  console.log(`   ❌ Failed: ${state.failCount}`);
  console.log('');
  
  if (state.failedHandles.length > 0) {
    console.log('Failed products:');
    state.failedHandles.slice(0, 10).forEach(h => console.log(`   - ${h}`));
    if (state.failedHandles.length > 10) {
      console.log(`   ... and ${state.failedHandles.length - 10} more`);
    }
  }
  
  console.log(`\nProgress saved to: ${PROGRESS_FILE}`);
  if (state.lastProcessedIndex < validProducts.length - 1) {
    console.log('To continue: npx tsx src/cli/importProducts.ts --confirm --resume');
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
