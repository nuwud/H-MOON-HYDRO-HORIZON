#!/usr/bin/env node
/**
 * buildGrowRoomMaterialsMaster.ts - HMoon Pipeline v0.2
 * 
 * Builds master_grow_room_materials.csv from unified product pool
 * Covers: Mylar, panda film, reflective materials, trellising, stakes, ties
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /\bGroPro\b/i, brand: 'GroPro' },
  { pattern: /\bScrog\b/i, brand: 'Scrog' },
  { pattern: /\bTrellis\s*Netting\b/i, brand: 'Trellis Netting' },
  { pattern: /\bSnapture\b/i, brand: 'Snapture' },
  { pattern: /\bGorilla\b/i, brand: 'Gorilla' },
];

function detectBrand(title: string): string {
  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(title)) return brand;
  }
  return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GrowRoomProduct {
  id: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  material_type: 'reflective' | 'trellis' | 'stake' | 'tie' | 'hanger' | 'liner' | 'accessory';
  size: string;
  price: string;
  sources: string;
  shopify: boolean;
  woo: boolean;
  inventory: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const headers: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      headers.push(current.trim().toLowerCase().replace(/\s+/g, '_'));
      current = '';
    } else {
      current += char;
    }
  }
  headers.push(current.trim().toLowerCase().replace(/\s+/g, '_'));
  
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values: string[] = [];
    current = '';
    inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grow Room Materials Detection
// ─────────────────────────────────────────────────────────────────────────────

function isGrowRoomMaterial(title: string, type: string, tags: string): boolean {
  const text = `${title} ${type} ${tags}`.toLowerCase();
  
  const includePatterns = [
    /\bmylar\b/i,
    /\bpanda\s*(?:film|liner)/i,
    /\breflective\s*(?:film|material|sheet)/i,
    /\bblack.*white.*(?:film|poly)/i,
    /\bwhite.*black.*(?:film|poly)/i,
    /\btrellis\s*(?:net|netting)/i,
    /\bscrog\b/i,
    /\bplant\s*(?:stake|tie|clip)/i,
    /\bbamboo\s*stake/i,
    /\btomato\s*(?:stake|cage)/i,
    /\bplant\s*yoyo/i,
    /\byoyo\s*(?:hanger|clip)/i,
    /\blight\s*hanger/i,
    /\brope\s*ratchet/i,
    /\bratchet\s*(?:hanger|strap)/i,
    /\bsnapture\b/i,
    /\bdovetail\b/i,
    /\bfoot\s*base\b/i,
    /\bsupport\s*(?:stake|ring|cage)/i,
    /\bgrow\s*room.*(?:liner|film)/i,
    /\bpond\s*liner/i,
    /multilayer.*film/i,
    /\bthick\b.*(?:mil|film|liner)/i,
  ];
  
  const excludePatterns = [
    /\bnutrient\b/i,
    /\bfertilizer\b/i,
    /\bgrow\s*(?:light|tent)\b/i,
    /\bfan\b|\bfilter\b|\bduct\b/i,
    /\bballast\b|\bhps\b|\bled\b/i,
    /\bpump\b|\breservoir\b/i,
  ];
  
  if (excludePatterns.some(p => p.test(text))) return false;
  return includePatterns.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractMaterialType(title: string): GrowRoomProduct['material_type'] {
  const t = title.toLowerCase();
  
  if (/mylar|reflective|panda.*film|black.*white|white.*black|multilayer/i.test(t)) return 'reflective';
  if (/trellis|scrog|netting|net\b/i.test(t)) return 'trellis';
  if (/stake|bamboo|tomato\s*cage/i.test(t)) return 'stake';
  if (/tie|clip|yoyo|twist/i.test(t)) return 'tie';
  if (/hanger|ratchet|rope/i.test(t)) return 'hanger';
  if (/liner|pond/i.test(t)) return 'liner';
  
  return 'accessory';
}

function extractSize(title: string): string {
  // Match roll sizes: 25' x 4', 50 ft x 4 ft
  const rollMatch = title.match(/(\d+)\s*(?:'|ft)?\s*x\s*(\d+)\s*(?:'|ft)?/i);
  if (rollMatch) return `${rollMatch[1]}x${rollMatch[2]}ft`;
  
  // Match single dimensions
  const ftMatch = title.match(/(\d+)\s*(?:'|ft|foot|feet)/i);
  if (ftMatch) return `${ftMatch[1]}ft`;
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏠 Grow Room Materials Master Builder');
  console.log('═'.repeat(40));
  
  const sources = {
    shopify: resolve(CSV_DIR, 'products_export_1.csv'),
    woo: resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'),
    inventory: resolve(CSV_DIR, 'HMoonHydro_Inventory.csv'),
  };
  
  const productMap = new Map<string, {
    product: GrowRoomProduct;
    shopify: boolean;
    woo: boolean;
    inventory: boolean;
  }>();
  
  // Process Shopify
  if (existsSync(sources.shopify)) {
    console.log('\n📦 Processing Shopify export...');
    const content = readFileSync(sources.shopify, 'utf-8');
    const rows = parseCSV(content);
    
    let count = 0;
    for (const row of rows) {
      const handle = row.handle || '';
      const title = row.title || '';
      const type = row.type || row.product_type || '';
      const tags = row.tags || '';
      
      if (!handle || !title) continue;
      if (!isGrowRoomMaterial(title, type, tags)) continue;
      
      const brand = detectBrand(title);
      
      if (!productMap.has(handle)) {
        productMap.set(handle, {
          product: {
            id: `grm-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            material_type: extractMaterialType(title),
            size: extractSize(title),
            price: row.variant_price || row.price || '',
            sources: 'shopify',
            shopify: true,
            woo: false,
            inventory: false,
          },
          shopify: true,
          woo: false,
          inventory: false,
        });
        count++;
      }
    }
    console.log(`   Found ${count} grow room material products`);
  }
  
  // Process WooCommerce
  if (existsSync(sources.woo)) {
    console.log('\n📦 Processing WooCommerce export...');
    const content = readFileSync(sources.woo, 'utf-8');
    const rows = parseCSV(content);
    
    let count = 0;
    let newCount = 0;
    
    for (const row of rows) {
      const handle = (row.slug || row.sku || '').toLowerCase().replace(/\s+/g, '-');
      const title = row.name || row.title || '';
      const type = row.type || row.categories || '';
      const tags = row.tags || '';
      
      if (!handle || !title) continue;
      if (!isGrowRoomMaterial(title, type, tags)) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.woo = true;
        existing.product.woo = true;
        existing.product.sources = 'multi';
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `grm-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            material_type: extractMaterialType(title),
            size: extractSize(title),
            price: row.regular_price || row.price || '',
            sources: 'woo',
            shopify: false,
            woo: true,
            inventory: false,
          },
          shopify: false,
          woo: true,
          inventory: false,
        });
        newCount++;
      }
      count++;
    }
    console.log(`   Found ${count} products (${newCount} new)`);
  }
  
  // Process Inventory
  if (existsSync(sources.inventory)) {
    console.log('\n📦 Processing Inventory file...');
    const content = readFileSync(sources.inventory, 'utf-8');
    const rows = parseCSV(content);
    
    let count = 0;
    let newCount = 0;
    
    for (const row of rows) {
      const title = row.description || row.item || row.name || '';
      const handle = (row.sku || row.item_number || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50);
      
      if (!handle || !title) continue;
      if (!isGrowRoomMaterial(title, '', '')) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.inventory = true;
        existing.product.inventory = true;
        if (existing.product.sources !== 'multi') {
          existing.product.sources = 'multi';
        }
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `grm-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            material_type: extractMaterialType(title),
            size: extractSize(title),
            price: row.price || row.retail || '',
            sources: 'inventory',
            shopify: false,
            woo: false,
            inventory: true,
          },
          shopify: false,
          woo: false,
          inventory: true,
        });
        newCount++;
      }
      count++;
    }
    console.log(`   Found ${count} products (${newCount} new)`);
  }
  
  // Generate Output
  const products = Array.from(productMap.values()).map(p => p.product);
  
  console.log('\n📊 Summary by Type:');
  const byType: Record<string, number> = {};
  products.forEach(p => {
    byType[p.material_type] = (byType[p.material_type] || 0) + 1;
  });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  const headers = [
    'id', 'handle', 'title', 'brand', 'vendor', 'material_type', 'size',
    'price', 'sources', 'shopify', 'woo', 'inventory'
  ];
  
  const csvRows = products.map(p => [
    p.id,
    p.handle,
    `"${p.title.replace(/"/g, '""')}"`,
    p.brand,
    p.vendor,
    p.material_type,
    p.size,
    p.price,
    p.sources,
    p.shopify ? 'yes' : 'no',
    p.woo ? 'yes' : 'no',
    p.inventory ? 'yes' : 'no',
  ].join(','));
  
  const csv = [headers.join(','), ...csvRows].join('\n');
  const outputPath = resolve(CSV_DIR, 'master_grow_room_materials.csv');
  writeFileSync(outputPath, csv);
  
  console.log(`\n✅ Wrote ${products.length} grow room materials to master_grow_room_materials.csv`);
  
  console.log('\n📋 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   ${p.material_type.toUpperCase()} | ${p.title.substring(0, 50)}...`);
    console.log(`      Size: ${p.size || 'n/a'} | Brand: ${p.brand}`);
  });
}

main().catch(console.error);
