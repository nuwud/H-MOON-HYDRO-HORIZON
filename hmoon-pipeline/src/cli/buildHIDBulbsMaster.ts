#!/usr/bin/env node
/**
 * buildHIDBulbsMaster.ts - HMoon Pipeline v0.2
 * 
 * Builds master_hid_bulbs.csv from unified product pool
 * Covers: HPS bulbs, MH bulbs, CMH bulbs, T5/CFL tubes, reflectors, sockets, mogul adapters
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection (inline)
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /\bEye\s*Hortilux\b/i, brand: 'Eye Hortilux' },
  { pattern: /\bHortilux\b/i, brand: 'Eye Hortilux' },
  { pattern: /\bSolarMax\b/i, brand: 'SolarMax' },
  { pattern: /\bPlantMax\b/i, brand: 'PlantMax' },
  { pattern: /\bDigilux\b/i, brand: 'Digilux' },
  { pattern: /\bUshio\b/i, brand: 'Ushio' },
  { pattern: /\bSunmaster\b/i, brand: 'Sunmaster' },
  { pattern: /\bUltra\s*Sun\b/i, brand: 'Ultra Sun' },
  { pattern: /\bSunBlaster\b/i, brand: 'SunBlaster' },
  { pattern: /\bSun\s*System\b/i, brand: 'Sun System' },
  { pattern: /\bQuantum\b/i, brand: 'Quantum' },
  { pattern: /\bApollo\b/i, brand: 'Apollo' },
  { pattern: /\bPhilips\b/i, brand: 'Philips' },
  { pattern: /\bGE\b/i, brand: 'GE' },
  { pattern: /\bSylvania\b/i, brand: 'Sylvania' },
  { pattern: /\bUltragrow\b/i, brand: 'Ultragrow' },
  { pattern: /\bNextlight\b/i, brand: 'Nextlight' },
  { pattern: /\bGavita\b/i, brand: 'Gavita' },
  { pattern: /\bNanolux\b/i, brand: 'Nanolux' },
  { pattern: /\bLuxx\b/i, brand: 'Luxx' },
  { pattern: /\bUNO\b/i, brand: 'UNO' },
  { pattern: /\bGeneral\s*Hydroponics\b/i, brand: 'General Hydroponics' },
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

interface RawProduct {
  handle: string;
  title: string;
  vendor: string;
  type: string;
  tags: string;
  sku: string;
  price: string;
  source: string;
}

interface HIDBulb {
  id: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  bulb_type: 'hps' | 'mh' | 'cmh' | 't5' | 'cfl' | 'reflector' | 'socket' | 'ballast' | 'conversion' | 'accessory';
  wattage: string;
  lumens: string;
  color_temp: string;
  spectrum: 'bloom' | 'veg' | 'full' | 'conversion' | 'unknown';
  size: string;
  price: string;
  sources: string;
  shopify: boolean;
  woo: boolean;
  inventory: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parser (inline for reliability)
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
// HID Bulb Detection
// ─────────────────────────────────────────────────────────────────────────────

function isHIDBulb(title: string, type: string, tags: string): boolean {
  const text = `${title} ${type} ${tags}`.toLowerCase();
  
  // HID bulb indicators
  const bulbPatterns = [
    /\bhps\b/i,                    // High Pressure Sodium
    /high\s*pressure\s*sodium/i,
    /\bmh\b(?!.*hydro)/i,         // Metal Halide (not hydro)
    /metal\s*halide/i,
    /\bcmh\b/i,                    // Ceramic Metal Halide
    /ceramic\s*metal\s*halide/i,
    /\bt5\b/i,                     // T5 fluorescent
    /\bt8\b/i,                     // T8 fluorescent
    /fluorescent\s*(?:lamp|tube|bulb)/i,
    /\bcfl\b/i,                    // Compact fluorescent
    /compact\s*fluorescent/i,
    /lumens/i,                     // Lumen rating
    /\bballast\b/i,               // Ballast
    /mogul\s*(?:base|socket)/i,   // Mogul base
    /\breflector\b.*(?:hood|light|grow)/i, // Reflector hoods
    /hood\s*reflector/i,
    /cool\s*tube/i,
    /air\s*cooled.*(?:reflector|hood)/i,
    /\ba\/?c\b.*reflector/i,       // A/C reflector
    /parabolic/i,                 // Parabolic reflector
    /socket.*(?:set|cord|adapter)/i,
    /lamp\s*cord/i,
    /\bconversion\b.*(?:bulb|lamp)/i,
    /solarmax/i,                  // SolarMax brand
    /plantmax/i,                  // PlantMax brand
    /eye\s*hortilux/i,           // Eye Hortilux
    /\bdigilux\b/i,              // Digilux
    /ushio/i,                     // Ushio
    /sunmaster/i,                 // Sunmaster
    /ultra\s*sun/i,              // Ultra Sun
    /sun\s*system.*(?:bulb|lamp|reflector)/i,
    /\b6500k\b/i,                // Color temps
    /\b3000k\b/i,
    /\b2700k\b/i,
    /\b4200k\b/i,
    /\bveg(?:etative)?\s*(?:bulb|lamp)/i,
    /bloom\s*(?:bulb|lamp)/i,
    /grow\s*lamp/i,
    /sunblaster/i,               // SunBlaster T5
    /ultragrow.*(?:socket|reflector)/i,
  ];
  
  // Exclusions - not HID/lighting
  const excludePatterns = [
    /nutrient|fertilizer|feed/i,
    /grow\s*tent/i,
    /(?:inline|exhaust|carbon)\s*filter/i,
    /(?:inline|exhaust)\s*fan/i,
    /controller|timer/i,
    /grow\s*(?:media|medium)/i,
    /coco|soil|perlite/i,
    /seed(?:s)?\b/i,
    /clone|cutting/i,
    /pH\s*(?:up|down|meter)/i,
  ];
  
  if (excludePatterns.some(p => p.test(text))) return false;
  return bulbPatterns.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractBulbType(title: string): HIDBulb['bulb_type'] {
  const t = title.toLowerCase();
  
  if (/\bhps\b|high\s*pressure\s*sodium/i.test(t)) return 'hps';
  if (/\bmh\b|metal\s*halide/i.test(t)) return 'mh';
  if (/\bcmh\b|ceramic\s*metal\s*halide|lec/i.test(t)) return 'cmh';
  if (/\bt5\b|\bt8\b|fluorescent.*tube/i.test(t)) return 't5';
  if (/\bcfl\b|compact\s*fluorescent/i.test(t)) return 'cfl';
  if (/reflector|hood|parabolic|cool\s*tube/i.test(t)) return 'reflector';
  if (/socket|mogul|lamp\s*cord/i.test(t)) return 'socket';
  if (/\bballast\b/i.test(t)) return 'ballast';
  if (/conversion/i.test(t)) return 'conversion';
  
  return 'accessory';
}

function extractWattage(title: string): string {
  // Match wattage patterns: 400W, 1000 watt, 600w
  const match = title.match(/(\d{2,4})\s*(?:w(?:att)?)\b/i);
  return match ? `${match[1]}W` : '';
}

function extractLumens(title: string): string {
  // Match lumen patterns: 32000 lumens, 85,000 Lumens
  const match = title.match(/([\d,]+)\s*lumens?/i);
  return match ? match[1].replace(/,/g, '') : '';
}

function extractColorTemp(title: string): string {
  // Match color temp: 6500K, 3000k
  const match = title.match(/(\d{4})k/i);
  return match ? `${match[1]}K` : '';
}

function extractSpectrum(title: string): HIDBulb['spectrum'] {
  const t = title.toLowerCase();
  
  if (/\bveg(?:etative)?\b|6500k|5500k|blue/i.test(t)) return 'veg';
  if (/\bbloom\b|flower(?:ing)?|3000k|2700k|hps|red/i.test(t)) return 'bloom';
  if (/conversion/i.test(t)) return 'conversion';
  if (/full\s*spectrum|dual/i.test(t)) return 'full';
  
  return 'unknown';
}

function extractSize(title: string): string {
  // Match sizes: 2', 4', 6 in, 8"
  const feetMatch = title.match(/(\d+)\s*(?:'|ft|foot|feet)/i);
  if (feetMatch) return `${feetMatch[1]}ft`;
  
  const inchMatch = title.match(/(\d+)\s*(?:"|in(?:ch)?)/i);
  if (inchMatch) return `${inchMatch[1]}in`;
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('💡 HID Bulbs & Lighting Accessories Master Builder');
  console.log('═'.repeat(55));
  
  const sources = {
    shopify: resolve(CSV_DIR, 'products_export_1.csv'),
    woo: resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'),
    inventory: resolve(CSV_DIR, 'HMoonHydro_Inventory.csv'),
  };
  
  // Track products by handle
  const productMap = new Map<string, {
    product: HIDBulb;
    shopify: boolean;
    woo: boolean;
    inventory: boolean;
  }>();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Process Shopify
  // ─────────────────────────────────────────────────────────────────────────
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
      if (!isHIDBulb(title, type, tags)) continue;
      
      const brand = detectBrand(title);
      
      if (!productMap.has(handle)) {
        productMap.set(handle, {
          product: {
            id: `hid-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            bulb_type: extractBulbType(title),
            wattage: extractWattage(title),
            lumens: extractLumens(title),
            color_temp: extractColorTemp(title),
            spectrum: extractSpectrum(title),
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
    console.log(`   Found ${count} HID/lighting products`);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Process WooCommerce
  // ─────────────────────────────────────────────────────────────────────────
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
      if (!isHIDBulb(title, type, tags)) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.woo = true;
        existing.product.woo = true;
        existing.product.sources = 'multi';
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `hid-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            bulb_type: extractBulbType(title),
            wattage: extractWattage(title),
            lumens: extractLumens(title),
            color_temp: extractColorTemp(title),
            spectrum: extractSpectrum(title),
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
  
  // ─────────────────────────────────────────────────────────────────────────
  // Process Inventory
  // ─────────────────────────────────────────────────────────────────────────
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
      if (!isHIDBulb(title, '', '')) continue;
      
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
            id: `hid-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            bulb_type: extractBulbType(title),
            wattage: extractWattage(title),
            lumens: extractLumens(title),
            color_temp: extractColorTemp(title),
            spectrum: extractSpectrum(title),
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
  
  // ─────────────────────────────────────────────────────────────────────────
  // Generate Output
  // ─────────────────────────────────────────────────────────────────────────
  const products = Array.from(productMap.values()).map(p => p.product);
  
  console.log('\n📊 Summary by Bulb Type:');
  const byType: Record<string, number> = {};
  products.forEach(p => {
    byType[p.bulb_type] = (byType[p.bulb_type] || 0) + 1;
  });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  // CSV output
  const headers = [
    'id', 'handle', 'title', 'brand', 'vendor', 'bulb_type', 'wattage',
    'lumens', 'color_temp', 'spectrum', 'size', 'price', 'sources', 'shopify', 'woo', 'inventory'
  ];
  
  const csvRows = products.map(p => [
    p.id,
    p.handle,
    `"${p.title.replace(/"/g, '""')}"`,
    p.brand,
    p.vendor,
    p.bulb_type,
    p.wattage,
    p.lumens,
    p.color_temp,
    p.spectrum,
    p.size,
    p.price,
    p.sources,
    p.shopify ? 'yes' : 'no',
    p.woo ? 'yes' : 'no',
    p.inventory ? 'yes' : 'no',
  ].join(','));
  
  const csv = [headers.join(','), ...csvRows].join('\n');
  const outputPath = resolve(CSV_DIR, 'master_hid_bulbs.csv');
  writeFileSync(outputPath, csv);
  
  console.log(`\n✅ Wrote ${products.length} HID/lighting products to master_hid_bulbs.csv`);
  
  // Sample output
  console.log('\n📋 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   ${p.bulb_type.toUpperCase()} | ${p.title.substring(0, 50)}...`);
    console.log(`      ${p.wattage} ${p.lumens ? p.lumens + ' lm' : ''} ${p.color_temp} [${p.spectrum}]`);
  });
}

main().catch(console.error);
