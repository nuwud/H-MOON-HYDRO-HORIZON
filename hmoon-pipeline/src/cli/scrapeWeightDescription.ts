/**
 * Product Weight & Description Scraper (TypeScript)
 * 
 * Uses the hmoon-pipeline infrastructure with proper headers and rate limiting.
 * Scrapes from competitor Shopify stores which are more accessible.
 * 
 * Usage:
 *   npx tsx src/cli/scrapeWeightDescription.ts
 *   npx tsx src/cli/scrapeWeightDescription.ts --limit=50
 *   npx tsx src/cli/scrapeWeightDescription.ts --vendor="Advanced Nutrients"
 * 
 * Output:
 *   outputs/scraped_weight_data.json
 */

import 'dotenv/config';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../outputs');
const CSV_DIR = resolve(__dirname, '../../../CSVs');

const NEEDS_SCRAPING_PATH = resolve(DATA_DIR, 'needs_scraping.csv');
const OUTPUT_PATH = resolve(DATA_DIR, 'scraped_weight_data.json');

// === Shopify Competitor Stores (easier to scrape) ===
const SHOPIFY_STORES = [
  {
    name: 'Green Coast Hydroponics',
    domain: 'greencoasthydroponics.com',
    searchApi: '/search/suggest.json?q=',
    productJson: '.json',
  },
  {
    name: 'Hydro Empire',
    domain: 'hydroempire.com',
    searchApi: '/search/suggest.json?q=',
    productJson: '.json',
  },
  {
    name: 'Planet Natural',
    domain: 'planetnatural.com',
    searchApi: '/search/suggest.json?q=',
    productJson: '.json',
  },
];

// === Manufacturer Product APIs (JSON endpoints) ===
const MANUFACTURER_JSON_APIS = [
  {
    name: 'Hydrofarm',
    // Hydrofarm has a product catalog API
    searchUrl: 'https://www.hydrofarm.com/api/products/search?q=',
  },
];

interface ScrapedProduct {
  handle: string;
  title: string;
  sku: string;
  vendor: string;
  weightGrams: number | null;
  description: string | null;
  source: string | null;
  scrapedAt: string;
}

interface NeedsScrapingRow {
  Handle: string;
  Title: string;
  SKU: string;
  Vendor: string;
  'Needs Weight': string;
  'Needs Description': string;
}

// === Fetch with proper headers ===
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { 
        headers,
        redirect: 'follow',
      });
      
      if (res.status === 429) {
        // Rate limited, wait and retry
        await sleep(5000 * (attempt + 1));
        continue;
      }
      
      return res;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// === Search Shopify Store ===
async function searchShopifyStore(
  store: typeof SHOPIFY_STORES[0],
  searchTerm: string
): Promise<{ weight: number | null; description: string | null }> {
  try {
    // Use Shopify's suggest API
    const searchUrl = `https://${store.domain}${store.searchApi}${encodeURIComponent(searchTerm)}&resources[type]=product&resources[limit]=5`;
    const res = await fetchWithRetry(searchUrl);
    
    if (!res.ok) return { weight: null, description: null };
    
    const data = await res.json() as any;
    const products = data?.resources?.results?.products || [];
    
    if (products.length === 0) return { weight: null, description: null };
    
    // Get first matching product's JSON
    const productHandle = products[0].handle;
    const productUrl = `https://${store.domain}/products/${productHandle}.json`;
    
    const productRes = await fetchWithRetry(productUrl);
    if (!productRes.ok) return { weight: null, description: null };
    
    const productData = await productRes.json() as any;
    const product = productData.product;
    
    // Extract weight from first variant (in grams)
    let weight: number | null = null;
    if (product.variants && product.variants.length > 0) {
      const variantWeight = product.variants[0].weight;
      const weightUnit = product.variants[0].weight_unit;
      
      if (variantWeight > 0) {
        // Convert to grams
        switch (weightUnit) {
          case 'lb':
          case 'lbs':
            weight = Math.round(variantWeight * 453.592);
            break;
          case 'oz':
            weight = Math.round(variantWeight * 28.3495);
            break;
          case 'kg':
            weight = Math.round(variantWeight * 1000);
            break;
          default:
            weight = Math.round(variantWeight); // assume grams
        }
      }
    }
    
    // Extract description
    let description: string | null = null;
    if (product.body_html && product.body_html.length > 100) {
      // Clean HTML
      const $ = cheerio.load(product.body_html);
      description = $.text().replace(/\s+/g, ' ').trim();
      if (description.length < 100) description = null;
    }
    
    return { weight, description };
  } catch (err) {
    return { weight: null, description: null };
  }
}

