/**
 * Build Shopify Import CSV from WooCommerce Products
 * Version 2: Enhanced with Series Detection
 * 
 * This script consolidates products in TWO ways:
 * 1. WooCommerce's actual "Grouped products" field (|~| delimiter)
 * 2. Series Pattern Detection - finds simple products with same base name + size
 * 
 * Shopify Variant Structure:
 * - First row: Handle, Title, Option1 Name, Option1 Value, etc.
 * - Subsequent rows: Same Handle, empty Title, Option1 Value for variant
 */

const fs = require('fs');
const path = require('path');

// Configuration
const WOO_EXPORT = path.join(__dirname, '../CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const OUTPUT_DIR = path.join(__dirname, '../outputs/woo_grouped');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'shopify_grouped_import_v2.csv');

// Shopify CSV Header
const SHOPIFY_HEADER = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
  'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
  'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
  'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
  'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
  'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description',
  'Gift Card', 'Status'
];

// Size pattern for extracting base name and size
const SIZE_PATTERNS = [
  // Volume patterns (most common)
  /\s*[-–/]?\s*(\d+(?:\.\d+)?)\s*(qt|qts?|quart|quarts?|gal|gallon|gallons?|oz|fl\.?\s*oz|liter|liters?|lt?|ml|L)\s*$/i,
  // Weight patterns
  /\s*[-–/]?\s*(\d+(?:\.\d+)?)\s*(lb|lbs?|pound|pounds?|kg|g|gm|grams?)\s*$/i,
  // Pack/count patterns
  /\s*[-–/]?\s*(\d+)\s*(pk|pack|packs?|ct|count|ea|each|per)\s*$/i,
  // Parenthesized sizes
  /\s*\((\d+(?:\.\d+)?)\s*(qt|gal|oz|lb|kg|g|L|ml|liter)\)\s*$/i,
  // Trailing "X gal" or "X L" with optional dash
  /\s+(\d+(?:\.\d+)?)\s*(gal|gallon|qt|quart|oz|lb|kg|g|L|ml|liter)$/i,
];

