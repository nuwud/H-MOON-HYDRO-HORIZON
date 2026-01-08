#!/usr/bin/env node
/**
 * download_external_for_upload.js
 * 
 * Downloads external images and prepares them for upload via the existing
 * TypeScript upload pipeline (uploadGapFilesToShopify.ts)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const INPUT_CSV = path.join(BASE, 'outputs/shopify_100percent_images.csv');
const DOWNLOAD_DIR = path.join(BASE, 'outputs/downloaded_images');
const UPLOAD_QUEUE = path.join(BASE, 'outputs/files_to_upload.json');
const URL_MAPPING = path.join(BASE, 'outputs/external_url_mapping.json');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
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

// Download image from URL
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    };
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      const proto = requestUrl.startsWith('https') ? https : http;
      proto.get(requestUrl, options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let newUrl = response.headers.location;
          if (!newUrl.startsWith('http')) {
            const urlObj = new URL(requestUrl);
            newUrl = `${urlObj.protocol}//${urlObj.host}${newUrl}`;
          }
          makeRequest(newUrl, redirectCount + 1);
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
      }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    };
    
    makeRequest(url);
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     DOWNLOAD EXTERNAL IMAGES FOR SHOPIFY UPLOAD');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Read CSV
  console.log('📄 Reading CSV...');
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
  
  console.log(`   Found ${externalUrls.size} unique external URLs\n`);
  
  if (externalUrls.size === 0) {
    console.log('✅ All images already on Shopify CDN!');
    return;
  }
  
  // Load existing upload queue
  let uploadQueue = [];
  if (fs.existsSync(UPLOAD_QUEUE)) {
    uploadQueue = JSON.parse(fs.readFileSync(UPLOAD_QUEUE, 'utf-8'));
  }
  const existingFilenames = new Set(uploadQueue.map(f => f.filename));
  
  // URL to filename mapping (for later CSV update)
  const urlMapping = {};
  
  // Download each external URL
  console.log('🔄 Downloading external images...\n');
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const url of externalUrls) {
    // Extract filename from URL
    let filename = url.split('/').pop().split('?')[0];
    // Clean up filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }
    
    const localPath = path.join(DOWNLOAD_DIR, filename);
    
    // Skip if already downloaded and in queue
    if (fs.existsSync(localPath) && existingFilenames.has(filename)) {
      urlMapping[url] = { filename, localPath, status: 'already_queued' };
      skipped++;
      continue;
    }
    
    process.stdout.write(`   ${filename.substring(0, 50)}... `);
    
    try {
      const buffer = await downloadImage(url);
      fs.writeFileSync(localPath, buffer);
      
      // Calculate SHA1
      const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
      
      // Add to upload queue if not already there
      if (!existingFilenames.has(filename)) {
        uploadQueue.push({
          localPath,
          filename,
          sha1,
          sourceUrl: url
        });
        existingFilenames.add(filename);
      }
      
      urlMapping[url] = { filename, localPath, sha1, status: 'downloaded' };
      console.log('✅');
      downloaded++;
      
    } catch (err) {
      console.log(`❌ ${err.message}`);
      urlMapping[url] = { filename, status: 'failed', error: err.message };
      failed++;
    }
  }
  
  // Save updated upload queue
  fs.writeFileSync(UPLOAD_QUEUE, JSON.stringify(uploadQueue, null, 2));
  
  // Save URL mapping for later CSV update
  fs.writeFileSync(URL_MAPPING, JSON.stringify(urlMapping, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Skipped (already queued): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n   Upload queue: ${UPLOAD_QUEUE} (${uploadQueue.length} files)`);
  console.log(`   URL mapping: ${URL_MAPPING}`);
  console.log('\n📌 NEXT STEP: Run the TypeScript upload script:');
  console.log('   cd hmoon-pipeline && npx tsx src/cli/uploadGapFilesToShopify.ts --confirm');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
