#!/usr/bin/env node
/**
 * Variant Editor Server
 * 
 * Serves the variant editor and provides API endpoints for:
 * - Uploading images to Shopify CDN
 * - Saving variant groupings
 * - Exporting consolidated CSV
 * 
 * Usage:
 *   node scripts/variant_editor_server.js
 *   Then open http://localhost:3456
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

// Load .env manually
const envPath = path.join(__dirname, '../hmoon-pipeline/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const BASE = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');
const VARIANT_EDITOR_HTML = path.join(BASE, 'outputs/variant_editor.html');
const DOWNLOAD_DIR = path.join(BASE, 'outputs/downloaded_images');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'h-moon-hydro.myshopify.com';
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = '2024-10';
const PORT = 3456;

// Ensure directories exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Load manifest
let manifest = { version: '1.0', generatedAt: new Date().toISOString(), byFilename: {}, bySha1: {} };
if (fs.existsSync(MANIFEST_PATH)) {
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    manifest.bySha1 = manifest.bySha1 || {};
  } catch (e) {
    console.error('Failed to parse manifest:', e.message);
  }
}

// Save manifest
function saveManifest() {
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// Local image cache directory
const IMAGE_CACHE_DIR = path.join(BASE, 'outputs/downloaded_images');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// Download image from URL with multiple retry strategies
async function downloadImage(url) {
  const parsedUrl = new URL(url);
  
  // Strategy 1: Try with full browser headers
  try {
    const result = await downloadWithHeaders(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${parsedUrl.protocol}//${parsedUrl.hostname}/`,
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site'
    });
    return result;
  } catch (e) {
    console.log(`  Strategy 1 failed: ${e.message}`);
  }
  
  // Strategy 2: Try with minimal headers (some sites block complex headers)
  try {
    const result = await downloadWithHeaders(url, {
      'User-Agent': 'curl/7.64.1'
    });
    return result;
  } catch (e) {
    console.log(`  Strategy 2 failed: ${e.message}`);
  }
  
  // Strategy 3: Try with Googlebot user agent
  try {
    const result = await downloadWithHeaders(url, {
      'User-Agent': 'Googlebot-Image/1.0'
    });
    return result;
  } catch (e) {
    console.log(`  Strategy 3 failed: ${e.message}`);
    throw new Error(`All download strategies failed for ${url}`);
  }
}

// Download with specific headers
function downloadWithHeaders(url, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: headers,
      timeout: 15000
    };
    
    protocol.get(options, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location.startsWith('http') 
          ? response.headers.location 
          : `${parsedUrl.protocol}//${parsedUrl.host}${response.headers.location}`;
        downloadWithHeaders(redirectUrl, headers).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// GraphQL request to Shopify
async function graphqlRequest(query, variables = {}) {
  if (!SHOPIFY_ADMIN_TOKEN) {
    throw new Error('SHOPIFY_ADMIN_TOKEN not configured in .env');
  }
  
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }
  
  return response.json();
}

// Upload image to Shopify CDN
async function uploadToShopify(buffer, filename, originalUrl = '') {
  const ext = path.extname(filename).toLowerCase().slice(1) || 'jpg';
  const mimeTypes = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'
  };
  const mimeType = mimeTypes[ext] || 'image/jpeg';
  
  // Create unique filename with hash prefix
  const fullSha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  const shortHash = fullSha1.substring(0, 8);
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  const shopifyFilename = `${shortHash}__${cleanFilename}`;
  
  // Check if already in manifest by SHA1
  if (manifest.bySha1 && manifest.bySha1[fullSha1]) {
    console.log(`  ✓ Image already uploaded (cached): ${manifest.bySha1[fullSha1].shopifyUrl}`);
    return { url: manifest.bySha1[fullSha1].shopifyUrl, cached: true, sha1: fullSha1 };
  }
  
  console.log(`  Uploading ${shopifyFilename} (${(buffer.length / 1024).toFixed(1)} KB)...`);
  
  // Step 1: Create staged upload
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
  
  const stagedResult = await graphqlRequest(stagedQuery, {
    input: [{
      resource: 'FILE',
      filename: shopifyFilename,
      mimeType: mimeType,
      fileSize: buffer.length.toString(),
      httpMethod: 'POST',
    }],
  });
  
  if (stagedResult.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    throw new Error(stagedResult.data.stagedUploadsCreate.userErrors[0].message);
  }
  
  const target = stagedResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('No staged target returned');
  
  // Step 2: Upload to staged URL using FormData
  const FormData = (await import('formdata-node')).FormData;
  const { Blob } = (await import('buffer'));
  
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([buffer], { type: mimeType }), shopifyFilename);
  
  const uploadResponse = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Upload failed: ${uploadResponse.status} - ${text.substring(0, 200)}`);
  }
  
  // Step 3: Create file in Shopify
  const createQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            image { url }
          }
        }
        userErrors { field message }
      }
    }
  `;
  
  const createResult = await graphqlRequest(createQuery, {
    files: [{
      alt: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      contentType: 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });
  
  if (createResult.data?.fileCreate?.userErrors?.length > 0) {
    throw new Error(createResult.data.fileCreate.userErrors[0].message);
  }
  
  // Wait for processing
  await new Promise(r => setTimeout(r, 1500));
  
  // Get the final URL
  const getFileQuery = `
    query {
      files(first: 1, query: "filename:${shopifyFilename}") {
        nodes {
          ... on MediaImage {
            id
            image { url }
          }
        }
      }
    }
  `;
  
  const fileResult = await graphqlRequest(getFileQuery);
  const fileUrl = fileResult.data?.files?.nodes?.[0]?.image?.url;
  const fileId = fileResult.data?.files?.nodes?.[0]?.id;
  
  if (fileUrl) {
    // Update manifest
    manifest.byFilename[filename] = {
      originalFilename: filename,
      shopifyFilename,
      sha1: fullSha1,
      shopifyUrl: fileUrl,
      shopifyFileId: fileId,
      uploadedAt: new Date().toISOString(),
      originalPath: originalUrl,
      sizeBytes: buffer.length
    };
    manifest.bySha1[fullSha1] = manifest.byFilename[filename];
    saveManifest();
    
    console.log(`  ✓ Uploaded: ${fileUrl}`);
    return { url: fileUrl, cached: false, sha1: fullSha1, fileId };
  }
  
  throw new Error('Failed to get uploaded file URL');
}

// Handle API requests
async function handleUploadImage(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { url, productHandle } = JSON.parse(body);
      
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL is required' }));
        return;
      }
      
      console.log(`\n📷 CDN Upload Process Started`);
      console.log(`  Product: ${productHandle || 'unknown'}`);
      console.log(`  Source URL: ${url}`);
      
      // Step 1: Download the image locally
      console.log(`  [1/3] Downloading image...`);
      let buffer;
      try {
        buffer = await downloadImage(url);
        console.log(`  ✓ Downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);
      } catch (downloadErr) {
        console.log(`  ✗ Download failed: ${downloadErr.message}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: `Download failed: ${downloadErr.message}`,
          suggestion: 'Try saving the image manually and uploading from a local file, or use a different image source.'
        }));
        return;
      }
      
      // Extract filename from URL
      const urlPath = new URL(url).pathname;
      const filename = path.basename(urlPath) || `image_${Date.now()}.jpg`;
      
      // Save locally as backup
      const localPath = path.join(IMAGE_CACHE_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      console.log(`  ✓ Saved locally: ${localPath}`);
      
      // Step 2: Upload to Shopify CDN
      console.log(`  [2/3] Uploading to Shopify CDN...`);
      const result = await uploadToShopify(buffer, filename, url);
      console.log(`  ✓ Uploaded to CDN`);
      
      // Step 3: Return the CDN URL
      console.log(`  [3/3] CDN URL ready!`);
      console.log(`  🎉 ${result.url}`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        cdnUrl: result.url,
        cached: result.cached,
        sha1: result.sha1,
        fileId: result.fileId,
        localPath: localPath
      }));
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// Serve static files
function serveStaticFile(res, filePath, contentType) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// Scrape product data from external URL
async function handleScrapeUrl(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { url, productTitle } = JSON.parse(body);
      console.log(`\n📥 Scraping: ${url}`);
      
      // Fetch the page
      const html = await fetchPage(url);
      
      // Parse the HTML
      const scrapedData = parseProductPage(html, url, productTitle);
      
      console.log(`  ✓ Scraped: ${scrapedData.title || 'No title found'}`);
      console.log(`  ✓ Description: ${(scrapedData.description || '').length} chars`);
      console.log(`  ✓ Images: ${(scrapedData.images || []).length} found`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: scrapedData
      }));
      
    } catch (error) {
      console.error(`  ✗ Scrape error: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  });
}

// Fetch a web page
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };
    
    const request = protocol.get(options, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location.startsWith('http') 
          ? response.headers.location 
          : `${parsedUrl.protocol}//${parsedUrl.host}${response.headers.location}`;
        fetchPage(redirectUrl).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      let html = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { html += chunk; });
      response.on('end', () => resolve(html));
      response.on('error', reject);
    });
    
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Parse product page HTML to extract data
function parseProductPage(html, sourceUrl, productTitle = '') {
  const result = {
    sourceUrl,
    title: '',
    brand: '',
    description: '',
    shortDescription: '',
    features: [],
    specs: {},
    images: [],
    price: '',
    sku: '',
    upc: '',
    weight: '',
    dimensions: ''
  };
  
  // Helper to extract text between tags
  const extractBetween = (str, start, end) => {
    const startIdx = str.indexOf(start);
    if (startIdx === -1) return '';
    const endIdx = str.indexOf(end, startIdx + start.length);
    if (endIdx === -1) return '';
    return str.substring(startIdx + start.length, endIdx);
  };
  
  // Clean HTML tags from text
  const stripHtml = (str) => str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Extract title from <title> or <h1>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) 
    || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h1[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)/i);
  if (titleMatch) {
    result.title = stripHtml(titleMatch[1]).split('|')[0].split('-')[0].trim();
  }
  
  // Extract meta description
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (metaDescMatch) {
    result.shortDescription = stripHtml(metaDescMatch[1]);
  }
  
  // Extract product description from common containers
  const descriptionPatterns = [
    /<div[^>]*class="[^"]*product-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  ];
  
  for (const pattern of descriptionPatterns) {
    const match = html.match(pattern);
    if (match && match[1].length > 50) {
      result.description = stripHtml(match[1]);
      break;
    }
  }
  
  // Extract features from bullet lists within product area
  const featureListMatch = html.match(/<ul[^>]*class="[^"]*(?:features|product-features|bullet-list)[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (featureListMatch) {
    const items = featureListMatch[1].match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
    result.features = items.map(li => stripHtml(li)).filter(f => f.length > 5);
  }
  
  // Extract specs from tables
  const specTableMatch = html.match(/<table[^>]*class="[^"]*(?:spec|product-spec|specifications)[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (specTableMatch) {
    const rows = specTableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const thMatch = row.match(/<t[hd][^>]*>([^<]*)<\/t[hd]>/gi);
      if (thMatch && thMatch.length >= 2) {
        const key = stripHtml(thMatch[0]);
        const value = stripHtml(thMatch[1]);
        if (key && value) {
          result.specs[key] = value;
        }
      }
    }
  }
  
  // Extract images - look for product images
  const imagePatterns = [
    /data-src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)/gi,
    /data-large_image=["']([^"']+)/gi,
    /<img[^>]+src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)/gi
  ];
  
  const foundImages = new Set();
  for (const pattern of imagePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let imgUrl = match[1];
      // Skip tiny images, placeholders, and icons
      if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('placeholder')) continue;
      if (imgUrl.includes('100x') || imgUrl.includes('50x') || imgUrl.includes('32x')) continue;
      // Make absolute URL
      if (imgUrl.startsWith('//')) {
        imgUrl = 'https:' + imgUrl;
      } else if (imgUrl.startsWith('/')) {
        const parsedUrl = new URL(sourceUrl);
        imgUrl = parsedUrl.origin + imgUrl;
      }
      if (imgUrl.startsWith('http')) {
        foundImages.add(imgUrl);
      }
    }
  }
  result.images = [...foundImages].slice(0, 10); // Limit to 10 images
  
  // Extract price
  const priceMatch = html.match(/["']?price["']?\s*:\s*["']?(\d+\.?\d*)/i)
    || html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>\$?(\d+\.?\d*)/i)
    || html.match(/\$(\d+\.?\d*)/);
  if (priceMatch) {
    result.price = priceMatch[1];
  }
  
  // Extract SKU
  const skuMatch = html.match(/["']?sku["']?\s*:\s*["']([^"']+)/i)
    || html.match(/<span[^>]*class="[^"]*sku[^"]*"[^>]*>([^<]+)/i)
    || html.match(/SKU:\s*([A-Z0-9-]+)/i);
  if (skuMatch) {
    result.sku = stripHtml(skuMatch[1]);
  }
  
  // Extract brand/vendor
  const brandMatch = html.match(/["']?brand["']?\s*:\s*["']([^"']+)/i)
    || html.match(/<span[^>]*class="[^"]*brand[^"]*"[^>]*>([^<]+)/i)
    || html.match(/<a[^>]*class="[^"]*brand[^"]*"[^>]*>([^<]+)/i)
    || html.match(/Brand:\s*([^<\n]+)/i);
  if (brandMatch) {
    result.brand = stripHtml(brandMatch[1]);
  }
  
  // Try JSON-LD structured data (best source)
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const jsonScript of jsonLdMatch) {
      try {
        const jsonContent = jsonScript.replace(/<script[^>]*>|<\/script>/gi, '');
        const data = JSON.parse(jsonContent);
        const product = data['@type'] === 'Product' ? data : 
          (Array.isArray(data['@graph']) ? data['@graph'].find(g => g['@type'] === 'Product') : null);
        
        if (product) {
          if (product.name) result.title = product.name;
          if (product.description) result.description = stripHtml(product.description);
          if (product.brand?.name) result.brand = product.brand.name;
          if (product.sku) result.sku = product.sku;
          if (product.gtin || product.gtin13) result.upc = product.gtin || product.gtin13;
          if (product.image) {
            const images = Array.isArray(product.image) ? product.image : [product.image];
            result.images = images.filter(img => typeof img === 'string').slice(0, 10);
          }
          if (product.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            if (offer?.price) result.price = String(offer.price);
          }
          if (product.weight?.value) result.weight = `${product.weight.value} ${product.weight.unitCode || ''}`.trim();
        }
      } catch (e) {
        // JSON parse error, continue
      }
    }
  }
  
  return result;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // API endpoints
  if (url.pathname === '/api/upload-image' && req.method === 'POST') {
    await handleUploadImage(req, res);
    return;
  }
  
  if (url.pathname === '/api/manifest' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manifest));
    return;
  }
  
  if (url.pathname === '/api/check-token' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      configured: !!SHOPIFY_ADMIN_TOKEN,
      domain: SHOPIFY_DOMAIN 
    }));
    return;
  }
  
  // Serve WooCommerce image map
  if (url.pathname === '/api/woo-images' && req.method === 'GET') {
    const wooImagePath = path.join(BASE, 'CSVs/woo_image_map.json');
    if (fs.existsSync(wooImagePath)) {
      const data = fs.readFileSync(wooImagePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'woo_image_map.json not found' }));
    }
    return;
  }
  
  // Scrape product data from URL
  if (url.pathname === '/api/scrape' && req.method === 'POST') {
    await handleScrapeUrl(req, res);
    return;
  }
  
  // WooCommerce XML product feed lookup
  if (url.pathname === '/api/woo-feed' && req.method === 'GET') {
    const searchQuery = url.searchParams.get('q') || '';
    const wooFeedPath = path.join(BASE, 'CSVs/woo_product_feed.xml');
    
    if (!fs.existsSync(wooFeedPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'woo_product_feed.xml not found. Run: curl -o CSVs/woo_product_feed.xml https://hmoonhydro.com/wp-content/uploads/woo-product-feed-pro/xml/823z61TrUI61yYGqLw9OaHuOMNNgtcaK.xml' }));
      return;
    }
    
    try {
      const xml = fs.readFileSync(wooFeedPath, 'utf-8');
      const items = [];
      
      // Parse XML items
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
      for (const match of itemMatches) {
        const itemXml = match[1];
        const item = {};
        
        // Extract fields
        const idMatch = itemXml.match(/<g:id>([^<]+)/);
        const titleMatch = itemXml.match(/<g:title>([^<]+)/);
        const descMatch = itemXml.match(/<g:description>([\s\S]*?)<\/g:description>/);
        const priceMatch = itemXml.match(/<g:price>([^<]+)/);
        const linkMatch = itemXml.match(/<g:link>([^<]+)/);
        const imageMatch = itemXml.match(/<g:image_link>([^<]+)/);
        const brandMatch = itemXml.match(/<g:brand>([^<]+)/);
        const availMatch = itemXml.match(/<g:availability>([^<]+)/);
        
        if (titleMatch) item.title = titleMatch[1];
        if (idMatch) item.id = idMatch[1];
        if (descMatch) item.description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
        if (priceMatch) item.price = priceMatch[1].replace('USD', '').trim();
        if (linkMatch) item.url = linkMatch[1];
        if (imageMatch) item.image = imageMatch[1];
        if (brandMatch) item.brand = brandMatch[1].split(',')[0].trim();
        if (availMatch) item.availability = availMatch[1];
        
        // Filter by search query if provided
        if (searchQuery) {
          const queryLower = searchQuery.toLowerCase();
          const titleLower = (item.title || '').toLowerCase();
          if (!titleLower.includes(queryLower)) continue;
        }
        
        if (item.title) items.push(item);
        if (items.length >= 50) break; // Limit results
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: items.length, products: items }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  
  // Static files
  if (url.pathname === '/' || url.pathname === '/index.html') {
    serveStaticFile(res, VARIANT_EDITOR_HTML, 'text/html');
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 VARIANT EDITOR SERVER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  📍 Open: http://localhost:${PORT}`);
  console.log(`  📂 Serving: ${VARIANT_EDITOR_HTML}`);
  console.log(`  🔑 Shopify: ${SHOPIFY_ADMIN_TOKEN ? '✓ Token configured' : '✗ Token missing!'}`);
  console.log(`  🏪 Store: ${SHOPIFY_DOMAIN}`);
  console.log('');
  console.log('  API Endpoints:');
  console.log('    POST /api/upload-image  - Upload image URL to Shopify CDN');
  console.log('    POST /api/scrape        - Scrape product data from URL');
  console.log('    GET  /api/woo-images    - Get WooCommerce image map');
  console.log('    GET  /api/woo-feed?q=   - Search WooCommerce product feed');
  console.log('    GET  /api/manifest      - Get files manifest');
  console.log('    GET  /api/check-token   - Check Shopify token status');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
});
