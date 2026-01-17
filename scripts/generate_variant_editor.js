/**
 * Generate Variant Grouping Editor - EDIT-002
 * 
 * Creates a browser-based editor with:
 * - Drag & drop variant grouping
 * - Multi-image management
 * - Auto-suggest groupings based on title patterns
 * - Individual save / batch operations
 * - Export properly consolidated CSV
 */

const fs = require('fs');
const path = require('path');

// Configuration - Use the CSV with most images
const CSV_FILE = './CSVs/products_export_1 (5).csv';  // 2169 images - best coverage
const WOO_CSV = './CSVs/Products-Export-2025-Oct-29-171532.csv';
const OUTPUT_HTML = './outputs/variant_editor.html';
const CANDIDATES_FILE = './outputs/image_candidates.json';
const FILES_MANIFEST = './outputs/files_manifest.json';  // Uploaded WooCommerce images

// Size patterns for variant detection
const SIZE_PATTERNS = [
  { regex: /(\d+(?:\.\d+)?)\s*(gal(?:lon)?s?)/i, type: 'Size', unit: 'gal' },
  { regex: /(\d+(?:\.\d+)?)\s*(qt|quarts?)/i, type: 'Size', unit: 'qt' },
  { regex: /(\d+(?:\.\d+)?)\s*(pt|pints?)/i, type: 'Size', unit: 'pt' },
  { regex: /(\d+(?:\.\d+)?)\s*(lt|liters?)/i, type: 'Size', unit: 'L' },
  { regex: /(\d+(?:\.\d+)?)\s*(ml)/i, type: 'Size', unit: 'ml' },
  { regex: /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz)/i, type: 'Size', unit: 'oz' },
  { regex: /(\d+(?:\.\d+)?)\s*(lbs?|pounds?)/i, type: 'Weight', unit: 'lb' },
  { regex: /(\d+(?:\.\d+)?)\s*(kg|kilos?)/i, type: 'Weight', unit: 'kg' },
  { regex: /(\d+(?:\.\d+)?)\s*(gm?|grams?)/i, type: 'Weight', unit: 'g' },
  { regex: /(\d+)\s*(pack|pk|ct|count)/i, type: 'Quantity', unit: 'pk' },
  { regex: /(\d+)\s*(in\.?|inch|")/i, type: 'Size', unit: 'in' },
  { regex: /(\d+)\s*(ft\.?|feet|')/i, type: 'Size', unit: 'ft' },
  { regex: /(\d+)\s*[xX]\s*(\d+)/i, type: 'Dimensions', unit: '' },
  { regex: /(\d+)\s*(seed|seeds)/i, type: 'Quantity', unit: 'seeds' },
];

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
  return lines;
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

function extractSizeInfo(title) {
  for (const pattern of SIZE_PATTERNS) {
    const match = title.match(pattern.regex);
    if (match) {
      const value = match[0].trim();
      // Get base title by removing size
      const baseTitle = title.replace(pattern.regex, '').replace(/\s+/g, ' ').trim();
      return {
        optionType: pattern.type,
        optionValue: value,
        baseTitle: baseTitle.replace(/[,\-–]\s*$/, '').trim()
      };
    }
  }
  return null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function main() {
  console.log('═'.repeat(70));
  console.log('🔗 VARIANT GROUPING EDITOR GENERATOR - EDIT-002');
  console.log('═'.repeat(70));
  console.log('');
  
  // Load CSV data
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV not found: ${CSV_FILE}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = parseCSV(csvContent);
  const headers = parseRow(lines[0]);
  
  const cols = {
    handle: headers.indexOf('Handle'),
    title: headers.indexOf('Title'),
    body: headers.indexOf('Body (HTML)'),
    vendor: headers.indexOf('Vendor'),
    type: headers.indexOf('Type'),
    tags: headers.indexOf('Tags'),
    imageSrc: headers.indexOf('Image Src'),
    imagePos: headers.indexOf('Image Position'),
    imageAlt: headers.indexOf('Image Alt Text'),
    price: headers.indexOf('Variant Price'),
    sku: headers.indexOf('Variant SKU'),
    weight: headers.indexOf('Variant Grams'),
    option1Name: headers.indexOf('Option1 Name'),
    option1Value: headers.indexOf('Option1 Value'),
    seoTitle: headers.indexOf('SEO Title'),
    seoDesc: headers.indexOf('SEO Description'),
  };
  
  // Group by handle (each handle = 1 product, variants share handle)
  const products = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    const handle = row[cols.handle];
    if (!handle) continue;
    
    if (!products.has(handle)) {
      products.set(handle, {
        handle,
        title: row[cols.title] || '',
        body: row[cols.body] || '',
        vendor: row[cols.vendor] || '',
        type: row[cols.type] || '',
        tags: row[cols.tags] || '',
        price: row[cols.price] || '',
        sku: row[cols.sku] || '',
        weight: row[cols.weight] || '',
        seoTitle: row[cols.seoTitle] || '',
        seoDesc: row[cols.seoDesc] || '',
        option1Name: row[cols.option1Name] || '',
        option1Value: row[cols.option1Value] || '',
        images: [],
        variants: []
      });
    }
    
    const p = products.get(handle);
    
    // Update with non-empty values (first non-empty wins for parent data)
    if (!p.title && row[cols.title]) p.title = row[cols.title];
    if (!p.body && row[cols.body]) p.body = row[cols.body];
    if (!p.vendor && row[cols.vendor]) p.vendor = row[cols.vendor];
    
    // Collect images
    const imgSrc = row[cols.imageSrc];
    if (imgSrc && imgSrc.startsWith('http')) {
      const exists = p.images.some(img => img.src === imgSrc);
      if (!exists) {
        p.images.push({
          src: imgSrc,
          position: parseInt(row[cols.imagePos]) || p.images.length + 1,
          alt: row[cols.imageAlt] || ''
        });
      }
    }
    
    // Track variant lines (for multi-variant products)
    if (row[cols.option1Value]) {
      p.variants.push({
        option1Value: row[cols.option1Value],
        price: row[cols.price],
        sku: row[cols.sku],
        weight: row[cols.weight]
      });
    }
  }
  
  console.log(`📋 Loaded ${products.size} products\n`);
  
  // Analyze for potential groupings
  const potentialGroups = new Map();
  
  for (const [handle, product] of products) {
    const sizeInfo = extractSizeInfo(product.title);
    if (sizeInfo && sizeInfo.baseTitle) {
      const groupKey = sizeInfo.baseTitle.toLowerCase() + '|' + (product.vendor || '').toLowerCase();
      if (!potentialGroups.has(groupKey)) {
        potentialGroups.set(groupKey, {
          baseTitle: sizeInfo.baseTitle,
          vendor: product.vendor,
          optionType: sizeInfo.optionType,
          products: []
        });
      }
      potentialGroups.get(groupKey).products.push({
        handle,
        title: product.title,
        optionValue: sizeInfo.optionValue,
        price: product.price
      });
    }
  }
  
  // Filter to groups with 2+ products
  const suggestedGroups = [];
  for (const [key, group] of potentialGroups) {
    if (group.products.length >= 2) {
      suggestedGroups.push(group);
    }
  }
  
  console.log(`🔗 Found ${suggestedGroups.length} potential variant groups\n`);
  
  // Load image candidates if available
  let candidates = {};
  if (fs.existsSync(CANDIDATES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf-8'));
      candidates = data.candidates || {};
    } catch (e) {}
  }
  
  // Load files manifest (WooCommerce images uploaded to Shopify CDN)
  let filesManifest = {};  // by filename
  let filesManifestByPath = {};  // by original path
  if (fs.existsSync(FILES_MANIFEST)) {
    try {
      const data = JSON.parse(fs.readFileSync(FILES_MANIFEST, 'utf-8'));
      // Structure is: { byFilename: { "filename.jpg": { shopifyUrl, originalPath, ... } } }
      if (data.byFilename) {
        for (const [filename, info] of Object.entries(data.byFilename)) {
          if (info.shopifyUrl) {
            filesManifest[filename.toLowerCase()] = info.shopifyUrl;
            if (info.originalPath) {
              filesManifestByPath[info.originalPath.toLowerCase()] = info.shopifyUrl;
            }
          }
        }
      }
      console.log(`📸 Loaded ${Object.keys(filesManifest).length} uploaded image mappings`);
    } catch (e) {
      console.log(`⚠️ Could not load files manifest: ${e.message}`);
    }
  }
  
  // Helper to find CDN URL from WooCommerce URL
  function findCdnUrl(wooUrl) {
    if (!wooUrl) return null;
    // Already a CDN URL
    if (wooUrl.includes('cdn.shopify.com')) return wooUrl;
    
    // Extract filename from WooCommerce URL
    try {
      const urlObj = new URL(wooUrl);
      const pathParts = urlObj.pathname.split('/');
      const filename = pathParts[pathParts.length - 1].toLowerCase();
      
      // Try exact filename match
      if (filesManifest[filename]) return filesManifest[filename];
      
      // Try path match (e.g., "2019/09/filename.jpg")
      const pathMatch = urlObj.pathname.replace('/wp-content/uploads/', '').toLowerCase();
      if (filesManifestByPath[pathMatch]) return filesManifestByPath[pathMatch];
      
      // Try without size suffix (e.g., "file-300x300.jpg" -> "file.jpg")
      const baseName = filename.replace(/-\d+x\d+(\.\w+)$/, '$1');
      if (baseName !== filename && filesManifest[baseName]) return filesManifest[baseName];
    } catch (e) {}
    
    return null;
  }
  
  // Merge images from candidates into products without images
  let imagesAdded = 0;
  for (const p of products.values()) {
    if (p.images.length === 0 && candidates[p.handle]) {
      const cands = candidates[p.handle].candidates || [];
      // Get best candidate (highest score)
      const sorted = cands.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      for (const cand of sorted) {
        if (!cand.url) continue;
        
        // Check if this URL was uploaded to Shopify CDN
        const cdnUrl = findCdnUrl(cand.url);
        if (cdnUrl) {
          p.images.push({
            src: cdnUrl,
            position: 1,
            alt: p.title,
            source: cand.url.includes('cdn.shopify.com') ? 'shopify' : 'woocommerce-cdn'
          });
          imagesAdded++;
          break;  // Only add one image
        }
      }
    }
  }
  
  if (imagesAdded > 0) {
    console.log(`🖼️ Added ${imagesAdded} images from candidates\n`);
  }
  
  // Convert to arrays
  const productList = Array.from(products.values());
  
  // Image stats
  const withImages = productList.filter(p => p.images && p.images.length > 0).length;
  const noImages = productList.length - withImages;
  console.log(`📊 Image coverage: ${withImages} with images, ${noImages} without\n`);
  
  // Generate HTML
  const html = generateEditorHTML(productList, suggestedGroups, candidates);
  fs.writeFileSync(OUTPUT_HTML, html);
  
  console.log(`✅ Variant Editor saved: ${OUTPUT_HTML}`);
  console.log('');
  console.log('📌 Features:');
  console.log('   • Drag products to group as variants');
  console.log('   • Multi-image management');
  console.log('   • Auto-suggested groupings');
  console.log('   • Export corrected CSV');
  console.log('═'.repeat(70));
}

function generateEditorHTML(products, suggestedGroups, candidates) {
  const productsJson = JSON.stringify(products);
  const groupsJson = JSON.stringify(suggestedGroups);
  const candidatesJson = JSON.stringify(candidates);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Variant Grouping Editor - H-Moon Hydro</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      background: #f5f5f5;
    }
    
    .app { display: flex; height: 100vh; }
    
    /* Sidebar */
    .sidebar {
      width: 400px;
      background: #1e1e2d;
      color: white;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 15px;
      background: #171722;
      border-bottom: 1px solid #333;
    }
    .sidebar-header h1 { margin: 0 0 10px; font-size: 1.1em; }
    .search-box {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 4px;
      background: #2a2a3d;
      color: white;
    }
    
    .tabs {
      display: flex;
      border-bottom: 1px solid #333;
    }
    .tab {
      flex: 1;
      padding: 10px;
      text-align: center;
      background: #1e1e2d;
      border: none;
      color: #888;
      cursor: pointer;
    }
    .tab.active { background: #2a2a3d; color: white; border-bottom: 2px solid #4CAF50; }
    
    .product-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    }
    
    .product-card {
      background: #2a2a3d;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      cursor: grab;
      border: 2px solid transparent;
    }
    .product-card:hover { border-color: #4CAF50; }
    .product-card.dragging { opacity: 0.5; }
    .product-card.drop-target { border-color: #ff9800; background: #3a3a4d; }
    .product-card.grouped { border-left: 3px solid #2196F3; }
    .product-card.selected { border-color: #4CAF50; background: #3a4a3d; }
    
    .product-title {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .product-meta {
      font-size: 11px;
      color: #888;
      margin-top: 5px;
    }
    .product-badges {
      display: flex;
      gap: 5px;
      margin-top: 5px;
    }
    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .badge-noimg { background: #f44336; }
    .badge-group { background: #2196F3; }
    .badge-edited { background: #ff9800; }
    
    /* Suggested Groups Panel */
    .suggested-panel {
      max-height: 200px;
      overflow-y: auto;
      padding: 10px;
      border-top: 1px solid #333;
    }
    .suggested-panel h3 { margin: 0 0 10px; font-size: 12px; color: #888; }
    .suggest-item {
      background: #2a2a3d;
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 5px;
      cursor: pointer;
    }
    .suggest-item:hover { background: #3a3a4d; }
    .suggest-title { font-size: 12px; }
    .suggest-count { font-size: 10px; color: #888; }
    
    /* Main Editor */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .toolbar {
      padding: 15px 20px;
      background: white;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .toolbar h2 { margin: 0; font-size: 1.2em; }
    .toolbar-actions { display: flex; gap: 10px; }
    
    .editor-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .card-header {
      padding: 15px 20px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-header h3 { margin: 0; font-size: 1em; }
    .card-body { padding: 20px; }
    
    /* Image Gallery */
    .image-gallery {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .image-slot {
      width: 140px;
      border: 2px dashed #ddd;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }
    .image-slot.has-image { border-style: solid; border-color: #4CAF50; }
    .image-slot img {
      width: 100%;
      height: 100px;
      object-fit: contain;
      background: #f5f5f5;
    }
    .image-slot .actions {
      display: flex;
      gap: 5px;
      padding: 5px;
    }
    .image-slot button {
      flex: 1;
      padding: 4px;
      border: none;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    }
    .image-slot .source {
      font-size: 10px;
      color: #666;
      text-align: center;
      padding: 2px;
    }
    .add-image {
      width: 140px;
      height: 140px;
      border: 2px dashed #4CAF50;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #4CAF50;
    }
    
    /* Variant Editor */
    .variant-list {
      border: 1px solid #eee;
      border-radius: 6px;
    }
    .variant-item {
      display: flex;
      align-items: center;
      padding: 10px 15px;
      border-bottom: 1px solid #eee;
      gap: 15px;
    }
    .variant-item:last-child { border-bottom: none; }
    .variant-item .drag-handle {
      cursor: grab;
      color: #999;
    }
    .variant-item input {
      padding: 6px 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .variant-item .name { flex: 1; }
    .variant-item .price { width: 100px; }
    .variant-item .sku { width: 120px; }
    .variant-actions button {
      background: none;
      border: none;
      cursor: pointer;
      color: #999;
    }
    
    /* Form */
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 5px; font-size: 13px; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .form-row { display: flex; gap: 15px; }
    .form-row .form-group { flex: 1; }
    
    /* Buttons */
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
    }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-secondary { background: #f0f0f0; color: #333; }
    .btn-danger { background: #f44336; color: white; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    
    /* Search links */
    .search-links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 10px 0;
    }
    .search-link {
      padding: 6px 12px;
      background: #f0f0f0;
      border-radius: 4px;
      text-decoration: none;
      color: #333;
      font-size: 12px;
    }
    .search-link:hover { background: #e0e0e0; }
    
    /* Drop zone overlay */
    .drop-zone-overlay {
      position: fixed;
      inset: 0;
      background: rgba(76, 175, 80, 0.2);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: #4CAF50;
    }
    .drop-zone-overlay.active { display: flex; }
    
    /* Stats */
    .stats-bar {
      padding: 10px 15px;
      background: #171722;
      font-size: 12px;
      color: #888;
    }
    
    /* Toast */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      display: none;
      z-index: 2000;
    }
    .toast.show { display: block; }
  </style>
</head>
<body>
  <div class="app">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>🔗 Variant Editor</h1>
        <input type="text" class="search-box" id="searchBox" placeholder="Search products...">
      </div>
      
      <div class="tabs">
        <button class="tab active" data-tab="all">All Products</button>
        <button class="tab" data-tab="ungrouped">Ungrouped</button>
        <button class="tab" data-tab="grouped">Grouped</button>
      </div>
      
      <div class="product-list" id="productList"></div>
      
      <div class="suggested-panel" id="suggestedPanel">
        <h3>💡 Suggested Groups</h3>
        <div id="suggestedList"></div>
      </div>
      
      <div class="stats-bar" id="stats"></div>
    </div>
    
    <!-- Main Editor -->
    <div class="main">
      <div class="toolbar">
        <h2 id="currentTitle">Select a product</h2>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" onclick="copyTitle()">📋 Copy Title</button>
          <button class="btn btn-secondary" onclick="resetProduct()">↩️ Reset</button>
          <button class="btn btn-primary" onclick="saveProduct()">💾 Save</button>
          <button class="btn btn-primary" onclick="exportCSV()">📥 Export CSV</button>
        </div>
      </div>
      
      <div class="editor-content" id="editorContent">
        <div style="text-align: center; padding: 100px; color: #888;">
          <h2>👈 Select a product or drag to group</h2>
          <p>Drag products onto each other to create variant groups</p>
          <p>Click suggested groups to auto-apply</p>
        </div>
      </div>
    </div>
  </div>
  
  <div class="drop-zone-overlay" id="dropOverlay">
    <div>Drop to create variant group</div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    // Data
    const products = ${productsJson};
    const suggestedGroups = ${groupsJson};
    const imageCandidates = ${candidatesJson};
    
    // State
    let currentProduct = null;
    let edits = JSON.parse(localStorage.getItem('variantEdits') || '{}');
    let groups = JSON.parse(localStorage.getItem('variantGroups') || '{}');
    let activeTab = 'all';
    let draggedHandle = null;
    
    // Initialize
    function init() {
      renderProductList();
      renderSuggestedGroups();
      updateStats();
      
      // Search
      document.getElementById('searchBox').addEventListener('input', e => {
        renderProductList(e.target.value.toLowerCase());
      });
      
      // Tabs
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeTab = tab.dataset.tab;
          renderProductList();
        });
      });
    }
    
    function renderProductList(search = '') {
      const list = document.getElementById('productList');
      list.innerHTML = '';
      
      const groupedHandles = new Set(Object.values(groups).flat());
      
      products.forEach(p => {
        const isGrouped = groupedHandles.has(p.handle) || groups[p.handle];
        
        // Filter
        if (search && !p.title.toLowerCase().includes(search) && !p.handle.includes(search)) return;
        if (activeTab === 'grouped' && !isGrouped) return;
        if (activeTab === 'ungrouped' && isGrouped) return;
        
        const div = document.createElement('div');
        div.className = 'product-card' + (isGrouped ? ' grouped' : '') + 
          (currentProduct?.handle === p.handle ? ' selected' : '');
        div.draggable = true;
        div.dataset.handle = p.handle;
        
        const hasEdit = edits[p.handle];
        const variantCount = groups[p.handle]?.length || 0;
        
        div.innerHTML = \`
          <div class="product-title">\${escapeHtml(p.title)}</div>
          <div class="product-meta">\${p.vendor || 'No vendor'} • $\${p.price || '0'}</div>
          <div class="product-badges">
            \${p.images.length === 0 ? '<span class="badge badge-noimg">No Image</span>' : ''}
            \${variantCount > 0 ? \`<span class="badge badge-group">\${variantCount} variants</span>\` : ''}
            \${hasEdit ? '<span class="badge badge-edited">Edited</span>' : ''}
          </div>
        \`;
        
        // Click to select
        div.addEventListener('click', () => selectProduct(p));
        
        // Drag events
        div.addEventListener('dragstart', e => {
          draggedHandle = p.handle;
          div.classList.add('dragging');
        });
        div.addEventListener('dragend', () => {
          draggedHandle = null;
          div.classList.remove('dragging');
          document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        });
        div.addEventListener('dragover', e => {
          e.preventDefault();
          if (draggedHandle && draggedHandle !== p.handle) {
            div.classList.add('drop-target');
          }
        });
        div.addEventListener('dragleave', () => {
          div.classList.remove('drop-target');
        });
        div.addEventListener('drop', e => {
          e.preventDefault();
          if (draggedHandle && draggedHandle !== p.handle) {
            groupProducts(p.handle, draggedHandle);
          }
          div.classList.remove('drop-target');
        });
        
        list.appendChild(div);
      });
    }
    
    function renderSuggestedGroups() {
      const list = document.getElementById('suggestedList');
      list.innerHTML = '';
      
      suggestedGroups.slice(0, 10).forEach(group => {
        const div = document.createElement('div');
        div.className = 'suggest-item';
        div.innerHTML = \`
          <div class="suggest-title">\${escapeHtml(group.baseTitle)}</div>
          <div class="suggest-count">\${group.products.length} products • \${group.optionType}</div>
        \`;
        div.addEventListener('click', () => applySuggestedGroup(group));
        list.appendChild(div);
      });
    }
    
    function groupProducts(parentHandle, childHandle) {
      if (!groups[parentHandle]) {
        groups[parentHandle] = [];
      }
      
      // If child was a parent, merge its children
      if (groups[childHandle]) {
        groups[parentHandle].push(...groups[childHandle]);
        delete groups[childHandle];
      }
      
      // Add child
      if (!groups[parentHandle].includes(childHandle)) {
        groups[parentHandle].push(childHandle);
      }
      
      saveGroups();
      renderProductList();
      updateStats();
      showToast(\`Grouped "\${childHandle}" into "\${parentHandle}"\`);
      
      // Open parent for editing
      const parent = products.find(p => p.handle === parentHandle);
      if (parent) selectProduct(parent);
    }
    
    function applySuggestedGroup(group) {
      if (group.products.length < 2) return;
      
      // First product becomes parent
      const parentHandle = group.products[0].handle;
      const childHandles = group.products.slice(1).map(p => p.handle);
      
      groups[parentHandle] = childHandles;
      
      // Set option info
      if (!edits[parentHandle]) {
        const parent = products.find(p => p.handle === parentHandle);
        edits[parentHandle] = { ...parent };
      }
      edits[parentHandle].option1Name = group.optionType;
      edits[parentHandle].variants = group.products.map(p => ({
        handle: p.handle,
        optionValue: p.optionValue,
        price: p.price
      }));
      
      saveEdits();
      saveGroups();
      renderProductList();
      updateStats();
      
      showToast(\`Created group: \${group.baseTitle} (\${group.products.length} variants)\`);
      
      const parent = products.find(p => p.handle === parentHandle);
      if (parent) selectProduct(parent);
    }
    
    function selectProduct(p) {
      currentProduct = p;
      document.getElementById('currentTitle').textContent = p.title;
      renderEditor();
      renderProductList();
    }
    
    function renderEditor() {
      if (!currentProduct) return;
      const p = currentProduct;
      const edited = { ...p, ...(edits[p.handle] || {}) };
      const groupVariants = groups[p.handle] || [];
      
      const content = document.getElementById('editorContent');
      content.innerHTML = \`
        <!-- Images -->
        <div class="card">
          <div class="card-header">
            <h3>🖼️ Images (\${edited.images?.length || 0})</h3>
          </div>
          <div class="card-body">
            <div class="image-gallery" id="imageGallery"></div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
              <div class="form-row">
                <div class="form-group" style="flex: 2;">
                  <input type="text" id="newImageUrl" placeholder="Paste image URL...">
                </div>
                <div class="form-group" style="flex: 1;">
                  <select id="newImageSource">
                    <option value="manual">Manual</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="amazon">Amazon</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <button class="btn btn-primary btn-sm" onclick="addImage()">Add</button>
              </div>
              
              <div class="search-links">
                <a class="search-link" href="https://www.google.com/search?tbm=isch&q=\${encodeURIComponent(p.title + ' ' + p.vendor)}" target="_blank">🔍 Google</a>
                <a class="search-link" href="https://www.amazon.com/s?k=\${encodeURIComponent(p.title)}" target="_blank">📦 Amazon</a>
                <a class="search-link" href="https://htgsupply.com/search?q=\${encodeURIComponent(p.title)}" target="_blank">🏪 HTG</a>
                <a class="search-link" href="https://growgeneration.com/search?q=\${encodeURIComponent(p.title)}" target="_blank">🌿 GrowGen</a>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Variants -->
        <div class="card">
          <div class="card-header">
            <h3>📦 Variants (\${groupVariants.length + 1})</h3>
            <button class="btn btn-secondary btn-sm" onclick="ungroupAll()">Ungroup All</button>
          </div>
          <div class="card-body">
            <div class="form-group" style="max-width: 200px;">
              <label>Option Name</label>
              <select id="optionName" onchange="updateOptionName(this.value)">
                <option value="">-- Select --</option>
                <option value="Size" \${edited.option1Name === 'Size' ? 'selected' : ''}>Size</option>
                <option value="Weight" \${edited.option1Name === 'Weight' ? 'selected' : ''}>Weight</option>
                <option value="Quantity" \${edited.option1Name === 'Quantity' ? 'selected' : ''}>Quantity</option>
                <option value="Color" \${edited.option1Name === 'Color' ? 'selected' : ''}>Color</option>
              </select>
            </div>
            
            <div class="variant-list" id="variantList"></div>
            
            <p style="font-size: 12px; color: #888; margin-top: 10px;">
              Drag products from sidebar to add as variants. All variants share the same images and description.
            </p>
          </div>
        </div>
        
        <!-- Basic Info -->
        <div class="card">
          <div class="card-header">
            <h3>📝 Product Info</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="editTitle" value="\${escapeHtml(edited.title)}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Vendor</label>
                <input type="text" id="editVendor" value="\${escapeHtml(edited.vendor)}">
              </div>
              <div class="form-group">
                <label>Type</label>
                <input type="text" id="editType" value="\${escapeHtml(edited.type)}">
              </div>
            </div>
            <div class="form-group">
              <label>Tags</label>
              <input type="text" id="editTags" value="\${escapeHtml(edited.tags)}">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="editBody" rows="6">\${escapeHtml(edited.body)}</textarea>
            </div>
          </div>
        </div>
        
        <!-- SEO -->
        <div class="card">
          <div class="card-header">
            <h3>🔍 SEO</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>SEO Title</label>
              <input type="text" id="editSeoTitle" value="\${escapeHtml(edited.seoTitle)}" maxlength="60">
            </div>
            <div class="form-group">
              <label>SEO Description</label>
              <textarea id="editSeoDesc" rows="2" maxlength="160">\${escapeHtml(edited.seoDesc)}</textarea>
            </div>
          </div>
        </div>
      \`;
      
      renderImageGallery();
      renderVariantList();
    }
    
    function renderImageGallery() {
      const gallery = document.getElementById('imageGallery');
      if (!gallery) return;
      
      const edited = { ...currentProduct, ...(edits[currentProduct.handle] || {}) };
      const images = edited.images || [];
      
      gallery.innerHTML = images.map((img, i) => \`
        <div class="image-slot has-image">
          <img src="\${escapeHtml(img.src)}" onerror="this.src='https://via.placeholder.com/140?text=Error'">
          <div class="source">\${img.source || 'original'}</div>
          <div class="actions">
            <button onclick="removeImage(\${i})" style="background:#ffebee;color:#f44336;">🗑️</button>
            \${i > 0 ? \`<button onclick="makePrimary(\${i})" style="background:#e3f2fd;color:#2196F3;">⬆️</button>\` : ''}
          </div>
        </div>
      \`).join('') + \`
        <div class="add-image" onclick="document.getElementById('newImageUrl').focus()">
          <span style="font-size:24px;">+</span>
          <span style="font-size:12px;">Add</span>
        </div>
      \`;
    }
    
    function renderVariantList() {
      const list = document.getElementById('variantList');
      if (!list) return;
      
      const p = currentProduct;
      const edited = edits[p.handle] || {};
      const groupVariants = groups[p.handle] || [];
      
      // Build variant data
      const variants = [{
        handle: p.handle,
        title: p.title,
        optionValue: extractOptionValue(p.title),
        price: p.price,
        sku: p.sku,
        isParent: true
      }];
      
      groupVariants.forEach(h => {
        const child = products.find(pr => pr.handle === h);
        if (child) {
          variants.push({
            handle: h,
            title: child.title,
            optionValue: extractOptionValue(child.title),
            price: child.price,
            sku: child.sku,
            isParent: false
          });
        }
      });
      
      list.innerHTML = variants.map((v, i) => \`
        <div class="variant-item">
          <span class="drag-handle">☰</span>
          <input type="text" class="name" value="\${escapeHtml(v.optionValue || v.title)}" 
            onchange="updateVariantOption(\${i}, this.value)">
          <input type="text" class="price" value="\${v.price}" placeholder="Price"
            onchange="updateVariantPrice(\${i}, this.value)">
          <input type="text" class="sku" value="\${v.sku || ''}" placeholder="SKU"
            onchange="updateVariantSku(\${i}, this.value)">
          <div class="variant-actions">
            \${!v.isParent ? \`<button onclick="removeVariant('\${v.handle}')" title="Remove">✕</button>\` : ''}
          </div>
        </div>
      \`).join('');
    }
    
    function extractOptionValue(title) {
      const patterns = [
        /(\\d+(?:\\.\\d+)?\\s*(?:gal|qt|pt|lt|ml|oz|lb|kg|gm?|pack|pk|ct|in|ft|seed)s?)/i
      ];
      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) return match[1];
      }
      return '';
    }
    
    function addImage() {
      const url = document.getElementById('newImageUrl').value.trim();
      const source = document.getElementById('newImageSource').value;
      
      if (!url || !url.startsWith('http')) {
        showToast('Please enter a valid URL');
        return;
      }
      
      if (!edits[currentProduct.handle]) {
        edits[currentProduct.handle] = { ...currentProduct };
      }
      if (!edits[currentProduct.handle].images) {
        edits[currentProduct.handle].images = [...currentProduct.images];
      }
      
      edits[currentProduct.handle].images.push({
        src: url,
        source: source,
        position: edits[currentProduct.handle].images.length + 1,
        alt: currentProduct.title
      });
      
      saveEdits();
      document.getElementById('newImageUrl').value = '';
      renderImageGallery();
      showToast('Image added');
    }
    
    function removeImage(idx) {
      if (!edits[currentProduct.handle]) {
        edits[currentProduct.handle] = { ...currentProduct };
      }
      if (!edits[currentProduct.handle].images) {
        edits[currentProduct.handle].images = [...currentProduct.images];
      }
      edits[currentProduct.handle].images.splice(idx, 1);
      saveEdits();
      renderImageGallery();
    }
    
    function makePrimary(idx) {
      if (!edits[currentProduct.handle]) {
        edits[currentProduct.handle] = { ...currentProduct };
      }
      if (!edits[currentProduct.handle].images) {
        edits[currentProduct.handle].images = [...currentProduct.images];
      }
      const img = edits[currentProduct.handle].images.splice(idx, 1)[0];
      edits[currentProduct.handle].images.unshift(img);
      saveEdits();
      renderImageGallery();
    }
    
    function removeVariant(handle) {
      const parentHandle = currentProduct.handle;
      if (groups[parentHandle]) {
        groups[parentHandle] = groups[parentHandle].filter(h => h !== handle);
        if (groups[parentHandle].length === 0) {
          delete groups[parentHandle];
        }
      }
      saveGroups();
      renderVariantList();
      renderProductList();
      updateStats();
    }
    
    function ungroupAll() {
      delete groups[currentProduct.handle];
      saveGroups();
      renderVariantList();
      renderProductList();
      updateStats();
      showToast('All variants ungrouped');
    }
    
    function updateOptionName(value) {
      if (!edits[currentProduct.handle]) {
        edits[currentProduct.handle] = { ...currentProduct };
      }
      edits[currentProduct.handle].option1Name = value;
      saveEdits();
    }
    
    function saveProduct() {
      if (!currentProduct) return;
      
      edits[currentProduct.handle] = {
        ...currentProduct,
        ...(edits[currentProduct.handle] || {}),
        title: document.getElementById('editTitle').value,
        vendor: document.getElementById('editVendor').value,
        type: document.getElementById('editType').value,
        tags: document.getElementById('editTags').value,
        body: document.getElementById('editBody').value,
        seoTitle: document.getElementById('editSeoTitle').value,
        seoDesc: document.getElementById('editSeoDesc').value,
        editedAt: new Date().toISOString()
      };
      
      saveEdits();
      renderProductList();
      updateStats();
      showToast('Product saved');
    }
    
    function resetProduct() {
      if (!currentProduct) return;
      if (!confirm('Reset all changes?')) return;
      delete edits[currentProduct.handle];
      delete groups[currentProduct.handle];
      saveEdits();
      saveGroups();
      renderEditor();
      renderProductList();
      updateStats();
    }
    
    function copyTitle() {
      if (currentProduct) {
        navigator.clipboard.writeText(currentProduct.title);
        showToast('Copied: ' + currentProduct.title);
      }
    }
    
    function exportCSV() {
      const csv = generateShopifyCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shopify_import_grouped.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported');
    }
    
    function generateShopifyCSV() {
      const headers = [
        'Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags',
        'Published','Option1 Name','Option1 Value','Option2 Name','Option2 Value',
        'Option3 Name','Option3 Value','Variant SKU','Variant Grams',
        'Variant Inventory Tracker','Variant Inventory Qty','Variant Inventory Policy',
        'Variant Fulfillment Service','Variant Price','Variant Compare At Price',
        'Variant Requires Shipping','Variant Taxable','Variant Barcode',
        'Image Src','Image Position','Image Alt Text','SEO Title','SEO Description',
        'Gift Card','Status'
      ];
      
      const rows = [headers.join(',')];
      const processedHandles = new Set();
      
      products.forEach(p => {
        if (processedHandles.has(p.handle)) return;
        
        // Check if this is part of a group (as child)
        for (const [parentHandle, children] of Object.entries(groups)) {
          if (children.includes(p.handle)) return; // Skip, will be processed with parent
        }
        
        const edited = { ...p, ...(edits[p.handle] || {}) };
        const groupVariants = groups[p.handle] || [];
        
        // First variant (parent)
        const firstRow = createCSVRow(edited, true, 1, edited.option1Name, extractOptionValue(edited.title));
        rows.push(firstRow);
        processedHandles.add(p.handle);
        
        // Additional images
        if (edited.images && edited.images.length > 1) {
          edited.images.slice(1).forEach((img, i) => {
            rows.push(createImageRow(p.handle, img, i + 2));
          });
        }
        
        // Child variants
        groupVariants.forEach((childHandle, idx) => {
          const child = products.find(pr => pr.handle === childHandle);
          if (child) {
            const childEdited = { ...child, ...(edits[childHandle] || {}) };
            const row = createVariantRow(p.handle, childEdited, edited.option1Name, extractOptionValue(child.title));
            rows.push(row);
            processedHandles.add(childHandle);
          }
        });
      });
      
      return rows.join('\\n');
    }
    
    function createCSVRow(p, isFirst, imgPos, optionName, optionValue) {
      const img = p.images?.[0];
      return [
        csvEscape(p.handle),
        isFirst ? csvEscape(p.title) : '',
        isFirst ? csvEscape(p.body) : '',
        isFirst ? csvEscape(p.vendor) : '',
        '',
        isFirst ? csvEscape(p.type) : '',
        isFirst ? csvEscape(p.tags) : '',
        'TRUE',
        optionName || 'Title',
        optionValue || 'Default Title',
        '','','','',
        csvEscape(p.sku || ''),
        p.weight || '0',
        'shopify','','deny','manual',
        p.price || '0','',
        'TRUE','TRUE','',
        img ? csvEscape(img.src) : '',
        img ? '1' : '',
        img ? csvEscape(img.alt || p.title) : '',
        csvEscape(p.seoTitle || ''),
        csvEscape(p.seoDesc || ''),
        'FALSE',
        'active'
      ].join(',');
    }
    
    function createVariantRow(parentHandle, child, optionName, optionValue) {
      return [
        csvEscape(parentHandle),
        '','','','','','',
        '',
        optionName || 'Title',
        optionValue || 'Default Title',
        '','','','',
        csvEscape(child.sku || ''),
        child.weight || '0',
        'shopify','','deny','manual',
        child.price || '0','',
        'TRUE','TRUE','',
        '','','','','',
        '',''
      ].join(',');
    }
    
    function createImageRow(handle, img, pos) {
      return [
        csvEscape(handle),
        '','','','','','','','','','','','','','','','','','','','','','','','',
        csvEscape(img.src),
        pos.toString(),
        csvEscape(img.alt || ''),
        '','','',''
      ].join(',');
    }
    
    function csvEscape(str) {
      if (!str) return '';
      str = String(str);
      if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }
    
    function saveEdits() {
      localStorage.setItem('variantEdits', JSON.stringify(edits));
    }
    
    function saveGroups() {
      localStorage.setItem('variantGroups', JSON.stringify(groups));
    }
    
    function updateStats() {
      const total = products.length;
      const grouped = Object.keys(groups).length;
      const edited = Object.keys(edits).length;
      const noImage = products.filter(p => !p.images?.length).length;
      
      document.getElementById('stats').textContent = 
        \`\${total} products • \${grouped} grouped • \${edited} edited • \${noImage} no image\`;
    }
    
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    
    // Start
    init();
  </script>
</body>
</html>`;
}

main();
