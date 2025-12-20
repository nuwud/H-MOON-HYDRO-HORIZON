#!/usr/bin/env node
/**
 * buildPestControlMaster.ts - HMoon Pipeline v0.2
 * 
 * Builds master_pest_control.csv from unified product pool
 * Covers: Pesticides, fungicides, insecticides, pest traps, organic pest control
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
  { pattern: /\bZero\s*Tolerance\b/i, brand: 'Zero Tolerance' },
  { pattern: /\bNeem\b/i, brand: 'Neem' },
  { pattern: /\bSafers?\b/i, brand: 'Safer' },
  { pattern: /\bAzaMax\b/i, brand: 'AzaMax' },
  { pattern: /\bSNS\b/i, brand: 'SNS' },
  { pattern: /\bMighty\s*Wash\b/i, brand: 'Mighty Wash' },
  { pattern: /\bPyrethrin\b/i, brand: 'Pyrethrin' },
  { pattern: /\bSpinosa[d]?\b/i, brand: 'Spinosad' },
  { pattern: /\bGreen\s*Cleaner\b/i, brand: 'Green Cleaner' },
  { pattern: /\bLost\s*Coast\b/i, brand: 'Lost Coast Plant Therapy' },
  { pattern: /\bPlant\s*Therapy\b/i, brand: 'Lost Coast Plant Therapy' },
  { pattern: /\bFoxFarm\b/i, brand: 'FoxFarm' },
  { pattern: /\bGrowSafe\b/i, brand: 'GrowSafe' },
  { pattern: /\bRegalia\b/i, brand: 'Regalia' },
  { pattern: /\bAcquire\b/i, brand: 'Acquire' },
  { pattern: /\bBotaniGard\b/i, brand: 'BotaniGard' },
  { pattern: /\bVenerate\b/i, brand: 'Venerate' },
  { pattern: /\bTimeMist\b/i, brand: 'TimeMist' },
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

interface PestProduct {
  id: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  pest_type: 'insecticide' | 'fungicide' | 'miticide' | 'pesticide' | 'trap' | 'organic' | 'dispenser' | 'combo';
  target: string;
  application: 'spray' | 'drench' | 'granular' | 'trap' | 'fogger' | 'dispenser' | 'unknown';
  organic: boolean;
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
// Pest Control Detection
// ─────────────────────────────────────────────────────────────────────────────

function isPestControl(title: string, type: string, tags: string): boolean {
  const text = `${title} ${type} ${tags}`.toLowerCase();
  
  const includePatterns = [
    /\bpest\s*control\b/i,
    /\bpesticide\b/i,
    /\binsecticide\b/i,
    /\bfungicide\b/i,
    /\bmiticide\b/i,
    /\bherbicide\b/i,
    /\binsect\s*(?:killer|spray|control)/i,
    /\bspider\s*mite/i,
    /\baphid/i,
    /\bthrip/i,
    /\bwhitefly/i,
    /\bfungus\s*gnat/i,
    /\broot\s*rot/i,
    /\bpowdery\s*mildew/i,
    /\bbotrytis/i,
    /\bmold\s*(?:control|killer|spray)/i,
    /\bblight\b/i,
    /\bzero\s*tolerance/i,
    /\bneem\s*oil/i,
    /\bpyrethrin/i,
    /\bspinosa[d]?\b/i,
    /\bazamax\b/i,
    /\bsns\s*\d+/i,
    /\bmighty\s*wash/i,
    /\bgreen\s*cleaner\b/i,
    /\bplant\s*therapy\b/i,
    /\blost\s*coast/i,
    /\bsticky\s*trap/i,
    /\byellow\s*(?:card|trap)/i,
    /\bblue\s*(?:card|trap)/i,
    /\bpest\s*trap/i,
    /\bleafminer\s*trap/i,
    /\bbeneficial\s*(?:insect|nematode)/i,
    /\bsafers?\s*(?:soap|spray)/i,
    /\bhorticultural\s*(?:oil|spray)/i,
    /\btimemist/i,
    /\bprogrammable\s*dispenser/i,
  ];
  
  const excludePatterns = [
    /\bnutrient\b/i,
    /\bfertilizer\b/i,
    /\bgrow\s*(?:light|tent)/i,
    /\bcarbon\s*filter\b/i,
    /\bfan\b/i,
    /\bduct\b/i,
    /\bballast\b/i,
    /\bseed(?:s)?\b/i,
  ];
  
  if (excludePatterns.some(p => p.test(text))) return false;
  return includePatterns.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractPestType(title: string): PestProduct['pest_type'] {
  const t = title.toLowerCase();
  
  if (/fungicide|mildew|mold|botrytis|blight/i.test(t)) return 'fungicide';
  if (/miticide|mite\s*(?:control|killer)/i.test(t)) return 'miticide';
  if (/insecticide|insect\s*(?:control|killer)/i.test(t)) return 'insecticide';
  if (/trap|sticky|card/i.test(t)) return 'trap';
  if (/dispenser|timemist/i.test(t)) return 'dispenser';
  if (/organic|natural|neem|pyrethrin/i.test(t)) return 'organic';
  if (/pest.*fungicide|insecticide.*fungicide/i.test(t)) return 'combo';
  
  return 'pesticide';
}

function extractTarget(title: string): string {
  const targets: string[] = [];
  
  if (/spider\s*mite|mite/i.test(title)) targets.push('mites');
  if (/aphid/i.test(title)) targets.push('aphids');
  if (/thrip/i.test(title)) targets.push('thrips');
  if (/whitefly/i.test(title)) targets.push('whiteflies');
  if (/fungus\s*gnat|gnat/i.test(title)) targets.push('gnats');
  if (/powdery\s*mildew/i.test(title)) targets.push('powdery mildew');
  if (/botrytis/i.test(title)) targets.push('botrytis');
  if (/root\s*rot/i.test(title)) targets.push('root rot');
  if (/mold/i.test(title)) targets.push('mold');
  if (/leafminer/i.test(title)) targets.push('leafminer');
  
  return targets.join(', ') || 'general';
}

function extractApplication(title: string): PestProduct['application'] {
  const t = title.toLowerCase();
  
  if (/spray|foliar/i.test(t)) return 'spray';
  if (/drench|soil/i.test(t)) return 'drench';
  if (/granular|granule/i.test(t)) return 'granular';
  if (/trap|sticky|card/i.test(t)) return 'trap';
  if (/fog(?:ger)?/i.test(t)) return 'fogger';
  if (/dispenser|timemist/i.test(t)) return 'dispenser';
  
  return 'unknown';
}

function isOrganic(title: string): boolean {
  return /organic|natural|neem|pyrethrin|beneficial/i.test(title);
}

function extractSize(title: string): string {
  const galMatch = title.match(/(\d+)\s*(?:gal(?:lon)?)/i);
  if (galMatch) return `${galMatch[1]}gal`;
  
  const ozMatch = title.match(/(\d+)\s*(?:oz|fl\.?\s*oz)/i);
  if (ozMatch) return `${ozMatch[1]}oz`;
  
  const mlMatch = title.match(/(\d+)\s*ml/i);
  if (mlMatch) return `${mlMatch[1]}ml`;
  
  const literMatch = title.match(/(\d+)\s*(?:l|liter|litre)/i);
  if (literMatch) return `${literMatch[1]}L`;
  
  const packMatch = title.match(/(\d+)\s*(?:pack|pk|\/pack)/i);
  if (packMatch) return `${packMatch[1]}pk`;
  
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🐛 Pest Control Master Builder');
  console.log('═'.repeat(40));
  
  const sources = {
    shopify: resolve(CSV_DIR, 'products_export_1.csv'),
    woo: resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv'),
    inventory: resolve(CSV_DIR, 'HMoonHydro_Inventory.csv'),
  };
  
  const productMap = new Map<string, {
    product: PestProduct;
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
      if (!isPestControl(title, type, tags)) continue;
      
      const brand = detectBrand(title);
      
      if (!productMap.has(handle)) {
        productMap.set(handle, {
          product: {
            id: `pest-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            pest_type: extractPestType(title),
            target: extractTarget(title),
            application: extractApplication(title),
            organic: isOrganic(title),
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
    console.log(`   Found ${count} pest control products`);
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
      if (!isPestControl(title, type, tags)) continue;
      
      if (productMap.has(handle)) {
        const existing = productMap.get(handle)!;
        existing.woo = true;
        existing.product.woo = true;
        existing.product.sources = 'multi';
      } else {
        const brand = detectBrand(title);
        productMap.set(handle, {
          product: {
            id: `pest-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            pest_type: extractPestType(title),
            target: extractTarget(title),
            application: extractApplication(title),
            organic: isOrganic(title),
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
      if (!isPestControl(title, '', '')) continue;
      
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
            id: `pest-${handle.substring(0, 20)}`,
            handle,
            title: title.replace(/<[^>]*>/g, '').trim(),
            brand,
            vendor: row.vendor || '',
            pest_type: extractPestType(title),
            target: extractTarget(title),
            application: extractApplication(title),
            organic: isOrganic(title),
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
    byType[p.pest_type] = (byType[p.pest_type] || 0) + 1;
  });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  const headers = [
    'id', 'handle', 'title', 'brand', 'vendor', 'pest_type', 'target',
    'application', 'organic', 'size', 'price', 'sources', 'shopify', 'woo', 'inventory'
  ];
  
  const csvRows = products.map(p => [
    p.id,
    p.handle,
    `"${p.title.replace(/"/g, '""')}"`,
    p.brand,
    p.vendor,
    p.pest_type,
    `"${p.target}"`,
    p.application,
    p.organic ? 'yes' : 'no',
    p.size,
    p.price,
    p.sources,
    p.shopify ? 'yes' : 'no',
    p.woo ? 'yes' : 'no',
    p.inventory ? 'yes' : 'no',
  ].join(','));
  
  const csv = [headers.join(','), ...csvRows].join('\n');
  const outputPath = resolve(CSV_DIR, 'master_pest_control.csv');
  writeFileSync(outputPath, csv);
  
  console.log(`\n✅ Wrote ${products.length} pest control products to master_pest_control.csv`);
  
  console.log('\n📋 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   ${p.pest_type.toUpperCase()} | ${p.title.substring(0, 50)}...`);
    console.log(`      Target: ${p.target} | App: ${p.application} | Organic: ${p.organic ? 'Yes' : 'No'}`);
  });
}

main().catch(console.error);
