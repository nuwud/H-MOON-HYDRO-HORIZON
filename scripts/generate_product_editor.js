/**
 * Generate Product Editor Dashboard
 * EDIT-001: Comprehensive Product Editor
 * 
 * A full-featured browser-based product editor with:
 * - Per-product save with LocalStorage
 * - Multi-image support with drag-to-reorder
 * - Editable title, description, specs
 * - Document/spec sheet attachments
 * - Smart search integration
 * - Progress tracking
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CANDIDATES_FILE = './outputs/image_candidates.json';
const STATE_FILE = './outputs/image_replacement_state.json';
const CSV_FILE = './CSVs/products_export_fixed.csv';  // Use fixed CSV with Status column
const OUTPUT_HTML = './outputs/product_editor.html';

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

// Load all product data
function loadProductData() {
  const products = new Map();
  
  // Load from CSV
  if (fs.existsSync(CSV_FILE)) {
    const content = fs.readFileSync(CSV_FILE, 'utf-8');
    const { headers, rows } = parseCSV(content);
    
    const idx = {
      handle: headers.indexOf('Handle'),
      title: headers.indexOf('Title'),
      body: headers.indexOf('Body (HTML)'),
      vendor: headers.indexOf('Vendor'),
      type: headers.indexOf('Type'),
      tags: headers.indexOf('Tags'),
      imageSrc: headers.indexOf('Image Src'),
      imagePos: headers.indexOf('Image Position'),
      imageAlt: headers.indexOf('Image Alt Text'),
      seoTitle: headers.indexOf('SEO Title'),
      seoDesc: headers.indexOf('SEO Description'),
      price: headers.indexOf('Variant Price'),
      sku: headers.indexOf('Variant SKU'),
      weight: headers.indexOf('Variant Grams'),
    };
    
    for (const row of rows) {
      const handle = row[idx.handle];
      if (!handle) continue;
      
      if (!products.has(handle)) {
        products.set(handle, {
          handle,
          title: row[idx.title] || '',
          description: row[idx.body] || '',
          vendor: row[idx.vendor] || '',
          type: row[idx.type] || '',
          tags: row[idx.tags] || '',
          seoTitle: row[idx.seoTitle] || '',
          seoDesc: row[idx.seoDesc] || '',
          price: row[idx.price] || '',
          sku: row[idx.sku] || '',
          weight: row[idx.weight] || '',
          images: [],
          candidates: []
        });
      }
      
      const p = products.get(handle);
      if (!p.title && row[idx.title]) p.title = row[idx.title];
      if (!p.description && row[idx.body]) p.description = row[idx.body];
      if (!p.vendor && row[idx.vendor]) p.vendor = row[idx.vendor];
      
      // Add image
      if (row[idx.imageSrc]) {
        p.images.push({
          url: row[idx.imageSrc],
          position: parseInt(row[idx.imagePos]) || p.images.length + 1,
          altText: row[idx.imageAlt] || ''
        });
      }
    }
  }
  
  // Load candidates
  if (fs.existsSync(CANDIDATES_FILE)) {
    const data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf-8'));
    for (const [handle, cdata] of Object.entries(data.candidates)) {
      if (products.has(handle)) {
        products.get(handle).candidates = cdata.candidates || [];
        products.get(handle).currentScore = cdata.currentScore || 0;
      }
    }
  }
  
  return products;
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

function escapeJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// Generate HTML
function generateHTML(products) {
  const productArray = Array.from(products.values());
  
  // Generate product cards
  const productCards = productArray.map((p, index) => {
    const currentImages = p.images.slice(0, 5);
    const candidateImages = (p.candidates || [])
      .filter(c => !c.source?.includes('search'))
      .slice(0, 5);
    const searchLinks = (p.candidates || [])
      .filter(c => c.source?.includes('search'))
      .slice(0, 3);
    
    const imagesHtml = currentImages.map((img, i) => `
      <div class="image-slot" data-position="${i + 1}">
        <img src="${escapeHtml(img.url)}" loading="lazy" onerror="this.src='https://via.placeholder.com/120?text=Error'">
        <button class="remove-img" onclick="removeImage('${escapeHtml(p.handle)}', ${i})">×</button>
        <div class="img-source">current</div>
      </div>
    `).join('');
    
    const candidatesHtml = candidateImages.map((c, i) => `
      <div class="candidate-thumb" onclick="addImageFromCandidate('${escapeHtml(p.handle)}', '${escapeJs(c.url)}', '${escapeHtml(c.source || 'scraped')}')">
        <img src="${escapeHtml(c.url)}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="candidate-score">${c.score || '?'}</div>
      </div>
    `).join('');
    
    const tagsArray = p.tags ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const tagsHtml = tagsArray.slice(0, 5).map(t => 
      `<span class="tag">${escapeHtml(t)}</span>`
    ).join('');
    
    // Strip HTML for plain text description preview
    const plainDesc = p.description.replace(/<[^>]*>/g, '').substring(0, 200);
    
    return `
    <div class="product-card" id="product-${escapeHtml(p.handle)}" data-handle="${escapeHtml(p.handle)}" data-index="${index}">
      <div class="card-header">
        <input type="checkbox" class="product-check" id="check-${escapeHtml(p.handle)}">
        <div class="title-row">
          <input type="text" class="title-input" value="${escapeHtml(p.title)}" data-field="title">
          <button class="btn-icon" onclick="copyToClipboard('${escapeJs(p.title)}')" title="Copy title">📋</button>
          <button class="btn-icon" onclick="openGoogleImages('${escapeJs(p.title + ' ' + p.vendor)}')" title="Search Google Images">🔍</button>
        </div>
        <div class="meta-row">
          <span class="handle">${escapeHtml(p.handle)}</span>
          <select class="vendor-select" data-field="vendor">
            <option value="${escapeHtml(p.vendor)}" selected>${escapeHtml(p.vendor || 'Unknown')}</option>
          </select>
          <span class="price">${p.price ? '$' + p.price : ''}</span>
          <span class="sku">${escapeHtml(p.sku)}</span>
        </div>
        <div class="action-buttons">
          <button class="btn-save" onclick="saveProduct('${escapeHtml(p.handle)}')">💾 Save</button>
          <span class="save-status" id="status-${escapeHtml(p.handle)}"></span>
        </div>
      </div>
      
      <div class="card-section images-section">
        <div class="section-header">
          <h4>📷 Images</h4>
          <span class="image-count" id="imgcount-${escapeHtml(p.handle)}">${currentImages.length}/5</span>
        </div>
        <div class="images-container" id="images-${escapeHtml(p.handle)}">
          ${imagesHtml}
          <div class="image-slot add-slot" onclick="showAddImageModal('${escapeHtml(p.handle)}')">
            <span>+ Add</span>
          </div>
        </div>
        ${candidateImages.length > 0 ? `
        <div class="candidates-row">
          <span class="label">Suggestions:</span>
          ${candidatesHtml}
        </div>
        ` : ''}
        <div class="search-row">
          <button class="search-btn" onclick="openGoogleImages('${escapeJs(p.title + ' ' + p.vendor + ' product')}')">Google</button>
          <button class="search-btn" onclick="openUrl('https://www.amazon.com/s?k=${encodeURIComponent(p.title)}')">Amazon</button>
          <button class="search-btn" onclick="openUrl('https://htgsupply.com/search?q=${encodeURIComponent(p.title)}')">HTG</button>
          <button class="search-btn" onclick="openUrl('https://growgeneration.com/search?q=${encodeURIComponent(p.title)}')">GrowGen</button>
          <input type="text" class="url-input" placeholder="Paste image URL..." onkeypress="if(event.key==='Enter')addImageFromUrl('${escapeHtml(p.handle)}', this.value, 'manual')">
        </div>
      </div>
      
      <div class="card-section description-section collapsed">
        <div class="section-header" onclick="toggleSection(this)">
          <h4>📝 Description</h4>
          <span class="collapse-icon">▼</span>
        </div>
        <div class="section-content">
          <textarea class="description-input" data-field="description" rows="4">${escapeHtml(plainDesc)}</textarea>
          <div class="suggestions" id="suggest-${escapeHtml(p.handle)}">
            ${plainDesc.length < 100 ? '<span class="warning">⚠️ Description too short</span>' : ''}
          </div>
        </div>
      </div>
      
      <div class="card-section specs-section collapsed">
        <div class="section-header" onclick="toggleSection(this)">
          <h4>📊 Specifications</h4>
          <span class="collapse-icon">▼</span>
        </div>
        <div class="section-content">
          <div class="specs-grid" id="specs-${escapeHtml(p.handle)}">
            <label>Type:</label>
            <input type="text" data-spec="type" value="${escapeHtml(p.type)}">
            <label>Weight:</label>
            <input type="text" data-spec="weight" value="${p.weight ? Math.round(p.weight / 453.592 * 10) / 10 + ' lbs' : ''}">
            <label>Size:</label>
            <input type="text" data-spec="size" value="">
            <label>NPK:</label>
            <input type="text" data-spec="npk" value="">
          </div>
          <button class="btn-small" onclick="addSpecField('${escapeHtml(p.handle)}')">+ Add Field</button>
        </div>
      </div>
      
      <div class="card-section docs-section collapsed">
        <div class="section-header" onclick="toggleSection(this)">
          <h4>📄 Documents</h4>
          <span class="collapse-icon">▼</span>
        </div>
        <div class="section-content">
          <div class="doc-row">
            <label>Feed Chart:</label>
            <input type="text" class="doc-input" data-doc="feed-chart" placeholder="URL to feed chart PDF/image">
            <button class="btn-small" onclick="searchDoc('${escapeJs(p.vendor + ' ' + p.title + ' feed chart')}')">🔍</button>
          </div>
          <div class="doc-row">
            <label>SDS:</label>
            <input type="text" class="doc-input" data-doc="sds" placeholder="Safety Data Sheet URL">
            <button class="btn-small" onclick="searchDoc('${escapeJs(p.vendor + ' ' + p.title + ' SDS safety data sheet')}')">🔍</button>
          </div>
          <div class="doc-row">
            <label>Manual:</label>
            <input type="text" class="doc-input" data-doc="manual" placeholder="Product manual URL">
          </div>
        </div>
      </div>
      
      <div class="card-section tags-section">
        <div class="tags-container" id="tags-${escapeHtml(p.handle)}">
          ${tagsHtml}
          <input type="text" class="tag-input" placeholder="+tag" onkeypress="if(event.key==='Enter')addTag('${escapeHtml(p.handle)}', this.value)">
        </div>
      </div>
      
      <div class="card-footer">
        <div class="completeness">
          <div class="progress-bar">
            <div class="progress-fill" id="progress-${escapeHtml(p.handle)}" style="width: ${calculateCompleteness(p)}%"></div>
          </div>
          <span>${calculateCompleteness(p)}% complete</span>
        </div>
        <textarea class="notes-input" data-field="notes" placeholder="Notes..."></textarea>
      </div>
    </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Editor - H-Moon Hydro</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    
    /* Header */
    .header {
      background: #16213e;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid #0f3460;
    }
    .header h1 { font-size: 1.3em; color: #e94560; }
    .header-stats { display: flex; gap: 15px; font-size: 13px; }
    .header-stats span { background: rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 4px; }
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    
    /* Buttons */
    button {
      padding: 8px 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }
    .btn-primary { background: #e94560; color: white; }
    .btn-primary:hover { background: #ff6b6b; }
    .btn-secondary { background: #0f3460; color: white; }
    .btn-secondary:hover { background: #1a4a7a; }
    .btn-save { background: #4CAF50; color: white; padding: 5px 10px; }
    .btn-save:hover { background: #45a049; }
    .btn-icon { background: transparent; color: #aaa; padding: 4px 8px; }
    .btn-icon:hover { color: #fff; }
    .btn-small { background: #333; color: #ccc; padding: 4px 8px; font-size: 11px; }
    
    /* Filters */
    .filters {
      background: #16213e;
      padding: 10px 20px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
      border-bottom: 1px solid #0f3460;
    }
    .filters input, .filters select {
      background: #1a1a2e;
      border: 1px solid #0f3460;
      color: #eee;
      padding: 6px 10px;
      border-radius: 4px;
    }
    .filters label { color: #888; font-size: 12px; }
    
    /* Main container */
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Product cards */
    .product-card {
      background: #16213e;
      border-radius: 8px;
      margin-bottom: 15px;
      overflow: hidden;
      border: 1px solid #0f3460;
    }
    .product-card.modified { border-color: #e94560; }
    .product-card.saved { border-color: #4CAF50; }
    
    .card-header {
      padding: 12px 15px;
      border-bottom: 1px solid #0f3460;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .title-input {
      flex: 1;
      background: transparent;
      border: 1px solid transparent;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .title-input:hover, .title-input:focus {
      border-color: #0f3460;
      background: #1a1a2e;
    }
    .meta-row {
      display: flex;
      gap: 15px;
      align-items: center;
      font-size: 12px;
      color: #888;
    }
    .handle { font-family: monospace; }
    .vendor-select {
      background: transparent;
      border: none;
      color: #4CAF50;
      font-size: 12px;
    }
    .action-buttons {
      position: absolute;
      top: 12px;
      right: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .save-status {
      font-size: 11px;
      color: #4CAF50;
    }
    
    /* Sections */
    .card-section {
      padding: 12px 15px;
      border-bottom: 1px solid #0f3460;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .section-header h4 { font-size: 13px; color: #aaa; }
    .collapse-icon { color: #666; font-size: 10px; transition: transform 0.2s; }
    .collapsed .section-content { display: none; }
    .collapsed .collapse-icon { transform: rotate(-90deg); }
    .section-content { margin-top: 10px; }
    
    /* Images */
    .images-container {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .image-slot {
      width: 100px;
      height: 100px;
      border: 2px solid #0f3460;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      cursor: grab;
    }
    .image-slot img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #0a0a15;
    }
    .image-slot .remove-img {
      position: absolute;
      top: 2px;
      right: 2px;
      background: rgba(255,0,0,0.8);
      color: white;
      border: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: none;
    }
    .image-slot:hover .remove-img { display: block; }
    .image-slot .img-source {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.7);
      font-size: 9px;
      text-align: center;
      padding: 2px;
    }
    .add-slot {
      border-style: dashed;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      cursor: pointer;
    }
    .add-slot:hover { border-color: #e94560; color: #e94560; }
    
    .candidates-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      overflow-x: auto;
    }
    .candidates-row .label { font-size: 11px; color: #666; }
    .candidate-thumb {
      width: 50px;
      height: 50px;
      border: 1px solid #333;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
    }
    .candidate-thumb:hover { border-color: #4CAF50; }
    .candidate-thumb img { width: 100%; height: 100%; object-fit: contain; }
    .candidate-score {
      position: absolute;
      bottom: 0;
      right: 0;
      background: rgba(0,0,0,0.8);
      font-size: 8px;
      padding: 1px 3px;
    }
    
    .search-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .search-btn {
      background: #333;
      color: #aaa;
      padding: 4px 10px;
      font-size: 11px;
    }
    .search-btn:hover { background: #444; color: #fff; }
    .url-input {
      flex: 1;
      min-width: 200px;
      background: #1a1a2e;
      border: 1px solid #333;
      color: #eee;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    /* Description */
    .description-input {
      width: 100%;
      background: #1a1a2e;
      border: 1px solid #333;
      color: #eee;
      padding: 8px;
      border-radius: 4px;
      resize: vertical;
      font-size: 13px;
    }
    .suggestions { margin-top: 8px; }
    .warning { color: #ff9800; font-size: 11px; }
    
    /* Specs */
    .specs-grid {
      display: grid;
      grid-template-columns: 100px 1fr 100px 1fr;
      gap: 8px;
      align-items: center;
    }
    .specs-grid label { font-size: 12px; color: #888; }
    .specs-grid input {
      background: #1a1a2e;
      border: 1px solid #333;
      color: #eee;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    /* Docs */
    .doc-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .doc-row label { width: 80px; font-size: 12px; color: #888; }
    .doc-input {
      flex: 1;
      background: #1a1a2e;
      border: 1px solid #333;
      color: #eee;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    /* Tags */
    .tags-section { padding: 8px 15px; }
    .tags-container { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .tag {
      background: #0f3460;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    }
    .tag:hover { background: #e94560; }
    .tag-input {
      background: transparent;
      border: 1px dashed #333;
      color: #888;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      width: 60px;
    }
    
    /* Footer */
    .card-footer {
      padding: 10px 15px;
      display: flex;
      gap: 15px;
      align-items: center;
    }
    .completeness { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #888; }
    .progress-bar {
      width: 100px;
      height: 6px;
      background: #333;
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill { height: 100%; background: #4CAF50; transition: width 0.3s; }
    .notes-input {
      flex: 1;
      background: transparent;
      border: 1px solid #333;
      color: #888;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 11px;
      resize: none;
      height: 24px;
    }
    
    /* Modal */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal.show { display: flex; }
    .modal-content {
      background: #16213e;
      padding: 25px;
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow: auto;
    }
    .modal-content h3 { margin-bottom: 15px; }
    .modal-content input, .modal-content textarea {
      width: 100%;
      margin-bottom: 10px;
      background: #1a1a2e;
      border: 1px solid #333;
      color: #eee;
      padding: 10px;
      border-radius: 4px;
    }
    .modal-actions { display: flex; gap: 10px; margin-top: 15px; }
    
    /* Toast */
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      display: none;
      z-index: 1001;
    }
    .toast.show { display: block; }
    
    /* Image search modal */
    .image-search-frame {
      width: 100%;
      height: 400px;
      border: none;
      background: white;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛠️ Product Editor Dashboard</h1>
    <div class="header-stats">
      <span>📦 Total: <strong id="stat-total">${productArray.length}</strong></span>
      <span>✏️ Modified: <strong id="stat-modified">0</strong></span>
      <span>💾 Saved: <strong id="stat-saved">0</strong></span>
      <span>✅ Complete: <strong id="stat-complete">0</strong></span>
    </div>
    <div class="header-actions">
      <button class="btn-secondary" onclick="saveAllModified()">💾 Save All Modified</button>
      <button class="btn-secondary" onclick="exportAll()">📤 Export JSON</button>
      <button class="btn-secondary" onclick="importJson()">📥 Import JSON</button>
      <button class="btn-primary" onclick="showStats()">📊 Stats</button>
    </div>
  </div>
  
  <div class="filters">
    <label>Search:</label>
    <input type="text" id="filter-search" placeholder="Search products..." oninput="applyFilters()">
    <label>Status:</label>
    <select id="filter-status" onchange="applyFilters()">
      <option value="">All</option>
      <option value="modified">Modified</option>
      <option value="saved">Saved</option>
      <option value="incomplete">Incomplete</option>
    </select>
    <label>Vendor:</label>
    <select id="filter-vendor" onchange="applyFilters()">
      <option value="">All Vendors</option>
    </select>
    <label>Has Images:</label>
    <select id="filter-images" onchange="applyFilters()">
      <option value="">Any</option>
      <option value="none">No Images</option>
      <option value="some">Has Images</option>
    </select>
  </div>
  
  <div class="container" id="products-container">
    ${productCards}
  </div>
  
  <div class="modal" id="add-image-modal">
    <div class="modal-content">
      <h3>Add Image</h3>
      <input type="text" id="new-image-url" placeholder="Paste image URL...">
      <select id="new-image-source">
        <option value="manual">Manual</option>
        <option value="manufacturer">Manufacturer</option>
        <option value="amazon">Amazon</option>
        <option value="htg-supply">HTG Supply</option>
        <option value="google">Google Images</option>
        <option value="other">Other</option>
      </select>
      <input type="text" id="new-image-alt" placeholder="Alt text (optional)">
      <div class="modal-actions">
        <button class="btn-primary" onclick="confirmAddImage()">Add Image</button>
        <button class="btn-secondary" onclick="closeModal('add-image-modal')">Cancel</button>
      </div>
    </div>
  </div>
  
  <div class="modal" id="export-modal">
    <div class="modal-content">
      <h3>Export Data</h3>
      <textarea id="export-data" rows="15" readonly></textarea>
      <div class="modal-actions">
        <button class="btn-primary" onclick="downloadExport()">💾 Download</button>
        <button class="btn-secondary" onclick="copyExport()">📋 Copy</button>
        <button class="btn-secondary" onclick="closeModal('export-modal')">Close</button>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <input type="file" id="import-file" accept=".json" style="display:none" onchange="handleImport(event)">
  
  <script>
    // State management
    const productState = {};
    let currentAddHandle = null;
    
    // Initialize state from localStorage
    function initState() {
      document.querySelectorAll('.product-card').forEach(card => {
        const handle = card.dataset.handle;
        const saved = localStorage.getItem('product:' + handle);
        if (saved) {
          try {
            productState[handle] = JSON.parse(saved);
            card.classList.add('saved');
            applyStateToCard(handle);
          } catch(e) {}
        }
      });
      updateStats();
      populateVendorFilter();
    }
    
    function populateVendorFilter() {
      const vendors = new Set();
      document.querySelectorAll('.vendor-select').forEach(sel => {
        vendors.add(sel.value);
      });
      const filter = document.getElementById('filter-vendor');
      [...vendors].sort().forEach(v => {
        if (v) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          filter.appendChild(opt);
        }
      });
    }
    
    // Toast notification
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    // Copy to clipboard
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text);
      showToast('Copied: ' + text.substring(0, 50) + '...');
    }
    
    // Open URLs
    function openUrl(url) {
      window.open(url, '_blank');
    }
    
    function openGoogleImages(query) {
      window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query), '_blank');
    }
    
    function searchDoc(query) {
      window.open('https://www.google.com/search?q=' + encodeURIComponent(query + ' filetype:pdf'), '_blank');
    }
    
    // Toggle collapsed sections
    function toggleSection(header) {
      header.parentElement.classList.toggle('collapsed');
    }
    
    // Mark product as modified
    function markModified(handle) {
      const card = document.getElementById('product-' + handle);
      card.classList.add('modified');
      card.classList.remove('saved');
      updateStats();
    }
    
    // Save product to localStorage
    function saveProduct(handle) {
      const card = document.getElementById('product-' + handle);
      const state = collectCardState(handle);
      
      productState[handle] = state;
      localStorage.setItem('product:' + handle, JSON.stringify(state));
      
      card.classList.remove('modified');
      card.classList.add('saved');
      
      const status = document.getElementById('status-' + handle);
      status.textContent = '✓ Saved';
      setTimeout(() => status.textContent = '', 2000);
      
      updateStats();
      showToast('Saved: ' + handle);
    }
    
    // Collect state from card
    function collectCardState(handle) {
      const card = document.getElementById('product-' + handle);
      
      const images = [];
      card.querySelectorAll('.images-container .image-slot:not(.add-slot)').forEach((slot, i) => {
        const img = slot.querySelector('img');
        const source = slot.querySelector('.img-source')?.textContent || 'current';
        if (img && img.src && !img.src.includes('placeholder')) {
          images.push({
            url: img.src,
            source: source,
            position: i + 1
          });
        }
      });
      
      const specs = {};
      card.querySelectorAll('[data-spec]').forEach(input => {
        if (input.value) specs[input.dataset.spec] = input.value;
      });
      
      const docs = {};
      card.querySelectorAll('[data-doc]').forEach(input => {
        if (input.value) docs[input.dataset.doc] = input.value;
      });
      
      const tags = [];
      card.querySelectorAll('.tag').forEach(tag => tags.push(tag.textContent));
      
      return {
        handle,
        title: card.querySelector('[data-field="title"]')?.value || '',
        vendor: card.querySelector('[data-field="vendor"]')?.value || '',
        description: card.querySelector('[data-field="description"]')?.value || '',
        notes: card.querySelector('[data-field="notes"]')?.value || '',
        images,
        specs,
        docs,
        tags,
        lastModified: new Date().toISOString()
      };
    }
    
    // Apply saved state to card
    function applyStateToCard(handle) {
      const state = productState[handle];
      if (!state) return;
      
      const card = document.getElementById('product-' + handle);
      
      if (state.title) {
        const titleInput = card.querySelector('[data-field="title"]');
        if (titleInput) titleInput.value = state.title;
      }
      
      if (state.notes) {
        const notesInput = card.querySelector('[data-field="notes"]');
        if (notesInput) notesInput.value = state.notes;
      }
      
      // Apply images
      if (state.images && state.images.length > 0) {
        rebuildImages(handle, state.images);
      }
    }
    
    // Image management
    function showAddImageModal(handle) {
      currentAddHandle = handle;
      document.getElementById('new-image-url').value = '';
      document.getElementById('new-image-alt').value = '';
      document.getElementById('add-image-modal').classList.add('show');
      document.getElementById('new-image-url').focus();
    }
    
    function confirmAddImage() {
      const url = document.getElementById('new-image-url').value.trim();
      const source = document.getElementById('new-image-source').value;
      const alt = document.getElementById('new-image-alt').value.trim();
      
      if (url && currentAddHandle) {
        addImageFromUrl(currentAddHandle, url, source, alt);
        closeModal('add-image-modal');
      }
    }
    
    function addImageFromUrl(handle, url, source, alt) {
      if (!url || !url.startsWith('http')) return;
      
      const container = document.getElementById('images-' + handle);
      const addSlot = container.querySelector('.add-slot');
      const currentCount = container.querySelectorAll('.image-slot:not(.add-slot)').length;
      
      if (currentCount >= 5) {
        showToast('Maximum 5 images allowed');
        return;
      }
      
      const slot = document.createElement('div');
      slot.className = 'image-slot';
      slot.dataset.position = currentCount + 1;
      slot.innerHTML = \`
        <img src="\${url}" loading="lazy" onerror="this.src='https://via.placeholder.com/120?text=Error'">
        <button class="remove-img" onclick="removeImage('\${handle}', \${currentCount})">×</button>
        <div class="img-source">\${source}</div>
      \`;
      
      container.insertBefore(slot, addSlot);
      updateImageCount(handle);
      markModified(handle);
    }
    
    function addImageFromCandidate(handle, url, source) {
      addImageFromUrl(handle, url, source);
    }
    
    function removeImage(handle, index) {
      const container = document.getElementById('images-' + handle);
      const slots = container.querySelectorAll('.image-slot:not(.add-slot)');
      if (slots[index]) {
        slots[index].remove();
        updateImageCount(handle);
        markModified(handle);
      }
    }
    
    function rebuildImages(handle, images) {
      const container = document.getElementById('images-' + handle);
      const addSlot = container.querySelector('.add-slot');
      
      // Remove existing
      container.querySelectorAll('.image-slot:not(.add-slot)').forEach(s => s.remove());
      
      // Add new
      images.forEach((img, i) => {
        const slot = document.createElement('div');
        slot.className = 'image-slot';
        slot.dataset.position = i + 1;
        slot.innerHTML = \`
          <img src="\${img.url}" loading="lazy">
          <button class="remove-img" onclick="removeImage('\${handle}', \${i})">×</button>
          <div class="img-source">\${img.source || 'saved'}</div>
        \`;
        container.insertBefore(slot, addSlot);
      });
      
      updateImageCount(handle);
    }
    
    function updateImageCount(handle) {
      const container = document.getElementById('images-' + handle);
      const count = container.querySelectorAll('.image-slot:not(.add-slot)').length;
      document.getElementById('imgcount-' + handle).textContent = count + '/5';
    }
    
    // Tags
    function addTag(handle, tag) {
      tag = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!tag) return;
      
      const container = document.getElementById('tags-' + handle);
      const input = container.querySelector('.tag-input');
      
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      span.onclick = () => { span.remove(); markModified(handle); };
      
      container.insertBefore(span, input);
      input.value = '';
      markModified(handle);
    }
    
    // Specs
    function addSpecField(handle) {
      const grid = document.getElementById('specs-' + handle);
      const name = prompt('Spec name:');
      if (!name) return;
      
      const label = document.createElement('label');
      label.textContent = name + ':';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.spec = name.toLowerCase().replace(/\\s+/g, '-');
      input.onchange = () => markModified(handle);
      
      grid.appendChild(label);
      grid.appendChild(input);
    }
    
    // Modal helpers
    function closeModal(id) {
      document.getElementById(id).classList.remove('show');
    }
    
    // Export/Import
    function exportAll() {
      const modified = {};
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('product:')) {
          const handle = key.replace('product:', '');
          modified[handle] = JSON.parse(localStorage.getItem(key));
        }
      });
      
      const data = {
        exportedAt: new Date().toISOString(),
        count: Object.keys(modified).length,
        products: modified
      };
      
      document.getElementById('export-data').value = JSON.stringify(data, null, 2);
      document.getElementById('export-modal').classList.add('show');
    }
    
    function downloadExport() {
      const data = document.getElementById('export-data').value;
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_edits_' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded!');
    }
    
    function copyExport() {
      document.getElementById('export-data').select();
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    }
    
    function importJson() {
      document.getElementById('import-file').click();
    }
    
    function handleImport(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.products) {
            Object.entries(data.products).forEach(([handle, state]) => {
              localStorage.setItem('product:' + handle, JSON.stringify(state));
              productState[handle] = state;
              const card = document.getElementById('product-' + handle);
              if (card) {
                card.classList.add('saved');
                applyStateToCard(handle);
              }
            });
            showToast('Imported ' + Object.keys(data.products).length + ' products');
            updateStats();
          }
        } catch(e) {
          showToast('Import error: ' + e.message);
        }
      };
      reader.readAsText(file);
    }
    
    // Save all modified
    function saveAllModified() {
      document.querySelectorAll('.product-card.modified').forEach(card => {
        saveProduct(card.dataset.handle);
      });
      showToast('Saved all modified products');
    }
    
    // Stats
    function updateStats() {
      const modified = document.querySelectorAll('.product-card.modified').length;
      const saved = document.querySelectorAll('.product-card.saved').length;
      
      document.getElementById('stat-modified').textContent = modified;
      document.getElementById('stat-saved').textContent = saved;
    }
    
    function showStats() {
      const total = document.querySelectorAll('.product-card').length;
      const saved = Object.keys(localStorage).filter(k => k.startsWith('product:')).length;
      alert(\`Total Products: \${total}\\nSaved in Browser: \${saved}\\n\\nLocalStorage usage: \${(JSON.stringify(localStorage).length / 1024).toFixed(1)} KB\`);
    }
    
    // Filters
    function applyFilters() {
      const search = document.getElementById('filter-search').value.toLowerCase();
      const status = document.getElementById('filter-status').value;
      const vendor = document.getElementById('filter-vendor').value;
      const images = document.getElementById('filter-images').value;
      
      document.querySelectorAll('.product-card').forEach(card => {
        const handle = card.dataset.handle;
        const title = card.querySelector('.title-input')?.value.toLowerCase() || '';
        const cardVendor = card.querySelector('.vendor-select')?.value || '';
        const imgCount = card.querySelectorAll('.image-slot:not(.add-slot)').length;
        
        let show = true;
        
        if (search && !title.includes(search) && !handle.includes(search)) show = false;
        if (status === 'modified' && !card.classList.contains('modified')) show = false;
        if (status === 'saved' && !card.classList.contains('saved')) show = false;
        if (vendor && cardVendor !== vendor) show = false;
        if (images === 'none' && imgCount > 0) show = false;
        if (images === 'some' && imgCount === 0) show = false;
        
        card.style.display = show ? '' : 'none';
      });
    }
    
    // Track changes
    document.addEventListener('input', (e) => {
      const card = e.target.closest('.product-card');
      if (card && (e.target.matches('[data-field]') || e.target.matches('[data-spec]') || e.target.matches('[data-doc]'))) {
        markModified(card.dataset.handle);
      }
    });
    
    // Initialize
    initState();
  </script>
</body>
</html>`;
}

function calculateCompleteness(product) {
  let score = 0;
  if (product.title) score += 15;
  if (product.description && product.description.length > 100) score += 25;
  if (product.vendor) score += 10;
  if (product.images && product.images.length > 0) score += 20;
  if (product.images && product.images.length >= 3) score += 10;
  if (product.type) score += 10;
  if (product.tags) score += 10;
  return Math.min(100, score);
}

// Main
function main() {
  console.log('═'.repeat(70));
  console.log('🛠️ PRODUCT EDITOR GENERATOR - EDIT-001');
  console.log('═'.repeat(70));
  console.log('');
  
  // Load product data
  console.log('📚 Loading product data...');
  const products = loadProductData();
  console.log(`   Loaded ${products.size} products\n`);
  
  // Generate HTML
  console.log('🔧 Generating editor...');
  const html = generateHTML(products);
  
  fs.writeFileSync(OUTPUT_HTML, html);
  console.log(`✅ Editor saved: ${OUTPUT_HTML}`);
  console.log('');
  console.log('📌 Open in browser to start editing products.');
  console.log('   - Changes save to browser localStorage');
  console.log('   - Export JSON when done');
  console.log('   - Run apply_editor_changes.js to push to Shopify');
  console.log('═'.repeat(70));
}

main();
