/**
 * buildUnifiedImport.ts
 * 
 * UNIFIED IMPORT PIPELINE - Fixes the variant consolidation gap
 * 
 * This script merges:
 * 1. variant_consolidation.csv (251 grouped products, 849 variant rows)
 * 2. master_catalog_index.csv (simple products NOT in consolidation)
 * 3. POS alignment data (UPC barcodes, Manufacturer/Vendor, Cost)
 * 4. WooCommerce image map
 * 5. Valid Shopify taxonomy categories
 * 
 * Output:
 *   - outputs/unified_import.csv (complete Shopify import)
 *   - outputs/unified_import_stats.json (merge statistics)
 * 
 * Usage:
 *   npx tsx src/cli/buildUnifiedImport.ts
 *   npx tsx src/cli/buildUnifiedImport.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const CSV_DIR = resolve(PROJECT_ROOT, 'CSVs');
const OUTPUTS_DIR = resolve(PROJECT_ROOT, 'outputs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConsolidatedRow {
  Handle: string;
  Product_Name: string;
  Product_Type: string;
  Status: string;
  Published_Date: string;
  Tags: string;
  Vendor: string;
  Description: string;
  SEO_Title: string;
  SEO_Description: string;
  Variant_Title: string;
  Variant_SKU: string;
  Variant_Price: string;
  Variant_Compare_Price: string;
  Variant_Inventory: string;
  Variant_Weight: string;
  Variant_Weight_Unit: string;
  Variant_Requires_Shipping: string;
  Variant_Taxable: string;
  Variant_Option1_Name: string;
  Variant_Option1: string;
  Variant_Fulfillment_Service: string;
  Variant_Inventory_Policy: string;
  Variant_Inventory_Tracker: string;
  Variant_Barcode: string;
  Image_URL: string;
}

interface CatalogRow {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  primary_category: string;
  secondary_categories: string;
  price: string;
  compare_at_price: string;
  cost: string;
  inventory_qty: string;
  images: string;
  description: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
  source: string;
  needs_review: string;
}

interface POSAlignment {
  'Variant SKU': string;
  Handle: string;
  Title: string;
  'POS Item Number': string;
  'POS Item Name': string;
  'POS Regular Price': string;
  'POS Vendor': string;
  'Match Score': string;
}

interface ShopifyImportRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Category': string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Option3 Name': string;
  'Option3 Value': string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'SEO Title': string;
  'SEO Description': string;
  'Gift Card': string;
  'Cost per item': string;
  Status: string;
}

// Shopify Category Mapping (from docs/SHOPIFY_CATEGORY_MAPPING.md)
const CATEGORY_MAP: Record<string, string> = {
  'nutrients': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients & Supplements',
  'hydroponic nutrients': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients & Supplements',
  'grow_media': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media',
  'grow media': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media',
  'irrigation': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'grow_lights': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Lighting',
  'grow lights': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Lighting',
  'hid_bulbs': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Lighting',
  'hid bulbs': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Lighting',
  'airflow': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'odor_control': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'odor control': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'ph_meters': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'ph meters': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'environmental_monitors': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'controllers_timers': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'controllers': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'water_filtration': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'containers_pots': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'propagation': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'seeds': 'Home & Garden > Plants > Seeds, Bulbs & Accessories > Seeds & Seed Tape',
  'harvesting': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'trimming': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'pest_control': 'Home & Garden > Household Supplies > Pest Control',
  'pest control': 'Home & Garden > Household Supplies > Pest Control',
  'co2': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'books': 'Media > Books',
  'electrical_supplies': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'grow_tents': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'grow tents': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'grow_room_materials': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'ventilation_accessories': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
  'extraction': 'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
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

function escapeCsvField(field: string | undefined): string {
  if (!field) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Validate that a handle is properly formatted for Shopify
 * Must be lowercase alphanumeric with hyphens only
 */
function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 2 || handle.length > 255) return false;
  // Must be lowercase letters, numbers, and hyphens only
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(handle) && !/^[a-z0-9]{1,2}$/.test(handle)) return false;
  // Reject handles that look like corrupted data
  if (handle.includes(':') || handle.includes('{') || handle.includes('}')) return false;
  if (handle.includes(' ') || handle.includes('\t')) return false;
  // Reject handles that are clearly description fragments
  if (handle.length > 60) return false;
  // Reject handles that look like HTML fragments
  if (handle.includes('<') || handle.includes('>')) return false;
  // Reject handles that start with common garbage values
  const garbagePrefixes = ['derived', 'due to', 'tip:', 'add ', 'information', 'shake', 'dissolves', 'avoid'];
  const lowerHandle = handle.toLowerCase();
  if (garbagePrefixes.some(g => lowerHandle.startsWith(g))) return false;
  return true;
}

