#!/usr/bin/env npx tsx
/**
 * Fortified Scraper - Weight, Dimensions & Specs Only
 * 
 * Scrapes ONLY missing physical attributes from trusted hydro stores:
 * - Weight (critical for shipping calculations)
 * - Dimensions (L x W x H)
 * - Additional specs (if found)
 * 
 * Safety Features:
 * - High confidence thresholds (70%+ match required)
 * - Only updates products with missing data
 * - Never overwrites existing data
 * - Detailed logging for audit
 * 
 * RUN: npx tsx src/cli/scrapePhysicalSpecs.ts
 * RUN: npx tsx src/cli/scrapePhysicalSpecs.ts --limit=50 --confirm
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../../');
const OUTPUT_DIR = path.join(BASE_DIR, 'outputs');
const CSV_DIR = path.join(BASE_DIR, 'CSVs');

// ============================================================================
// TRUSTED STORES (fast & reliable for specs)
// ============================================================================

const SPEC_STORES = [
  {
    name: 'Hydrobuilder',
    baseUrl: 'https://hydrobuilder.com',
    searchUrl: 'https://hydrobuilder.com/search?q=',
    hasSpecs: true,
  },
  {
    name: 'Growershouse',
    baseUrl: 'https://growershouse.com',
    searchUrl: 'https://growershouse.com/search?q=',
    hasSpecs: true,
  },
  {
    name: 'GrowGeneration',
    baseUrl: 'https://www.growgeneration.com',
    searchUrl: 'https://www.growgeneration.com/catalogsearch/result/?q=',
    hasSpecs: true,
  },
];

// ============================================================================
// TYPES
// ============================================================================

interface ProductNeedingSpecs {
  handle: string;
  title: string;
  vendor: string;
  manufacturer: string;
  needsWeight: boolean;
  needsDimensions: boolean;
  currentWeight: number;
}

interface ScrapedSpecs {
  source: string;
  sourceUrl: string;
  matchConfidence: number;
  weight?: {
    value: number;
    unit: string;
    raw: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
    raw: string;
  };
  shippingWeight?: {
    value: number;
    unit: string;
    raw: string;
  };
  additionalSpecs: Record<string, string>;
  scrapedAt: string;
}

interface ScrapeResult {
  product: ProductNeedingSpecs;
  specs: ScrapedSpecs | null;
  success: boolean;
  error?: string;
}

// ============================================================================
// FETCH UTILITIES
// ============================================================================

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

// ============================================================================
// SEARCH & MATCH
// ============================================================================

function extractSearchTerms(product: ProductNeedingSpecs): string[] {
  const terms: string[] = [];
  const title = product.title;
  
  // Clean title
  const cleanTitle = title
    .replace(/\s*-\s*/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(gal|gallon|oz|ounce|ml|liter|qt|quart|lb|lbs)\b/gi, '')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = cleanTitle.split(/\s+/).filter(w => w.length > 2);
  
  // Brand + product name
  if (product.vendor) {
    terms.push(`${product.vendor} ${words.slice(0, 3).join(' ')}`);
  }
  if (product.manufacturer) {
    terms.push(`${product.manufacturer} ${words.slice(0, 3).join(' ')}`);
  }
  
  // Product name only
  terms.push(words.slice(0, 4).join(' '));
  terms.push(words.slice(0, 3).join(' '));
  
  return [...new Set(terms.filter(t => t.length > 5))].slice(0, 3);
}

