/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: scrapeHydroStores.ts
 * PURPOSE: Web scraping ONLY - fetches product specs from external hydro stores
 * 
 * ⚠️  DO NOT ADD: WooCommerce/POS parsing, variant grouping, or CSV generation
 * ⚠️  DO NOT MERGE: Code from consolidateProducts.ts or buildCompleteImport.ts
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * Web Scraper for Hydroponic Store Content
 * 
 * Scrapes product data from top hydro stores:
 * - HTG Supply
 * - Growershouse
 * - Hydro Empire
 * - GrowGeneration
 * 
 * Usage:
 *   npx tsx src/cli/scrapeHydroStores.ts
 *   npx tsx src/cli/scrapeHydroStores.ts --product="General Hydroponics Flora"
 */

import 'dotenv/config';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const CACHE_DIR = resolve(__dirname, '../../../CSVs/scrape_cache');
const DATA_DIR = resolve(__dirname, '../../../CSVs');

// Major hydro stores to scrape - ordered by speed (fastest first)
// Tested 12/20/2025 - removed slow/blocking stores
const HYDRO_STORES = [
  {
    name: 'Planet Natural',
    baseUrl: 'https://www.planetnatural.com',
    searchUrl: 'https://www.planetnatural.com/?s=',
    fast: true,  // ~500ms per query
  },
  {
    name: 'Hydrobuilder',
    baseUrl: 'https://hydrobuilder.com',
    searchUrl: 'https://hydrobuilder.com/search?q=',
    fast: true,  // ~1400ms per query
  },
  {
    name: 'Greenhouse Megastore',
    baseUrl: 'https://www.greenhousemegastore.com',
    searchUrl: 'https://www.greenhousemegastore.com/search?q=',
    fast: true,  // ~1400ms per query
  },
  {
    name: 'Growershouse',
    baseUrl: 'https://growershouse.com',
    searchUrl: 'https://growershouse.com/search?q=',
    fast: true,  // ~1900ms per query
  },
  {
    name: 'GrowGeneration',
    baseUrl: 'https://www.growgeneration.com',
    searchUrl: 'https://www.growgeneration.com/catalogsearch/result/?q=',
    fast: true,  // ~2100ms per query
  },
  {
    name: 'GrowAce',
    baseUrl: 'https://growace.com',
    searchUrl: 'https://growace.com/search?q=',
    fast: true,  // ~2500ms per query
  },
];

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  hasImage: boolean;
  hasDescription: boolean;
  descriptionLength: number;
}

