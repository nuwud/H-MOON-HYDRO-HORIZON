/**
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

// Major hydro stores to scrape
const HYDRO_STORES = [
  {
    name: 'HTG Supply',
    baseUrl: 'https://www.htgsupply.com',
    searchUrl: 'https://www.htgsupply.com/search?q=',
  },
  {
    name: 'Growershouse',
    baseUrl: 'https://growershouse.com',
    searchUrl: 'https://growershouse.com/search?q=',
  },
  {
    name: 'GrowGeneration',
    baseUrl: 'https://www.growgeneration.com',
    searchUrl: 'https://www.growgeneration.com/catalogsearch/result/?q=',
  },
  {
    name: 'Hydrobuilder',
    baseUrl: 'https://hydrobuilder.com',
    searchUrl: 'https://hydrobuilder.com/search?q=',
  },
  {
    name: 'Hydro Empire',
    baseUrl: 'https://hydroempire.com',
    searchUrl: 'https://hydroempire.com/search?q=',
  },
  {
    name: 'Hydrofarm',
    baseUrl: 'https://www.hydrofarm.com',
    searchUrl: 'https://www.hydrofarm.com/search/?search=',
  },
  {
    name: 'AM Hydro',
    baseUrl: 'https://www.amhydro.com',
    searchUrl: 'https://www.amhydro.com/search?q=',
  },
  {
    name: 'DoMyOwn',
    baseUrl: 'https://www.domyown.com',
    searchUrl: 'https://www.domyown.com/search.php?search_query=',
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
  imageUrl: string;
  productUrl: string;
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
  
  // Primary query with brand
  if (brandMatch) {
    queries.push(`${brandMatch} ${words.slice(0, 3).join(' ')}`);
  }
  
  // Secondary query - product name only
  queries.push(words.slice(0, 4).join(' '));
  
  // If has specific product type, add that
  const productTypes = ['pump', 'timer', 'filter', 'reflector', 'ballast', 'nutrient', 
                        'trimmer', 'scissors', 'pot', 'bucket', 'lamp', 'bulb', 'fan'];
  const typeMatch = productTypes.find(t => title.toLowerCase().includes(t));
  if (typeMatch && words.length >= 2) {
    queries.push(`hydroponic ${words[0]} ${typeMatch}`);
  }

  return [...new Set(queries.filter(q => q.trim().length > 5))];
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

  // Try to extract description (common patterns)
  const descPatterns = [
    /<div[^>]+(?:class|id)=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+(?:class|id)=["'][^"']*product-detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];

  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      // Clean HTML tags
      result.description = match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
      if (result.description.length > 50) break;
    }
  }

  // Try to extract main image
  const imgPatterns = [
    /<img[^>]+(?:class|id)=["'][^"']*product[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<img[^>]+data-zoom=["']([^"']+)["']/i,
  ];

  for (const pattern of imgPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.imageUrl = match[1].startsWith('http') 
        ? match[1] 
        : `${store.baseUrl}${match[1]}`;
      break;
    }
  }

  // Extract price
  const priceMatch = html.match(/\$[\d,]+\.?\d*/);
  if (priceMatch) {
    result.price = priceMatch[0];
  }

  return result;
}

async function searchProduct(productTitle: string, stores: typeof HYDRO_STORES): Promise<ScrapedProduct[]> {
  const searchTerms = extractSearchTerms(productTitle);
  const allResults: ScrapedProduct[] = [];

  for (const store of stores) {
    for (const term of searchTerms) {
      const searchUrl = `${store.searchUrl}${encodeURIComponent(term)}`;
      console.log(`   🔍 Searching ${store.name}: "${term}"`);
      
      const html = await fetchWithRetry(searchUrl);
      if (html) {
        const results = parseSearchResults(html, store);
        allResults.push(...results);
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return allResults;
}

async function scrapeAndEnrich(product: ShopifyProduct): Promise<ScrapedProduct | null> {
  console.log(`\n📦 Searching for: ${product.title}`);
  
  const results = await searchProduct(product.title, HYDRO_STORES);
  
  if (results.length === 0) {
    console.log('   ❌ No matches found');
    return null;
  }

  // Find best match by title similarity
  const normalized = product.title.toLowerCase();
  let bestMatch = results[0];
  let bestScore = 0;

  for (const result of results) {
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  const singleProduct = args.find(a => a.startsWith('--product='))?.split('=')[1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20');

  console.log('🌐 HYDRO STORE SCRAPER');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target stores: ${HYDRO_STORES.map(s => s.name).join(', ')}`);
  console.log();

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
        
        // Update description if found and product needs one
        if (!product.hasDescription && scraped.description && scraped.description.length > 100) {
          console.log(`   📝 Updating description...`);
          const updated = await updateProductDescription(product.id, scraped.description);
          console.log(`      ${updated ? '✅' : '❌'} Description ${updated ? 'updated' : 'failed'}`);
        }
      }
    }
    
    // Rate limit between products
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save results
  const outputPath = resolve(DATA_DIR, 'scrape_results.json');
  writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun,
    processed: toProcess.length,
    matched: results.length,
    results: results.map(r => ({
      shopifyProduct: r.product.title,
      scrapedFrom: r.scraped.source,
      scrapedTitle: r.scraped.title,
      hasImage: !!r.scraped.imageUrl,
      hasDescription: (r.scraped.description || '').length > 50,
      descriptionLength: (r.scraped.description || '').length,
    })),
  }, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Matched: ${results.length}`);
  console.log(`Match rate: ${((results.length / toProcess.length) * 100).toFixed(1)}%`);
  console.log(`\n📝 Results saved to: CSVs/scrape_results.json`);
  
  if (dryRun) {
    console.log('\n⚠️ DRY RUN - No changes made');
    console.log('Run with --confirm to apply changes');
  }
}

main().catch(console.error);