// HTML Entity decoder
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, '...')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8243;/g, '"')
    .replace(/&#8242;/g, "'")
    .replace(/&#038;/g, "&");
}

// Normalize for matching
function normalizeForMatch(str) {
  if (!str) return '';
  return decodeHtmlEntities(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''′`]/g, "'")
    .replace(/[""″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract base name and size from product name
function extractBaseAndSize(name) {
  if (!name) return { base: null, size: null };
  
  const decoded = decodeHtmlEntities(name).trim();
  
  for (const pattern of SIZE_PATTERNS) {
    const match = decoded.match(pattern);
    if (match) {
      const size = `${match[1]} ${match[2]}`.trim();
      const base = decoded.substring(0, match.index).trim();
      if (base.length > 2) { // Base name must be meaningful
        return { base: base.toLowerCase(), size, originalBase: decoded.substring(0, match.index).trim() };
      }
    }
  }
  
  return { base: null, size: null };
}

// Extract variant option from name (for display)
function extractVariantOption(name) {
  const decoded = decodeHtmlEntities(name).trim();
  
  for (const pattern of SIZE_PATTERNS) {
    const match = decoded.match(pattern);
    if (match) {
      return `${match[1]} ${match[2]}`.trim();
    }
  }
  
  return decoded;
}

// Generate handle from title
function generateHandle(title) {
  return decodeHtmlEntities(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

// Escape CSV value
function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Parse CSV
function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field.trim());
        field = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        row.push(field.trim());
        if (row.length > 1 || row[0]) rows.push(row);
        row = [];
        field = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        field += char;
      }
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] || '');
    return obj;
  });
}

// Create Shopify row
function createShopifyRow(handle, title, product, optionName, optionValue, isFirstVariant) {
  return {
    Handle: handle,
    Title: isFirstVariant ? decodeHtmlEntities(title) : '',
    'Body (HTML)': isFirstVariant ? (product['Product description'] || '') : '',
    Vendor: isFirstVariant ? decodeHtmlEntities(product['Brands'] || '') : '',
    'Product Category': isFirstVariant ? (product['Product categories'] || '') : '',
    Type: isFirstVariant ? (product['Product categories']?.split('>')[0]?.trim() || '') : '',
    Tags: isFirstVariant ? (product['Product tags'] || '') : '',
    Published: isFirstVariant ? 'TRUE' : '',
    'Option1 Name': isFirstVariant ? optionName : '',
    'Option1 Value': decodeHtmlEntities(optionValue),
    'Option2 Name': '',
    'Option2 Value': '',
    'Option3 Name': '',
    'Option3 Value': '',
    'Variant SKU': product['Sku'] || '',
    'Variant Grams': Math.round((parseFloat(product['Weight']) || 0) * 453.592),
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': product['Stock'] || '0',
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Price': product['Regular Price'] || product['Price'] || '',
    'Variant Compare At Price': product['Sale Price'] ? product['Regular Price'] : '',
    'Variant Requires Shipping': 'TRUE',
    'Variant Taxable': 'TRUE',
    'Variant Barcode': product['GTIN, UPC, EAN, or ISBN'] || '',
    'Image Src': isFirstVariant ? (product['Image URL'] || '') : '',
    'Image Position': isFirstVariant ? '1' : '',
    'Image Alt Text': isFirstVariant ? decodeHtmlEntities(title) : '',
    'SEO Title': isFirstVariant ? (product['SEO Title'] || decodeHtmlEntities(title)) : '',
    'SEO Description': isFirstVariant ? (product['SEO Meta Description'] || '') : '',
    'Gift Card': isFirstVariant ? 'FALSE' : '',
    Status: isFirstVariant ? 'active' : ''
  };
}

// Main processing
async function buildGroupedVariants() {
  console.log('📖 Reading WooCommerce export...');
  const content = fs.readFileSync(WOO_EXPORT, 'utf-8');
  const products = parseCSV(content);
  console.log(`   Found ${products.length} total products`);
  
  // Index products by name
  const productsByName = new Map();
  const productsByNormalized = new Map();
  products.forEach(p => {
    const name = p['Product Name']?.trim();
    if (name) {
      productsByName.set(name.toLowerCase(), p);
      productsByNormalized.set(normalizeForMatch(name), p);
    }
  });
  
  const shopifyRows = [];
  const processedProducts = new Set(); // Track by product name
  let processedGroups = 0;
  let seriesDetected = 0;
  let standaloneCount = 0;
  
  // =========================================
  // PHASE 1: Process WooCommerce Grouped Products
  // =========================================
  console.log('\n📦 Phase 1: Processing WooCommerce grouped products...');
  const groupedProducts = products.filter(p => p['Type'] === 'grouped');
  console.log(`   Found ${groupedProducts.length} grouped products`);
  
  for (const parent of groupedProducts) {
    const parentName = parent['Product Name']?.trim();
    const childrenField = parent['Grouped products']?.trim();
    
    if (!childrenField) continue;
    
    const childNames = childrenField.split('|~|').map(c => c.trim()).filter(c => c);
    const children = [];
    
    for (const childName of childNames) {
      let child = productsByName.get(childName.toLowerCase());
      if (!child) {
        child = productsByNormalized.get(normalizeForMatch(childName));
      }
      if (child) {
        children.push({ name: childName, data: child });
        processedProducts.add(child['Product Name']?.toLowerCase().trim());
      }
    }
    
    if (children.length === 0) continue;
    
    const handle = generateHandle(parentName);
    const hasVolume = children.some(c => /\b(qt|qts?|gal|oz|liter|L|ml)\b/i.test(c.name));
    const optionName = hasVolume ? 'Size' : 'Variant';
    
    // First child
    shopifyRows.push(createShopifyRow(
      handle, parentName, children[0].data, optionName,
      extractVariantOption(children[0].name), true
    ));
    
    // Additional children
    for (let i = 1; i < children.length; i++) {
      shopifyRows.push(createShopifyRow(
        handle, '', children[i].data, '',
        extractVariantOption(children[i].name), false
      ));
    }
    
    processedGroups++;
    processedProducts.add(parentName.toLowerCase());
  }
  console.log(`   Processed ${processedGroups} grouped products`);
  
  // =========================================
  // PHASE 2: Detect Series Patterns in Simple Products
  // =========================================
  console.log('\n🔍 Phase 2: Detecting series patterns in simple products...');
  
  const simpleProducts = products.filter(p => 
    p['Type'] === 'simple' && !processedProducts.has(p['Product Name']?.toLowerCase().trim())
  );
  console.log(`   Found ${simpleProducts.length} unprocessed simple products`);
  
  // Group by base name
  const seriesGroups = new Map();
  for (const product of simpleProducts) {
    const name = product['Product Name']?.trim();
    const { base, size, originalBase } = extractBaseAndSize(name);
    
    if (base && size) {
      if (!seriesGroups.has(base)) {
        seriesGroups.set(base, { originalBase, products: [] });
      }
      seriesGroups.get(base).products.push({ name, size, data: product });
    }
  }
  
  // Process series with 2+ products
  for (const [base, group] of seriesGroups) {
    if (group.products.length < 2) continue;
    
    const handle = generateHandle(group.originalBase);
    const prods = group.products;
    
    // First product
    shopifyRows.push(createShopifyRow(
      handle, group.originalBase, prods[0].data, 'Size',
      prods[0].size, true
    ));
    
    // Additional products
    for (let i = 1; i < prods.length; i++) {
      shopifyRows.push(createShopifyRow(
        handle, '', prods[i].data, '',
        prods[i].size, false
      ));
    }
    
    // Mark all as processed
    prods.forEach(p => processedProducts.add(p.name.toLowerCase()));
    seriesDetected++;
  }
  console.log(`   Detected ${seriesDetected} series patterns (${[...seriesGroups.values()].filter(g => g.products.length >= 2).reduce((sum, g) => sum + g.products.length, 0)} products)`);
  
  // =========================================
  // PHASE 3: Add Remaining Standalone Products
  // =========================================
  console.log('\n📦 Phase 3: Processing standalone products...');
  
  const remainingProducts = products.filter(p => {
    const name = p['Product Name']?.toLowerCase().trim();
    const type = p['Type'];
    return type === 'simple' && !processedProducts.has(name);
  });
  
  for (const product of remainingProducts) {
    const name = product['Product Name']?.trim();
    if (!name) continue;
    
    const handle = generateHandle(name);
    
    shopifyRows.push(createShopifyRow(
      handle, name, product, 'Title',
      'Default Title', true
    ));
    standaloneCount++;
  }
  console.log(`   Added ${standaloneCount} standalone products`);
  
  // =========================================
  // Write Output
  // =========================================
  console.log('\n📝 Writing Shopify import CSV...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const csvContent = [
    SHOPIFY_HEADER.join(','),
    ...shopifyRows.map(row => SHOPIFY_HEADER.map(h => escapeCSV(row[h] || '')).join(','))
  ].join('\n');
  
  fs.writeFileSync(OUTPUT_FILE, csvContent);
  
  // Summary
  console.log('\n✅ Complete!');
  console.log(`   📊 WooCommerce grouped products: ${processedGroups}`);
  console.log(`   🔍 Series patterns detected: ${seriesDetected}`);
  console.log(`   📦 Standalone products: ${standaloneCount}`);
  console.log(`   📋 Total Shopify rows: ${shopifyRows.length}`);
  console.log(`\n   Output: ${OUTPUT_FILE}`);
}

buildGroupedVariants().catch(console.error);
