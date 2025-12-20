#!/usr/bin/env node
/**
 * buildTrimmingMaster.ts - HMoon Pipeline v0.2
 * 
 * Builds master_trimming.csv from unified product pool
 * Covers: Trimmers (machine & manual), replacement parts, drying equipment
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
  { pattern: /\bTrimPro\b/i, brand: 'TrimPro' },
  { pattern: /\bTrimBox\b/i, brand: 'TrimBox' },
  { pattern: /\bTwister\b/i, brand: 'Twister' },
  { pattern: /\bCenturion\b/i, brand: 'Centurion' },
  { pattern: /\bTriminator\b/i, brand: 'Triminator' },
  { pattern: /\bGreenBroz\b/i, brand: 'GreenBroz' },
  { pattern: /\bSpin\s*Pro\b/i, brand: 'Spin Pro' },
  { pattern: /\bTrimpro\s*Rotor\b/i, brand: 'TrimPro' },
  { pattern: /\bEZ\s*Trim\b/i, brand: 'EZ Trim' },
  { pattern: /\bChikamasa\b/i, brand: 'Chikamasa' },
  { pattern: /\bFiskars\b/i, brand: 'Fiskars' },
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

interface TrimmingProduct {
  id: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  trim_type: 'machine' | 'manual' | 'replacement' | 'workstation' | 'accessory';
  part_type: string;
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
// Trimming Detection
// ─────────────────────────────────────────────────────────────────────────────

function isTrimmingProduct(title: string, type: string, tags: string): boolean {
  const text = `${title} ${type} ${tags}`.toLowerCase();
  
  const includePatterns = [
    /\btrimpro\b/i,
    /\btrimbox\b/i,
    /\btrimmer\b/i,
    /\btrimming\b/i,
    /\btrim\s*(?:machine|bowl|tray)/i,
    /\bspin\s*pro\b/i,
    /\btwister\b.*(?:t2|t4|t6)/i,
    /\bcenturion\b.*trim/i,
    /\btriminator\b/i,
    /\bgreenbroz\b/i,
    /\bez\s*trim\b/i,
    /\btrolley\b.*(?:wheel|replacement)/i,
    /\brotor\b.*(?:trim|exit|grate|motor)/i,
    /\bworkstation\b.*(?:trim|stand)/i,
    /\breplacement\s*(?:grate|bag|motor|blade)/i,
    /\bexit\s*chute\b/i,
  ];
  
  const excludePatterns = [
    /\bnutrient\b/i,
    /\bfertilizer\b/i,
    /\bgrow\s*light\b/i,
    /\btent\b/i,
    /\bscissor\b/i,  // Covered in harvesting
    /\bsnip\b/i,
  ];
  
  if (excludePatterns.some(p => p.test(text))) return false;
  return includePatterns.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractTrimType(title: string): TrimmingProduct['trim_type'] {
  const t = title.toLowerCase();
  
  if (/replacement|grate|motor|bag|blade|chute|wire/i.test(t)) return 'replacement';
  if (/workstation|stand/i.test(t)) return 'workstation';
  if (/rotor|spin|bowl|tumble|machine/i.test(t)) return 'machine';
  if (/scissors|shears|snips/i.test(t)) return 'manual';
  
  return 'accessory';
}

function extractPartType(title: string): string {
  const t = title.toLowerCase();
  
  if (/replacement\s*bag/i.test(t)) return 'bag';
  if (/replacement\s*grate|grate.*replacement/i.test(t)) return 'grate';
  if (/replacement\s*motor|motor.*replacement/i.test(t)) return 'motor';
  if (/replacement\s*blade|blade.*replacement/i.test(t)) return 'blade';
  if (/exit\s*chute/i.test(t)) return 'chute';
  if (/wire.*replacement/i.test(t)) return 'wire';
  if (/trolley.*wheel/i.test(t)) return 'wheel';
  if (/workstation|stand/i.test(t)) return 'stand';
  if (/rotor/i.test(t)) return 'rotor';
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('✂️  Trimming Equipment Master Builder');
  console.log('═'.repeat(40));
  
  const sources = {
    shopify: resolve(CSV_DIR, 'products_export_1.csv'),
    woo: resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'),
    inventory: resolve(CSV_DIR, 'HMoonHydro_Inventory.csv'),
  };
  
  const productMap = new Map<string, {
    product: TrimmingProduct;
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
      if (!isTrimmingProduct(title, type, tags)) continue;
      
      const brand = detectBrand(title);
      
      if (!productMap.has(handle)) {
        productMap.set(handle, {
          product: {
            id: `trim-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            trim_type: extractTrimType(title),
            part_type: extractPartType(title),
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
    console.log(`   Found ${count} trimming products`);
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
      if (!isTrimmingProduct(title, type, tags)) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.woo = true;
        existing.product.woo = true;
        existing.product.sources = 'multi';
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `trim-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            trim_type: extractTrimType(title),
            part_type: extractPartType(title),
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
      if (!isTrimmingProduct(title, '', '')) continue;
      
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
            id: `trim-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            trim_type: extractTrimType(title),
            part_type: extractPartType(title),
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
    byType[p.trim_type] = (byType[p.trim_type] || 0) + 1;
  });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  const headers = [
    'id', 'handle', 'title', 'brand', 'vendor', 'trim_type', 'part_type',
    'price', 'sources', 'shopify', 'woo', 'inventory'
  ];
  
  const csvRows = products.map(p => [
    p.id,
    p.handle,
    `"${p.title.replace(/"/g, '""')}"`,
    p.brand,
    p.vendor,
    p.trim_type,
    p.part_type,
    p.price,
    p.sources,
    p.shopify ? 'yes' : 'no',
    p.woo ? 'yes' : 'no',
    p.inventory ? 'yes' : 'no',
  ].join(','));
  
  const csv = [headers.join(','), ...csvRows].join('\n');
  const outputPath = resolve(CSV_DIR, 'master_trimming.csv');
  writeFileSync(outputPath, csv);
  
  console.log(`\n✅ Wrote ${products.length} trimming products to master_trimming.csv`);
  
  console.log('\n📋 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   ${p.trim_type.toUpperCase()} | ${p.title.substring(0, 50)}...`);
    console.log(`      Part: ${p.part_type || 'n/a'} | Brand: ${p.brand}`);
  });
}

main().catch(console.error);