// === Load needs_scraping.csv ===
function loadNeedsScraping(): NeedsScrapingRow[] {
  const content = readFileSync(NEEDS_SCRAPING_PATH, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim());
  
  const products: NeedsScrapingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const product: any = {};
    header.forEach((h, idx) => {
      product[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim();
    });
    products.push(product as NeedsScrapingRow);
  }
  return products;
}

// === Build search term ===
function buildSearchTerm(product: NeedsScrapingRow): string {
  // Clean title for search - remove special chars, limit length
  let term = product.Title
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If vendor is a known brand, prepend it
  const knownBrands = ['Advanced Nutrients', 'General Hydroponics', 'Fox Farm', 'Botanicare', 'Canna'];
  const vendor = product.Vendor;
  if (vendor && knownBrands.some(b => vendor.toLowerCase().includes(b.toLowerCase()))) {
    if (!term.toLowerCase().includes(vendor.toLowerCase())) {
      term = `${vendor} ${term}`;
    }
  }
  
  return term.slice(0, 80);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === Main ===
async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const vendorArg = args.find(a => a.startsWith('--vendor='));
  
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const filterVendor = vendorArg ? vendorArg.split('=')[1] : null;
  
  console.log('🔍 Weight & Description Scraper\n');
  
  if (!existsSync(NEEDS_SCRAPING_PATH)) {
    console.error('❌ needs_scraping.csv not found');
    process.exit(1);
  }
  
  let products = loadNeedsScraping();
  console.log(`📋 Loaded ${products.length} products needing data\n`);
  
  // Apply filters
  if (filterVendor) {
    products = products.filter(p => 
      p.Vendor.toLowerCase().includes(filterVendor.toLowerCase())
    );
    console.log(`  Filtered to vendor containing: "${filterVendor}" (${products.length} products)`);
  }
  if (limit) {
    products = products.slice(0, limit);
    console.log(`  Limited to ${limit} products`);
  }
  
  // Load existing scraped data
  let scrapedData: Record<string, ScrapedProduct> = {};
  if (existsSync(OUTPUT_PATH)) {
    scrapedData = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    console.log(`  Loaded ${Object.keys(scrapedData).length} previously scraped\n`);
  }
  
  let scraped = 0, skipped = 0, noData = 0;
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    
    // Skip if already scraped with data
    if (scrapedData[product.Handle]?.weightGrams || scrapedData[product.Handle]?.description) {
      skipped++;
      continue;
    }
    
    console.log(`[${i + 1}/${products.length}] ${product.Title.slice(0, 50)}...`);
    
    const searchTerm = buildSearchTerm(product);
    let foundWeight: number | null = null;
    let foundDesc: string | null = null;
    let foundSource: string | null = null;
    
    // Try each Shopify store
    for (const store of SHOPIFY_STORES) {
      if (foundWeight && foundDesc) break;
      
      console.log(`  → ${store.name}...`);
      const result = await searchShopifyStore(store, searchTerm);
      
      if (result.weight && !foundWeight) {
        foundWeight = result.weight;
        foundSource = store.name;
      }
      if (result.description && !foundDesc) {
        foundDesc = result.description;
        if (!foundSource) foundSource = store.name;
      }
      
      await sleep(1500); // Polite delay
    }
    
    // Save result
    scrapedData[product.Handle] = {
      handle: product.Handle,
      title: product.Title,
      sku: product.SKU,
      vendor: product.Vendor,
      weightGrams: foundWeight,
      description: foundDesc,
      source: foundSource,
      scrapedAt: new Date().toISOString(),
    };
    
    if (foundWeight || foundDesc) {
      console.log(`  ✅ weight=${foundWeight || 'N/A'}, desc=${foundDesc ? 'YES' : 'N/A'}`);
      scraped++;
    } else {
      console.log(`  ⚠️ No data found`);
      noData++;
    }
    
    // Save progress every 10 products
    if ((i + 1) % 10 === 0) {
      writeFileSync(OUTPUT_PATH, JSON.stringify(scrapedData, null, 2), 'utf8');
      console.log(`  💾 Progress saved\n`);
    }
    
    await sleep(500);
  }
  
  // Final save
  writeFileSync(OUTPUT_PATH, JSON.stringify(scrapedData, null, 2), 'utf8');
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SCRAPING SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Scraped with data: ${scraped}`);
  console.log(`No data found:     ${noData}`);
  console.log(`Skipped (cached):  ${skipped}`);
  console.log(`\n📁 Output: ${OUTPUT_PATH}`);
  console.log('\n✅ Done!');
}

main().catch(console.error);
