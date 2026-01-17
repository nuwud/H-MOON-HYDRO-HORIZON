/**
 * Audit Product Images
 * IMAGE-003: Complete Product Image Replacement
 * 
 * Analyzes all current product images and scores them for quality.
 * Identifies images that need replacement.
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

// Configuration
const INPUT_CSV = './CSVs/products_export_with_alt.csv';
const OUTPUT_STATE = './outputs/image_replacement_state.json';
const OUTPUT_REPORT = './outputs/image_audit_report.json';

// Quality thresholds
const QUALITY_THRESHOLDS = {
  EXCELLENT: 85,
  GOOD: 70,
  FAIR: 50,
  POOR: 30,
  REJECT: 0
};

// Parse CSV
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function parseRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// Fetch image headers to get dimensions
function fetchImageInfo(url) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) {
      resolve({ error: 'invalid-url', resolution: null, size: null });
      return;
    }
    
    const client = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ error: 'timeout', resolution: null, size: null });
    }, 10000);
    
    const req = client.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      clearTimeout(timeout);
      
      if (res.statusCode !== 200) {
        resolve({ error: `http-${res.statusCode}`, resolution: null, size: null });
        res.resume();
        return;
      }
      
      const contentLength = parseInt(res.headers['content-length'] || '0');
      const contentType = res.headers['content-type'] || '';
      
      // For Shopify CDN images, we can parse dimensions from URL
      // Format: ...files/image.jpg?v=123&width=1200
      const widthMatch = url.match(/[?&]width=(\d+)/);
      const heightMatch = url.match(/[?&]height=(\d+)/);
      
      // Or from filename patterns like image-1200x800.jpg
      const dimMatch = url.match(/[-_](\d{3,4})x(\d{3,4})/);
      
      let resolution = null;
      if (widthMatch && heightMatch) {
        resolution = `${widthMatch[1]}x${heightMatch[1]}`;
      } else if (dimMatch) {
        resolution = `${dimMatch[1]}x${dimMatch[2]}`;
      }
      
      res.resume();
      resolve({
        error: null,
        resolution,
        size: contentLength,
        contentType
      });
    });
    
    req.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ error: err.message, resolution: null, size: null });
    });
  });
}

// Score an image based on URL analysis
function scoreImage(imageUrl, imageInfo) {
  let score = 0;
  const issues = [];
  
  if (!imageUrl) {
    return { score: 0, issues: ['no-image'] };
  }
  
  // Resolution scoring (0-25 pts)
  if (imageInfo.resolution) {
    const [w, h] = imageInfo.resolution.split('x').map(Number);
    const maxDim = Math.max(w, h);
    if (maxDim >= 1200) {
      score += 25;
    } else if (maxDim >= 800) {
      score += 15;
    } else if (maxDim >= 400) {
      score += 5;
      issues.push('low-resolution');
    } else {
      issues.push('very-low-resolution');
    }
  } else {
    // Can't determine resolution, assume medium
    score += 10;
    issues.push('unknown-resolution');
  }
  
  // Check for placeholder/stock indicators in URL (0-20 pts)
  const placeholderPatterns = [
    /placeholder/i,
    /no-image/i,
    /default/i,
    /coming-soon/i,
    /stock-photo/i,
    /temp/i
  ];
  
  if (placeholderPatterns.some(p => p.test(imageUrl))) {
    issues.push('placeholder-image');
  } else {
    score += 20;
  }
  
  // Check for Shopify CDN (likely our own upload) (0-15 pts)
  if (imageUrl.includes('cdn.shopify.com')) {
    score += 15; // Our CDN, likely okay
  } else if (imageUrl.includes('hmoonhydro.com')) {
    score += 10; // WooCommerce backup
  } else {
    score += 5;
    issues.push('external-source');
  }
  
  // Check for common image quality indicators (0-20 pts)
  const qualityIndicators = [
    { pattern: /scaled|large|full|original/i, points: 10 },
    { pattern: /thumb|small|icon|preview/i, points: -10 },
    { pattern: /webp|png/i, points: 5 },
    { pattern: /\d{4}x\d{4}/, points: 10 }
  ];
  
  let qualityPoints = 10; // base
  for (const ind of qualityIndicators) {
    if (ind.pattern.test(imageUrl)) {
      qualityPoints += ind.points;
    }
  }
  score += Math.max(0, Math.min(20, qualityPoints));
  
  // Size check (0-20 pts) - larger files often mean better quality
  if (imageInfo.size) {
    if (imageInfo.size > 500000) {
      score += 20; // > 500KB
    } else if (imageInfo.size > 100000) {
      score += 15; // > 100KB
    } else if (imageInfo.size > 50000) {
      score += 10; // > 50KB
    } else {
      score += 5;
      issues.push('small-file-size');
    }
  } else {
    score += 10;
  }
  
  return { score: Math.min(100, score), issues };
}

// Determine replacement priority
function getPriority(score) {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return 'keep';
  if (score >= QUALITY_THRESHOLDS.GOOD) return 'low';
  if (score >= QUALITY_THRESHOLDS.FAIR) return 'medium';
  if (score >= QUALITY_THRESHOLDS.POOR) return 'high';
  return 'urgent';
}

// Main
async function main() {
  console.log('═'.repeat(70));
  console.log('🔍 PRODUCT IMAGE AUDIT - IMAGE-003');
  console.log('═'.repeat(70));
  console.log('');
  
  // Parse CSV
  const content = fs.readFileSync(INPUT_CSV, 'utf-8');
  const { headers, rows } = parseCSV(content);
  
  const handleIdx = headers.indexOf('Handle');
  const titleIdx = headers.indexOf('Title');
  const vendorIdx = headers.indexOf('Vendor');
  const imageSrcIdx = headers.indexOf('Image Src');
  const imagePosIdx = headers.indexOf('Image Position');
  
  // Group products by handle (collect all images per product)
  const products = new Map();
  
  for (const row of rows) {
    const handle = row[handleIdx];
    const title = row[titleIdx];
    const vendor = row[vendorIdx];
    const imageSrc = row[imageSrcIdx];
    const imagePos = row[imagePosIdx] || '1';
    
    if (!handle) continue;
    
    if (!products.has(handle)) {
      products.set(handle, {
        handle,
        title: title || '',
        vendor: vendor || '',
        images: []
      });
    }
    
    // Only update title/vendor if this row has them
    if (title) products.get(handle).title = title;
    if (vendor) products.get(handle).vendor = vendor;
    
    // Add image if present
    if (imageSrc && imageSrc.startsWith('http')) {
      products.get(handle).images.push({
        url: imageSrc,
        position: parseInt(imagePos) || 1
      });
    }
  }
  
  console.log(`📊 Found ${products.size} unique products\n`);
  
  // Initialize state
  const state = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    config: {
      minQualityScore: 70,
      preferredResolution: 1200,
      preferSquare: true
    },
    stats: {
      totalProducts: products.size,
      audited: 0,
      noImage: 0,
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      urgent: 0
    },
    products: {}
  };
  
  // Process each product
  let processed = 0;
  const batchSize = 50;
  
  for (const [handle, product] of products) {
    processed++;
    
    if (processed % 100 === 0) {
      console.log(`   Processing ${processed}/${products.size}...`);
    }
    
    const primaryImage = product.images.find(img => img.position === 1) || product.images[0];
    
    let current = null;
    
    if (!primaryImage) {
      state.stats.noImage++;
      current = {
        url: null,
        score: 0,
        resolution: null,
        issues: ['no-image']
      };
    } else {
      // Skip fetching for now - just analyze URL
      const imageInfo = { resolution: null, size: null };
      const { score, issues } = scoreImage(primaryImage.url, imageInfo);
      
      current = {
        url: primaryImage.url,
        score,
        resolution: imageInfo.resolution,
        issues
      };
      
      // Count by priority
      const priority = getPriority(score);
      if (priority === 'keep') state.stats.excellent++;
      else if (priority === 'low') state.stats.good++;
      else if (priority === 'medium') state.stats.fair++;
      else if (priority === 'high') state.stats.poor++;
      else state.stats.urgent++;
    }
    
    state.products[handle] = {
      title: product.title,
      vendor: product.vendor,
      imageCount: product.images.length,
      current,
      candidates: [],
      selected: null,
      status: current.score >= QUALITY_THRESHOLDS.GOOD ? 'acceptable' : 'needs-replacement'
    };
    
    state.stats.audited++;
  }
  
  state.lastUpdated = new Date().toISOString();
  
  // Save state
  fs.mkdirSync(path.dirname(OUTPUT_STATE), { recursive: true });
  fs.writeFileSync(OUTPUT_STATE, JSON.stringify(state, null, 2));
  
  // Generate summary report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalProducts: state.stats.totalProducts,
      withImages: state.stats.totalProducts - state.stats.noImage,
      noImage: state.stats.noImage,
      byQuality: {
        excellent: state.stats.excellent,
        good: state.stats.good,
        fair: state.stats.fair,
        poor: state.stats.poor,
        urgent: state.stats.urgent
      },
      needsReplacement: state.stats.fair + state.stats.poor + state.stats.urgent + state.stats.noImage
    },
    byVendor: {},
    urgentProducts: []
  };
  
  // Group by vendor
  for (const [handle, data] of Object.entries(state.products)) {
    const vendor = data.vendor || 'Unknown';
    if (!report.byVendor[vendor]) {
      report.byVendor[vendor] = { total: 0, needsReplacement: 0 };
    }
    report.byVendor[vendor].total++;
    if (data.status === 'needs-replacement') {
      report.byVendor[vendor].needsReplacement++;
    }
    
    // Collect urgent products
    if (data.current.score < QUALITY_THRESHOLDS.POOR) {
      report.urgentProducts.push({
        handle,
        title: data.title,
        vendor: data.vendor,
        score: data.current.score,
        issues: data.current.issues
      });
    }
  }
  
  // Sort urgent by score (lowest first)
  report.urgentProducts.sort((a, b) => a.score - b.score);
  report.urgentProducts = report.urgentProducts.slice(0, 50); // Top 50 most urgent
  
  fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 AUDIT RESULTS');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`   Total Products:     ${state.stats.totalProducts}`);
  console.log(`   With Images:        ${state.stats.totalProducts - state.stats.noImage}`);
  console.log(`   No Image:           ${state.stats.noImage}`);
  console.log('');
  console.log('   Quality Distribution:');
  console.log(`   ✅ Excellent (85+):  ${state.stats.excellent}`);
  console.log(`   ✅ Good (70-84):     ${state.stats.good}`);
  console.log(`   ⚠️  Fair (50-69):    ${state.stats.fair}`);
  console.log(`   ❌ Poor (30-49):     ${state.stats.poor}`);
  console.log(`   🚨 Urgent (<30):     ${state.stats.urgent}`);
  console.log('');
  console.log(`   📋 Needs Replacement: ${report.summary.needsReplacement}`);
  console.log('');
  console.log(`📄 State saved: ${OUTPUT_STATE}`);
  console.log(`📄 Report saved: ${OUTPUT_REPORT}`);
  console.log('═'.repeat(70));
}

main().catch(console.error);
