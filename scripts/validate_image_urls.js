/**
 * Validate Image URLs in the import CSV
 * 
 * Checks a sample of image URLs to ensure they're accessible
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

async function checkUrl(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 8000 }, (res) => {
      resolve({ url, status: res.statusCode, ok: res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302 });
    });
    req.on('error', (e) => resolve({ url, status: 'ERROR', ok: false, error: e.code }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 'TIMEOUT', ok: false }); });
  });
}

async function main() {
  const csv = fs.readFileSync(path.join(__dirname, '../outputs/shopify_complete_import.csv'), 'utf-8').split('\n');
  const header = parseCSVLine(csv[0]);
  const handleIdx = header.indexOf('Handle');
  const imgIdx = header.indexOf('Image Src');
  
  // Collect unique image URLs
  const imageUrls = new Map();
  const seen = new Set();
  
  csv.slice(1).filter(Boolean).forEach(line => {
    const cols = parseCSVLine(line);
    const handle = cols[handleIdx];
    const img = cols[imgIdx];
    if (!seen.has(handle) && img && img.startsWith('http')) {
      imageUrls.set(handle, img);
      seen.add(handle);
    }
  });
  
  console.log(`Total products with images: ${imageUrls.size}`);
  
  // Group by domain
  const byDomain = {};
  for (const [handle, url] of imageUrls) {
    try {
      const domain = new URL(url).hostname;
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push({ handle, url });
    } catch (e) {
      console.log(`Invalid URL: ${url}`);
    }
  }
  
  console.log('\n=== Image URLs by Domain ===');
  Object.entries(byDomain)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([domain, urls]) => {
      console.log(`${domain}: ${urls.length} images`);
    });
  
  // Sample test from each domain (max 5 per domain)
  console.log('\n=== Sampling URLs from each domain ===\n');
  
  let totalTested = 0;
  let totalWorking = 0;
  const failedUrls = [];
  
  for (const [domain, urls] of Object.entries(byDomain)) {
    const sample = urls.slice(0, 5);
    let working = 0;
    
    for (const { handle, url } of sample) {
      const result = await checkUrl(url);
      totalTested++;
      if (result.ok) {
        working++;
        totalWorking++;
      } else {
        failedUrls.push({ handle, url, status: result.status, error: result.error });
      }
    }
    
    const icon = working === sample.length ? '✅' : working > 0 ? '⚠️' : '❌';
    console.log(`${icon} ${domain}: ${working}/${sample.length} working`);
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Tested: ${totalTested} URLs`);
  console.log(`Working: ${totalWorking} (${(totalWorking/totalTested*100).toFixed(1)}%)`);
  console.log(`Failed: ${failedUrls.length}`);
  
  if (failedUrls.length > 0) {
    console.log('\n=== Failed URLs ===');
    failedUrls.slice(0, 10).forEach(f => {
      console.log(`  ${f.handle}: ${f.status} ${f.error || ''}`);
      console.log(`    ${f.url.slice(0, 80)}...`);
    });
  }
}

main();
