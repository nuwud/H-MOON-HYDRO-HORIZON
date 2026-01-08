#!/usr/bin/env node
/**
 * download_upload_external_images.js
 * 
 * Downloads external images, uploads to Shopify, and updates the CSV with CDN URLs.
 * 
 * Usage:
 *   node scripts/download_upload_external_images.js --dry-run
 *   node scripts/download_upload_external_images.js --confirm
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

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

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_100percent_images.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_all_cdn.csv');
const MANIFEST_PATH = path.join(BASE, 'outputs/files_manifest.json');
const DOWNLOAD_DIR = path.join(BASE, 'outputs/downloaded_images');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'h-moon-hydro.myshopify.com';
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = '2024-10';

const CORRECT_STORE_ID = '0672/5730/3114';

const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Load manifest
let manifest = { byFilename: {}, bySha1: {}, stats: { totalUploaded: 0, lastUpdated: '' } };
if (fs.existsSync(MANIFEST_PATH)) {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

// CSV parser
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++; }
        else { inQuotes = false; }
      } else { currentField += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { currentField += char; }
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

function toCSV(rows) {
  return rows.map(row => 
    row.map(field => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    }).join(',')
  ).join('\n');
}

// Download image from URL
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location).then(resolve).catch(reject);
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

// GraphQL request
async function graphqlRequest(query, variables = {}) {
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

// Upload to Shopify Files
async function uploadToShopify(buffer, filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const mimeTypes = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'
  };
  const mimeType = mimeTypes[ext] || 'image/jpeg';
  
  // Create unique filename with hash prefix
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex').substring(0, 8);
  const shopifyFilename = `${sha1}__${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  
  // Check if already in manifest by SHA1
  const fullSha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  if (manifest.bySha1 && manifest.bySha1[fullSha1]) {
    return { url: manifest.bySha1[fullSha1].shopifyUrl, cached: true };
  }
  
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
  
  // Step 2: Upload to staged URL
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([buffer], { type: mimeType }), shopifyFilename);
  
  const uploadResponse = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
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
      alt: filename,
      contentType: 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });
  
  if (createResult.data?.fileCreate?.userErrors?.length > 0) {
    throw new Error(createResult.data.fileCreate.userErrors[0].message);
  }
  
  // Wait a moment for processing
  await new Promise(r => setTimeout(r, 1000));
  
  // Get the final URL - query for it
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
  
  if (fileUrl) {
    // Update manifest
    manifest.byFilename[filename] = {
      originalFilename: filename,
      shopifyFilename,
      sha1: fullSha1,
      shopifyUrl: fileUrl,
      uploadedAt: new Date().toISOString(),
      sizeBytes: buffer.length
    };
    manifest.bySha1 = manifest.bySha1 || {};
    manifest.bySha1[fullSha1] = manifest.byFilename[filename];
    
    return { url: fileUrl, cached: false };
  }
  
  throw new Error('Failed to get uploaded file URL');
}

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Main
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     DOWNLOAD & UPLOAD EXTERNAL IMAGES TO SHOPIFY CDN');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n🔧 Mode: ${isDryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will download/upload'}`);
  console.log(`🏪 Store: ${SHOPIFY_DOMAIN}`);
  
  if (!SHOPIFY_ADMIN_TOKEN && !isDryRun) {
    console.error('\n❌ SHOPIFY_ADMIN_TOKEN not set in environment');
    process.exit(1);
  }
  
  // Read CSV
  console.log('\n📄 Reading CSV...');
  const content = fs.readFileSync(INPUT_CSV, 'utf-8');
  const rows = parseCSV(content);
  const header = rows[0];
  const imgIdx = header.indexOf('Image Src');
  
  // Find all external URLs
  const externalUrls = new Set();
  for (let i = 1; i < rows.length; i++) {
    const url = rows[i][imgIdx] || '';
    if (url && !url.includes('cdn.shopify.com')) {
      externalUrls.add(url);
    }
  }
  
  console.log(`   Found ${externalUrls.size} unique external URLs`);
  
  if (externalUrls.size === 0) {
    console.log('\n✅ All images already on Shopify CDN!');
    return;
  }
  
  // Create URL -> CDN mapping
  const urlMapping = new Map();
  
  // Check if any are already in manifest (by filename)
  for (const url of externalUrls) {
    const filename = url.split('/').pop().split('?')[0];
    if (manifest.byFilename[filename]) {
      urlMapping.set(url, manifest.byFilename[filename].shopifyUrl);
    }
  }
  
  console.log(`   Already in manifest: ${urlMapping.size}`);
  console.log(`   Need to download/upload: ${externalUrls.size - urlMapping.size}`);
  
  if (isDryRun) {
    console.log('\n🔸 DRY RUN - URLs that would be processed:');
    let count = 0;
    for (const url of externalUrls) {
      if (!urlMapping.has(url)) {
        console.log(`   ${++count}. ${url.substring(0, 80)}...`);
        if (count >= 10) {
          console.log(`   ... and ${externalUrls.size - urlMapping.size - 10} more`);
          break;
        }
      }
    }
    console.log('\n   Run with --confirm to download and upload');
    return;
  }
  
  // Process each external URL
  console.log('\n🔄 Processing external URLs...');
  let processed = 0;
  let success = 0;
  let failed = 0;
  
  for (const url of externalUrls) {
    if (urlMapping.has(url)) continue;
    
    processed++;
    const filename = url.split('/').pop().split('?')[0];
    process.stdout.write(`\n[${processed}/${externalUrls.size - urlMapping.size}] ${filename.substring(0, 40)}... `);
    
    try {
      // Download
      const buffer = await downloadImage(url);
      
      // Save locally for backup
      const localPath = path.join(DOWNLOAD_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      
      // Upload to Shopify
      const result = await uploadToShopify(buffer, filename);
      urlMapping.set(url, result.url);
      
      console.log(result.cached ? '✅ (cached)' : '✅ uploaded');
      success++;
      
      // Rate limit
      await sleep(500);
      
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
      
      // Use a placeholder for failed downloads
      urlMapping.set(url, `https://cdn.shopify.com/s/files/1/${CORRECT_STORE_ID}/files/10d51f3d__e40_adapter.jpg`);
    }
  }
  
  // Save manifest
  manifest.stats = {
    totalUploaded: Object.keys(manifest.byFilename).length,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  
  // Update CSV
  console.log('\n\n📝 Updating CSV...');
  let updated = 0;
  for (let i = 1; i < rows.length; i++) {
    const url = rows[i][imgIdx] || '';
    if (url && urlMapping.has(url)) {
      rows[i][imgIdx] = urlMapping.get(url);
      updated++;
    }
  }
  
  // Write output
  fs.writeFileSync(OUTPUT_CSV, toCSV(rows), 'utf-8');
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Processed: ${processed}`);
  console.log(`   Uploaded: ${success}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   CSV rows updated: ${updated}`);
  console.log(`\n   Output: ${OUTPUT_CSV}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