/**
 * Validate that a SKU looks legitimate (not corrupted from CSV parsing)
 */
function isValidSKU(sku: string | undefined): boolean {
  if (!sku || sku.trim() === '') return false;
  const s = sku.trim();
  // Reject pure numbers less than 5 digits (likely row numbers from corrupted CSV)
  if (/^\d+$/.test(s) && s.length < 5) return false;
  // Reject common CSV garbage values
  const garbage = [
    'shopify', 'variant', 'grouped', 'active', 'draft', 'true', 'false', 
    'undefined', 'null', 'simple', 'default title', 'quart', 'gallon',
    '1 qt', '1 gal', '2.5 gal', '6 gal', 'h moon hydro', 'hmoonhydro',
    'title', 'size', 'option', 'default', 'none'
  ];
  if (garbage.includes(s.toLowerCase())) return false;
  // Reject if it contains HTML tags or looks like description text
  if (s.includes('<') || s.includes('>')) return false;
  // Reject if longer than 50 chars (SKUs shouldn't be that long)
  if (s.length > 50) return false;
  // Reject if contains spaces (SKUs are usually single tokens)
  if (s.includes(' ') && !s.match(/^hmh\d+/i)) return false;
  return true;
}

/**
 * Normalize a title for matching (removes size suffixes, normalizes whitespace)
 */
function normalizeTitle(title: string | undefined): string {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  // Decode HTML entities
  t = t.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
  // Remove common size suffixes
  t = t.replace(/\s*-?\s*(\d+(\.\d+)?)\s*(qt|quart|gal|gallon|oz|ounce|lb|pound|ml|l|liter|litre)\s*$/i, '');
  // Remove numbers at end
  t = t.replace(/\s+\d+(\.\d+)?\s*$/i, '');
  // Remove extra whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Sanitize a handle to be Shopify-compatible
 */
function sanitizeHandle(raw: string): string {
  if (!raw) return '';
  let handle = raw.toLowerCase().trim();
  // Remove non-ASCII chars
  handle = handle.replace(/[^\x00-\x7F]/g, '');
  // Replace spaces and underscores with hyphens
  handle = handle.replace(/[\s_]+/g, '-');
  // Remove anything that's not alphanumeric or hyphen
  handle = handle.replace(/[^a-z0-9-]/g, '');
  // Collapse multiple hyphens
  handle = handle.replace(/-+/g, '-');
  // Remove leading/trailing hyphens
  handle = handle.replace(/^-+|-+$/g, '');
  return handle;
}

/**
 * Parse CSV content handling multi-line quoted fields properly
 */
function parseCsvContent(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      // End of row
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      if (char === '\r') i++; // Skip \n in \r\n
    } else if (char === '\r' && !inQuotes) {
      // Standalone \r as line ending
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Don't forget the last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

function loadCsv<T>(path: string): T[] {
  if (!existsSync(path)) {
    console.log(`   ⚠️  File not found: ${path}`);
    return [];
  }
  
  const content = readFileSync(path, 'utf-8');
  const allRows = parseCsvContent(content);
  if (allRows.length === 0) return [];
  
  const headers = allRows[0];
  const rows: T[] = [];
  
  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row as T);
  }
  
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loaders
// ─────────────────────────────────────────────────────────────────────────────

function loadVariantConsolidation(): ConsolidatedRow[] {
  const path = resolve(OUTPUTS_DIR, 'variant_consolidation/variant_consolidation.csv');
  console.log('📂 Loading variant_consolidation.csv...');
  const allRows = loadCsv<ConsolidatedRow>(path);
  
  // Filter out corrupted rows
  let skipped = 0;
  const rows = allRows.filter(row => {
    const handle = row.Handle?.toLowerCase().trim();
    if (!isValidHandle(handle)) {
      skipped++;
      return false;
    }
    return true;
  });
  
  if (skipped > 0) {
    console.log(`   ✓ ${rows.length} variant rows loaded (${skipped} corrupted rows skipped)`);
  } else {
    console.log(`   ✓ ${rows.length} variant rows loaded`);
  }
  return rows;
}

function loadMasterCatalog(): CatalogRow[] {
  const path = resolve(CSV_DIR, 'master_catalog_index.csv');
  console.log('📂 Loading master_catalog_index.csv...');
  const allRows = loadCsv<CatalogRow>(path);
  
  // Filter out corrupted rows
  let skipped = 0;
  const rows = allRows.filter(row => {
    const handle = row.handle?.toLowerCase().trim();
    if (!isValidHandle(handle)) {
      skipped++;
      return false;
    }
    // Skip rows with no price (likely category pages)
    const price = parseFloat(row.price || '0');
    if (price <= 0 && !row.title) {
      skipped++;
      return false;
    }
    return true;
  });
  
  console.log(`   ✓ ${rows.length} catalog products loaded (${skipped} corrupted rows skipped)`);
  return rows;
}

function loadPOSAlignment(): Map<string, POSAlignment> {
  const path = resolve(OUTPUTS_DIR, 'inventory/pos_shopify_alignment.csv');
  console.log('📂 Loading POS alignment...');
  const rows = loadCsv<POSAlignment>(path);
  
  const map = new Map<string, POSAlignment>();
  for (const row of rows) {
    const handle = row.Handle?.toLowerCase().trim();
    if (handle && row['POS Item Number']) {
      map.set(handle, row);
    }
  }
  
  console.log(`   ✓ ${map.size} POS alignments loaded`);
  return map;
}

function loadPOSInventory(): Map<string, { upc: string; vendor: string; manufacturer: string; cost: string }> {
  const path = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  console.log('📂 Loading POS inventory for UPC/Vendor data...');
  
  if (!existsSync(path)) {
    console.log('   ⚠️  POS inventory not found');
    return new Map();
  }
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const itemNumIdx = headers.indexOf('Item Number');
  const upcIdx = headers.indexOf('UPC');
  const vendorIdx = headers.indexOf('Vendor Name');
  const mfgIdx = headers.indexOf('Manufacturer');
  const costIdx = headers.indexOf('Average Unit Cost');
  
  const map = new Map<string, { upc: string; vendor: string; manufacturer: string; cost: string }>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const itemNum = values[itemNumIdx]?.trim();
    if (itemNum) {
      map.set(itemNum, {
        upc: values[upcIdx] || '',
        vendor: values[vendorIdx] || '',
        manufacturer: values[mfgIdx] || '',
        cost: values[costIdx] || '',
      });
    }
  }
  
  console.log(`   ✓ ${map.size} POS items loaded`);
  return map;
}

