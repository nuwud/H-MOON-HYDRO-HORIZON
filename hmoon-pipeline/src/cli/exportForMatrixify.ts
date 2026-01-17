/**
 * Export Missing Products to Matrixify-Compatible CSV
 * 
 * Creates a CSV that can be imported via Matrixify to add remaining products
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const CSV_DIR = resolve(__dirname, '../../../CSVs');

interface WooProduct {
  id: number;
  slug: string;
  title: string;
  status: string;
  description: string;
  sku: string;
  price: string;
  weight: string;
  category: string;
  tags: string;
  imageId: string;
}

interface ShopifyProduct {
  handle: string;
  sku: string;
}

async function shopifyGQL(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getExistingShopifyProducts(): Promise<Set<string>> {
  const handles = new Set<string>();
  const skus = new Set<string>();
  let cursor: string | null = null;

  console.log('📦 Fetching existing Shopify products...');

  while (true) {
    const query = `
      query($cursor: String) {
        products(first: 100, after: $cursor) {
          edges {
            node {
              handle
              variants(first: 10) {
                edges {
                  node {
                    sku
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const data = await shopifyGQL(query, { cursor });
    const edges = data.data?.products?.edges || [];

    for (const edge of edges) {
      handles.add(edge.node.handle.toLowerCase());
      for (const v of edge.node.variants?.edges || []) {
        if (v.node.sku) {
          skus.add(v.node.sku.toLowerCase());
        }
      }
    }

    const pageInfo = data.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
    
    if (handles.size % 500 === 0) {
      console.log(`   ...${handles.size} products fetched`);
    }
  }

  console.log(`   Found ${handles.size} existing products, ${skus.size} SKUs\n`);
  return new Set([...handles, ...skus]);
}

function loadWooProducts(): WooProduct[] {
  // Try multiple possible file names
  const possiblePaths = [
    resolve(CSV_DIR, 'woo_products_clean.json'),
    resolve(CSV_DIR, 'woo_products_full.json'),
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      const products = JSON.parse(readFileSync(path, 'utf-8'));
      console.log(`📄 Loaded ${products.length} WooCommerce products from ${path.split(/[\\/]/).pop()}\n`);
      return products;
    }
  }
  
  console.error('❌ No WooCommerce products file found');
  process.exit(1);
}

function escapeCSV(value: string): string {
  if (!value) return '';
  value = value.replace(/"/g, '""');
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value}"`;
  }
  return value;
}

function cleanHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('📤 MATRIXIFY EXPORT GENERATOR');
  console.log('='.repeat(50));
  console.log();

  const existingIds = await getExistingShopifyProducts();
  const wooProducts = loadWooProducts();

  // Filter to products not yet in Shopify
  const missingProducts = wooProducts.filter(p => {
    const handle = p.slug.toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    return !existingIds.has(handle) && (!sku || !existingIds.has(sku));
  });

  console.log(`📋 Found ${missingProducts.length} products not yet in Shopify\n`);

  if (missingProducts.length === 0) {
    console.log('✅ All products already imported!');
    return;
  }

  // Matrixify CSV headers
  const headers = [
    'Handle',
    'Title',
    'Body (HTML)',
    'Vendor',
    'Product Category',
    'Type',
    'Tags',
    'Published',
    'Option1 Name',
    'Option1 Value',
    'Variant SKU',
    'Variant Grams',
    'Variant Inventory Tracker',
    'Variant Inventory Qty',
    'Variant Inventory Policy',
    'Variant Fulfillment Service',
    'Variant Price',
    'Variant Compare At Price',
    'Variant Requires Shipping',
    'Variant Taxable',
    'Image Src',
    'Image Alt Text',
    'Status',
  ];

  const rows: string[] = [headers.join(',')];

  // Load attachment mappings for images
  let attachments: Record<string, string> = {};
  const attachPath = resolve(CSV_DIR, 'wp_attachments.txt');
  if (existsSync(attachPath)) {
    const lines = readFileSync(attachPath, 'utf-8').split('\n');
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        attachments[parts[0]] = parts[1];
      }
    }
  }

  for (const p of missingProducts) {
    // Extract vendor from category or title
    const knownVendors = [
      'General Hydroponics', 'Advanced Nutrients', 'Fox Farm', 'Botanicare',
      'Humboldt', 'EcoPlus', 'Can-Filter', 'Hydro-Logic', 'ONA', 'Hortilux',
      'Gavita', 'iPower', 'VIVOSUN', 'AC Infinity', 'Sun System', 'Dyna-Gro',
    ];
    let vendor = '';
    for (const v of knownVendors) {
      if (p.title.toLowerCase().includes(v.toLowerCase()) || 
          (p.category || '').toLowerCase().includes(v.toLowerCase())) {
        vendor = v;
        break;
      }
    }

    // Build image URL if we have local file
    let imageUrl = '';
    if (p.imageId && attachments[p.imageId]) {
      // Point to WooCommerce hosted image (if still available)
      imageUrl = `https://hmoonhydro.com/wp-content/uploads/${attachments[p.imageId]}`;
    }

    const row = [
      escapeCSV(p.slug),                           // Handle
      escapeCSV(p.title),                          // Title
      escapeCSV(p.description || ''),              // Body (HTML)
      escapeCSV(vendor),                           // Vendor
      '',                                          // Product Category
      escapeCSV(p.category || ''),                 // Type
      escapeCSV(p.tags || ''),                     // Tags
      'true',                                      // Published
      'Title',                                     // Option1 Name
      'Default Title',                             // Option1 Value
      escapeCSV(p.sku || ''),                      // Variant SKU
      escapeCSV(p.weight ? String(parseFloat(p.weight) * 453.592) : ''), // Variant Grams
      'shopify',                                   // Variant Inventory Tracker
      '10',                                        // Variant Inventory Qty
      'deny',                                      // Variant Inventory Policy
      'manual',                                    // Variant Fulfillment Service
      escapeCSV(p.price || '0'),                   // Variant Price
      '',                                          // Variant Compare At Price
      'true',                                      // Variant Requires Shipping
      'true',                                      // Variant Taxable
      escapeCSV(imageUrl),                         // Image Src
      escapeCSV(cleanHtml(p.title)),               // Image Alt Text
      'active',                                    // Status
    ];

    rows.push(row.join(','));
  }

  // Write CSV
  const outputPath = resolve(CSV_DIR, 'matrixify_import.csv');
  writeFileSync(outputPath, rows.join('\n'));

  console.log('✅ Matrixify CSV generated!');
  console.log(`📁 File: CSVs/matrixify_import.csv`);
  console.log(`📦 Products: ${missingProducts.length}`);
  console.log();
  console.log('To import:');
  console.log('1. Open Shopify Admin → Apps → Matrixify');
  console.log('2. Click "Import" → "Select file"');
  console.log('3. Upload matrixify_import.csv');
  console.log('4. Review mapping and start import');
}

main().catch(console.error);
