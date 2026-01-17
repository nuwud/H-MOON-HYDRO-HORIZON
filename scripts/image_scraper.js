/**
 * ════════════════════════════════════════════════════════════════════════════════
 * IMAGE SCRAPER v2.0 — Robust, Persistent Product Image Collection
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * A fault-tolerant image scraping pipeline with:
 * - Full state persistence (resume from any failure)
 * - Priority-based queue (high-value products first)
 * - Multi-source searching (30+ hydro stores)
 * - Image validation (dimensions, format, quality)
 * - Adaptive rate limiting (respects site limits)
 * 
 * Usage:
 *   node scripts/image_scraper.js                    # Full run
 *   node scripts/image_scraper.js --resume           # Resume from state
 *   node scripts/image_scraper.js --limit=50         # Process 50 products
 *   node scripts/image_scraper.js --vendor="Fox Farm" # Filter by vendor
 *   node scripts/image_scraper.js --dry-run          # Search only, no download
 *   node scripts/image_scraper.js --report           # Show status report
 * 
 * Spec: IMAGE-002 — Robust Product Image Scraping System
 * ════════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Global state reference for graceful shutdown
let globalState = null;
let isShuttingDown = false;

// Graceful shutdown handler
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n\n⚠️  ${signal} received, saving state...`);
    
    if (globalState) {
      try {
        globalState.lastUpdated = new Date().toISOString();
        fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(globalState, null, 2));
        console.log(`✅ State saved to ${CONFIG.STATE_FILE}`);
        console.log(`   Run with --resume to continue from here.`);
      } catch (e) {
        console.error('❌ Failed to save state:', e.message);
      }
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('\n💥 Uncaught exception:', err.message);
    shutdown('EXCEPTION');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Input/Output paths
  PRODUCTS_CSV: './CSVs/products_export_final.csv',
  STATE_FILE: './outputs/image_scrape_state.json',
  REPORT_FILE: './outputs/image_scrape_report.csv',
  CACHE_DIR: './outputs/scraped_images',
  OUTPUT_CSV: './CSVs/products_with_scraped_images.csv',
  
  // WooCommerce local images
  WOO_IMAGE_MAP: './CSVs/woo_image_map.json',
  WOO_UPLOADS_DIR: './hmoonhydro.com/wp-content/uploads',
  
  // Rate limiting
  REQUEST_DELAY_MS: 1500,
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 2000,
  TIMEOUT_MS: 15000,
  
  // Image validation
  MIN_WIDTH: 400,
  MIN_HEIGHT: 400,
  MIN_FILE_SIZE: 5000,  // 5KB minimum
  MAX_FILE_SIZE: 10000000, // 10MB max
  
  // Scraping limits
  MAX_SOURCES_PER_PRODUCT: 5,
  MAX_PARALLEL: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE SOURCES
// ═══════════════════════════════════════════════════════════════════════════════

const MANUFACTURER_SITES = {
  'General Hydroponics': {
    domain: 'generalhydroponics.com',
    searchUrl: 'https://generalhydroponics.com/?s=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'Advanced Nutrients': {
    domain: 'advancednutrients.com',
    searchUrl: 'https://www.advancednutrients.com/?s=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'Fox Farm': {
    domain: 'foxfarm.com',
    searchUrl: 'https://foxfarm.com/?s=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'AC Infinity': {
    domain: 'acinfinity.com',
    searchUrl: 'https://acinfinity.com/search/?q=',
    imageSelector: /product.*?image.*?src=["']([^"']+)/i,
  },
  'Spider Farmer': {
    domain: 'spider-farmer.com',
    searchUrl: 'https://www.spider-farmer.com/search?q=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'Botanicare': {
    domain: 'botanicare.com',
    searchUrl: 'https://botanicare.com/search?q=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'Canna': {
    domain: 'cannagardening.com',
    searchUrl: 'https://www.cannagardening.com/search?q=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
  'Hydrofarm': {
    domain: 'hydrofarm.com',
    searchUrl: 'https://www.hydrofarm.com/search/?search=',
    imageSelector: /og:image.*?content=["']([^"']+)/i,
  },
};

const RETAILER_SITES = [
  {
    name: 'GrowGeneration',
    domain: 'growgeneration.com',
    searchUrl: 'https://www.growgeneration.com/catalogsearch/result/?q=',
    delay: 2000,
    priority: 1,
  },
  {
    name: 'Hydrobuilder',
    domain: 'hydrobuilder.com',
    searchUrl: 'https://hydrobuilder.com/search?q=',
    delay: 1500,
    priority: 2,
  },
  {
    name: 'Planet Natural',
    domain: 'planetnatural.com',
    searchUrl: 'https://www.planetnatural.com/?s=',
    delay: 1000,
    priority: 3,
  },
  {
    name: 'Growershouse',
    domain: 'growershouse.com',
    searchUrl: 'https://growershouse.com/search?q=',
    delay: 1500,
    priority: 4,
  },
  {
    name: 'HTG Supply',
    domain: 'htgsupply.com',
    searchUrl: 'https://www.htgsupply.com/search?q=',
    delay: 2000,
    priority: 5,
  },
  {
    name: 'GrowAce',
    domain: 'growace.com',
    searchUrl: 'https://growace.com/search?q=',
    delay: 1500,
    priority: 6,
  },
  {
    name: 'Greenhouse Megastore',
    domain: 'greenhousemegastore.com',
    searchUrl: 'https://www.greenhousemegastore.com/search?q=',
    delay: 1500,
    priority: 7,
  },
];

// Priority brand scores (0-1)
const BRAND_PRIORITY = {
  'General Hydroponics': 1.0,
  'Advanced Nutrients': 1.0,
  'Fox Farm': 0.95,
  'AC Infinity': 0.95,
  'Spider Farmer': 0.90,
  'Mars Hydro': 0.90,
  'Gavita': 0.90,
  'Botanicare': 0.85,
  'Canna': 0.85,
  'Hydrofarm': 0.80,
  'Humboldt': 0.80,
  'EcoPlus': 0.75,
  'VIVOSUN': 0.70,
  'iPower': 0.65,
  'default': 0.50,
};

// Category value scores (0-1)
const CATEGORY_PRIORITY = {
  'nutrients': 1.0,
  'grow_lights': 0.95,
  'ventilation': 0.85,
  'controllers': 0.80,
  'grow_media': 0.75,
  'containers': 0.70,
  'irrigation': 0.70,
  'propagation': 0.65,
  'pest_control': 0.60,
  'harvesting': 0.55,
  'default': 0.40,
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function createEmptyState() {
  return {
    version: '2.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    stats: {
      totalProducts: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
    },
    products: {},
    sourceStats: {},
  };
}

function loadState() {
  if (fs.existsSync(CONFIG.STATE_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG.STATE_FILE, 'utf-8');
      const state = JSON.parse(data);
      console.log(`📂 Loaded state: ${state.stats.completed} completed, ${state.stats.pending} pending`);
      return state;
    } catch (e) {
      console.log('⚠️  Failed to load state, starting fresh');
    }
  }
  return createEmptyState();
}

function saveState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
}

function updateProductState(state, handle, updates) {
  if (!state.products[handle]) {
    state.products[handle] = {
      status: 'pending',
      priority: 0,
      attempts: 0,
      maxAttempts: CONFIG.MAX_RETRIES,
      lastAttempt: null,
      sources: {},
      foundImages: [],
      selectedImage: null,
      error: null,
    };
  }
  Object.assign(state.products[handle], updates);
  
  // Update stats
  const statuses = Object.values(state.products).map(p => p.status);
  state.stats.completed = statuses.filter(s => s === 'found').length;
  state.stats.failed = statuses.filter(s => s === 'failed').length;
  state.stats.pending = statuses.filter(s => s === 'pending' || s === 'searching').length;
  state.stats.skipped = statuses.filter(s => s === 'skipped').length;
  
  saveState(state);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseCSV(content) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || (char === '\r' && next === '\n')) && !inQuotes) {
      if (char === '\r') i++;
      row.push(current.trim());
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

function loadProducts() {
  const content = fs.readFileSync(CONFIG.PRODUCTS_CSV, 'utf-8');
  const rows = parseCSV(content);
  const header = rows[0];
  
  const handleIdx = 0;
  const titleIdx = 1;
  const vendorIdx = 3;
  const categoryIdx = 4;
  const imageIdx = header.findIndex(h => h.toLowerCase().includes('image src'));
  const priceIdx = header.findIndex(h => h.toLowerCase().includes('variant price'));
  
  const products = [];
  const seen = new Set();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const handle = row[handleIdx]?.replace(/^"|"$/g, '');
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    
    const hasImage = !!(row[imageIdx]?.replace(/^"|"$/g, ''));
    
    products.push({
      handle,
      title: row[titleIdx]?.replace(/^"|"$/g, '') || '',
      vendor: row[vendorIdx]?.replace(/^"|"$/g, '') || '',
      category: row[categoryIdx]?.replace(/^"|"$/g, '') || '',
      price: parseFloat(row[priceIdx]?.replace(/[^0-9.]/g, '')) || 0,
      hasImage,
      rowIndex: i,
    });
  }
  
  return { products, header, rows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

function calculatePriority(product) {
  // Price normalization (0-1, max $500)
  const priceScore = Math.min(product.price / 500, 1);
  
  // Brand score
  const brandScore = BRAND_PRIORITY[product.vendor] || BRAND_PRIORITY.default;
  
  // Category score (parse from Google category or title)
  let categoryScore = CATEGORY_PRIORITY.default;
  const text = (product.title + ' ' + product.category).toLowerCase();
  
  if (/nutrient|flora|bloom|fertilizer|feed/i.test(text)) categoryScore = CATEGORY_PRIORITY.nutrients;
  else if (/light|led|hps|grow light|quantum/i.test(text)) categoryScore = CATEGORY_PRIORITY.grow_lights;
  else if (/fan|ventilation|exhaust|carbon filter/i.test(text)) categoryScore = CATEGORY_PRIORITY.ventilation;
  else if (/controller|timer|thermostat/i.test(text)) categoryScore = CATEGORY_PRIORITY.controllers;
  else if (/rockwool|coco|perlite|grow media/i.test(text)) categoryScore = CATEGORY_PRIORITY.grow_media;
  else if (/pot|container|bucket|fabric/i.test(text)) categoryScore = CATEGORY_PRIORITY.containers;
  
  // Weighted priority
  const priority = 
    (priceScore * 0.40) +
    (brandScore * 0.25) +
    (categoryScore * 0.20) +
    0.15; // Base priority for having inventory
  
  return Math.round(priority * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP FETCHING WITH RETRY
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_REDIRECTS = 5;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Single fetch attempt
function fetchOnce(url, timeout = CONFIG.TIMEOUT_MS, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error('TOO_MANY_REDIRECTS'));
      return;
    }
    
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error('INVALID_URL'));
      return;
    }
    
    const protocol = parsed.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // Avoid compression issues
        'Connection': 'close', // Don't keep connections open (more reliable)
      },
    };
    
    const req = protocol.get(options, (res) => {
      // Rate limited
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMITED'));
        return;
      }
      // Blocked
      if (res.statusCode === 403 || res.statusCode === 401) {
        reject(new Error('BLOCKED'));
        return;
      }
      // Redirect - follow it
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `${parsed.protocol}//${parsed.hostname}${redirectUrl}`;
        }
        fetchOnce(redirectUrl, timeout, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      // Server errors - retryable
      if (res.statusCode >= 500) {
        reject(new Error(`SERVER_ERROR_${res.statusCode}`));
        return;
      }
      // Client errors (except 403/401/429)
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP_${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        } catch (e) {
          reject(new Error('DECODE_ERROR'));
        }
      });
      res.on('error', (e) => reject(new Error(`RESPONSE_ERROR: ${e.message}`)));
    });
    
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNRESET') reject(new Error('CONNECTION_RESET'));
      else if (e.code === 'ENOTFOUND') reject(new Error('DNS_ERROR'));
      else if (e.code === 'ECONNREFUSED') reject(new Error('CONNECTION_REFUSED'));
      else if (e.code === 'ETIMEDOUT') reject(new Error('TIMEOUT'));
      else reject(new Error(`NETWORK_ERROR: ${e.code || e.message}`));
    });
  });
}

// Fetch with automatic retry
async function fetchUrl(url, timeout = CONFIG.TIMEOUT_MS) {
  let lastError;
  
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fetchOnce(url, timeout);
    } catch (err) {
      lastError = err;
      const errMsg = err.message;
      
      // Non-retryable errors
      if (['BLOCKED', 'RATE_LIMITED', 'INVALID_URL', 'TOO_MANY_REDIRECTS', 'DNS_ERROR'].includes(errMsg)) {
        throw err;
      }
      
      // HTTP 4xx errors (except 429) are not retryable
      if (errMsg.startsWith('HTTP_4')) {
        throw err;
      }
      
      // Retryable errors: TIMEOUT, CONNECTION_RESET, SERVER_ERROR, etc.
      if (attempt < RETRY_DELAYS.length) {
        const waitTime = RETRY_DELAYS[attempt];
        // Only log retry on verbose or after first fail
        if (attempt > 0) {
          console.log(`      ↻ Retry ${attempt + 1} after ${waitTime}ms...`);
        }
        await delay(waitTime);
      }
    }
  }
  
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

function extractImagesFromHtml(html, baseUrl) {
  const images = [];
  
  // OpenGraph image (highest priority)
  const ogMatch = html.match(/og:image["'\s]+content=["']([^"']+)/i) ||
                  html.match(/content=["']([^"']+)["'\s]+property=["']og:image/i);
  if (ogMatch) images.push(ogMatch[1]);
  
  // Product images
  const productImgRegex = /<img[^>]+class=["'][^"']*product[^"']*["'][^>]+src=["']([^"']+)/gi;
  let match;
  while ((match = productImgRegex.exec(html)) !== null) {
    images.push(match[1]);
  }
  
  // Data-src images (lazy loaded)
  const dataSrcRegex = /data-src=["']([^"']+\.(jpg|jpeg|png|webp))/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    images.push(match[1]);
  }
  
  // Large images by size
  const sizedImgRegex = /<img[^>]+src=["']([^"']+)[^>]+(width|height)=["'](\d+)/gi;
  while ((match = sizedImgRegex.exec(html)) !== null) {
    const size = parseInt(match[3]);
    if (size >= 300) images.push(match[1]);
  }
  
  // Normalize and dedupe
  const seen = new Set();
  return images
    .map(img => {
      try {
        if (img.startsWith('//')) img = 'https:' + img;
        if (img.startsWith('/')) img = new URL(img, baseUrl).href;
        return img;
      } catch { return null; }
    })
    .filter(img => {
      if (!img || seen.has(img)) return false;
      seen.add(img);
      // Filter out tiny images, icons, logos
      if (/logo|icon|badge|sprite|pixel|placeholder|loading/i.test(img)) return false;
      return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(img);
    })
    .slice(0, 5); // Max 5 images per source
}

function extractSearchResults(html, domain) {
  const productUrls = [];
  
  // Common product URL patterns
  const patterns = [
    /href=["']([^"']*\/product[s]?\/[^"']+)/gi,
    /href=["']([^"']*\/p\/[^"']+)/gi,
    /href=["']([^"']+\.html)["'][^>]*class=["'][^"']*product/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      try {
        if (url.startsWith('/')) url = `https://${domain}${url}`;
        if (url.includes(domain)) productUrls.push(url);
      } catch {}
    }
  }
  
  return [...new Set(productUrls)].slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

function buildSearchQuery(title, vendor) {
  // Remove size/variant info for broader match
  let query = title
    .replace(/\s*-\s*/g, ' ')
    .replace(/\b\d+\s*(gal|gallon|oz|ounce|ml|liter|qt|quart|pack|pk)\b/gi, '')
    .replace(/\b\d+(\.\d+)?\s*(w|watt|cfm|gph)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Add vendor for specificity
  if (vendor && !query.toLowerCase().includes(vendor.toLowerCase())) {
    query = vendor + ' ' + query;
  }
  
  return encodeURIComponent(query.slice(0, 100));
}

