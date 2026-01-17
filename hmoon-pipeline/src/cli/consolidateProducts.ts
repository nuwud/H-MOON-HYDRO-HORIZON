#!/usr/bin/env npx tsx
/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: consolidateProducts.ts
 * PURPOSE: Product consolidation ONLY - reads WooCommerce + POS, outputs master_products
 * 
 * ⚠️  DO NOT ADD: Shopify GraphQL mutations, scraping logic, or import CSV generation
 * ⚠️  DO NOT MERGE: Code from scrapeHydroStores.ts or buildCompleteImport.ts
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * Product Consolidation Script
 * 
 * Merges WooCommerce products + POS Inventory into Shopify-ready format
 * with proper variant grouping.
 * 
 * Key Features:
 * - Groups products by base name (FloraBlend qt, FloraBlend gal → FloraBlend with variants)
 * - Merges WooCommerce descriptions with POS pricing/UPCs
 * - Detects size variants from product names
 * - Creates master_products.json with Shopify-compatible structure
 * 
 * Data Sources:
 * - WooCommerce: woo_products_full.json (1,481 products) - descriptions, SKUs
 * - POS Inventory: HMoonHydro_Inventory.csv (2,797 items) - UPCs, costs, prices, vendors
 * 
 * RUN: npx tsx src/cli/consolidateProducts.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

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
  itemNumber: string;
  itemName: string;
  itemDescription: string;
  briefDescription: string;
  alternateLookup: string;
  attribute: string;
  size: string;
  averageUnitCost: number;
  regularPrice: number;
  msrp: number;
  upc: string;
  taxCode: string;
  departmentName: string;
  departmentCode: string;
  vendorName: string;
  vendorCode: string;
  manufacturer: string;
  weight: number;
  qty1: number;  // Primary store quantity
  qty2: number;  // Secondary store quantity
}

interface ProductVariant {
  title: string;           // "Quart" | "Gallon" | "2.5 Gallon"
  option1: string;         // Size value
  sku: string;
  price: number;
  compareAtPrice: number | null;
  cost: number;
  upc: string;
  weight: number;
  inventoryQty: number;
  wooSku?: string;         // Original WooCommerce SKU
  posItemNumber?: string;  // Original POS item number
}

interface ConsolidatedProduct {
  handle: string;
  title: string;
  baseTitle: string;       // Normalized base name
  descriptionHtml: string;
  vendor: string;
  manufacturer: string;
  productType: string;     // Department from POS
  tags: string[];
  options: {
    name: string;          // "Size" | "Color" | "Type"
    values: string[];
  }[];
  variants: ProductVariant[];
  images: string[];
  status: 'active' | 'draft';
  sources: {
    wooCommerce: boolean;
    pos: boolean;
  };
  confidence: number;      // 0-100 based on data quality
}

// ============================================================================
// SIZE DETECTION PATTERNS
// ============================================================================

