/**
 * Find Replacement Images
 * IMAGE-003 Phase 2: Multi-Source Image Search
 * 
 * Searches multiple sources to find better product images:
 * 1. Manufacturer websites
 * 2. Distributor catalogs (HTG Supply, Grow Generation, etc.)
 * 3. WooCommerce backup images
 * 4. Google Images API (if configured)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const STATE_FILE = './outputs/image_replacement_state.json';
const WOO_IMAGE_MAP = './hmoon-pipeline/woo_image_map.json';
const SCRAPED_IMAGES = './outputs/image_scrape_state.json';
const OUTPUT_CANDIDATES = './outputs/image_candidates.json';

// Manufacturer website patterns
const MANUFACTURER_URLS = {
  'General Hydroponics': {
    searchUrl: 'https://generalhydroponics.com/?s=',
    imageSelector: '.product-image img'
  },
  'Fox Farm': {
    searchUrl: 'https://foxfarm.com/?s=',
    imageSelector: '.product-thumbnail img'
  },
  'Advanced Nutrients': {
    searchUrl: 'https://www.advancednutrients.com/search?q=',
    imageSelector: '.product-image img'
  },
  'AC Infinity': {
    searchUrl: 'https://acinfinity.com/search?q=',
    imageSelector: '.product-image img'
  },
  'Spider Farmer': {
    searchUrl: 'https://www.spider-farmer.com/search?q=',
    imageSelector: '.product-image img'
  },
  'Mars Hydro': {
    searchUrl: 'https://www.mars-hydro.com/search?q=',
    imageSelector: '.product-image img'
  },
  'Gavita': {
    searchUrl: 'https://gavita.com/?s=',
    imageSelector: '.product-image img'
  },
  'Botanicare': {
    searchUrl: 'https://botanicare.com/?s=',
    imageSelector: '.product-image img'
  },
  'Canna': {
    searchUrl: 'https://www.cannagardening.com/search?q=',
    imageSelector: '.product-image img'
  },
  'Fluence': {
    searchUrl: 'https://fluence.science/search?q=',
    imageSelector: '.product-image img'
  }
};

// Distributor search URLs
const DISTRIBUTORS = [
  {
    name: 'HTG Supply',
    searchUrl: 'https://htgsupply.com/search?q=',
    domain: 'htgsupply.com'
  },
  {
    name: 'Grow Generation',
    searchUrl: 'https://growgeneration.com/search?q=',
    domain: 'growgeneration.com'
  },
  {
    name: 'Hydro Builder',
    searchUrl: 'https://hydrobuilder.com/search?q=',
    domain: 'hydrobuilder.com'
  },
  {
    name: 'Growers House',
    searchUrl: 'https://growershouse.com/search?q=',
    domain: 'growershouse.com'
  }
];

// Load existing data sources
function loadDataSources() {
  const sources = {
    wooImages: {},
    scrapedImages: {}
  };
  
  // Load WooCommerce image map
  if (fs.existsSync(WOO_IMAGE_MAP)) {
    try {
      sources.wooImages = JSON.parse(fs.readFileSync(WOO_IMAGE_MAP, 'utf-8'));
      console.log(`   Loaded ${Object.keys(sources.wooImages).length} WooCommerce images`);
    } catch (e) {
      console.log('   WooCommerce image map not available');
    }
  }
  
  // Load previously scraped images (from image_scraper.js)
  if (fs.existsSync(SCRAPED_IMAGES)) {
    try {
      const scraped = JSON.parse(fs.readFileSync(SCRAPED_IMAGES, 'utf-8'));
      if (scraped.products) {
        for (const [handle, data] of Object.entries(scraped.products)) {
          if (!data || typeof data !== 'object') continue;
          
          // Check for foundImages array (from image_scraper.js format)
          if (data.foundImages && Array.isArray(data.foundImages) && data.foundImages.length > 0) {
            // Convert local paths to proper URLs
            sources.scrapedImages[handle] = data.foundImages
              .filter(img => img && typeof img === 'string')
              .map(img => {
                // Handle local file paths from WooCommerce backup
                if (img.includes('hmoonhydro.com')) {
                  // Convert backslashes and make it a URL
                  const cleanPath = img.replace(/\\/g, '/');
                  return `https://${cleanPath}`;
                }
                return img;
              });
          }
          // Also check sources.local.images
          if (data.sources?.local?.images && Array.isArray(data.sources.local.images)) {
            const localImages = data.sources.local.images
              .filter(img => img && typeof img === 'string')
              .map(img => {
                const cleanPath = img.replace(/\\/g, '/');
                return cleanPath.startsWith('http') ? cleanPath : `https://${cleanPath}`;
              });
            if (localImages.length > 0) {
              sources.scrapedImages[handle] = [
                ...(sources.scrapedImages[handle] || []),
                ...localImages
              ];
            }
          }
        }
      }
      console.log(`   Loaded ${Object.keys(sources.scrapedImages).length} scraped image sets`);
    } catch (e) {
      console.log('   Scraped images error:', e.message);
    }
  }
  
  return sources;
}

// Generate search queries from product title
function generateSearchQueries(title, vendor) {
  const queries = [];
  
  // Clean title
  let cleanTitle = title
    .replace(/\s*-\s*\d+\s*(oz|ml|gal|gallon|quart|qt|pint|pt|lb|lbs|g|kg)\s*/gi, ' ')
    .replace(/\s*\d+\s*(oz|ml|gal|gallon|quart|qt|pint|pt|lb|lbs|g|kg)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Full title
  queries.push(cleanTitle);
  
  // Without vendor prefix (if present)
  if (vendor && cleanTitle.toLowerCase().startsWith(vendor.toLowerCase())) {
    queries.push(cleanTitle.substring(vendor.length).trim());
  }
  
  // First 3-4 significant words
  const words = cleanTitle.split(' ').filter(w => w.length > 2);
  if (words.length > 4) {
    queries.push(words.slice(0, 4).join(' '));
  }
  
  return [...new Set(queries)];
}

