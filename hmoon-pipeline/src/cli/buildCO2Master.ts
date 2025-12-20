#!/usr/bin/env node
/**
 * buildCO2Master.ts - HMoon Pipeline v0.2
 * 
 * Builds master_co2.csv from unified product pool
 * Covers: CO2 generators, CO2 tanks, CO2 controllers, CO2 monitors, CO2 regulators
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
  { pattern: /\bUNO\b/i, brand: 'UNO' },
  { pattern: /\bAutopilot\b/i, brand: 'Autopilot' },
  { pattern: /\bTitan\s*Controls\b/i, brand: 'Titan Controls' },
  { pattern: /\bTrolmaster\b/i, brand: 'Trolmaster' },
  { pattern: /\bPulse\b/i, brand: 'Pulse' },
  { pattern: /\bExhale\b/i, brand: 'Exhale' },
  { pattern: /\bGreen\s*Pad\b/i, brand: 'Green Pad' },
  { pattern: /\bTNB\s*Naturals\b/i, brand: 'TNB Naturals' },
  { pattern: /\bRaz-?CO2\b/i, brand: 'RazCO2' },
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

interface CO2Product {
  id: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  co2_type: 'generator' | 'tank' | 'regulator' | 'controller' | 'monitor' | 'bag' | 'dispenser' | 'accessory';
  fuel_type: string;
  burner_count: string;
  btu_rating: string;
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
// CO2 Detection
// ─────────────────────────────────────────────────────────────────────────────

function isCO2Product(title: string, type: string, tags: string): boolean {
  const text = `${title} ${type} ${tags}`.toLowerCase();
  
  const includePatterns = [
    /\bco2\b/i,
    /\bcarbon\s*dioxide\b/i,
    /co2\s*generator/i,
    /co2\s*controller/i,
    /co2\s*monitor/i,
    /co2\s*regulator/i,
    /co2\s*tank/i,
    /co2\s*bag/i,
    /co2\s*bucket/i,
    /\bexhale\b.*(?:bag|co2)/i,
    /\bgreen\s*pad\b/i,
    /\bpropane\b.*(?:gen|generator|burner)/i,
    /\bnatural\s*gas\b.*(?:gen|generator)/i,
    /\bburner\b.*co2/i,
    /\bung\b|uno.*gen/i,  // UNO GEN products
    /ppm.*(?:monitor|controller)/i,
    /\braz-?co2\b/i,
    /tnb.*co2/i,
  ];
  
  const excludePatterns = [
    /\bnutrient\b/i,
    /\bfertilizer\b/i,
    /\bgrow\s*light\b/i,
    /\bcarbon\s*filter\b/i,  // Odor control, not CO2
  ];
  
  if (excludePatterns.some(p => p.test(text))) return false;
  return includePatterns.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractCO2Type(title: string): CO2Product['co2_type'] {
  const t = title.toLowerCase();
  
  if (/generator|propane|natural\s*gas|burner|gen-?\d/i.test(t)) return 'generator';
  if (/tank|cylinder|bottle/i.test(t)) return 'tank';
  if (/regulator|flow/i.test(t)) return 'regulator';
  if (/controller/i.test(t)) return 'controller';
  if (/monitor|sensor|ppm.*meter/i.test(t)) return 'monitor';
  if (/bag|exhale/i.test(t)) return 'bag';
  if (/dispenser|bucket/i.test(t)) return 'dispenser';
  
  return 'accessory';
}

function extractFuelType(title: string): string {
  const t = title.toLowerCase();
  
  if (/propane|lp\b|elp/i.test(t)) return 'propane';
  if (/natural\s*gas|ng\b|eng/i.test(t)) return 'natural gas';
  
  return '';
}

function extractBurnerCount(title: string): string {
  // Match burner counts: 2 burner, 4-burner, GEN-4
  const match = title.match(/(\d+)\s*-?\s*burner|gen-?(\d+)/i);
  if (match) {
    const count = match[1] || match[2];
    return `${count}-burner`;
  }
  return '';
}

function extractBTU(title: string): string {
  // Match BTU: 22000 BTU, 22,000 btu
  const match = title.match(/([\d,]+)\s*btu/i);
  return match ? match[1].replace(/,/g, '') + ' BTU' : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌫️  CO2 Enrichment Master Builder');
  console.log('═'.repeat(40));
  
  const sources = {
    shopify: resolve(CSV_DIR, 'products_export_1.csv'),
    woo: resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'),
    inventory: resolve(CSV_DIR, 'HMoonHydro_Inventory.csv'),
  };
  
  const productMap = new Map<string, {
    product: CO2Product;
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
      if (!isCO2Product(title, type, tags)) continue;
      
      const brand = detectBrand(title);
      
      if (!productMap.has(handle)) {
        productMap.set(handle, {
          product: {
            id: `co2-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            co2_type: extractCO2Type(title),
            fuel_type: extractFuelType(title),
            burner_count: extractBurnerCount(title),
            btu_rating: extractBTU(title),
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
    console.log(`   Found ${count} CO2 products`);
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
      if (!isCO2Product(title, type, tags)) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.woo = true;
        existing.product.woo = true;
        existing.product.sources = 'multi';
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `co2-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            co2_type: extractCO2Type(title),
            fuel_type: extractFuelType(title),
            burner_count: extractBurnerCount(title),
            btu_rating: extractBTU(title),
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
      if (!isCO2Product(title, '', '')) continue;
      
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
            id: `co2-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            co2_type: extractCO2Type(title),
            fuel_type: extractFuelType(title),
            burner_count: extractBurnerCount(title),
            btu_rating: extractBTU(title),
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
    byType[p.co2_type] = (byType[p.co2_type] || 0) + 1;
  });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  const headers = [
    'id', 'handle', 'title', 'brand', 'vendor', 'co2_type', 'fuel_type',
    'burner_count', 'btu_rating', 'price', 'sources', 'shopify', 'woo', 'inventory'
  ];
  
  const csvRows = products.map(p => [
    p.id,
    p.handle,
    `"${p.title.replace(/"/g, '""')}"`,
    p.brand,
    p.vendor,
    p.co2_type,
    p.fuel_type,
    p.burner_count,
    p.btu_rating,
    p.price,
    p.sources,
    p.shopify ? 'yes' : 'no',
    p.woo ? 'yes' : 'no',
    p.inventory ? 'yes' : 'no',
  ].join(','));
  
  const csv = [headers.join(','), ...csvRows].join('\n');
  const outputPath = resolve(CSV_DIR, 'master_co2.csv');
  writeFileSync(outputPath, csv);
  
  console.log(`\n✅ Wrote ${products.length} CO2 products to master_co2.csv`);
  
  console.log('\n📋 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   ${p.co2_type.toUpperCase()} | ${p.title.substring(0, 50)}...`);
    console.log(`      ${p.fuel_type} ${p.burner_count} ${p.btu_rating} | Brand: ${p.brand}`);
  });
}

main().catch(console.error);