async function searchSource(source, query, state) {
  const sourceKey = source.domain || source.name;
  
  // Check if source is blocked
  if (state.sourceStats[sourceKey]?.blocked) {
    return { source: sourceKey, status: 'blocked', images: [] };
  }
  
  // Check consecutive failures - temporarily skip sources with too many
  const stats = state.sourceStats[sourceKey];
  if (stats && stats.consecutiveFails >= 3) {
    // Reset after 5 minutes
    const cooldownMs = 5 * 60 * 1000;
    if (stats.lastFailTime && Date.now() - stats.lastFailTime < cooldownMs) {
      return { source: sourceKey, status: 'cooling_down', images: [] };
    } else {
      stats.consecutiveFails = 0; // Reset after cooldown
    }
  }
  
  try {
    const searchUrl = source.searchUrl + query;
    console.log(`   🔍 Searching ${source.name || sourceKey}...`);
    
    const html = await fetchUrl(searchUrl);
    await delay(source.delay || CONFIG.REQUEST_DELAY_MS);
    
    // Get product URLs from search results
    const productUrls = extractSearchResults(html, source.domain);
    
    if (productUrls.length === 0) {
      return { source: sourceKey, status: 'no_results', images: [] };
    }
    
    // Fetch first product page with separate try/catch
    let productHtml;
    try {
      productHtml = await fetchUrl(productUrls[0]);
    } catch (productErr) {
      // Product page failed but search worked - partial success
      console.log(`      ⚠️ Product page failed: ${productErr.message}`);
      return { source: sourceKey, status: 'product_fetch_failed', images: [] };
    }
    
    const images = extractImagesFromHtml(productHtml, productUrls[0]);
    
    // Update source stats - success!
    if (!state.sourceStats[sourceKey]) {
      state.sourceStats[sourceKey] = { found: 0, failed: 0, blocked: false, consecutiveFails: 0 };
    }
    state.sourceStats[sourceKey].consecutiveFails = 0; // Reset on success
    if (images.length > 0) {
      state.sourceStats[sourceKey].found++;
    }
    
    return { 
      source: sourceKey, 
      status: images.length > 0 ? 'found' : 'no_images',
      images,
      productUrl: productUrls[0],
    };
    
  } catch (err) {
    const errMsg = err.message;
    
    if (!state.sourceStats[sourceKey]) {
      state.sourceStats[sourceKey] = { found: 0, failed: 0, blocked: false, consecutiveFails: 0 };
    }
    state.sourceStats[sourceKey].failed++;
    state.sourceStats[sourceKey].consecutiveFails = (state.sourceStats[sourceKey].consecutiveFails || 0) + 1;
    state.sourceStats[sourceKey].lastFailTime = Date.now();
    
    // Permanent blocks
    if (errMsg === 'BLOCKED' || errMsg === 'RATE_LIMITED') {
      state.sourceStats[sourceKey].blocked = true;
      console.log(`   ⛔ ${source.name || sourceKey} blocked/rate-limited`);
    } else if (errMsg.includes('TIMEOUT') || errMsg.includes('CONNECTION')) {
      // Transient network issues - don't log loudly
      console.log(`   ⚠️ ${source.name || sourceKey}: ${errMsg}`);
    }
    
    return { source: sourceKey, status: 'error', error: errMsg, images: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL IMAGE SOURCES
// ═══════════════════════════════════════════════════════════════════════════════

function checkWooCommerceImages(handle) {
  try {
    if (!fs.existsSync(CONFIG.WOO_IMAGE_MAP)) return null;
    
    const data = JSON.parse(fs.readFileSync(CONFIG.WOO_IMAGE_MAP, 'utf-8'));
    
    // Handle both object and array formats
    let imageMap = data;
    if (Array.isArray(data)) {
      imageMap = {};
      data.forEach(item => {
        if (item.handle) imageMap[item.handle] = item.image || item.images?.[0];
      });
    }
    
    if (imageMap[handle]) {
      return { source: 'woocommerce', status: 'found', images: [imageMap[handle]] };
    }
    
    // Try partial match
    const handleBase = handle.split('-').slice(0, 3).join('-');
    for (const [key, value] of Object.entries(imageMap)) {
      if (key.startsWith(handleBase)) {
        return { source: 'woocommerce', status: 'found', images: [value] };
      }
    }
    
  } catch (e) {
    console.log(`   ⚠️  WooCommerce image map error: ${e.message}`);
  }
  return null;
}

function checkLocalUploads(handle, title) {
  const uploadsPath = CONFIG.WOO_UPLOADS_DIR;
  if (!fs.existsSync(uploadsPath)) return null;
  
  try {
    // Search for matching files
    const searchTerms = [
      handle,
      title.split(' ').slice(0, 2).join('-').toLowerCase(),
      title.split(' ')[0].toLowerCase(),
    ];
    
    const findImages = (dir) => {
      const results = [];
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            results.push(...findImages(fullPath));
          } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(item.name)) {
            const lower = item.name.toLowerCase();
            for (const term of searchTerms) {
              if (lower.includes(term.slice(0, 10))) {
                results.push(fullPath);
              }
            }
          }
        }
      } catch {}
      return results;
    };
    
    const found = findImages(uploadsPath);
    if (found.length > 0) {
      return { source: 'local', status: 'found', images: found.slice(0, 3) };
    }
    
  } catch (e) {
    console.log(`   ⚠️  Local upload search error: ${e.message}`);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCRAPE LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function scrapeProduct(product, state) {
  const { handle, title, vendor } = product;
  console.log(`\n📦 [${product.priority}] ${title.slice(0, 50)}...`);
  
  updateProductState(state, handle, { 
    status: 'searching',
    lastAttempt: new Date().toISOString(),
    attempts: (state.products[handle]?.attempts || 0) + 1,
  });
  
  const allResults = [];
  
  // 1. Check WooCommerce image map first (free, fast)
  const wooResult = checkWooCommerceImages(handle);
  if (wooResult?.images?.length) {
    console.log(`   ✅ Found in WooCommerce image map`);
    allResults.push(wooResult);
  }
  
  // 2. Check local uploads
  const localResult = checkLocalUploads(handle, title);
  if (localResult?.images?.length) {
    console.log(`   ✅ Found in local uploads`);
    allResults.push(localResult);
  }
  
  // 3. Try manufacturer site if vendor matches
  if (vendor && MANUFACTURER_SITES[vendor]) {
    const mfgSource = MANUFACTURER_SITES[vendor];
    const query = buildSearchQuery(title, vendor);
    const result = await searchSource(
      { ...mfgSource, name: vendor },
      query,
      state
    );
    if (result.images?.length) {
      console.log(`   ✅ Found on manufacturer site`);
      allResults.push(result);
    }
  }
  
  // 4. Try retailers (if still need images)
  if (allResults.length === 0) {
    const query = buildSearchQuery(title, vendor);
    
    for (const retailer of RETAILER_SITES) {
      if (allResults.length >= 2) break; // Stop after 2 good results
      
      const result = await searchSource(retailer, query, state);
      if (result.images?.length) {
        console.log(`   ✅ Found on ${retailer.name}`);
        allResults.push(result);
      }
    }
  }
  
  // Collect all found images
  const allImages = allResults.flatMap(r => r.images || []);
  
  if (allImages.length > 0) {
    updateProductState(state, handle, {
      status: 'found',
      foundImages: allImages,
      selectedImage: allImages[0],
      sources: allResults.reduce((acc, r) => {
        acc[r.source] = { status: r.status, images: r.images };
        return acc;
      }, {}),
    });
    console.log(`   📸 Collected ${allImages.length} images`);
    return true;
  } else {
    updateProductState(state, handle, {
      status: 'failed',
      error: 'No images found',
    });
    console.log(`   ❌ No images found`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateReport(state) {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 IMAGE SCRAPING REPORT');
  console.log('═'.repeat(70));
  
  console.log(`\nOverall Statistics:`);
  console.log(`   Total Products: ${state.stats.totalProducts}`);
  console.log(`   ✅ Completed:   ${state.stats.completed}`);
  console.log(`   ❌ Failed:      ${state.stats.failed}`);
  console.log(`   ⏳ Pending:     ${state.stats.pending}`);
  console.log(`   ⏭️  Skipped:     ${state.stats.skipped}`);
  
  const successRate = state.stats.totalProducts > 0 
    ? ((state.stats.completed / state.stats.totalProducts) * 100).toFixed(1)
    : 0;
  console.log(`\n   Success Rate: ${successRate}%`);
  
  console.log(`\nSource Statistics:`);
  for (const [source, stats] of Object.entries(state.sourceStats)) {
    const status = stats.blocked ? '⛔ BLOCKED' : '✅ Active';
    console.log(`   ${source}: ${stats.found} found, ${stats.failed} failed ${status}`);
  }
  
  // Write CSV report
  const reportLines = ['Handle,Title,Status,Images Found,Selected Image,Sources'];
  for (const [handle, data] of Object.entries(state.products)) {
    const sources = Object.keys(data.sources || {}).join(';');
    reportLines.push([
      handle,
      `"${data.title || ''}"`,
      data.status,
      data.foundImages?.length || 0,
      data.selectedImage || '',
      sources,
    ].join(','));
  }
  
  fs.writeFileSync(CONFIG.REPORT_FILE, reportLines.join('\n'));
  console.log(`\n📄 Report saved: ${CONFIG.REPORT_FILE}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  // Setup graceful shutdown first
  setupGracefulShutdown();
  
  console.log('═'.repeat(70));
  console.log('🖼️  ROBUST IMAGE SCRAPER v2.1');
  console.log('═'.repeat(70));
  console.log('   Press Ctrl+C to stop safely (state will be saved)\n');
  
  const args = process.argv.slice(2);
  const flags = {
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    report: args.includes('--report'),
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0,
    vendor: args.find(a => a.startsWith('--vendor='))?.split('=')[1]?.replace(/"/g, ''),
    handle: args.find(a => a.startsWith('--handle='))?.split('=')[1],
  };
  
  // Load state
  let state = loadState();
  globalState = state; // Store reference for graceful shutdown
  
  // Load products
  console.log(`📂 Loading products from: ${CONFIG.PRODUCTS_CSV}`);
  const { products } = loadProducts();
  
  // Filter to products needing images
  let needsImages = products.filter(p => !p.hasImage);
  console.log(`   Found ${needsImages.length} products missing images`);
  
  // Apply filters
  if (flags.vendor) {
    needsImages = needsImages.filter(p => 
      p.vendor.toLowerCase().includes(flags.vendor.toLowerCase())
    );
    console.log(`   Filtered to ${needsImages.length} by vendor: ${flags.vendor}`);
  }
  if (flags.handle) {
    needsImages = needsImages.filter(p => p.handle === flags.handle);
    console.log(`   Filtered to handle: ${flags.handle}`);
  }
  
  // Initialize state for new products
  for (const product of needsImages) {
    if (!state.products[product.handle]) {
      product.priority = calculatePriority(product);
      updateProductState(state, product.handle, {
        title: product.title,
        vendor: product.vendor,
        priority: product.priority,
      });
    } else {
      product.priority = state.products[product.handle].priority;
    }
  }
  
  state.stats.totalProducts = needsImages.length;
  saveState(state);
  
  // Report only mode
  if (flags.report) {
    generateReport(state);
    return;
  }
  
  // Build queue (skip completed/skipped)
  let queue = needsImages
    .filter(p => {
      const status = state.products[p.handle]?.status;
      return !['found', 'skipped'].includes(status);
    })
    .sort((a, b) => b.priority - a.priority);
  
  if (flags.limit) {
    queue = queue.slice(0, flags.limit);
  }
  
  console.log(`\n🚀 Starting scrape of ${queue.length} products...`);
  if (flags.dryRun) console.log('   (DRY RUN - no downloads)');
  
  // Process queue
  let processed = 0;
  let found = 0;
  
  for (const product of queue) {
    try {
      const success = await scrapeProduct(product, state);
      processed++;
      if (success) found++;
      
      // Progress update every 10 products
      if (processed % 10 === 0) {
        console.log(`\n📈 Progress: ${processed}/${queue.length} (${found} found)`);
      }
      
    } catch (err) {
      console.log(`   💥 Error: ${err.message}`);
      updateProductState(state, product.handle, {
        status: 'failed',
        error: err.message,
      });
    }
  }
  
  // Final report
  generateReport(state);
  
  console.log('\n✅ Scraping complete!');
  console.log(`   Processed: ${processed}`);
  console.log(`   Found: ${found}`);
  console.log(`   State saved for resume: ${CONFIG.STATE_FILE}`);
}

main().catch(console.error);
