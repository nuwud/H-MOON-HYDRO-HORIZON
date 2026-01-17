/**
 * CSV Completeness Validator for Shopify Import
 * Validates that the CSV is 100% ready for upload
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = './CSVs/products_export_final_ready.csv';
const SCRAPE_STATE_PATH = './outputs/image_scrape_state.json';

// Shopify required headers
const SHOPIFY_REQUIRED_HEADERS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams', 
  'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping',
  'Variant Taxable', 'Image Src', 'SEO Title', 'SEO Description', 'Status'
];

// Parse CSV properly (handles quoted fields with commas)
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  
  for (const line of lines) {
    const row = [];
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
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

function validateCSV() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('📊 CSV COMPLETENESS VALIDATION FOR SHOPIFY IMPORT');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  // Read and parse CSV
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(csvContent);
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  console.log('\n📋 HEADER VALIDATION:');
  console.log('   Total columns:', headers.length);
  
  // Check required headers
  const missingHeaders = SHOPIFY_REQUIRED_HEADERS.filter(
    req => !headers.some(h => h.toLowerCase().includes(req.toLowerCase()))
  );
  
  if (missingHeaders.length > 0) {
    console.log('   ❌ Missing headers:', missingHeaders.join(', '));
  } else {
    console.log('   ✅ All required Shopify headers present');
  }
  
  // Get column indices
  const idx = {
    handle: headers.findIndex(h => h === 'Handle'),
    title: headers.findIndex(h => h === 'Title'),
    body: headers.findIndex(h => h === 'Body (HTML)'),
    vendor: headers.findIndex(h => h === 'Vendor'),
    category: headers.findIndex(h => h === 'Product Category'),
    type: headers.findIndex(h => h === 'Type'),
    tags: headers.findIndex(h => h === 'Tags'),
    published: headers.findIndex(h => h === 'Published'),
    sku: headers.findIndex(h => h === 'Variant SKU'),
    grams: headers.findIndex(h => h === 'Variant Grams'),
    price: headers.findIndex(h => h === 'Variant Price'),
    image: headers.findIndex(h => h === 'Image Src'),
    seoTitle: headers.findIndex(h => h === 'SEO Title'),
    seoDesc: headers.findIndex(h => h === 'SEO Description'),
    status: headers.findIndex(h => h === 'Status'),
  };
  
  // Analyze data completeness
  console.log('\n📊 DATA ANALYSIS:');
  console.log('   Total rows:', dataRows.length);
  
  // Count unique products
  const handles = new Set();
  dataRows.forEach(row => {
    if (row[idx.handle]) handles.add(row[idx.handle]);
  });
  console.log('   Unique products:', handles.size);
  
  // Check field completeness (first row per handle only)
  const seenHandles = new Set();
  let stats = {
    withTitle: 0,
    withDescription: 0,
    withVendor: 0,
    withCategory: 0,
    withType: 0,
    withTags: 0,
    withPrice: 0,
    withImage: 0,
    withSEOTitle: 0,
    withSEODesc: 0,
    withWeight: 0,
    published: 0,
    draft: 0,
  };
  
  dataRows.forEach(row => {
    const handle = row[idx.handle];
    if (!handle || seenHandles.has(handle)) return;
    seenHandles.add(handle);
    
    if (row[idx.title]) stats.withTitle++;
    if (row[idx.body] && row[idx.body].length > 10) stats.withDescription++;
    if (row[idx.vendor]) stats.withVendor++;
    if (row[idx.category]) stats.withCategory++;
    if (row[idx.type]) stats.withType++;
    if (row[idx.tags]) stats.withTags++;
    if (row[idx.price]) stats.withPrice++;
    if (row[idx.image]) stats.withImage++;
    if (row[idx.seoTitle]) stats.withSEOTitle++;
    if (row[idx.seoDesc]) stats.withSEODesc++;
    if (row[idx.grams] && parseFloat(row[idx.grams]) > 0) stats.withWeight++;
    if (row[idx.status] === 'active') stats.published++;
    if (row[idx.status] === 'draft') stats.draft++;
  });
  
  const total = handles.size;
  
  console.log('\n📈 FIELD COMPLETENESS:');
  console.log(`   Title:           ${stats.withTitle}/${total} (${(stats.withTitle/total*100).toFixed(1)}%)`);
  console.log(`   Description:     ${stats.withDescription}/${total} (${(stats.withDescription/total*100).toFixed(1)}%)`);
  console.log(`   Vendor:          ${stats.withVendor}/${total} (${(stats.withVendor/total*100).toFixed(1)}%)`);
  console.log(`   Category:        ${stats.withCategory}/${total} (${(stats.withCategory/total*100).toFixed(1)}%)`);
  console.log(`   Product Type:    ${stats.withType}/${total} (${(stats.withType/total*100).toFixed(1)}%)`);
  console.log(`   Tags:            ${stats.withTags}/${total} (${(stats.withTags/total*100).toFixed(1)}%)`);
  console.log(`   Price:           ${stats.withPrice}/${total} (${(stats.withPrice/total*100).toFixed(1)}%)`);
  console.log(`   Image:           ${stats.withImage}/${total} (${(stats.withImage/total*100).toFixed(1)}%)`);
  console.log(`   SEO Title:       ${stats.withSEOTitle}/${total} (${(stats.withSEOTitle/total*100).toFixed(1)}%)`);
  console.log(`   SEO Description: ${stats.withSEODesc}/${total} (${(stats.withSEODesc/total*100).toFixed(1)}%)`);
  console.log(`   Weight:          ${stats.withWeight}/${total} (${(stats.withWeight/total*100).toFixed(1)}%)`);
  
  console.log('\n📦 PUBLISH STATUS:');
  console.log(`   Active:          ${stats.published}/${total} (${(stats.published/total*100).toFixed(1)}%)`);
  console.log(`   Draft:           ${stats.draft}/${total} (${(stats.draft/total*100).toFixed(1)}%)`);
  
  // Check image scraping status
  console.log('\n🖼️ IMAGE SCRAPING STATUS:');
  if (fs.existsSync(SCRAPE_STATE_PATH)) {
    const scrapeState = JSON.parse(fs.readFileSync(SCRAPE_STATE_PATH, 'utf-8'));
    console.log(`   Scraped:         ${scrapeState.stats.completed}/${scrapeState.stats.totalProducts}`);
    console.log(`   Pending:         ${scrapeState.stats.pending}`);
    console.log(`   Failed:          ${scrapeState.stats.failed}`);
    
    // Count found images
    const foundImages = Object.values(scrapeState.products).filter(p => p.status === 'found').length;
    console.log(`   Images Found:    ${foundImages}/${scrapeState.stats.totalProducts} (${(foundImages/scrapeState.stats.totalProducts*100).toFixed(1)}%)`);
  } else {
    console.log('   ⚠️ No scrape state found');
  }
  
  // Overall readiness
  console.log('\n' + '═══════════════════════════════════════════════════════════════════════');
  console.log('🎯 SHOPIFY IMPORT READINESS:');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  const issues = [];
  if (missingHeaders.length > 0) issues.push('Missing required headers');
  if (stats.withTitle < total) issues.push(`${total - stats.withTitle} products missing title`);
  if (stats.withPrice < total * 0.99) issues.push(`${total - stats.withPrice} products missing price`);
  if (stats.withVendor < total * 0.95) issues.push(`Low vendor coverage (${(stats.withVendor/total*100).toFixed(0)}%)`);
  if (stats.withDescription < total * 0.90) issues.push(`Low description coverage (${(stats.withDescription/total*100).toFixed(0)}%)`);
  
  if (issues.length === 0) {
    console.log('   ✅ CSV is READY for Shopify import!');
  } else {
    console.log('   ⚠️ Issues to address:');
    issues.forEach(issue => console.log(`      - ${issue}`));
  }
  
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

validateCSV();