function calculateMatchConfidence(productTitle: string, foundTitle: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const productNorm = normalize(productTitle);
  const foundNorm = normalize(foundTitle);
  
  // Extract words
  const productWords = new Set(productTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const foundWords = new Set(foundTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  let overlap = 0;
  for (const word of productWords) {
    if (foundWords.has(word)) overlap++;
  }
  
  const wordScore = overlap / Math.max(productWords.size, 1);
  
  // Check for substring match
  const substringScore = productNorm.includes(foundNorm) || foundNorm.includes(productNorm) ? 0.3 : 0;
  
  return Math.min(1, wordScore + substringScore);
}

// ============================================================================
// SPEC EXTRACTION
// ============================================================================

function extractWeight(html: string): { value: number; unit: string; raw: string } | null {
  const patterns = [
    // Explicit weight labels
    /weight\s*:?\s*([\d.]+)\s*(lb|lbs|pound|pounds|oz|ounce|kg|g|gram)/i,
    /product\s+weight\s*:?\s*([\d.]+)\s*(lb|lbs|oz|kg|g)/i,
    /item\s+weight\s*:?\s*([\d.]+)\s*(lb|lbs|oz|kg|g)/i,
    /net\s+weight\s*:?\s*([\d.]+)\s*(lb|lbs|oz|kg|g)/i,
    
    // Shipping weight
    /shipping\s+weight\s*:?\s*([\d.]+)\s*(lb|lbs|oz|kg|g)/i,
    
    // Schema.org / JSON-LD
    /"weight"\s*:\s*{\s*"value"\s*:\s*"?([\d.]+)"?\s*,\s*"unitCode"\s*:\s*"(\w+)"/i,
    /"weight"\s*:\s*"?([\d.]+)\s*(lb|lbs|oz|kg|g)"?/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let value = parseFloat(match[1]);
      let unit = match[2].toLowerCase();
      
      // Normalize units
      if (unit === 'lbs' || unit === 'pounds' || unit === 'pound') unit = 'lb';
      if (unit === 'ounce' || unit === 'ounces') unit = 'oz';
      if (unit === 'gram' || unit === 'grams') unit = 'g';
      
      // Convert to lbs for consistency
      if (unit === 'oz') value = value / 16;
      else if (unit === 'kg') value = value * 2.205;
      else if (unit === 'g') value = value / 453.592;
      
      // Sanity check (products shouldn't weigh more than 500 lbs)
      if (value > 0 && value < 500) {
        return { value: Math.round(value * 100) / 100, unit: 'lb', raw: match[0] };
      }
    }
  }
  
  return null;
}

function extractDimensions(html: string): { length: number; width: number; height: number; unit: string; raw: string } | null {
  const patterns = [
    // L x W x H formats
    /dimensions?\s*:?\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*(in|inch|inches|cm|mm|ft)?/i,
    /size\s*:?\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*(in|inch|inches|cm|mm)?/i,
    /([\d.]+)\s*["']?\s*[LlWwHh]\s*[x×]\s*([\d.]+)\s*["']?\s*[LlWwHh]?\s*[x×]\s*([\d.]+)/i,
    
    // Product dimensions
    /product\s+dimensions?\s*:?\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*(in|cm)?/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let length = parseFloat(match[1]);
      let width = parseFloat(match[2]);
      let height = parseFloat(match[3]);
      let unit = (match[4] || 'in').toLowerCase();
      
      // Normalize units
      if (unit === 'inches' || unit === 'inch') unit = 'in';
      if (unit === 'feet' || unit === 'foot') { unit = 'in'; length *= 12; width *= 12; height *= 12; }
      
      // Convert cm/mm to inches
      if (unit === 'cm') { length /= 2.54; width /= 2.54; height /= 2.54; unit = 'in'; }
      if (unit === 'mm') { length /= 25.4; width /= 25.4; height /= 25.4; unit = 'in'; }
      
      // Sanity check (reasonable dimensions)
      if (length > 0 && length < 200 && width > 0 && width < 200 && height > 0 && height < 200) {
        return {
          length: Math.round(length * 10) / 10,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
          unit: 'in',
          raw: match[0],
        };
      }
    }
  }
  
  return null;
}

function extractAdditionalSpecs(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  
  // Common spec patterns in tables or definition lists
  const tablePatterns = [
    /<tr[^>]*>\s*<t[hd][^>]*>([^<]+)<\/t[hd]>\s*<td[^>]*>([^<]+)<\/td>/gi,
    /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/gi,
    /<li[^>]*>\s*<strong>([^<]+)<\/strong>\s*:?\s*([^<]+)<\/li>/gi,
  ];
  
  // Interesting spec keys
  const interestingKeys = [
    'voltage', 'wattage', 'amperage', 'power', 'input', 'output',
    'capacity', 'flow rate', 'gph', 'cfm', 'btu',
    'material', 'color', 'finish',
    'warranty', 'certification', 'ul listed',
    'cord length', 'hose size', 'inlet', 'outlet',
    'coverage area', 'lumens', 'spectrum', 'ppfd',
  ];
  
  for (const pattern of tablePatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const key = match[1].trim().toLowerCase().replace(/:/g, '');
      const value = match[2].trim();
      
      if (key.length >= 3 && key.length < 50 && value.length >= 1 && value.length < 200) {
        // Only keep interesting specs
        const isInteresting = interestingKeys.some(ik => key.includes(ik));
        if (isInteresting) {
          specs[key] = value;
        }
      }
    }
    
    if (Object.keys(specs).length >= 10) break;
  }
  
  return specs;
}

// ============================================================================
// MAIN SCRAPING LOGIC
// ============================================================================

async function searchAndScrape(product: ProductNeedingSpecs): Promise<ScrapedSpecs | null> {
  const searchTerms = extractSearchTerms(product);
  
  for (const store of SPEC_STORES) {
    for (const term of searchTerms) {
      const searchUrl = `${store.searchUrl}${encodeURIComponent(term)}`;
      
      const searchHtml = await fetchWithTimeout(searchUrl);
      if (!searchHtml) continue;
      
      // Find product links in search results
      const linkPattern = /<a[^>]+href=["']([^"']+(?:product|item)[^"']*)["'][^>]*>([^<]*)<\/a>/gi;
      const links: { url: string; title: string }[] = [];
      
      const matches = searchHtml.matchAll(linkPattern);
      for (const match of matches) {
        const url = match[1];
        const title = match[2].trim();
        
        if (title.length > 5 && !url.includes('category') && !url.includes('collection')) {
          links.push({
            url: url.startsWith('http') ? url : `${store.baseUrl}${url}`,
            title,
          });
        }
      }
      
      // Find best match
      let bestMatch: { url: string; title: string; confidence: number } | null = null;
      
      for (const link of links.slice(0, 10)) {
        const confidence = calculateMatchConfidence(product.title, link.title);
        if (confidence >= 0.7 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { ...link, confidence };
        }
      }
      
      if (bestMatch) {
        // Fetch product page
        const productHtml = await fetchWithTimeout(bestMatch.url);
        if (!productHtml) continue;
        
        const weight = extractWeight(productHtml);
        const dimensions = extractDimensions(productHtml);
        const additionalSpecs = extractAdditionalSpecs(productHtml);
        
        // Only return if we found useful data
        if (weight || dimensions || Object.keys(additionalSpecs).length > 0) {
          return {
            source: store.name,
            sourceUrl: bestMatch.url,
            matchConfidence: bestMatch.confidence,
            weight: weight || undefined,
            dimensions: dimensions || undefined,
            additionalSpecs,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  return null;
}

// ============================================================================
// LOAD PRODUCTS NEEDING SPECS
// ============================================================================

function loadProductsNeedingSpecs(): ProductNeedingSpecs[] {
  const gapPath = path.join(OUTPUT_DIR, 'gap_report.json');
  
  if (!fs.existsSync(gapPath)) {
    console.error('❌ gap_report.json not found! Run buildCompleteImport.ts first.');
    process.exit(1);
  }
  
  const gapReport = JSON.parse(fs.readFileSync(gapPath, 'utf-8'));
  
  // Combine products needing weight (most important for shipping)
  const products: ProductNeedingSpecs[] = gapReport.needsWeight.map((p: any) => ({
    handle: p.handle,
    title: p.title,
    vendor: p.vendor || '',
    manufacturer: '',
    needsWeight: true,
    needsDimensions: true,
    currentWeight: 0,
  }));
  
  console.log(`📦 Loaded ${products.length} products needing weight/dimensions`);
  return products;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
  
  console.log('⚖️ FORTIFIED SPEC SCRAPER');
  console.log('=' .repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} products`);
  console.log(`Stores: ${SPEC_STORES.map(s => s.name).join(', ')}`);
  console.log(`Min confidence: 70%`);
  console.log('');
  console.log('This scraper ONLY extracts:');
  console.log('  - Weight (for shipping calculations)');
  console.log('  - Dimensions (L x W x H)');
  console.log('  - Additional specs (voltage, warranty, etc.)');
  console.log('');
  
  const products = loadProductsNeedingSpecs();
  const toProcess = products.slice(0, limit);
  
  console.log(`\n🔍 Processing ${toProcess.length} products...\n`);
  
  const results: ScrapeResult[] = [];
  let found = 0;
  let foundWeight = 0;
  let foundDimensions = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${product.title.slice(0, 40).padEnd(42)}`);
    
    try {
      const specs = await searchAndScrape(product);
      
      if (specs) {
        found++;
        if (specs.weight) foundWeight++;
        if (specs.dimensions) foundDimensions++;
        
        console.log(`✅ ${specs.source} (${(specs.matchConfidence * 100).toFixed(0)}%)`);
        if (specs.weight) console.log(`     Weight: ${specs.weight.value} ${specs.weight.unit}`);
        if (specs.dimensions) console.log(`     Dims: ${specs.dimensions.length} x ${specs.dimensions.width} x ${specs.dimensions.height} ${specs.dimensions.unit}`);
        
        results.push({ product, specs, success: true });
      } else {
        console.log('❌ No match');
        results.push({ product, specs: null, success: false });
      }
    } catch (err) {
      console.log(`❌ Error: ${err}`);
      results.push({ product, specs: null, success: false, error: String(err) });
    }
    
    // Rate limit between products
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Save results
  const outputPath = path.join(OUTPUT_DIR, 'scraped_specs.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun,
    processed: toProcess.length,
    found,
    foundWeight,
    foundDimensions,
    results: results.filter(r => r.success).map(r => ({
      handle: r.product.handle,
      title: r.product.title,
      specs: r.specs,
    })),
  }, null, 2));
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 SCRAPE SUMMARY');
  console.log('=' .repeat(60));
  console.log(`Processed:        ${toProcess.length}`);
  console.log(`Found specs:      ${found} (${(found / toProcess.length * 100).toFixed(1)}%)`);
  console.log(`Found weight:     ${foundWeight}`);
  console.log(`Found dimensions: ${foundDimensions}`);
  console.log(`\n✅ Results saved to: outputs/scraped_specs.json`);
  
  if (dryRun) {
    console.log('\n⚠️ DRY RUN - No changes made to products');
    console.log('Run with --confirm to apply to Shopify store');
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