// Check if URL is likely a good product image
function isLikelyProductImage(url) {
  if (!url) return false;
  
  const badPatterns = [
    /logo/i,
    /icon/i,
    /banner/i,
    /header/i,
    /footer/i,
    /avatar/i,
    /thumb/i,
    /small/i,
    /placeholder/i,
    /loading/i,
    /spinner/i,
    /social/i,
    /facebook|twitter|instagram|pinterest/i,
    /\d{1,2}x\d{1,2}\./  // Very small dimensions like 50x50
  ];
  
  const goodPatterns = [
    /product/i,
    /\d{3,4}x\d{3,4}/,  // Large dimensions
    /large|full|original|main/i,
    /\.jpg|\.jpeg|\.png|\.webp/i
  ];
  
  const hasBad = badPatterns.some(p => p.test(url));
  const hasGood = goodPatterns.some(p => p.test(url));
  
  return !hasBad || hasGood;
}

// Score a candidate image
function scoreCandidate(candidate, product) {
  let score = 50; // Base score
  const factors = [];
  
  // Source reliability
  if (candidate.source === 'manufacturer') {
    score += 30;
    factors.push('+30 manufacturer source');
  } else if (candidate.source === 'distributor') {
    score += 20;
    factors.push('+20 distributor source');
  } else if (candidate.source === 'woocommerce') {
    score += 15;
    factors.push('+15 WooCommerce backup');
  } else if (candidate.source === 'scraped') {
    score += 25;
    factors.push('+25 previously scraped');
  }
  
  // Resolution indicators
  if (/\d{4}x\d{4}/.test(candidate.url)) {
    score += 15;
    factors.push('+15 high-res indicator');
  } else if (/\d{3}x\d{3}/.test(candidate.url)) {
    score += 5;
    factors.push('+5 medium-res indicator');
  }
  
  // File type
  if (/\.png$/i.test(candidate.url)) {
    score += 5;
    factors.push('+5 PNG format');
  } else if (/\.webp$/i.test(candidate.url)) {
    score += 3;
    factors.push('+3 WebP format');
  }
  
  // CDN/quality indicators
  if (/cdn|cloudfront|cloudinary|imgix/i.test(candidate.url)) {
    score += 5;
    factors.push('+5 CDN hosted');
  }
  
  // Negative factors
  if (/thumb|small|icon|preview/i.test(candidate.url)) {
    score -= 20;
    factors.push('-20 thumbnail indicator');
  }
  
  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    factors
  };
}

