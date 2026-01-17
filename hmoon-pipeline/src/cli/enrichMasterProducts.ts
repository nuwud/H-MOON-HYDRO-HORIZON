#!/usr/bin/env npx tsx
/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: enrichMasterProducts.ts
 * PURPOSE: Enrich master_products.json with data from WooCommerce and POS sources
 * 
 * Fills gaps in:
 * - Descriptions (from WooCommerce)
 * - Prices (from WooCommerce/POS)
 * - Weights (from WooCommerce/POS)
 * - Vendors/Manufacturers (from POS)
 * - UPCs (from POS)
 * - Images (from WooCommerce image IDs)
 * 
 * RUN: npx tsx src/cli/enrichMasterProducts.ts
 * ════════════════════════════════════════════════════════════════════════════════
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

// ============================================================================
// TYPES
// ============================================================================

interface Variant {
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
}

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
  variants: Variant[];
  images: string[];
  status: 'active' | 'draft';
  sources: { wooCommerce: boolean; pos: boolean };
  confidence: number;
}

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

interface POSItem {
  'Item Number': string;
  'Item Name': string;
  'Item Description': string;
  'Regular Price': string;
  'UPC': string;
  'Weight': string;
  'Vendor Name': string;
  'Manufacturer': string;
  'Average Unit Cost': string;
  [key: string]: string;
}

interface EnrichmentStats {
  totalProducts: number;
  enriched: {
    descriptions: number;
    prices: number;
    weights: number;
    vendors: number;
    upcs: number;
    images: number;
  };
  remaining: {
    noPrice: number;
    noDescription: number;
    noWeight: number;
    noVendor: number;
    noImages: number;
  };
}

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTokens(text: string): Set<string> {
  const normalized = normalizeText(text);
  return new Set(normalized.split(' ').filter(t => t.length > 2));
}

function similarity(a: string, b: string): number {
  const tokensA = extractTokens(a);
  const tokensB = extractTokens(b);
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  let matches = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) matches++;
  }
  
  return matches / Math.max(tokensA.size, tokensB.size);
}

// ============================================================================
// LOAD DATA SOURCES
// ============================================================================