function loadWooImageMap(): Map<string, string> {
  const path = resolve(CSV_DIR, 'woo_image_map.json');
  console.log('📂 Loading WooCommerce image map...');
  
  if (!existsSync(path)) {
    console.log('   ⚠️  Image map not found');
    return new Map();
  }
  
  try {
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content);
    const map = new Map<string, string>(Object.entries(data));
    console.log(`   ✓ ${map.size} image mappings loaded`);
    return map;
  } catch (e) {
    console.log('   ⚠️  Failed to parse image map');
    return new Map();
  }
}

function loadWooProducts(): Map<string, { description: string; weight: string; tags: string }> {
  const path = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  console.log('📂 Loading WooCommerce products for enrichment...');
  
  if (!existsSync(path)) {
    console.log('   ⚠️  WooCommerce export not found');
    return new Map();
  }
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const slugIdx = headers.indexOf('Slug');
  const descIdx = headers.indexOf('Product description');
  const weightIdx = headers.indexOf('Weight');
  const tagsIdx = headers.indexOf('Product tags');
  
  const map = new Map<string, { description: string; weight: string; tags: string }>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const slug = values[slugIdx]?.trim().toLowerCase();
    if (slug) {
      map.set(slug, {
        description: values[descIdx] || '',
        weight: values[weightIdx] || '',
        tags: values[tagsIdx] || '',
      });
    }
  }
  
  console.log(`   ✓ ${map.size} WooCommerce products loaded`);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Converters
// ─────────────────────────────────────────────────────────────────────────────

function mapCategory(category: string): string {
  if (!category) return 'Home & Garden > Lawn & Garden > Gardening > Hydroponics';
  
  const lower = category.toLowerCase().trim();
  
  // Check direct mapping
  if (CATEGORY_MAP[lower]) {
    return CATEGORY_MAP[lower];
  }
  
  // Check partial matches
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  
  // Default to hydroponics
  return 'Home & Garden > Lawn & Garden > Gardening > Hydroponics';
}