// Main search function
async function findCandidates(state, sources) {
  const candidates = {};
  let processed = 0;
  let foundCount = 0;
  
  const products = Object.entries(state.products)
    .filter(([_, data]) => data.status === 'needs-replacement')
    .sort((a, b) => a[1].current.score - b[1].current.score); // Worst first
  
  console.log(`\n🔍 Searching for images for ${products.length} products...\n`);
  
  for (const [handle, product] of products) {
    processed++;
    
    if (processed % 100 === 0) {
      console.log(`   Processed ${processed}/${products.length} (found ${foundCount} candidates)`);
    }
    
    const productCandidates = [];
    
    // 1. Check previously scraped images
    if (sources.scrapedImages[handle]) {
      for (const img of sources.scrapedImages[handle]) {
        if (isLikelyProductImage(img)) {
          productCandidates.push({
            url: img,
            source: 'scraped',
            searchQuery: null
          });
        }
      }
    }
    
    // 2. Check WooCommerce backup
    if (sources.wooImages[handle]) {
      const wooImg = sources.wooImages[handle];
      if (typeof wooImg === 'string' && isLikelyProductImage(wooImg)) {
        productCandidates.push({
          url: wooImg,
          source: 'woocommerce',
          searchQuery: null
        });
      } else if (Array.isArray(wooImg)) {
        for (const img of wooImg) {
          if (isLikelyProductImage(img)) {
            productCandidates.push({
              url: img,
              source: 'woocommerce',
              searchQuery: null
            });
          }
        }
      }
    }
    
    // 3. Generate manufacturer search URLs (for manual review)
    const vendor = product.vendor || 'Unknown';
    const queries = generateSearchQueries(product.title, vendor);
    
    if (MANUFACTURER_URLS[vendor]) {
      const mfr = MANUFACTURER_URLS[vendor];
      productCandidates.push({
        url: mfr.searchUrl + encodeURIComponent(queries[0]),
        source: 'manufacturer-search',
        searchQuery: queries[0],
        note: `Search ${vendor} website`
      });
    }
    
    // 4. Generate distributor search URLs
    for (const dist of DISTRIBUTORS.slice(0, 2)) { // Top 2 distributors
      productCandidates.push({
        url: dist.searchUrl + encodeURIComponent(queries[0]),
        source: 'distributor-search',
        searchQuery: queries[0],
        note: `Search ${dist.name}`
      });
    }
    
    // 5. Google Images search URL (for manual use)
    const googleQuery = `${product.title} ${vendor} product image`;
    productCandidates.push({
      url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(googleQuery)}`,
      source: 'google-search',
      searchQuery: googleQuery,
      note: 'Google Images search'
    });
    
    // Score and sort candidates
    const scoredCandidates = productCandidates
      .map(c => scoreCandidate(c, product))
      .sort((a, b) => b.score - a.score);
    
    if (scoredCandidates.length > 0) {
      candidates[handle] = {
        title: product.title,
        vendor: product.vendor,
        currentScore: product.current.score,
        currentUrl: product.current.url,
        candidates: scoredCandidates.slice(0, 5), // Top 5 candidates
        bestCandidate: scoredCandidates[0]
      };
      
      if (scoredCandidates.some(c => !c.source.includes('search'))) {
        foundCount++;
      }
    }
  }
  
  return candidates;
}

// Generate summary statistics
function generateStats(candidates) {
  const stats = {
    total: Object.keys(candidates).length,
    withDirectImages: 0,
    searchOnly: 0,
    bySource: {
      scraped: 0,
      woocommerce: 0,
      manufacturer: 0,
      distributor: 0
    }
  };
  
  for (const [_, data] of Object.entries(candidates)) {
    const directImages = data.candidates.filter(c => !c.source.includes('search'));
    
    if (directImages.length > 0) {
      stats.withDirectImages++;
      
      const bestDirect = directImages[0];
      if (bestDirect.source === 'scraped') stats.bySource.scraped++;
      else if (bestDirect.source === 'woocommerce') stats.bySource.woocommerce++;
      else if (bestDirect.source === 'manufacturer') stats.bySource.manufacturer++;
      else if (bestDirect.source === 'distributor') stats.bySource.distributor++;
    } else {
      stats.searchOnly++;
    }
  }
  
  return stats;
}

// Main
async function main() {
  console.log('═'.repeat(70));
  console.log('🔍 IMAGE REPLACEMENT SEARCH - Phase 2');
  console.log('═'.repeat(70));
  console.log('');
  
  // Load state
  if (!fs.existsSync(STATE_FILE)) {
    console.error('❌ State file not found. Run audit_product_images.js first.');
    process.exit(1);
  }
  
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  console.log(`📋 Loaded state: ${Object.keys(state.products).length} products\n`);
  
  // Load data sources
  console.log('📚 Loading data sources...');
  const sources = loadDataSources();
  
  // Find candidates
  const candidates = await findCandidates(state, sources);
  
  // Generate stats
  const stats = generateStats(candidates);
  
  // Save candidates
  const output = {
    generatedAt: new Date().toISOString(),
    stats,
    candidates
  };
  
  fs.writeFileSync(OUTPUT_CANDIDATES, JSON.stringify(output, null, 2));
  
  // Print summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 SEARCH RESULTS');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`   Products Needing Images:  ${stats.total}`);
  console.log(`   With Direct Image URLs:   ${stats.withDirectImages}`);
  console.log(`   Search URLs Only:         ${stats.searchOnly}`);
  console.log('');
  console.log('   Direct Images by Source:');
  console.log(`   - Previously Scraped:     ${stats.bySource.scraped}`);
  console.log(`   - WooCommerce Backup:     ${stats.bySource.woocommerce}`);
  console.log(`   - Manufacturer:           ${stats.bySource.manufacturer}`);
  console.log(`   - Distributor:            ${stats.bySource.distributor}`);
  console.log('');
  console.log(`📄 Candidates saved: ${OUTPUT_CANDIDATES}`);
  console.log('═'.repeat(70));
  
  // Show sample of best candidates
  const bestCandidates = Object.entries(candidates)
    .filter(([_, d]) => d.bestCandidate && !d.bestCandidate.source.includes('search'))
    .sort((a, b) => b[1].bestCandidate.score - a[1].bestCandidate.score)
    .slice(0, 10);
  
  if (bestCandidates.length > 0) {
    console.log('\n🌟 TOP 10 READY-TO-USE CANDIDATES:\n');
    for (const [handle, data] of bestCandidates) {
      console.log(`   ${data.title.substring(0, 40).padEnd(42)} Score: ${data.bestCandidate.score} (${data.bestCandidate.source})`);
    }
  }
}

main().catch(console.error);