function loadMasterProducts(): ConsolidatedProduct[] {
  const masterPath = path.join(OUTPUT_DIR, 'master_products.json');
  if (!fs.existsSync(masterPath)) {
    console.error('❌ master_products.json not found!');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
}

function loadWooCommerceLookup(): Map<string, WooProduct> {
  const wooPath = path.join(CSV_DIR, 'woo_products_lookup.json');
  if (!fs.existsSync(wooPath)) {
    console.log('⚠️  woo_products_lookup.json not found, skipping WooCommerce enrichment');
    return new Map();
  }
  
  const raw = JSON.parse(fs.readFileSync(wooPath, 'utf-8'));
  const lookup = new Map<string, WooProduct>();
  
  for (const [slug, data] of Object.entries(raw)) {
    lookup.set(slug.toLowerCase(), data as WooProduct);
    // Also index by title for better matching
    const title = (data as WooProduct).title?.toLowerCase();
    if (title && !lookup.has(title)) {
      lookup.set(title, data as WooProduct);
    }
  }
  
  return lookup;
}

function loadPOSInventory(): Map<string, POSItem> {
  const posPath = path.join(CSV_DIR, 'HMoonHydro_Inventory.csv');
  if (!fs.existsSync(posPath)) {
    console.log('⚠️  HMoonHydro_Inventory.csv not found, skipping POS enrichment');
    return new Map();
  }
  
  const content = fs.readFileSync(posPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return new Map();
  
  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  const lookup = new Map<string, POSItem>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const item: POSItem = {} as POSItem;
    
    for (let j = 0; j < headers.length && j < values.length; j++) {
      item[headers[j]] = values[j];
    }
    
    const itemNumber = item['Item Number'];
    const itemName = item['Item Name'];
    
    if (itemNumber) {
      lookup.set(itemNumber.toLowerCase(), item);
    }
    if (itemName) {
      lookup.set(normalizeText(itemName), item);
    }
  }
  
  return lookup;
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ============================================================================
// MATCHING FUNCTIONS
// ============================================================================

function findWooMatch(product: ConsolidatedProduct, wooLookup: Map<string, WooProduct>): WooProduct | null {
  // 1. Try exact handle match
  const handle = product.handle?.toLowerCase().replace(/-/g, '');
  if (handle && wooLookup.has(handle)) {
    return wooLookup.get(handle)!;
  }
  
  // 2. Try exact title match
  const title = product.title?.toLowerCase();
  if (title && wooLookup.has(title)) {
    return wooLookup.get(title)!;
  }
  
  // 3. Try normalized title match
  const normalizedTitle = normalizeText(product.title);
  if (wooLookup.has(normalizedTitle)) {
    return wooLookup.get(normalizedTitle)!;
  }
  
  // 4. Try SKU match
  for (const variant of product.variants) {
    if (variant.sku) {
      for (const woo of wooLookup.values()) {
        if (woo.sku && woo.sku.toLowerCase() === variant.sku.toLowerCase()) {
          return woo;
        }
      }
    }
  }
  
  // 5. Fuzzy match by title similarity
  let bestMatch: WooProduct | null = null;
  let bestScore = 0.6; // Minimum threshold
  
  for (const woo of wooLookup.values()) {
    const score = similarity(product.title, woo.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = woo;
    }
  }
  
  return bestMatch;
}

function findPOSMatch(product: ConsolidatedProduct, posLookup: Map<string, POSItem>): POSItem | null {
  // 1. Try SKU/Item Number match
  for (const variant of product.variants) {
    if (variant.posItemNumber && posLookup.has(variant.posItemNumber.toLowerCase())) {
      return posLookup.get(variant.posItemNumber.toLowerCase())!;
    }
    if (variant.sku && posLookup.has(variant.sku.toLowerCase())) {
      return posLookup.get(variant.sku.toLowerCase())!;
    }
  }
  
  // 2. Try title match
  const normalizedTitle = normalizeText(product.title);
  if (posLookup.has(normalizedTitle)) {
    return posLookup.get(normalizedTitle)!;
  }
  
  // 3. Fuzzy match
  let bestMatch: POSItem | null = null;
  let bestScore = 0.6;
  
  for (const [key, item] of posLookup) {
    const itemName = item['Item Name'] || '';
    const score = similarity(product.title, itemName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }
  
  return bestMatch;
}

// ============================================================================
// ENRICHMENT FUNCTIONS
// ============================================================================

function cleanDescription(html: string): string {
  if (!html) return '';
  
  // Decode HTML entities
  let cleaned = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  
  // Remove problematic characters but keep basic HTML
  cleaned = cleaned
    .replace(/[\r\n]+/g, ' ')  // Flatten newlines
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
  
  return cleaned;
}

function enrichProduct(
  product: ConsolidatedProduct,
  wooMatch: WooProduct | null,
  posMatch: POSItem | null
): { enriched: boolean; changes: string[] } {
  const changes: string[] = [];
  
  // Enrich description
  if ((!product.descriptionHtml || product.descriptionHtml.length < 50) && wooMatch?.description) {
    const cleanedDesc = cleanDescription(wooMatch.description);
    if (cleanedDesc.length > 50) {
      product.descriptionHtml = cleanedDesc;
      changes.push('description');
    }
  }
  
  // Enrich price (if all variants have 0 price)
  const allZeroPrice = product.variants.every(v => !v.price || v.price === 0);
  if (allZeroPrice) {
    // Try WooCommerce first
    if (wooMatch?.price && parseFloat(wooMatch.price) > 0) {
      const price = parseFloat(wooMatch.price);
      const regularPrice = wooMatch.regularPrice ? parseFloat(wooMatch.regularPrice) : null;
      
      for (const variant of product.variants) {
        variant.price = price;
        if (regularPrice && regularPrice > price) {
          variant.compareAtPrice = regularPrice;
        }
      }
      changes.push('price_from_woo');
    }
    // Try POS
    else if (posMatch?.['Regular Price'] && parseFloat(posMatch['Regular Price']) > 0) {
      const price = parseFloat(posMatch['Regular Price']);
      for (const variant of product.variants) {
        variant.price = price;
      }
      changes.push('price_from_pos');
    }
  }
  
  // Enrich weight
  const hasNoWeight = product.variants.every(v => !v.weight || v.weight === 0);
  if (hasNoWeight) {
    if (wooMatch?.weight && parseFloat(wooMatch.weight) > 0) {
      const weight = parseFloat(wooMatch.weight);
      // WooCommerce weight is in lbs, Shopify uses grams
      const weightGrams = Math.round(weight * 453.592);
      for (const variant of product.variants) {
        variant.weight = weightGrams;
      }
      changes.push('weight_from_woo');
    }
    else if (posMatch?.['Weight'] && parseFloat(posMatch['Weight']) > 0) {
      const weight = parseFloat(posMatch['Weight']);
      const weightGrams = Math.round(weight * 453.592);
      for (const variant of product.variants) {
        variant.weight = weightGrams;
      }
      changes.push('weight_from_pos');
    }
  }
  
  // Enrich vendor
  if (!product.vendor || product.vendor === 'Unknown' || product.vendor === '') {
    if (posMatch?.['Vendor Name']) {
      product.vendor = posMatch['Vendor Name'];
      changes.push('vendor_from_pos');
    }
    else if (posMatch?.['Manufacturer']) {
      product.vendor = posMatch['Manufacturer'];
      changes.push('manufacturer_from_pos');
    }
    else if (wooMatch?.title) {
      // Try to extract vendor from title (first word if it's a known brand)
      const vendor = extractVendorFromTitle(product.title);
      if (vendor) {
        product.vendor = vendor;
        changes.push('vendor_from_title');
      }
    }
  }
  
  // Enrich UPC
  for (const variant of product.variants) {
    if (!variant.upc && posMatch?.['UPC']) {
      variant.upc = posMatch['UPC'];
      if (!changes.includes('upc')) changes.push('upc');
    }
  }
  
  // Enrich cost
  for (const variant of product.variants) {
    if ((!variant.cost || variant.cost === 0) && posMatch?.['Average Unit Cost']) {
      const cost = parseFloat(posMatch['Average Unit Cost']);
      if (cost > 0) {
        variant.cost = cost;
        if (!changes.includes('cost')) changes.push('cost');
      }
    }
  }
  
  return { enriched: changes.length > 0, changes };
}

// ============================================================================
// VENDOR EXTRACTION FROM TITLE
// ============================================================================

const KNOWN_VENDORS = new Set([
  'Fox Farm', 'FoxFarm', 'General Hydroponics', 'GH', 'Advanced Nutrients', 
  'Botanicare', 'Canna', 'House & Garden', 'Humboldts Secret', 'Nectar for the Gods',
  'Roots Organics', 'Aurora Innovations', 'Grotek', 'Hydrofarm', 'Sunlight Supply',
  'Spider Farmer', 'Mars Hydro', 'Gavita', 'Fluence', 'AC Infinity', 
  'Phresh', 'Can-Fan', 'Growers Choice', 'Sun System', 'Quantum Board',
  'BlueSky Organics', 'BioBizz', 'Cyco', 'Dyna-Gro', 'Dutch Pro',
  'Emerald Harvest', 'Green Planet', 'Hygrozyme', 'Mammoth P', 'Mills',
  'Mother Earth', 'NPK Industries', 'Plagron', 'Remo', 'Rock Nutrients',
  'Soul Synthetics', 'Technaflora', 'Terpinator', 'Voodoo Juice', 'X Nutrients',
  'Jungle Boys', 'Athena', 'Floraflex', 'Current Culture', 'Titan Controls',
  'Autopilot', 'HM Digital', 'Bluelab', 'Apera', 'Milwaukee',
  'VIVOSUN', 'VIPARSPECTRA', 'HLG', 'Kingbrite', 'ChilLED',
  'Mammoth', 'Rockwool', 'Grodan', 'Atami', 'Aptus',
  'Grower\'s Edge', 'Phat', 'Ideal Air', 'Blueprint', 'TNB',
  'Trolmaster', 'PowerSi', 'Cutting Edge', 'Cultured Solutions', 'New Millenium',
  'Optic', 'RAW', 'Reiziger', 'Rx Green', 'Sensi',
]);

function extractVendorFromTitle(title: string): string | null {
  const titleLower = title.toLowerCase();
  
  for (const vendor of KNOWN_VENDORS) {
    if (titleLower.includes(vendor.toLowerCase())) {
      return vendor;
    }
  }
  
  // Check for brand patterns at start of title
  const match = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+/);
  if (match) {
    const potential = match[1];
    // Don't return generic words
    const generic = ['the', 'new', 'pro', 'premium', 'organic', 'natural', 'indoor'];
    if (!generic.includes(potential.toLowerCase()) && potential.length > 2) {
      return potential;
    }
  }
  
  return null;
}

// ============================================================================
// CORRUPTED PRODUCT CLEANUP
// ============================================================================

function isCorruptedProduct(product: ConsolidatedProduct): boolean {
  const title = product.title || '';
  const handle = product.handle || '';
  
  // Check for description-as-title (very long titles)
  if (title.length > 200) return true;
  
  // Check for HTML in handle
  if (handle.includes('<') || handle.includes('>')) return true;
  
  // Check for obvious corruption patterns
  if (/^(from these sources|description|key information)/i.test(title)) return true;
  
  // Check for handle that looks like description content
  if (handle.length > 100) return true;
  
  // Titles that start with lowercase letter are sentence fragments
  if (/^[a-z]/.test(title)) return true;
  
  // Titles that start with "and ", "as ", "or ", etc. are fragments
  if (/^(and |as |or |the |for |with |from |to |in |on |at |by |including |which |that |is |are |has |have )/i.test(title)) return true;
  
  // Titles that are just percentages
  if (/^\d+%/.test(title)) return true;
  
  // Titles shorter than 5 characters (not a real product name)
  if (title.length < 5) return true;
  
  // Contains phrases that indicate description fragments
  const fragmentPhrases = [
    'dissipate', 'nutrient solution', 'your plants', 'application rate',
    'mixing ratio', 'shelf life', 'expiration date', 'instructions',
    'recommended dosage', 'compatible with', 'safe for use'
  ];
  for (const phrase of fragmentPhrases) {
    if (title.toLowerCase().includes(phrase)) return true;
  }
  
  return false;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔄 MASTER PRODUCTS ENRICHMENT');
  console.log('=' .repeat(60));
  console.log('');
  
  // Load data sources
  console.log('📂 Loading data sources...');
  const products = loadMasterProducts();
  console.log(`   📦 Master products: ${products.length}`);
  
  const wooLookup = loadWooCommerceLookup();
  console.log(`   🛒 WooCommerce products: ${wooLookup.size}`);
  
  const posLookup = loadPOSInventory();
  console.log(`   💰 POS inventory items: ${posLookup.size}`);
  
  // Pre-enrichment stats
  const beforeStats = {
    noDescription: products.filter(p => !p.descriptionHtml || p.descriptionHtml.length < 50).length,
    noPrice: products.filter(p => p.variants.every(v => !v.price || v.price === 0)).length,
    noWeight: products.filter(p => p.variants.every(v => !v.weight || v.weight === 0)).length,
    noVendor: products.filter(p => !p.vendor || p.vendor === 'Unknown' || p.vendor === '').length,
    corrupted: products.filter(isCorruptedProduct).length,
  };
  
  console.log('\n📊 PRE-ENRICHMENT STATS:');
  console.log(`   ❌ No description: ${beforeStats.noDescription}`);
  console.log(`   ❌ No price: ${beforeStats.noPrice}`);
  console.log(`   ❌ No weight: ${beforeStats.noWeight}`);
  console.log(`   ❌ No vendor: ${beforeStats.noVendor}`);
  console.log(`   ⚠️  Corrupted: ${beforeStats.corrupted}`);
  
  // Filter out corrupted products
  console.log('\n🧹 Removing corrupted products...');
  const cleanProducts = products.filter(p => !isCorruptedProduct(p));
  console.log(`   Removed: ${products.length - cleanProducts.length} corrupted`);
  console.log(`   Remaining: ${cleanProducts.length} products`);
  
  // Enrich products
  console.log('\n🔗 Enriching products...');
  
  const stats: EnrichmentStats = {
    totalProducts: cleanProducts.length,
    enriched: { descriptions: 0, prices: 0, weights: 0, vendors: 0, upcs: 0, images: 0 },
    remaining: { noPrice: 0, noDescription: 0, noWeight: 0, noVendor: 0, noImages: 0 },
  };
  
  let enrichedCount = 0;
  const enrichmentLog: { handle: string; changes: string[] }[] = [];
  
  for (const product of cleanProducts) {
    const wooMatch = findWooMatch(product, wooLookup);
    const posMatch = findPOSMatch(product, posLookup);
    
    const { enriched, changes } = enrichProduct(product, wooMatch, posMatch);
    
    if (enriched) {
      enrichedCount++;
      enrichmentLog.push({ handle: product.handle, changes });
      
      for (const change of changes) {
        if (change.includes('description')) stats.enriched.descriptions++;
        if (change.includes('price')) stats.enriched.prices++;
        if (change.includes('weight')) stats.enriched.weights++;
        if (change.includes('vendor') || change.includes('manufacturer')) stats.enriched.vendors++;
        if (change === 'upc') stats.enriched.upcs++;
      }
    }
  }
  
  // Post-enrichment stats
  stats.remaining.noDescription = cleanProducts.filter(p => !p.descriptionHtml || p.descriptionHtml.length < 50).length;
  stats.remaining.noPrice = cleanProducts.filter(p => p.variants.every(v => !v.price || v.price === 0)).length;
  stats.remaining.noWeight = cleanProducts.filter(p => p.variants.every(v => !v.weight || v.weight === 0)).length;
  stats.remaining.noVendor = cleanProducts.filter(p => !p.vendor || p.vendor === 'Unknown' || p.vendor === '').length;
  stats.remaining.noImages = cleanProducts.filter(p => !p.images || p.images.length === 0).length;
  
  console.log(`   ✅ Products enriched: ${enrichedCount}`);
  
  console.log('\n📊 ENRICHMENT RESULTS:');
  console.log(`   📝 Descriptions added: ${stats.enriched.descriptions} (${stats.remaining.noDescription} still missing)`);
  console.log(`   💵 Prices added: ${stats.enriched.prices} (${stats.remaining.noPrice} still zero)`);
  console.log(`   ⚖️  Weights added: ${stats.enriched.weights} (${stats.remaining.noWeight} still missing)`);
  console.log(`   🏭 Vendors added: ${stats.enriched.vendors} (${stats.remaining.noVendor} still missing)`);
  console.log(`   🔢 UPCs added: ${stats.enriched.upcs}`);
  
  // Save enriched products
  const enrichedPath = path.join(OUTPUT_DIR, 'master_products_enriched.json');
  fs.writeFileSync(enrichedPath, JSON.stringify(cleanProducts, null, 2));
  console.log(`\n💾 Saved: ${enrichedPath}`);
  
  // Save enrichment log
  const logPath = path.join(OUTPUT_DIR, 'enrichment_log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    changes: enrichmentLog,
  }, null, 2));
  console.log(`📋 Saved: ${logPath}`);
  
  // Identify products that still need attention
  const stillBroken = cleanProducts.filter(p => 
    p.variants.every(v => !v.price || v.price === 0)
  );
  
  if (stillBroken.length > 0) {
    console.log(`\n⚠️  ${stillBroken.length} products still have NO PRICE!`);
    console.log('   These will be excluded from import or need manual fixing:');
    
    const brokenPath = path.join(OUTPUT_DIR, 'products_no_price.json');
    fs.writeFileSync(brokenPath, JSON.stringify(stillBroken.map(p => ({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      sources: p.sources,
    })), null, 2));
    console.log(`   📋 Saved list to: ${brokenPath}`);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 NEXT STEPS:');
  console.log('=' .repeat(60));
  console.log('1. Review master_products_enriched.json');
  console.log('2. Run buildCompleteImport.ts with --source=enriched flag');
  console.log('3. Products without prices will be excluded from import');
  console.log('=' .repeat(60));
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