function convertConsolidatedToShopify(
  row: ConsolidatedRow,
  posData: Map<string, POSAlignment>,
  posInventory: Map<string, { upc: string; vendor: string; manufacturer: string; cost: string }>,
  wooImages: Map<string, string>,
  isFirstVariant: boolean
): ShopifyImportRow {
  const handle = row.Handle?.toLowerCase().trim();
  const posAlign = posData.get(handle);
  let upc = row.Variant_Barcode || '';
  let cost = '';
  let vendor = row.Vendor || '';
  
  // Enrich from POS if matched
  if (posAlign?.['POS Item Number']) {
    const posItem = posInventory.get(posAlign['POS Item Number']);
    if (posItem) {
      if (!upc && posItem.upc) upc = posItem.upc;
      if (posItem.cost) cost = posItem.cost;
      if (!vendor && posItem.manufacturer) vendor = posItem.manufacturer;
      if (!vendor && posItem.vendor) vendor = posItem.vendor;
    }
  }
  
  // Get image from consolidation or fallback to Woo map
  let imageUrl = row.Image_URL || '';
  if (!imageUrl && wooImages.has(handle)) {
    imageUrl = wooImages.get(handle) || '';
  }
  
  // Convert weight to grams (assumes lbs)
  let grams = '';
  if (row.Variant_Weight) {
    const weight = parseFloat(row.Variant_Weight);
    if (!isNaN(weight) && weight > 0) {
      const unit = (row.Variant_Weight_Unit || 'lb').toLowerCase();
      if (unit === 'lb' || unit === 'lbs') {
        grams = Math.round(weight * 453.592).toString();
      } else if (unit === 'kg') {
        grams = Math.round(weight * 1000).toString();
      } else if (unit === 'g') {
        grams = Math.round(weight).toString();
      } else {
        grams = Math.round(weight * 453.592).toString(); // Default to lbs
      }
    }
  }
  
  return {
    Handle: handle,
    Title: isFirstVariant ? row.Product_Name : '',
    'Body (HTML)': isFirstVariant ? row.Description : '',
    Vendor: isFirstVariant ? vendor : '',
    'Product Category': isFirstVariant ? mapCategory(row.Product_Type) : '',
    Type: isFirstVariant ? row.Product_Type : '',
    Tags: isFirstVariant ? row.Tags : '',
    Published: 'true',
    'Option1 Name': row.Variant_Option1_Name || 'Size',
    'Option1 Value': row.Variant_Option1 || 'Default Title',
    'Option2 Name': '',
    'Option2 Value': '',
    'Option3 Name': '',
    'Option3 Value': '',
    'Variant SKU': isValidSKU(row.Variant_SKU) ? row.Variant_SKU : '',
    'Variant Grams': grams,
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': row.Variant_Inventory || '0',
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Price': row.Variant_Price,
    'Variant Compare At Price': row.Variant_Compare_Price || '',
    'Variant Requires Shipping': 'true',
    'Variant Taxable': 'true',
    'Variant Barcode': upc,
    'Image Src': isFirstVariant ? imageUrl : '',
    'Image Position': isFirstVariant && imageUrl ? '1' : '',
    'Image Alt Text': isFirstVariant && imageUrl ? row.Product_Name : '',
    'SEO Title': isFirstVariant ? row.SEO_Title : '',
    'SEO Description': isFirstVariant ? row.SEO_Description : '',
    'Gift Card': 'false',
    'Cost per item': cost,
    Status: row.Status?.toLowerCase() === 'draft' ? 'draft' : 'active',
  };
}

