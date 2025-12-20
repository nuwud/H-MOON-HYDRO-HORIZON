/**
 * buildShopifyImport.ts
 * 
 * Generates Shopify-ready import CSVs from master_catalog_index.csv
 * 
 * Outputs:
 *   - shopify_import_ready.csv    (publishable products)
 *   - shopify_import_draft.csv    (needs work, imported as draft)
 *   - sku_resolution_report.csv   (SKU source tracking)
 * 
 * SKU Priority:
 *   1. Existing Shopify Variant SKU (don't change what's already there)
 *   2. Inventory Item Number (real vendor SKU)
 *   3. WooCommerce SKU
 *   4. Derive from handle: HMH-{CATEGORY_CODE}-{HANDLE_HASH}
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogProduct {
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

interface ShopifyProduct {
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
  Status: string;
}

interface SkuResolution {
  handle: string;
  title: string;
  final_sku: string;
  sku_source: 'shopify' | 'inventory' | 'woo' | 'derived' | 'none';
  shopify_sku: string;
  inventory_sku: string;
  woo_sku: string;
}

// Category codes for derived SKUs
const CATEGORY_CODES: Record<string, string> = {
  nutrients: 'NUT',
  grow_media: 'GRO',
  irrigation: 'IRR',
  ph_meters: 'PHM',
  grow_lights: 'LIT',
  hid_bulbs: 'HID',
  airflow: 'AIR',
  odor_control: 'ODR',
  water_filtration: 'WAT',
  containers_pots: 'POT',
  propagation: 'PRO',
  seeds: 'SED',
  harvesting: 'HAR',
  trimming: 'TRM',
  pest_control: 'PES',
  co2: 'CO2',
  books: 'BOK',
  electrical_supplies: 'ELE',
  environmental_monitors: 'ENV',
  controllers: 'CTL',
  ventilation_accessories: 'VNT',
  grow_room_materials: 'MAT',
  extraction: 'EXT',
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

function escapeCsvField(field: string): string {
  if (!field) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loaders
// ─────────────────────────────────────────────────────────────────────────────

function loadMasterCatalog(): CatalogProduct[] {
  const path = resolve(CSV_DIR, 'master_catalog_index.csv');
  console.log('📂 Loading master_catalog_index.csv...');
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const products: CatalogProduct[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    products.push(row as unknown as CatalogProduct);
  }
  
  console.log(`   Loaded ${products.length} products`);
  return products;
}

function loadShopifySkus(): Map<string, string> {
  const path = resolve(CSV_DIR, 'products_export_1.csv');
  if (!existsSync(path)) return new Map();
  
  console.log('📂 Loading Shopify SKUs...');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const handleIdx = headers.findIndex(h => h === 'Handle');
  const skuIdx = headers.findIndex(h => h === 'Variant SKU');
  
  const result = new Map<string, string>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const handle = values[handleIdx]?.trim().toLowerCase();
    const sku = values[skuIdx]?.trim();
    if (handle && sku) {
      result.set(handle, sku);
    }
  }
  
  console.log(`   Found ${result.size} existing Shopify SKUs`);
  return result;
}

function loadInventorySkus(): Map<string, string> {
  const path = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  if (!existsSync(path)) return new Map();
  
  console.log('📂 Loading Inventory Item Numbers...');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const itemNumIdx = headers.findIndex(h => h === 'Item Number');
  const itemNameIdx = headers.findIndex(h => h === 'Item Name');
  
  const result = new Map<string, string>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const itemNum = values[itemNumIdx]?.trim();
    const itemName = values[itemNameIdx]?.trim().toLowerCase();
    if (itemName && itemNum) {
      result.set(itemName, itemNum);
    }
  }
  
  console.log(`   Found ${result.size} inventory item numbers`);
  return result;
}

function loadWooSkus(): Map<string, string> {
  const path = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  if (!existsSync(path)) return new Map();
  
  console.log('📂 Loading WooCommerce SKUs...');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  // WooCommerce uses "Product Name" and "Sku" columns
  const nameIdx = headers.findIndex(h => h === 'Product Name' || h === 'Name');
  const skuIdx = headers.findIndex(h => h === 'Sku' || h.toLowerCase() === 'sku');
  
  const result = new Map<string, string>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const name = values[nameIdx]?.trim().toLowerCase();
    const sku = values[skuIdx]?.trim();
    // Only use SKUs that look like actual SKUs (not prices, not "instock", etc.)
    if (name && sku && isValidSku(sku)) {
      result.set(name, sku);
    }
  }
  
  console.log(`   Found ${result.size} WooCommerce SKUs`);
  return result;
}

// Validate that a string looks like a real SKU
function isValidSku(sku: string): boolean {
  if (!sku || sku.length < 2) return false;
  // Reject common non-SKU values
  const invalidPatterns = [
    /^(yes|no|true|false)$/i,
    /^(instock|outofstock|onbackorder)$/i,
    /^\d+\.\d{2}$/, // Prices like "14.95"
    /^[a-z]+$/, // Single lowercase word
  ];
  for (const pattern of invalidPatterns) {
    if (pattern.test(sku)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKU Resolution
// ─────────────────────────────────────────────────────────────────────────────

function generateDerivedSku(handle: string, category: string): string {
  const catCode = CATEGORY_CODES[category] || 'GEN';
  const hash = createHash('md5').update(handle).digest('hex').substring(0, 6).toUpperCase();
  return `HMH-${catCode}-${hash}`;
}

function resolveSku(
  product: CatalogProduct,
  shopifySkus: Map<string, string>,
  inventorySkus: Map<string, string>,
  wooSkus: Map<string, string>
): SkuResolution {
  const handle = product.handle?.toLowerCase() || '';
  const title = product.title?.toLowerCase() || '';
  
  // Priority 1: Existing Shopify SKU
  const shopifySku = shopifySkus.get(handle) || '';
  if (shopifySku) {
    return {
      handle: product.handle,
      title: product.title,
      final_sku: shopifySku,
      sku_source: 'shopify',
      shopify_sku: shopifySku,
      inventory_sku: inventorySkus.get(title) || '',
      woo_sku: wooSkus.get(title) || '',
    };
  }
  
  // Priority 2: Inventory Item Number
  const inventorySku = inventorySkus.get(title) || '';
  if (inventorySku) {
    return {
      handle: product.handle,
      title: product.title,
      final_sku: inventorySku,
      sku_source: 'inventory',
      shopify_sku: '',
      inventory_sku: inventorySku,
      woo_sku: wooSkus.get(title) || '',
    };
  }
  
  // Priority 3: WooCommerce SKU (if it looks like a real SKU, not just a number)
  const wooSku = wooSkus.get(title) || '';
  if (wooSku && !/^\d+$/.test(wooSku)) {
    return {
      handle: product.handle,
      title: product.title,
      final_sku: wooSku,
      sku_source: 'woo',
      shopify_sku: '',
      inventory_sku: '',
      woo_sku: wooSku,
    };
  }
  
  // Priority 4: Derive from handle
  if (handle) {
    const derivedSku = generateDerivedSku(handle, product.primary_category);
    return {
      handle: product.handle,
      title: product.title,
      final_sku: derivedSku,
      sku_source: 'derived',
      shopify_sku: '',
      inventory_sku: '',
      woo_sku: wooSku,
    };
  }
  
  // No SKU possible
  return {
    handle: product.handle,
    title: product.title,
    final_sku: '',
    sku_source: 'none',
    shopify_sku: '',
    inventory_sku: '',
    woo_sku: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish Gates
// ─────────────────────────────────────────────────────────────────────────────

interface PublishGate {
  ready: boolean;
  reasons: string[];
}

function checkPublishGates(product: CatalogProduct, sku: string): PublishGate {
  const reasons: string[] = [];
  
  // Must have basics
  if (!product.title?.trim()) reasons.push('no_title');
  if (!product.handle?.trim()) reasons.push('no_handle');
  if (!sku) reasons.push('no_sku');
  
  // Should have merchandising data
  if (!product.price || parseFloat(product.price) <= 0) reasons.push('no_price');
  if (!product.brand || product.brand === 'Unknown') reasons.push('unknown_brand');
  if (!product.primary_category) reasons.push('no_category');
  
  // Nice to have (don't block, but track)
  if (!product.images) reasons.push('no_images');
  if (!product.description) reasons.push('no_description');
  
  // Ready if we have the essentials: title, handle, sku, price
  const ready = Boolean(
    product.title?.trim() &&
    product.handle?.trim() &&
    sku &&
    product.price &&
    parseFloat(product.price) > 0
  );
  
  return { ready, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Shopify Row
// ─────────────────────────────────────────────────────────────────────────────

function buildShopifyRow(product: CatalogProduct, sku: string, status: 'active' | 'draft'): ShopifyProduct {
  // Build tags from categories
  const tags: string[] = [];
  if (product.primary_category) {
    tags.push(`category:${product.primary_category}`);
  }
  if (product.secondary_categories) {
    product.secondary_categories.split(';').forEach(c => {
      const cat = c.trim();
      if (cat && cat !== product.primary_category) {
        tags.push(`category:${cat}`);
      }
    });
  }
  if (product.brand && product.brand !== 'Unknown') {
    tags.push(`brand:${product.brand}`);
  }
  // Add existing tags
  if (product.tags) {
    product.tags.split(',').forEach(t => {
      const tag = t.trim();
      if (tag) tags.push(tag);
    });
  }
  
  // Clean description (remove excessive HTML)
  let description = product.description || '';
  if (description.length > 5000) {
    description = description.substring(0, 5000) + '...';
  }
  
  // Generate SEO title/description
  const seoTitle = product.title ? `${product.title} | H Moon Hydro` : '';
  const seoDesc = product.title && product.brand 
    ? `Shop ${product.title} by ${product.brand} at H Moon Hydro. Quality hydroponic supplies for serious growers.`
    : '';
  
  return {
    Handle: product.handle || '',
    Title: product.title || '',
    'Body (HTML)': description,
    Vendor: product.brand || 'H Moon Hydro',
    'Product Category': '', // Shopify product taxonomy
    Type: formatProductType(product.primary_category),
    Tags: [...new Set(tags)].join(', '),
    Published: status === 'active' ? 'TRUE' : 'FALSE',
    'Option1 Name': 'Title',
    'Option1 Value': 'Default Title',
    'Option2 Name': '',
    'Option2 Value': '',
    'Option3 Name': '',
    'Option3 Value': '',
    'Variant SKU': sku,
    'Variant Grams': '0',
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': product.inventory_qty || '0',
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Price': product.price || '0.00',
    'Variant Compare At Price': product.compare_at_price || '',
    'Variant Requires Shipping': 'TRUE',
    'Variant Taxable': 'TRUE',
    'Variant Barcode': '',
    'Image Src': product.images || '',
    'Image Position': product.images ? '1' : '',
    'Image Alt Text': product.title || '',
    'SEO Title': seoTitle,
    'SEO Description': seoDesc,
    'Gift Card': 'FALSE',
    Status: status,
  };
}

function formatProductType(category: string): string {
  if (!category) return '';
  return category
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🛒 Building Shopify Import CSVs');
  console.log('================================\n');
  
  // Load data
  const catalog = loadMasterCatalog();
  const shopifySkus = loadShopifySkus();
  const inventorySkus = loadInventorySkus();
  const wooSkus = loadWooSkus();
  
  console.log();
  
  // Resolve SKUs and check publish gates
  console.log('🔧 Resolving SKUs and checking publish gates...');
  
  const readyProducts: ShopifyProduct[] = [];
  const draftProducts: ShopifyProduct[] = [];
  const skuResolutions: SkuResolution[] = [];
  
  const stats = {
    total: 0,
    ready: 0,
    draft: 0,
    skuSources: {
      shopify: 0,
      inventory: 0,
      woo: 0,
      derived: 0,
      none: 0,
    },
    issues: new Map<string, number>(),
  };
  
  for (const product of catalog) {
    stats.total++;
    
    // Resolve SKU
    const resolution = resolveSku(product, shopifySkus, inventorySkus, wooSkus);
    skuResolutions.push(resolution);
    stats.skuSources[resolution.sku_source]++;
    
    // Check publish gates
    const gates = checkPublishGates(product, resolution.final_sku);
    gates.reasons.forEach(r => {
      stats.issues.set(r, (stats.issues.get(r) || 0) + 1);
    });
    
    // Build Shopify row
    if (gates.ready) {
      readyProducts.push(buildShopifyRow(product, resolution.final_sku, 'active'));
      stats.ready++;
    } else {
      draftProducts.push(buildShopifyRow(product, resolution.final_sku, 'draft'));
      stats.draft++;
    }
  }
  
  console.log(`   Ready to publish: ${stats.ready}`);
  console.log(`   Draft (needs work): ${stats.draft}`);
  
  // Write Shopify CSVs
  const shopifyHeaders: (keyof ShopifyProduct)[] = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description',
    'Gift Card', 'Status'
  ];
  
  // Write ready products
  const readyLines = [
    shopifyHeaders.join(','),
    ...readyProducts.map(p => shopifyHeaders.map(h => escapeCsvField(p[h])).join(','))
  ];
  writeFileSync(resolve(CSV_DIR, 'shopify_import_ready.csv'), readyLines.join('\n'), 'utf-8');
  console.log(`\n✅ Written: CSVs/shopify_import_ready.csv (${readyProducts.length} products)`);
  
  // Write draft products
  const draftLines = [
    shopifyHeaders.join(','),
    ...draftProducts.map(p => shopifyHeaders.map(h => escapeCsvField(p[h])).join(','))
  ];
  writeFileSync(resolve(CSV_DIR, 'shopify_import_draft.csv'), draftLines.join('\n'), 'utf-8');
  console.log(`✅ Written: CSVs/shopify_import_draft.csv (${draftProducts.length} products)`);
  
  // Write SKU resolution report
  const skuHeaders = ['handle', 'title', 'final_sku', 'sku_source', 'shopify_sku', 'inventory_sku', 'woo_sku'];
  const skuLines = [
    skuHeaders.join(','),
    ...skuResolutions.map(r => skuHeaders.map(h => escapeCsvField(r[h as keyof SkuResolution])).join(','))
  ];
  writeFileSync(resolve(CSV_DIR, 'sku_resolution_report.csv'), skuLines.join('\n'), 'utf-8');
  console.log(`✅ Written: CSVs/sku_resolution_report.csv`);
  
  // Print summary
  console.log('\n══════════════════════════════════════════════════');
  console.log('📈 SHOPIFY IMPORT SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  
  console.log(`📦 Total Products: ${stats.total}`);
  console.log(`   ✅ Ready to Publish: ${stats.ready} (${((stats.ready / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   📝 Draft (needs work): ${stats.draft}`);
  
  console.log('\n🔑 SKU Resolution:');
  console.log(`   Shopify (existing): ${stats.skuSources.shopify}`);
  console.log(`   Inventory (item #): ${stats.skuSources.inventory}`);
  console.log(`   WooCommerce: ${stats.skuSources.woo}`);
  console.log(`   Derived (HMH-XXX-...): ${stats.skuSources.derived}`);
  console.log(`   No SKU possible: ${stats.skuSources.none}`);
  
  console.log('\n⚠️  Issue Breakdown:');
  const sortedIssues = [...stats.issues.entries()].sort((a, b) => b[1] - a[1]);
  for (const [issue, count] of sortedIssues) {
    console.log(`   ${issue}: ${count}`);
  }
  
  console.log('\n✅ Shopify Import CSVs complete!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Import shopify_import_ready.csv first (published products)');
  console.log('   2. Import shopify_import_draft.csv second (as drafts)');
  console.log('   3. Review sku_resolution_report.csv for SKU decisions');
  console.log('   4. Fix draft products: add images, prices, brands');
}

main().catch(console.error);