interface ScrapedProduct {
  source: string;
  title: string;
  description: string;
  price: string;
  comparePrice: string;
  imageUrl: string;
  additionalImages: string[];
  productUrl: string;
  specs: Record<string, string>;
  category: string;
  brand: string;
  sku: string;
  weight: string;
  dimensions: string;
  upc: string;
  mpn: string;
  warranty: string;
  features: string[];
  scrapedAt: string;
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

async function getProductsNeedingContent(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  console.log('📦 Fetching products needing content...');

  while (true) {
    const query = `
      query($cursor: String) {
        products(first: 100, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              vendor
              featuredImage { url }
              descriptionHtml
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const data = await shopifyGQL(query, { cursor });
    const edges = data.data?.products?.edges || [];

    for (const edge of edges) {
      const node = edge.node;
      const descHtml = node.descriptionHtml || '';
      // Consider needing content if no image or short/missing description
      const hasImage = !!node.featuredImage;
      const hasDescription = descHtml.length > 100;
      
      if (!hasImage || !hasDescription) {
        products.push({
          id: node.id,
          title: node.title,
          handle: node.handle,
          vendor: node.vendor || '',
          hasImage,
          hasDescription,
          descriptionLength: descHtml.length,
        });
      }
    }

    const pageInfo = data.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  console.log(`   Found ${products.length} products needing content\n`);
  return products;
}

// Extract search terms from product title
function extractSearchTerms(title: string): string[] {
  // Common brand names in hydro industry
  const brands = [
    'General Hydroponics', 'Advanced Nutrients', 'Fox Farm', 'Botanicare',
    'Humboldt', 'EcoPlus', 'Can-Filter', 'Hydro-Logic', 'ONA', 'Hortilux',
    'Gavita', 'iPower', 'VIVOSUN', 'AC Infinity', 'Sun System', 'Dyna-Gro',
    'Sunlight Supply', 'HTG', 'Hydrofarm', 'American Hydroponics', 'SunBlaster',
    'Plantmax', 'Autopilot', 'CAN-Fan', 'Titan Controls', 'Grodan', 'Canna',
    'House & Garden', 'Dutch Master', 'Roots Organics', 'Nectar for the Gods',
    'Cutting Edge', 'Current Culture', 'Hydrotek', 'Active Aqua', 'Bubble Magic',
    'TRIMBOX', 'TRIMPRO', 'FloraFlex', 'Athena', 'Mills', 'Mammoth', 'Cyco',
  ];

  const brandMatch = brands.find(b => 
    title.toLowerCase().includes(b.toLowerCase())
  );

  // Remove common suffixes/noise words
  const cleanTitle = title
    .replace(/\s*-\s*/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(gal|gallon|oz|ounce|ml|liter|litre|lbs?|pound|qt|quart|w|watt)\b/gi, '')
    .replace(/\b\d+\b/g, ' ')  // Remove standalone numbers
    .replace(/\s+/g, ' ')
    .trim();

  // Extract key product words
  const words = cleanTitle
    .split(/\s+/)
    .filter(w => w.length > 2);

  const queries: string[] = [];
  
  // 1. Primary query with brand (highest priority)
  if (brandMatch) {
    queries.push(`${brandMatch} ${words.slice(0, 3).join(' ')}`);
    // Also try just brand + first word
    queries.push(`${brandMatch} ${words[0]}`);
  }
  
  // 2. Full product words (4 words)
  queries.push(words.slice(0, 4).join(' '));
  
  // 3. Shorter variant (3 words) - often more matches
  queries.push(words.slice(0, 3).join(' '));
  
  // 4. Extract model numbers (often the best search term)
  const modelMatch = title.match(/([A-Z]{2,}[-\s]?\d+[A-Z0-9]*)/i);
  if (modelMatch) {
    queries.push(modelMatch[1]);
    if (brandMatch) {
      queries.push(`${brandMatch} ${modelMatch[1]}`);
    }
  }
  
  // 5. Product type-based search
  const productTypes = [
    'pump', 'timer', 'filter', 'reflector', 'ballast', 'nutrient', 'fertilizer',
    'trimmer', 'scissors', 'pot', 'bucket', 'lamp', 'bulb', 'fan', 'blower',
    'grow light', 'led light', 'hps', 'mh', 'cfl', 'reservoir', 'controller',
    'co2', 'carbon filter', 'inline fan', 'tent', 'grow tent', 'trellis',
    'ph meter', 'tds meter', 'ec meter', 'air stone', 'air pump', 'water pump',
    'hydroponic system', 'drip system', 'ebb and flow', 'dwc', 'nft'
  ];
  const typeMatch = productTypes.find(t => title.toLowerCase().includes(t));
  if (typeMatch && words.length >= 2) {
    queries.push(`hydroponic ${words[0]} ${typeMatch}`);
    queries.push(`${typeMatch} ${words.slice(0, 2).join(' ')}`);
  }
  
  // 6. Size/capacity variant search (remove size, search core product)
  const withoutSize = title
    .replace(/\d+\s*(gal|gallon|oz|ounce|ml|liter|litre|qt|quart|inch|in|ft|foot|feet|cfm|gph|watt|w)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sizeWords = withoutSize.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  if (sizeWords.length >= 2 && sizeWords.join(' ') !== words.slice(0, 3).join(' ')) {
    queries.push(sizeWords.join(' '));
  }
  
  // 7. Category + key word search
  const categories = ['hydroponic', 'grow', 'indoor garden', 'cultivation'];
  if (words[0] && !categories.some(c => words[0].toLowerCase().includes(c))) {
    queries.push(`hydroponic ${words[0]}`);
  }

  return [...new Set(queries.filter(q => q.trim().length > 5))].slice(0, 6); // Max 6 queries per product
}

// Fetch with retry and timeout
async function fetchWithRetry(url: string, retries = 3): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      if (i === retries - 1) {
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  clearTimeout(timeout);
  return null;
}

// Parse HTML to extract product data (simple regex-based for portability)
function parseSearchResults(html: string, store: typeof HYDRO_STORES[0]): ScrapedProduct[] {
  const results: ScrapedProduct[] = [];

  // Generic patterns for common e-commerce structures
  // Product containers often have class containing "product" and link + image + title
  
  // Extract product links
  const productLinkRegex = /<a[^>]+href=["']([^"']+product[^"']*)["'][^>]*>/gi;
  const imgRegex = /<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["'][^>]*>/gi;
  const priceRegex = /\$[\d,]+\.?\d*/g;

  // Find all anchor tags that might be products
  const anchorMatches = html.matchAll(/<a[^>]+href=["']([^"']*(?:product|item)[^"']*)["'][^>]*>([^<]*)<\/a>/gi);
  
  for (const match of anchorMatches) {
    const url = match[1];
    const title = match[2].trim();
    
    if (title.length > 5 && !url.includes('category') && !url.includes('collection')) {
      results.push({
        source: store.name,
        title,
        description: '',
        price: '',
        imageUrl: '',
        productUrl: url.startsWith('http') ? url : `${store.baseUrl}${url}`,
      });
    }
  }

  return results.slice(0, 5); // Limit to top 5
}

// Parse individual product page for detailed content
async function parseProductPage(url: string, store: typeof HYDRO_STORES[0]): Promise<Partial<ScrapedProduct>> {
  const html = await fetchWithRetry(url);
  if (!html) return {};

  const result: Partial<ScrapedProduct> = {};

  // Helper to clean extracted text (remove Liquid templates and HTML)
  const cleanText = (text: string): string => {
    return text
      .replace(/\{%[\s\S]*?%\}/g, '')  // Remove Liquid tags
      .replace(/\{\{[\s\S]*?\}\}/g, '') // Remove Liquid output
      .replace(/<[^>]+>/g, ' ')         // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Try Shopify JSON-LD first (most reliable for Shopify stores)
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd['@type'] === 'Product' || jsonLd.name) {
        result.description = cleanText(jsonLd.description || '');
        result.imageUrl = jsonLd.image?.[0] || jsonLd.image || '';
        result.brand = jsonLd.brand?.name || jsonLd.brand || '';
        result.sku = jsonLd.sku || '';
        if (jsonLd.offers) {
          result.price = jsonLd.offers.price ? `$${jsonLd.offers.price}` : '';
        }
      }
    } catch (e) {
      // JSON parse failed, continue with regex
    }
  }

  // Try Open Graph meta tags (very reliable)
  if (!result.description) {
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDescMatch) {
      result.description = cleanText(ogDescMatch[1]);
    }
  }
  
  if (!result.imageUrl) {
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImgMatch && !ogImgMatch[1].includes('no-image')) {
      result.imageUrl = ogImgMatch[1];
    }
  }

  // Try to extract description (common patterns)
  if (!result.description || result.description.length < 50) {
    const descPatterns = [
      /<div[^>]+(?:class|id)=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+(?:class|id)=["'][^"']*product-detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ];

    for (const pattern of descPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const cleaned = cleanText(match[1]).slice(0, 2000);
        // Only use if it looks like real content (not template code)
        if (cleaned.length > 50 && !cleaned.includes('{%') && !cleaned.includes('{{')) {
          result.description = cleaned;
          break;
        }
      }
    }
  }

  // Try to extract main image (skip placeholders)
  if (!result.imageUrl) {
    const imgPatterns = [
      /<img[^>]+(?:class|id)=["'][^"']*product[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+data-zoom=["']([^"']+)["']/i,
      /<img[^>]+data-src=["']([^"']+)["'][^>]+class=["'][^"']*product[^"']*["']/i,
      /<img[^>]+src=["']([^"']*cdn\.shopify\.com[^"']*_1024x[^"']*)["']/i,
      /<img[^>]+src=["']([^"']*cdn\.shopify\.com[^"']*\.(?:jpg|png|webp)[^"']*)["']/i,
    ];

    for (const pattern of imgPatterns) {
      const match = html.match(pattern);
      if (match && match[1] && !match[1].includes('no-image') && !match[1].includes('placeholder')) {
        result.imageUrl = match[1].startsWith('http') 
          ? match[1] 
          : match[1].startsWith('//') 
            ? `https:${match[1]}`
            : `${store.baseUrl}${match[1]}`;
        break;
      }
    }
  }

  // Extract additional/gallery images
  result.additionalImages = [];
  const galleryMatches = html.matchAll(/<img[^>]+(?:class=["'][^"']*(?:gallery|thumbnail|carousel)[^"']*["'])[^>]+src=["']([^"']+)["']/gi);
  for (const match of galleryMatches) {
    const imgUrl = match[1].startsWith('http') ? match[1] : `${store.baseUrl}${match[1]}`;
    if (!result.additionalImages.includes(imgUrl) && result.additionalImages.length < 5) {
      result.additionalImages.push(imgUrl);
    }
  }

  // Extract price and compare price
  const priceMatches = html.match(/\$[\d,]+\.?\d*/g) || [];
  if (priceMatches.length >= 1) {
    result.price = priceMatches[0];
  }
  if (priceMatches.length >= 2) {
    // Often compare price is the first (crossed out) and sale price is second
    result.comparePrice = priceMatches[0];
    result.price = priceMatches[1];
  }

  // Extract specifications/features
  result.specs = {};
  const specPatterns = [
    /<tr[^>]*>\s*<t[hd][^>]*>([^<]+)<\/t[hd]>\s*<td[^>]*>([^<]+)<\/td>/gi,
    /<li[^>]*>\s*<strong>([^<]+)<\/strong>\s*:?\s*([^<]+)<\/li>/gi,
    /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/gi,
  ];
  
  for (const pattern of specPatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const key = match[1].trim().replace(/:/g, '');
      const value = match[2].trim();
      if (key && value && key.length < 50 && value.length < 200) {
        result.specs[key] = value;
      }
    }
  }

  // Extract brand
  const brandPatterns = [
    /<meta[^>]+property=["']product:brand["'][^>]+content=["']([^"']+)["']/i,
    /<span[^>]+class=["'][^"']*brand[^"']*["'][^>]*>([^<]+)<\/span>/i,
    /brand["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const pattern of brandPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.brand = match[1].trim();
      break;
    }
  }

  // Extract SKU
  const skuPatterns = [
    /sku["']\s*:\s*["']([^"']+)["']/i,
    /<span[^>]+class=["'][^"']*sku[^"']*["'][^>]*>([^<]+)<\/span>/i,
    /SKU\s*:?\s*([A-Z0-9-]+)/i,
  ];
  for (const pattern of skuPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.sku = match[1].trim();
      break;
    }
  }

  // Extract category
  const categoryPatterns = [
    /<meta[^>]+property=["']product:category["'][^>]+content=["']([^"']+)["']/i,
    /<nav[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/nav>/i,
  ];
  for (const pattern of categoryPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.category = match[1].trim();
      break;
    }
  }

  // Extract weight
  const weightPatterns = [
    /weight["']\s*:\s*["']([^"']+)["']/i,
    /weight\s*:?\s*([\d.]+)\s*(lb|oz|kg|g|lbs|pounds)/i,
    /shipping\s+weight\s*:?\s*([\d.]+\s*(?:lb|oz|kg|g|lbs))/i,
  ];
  for (const pattern of weightPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.weight = match[1] + (match[2] || '');
      break;
    }
  }

  // Extract dimensions
  const dimPatterns = [
    /dimensions?\s*:?\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*(in|inch|cm|mm)?/i,
    /([\d.]+)\s*["']?\s*[LlWwHh]\s*[x×]\s*([\d.]+)\s*["']?\s*[LlWwHh]?\s*[x×]\s*([\d.]+)/i,
    /size\s*:?\s*([\d.]+\s*[x×]\s*[\d.]+(?:\s*[x×]\s*[\d.]+)?)/i,
  ];
  for (const pattern of dimPatterns) {
    const match = html.match(pattern);
    if (match) {
      if (match[3]) {
        result.dimensions = `${match[1]} x ${match[2]} x ${match[3]}${match[4] || ''}`;
      } else if (match[1]) {
        result.dimensions = match[1];
      }
      break;
    }
  }

  // Extract UPC/Barcode
  const upcPatterns = [
    /upc["']?\s*:?\s*["']?([\d]{12,14})["']?/i,
    /barcode["']?\s*:?\s*["']?([\d]{12,14})["']?/i,
    /gtin["']?\s*:?\s*["']?([\d]{12,14})["']?/i,
  ];
  for (const pattern of upcPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.upc = match[1];
      break;
    }
  }

  // Extract MPN (Manufacturer Part Number)
  const mpnPatterns = [
    /mpn["']?\s*:?\s*["']?([A-Z0-9-]+)["']?/i,
    /manufacturer\s+part\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /part\s*#?\s*:?\s*([A-Z0-9-]+)/i,
  ];
  for (const pattern of mpnPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].length >= 4) {
      result.mpn = match[1];
      break;
    }
  }

  // Extract warranty info
  const warrantyPatterns = [
    /warranty\s*:?\s*([^<]{5,100})/i,
    /(\d+)\s*(year|month|day)s?\s+warranty/i,
  ];
  for (const pattern of warrantyPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.warranty = match[0].trim();
      break;
    }
  }

  // Extract features as bullet points (filter out template code)
  result.features = [];
  const featurePatterns = [
    /<li[^>]*>\s*([^<]{10,200})\s*<\/li>/gi,
    /<p[^>]+class=["'][^"']*feature[^"']*["'][^>]*>([^<]+)<\/p>/gi,
  ];
  for (const pattern of featurePatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const feature = match[1].trim().replace(/^[•\-\*]\s*/, '');
      // Filter out template code and generic text
      if (feature.length > 10 && 
          feature.length < 200 && 
          !feature.includes('<') &&
          !feature.includes('{{') &&
          !feature.includes('{%') &&
          !feature.includes('variant.title') &&
          !feature.includes('Choosing a selection') &&
          !feature.includes('Opens in a new window') &&
          !feature.toLowerCase().includes('javascript')) {
        result.features.push(feature);
      }
    }
    if (result.features.length >= 10) break; // Cap at 10 features
  }

  // Extract additional images (gallery)
  result.additionalImages = [];
  const galleryPatterns = [
    /<img[^>]+data-src=["']([^"']+\.(jpg|jpeg|png|webp))["'][^>]*>/gi,
    /<img[^>]+class=["'][^"']*gallery[^"']*["'][^>]+src=["']([^"']+)["']/gi,
    /<a[^>]+href=["']([^"']+\.(jpg|jpeg|png|webp))["'][^>]+class=["'][^"']*thumb/gi,
  ];
  for (const pattern of galleryPatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const imgUrl = match[1];
      if (imgUrl && !result.additionalImages.includes(imgUrl) && imgUrl !== result.imageUrl) {
        result.additionalImages.push(imgUrl.startsWith('http') ? imgUrl : `https:${imgUrl}`);
      }
    }
    if (result.additionalImages.length >= 5) break; // Cap at 5 additional images
  }

  return result;
}

async function searchProduct(productTitle: string, stores: typeof HYDRO_STORES, fastMode = false): Promise<ScrapedProduct[]> {
  const searchTerms = extractSearchTerms(productTitle);
  const allResults: ScrapedProduct[] = [];
  
  // In fast mode, use fewer queries and stop on first match
  const maxQueries = fastMode ? 2 : 6;
  const storesToSearch = fastMode ? stores.slice(0, 3) : stores; // Top 3 stores in fast mode

  for (const store of storesToSearch) {
    for (const term of searchTerms.slice(0, maxQueries)) {
      const searchUrl = `${store.searchUrl}${encodeURIComponent(term)}`;
      console.log(`   🔍 Searching ${store.name}: "${term}"`);
      
      const html = await fetchWithRetry(searchUrl);
      if (html) {
        const results = parseSearchResults(html, store);
        allResults.push(...results);
        
        // In fast mode, stop if we found good results
        if (fastMode && results.length > 0) {
          console.log(`   ⚡ Fast mode: found ${results.length} results, moving on...`);
          break; // Move to next store
        }
      }
      
      // Rate limit (faster in fast mode)
      await new Promise(r => setTimeout(r, fastMode ? 200 : 500));
    }
    
    // In fast mode, stop after first store with results
    if (fastMode && allResults.length >= 3) {
      break;
    }
  }

  return allResults;
}

// Global fast mode flag (set by main)
let globalFastMode = false;

async function scrapeAndEnrich(product: ShopifyProduct): Promise<ScrapedProduct | null> {
  console.log(`\n📦 Searching for: ${product.title}`);
  
  const results = await searchProduct(product.title, HYDRO_STORES, globalFastMode);
  
  if (results.length === 0) {
    console.log('   ❌ No matches found');
    return null;
  }

  // Filter out results that are template code or garbage
  const validResults = results.filter(r => {
    const title = r.title || '';
    // Skip template code
    if (title.includes('{{') || title.includes('{%')) return false;
    if (title.includes('translate:') || title.includes('translations')) return false;
    // Skip navigation elements
    if (title.length < 5) return false;
    if (title.toLowerCase().includes('view full') || title.toLowerCase().includes('quick view')) return false;
    return true;
  });

  if (validResults.length === 0) {
    console.log(`   ❌ No valid results found`);
    return null;
  }

  // Find best match by title similarity
  const normalized = product.title.toLowerCase();
  let bestMatch = validResults[0];
  let bestScore = 0;

  for (const result of validResults) {
    const resultNorm = result.title.toLowerCase();
    // Simple word overlap score
    const words1 = new Set(normalized.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(resultNorm.split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    const score = overlap / Math.max(words1.size, 1);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  if (bestScore < 0.3) {
    console.log(`   ⚠️ Low confidence match: ${bestMatch.title}`);
    return null;
  }

  console.log(`   ✅ Best match: ${bestMatch.title} (${bestMatch.source})`);
  
  // Fetch detailed product page
  if (bestMatch.productUrl) {
    console.log(`   📄 Fetching product details...`);
    const store = HYDRO_STORES.find(s => s.name === bestMatch.source)!;
    const details = await parseProductPage(bestMatch.productUrl, store);
    Object.assign(bestMatch, details);
  }

  return bestMatch;
}

async function uploadImageFromUrl(productId: string, imageUrl: string): Promise<boolean> {
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) return false;
    
    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    // Determine filename and mimetype
    const urlPath = new URL(imageUrl).pathname;
    const filename = urlPath.split('/').pop() || 'product-image.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    // Create staged upload
    const stagedQuery = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;

    const stagedResult = await shopifyGQL(stagedQuery, {
      input: [{
        resource: 'PRODUCT_IMAGE',
        filename,
        mimeType,
        fileSize: buffer.length.toString(),
        httpMethod: 'POST',
      }],
    });

    const target = stagedResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) return false;

    // Upload to staged URL
    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    formData.append('file', new Blob([buffer], { type: mimeType }), filename);

    const uploadRes = await fetch(target.url, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadRes.ok) return false;

    // Attach to product
    const attachQuery = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id } }
          mediaUserErrors { field message }
        }
      }
    `;

    const attachResult = await shopifyGQL(attachQuery, {
      productId,
      media: [{ originalSource: target.resourceUrl, mediaContentType: 'IMAGE' }],
    });

    return !attachResult.data?.productCreateMedia?.mediaUserErrors?.length;
  } catch (err) {
    return false;
  }
}

async function updateProductDescription(productId: string, description: string): Promise<boolean> {
  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const result = await shopifyGQL(query, {
    input: {
      id: productId,
      descriptionHtml: description,
    },
  });

  return !result.data?.productUpdate?.userErrors?.length;
}

// Update product with all scraped data
async function updateProductFully(productId: string, scraped: ScrapedProduct): Promise<{ description: boolean; vendor: boolean }> {
  const results = { description: false, vendor: false };
  
  // Build update input
  const input: Record<string, any> = { id: productId };
  
  if (scraped.description && scraped.description.length > 50) {
    input.descriptionHtml = scraped.description;
  }
  
  if (scraped.brand) {
    input.vendor = scraped.brand;
  }

  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id vendor }
        userErrors { field message }
      }
    }
  `;

  const result = await shopifyGQL(query, { input });
  const success = !result.data?.productUpdate?.userErrors?.length;
  
  if (success) {
    results.description = !!input.descriptionHtml;
    results.vendor = !!input.vendor;
  }
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  const fastMode = args.includes('--fast');
  const singleProduct = args.find(a => a.startsWith('--product='))?.split('=')[1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20');

  console.log('🌐 HYDRO STORE SCRAPER');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${fastMode ? ' (FAST)' : ''}`);
  console.log(`Target stores: ${fastMode ? HYDRO_STORES.slice(0, 3).map(s => s.name).join(', ') : HYDRO_STORES.map(s => s.name).join(', ')}`);
  if (fastMode) {
    console.log(`⚡ Fast mode: 3 stores, 2 queries/product, early stopping`);
  }
  console.log();

  // Set global fast mode flag
  globalFastMode = fastMode;

  // Get products needing content
  let products: ShopifyProduct[];
  
  if (singleProduct) {
    // Test with single product
    const query = `
      query {
        products(first: 1, query: "title:*${singleProduct}*") {
          edges {
            node {
              id
              title
              handle
              vendor
              featuredImage { url }
              descriptionHtml
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query);
    products = (data.data?.products?.edges || []).map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      vendor: e.node.vendor || '',
      hasImage: !!e.node.featuredImage,
      hasDescription: (e.node.descriptionHtml || '').length > 100,
      descriptionLength: (e.node.descriptionHtml || '').length,
    }));
  } else {
    products = await getProductsNeedingContent();
  }

  // Prioritize products without images
  products.sort((a, b) => {
    if (!a.hasImage && b.hasImage) return -1;
    if (a.hasImage && !b.hasImage) return 1;
    return a.descriptionLength - b.descriptionLength;
  });

  const toProcess = products.slice(0, limit);
  console.log(`\nProcessing ${toProcess.length} products...\n`);

  const results: { product: ShopifyProduct; scraped: ScrapedProduct }[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${product.title.slice(0, 50)}`);
    
    const scraped = await scrapeAndEnrich(product);
    
    if (scraped) {
      results.push({ product, scraped });
      
      if (!dryRun) {
        // Upload image if found and product needs one
        if (!product.hasImage && scraped.imageUrl) {
          console.log(`   📸 Uploading image...`);
          const uploaded = await uploadImageFromUrl(product.id, scraped.imageUrl);
          console.log(`      ${uploaded ? '✅' : '❌'} Image ${uploaded ? 'uploaded' : 'failed'}`);
        }
        
        // Update description and vendor if found
        const needsDescription = !product.hasDescription && scraped.description && scraped.description.length > 100;
        const hasBrand = scraped.brand && scraped.brand.length > 0;
        
        if (needsDescription || hasBrand) {
          console.log(`   📝 Updating product data...`);
          const updates = await updateProductFully(product.id, scraped);
          if (updates.description) console.log(`      ✅ Description updated`);
          if (updates.vendor) console.log(`      ✅ Vendor set to: ${scraped.brand}`);
        }
        
        // Log additional data captured
        if (scraped.specs && Object.keys(scraped.specs).length > 0) {
          console.log(`      📊 Captured ${Object.keys(scraped.specs).length} specifications`);
        }
        if (scraped.features && scraped.features.length > 0) {
          console.log(`      📋 Captured ${scraped.features.length} features`);
        }
        if (scraped.additionalImages && scraped.additionalImages.length > 0) {
          console.log(`      🖼️  Found ${scraped.additionalImages.length} additional images`);
        }
        if (scraped.upc || scraped.mpn || scraped.sku) {
          console.log(`      🏷️  IDs: ${[scraped.sku && `SKU:${scraped.sku}`, scraped.mpn && `MPN:${scraped.mpn}`, scraped.upc && `UPC:${scraped.upc}`].filter(Boolean).join(', ')}`);
        }
        if (scraped.weight || scraped.dimensions) {
          console.log(`      📐 Physical: ${[scraped.weight && `Weight:${scraped.weight}`, scraped.dimensions && `Dims:${scraped.dimensions}`].filter(Boolean).join(', ')}`);
        }
      }
    }
    
    // Rate limit between products
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save results with ALL scraped data
  const outputPath = resolve(DATA_DIR, 'scrape_results.json');
  const fullOutputPath = resolve(DATA_DIR, 'scrape_results_full.json');
  
  // Summary file
  writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun,
    processed: toProcess.length,
    matched: results.length,
    results: results.map(r => ({
      shopifyProduct: r.product.title,
      shopifyHandle: r.product.handle,
      scrapedFrom: r.scraped.source,
      scrapedTitle: r.scraped.title,
      hasImage: !!r.scraped.imageUrl,
      hasDescription: (r.scraped.description || '').length > 50,
      descriptionLength: (r.scraped.description || '').length,
      price: r.scraped.price,
      brand: r.scraped.brand,
      category: r.scraped.category,
    })),
  }, null, 2));

  // Full data file with ALL scraped content
  writeFileSync(fullOutputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun,
    processed: toProcess.length,
    matched: results.length,
    products: results.map(r => ({
      shopify: {
        id: r.product.id,
        title: r.product.title,
        handle: r.product.handle,
        vendor: r.product.vendor,
      },
      scraped: {
        source: r.scraped.source,
        title: r.scraped.title,
        productUrl: r.scraped.productUrl,
        description: r.scraped.description,
        price: r.scraped.price,
        comparePrice: r.scraped.comparePrice,
        imageUrl: r.scraped.imageUrl,
        additionalImages: r.scraped.additionalImages || [],
        brand: r.scraped.brand,
        sku: r.scraped.sku,
        mpn: r.scraped.mpn,
        upc: r.scraped.upc,
        category: r.scraped.category,
        weight: r.scraped.weight,
        dimensions: r.scraped.dimensions,
        warranty: r.scraped.warranty,
        specs: r.scraped.specs || {},
        features: r.scraped.features || [],
        scrapedAt: new Date().toISOString(),
      },
    })),
  }, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Matched: ${results.length}`);
  console.log(`Match rate: ${((results.length / toProcess.length) * 100).toFixed(1)}%`);
  console.log(`\n📝 Summary saved to: CSVs/scrape_results.json`);
  console.log(`📦 Full data saved to: CSVs/scrape_results_full.json`);
  
  if (dryRun) {
    console.log('\n⚠️ DRY RUN - No changes made');
    console.log('Run with --confirm to apply changes');
  }
}

main().catch(console.error);