function convertCatalogToShopify(
  row: CatalogRow,
  posData: Map<string, POSAlignment>,
  posInventory: Map<string, { upc: string; vendor: string; manufacturer: string; cost: string }>,
  wooImages: Map<string, string>,
  wooProducts: Map<string, { description: string; weight: string; tags: string }>
): ShopifyImportRow {
  const handle = row.handle?.toLowerCase().trim();
  const posAlign = posData.get(handle);
  let upc = '';
  let cost = row.cost || '';
  let vendor = row.vendor || row.brand || '';
  let description = row.description || '';
  let weight = '';
  let tags = row.tags || '';
  
  // Enrich from WooCommerce
  const wooData = wooProducts.get(handle);
  if (wooData) {
    if (!description && wooData.description) description = wooData.description;
    if (!weight && wooData.weight) weight = wooData.weight;
    if (!tags && wooData.tags) tags = wooData.tags;
  }
  
  // Enrich from POS if matched
  if (posAlign?.['POS Item Number']) {
    const posItem = posInventory.get(posAlign['POS Item Number']);
    if (posItem) {
      if (!upc && posItem.upc) upc = posItem.upc;
      if (!cost && posItem.cost) cost = posItem.cost;
      if (!vendor && posItem.manufacturer) vendor = posItem.manufacturer;
      if (!vendor && posItem.vendor) vendor = posItem.vendor;
    }
  }
  
  // Get image
  let imageUrl = row.images || '';
  if (!imageUrl && wooImages.has(handle)) {
    imageUrl = wooImages.get(handle) || '';
  }
  
  // Convert weight to grams
  let grams = '';
  if (weight) {
    const w = parseFloat(weight);
    if (!isNaN(w) && w > 0) {
      grams = Math.round(w * 453.592).toString(); // Assume lbs
    }
  }
  
  return {
    Handle: handle,
    Title: row.title,
    'Body (HTML)': description,
    Vendor: vendor || 'H Moon Hydro',
    'Product Category': mapCategory(row.primary_category),
    Type: row.product_type || row.primary_category,
    Tags: tags,
    Published: 'true',
    'Option1 Name': 'Title',
    'Option1 Value': 'Default Title',
    'Option2 Name': '',
    'Option2 Value': '',
    'Option3 Name': '',
    'Option3 Value': '',
    'Variant SKU': isValidSKU(row.sku) ? row.sku : '',
    'Variant Grams': grams,
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': row.inventory_qty || '0',
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Price': row.price,
    'Variant Compare At Price': row.compare_at_price || '',
    'Variant Requires Shipping': 'true',
    'Variant Taxable': 'true',
    'Variant Barcode': upc,
    'Image Src': imageUrl,
    'Image Position': imageUrl ? '1' : '',
    'Image Alt Text': imageUrl ? row.title : '',
    'SEO Title': '',
    'SEO Description': '',
    'Gift Card': 'false',
    'Cost per item': cost,
    Status: row.status?.toLowerCase() === 'draft' ? 'draft' : 'active',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           H MOON HYDRO - UNIFIED IMPORT BUILDER                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be written\n');
  }
  
  // Load all data sources
  const consolidatedRows = loadVariantConsolidation();
  const catalogRows = loadMasterCatalog();
  const posAlignment = loadPOSAlignment();
  const posInventory = loadPOSInventory();
  const wooImages = loadWooImageMap();
  const wooProducts = loadWooProducts();
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('MERGING DATA SOURCES');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  // Get handles, SKUs, AND TITLES from consolidated products for deduplication
  const consolidatedHandles = new Set<string>();
  const consolidatedSKUs = new Set<string>();
  const consolidatedTitles = new Set<string>();
  for (const row of consolidatedRows) {
    if (row.Handle) {
      consolidatedHandles.add(row.Handle.toLowerCase().trim());
    }
    // Collect all SKUs from consolidated variants (column is Variant_SKU)
    const sku = (row['Variant_SKU'] || row['Variant SKU'])?.trim();
    if (sku && isValidSKU(sku)) {
      consolidatedSKUs.add(sku.toLowerCase());
    }
    // Collect variant titles for title-based deduplication
    const variantTitle = row['Variant_Title'] || row.Variant_Title;
    if (variantTitle) {
      consolidatedTitles.add(normalizeTitle(variantTitle));
    }
  }
  console.log(`\n📊 Consolidated products: ${consolidatedHandles.size} unique handles (${consolidatedRows.length} variant rows)`);
  console.log(`📊 Consolidated SKUs: ${consolidatedSKUs.size} unique valid SKUs`);
  console.log(`📊 Consolidated variant titles: ${consolidatedTitles.size} unique titles`);
  
  // Filter catalog to exclude consolidated handles, SKUs, AND matching titles
  let skuDuplicatesExcluded = 0;
  let titleDuplicatesExcluded = 0;
  const simpleProducts = catalogRows.filter(row => {
    const handle = row.handle?.toLowerCase().trim();
    if (!handle) return false;
    
    // Exclude if handle is in consolidated products
    if (consolidatedHandles.has(handle)) return false;
    
    // Exclude if SKU already exists in consolidated products (critical deduplication!)
    const sku = row.sku?.trim();
    if (sku && isValidSKU(sku) && consolidatedSKUs.has(sku.toLowerCase())) {
      skuDuplicatesExcluded++;
      return false;
    }
    
    // Exclude if title matches a consolidated variant title (prevents duplicate products)
    const title = row.title?.trim();
    if (title && consolidatedTitles.has(normalizeTitle(title))) {
      titleDuplicatesExcluded++;
      return false;
    }
    
    return true;
  });
  console.log(`📊 Simple products (not consolidated): ${simpleProducts.length}`);
  console.log(`📊 Excluded (SKU already in consolidated): ${skuDuplicatesExcluded}`);
  console.log(`📊 Excluded (title matches variant): ${titleDuplicatesExcluded}`);
  
  // Build output rows
  const outputRows: ShopifyImportRow[] = [];
  
  // 1. Add consolidated products (grouped with variants)
  console.log('\n🔄 Processing consolidated products...');
  let currentHandle = '';
  let isFirstVariant = true;
  
  for (const row of consolidatedRows) {
    const handle = row.Handle?.toLowerCase().trim();
    if (handle !== currentHandle) {
      currentHandle = handle;
      isFirstVariant = true;
    } else {
      isFirstVariant = false;
    }
    
    const shopifyRow = convertConsolidatedToShopify(
      row, posAlignment, posInventory, wooImages, isFirstVariant
    );
    outputRows.push(shopifyRow);
    isFirstVariant = false;
  }
  console.log(`   ✓ Added ${consolidatedRows.length} rows from consolidated products`);
  
  // 2. Add simple products
  console.log('\n🔄 Processing simple products...');
  let simpleSkipped = 0;
  for (const row of simpleProducts) {
    // Skip products with zero/empty price
    const price = parseFloat(row.price || '0');
    if (price <= 0) {
      simpleSkipped++;
      continue;
    }
    const shopifyRow = convertCatalogToShopify(
      row, posAlignment, posInventory, wooImages, wooProducts
    );
    outputRows.push(shopifyRow);
  }
  console.log(`   ✓ Added ${simpleProducts.length - simpleSkipped} simple products (${simpleSkipped} skipped - no price)`);
  
  // Stats
  const stats = {
    totalRows: outputRows.length,
    consolidatedProducts: consolidatedHandles.size,
    consolidatedVariants: consolidatedRows.length,
    simpleProducts: simpleProducts.length,
    withDescription: outputRows.filter(r => r['Body (HTML)'].length > 50).length,
    withImage: outputRows.filter(r => r['Image Src']).length,
    withUPC: outputRows.filter(r => r['Variant Barcode']).length,
    withCost: outputRows.filter(r => r['Cost per item']).length,
    activeProducts: outputRows.filter(r => r.Status === 'active').length,
    draftProducts: outputRows.filter(r => r.Status === 'draft').length,
  };
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('UNIFIED IMPORT STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Total rows:              ${stats.totalRows}`);
  console.log(`Consolidated products:   ${stats.consolidatedProducts} (${stats.consolidatedVariants} variants)`);
  console.log(`Simple products:         ${stats.simpleProducts}`);
  console.log(`With description (>50):  ${stats.withDescription} (${(stats.withDescription/stats.totalRows*100).toFixed(1)}%)`);
  console.log(`With image:              ${stats.withImage} (${(stats.withImage/stats.totalRows*100).toFixed(1)}%)`);
  console.log(`With UPC barcode:        ${stats.withUPC} (${(stats.withUPC/stats.totalRows*100).toFixed(1)}%)`);
  console.log(`With cost:               ${stats.withCost} (${(stats.withCost/stats.totalRows*100).toFixed(1)}%)`);
  console.log(`Active products:         ${stats.activeProducts}`);
  console.log(`Draft products:          ${stats.draftProducts}`);
  
  if (isDryRun) {
    console.log('\n🔍 DRY RUN - No files written');
    return;
  }
  
  // Write CSV
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src',
    'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description', 'Gift Card',
    'Cost per item', 'Status'
  ];
  
  const csvLines = [headers.join(',')];
  
  for (const row of outputRows) {
    const values = headers.map(h => escapeCsvField((row as any)[h] || ''));
    csvLines.push(values.join(','));
  }
  
  const outputPath = resolve(OUTPUTS_DIR, 'unified_import.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`\n✅ Written: ${outputPath}`);
  
  // Write stats JSON
  const statsPath = resolve(OUTPUTS_DIR, 'unified_import_stats.json');
  writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  console.log(`✅ Written: ${statsPath}`);
  
  console.log('\n🎉 UNIFIED IMPORT COMPLETE!');
  console.log('\nNext steps:');
  console.log('  1. Review outputs/unified_import.csv');
  console.log('  2. Run: npx tsx src/cli/wipeShopifyStore.ts --confirm');
  console.log('  3. Import unified_import.csv via Shopify Admin');
}

main();
