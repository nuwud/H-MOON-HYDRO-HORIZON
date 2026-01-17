#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: generateMatchReport.ts
 * PURPOSE: Generate a match report between scraped products and Shopify catalog
 * 
 * Uses fuzzy matching (Fuse.js) to match scraped products to existing Shopify
 * products by handle, title, and SKU.
 * 
 * Usage:
 *   npx tsx src/cli/generateMatchReport.ts --source=grease
 *   npx tsx src/cli/generateMatchReport.ts --source=grease --output=outputs/grease_matches.json
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Fuse from 'fuse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const SCRAPED_DIR = path.resolve(OUTPUTS_DIR, 'scraped');
const CSVS_DIR = path.resolve(PROJECT_ROOT, 'CSVs');

// ============================================================================
// Types
// ============================================================================

interface ScrapedProduct {
  handle: string;
  title: string;
  vendor: string;
  source: string;
  images: {
    main: string;
    gallery: string[];
  };
  description?: string;
  specs?: Record<string, string>;
  scrapedAt: string;
}

interface ScrapeResult {
  source: string;
  scrapedAt: string;
  products: ScrapedProduct[];
  errors: string[];
  stats: {
    total: number;
    withImages: number;
    withDescriptions: number;
  };
}

interface ShopifyProduct {
  handle: string;
  title: string;
  vendor: string;
  sku?: string;
  imageSrc?: string;
}

interface MatchResult {
  scraped: {
    handle: string;
    title: string;
  };
  existing?: {
    handle: string;
    title: string;
    vendor: string;
  };
  confidence: number;
  method: 'exact-handle' | 'fuzzy-title' | 'fuzzy-handle' | 'none';
}

interface MatchReport {
  source: string;
  generatedAt: string;
  matched: MatchResult[];
  unmatched: MatchResult[];
  needsReview: MatchResult[];
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    needsReview: number;
  };
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'grease';
const outputArg = args.find(a => a.startsWith('--output='))?.split('=')[1];

// ============================================================================
// CSV Parser (simple)
// ============================================================================

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parsing (handles basic cases)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// ============================================================================
// Load Shopify Products
// ============================================================================

function loadShopifyProducts(): ShopifyProduct[] {
  const exportPath = path.join(CSVS_DIR, 'products_export_1.csv');
  
  if (!fs.existsSync(exportPath)) {
    console.error(`❌ Shopify export not found: ${exportPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(exportPath, 'utf-8');
  const rows = parseCSV(content);
  
  // Deduplicate by handle (variants have same handle)
  const byHandle = new Map<string, ShopifyProduct>();
  
  for (const row of rows) {
    const handle = row['Handle'] || row['handle'];
    if (!handle || byHandle.has(handle)) continue;
    
    byHandle.set(handle, {
      handle,
      title: row['Title'] || row['title'] || '',
      vendor: row['Vendor'] || row['vendor'] || '',
      sku: row['Variant SKU'] || row['sku'] || '',
      imageSrc: row['Image Src'] || row['image_src'] || '',
    });
  }
  
  return Array.from(byHandle.values());
}

// ============================================================================
// Matching Logic
// ============================================================================

function matchProducts(scraped: ScrapedProduct[], existing: ShopifyProduct[]): MatchReport {
  const results: MatchResult[] = [];
  
  // Create Fuse index for fuzzy matching
  const fuse = new Fuse(existing, {
    keys: ['handle', 'title'],
    threshold: 0.4,
    includeScore: true,
  });
  
  // Build handle lookup for exact matching
  const handleLookup = new Map(existing.map(p => [p.handle, p]));
  
  for (const scrapedProduct of scraped) {
    // Try exact handle match first
    const exactMatch = handleLookup.get(scrapedProduct.handle);
    
    if (exactMatch) {
      results.push({
        scraped: { handle: scrapedProduct.handle, title: scrapedProduct.title },
        existing: { handle: exactMatch.handle, title: exactMatch.title, vendor: exactMatch.vendor },
        confidence: 1.0,
        method: 'exact-handle',
      });
      continue;
    }
    
    // Try fuzzy match
    const fuzzyResults = fuse.search(scrapedProduct.title);
    
    if (fuzzyResults.length > 0 && fuzzyResults[0].score !== undefined) {
      const bestMatch = fuzzyResults[0];
      const confidence = 1 - bestMatch.score!;
      
      results.push({
        scraped: { handle: scrapedProduct.handle, title: scrapedProduct.title },
        existing: { 
          handle: bestMatch.item.handle, 
          title: bestMatch.item.title, 
          vendor: bestMatch.item.vendor,
        },
        confidence,
        method: 'fuzzy-title',
      });
    } else {
      // No match found
      results.push({
        scraped: { handle: scrapedProduct.handle, title: scrapedProduct.title },
        confidence: 0,
        method: 'none',
      });
    }
  }
  
  // Categorize results
  const matched = results.filter(r => r.confidence >= 0.8);
  const needsReview = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8);
  const unmatched = results.filter(r => r.confidence < 0.5);
  
  return {
    source: sourceArg,
    generatedAt: new Date().toISOString(),
    matched,
    unmatched,
    needsReview,
    stats: {
      total: results.length,
      matched: matched.length,
      unmatched: unmatched.length,
      needsReview: needsReview.length,
    },
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  GENERATE MATCH REPORT - H-Moon Hydro Pipeline');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log(`  Source: ${sourceArg}`);
  console.log('');
  
  // Load scraped data
  const scrapePath = path.join(SCRAPED_DIR, `${sourceArg}.json`);
  
  if (!fs.existsSync(scrapePath)) {
    console.error(`❌ Scrape file not found: ${scrapePath}`);
    console.log(`   Run: npm run scrape:${sourceArg} first`);
    process.exit(1);
  }
  
  const scrapeData: ScrapeResult = JSON.parse(fs.readFileSync(scrapePath, 'utf-8'));
  console.log(`  Loaded ${scrapeData.products.length} scraped products\n`);
  
  // Load Shopify products
  const shopifyProducts = loadShopifyProducts();
  console.log(`  Loaded ${shopifyProducts.length} Shopify products\n`);
  
  // Generate matches
  console.log('  Matching products...\n');
  const report = matchProducts(scrapeData.products, shopifyProducts);
  
  // Print results
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  MATCHES');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  for (const match of report.matched) {
    console.log(`  ✅ ${match.scraped.handle}`);
    console.log(`     → ${match.existing?.handle} (${(match.confidence * 100).toFixed(0)}% via ${match.method})`);
  }
  
  if (report.needsReview.length > 0) {
    console.log('\n  ⚠️  NEEDS REVIEW:');
    for (const match of report.needsReview) {
      console.log(`     ${match.scraped.handle} → ${match.existing?.handle} (${(match.confidence * 100).toFixed(0)}%)`);
    }
  }
  
  if (report.unmatched.length > 0) {
    console.log('\n  ❌ UNMATCHED:');
    for (const match of report.unmatched) {
      console.log(`     ${match.scraped.handle}`);
    }
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Total: ${report.stats.total}`);
  console.log(`  Matched (≥80%): ${report.stats.matched}`);
  console.log(`  Needs Review (50-80%): ${report.stats.needsReview}`);
  console.log(`  Unmatched (<50%): ${report.stats.unmatched}`);
  
  // Save report
  const outputPath = outputArg || path.join(OUTPUTS_DIR, `${sourceArg}_matches.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved to: ${outputPath}`);
  
  console.log('');
}

main().catch(err => {
  console.error('Match report failed:', err);
  process.exit(1);
});
