/**
 * Prepare WooCommerce Product Update CSV
 * 
 * SAFE APPROACH:
 * - Matches enriched Shopify data to existing WooCommerce products
 * - Creates an UPDATE-ONLY CSV (not insert)
 * - Only modifies: Description, Short Description, Categories, Tags, Images
 * - PRESERVES: Prices, SKUs, Inventory, IDs
 * 
 * Usage:
 *   node scripts/prepare_woo_update.js --dry-run          # Preview only (default)
 *   node scripts/prepare_woo_update.js --confirm          # Generate update CSV
 *   node scripts/prepare_woo_update.js --field=description # Only update descriptions
 */

const fs = require('fs');
const path = require('path');

// Parse CSV with proper quote handling
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '"' && (i === 0 || content[i-1] !== '\\')) {
      inQuotes = !inQuotes;
    }
    
    if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

// Normalize product handles/slugs for matching
function normalizeHandle(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Generate slug variations for fuzzy matching
function getSlugVariations(slug) {
  const variations = [slug];
  
  // Add/remove trailing 's' for pluralization
  if (slug.endsWith('s')) {
    variations.push(slug.slice(0, -1));
  } else {
    variations.push(slug + 's');
  }
  
  // Handle common variations
  if (slug.includes('-in-')) {
    variations.push(slug.replace(/-in-/g, '-inch-'));
  }
  if (slug.includes('-inch-')) {
    variations.push(slug.replace(/-inch-/g, '-in-'));
  }
  
  // Remove size suffixes for base product matching
  const sizePattern = /-(\d+)-(in|inch|lt|liter|ml|gal|gallon|oz|lb|lbs|ft|foot)(-|$)/;
  if (sizePattern.test(slug)) {
    variations.push(slug.replace(sizePattern, '$3'));
  }
  
  return variations;
}

// Convert Shopify tags to WooCommerce category format
function convertTagsToCategories(tags, type) {
  if (!tags && !type) return '';
  
  const categories = [];
  
  // Add Type as primary category (convert underscore format)
  if (type) {
    const typeName = type.replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    categories.push(typeName);
  }
  
  // Extract additional categories from tags (skip catalog_index, brands, and type duplicates)
  if (tags) {
    const parts = tags.split(/[,;]/).map(t => t.trim());
    
    for (const part of parts) {
      // Skip brands, catalog_index, and empty
      if (!part || part.startsWith('brand:') || part === 'catalog_index') continue;
      
      // Convert to proper case
      const cat = part.replace(/_/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim();
      
      // Skip if it's the same as type (already added)
      const typeNorm = (type || '').replace(/_/g, ' ').toLowerCase();
      if (cat.toLowerCase() === typeNorm) continue;
      
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    }
  }
  
  // Return WooCommerce category hierarchy format
  return categories.join(' > ');
}

// Extract brand from tags
function extractBrand(tags) {
  if (!tags) return '';
  const match = tags.match(/brand:([^,]+)/);
  return match ? match[1].trim() : '';
}

// Main update preparation
async function prepareWooUpdate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  const fieldFilter = args.find(a => a.startsWith('--field='))?.split('=')[1];
  
  console.log('='.repeat(60));
  console.log('🔧 WooCommerce Product Update Preparation');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN (preview only)' : '⚡ GENERATE UPDATE CSV'}`);
  if (fieldFilter) console.log(`Field filter: ${fieldFilter}`);
  console.log('');
  
  // Load enriched Shopify data
  const shopifyPath = path.join(__dirname, '..', 'outputs', 'shopify_complete_import.csv');
  if (!fs.existsSync(shopifyPath)) {
    console.error('❌ Cannot find outputs/shopify_complete_import.csv');
    process.exit(1);
  }
  
  const shopifyContent = fs.readFileSync(shopifyPath, 'utf-8');
  const shopify = parseCSV(shopifyContent);
  console.log(`📊 Loaded ${shopify.rows.length} rows from enriched Shopify data`);
  
  // Load current WooCommerce data
  const wooPath = path.join(__dirname, '..', 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  if (!fs.existsSync(wooPath)) {
    console.error('❌ Cannot find WooCommerce export');
    process.exit(1);
  }
  
  const wooContent = fs.readFileSync(wooPath, 'utf-8');
  const woo = parseCSV(wooContent);
  console.log(`📊 Loaded ${woo.rows.length} rows from WooCommerce export`);
  console.log('');
  
  // Build WooCommerce lookup by slug and SKU
  const wooBySlug = {};
  const wooBySKU = {};
  
  for (const row of woo.rows) {
    const slug = normalizeHandle(row['Slug'] || '');
    const sku = (row['SKU'] || '').trim();
    
    if (slug) wooBySlug[slug] = row;
    if (sku) wooBySKU[sku.toLowerCase()] = row;
  }
  
  console.log(`📇 Built lookup: ${Object.keys(wooBySlug).length} by slug, ${Object.keys(wooBySKU).length} by SKU`);
  console.log('');
  
  // Build enriched data lookup (only parent rows, not variants)
  const enrichedProducts = {};
  
  for (const row of shopify.rows) {
    // Skip variant rows (they have empty Title)
    if (!row['Title'] || !row['Title'].trim()) continue;
    
    const handle = normalizeHandle(row['Handle'] || '');
    const sku = (row['Variant SKU'] || '').trim().toLowerCase();
    
    enrichedProducts[handle] = {
      handle,
      title: row['Title'],
      description: row['Body (HTML)'] || '',
      type: row['Type'] || '',
      tags: row['Tags'] || '',
      vendor: row['Vendor'] || '',
      image: row['Image Src'] || '',
      seoTitle: row['SEO Title'] || '',
      seoDesc: row['SEO Description'] || '',
      sku
    };
  }
  
  console.log(`📦 Unique enriched products: ${Object.keys(enrichedProducts).length}`);
  console.log('');
  
  // Match and prepare updates
  const updates = [];
  const noMatch = [];
  const stats = {
    matched: 0,
    descriptionUpdates: 0,
    categoryUpdates: 0,
    imageUpdates: 0,
    brandUpdates: 0
  };
  
  for (const [handle, enriched] of Object.entries(enrichedProducts)) {
    // Try to match to WooCommerce product
    let wooProduct = wooBySlug[handle];
    
    // Try slug variations if direct match failed
    if (!wooProduct) {
      for (const variation of getSlugVariations(handle)) {
        wooProduct = wooBySlug[variation];
        if (wooProduct) break;
      }
    }
    
    // Try SKU match if slug failed
    if (!wooProduct && enriched.sku) {
      wooProduct = wooBySKU[enriched.sku];
    }
    
    // Try title-based fuzzy match as last resort
    if (!wooProduct) {
      const normalizedTitle = normalizeHandle(enriched.title);
      wooProduct = wooBySlug[normalizedTitle];
    }
    
    if (!wooProduct) {
      noMatch.push({ handle, title: enriched.title });
      continue;
    }
    
    stats.matched++;
    
    const update = {
      id: wooProduct['ID'],
      slug: wooProduct['Slug'],
      currentTitle: wooProduct['Product Name'],
      changes: {}
    };
    
    // Check what can be improved
    const currentDesc = (wooProduct['Product description'] || '').trim();
    const enrichedDesc = enriched.description.trim();
    
    // Description update (if enriched has content and current is empty/short)
    if (enrichedDesc && (!currentDesc || currentDesc.length < enrichedDesc.length)) {
      if (!fieldFilter || fieldFilter === 'description') {
        update.changes.description = enrichedDesc;
        stats.descriptionUpdates++;
      }
    }
    
    // Category update
    const currentCats = (wooProduct['Product categories'] || '').trim();
    const enrichedCats = convertTagsToCategories(enriched.tags, enriched.type);
    if (enrichedCats && enrichedCats !== currentCats) {
      if (!fieldFilter || fieldFilter === 'categories') {
        update.changes.categories = enrichedCats;
        stats.categoryUpdates++;
      }
    }
    
    // Brand update
    const currentBrand = (wooProduct['Brands'] || '').trim();
    const enrichedBrand = extractBrand(enriched.tags) || enriched.vendor;
    if (enrichedBrand && enrichedBrand !== currentBrand && enrichedBrand !== 'H Moon Hydro') {
      if (!fieldFilter || fieldFilter === 'brand') {
        update.changes.brand = enrichedBrand;
        stats.brandUpdates++;
      }
    }
    
    // Image update (if WooCommerce product is missing image)
    const currentImage = (wooProduct['External product URL'] || wooProduct['Images'] || '').trim();
    if (!currentImage && enriched.image && enriched.image.startsWith('http')) {
      if (!fieldFilter || fieldFilter === 'images') {
        update.changes.image = enriched.image;
        stats.imageUpdates++;
      }
    }
    
    if (Object.keys(update.changes).length > 0) {
      updates.push(update);
    }
  }
  
  // Report
  console.log('='.repeat(60));
  console.log('📊 MATCH RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Matched: ${stats.matched} products`);
  console.log(`❓ No match: ${noMatch.length} products`);
  console.log('');
  console.log('📝 UPDATES NEEDED:');
  console.log(`   Descriptions: ${stats.descriptionUpdates}`);
  console.log(`   Categories: ${stats.categoryUpdates}`);
  console.log(`   Brands: ${stats.brandUpdates}`);
  console.log(`   Images: ${stats.imageUpdates}`);
  console.log(`   Total products to update: ${updates.length}`);
  console.log('');
  
  if (dryRun) {
    // Show sample updates
    console.log('='.repeat(60));
    console.log('📋 SAMPLE UPDATES (first 5)');
    console.log('='.repeat(60));
    
    for (const update of updates.slice(0, 5)) {
      console.log(`\n🔹 ${update.currentTitle} (ID: ${update.id})`);
      for (const [field, value] of Object.entries(update.changes)) {
        const preview = value.length > 100 ? value.substring(0, 100) + '...' : value;
        console.log(`   ${field}: ${preview}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('💡 Run with --confirm to generate the update CSV');
    console.log('='.repeat(60));
    
    // Save no-match report
    const noMatchPath = path.join(__dirname, '..', 'outputs', 'woo_update_no_match.json');
    fs.writeFileSync(noMatchPath, JSON.stringify(noMatch, null, 2));
    console.log(`\n📄 No-match products saved to: outputs/woo_update_no_match.json`);
    
  } else {
    // Generate WooCommerce import CSV
    const outputPath = path.join(__dirname, '..', 'outputs', 'woo_product_updates.csv');
    
    // WooCommerce Product Import format (ID-based updates)
    const headers = ['ID', 'Product Name', 'Product description', 'Product short description', 'Product categories', 'Brands', 'Images'];
    
    let csv = headers.join(',') + '\n';
    
    for (const update of updates) {
      const row = [
        update.id,
        '', // Don't change name
        update.changes.description ? `"${update.changes.description.replace(/"/g, '""')}"` : '',
        '', // Short description
        update.changes.categories ? `"${update.changes.categories}"` : '',
        update.changes.brand ? `"${update.changes.brand}"` : '',
        update.changes.image || ''
      ];
      csv += row.join(',') + '\n';
    }
    
    fs.writeFileSync(outputPath, csv);
    console.log('='.repeat(60));
    console.log(`✅ Update CSV generated: outputs/woo_product_updates.csv`);
    console.log(`   Contains ${updates.length} product updates`);
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log('   1. Review the CSV file');
    console.log('   2. Create a backup of your WooCommerce database');
    console.log('   3. Import via WooCommerce > Products > Import');
    console.log('   4. Select "Update existing products" option');
    console.log('='.repeat(60));
  }
}

prepareWooUpdate().catch(console.error);