const SIZE_PATTERNS: { pattern: RegExp; normalized: string; order: number }[] = [
  // Exact liquid measures
  { pattern: /\b(1\s*oz|oz)\b/i, normalized: '1 oz', order: 1 },
  { pattern: /\b(2\s*oz)\b/i, normalized: '2 oz', order: 2 },
  { pattern: /\b(4\s*oz)\b/i, normalized: '4 oz', order: 3 },
  { pattern: /\b(8\s*oz)\b/i, normalized: '8 oz', order: 4 },
  { pattern: /\b(16\s*oz|pint|pt)\b/i, normalized: 'Pint', order: 5 },
  { pattern: /\b(quart|qt)\b/i, normalized: 'Quart', order: 6 },
  { pattern: /\b(1\/2\s*gal|half\s*gal)\b/i, normalized: '1/2 Gallon', order: 7 },
  { pattern: /\b(gallon|gal(?:lon)?)\b(?!\d)/i, normalized: 'Gallon', order: 8 },
  { pattern: /\b(2\.?5\s*gal(?:lon)?)\b/i, normalized: '2.5 Gallon', order: 9 },
  { pattern: /\b(5\s*gal(?:lon)?)\b/i, normalized: '5 Gallon', order: 10 },
  { pattern: /\b(6\s*gal(?:lon)?)\b/i, normalized: '6 Gallon', order: 11 },
  { pattern: /\b(10\s*gal(?:lon)?)\b/i, normalized: '10 Gallon', order: 12 },
  { pattern: /\b(15\s*gal(?:lon)?)\b/i, normalized: '15 Gallon', order: 13 },
  { pattern: /\b(55\s*gal(?:lon)?)\b/i, normalized: '55 Gallon', order: 14 },
  
  // Weight measures
  { pattern: /\b(1\s*lb|lb)\b/i, normalized: '1 lb', order: 20 },
  { pattern: /\b(2\s*lb)\b/i, normalized: '2 lb', order: 21 },
  { pattern: /\b(5\s*lb)\b/i, normalized: '5 lb', order: 22 },
  { pattern: /\b(10\s*lb)\b/i, normalized: '10 lb', order: 23 },
  { pattern: /\b(15\s*lb)\b/i, normalized: '15 lb', order: 24 },
  { pattern: /\b(20\s*lb)\b/i, normalized: '20 lb', order: 25 },
  { pattern: /\b(25\s*lb)\b/i, normalized: '25 lb', order: 26 },
  { pattern: /\b(40\s*lb)\b/i, normalized: '40 lb', order: 27 },
  { pattern: /\b(50\s*lb)\b/i, normalized: '50 lb', order: 28 },
  
  // Cubic feet
  { pattern: /\b(1\s*cu\.?\s*ft|1\.?5\s*cu\.?\s*ft)\b/i, normalized: '1.5 Cu Ft', order: 30 },
  { pattern: /\b(2\s*cu\.?\s*ft)\b/i, normalized: '2 Cu Ft', order: 31 },
  { pattern: /\b(3\s*cu\.?\s*ft)\b/i, normalized: '3 Cu Ft', order: 32 },
  
  // Numeric dimensions (lights, fans, pots)
  { pattern: /\b(2["']\s*|2\s*inch)\b/i, normalized: '2 inch', order: 40 },
  { pattern: /\b(4["']\s*|4\s*inch)\b/i, normalized: '4 inch', order: 41 },
  { pattern: /\b(6["']\s*|6\s*inch)\b/i, normalized: '6 inch', order: 42 },
  { pattern: /\b(8["']\s*|8\s*inch)\b/i, normalized: '8 inch', order: 43 },
  { pattern: /\b(10["']\s*|10\s*inch)\b/i, normalized: '10 inch', order: 44 },
  { pattern: /\b(12["']\s*|12\s*inch)\b/i, normalized: '12 inch', order: 45 },
  
  // Wattage (lights)
  { pattern: /\b(150\s*w(?:att)?)\b/i, normalized: '150W', order: 50 },
  { pattern: /\b(250\s*w(?:att)?)\b/i, normalized: '250W', order: 51 },
  { pattern: /\b(315\s*w(?:att)?)\b/i, normalized: '315W', order: 52 },
  { pattern: /\b(400\s*w(?:att)?)\b/i, normalized: '400W', order: 53 },
  { pattern: /\b(600\s*w(?:att)?)\b/i, normalized: '600W', order: 54 },
  { pattern: /\b(1000\s*w(?:att)?)\b/i, normalized: '1000W', order: 55 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
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

function detectSize(title: string): { normalized: string; order: number } | null {
  for (const { pattern, normalized, order } of SIZE_PATTERNS) {
    if (pattern.test(title)) {
      return { normalized, order };
    }
  }
  return null;
}

function extractBaseTitle(title: string): string {
  // Remove size patterns from title to get base name
  let base = title;
  
  for (const { pattern } of SIZE_PATTERNS) {
    base = base.replace(pattern, '');
  }
  
  // Clean up extra spaces, dashes, parentheses
  base = base
    .replace(/\s*[-–]\s*$/, '')      // trailing dash
    .replace(/\s*\(\s*\)\s*$/, '')   // empty parens
    .replace(/\s+/g, ' ')            // multiple spaces
    .trim();
    
  return base;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Create alias key for common naming differences
function createAliasKeys(title: string): string[] {
  const base = normalizeForMatching(title);
  const aliases = [base];
  
  // Common word variations
  const replacements: [RegExp, string][] = [
    // Remove common suffixes/descriptors
    [/composttea$/i, ''],
    [/vegancost$/i, ''],
    [/vegan$/i, ''],
    // Space vs no space variations
    [/florablend/i, 'florablend'],
    [/florable nd/i, 'florablend'],
    [/flora\s*blend/i, 'florablend'],
    // Common abbreviations
    [/pt$/i, 'pint'],
    [/gal$/i, 'gallon'],
    [/qt$/i, 'quart'],
  ];
  
  let processed = base;
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(title)) {
      processed = processed.replace(pattern, replacement);
      if (processed !== base && !aliases.includes(processed)) {
        aliases.push(normalizeForMatching(processed));
      }
    }
  }
  
  return aliases;
}

function createHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function calculateConfidence(product: ConsolidatedProduct): number {
  let score = 0;
  
  // Has description: +25
  if (product.descriptionHtml && product.descriptionHtml.length > 50) score += 25;
  
  // Has vendor: +15
  if (product.vendor) score += 15;
  
  // Has manufacturer: +10
  if (product.manufacturer) score += 10;
  
  // Has product type: +10
  if (product.productType) score += 10;
  
  // Has variants with UPCs: +20
  const variantsWithUPC = product.variants.filter(v => v.upc).length;
  if (variantsWithUPC > 0) score += Math.min(20, variantsWithUPC * 5);
  
  // Has prices: +10
  const variantsWithPrice = product.variants.filter(v => v.price > 0).length;
  if (variantsWithPrice > 0) score += 10;
  
  // Has inventory: +10
  const variantsWithInventory = product.variants.filter(v => v.inventoryQty > 0).length;
  if (variantsWithInventory > 0) score += 10;
  
  return Math.min(100, score);
}

// ============================================================================
// DATA LOADERS
// ============================================================================

function loadWooProducts(filePath: string): WooProduct[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ WooCommerce file not found: ${filePath}`);
    return [];
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`📦 Loaded ${data.length} WooCommerce products`);
  return data;
}

function loadPOSInventory(filePath: string): POSItem[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ POS inventory file not found: ${filePath}`);
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  
  const items: POSItem[] = rows.map(row => ({
    itemNumber: row['Item Number'] || '',
    itemName: row['Item Name'] || '',
    itemDescription: row['Item Description'] || '',
    briefDescription: row['Brief Description'] || '',
    alternateLookup: row['Alternate Lookup'] || '',
    attribute: row['Attribute'] || '',
    size: row['Size'] || '',
    averageUnitCost: parseFloat(row['Average Unit Cost']) || 0,
    regularPrice: parseFloat(row['Regular Price']) || 0,
    msrp: parseFloat(row['MSRP']) || 0,
    upc: row['UPC'] || '',
    taxCode: row['Tax Code'] || '',
    departmentName: row['Department Name'] || '',
    departmentCode: row['Department Code'] || '',
    vendorName: row['Vendor Name'] || '',
    vendorCode: row['Vendor Code'] || '',
    manufacturer: row['Manufacturer'] || '',
    weight: parseFloat(row['Weight']) || 0,
    qty1: parseInt(row['Qty 1']) || 0,
    qty2: parseInt(row['Qty 2']) || 0,
  }));
  
  console.log(`📦 Loaded ${items.length} POS inventory items`);
  return items;
}

// ============================================================================
// MATCHING & MERGING
// ============================================================================

interface ProductGroup {
  baseTitle: string;
  handle: string;
  wooProducts: WooProduct[];
  posItems: POSItem[];
}

function groupProducts(
  wooProducts: WooProduct[],
  posItems: POSItem[]
): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  const aliasMap = new Map<string, string>(); // alias -> primary key
  
  // First pass: Group WooCommerce products by base title
  for (const woo of wooProducts) {
    const baseTitle = extractBaseTitle(woo.title);
    const key = normalizeForMatching(baseTitle);
    
    if (!key) continue;
    
    if (!groups.has(key)) {
      groups.set(key, {
        baseTitle,
        handle: createHandle(baseTitle),
        wooProducts: [],
        posItems: [],
      });
      
      // Add all aliases for this key
      const aliases = createAliasKeys(baseTitle);
      for (const alias of aliases) {
        aliasMap.set(alias, key);
      }
    }
    
    groups.get(key)!.wooProducts.push(woo);
  }
  
  // Second pass: Match POS items to groups
  const unmatchedPOS: POSItem[] = [];
  
  for (const pos of posItems) {
    const posBaseTitle = extractBaseTitle(pos.itemName);
    const posKey = normalizeForMatching(posBaseTitle);
    const posAliases = createAliasKeys(posBaseTitle);
    
    if (!posKey) {
      unmatchedPOS.push(pos);
      continue;
    }
    
    // Try exact match first
    if (groups.has(posKey)) {
      groups.get(posKey)!.posItems.push(pos);
      continue;
    }
    
    // Try alias match
    let matched = false;
    for (const alias of posAliases) {
      if (aliasMap.has(alias)) {
        const primaryKey = aliasMap.get(alias)!;
        groups.get(primaryKey)!.posItems.push(pos);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Try fuzzy match on all group keys
      for (const [key, group] of groups) {
        // Check if keys share significant overlap
        // Handle cases like "florablend" vs "florablendcomposttea"
        const posKeyNormalized = posKey;
        const groupKeyNormalized = key;
        
        // Check for substring at START of string (product name prefix match)
        if (posKeyNormalized.startsWith(groupKeyNormalized) || 
            groupKeyNormalized.startsWith(posKeyNormalized)) {
          // One is prefix of other - strong match if prefix is substantial
          const shorterLen = Math.min(posKeyNormalized.length, groupKeyNormalized.length);
          if (shorterLen >= 5) { // At least 5 chars to be meaningful
            group.posItems.push(pos);
            matched = true;
            break;
          }
        }
        
        // Check for general substring containment with length validation
        if (posKeyNormalized.includes(groupKeyNormalized) || 
            groupKeyNormalized.includes(posKeyNormalized)) {
          const shorterLen = Math.min(posKeyNormalized.length, groupKeyNormalized.length);
          const longerLen = Math.max(posKeyNormalized.length, groupKeyNormalized.length);
          // Match if the shorter string is at least 40% of the longer and 5+ chars
          if (shorterLen >= 5 && shorterLen / longerLen >= 0.4) {
            group.posItems.push(pos);
            matched = true;
            break;
          }
        }
      }
    }
    
    if (!matched) {
      // Create new group for POS-only item
      if (!groups.has(posKey)) {
        groups.set(posKey, {
          baseTitle: posBaseTitle,
          handle: createHandle(posBaseTitle),
          wooProducts: [],
          posItems: [],
        });
      }
      groups.get(posKey)!.posItems.push(pos);
    }
  }
  
  return Array.from(groups.values());
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) return 1;
  
  // Check if shorter is substring
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Count matching characters
  let matches = 0;
  for (const char of shorter) {
    if (longer.includes(char)) matches++;
  }
  
  return matches / longer.length;
}

// ============================================================================
// CONSOLIDATION
// ============================================================================

function consolidateGroup(group: ProductGroup): ConsolidatedProduct {
  const variants: ProductVariant[] = [];
  let descriptionHtml = '';
  let vendor = '';
  let manufacturer = '';
  let productType = '';
  const tags: string[] = [];
  const sizeValues: Set<string> = new Set();
  
  // Get description from WooCommerce (they have the rich content)
  const wooWithDesc = group.wooProducts.find(w => w.description && w.description.length > 50);
  if (wooWithDesc) {
    descriptionHtml = wooWithDesc.description;
  }
  
  // Get vendor/manufacturer from POS
  const posWithVendor = group.posItems.find(p => p.vendorName || p.manufacturer);
  if (posWithVendor) {
    vendor = posWithVendor.vendorName;
    manufacturer = posWithVendor.manufacturer;
    productType = posWithVendor.departmentName;
    
    if (posWithVendor.departmentName) {
      tags.push(posWithVendor.departmentName.toLowerCase());
    }
  }
  
  // Build variants from WooCommerce products
  for (const woo of group.wooProducts) {
    const sizeInfo = detectSize(woo.title);
    const sizeName = sizeInfo?.normalized || 'Default';
    
    if (sizeName !== 'Default') {
      sizeValues.add(sizeName);
    }
    
    // Try to find matching POS item for pricing/UPC
    const matchingPOS = findMatchingPOS(woo.title, group.posItems);
    
    const variant: ProductVariant = {
      title: sizeName,
      option1: sizeName,
      sku: woo.sku || '',
      price: matchingPOS?.regularPrice || parseFloat(woo.price) || 0,
      compareAtPrice: matchingPOS?.msrp || (woo.salePrice ? parseFloat(woo.regularPrice) : null),
      cost: matchingPOS?.averageUnitCost || 0,
      upc: matchingPOS?.upc || '',
      weight: matchingPOS?.weight || parseFloat(woo.weight) || 0,
      inventoryQty: matchingPOS ? (matchingPOS.qty1 + matchingPOS.qty2) : 0,
      wooSku: woo.sku,
      posItemNumber: matchingPOS?.itemNumber,
    };
    
    // Only add if we don't already have this size variant
    if (!variants.find(v => v.option1 === sizeName)) {
      variants.push(variant);
    }
  }
  
  // Add POS-only items as variants
  for (const pos of group.posItems) {
    // Check if already covered by WooCommerce variant
    const alreadyCovered = variants.find(v => v.posItemNumber === pos.itemNumber);
    if (alreadyCovered) continue;
    
    const sizeInfo = detectSize(pos.itemName) || detectSize(pos.size);
    const sizeName = sizeInfo?.normalized || pos.size || 'Default';
    
    if (sizeName !== 'Default') {
      sizeValues.add(sizeName);
    }
    
    // Check if size already exists
    if (!variants.find(v => v.option1 === sizeName)) {
      variants.push({
        title: sizeName,
        option1: sizeName,
        sku: pos.itemNumber,
        price: pos.regularPrice,
        compareAtPrice: pos.msrp > pos.regularPrice ? pos.msrp : null,
        cost: pos.averageUnitCost,
        upc: pos.upc,
        weight: pos.weight,
        inventoryQty: pos.qty1 + pos.qty2,
        posItemNumber: pos.itemNumber,
      });
    }
  }
  
  // Sort variants by size order
  variants.sort((a, b) => {
    const aOrder = SIZE_PATTERNS.find(p => p.normalized === a.option1)?.order ?? 999;
    const bOrder = SIZE_PATTERNS.find(p => p.normalized === b.option1)?.order ?? 999;
    return aOrder - bOrder;
  });
  
  // Remove "Default" variant if we have proper sized variants
  const nonDefaultVariants = variants.filter(v => v.option1 !== 'Default');
  const finalVariants = nonDefaultVariants.length > 0 ? nonDefaultVariants : variants;
  
  // Build options
  const options: { name: string; values: string[] }[] = [];
  if (sizeValues.size > 0) {
    const sortedSizes = Array.from(sizeValues).sort((a, b) => {
      const aOrder = SIZE_PATTERNS.find(p => p.normalized === a)?.order ?? 999;
      const bOrder = SIZE_PATTERNS.find(p => p.normalized === b)?.order ?? 999;
      return aOrder - bOrder;
    });
    options.push({ name: 'Size', values: sortedSizes });
  }
  
  const product: ConsolidatedProduct = {
    handle: group.handle,
    title: group.baseTitle,
    baseTitle: group.baseTitle,
    descriptionHtml,
    vendor,
    manufacturer,
    productType,
    tags,
    options,
    variants: finalVariants,
    images: [],
    status: 'active',
    sources: {
      wooCommerce: group.wooProducts.length > 0,
      pos: group.posItems.length > 0,
    },
    confidence: 0,
  };
  
  product.confidence = calculateConfidence(product);
  
  return product;
}

function findMatchingPOS(wooTitle: string, posItems: POSItem[]): POSItem | null {
  const wooNorm = normalizeForMatching(wooTitle);
  
  // Try exact match first
  for (const pos of posItems) {
    const posNorm = normalizeForMatching(pos.itemName);
    if (wooNorm === posNorm) return pos;
  }
  
  // Try matching with size detection
  const wooSize = detectSize(wooTitle);
  if (wooSize) {
    for (const pos of posItems) {
      const posSize = detectSize(pos.itemName) || detectSize(pos.size);
      if (posSize?.normalized === wooSize.normalized) {
        return pos;
      }
    }
  }
  
  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔧 Product Consolidation Script\n');
  console.log('=' .repeat(60));
  
  // Path from hmoon-pipeline/src/cli/ to project root
  const baseDir = path.resolve(__dirname, '../../../');
  const csvDir = path.join(baseDir, 'CSVs');
  const outputDir = path.join(baseDir, 'outputs');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Load data sources
  console.log('\n📥 Loading data sources...\n');
  
  const wooProducts = loadWooProducts(path.join(csvDir, 'woo_products_full.json'));
  const posItems = loadPOSInventory(path.join(csvDir, 'HMoonHydro_Inventory.csv'));
  
  if (wooProducts.length === 0 && posItems.length === 0) {
    console.error('❌ No data sources found!');
    process.exit(1);
  }
  
  // Group products
  console.log('\n🔗 Grouping products by base title...\n');
  const groups = groupProducts(wooProducts, posItems);
  console.log(`   Created ${groups.length} product groups`);
  
  // Consolidate
  console.log('\n⚙️ Consolidating products...\n');
  const consolidatedProducts: ConsolidatedProduct[] = [];
  
  for (const group of groups) {
    const product = consolidateGroup(group);
    consolidatedProducts.push(product);
  }
  
  // Sort by title
  consolidatedProducts.sort((a, b) => a.title.localeCompare(b.title));
  
  // Statistics
  const stats = {
    total: consolidatedProducts.length,
    withVariants: consolidatedProducts.filter(p => p.variants.length > 1).length,
    withDescription: consolidatedProducts.filter(p => p.descriptionHtml.length > 50).length,
    withUPC: consolidatedProducts.filter(p => p.variants.some(v => v.upc)).length,
    withInventory: consolidatedProducts.filter(p => p.variants.some(v => v.inventoryQty > 0)).length,
    bothSources: consolidatedProducts.filter(p => p.sources.wooCommerce && p.sources.pos).length,
    wooOnly: consolidatedProducts.filter(p => p.sources.wooCommerce && !p.sources.pos).length,
    posOnly: consolidatedProducts.filter(p => !p.sources.wooCommerce && p.sources.pos).length,
    highConfidence: consolidatedProducts.filter(p => p.confidence >= 70).length,
    mediumConfidence: consolidatedProducts.filter(p => p.confidence >= 40 && p.confidence < 70).length,
    lowConfidence: consolidatedProducts.filter(p => p.confidence < 40).length,
    totalVariants: consolidatedProducts.reduce((sum, p) => sum + p.variants.length, 0),
  };
  
  console.log('\n📊 Consolidation Statistics:');
  console.log('=' .repeat(60));
  console.log(`   Total Products:       ${stats.total}`);
  console.log(`   Total Variants:       ${stats.totalVariants}`);
  console.log(`   With Multiple Variants: ${stats.withVariants}`);
  console.log(`   With Descriptions:    ${stats.withDescription}`);
  console.log(`   With UPCs:            ${stats.withUPC}`);
  console.log(`   With Inventory:       ${stats.withInventory}`);
  console.log('');
  console.log('   Data Sources:');
  console.log(`     WooCommerce + POS:  ${stats.bothSources}`);
  console.log(`     WooCommerce Only:   ${stats.wooOnly}`);
  console.log(`     POS Only:           ${stats.posOnly}`);
  console.log('');
  console.log('   Confidence Levels:');
  console.log(`     High (≥70):         ${stats.highConfidence}`);
  console.log(`     Medium (40-69):     ${stats.mediumConfidence}`);
  console.log(`     Low (<40):          ${stats.lowConfidence}`);
  
  // Save output
  const outputPath = path.join(outputDir, 'master_products.json');
  fs.writeFileSync(outputPath, JSON.stringify(consolidatedProducts, null, 2));
  console.log(`\n✅ Saved to: ${outputPath}`);
  
  // Save summary CSV
  const csvOutput: string[] = [
    'handle,title,variants_count,description_length,has_upc,inventory_total,vendor,manufacturer,confidence,sources',
  ];
  
  for (const p of consolidatedProducts) {
    const inventoryTotal = p.variants.reduce((sum, v) => sum + v.inventoryQty, 0);
    const hasUPC = p.variants.some(v => v.upc) ? 'yes' : 'no';
    const sources = [
      p.sources.wooCommerce ? 'woo' : '',
      p.sources.pos ? 'pos' : '',
    ].filter(Boolean).join('+');
    
    csvOutput.push([
      p.handle,
      `"${p.title.replace(/"/g, '""')}"`,
      p.variants.length,
      p.descriptionHtml.length,
      hasUPC,
      inventoryTotal,
      `"${p.vendor.replace(/"/g, '""')}"`,
      `"${p.manufacturer.replace(/"/g, '""')}"`,
      p.confidence,
      sources,
    ].join(','));
  }
  
  const csvPath = path.join(outputDir, 'master_products_summary.csv');
  fs.writeFileSync(csvPath, csvOutput.join('\n'));
  console.log(`✅ Saved summary to: ${csvPath}`);
  
  // Show sample products
  console.log('\n📋 Sample Consolidated Products:');
  console.log('=' .repeat(60));
  
  const samples = consolidatedProducts
    .filter(p => p.variants.length > 1)
    .slice(0, 5);
    
  for (const p of samples) {
    console.log(`\n🏷️ ${p.title}`);
    console.log(`   Handle: ${p.handle}`);
    console.log(`   Vendor: ${p.vendor || 'N/A'} | Manufacturer: ${p.manufacturer || 'N/A'}`);
    console.log(`   Description: ${p.descriptionHtml.length} chars`);
    console.log(`   Confidence: ${p.confidence}%`);
    console.log(`   Variants (${p.variants.length}):`);
    for (const v of p.variants) {
      console.log(`     - ${v.option1}: $${v.price.toFixed(2)} | UPC: ${v.upc || 'N/A'} | Qty: ${v.inventoryQty}`);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 Next Steps:');
  console.log('   1. Review master_products.json for accuracy');
  console.log('   2. Run Shopify import with this data');
  console.log('   3. Use fortified scraping to fill remaining gaps');
  console.log('=' .repeat(60));
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
