/**
 * Build Shopify Import CSV from WooCommerce Grouped Products
 * 
 * This script properly consolidates products based on WooCommerce's
 * actual "Grouped products" field, NOT heuristic name matching.
 * 
 * WooCommerce Grouping Structure:
 * - Parent product has Type="grouped" and "Grouped products" field with child names
 * - Children are listed as: "ChildName1|~|ChildName2|~|ChildName3"
 * - Each child is a separate simple product in the export
 * 
 * Shopify Variant Structure:
 * - First row: Handle, Title, Option1 Name, Option1 Value, etc.
 * - Subsequent rows: Same Handle, empty Title, Option1 Value for variant
 */

const fs = require('fs');
const path = require('path');

// HTML Entity decoder for WooCommerce exports
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
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8243;/g, '"')  // Double prime (inches) -> regular quote
    .replace(/&#8242;/g, "'")  // Single prime (feet) -> regular quote
    .replace(/&#038;/g, "&");
}

// Normalize string for matching (decode entities, normalize unicode, lowercase)
function normalizeForMatch(str) {
  if (!str) return '';
  return decodeHtmlEntities(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032`]/g, "'")  // Normalize apostrophes
    .replace(/[\u201C\u201D\u2033]/g, '"')  // Normalize quotes
    .replace(/[\u2013\u2014]/g, '-')   // Normalize dashes
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

// Configuration
const WOO_EXPORT = path.join(__dirname, '../CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const OUTPUT_DIR = path.join(__dirname, '../outputs/woo_grouped');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'shopify_grouped_import.csv');

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

// Parse CSV (handling quoted fields with embedded commas/newlines)
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
        i++; // Skip escaped quote
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
  
  // Convert to objects using first row as header
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] || '');
    return obj;
  });
}

// Extract size/variant info from product name
function extractVariantOption(name) {
  // Common patterns: "Product Name 1 qt", "Product Name 4L", "Product Name 2.5 gal"
  const sizePatterns = [
    // Volume patterns
    /\b(\d+(?:\.\d+)?)\s*(qt|qts?|quart|quarts?|gal|gallon|gallons?|oz|fl\.?\s*oz|liter|liters?|lt?|ml|L)\b/i,
    // Weight patterns
    /\b(\d+(?:\.\d+)?)\s*(lb|lbs?|pounds?|kg|g|gm|grams?|oz)\b/i,
    // Pack/count patterns
    /\b(\d+)\s*(pk|pack|packs?|ct|count)\b/i,
    // Trailing number with unit at end
    /\s(\d+(?:\.\d+)?)\s*(qt|gal|oz|lb|kg|g|L|ml|lt)$/i,
  ];
  
  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match) {
      return `${match[1]} ${match[2]}`.trim();
    }
  }
  
  // Check for trailing size at end without captured unit
  const trailingSize = name.match(/\s+((?:\d+(?:\.\d+)?)\s*(?:qt|gal|oz|lb|kg|g|L|ml|lt|liter|gallon|quart|pound))$/i);
  if (trailingSize) return trailingSize[1].trim();
  
  // Fallback: use the full name as the option value
  return name;
}

// Generate handle from title
function generateHandle(title) {
  return title
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

// Main processing
async function buildGroupedVariants() {
  console.log('📖 Reading WooCommerce export...');
  const content = fs.readFileSync(WOO_EXPORT, 'utf-8');
  const products = parseCSV(content);
  console.log(`   Found ${products.length} total products`);
  
  // Index products by NORMALIZED name for matching
  const productsByName = new Map();
  const productsByNormalized = new Map();
  products.forEach(p => {
    const name = p['Product Name']?.trim();
    if (name) {
      productsByName.set(name.toLowerCase(), p);
      productsByNormalized.set(normalizeForMatch(name), p);
    }
  });
  
  // Find grouped products
  const groupedProducts = products.filter(p => p['Type'] === 'grouped');
  console.log(`   Found ${groupedProducts.length} grouped products`);
  
  // Process each grouped product
  const shopifyRows = [];
  let processedGroups = 0;
  let orphanedChildren = 0;
  const processedChildren = new Set();
  
  for (const parent of groupedProducts) {
    const parentName = parent['Product Name']?.trim();
    const childrenField = parent['Grouped products']?.trim();
    
    if (!childrenField) {
      console.log(`   ⚠️ Grouped product "${parentName}" has no children listed`);
      continue;
    }
    
    // Parse children (delimiter: |~|)
    const childNames = childrenField
      .split('|~|')
      .map(c => c.trim())
      .filter(c => c);
    
    // Find actual child products (using normalized matching for HTML entities)
    const children = [];
    for (const childName of childNames) {
      // Try exact match first
      let child = productsByName.get(childName.toLowerCase());
      
      // If not found, try normalized match (handles HTML entities)
      if (!child) {
        const normalizedChildName = normalizeForMatch(childName);
        child = productsByNormalized.get(normalizedChildName);
      }
      
      if (child) {
        children.push({ name: childName, data: child });
        processedChildren.add(childName.toLowerCase());
      } else {
        console.log(`   ⚠️ Child not found: "${childName}" (parent: "${parentName}")`);
        orphanedChildren++;
      }
    }
    
    if (children.length === 0) {
      console.log(`   ❌ No children found for: "${parentName}"`);
      continue;
    }
    
    // Create Shopify product with variants
    const handle = generateHandle(parentName);
    
    // Determine Option1 Name based on variant patterns
    const hasVolume = children.some(c => 
      /\b(qt|qts?|gal|oz|liter|L|ml)\b/i.test(c.name)
    );
    const option1Name = hasVolume ? 'Size' : 'Variant';
    
    // First row (main product)
    const firstChild = children[0];
    shopifyRows.push({
      Handle: handle,
      Title: decodeHtmlEntities(parentName),
      'Body (HTML)': parent['Product description'] || firstChild.data['Product description'] || '',
      Vendor: decodeHtmlEntities(parent['Brands'] || firstChild.data['Brands'] || ''),
      'Product Category': parent['Product categories'] || '',
      Type: parent['Product categories']?.split('>')[0]?.trim() || '',
      Tags: parent['Product tags'] || '',
      Published: 'TRUE',
      'Option1 Name': option1Name,
      'Option1 Value': decodeHtmlEntities(extractVariantOption(firstChild.name)),
      'Option2 Name': '',
      'Option2 Value': '',
      'Option3 Name': '',
      'Option3 Value': '',
      'Variant SKU': firstChild.data['Sku'] || '',
      'Variant Grams': Math.round((parseFloat(firstChild.data['Weight']) || 0) * 453.592),
      'Variant Inventory Tracker': 'shopify',
      'Variant Inventory Qty': firstChild.data['Stock'] || '0',
      'Variant Inventory Policy': 'deny',
      'Variant Fulfillment Service': 'manual',
      'Variant Price': firstChild.data['Regular Price'] || firstChild.data['Price'] || '',
      'Variant Compare At Price': firstChild.data['Sale Price'] ? firstChild.data['Regular Price'] : '',
      'Variant Requires Shipping': 'TRUE',
      'Variant Taxable': 'TRUE',
      'Variant Barcode': firstChild.data['GTIN, UPC, EAN, or ISBN'] || '',
      'Image Src': firstChild.data['Image URL'] || parent['Image URL'] || '',
      'Image Position': '1',
      'Image Alt Text': parentName,
      'SEO Title': parent['SEO Title'] || decodeHtmlEntities(parentName),
      'SEO Description': parent['SEO Meta Description'] || '',
      'Gift Card': 'FALSE',
      Status: 'active'
    });
    
    // Additional variant rows
    for (let i = 1; i < children.length; i++) {
      const child = children[i];
      shopifyRows.push({
        Handle: handle,
        Title: '',
        'Body (HTML)': '',
        Vendor: '',
        'Product Category': '',
        Type: '',
        Tags: '',
        Published: '',
        'Option1 Name': '',
        'Option1 Value': decodeHtmlEntities(extractVariantOption(child.name)),
        'Option2 Name': '',
        'Option2 Value': '',
        'Option3 Name': '',
        'Option3 Value': '',
        'Variant SKU': child.data['Sku'] || '',
        'Variant Grams': Math.round((parseFloat(child.data['Weight']) || 0) * 453.592),
        'Variant Inventory Tracker': 'shopify',
        'Variant Inventory Qty': child.data['Stock'] || '0',
        'Variant Inventory Policy': 'deny',
        'Variant Fulfillment Service': 'manual',
        'Variant Price': child.data['Regular Price'] || child.data['Price'] || '',
        'Variant Compare At Price': child.data['Sale Price'] ? child.data['Regular Price'] : '',
        'Variant Requires Shipping': 'TRUE',
        'Variant Taxable': 'TRUE',
        'Variant Barcode': child.data['GTIN, UPC, EAN, or ISBN'] || '',
        'Image Src': child.data['Image URL'] || '',
        'Image Position': '',
        'Image Alt Text': '',
        'SEO Title': '',
        'SEO Description': '',
        'Gift Card': '',
        Status: ''
      });
    }
    
    processedGroups++;
  }
  
  // Find simple products that are NOT part of any group
  console.log('\n📦 Processing standalone products...');
  const standaloneProducts = products.filter(p => {
    const name = p['Product Name']?.toLowerCase().trim();
    const type = p['Type'];
    return type === 'simple' && !processedChildren.has(name);
  });
  console.log(`   Found ${standaloneProducts.length} standalone products`);
  
  // Add standalone products (single variant each)
  for (const product of standaloneProducts) {
    const name = product['Product Name']?.trim();
    if (!name) continue;
    
    const handle = generateHandle(name);
    const decodedName = decodeHtmlEntities(name);
    
    shopifyRows.push({
      Handle: handle,
      Title: decodedName,
      'Body (HTML)': product['Product description'] || '',
      Vendor: decodeHtmlEntities(product['Brands'] || ''),
      'Product Category': product['Product categories'] || '',
      Type: product['Product categories']?.split('>')[0]?.trim() || '',
      Tags: product['Product tags'] || '',
      Published: 'TRUE',
      'Option1 Name': 'Title',
      'Option1 Value': 'Default Title',
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
      'Image Src': product['Image URL'] || '',
      'Image Position': '1',
      'Image Alt Text': decodedName,
      'SEO Title': product['SEO Title'] || decodedName,
      'SEO Description': product['SEO Meta Description'] || '',
      'Gift Card': 'FALSE',
      Status: 'active'
    });
  }
  
  // Write output
  console.log('\n📝 Writing Shopify import CSV...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const csvContent = [
    SHOPIFY_HEADER.join(','),
    ...shopifyRows.map(row => SHOPIFY_HEADER.map(h => escapeCSV(row[h] || '')).join(','))
  ].join('\n');
  
  fs.writeFileSync(OUTPUT_FILE, csvContent);
  
  // Summary
  console.log('\n✅ Complete!');
  console.log(`   📊 Grouped products processed: ${processedGroups}`);
  console.log(`   📦 Standalone products added: ${standaloneProducts.length}`);
  console.log(`   📋 Total Shopify rows: ${shopifyRows.length}`);
  console.log(`   ⚠️ Orphaned children: ${orphanedChildren}`);
  console.log(`\n   Output: ${OUTPUT_FILE}`);
}

buildGroupedVariants().catch(console.error);
