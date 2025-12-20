#!/usr/bin/env npx tsx
/**
 * Build Master Catalog Index
 * 
 * PURPOSE:
 * - Create the FINAL unified catalog with all product data
 * - Merge data from category_index_draft.csv with full product details
 * - Include: SKU, handle, title, brand, primary_category, price, images, source
 * 
 * OUTPUT:
 * - CSVs/master_catalog_index.csv - The unified source of truth
 * 
 * RUN: npx tsx src/cli/buildMasterCatalogIndex.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

function readCsvAsMap(filePath: string, keyField: string): Map<string, Record<string, string>> {
  if (!existsSync(filePath)) return new Map();
  
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return new Map();

  const headers = parseCsvLine(lines[0]);
  const keyIdx = headers.findIndex(h => h.toLowerCase() === keyField.toLowerCase());
  if (keyIdx < 0) return new Map();

  const result = new Map<string, Record<string, string>>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const key = values[keyIdx]?.toLowerCase().trim();
    if (!key) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    result.set(key, row);
  }

  return result;
}

function escapeCsvField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Source Data
// ─────────────────────────────────────────────────────────────────────────────

function loadCategoryIndex(): Map<string, Record<string, string>> {
  const path = resolve(CSV_DIR, 'category_index_draft.csv');
  console.log('📂 Loading category_index_draft.csv...');
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const result = new Map<string, Record<string, string>>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    
    // Use SKU if available, otherwise handle
    const sku = row['sku']?.trim();
    const handle = row['handle']?.trim();
    const key = row['key']?.trim();
    
    if (sku) {
      result.set(`sku:${sku.toLowerCase()}`, row);
    }
    if (handle) {
      result.set(`handle:${handle.toLowerCase()}`, row);
    }
    if (key) {
      result.set(key.toLowerCase(), row);
    }
  }
  
  console.log(`   Loaded ${result.size} index entries`);
  return result;
}

function loadShopifyProducts(): Map<string, Record<string, string>> {
  const path = resolve(CSV_DIR, 'products_export_1.csv');
  if (!existsSync(path)) {
    console.log('⚠️  Shopify products not found');
    return new Map();
  }
  
  console.log('📂 Loading Shopify products...');
  const map = readCsvAsMap(path, 'Handle');
  console.log(`   Loaded ${map.size} Shopify products`);
  return map;
}

function loadWooProducts(): Map<string, Record<string, string>> {
  const path = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  if (!existsSync(path)) {
    console.log('⚠️  WooCommerce products not found');
    return new Map();
  }
  
  console.log('📂 Loading WooCommerce products...');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return new Map();

  const headers = parseCsvLine(lines[0]);
  const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
  const result = new Map<string, Record<string, string>>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const sku = values[skuIdx]?.trim().toLowerCase();
    if (!sku) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    result.set(sku, row);
  }
  
  console.log(`   Loaded ${result.size} WooCommerce products`);
  return result;
}

function loadInventory(): Map<string, Record<string, string>> {
  const path = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  if (!existsSync(path)) {
    console.log('⚠️  Inventory not found');
    return new Map();
  }
  
  console.log('📂 Loading inventory...');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return new Map();

  const headers = parseCsvLine(lines[0]);
  // Support multiple column names: "Item Number", "SKU", "Item #"
  const skuIdx = headers.findIndex(h => 
    h.toLowerCase() === 'item number' || 
    h.toLowerCase() === 'sku' || 
    h.toLowerCase() === 'item #'
  );
  const result = new Map<string, Record<string, string>>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const itemNum = values[skuIdx]?.trim().toLowerCase();
    if (!itemNum) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    // Also index by Item Name for fuzzy matching
    result.set(itemNum, row);
    
    // Index by Item Name too (lowercase, trimmed)
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'item name');
    if (nameIdx >= 0 && values[nameIdx]) {
      const itemName = values[nameIdx].trim().toLowerCase();
      if (!result.has(itemName)) {
        result.set(itemName, row);
      }
    }
  }
  
  console.log(`   Loaded ${result.size} inventory items`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Catalog
// ─────────────────────────────────────────────────────────────────────────────

function buildCatalog(
  categoryIndex: Map<string, Record<string, string>>,
  shopify: Map<string, Record<string, string>>,
  woo: Map<string, Record<string, string>>,
  inventory: Map<string, Record<string, string>>
): CatalogProduct[] {
  const catalog: CatalogProduct[] = [];
  const processed = new Set<string>();
  
  // Process each entry in category index
  for (const [key, indexRow] of categoryIndex) {
    // Skip duplicate keys (we may have sku: and handle: pointing to same product)
    const sku = indexRow['sku']?.trim() || '';
    const handle = indexRow['handle']?.trim() || '';
    const title = indexRow['title']?.trim() || '';
    const dedupeKey = sku || handle || key;
    
    if (processed.has(dedupeKey.toLowerCase())) continue;
    processed.add(dedupeKey.toLowerCase());
    
    // Get enrichment from other sources
    const shopifyData = handle ? shopify.get(handle.toLowerCase()) : undefined;
    const wooData = sku ? woo.get(sku.toLowerCase()) : undefined;
    // Try inventory by SKU first, then by title (Item Name)
    const invData = sku ? inventory.get(sku.toLowerCase()) : 
                    title ? inventory.get(title.toLowerCase()) : undefined;
    
    // Determine needs_review flags
    const needsReview: string[] = [];
    if (!shopifyData && !wooData) needsReview.push('no_source_match');
    if (indexRow['brand'] === 'Unknown') needsReview.push('unknown_brand');
    if (!sku) needsReview.push('no_sku');
    
    // Build catalog entry - Inventory CSV columns:
    // Item Number, Item Name, Regular Price, Average Unit Cost, MSRP, 
    // Qty 1, Qty 2..., Manufacturer, Vendor Name, UPC
    const product: CatalogProduct = {
      sku: sku || invData?.['Item Number'] || '',
      handle: handle || '',
      title: title || shopifyData?.['Title'] || wooData?.['Name'] || invData?.['Item Name'] || '',
      brand: indexRow['brand'] || 'Unknown',
      primary_category: indexRow['primary_category'] || '',
      secondary_categories: indexRow['categories']?.replace(indexRow['primary_category'] || '', '').replace(/;\s*;/g, ';').replace(/^;\s*|;\s*$/g, '') || '',
      price: shopifyData?.['Variant Price'] || wooData?.['Regular price'] || invData?.['Regular Price'] || '',
      compare_at_price: shopifyData?.['Variant Compare At Price'] || wooData?.['Sale price'] || invData?.['MSRP'] || '',
      cost: invData?.['Average Unit Cost'] || invData?.['Order Cost'] || '',
      inventory_qty: shopifyData?.['Variant Inventory Qty'] || invData?.['Qty 1'] || '',
      images: shopifyData?.['Image Src'] || wooData?.['Images'] || '',
      description: shopifyData?.['Body (HTML)'] || wooData?.['Description'] || invData?.['Item Description'] || '',
      vendor: shopifyData?.['Vendor'] || invData?.['Vendor Name'] || invData?.['Manufacturer'] || '',
      product_type: shopifyData?.['Type'] || wooData?.['Categories'] || invData?.['Department Name'] || '',
      tags: shopifyData?.['Tags'] || wooData?.['Tags'] || '',
      status: shopifyData?.['Status'] || 'active',
      source: [
        shopifyData ? 'shopify' : '',
        wooData ? 'woo' : '',
        invData ? 'inventory' : '',
      ].filter(Boolean).join(';') || 'masters_only',
      needs_review: needsReview.join('; ') || '',
    };
    
    catalog.push(product);
  }
  
  return catalog;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Building Master Catalog Index');
  console.log('=================================\n');
  
  // Load all data sources
  const categoryIndex = loadCategoryIndex();
  const shopify = loadShopifyProducts();
  const woo = loadWooProducts();
  const inventory = loadInventory();
  
  console.log();
  
  // Build catalog
  console.log('🔧 Building unified catalog...');
  const catalog = buildCatalog(categoryIndex, shopify, woo, inventory);
  console.log(`   Created ${catalog.length} catalog entries`);
  
  // Write catalog
  const headers: (keyof CatalogProduct)[] = [
    'sku', 'handle', 'title', 'brand', 'primary_category', 'secondary_categories',
    'price', 'compare_at_price', 'cost', 'inventory_qty', 'images', 'description',
    'vendor', 'product_type', 'tags', 'status', 'source', 'needs_review'
  ];
  
  const csvLines = [
    headers.join(','),
    ...catalog.map(p => headers.map(h => escapeCsvField(p[h])).join(','))
  ];
  
  const outputPath = resolve(CSV_DIR, 'master_catalog_index.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
  console.log(`\n✅ Written: CSVs/master_catalog_index.csv`);
  
  // Stats
  console.log('\n══════════════════════════════════════════════════');
  console.log('📈 CATALOG SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  
  console.log(`📦 Total Products: ${catalog.length}`);
  
  // By source
  const bySrc: Record<string, number> = {};
  catalog.forEach(p => {
    const sources = p.source.split(';');
    sources.forEach(s => {
      bySrc[s] = (bySrc[s] || 0) + 1;
    });
  });
  console.log('\n📋 By Source:');
  Object.entries(bySrc).sort((a, b) => b[1] - a[1]).forEach(([src, count]) => {
    console.log(`   ${src}: ${count}`);
  });
  
  // By category
  const byCat: Record<string, number> = {};
  catalog.forEach(p => {
    byCat[p.primary_category] = (byCat[p.primary_category] || 0) + 1;
  });
  console.log('\n📂 By Category:');
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
  
  // Needs review
  const needsReview = catalog.filter(p => p.needs_review);
  console.log(`\n⚠️  Needs Review: ${needsReview.length}`);
  
  const reviewReasons: Record<string, number> = {};
  needsReview.forEach(p => {
    p.needs_review.split(';').map(r => r.trim()).filter(Boolean).forEach(r => {
      reviewReasons[r] = (reviewReasons[r] || 0) + 1;
    });
  });
  Object.entries(reviewReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
    console.log(`   ${reason}: ${count}`);
  });
  
  // With prices
  const withPrice = catalog.filter(p => p.price && parseFloat(p.price) > 0);
  console.log(`\n💰 With Prices: ${withPrice.length}/${catalog.length} (${Math.round(withPrice.length/catalog.length*100)}%)`);
  
  // With images
  const withImages = catalog.filter(p => p.images);
  console.log(`🖼️  With Images: ${withImages.length}/${catalog.length} (${Math.round(withImages.length/catalog.length*100)}%)`);
  
  console.log('\n✅ Master Catalog Index complete!');
}

main().catch(console.error);
