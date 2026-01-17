/**
 * Generate Image Review Page
 * IMAGE-003 Phase 3: Human Review Interface
 * 
 * Creates an HTML page for reviewing and approving image replacements.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CANDIDATES_FILE = './outputs/image_candidates.json';
const OUTPUT_HTML = './outputs/image_review.html';
const OUTPUT_HTML_ALL = './outputs/image_review_all.html';
const OUTPUT_APPROVED = './outputs/image_approved.json';

// Main
function main() {
  const args = process.argv.slice(2);
  const includeAll = args.includes('--all');
  
  console.log('═'.repeat(70));
  console.log('📝 IMAGE REVIEW PAGE GENERATOR - Phase 3');
  console.log('═'.repeat(70));
  console.log('');
  
  // Load candidates
  if (!fs.existsSync(CANDIDATES_FILE)) {
    console.error('❌ Candidates file not found. Run find_replacement_images.js first.');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf-8'));
  const candidates = data.candidates;
  
  let reviewable;
  let outputFile;
  
  if (includeAll) {
    // Include ALL products (even those with only search URLs)
    reviewable = Object.entries(candidates)
      .sort((a, b) => {
        // Sort by: has candidates first, then by score
        const aHas = a[1].candidates.some(c => !c.source.includes('search')) ? 1 : 0;
        const bHas = b[1].candidates.some(c => !c.source.includes('search')) ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        const aScore = a[1].bestCandidate?.score || 0;
        const bScore = b[1].bestCandidate?.score || 0;
        return bScore - aScore;
      });
    outputFile = OUTPUT_HTML_ALL;
    console.log(`📋 Including ALL ${reviewable.length} products (for manual URL entry)\n`);
  } else {
    // Filter to only products with direct images (not just search URLs)
    reviewable = Object.entries(candidates)
      .filter(([_, d]) => d.candidates.some(c => !c.source.includes('search')))
      .sort((a, b) => {
        const aScore = a[1].bestCandidate?.score || 0;
        const bScore = b[1].bestCandidate?.score || 0;
        return bScore - aScore;
      });
    outputFile = OUTPUT_HTML;
    console.log(`📋 Found ${reviewable.length} products with image candidates to review\n`);
  }
  
  console.log(`📋 Found ${reviewable.length} products with image candidates to review\n`);
  
  // Generate HTML
  const html = generateHTML(reviewable);
  
  fs.writeFileSync(outputFile, html);
  console.log(`✅ Review page saved: ${outputFile}`);
  console.log('');
  console.log('📌 Open this file in a browser to review images.');
  console.log('   Check the images you want to use, then click "Export Approved".');
  if (!includeAll) {
    console.log('');
    console.log('💡 Use --all flag to generate page with ALL products for manual URL entry');
  }
  console.log('═'.repeat(70));
}

function generateHTML(reviewable) {
  const productCards = reviewable.map(([handle, data]) => {
    const directCandidates = data.candidates
      .filter(c => !c.source.includes('search'))
      .slice(0, 3);
    
    // Get search URLs for manual lookup
    const searchUrls = data.candidates
      .filter(c => c.source.includes('search'))
      .slice(0, 3);
    
    const candidateImages = directCandidates.map((c, i) => `
      <div class="candidate" data-url="${escapeHtml(c.url)}" data-source="${escapeHtml(c.source)}">
        <input type="radio" name="img-${handle}" id="img-${handle}-${i}" value="${escapeHtml(c.url)}" data-source="${escapeHtml(c.source)}" ${i === 0 ? 'checked' : ''}>
        <label for="img-${handle}-${i}">
          <img src="${escapeHtml(c.url)}" loading="lazy" onerror="this.src='https://via.placeholder.com/200?text=Error'">
          <div class="score">Score: ${c.score}</div>
          <div class="source">${c.source}</div>
        </label>
      </div>
    `).join('');
    
    const searchLinks = searchUrls.map(s => 
      `<a href="${escapeHtml(s.url)}" target="_blank" class="search-link">${s.note || s.source}</a>`
    ).join('');
    
    const currentImage = data.currentUrl 
      ? `<img src="${escapeHtml(data.currentUrl)}" loading="lazy" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">`
      : '<div class="no-image">No Image</div>';
    
    return `
      <div class="product-card" data-handle="${handle}" data-title="${escapeHtml(data.title)}" data-vendor="${escapeHtml(data.vendor || '')}">
        <div class="product-header">
          <input type="checkbox" class="approve-checkbox" id="approve-${handle}" checked>
          <label for="approve-${handle}">
            <strong class="product-title">${escapeHtml(data.title)}</strong>
          </label>
          <button class="btn-copy" onclick="copyTitle('${escapeHtml(data.title).replace(/'/g, "\\'")}', this)" title="Copy title for searching">📋</button>
          <span class="vendor">${escapeHtml(data.vendor || 'Unknown')}</span>
          <span class="handle-display">${handle}</span>
        </div>
        <div class="images-row">
          <div class="current-image">
            <div class="label">Current (Score: ${data.currentScore})</div>
            ${currentImage}
          </div>
          <div class="arrow">→</div>
          <div class="candidates">
            <div class="label">Replacement Options</div>
            <div class="candidates-grid">
              ${candidateImages}
              <div class="candidate custom-candidate">
                <input type="radio" name="img-${handle}" id="img-${handle}-custom" value="" data-source="manual">
                <label for="img-${handle}-custom">
                  <div class="custom-input-wrapper">
                    <div class="custom-preview" id="preview-${handle}">
                      <span>+ Add URL</span>
                    </div>
                    <input type="text" class="custom-url-input" id="url-${handle}" placeholder="Paste image URL..." onchange="updateCustomPreview('${handle}')">
                    <select class="source-select" id="source-${handle}">
                      <option value="manual">Manual</option>
                      <option value="manufacturer">Manufacturer</option>
                      <option value="amazon">Amazon</option>
                      <option value="htg-supply">HTG Supply</option>
                      <option value="grow-generation">Grow Generation</option>
                      <option value="google">Google Images</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="search-links">
          <span class="label">🔍 Quick Search:</span>
          ${searchLinks}
          <a href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(data.title + ' ' + (data.vendor || ''))}" target="_blank" class="search-link">Google Images</a>
          <a href="https://www.amazon.com/s?k=${encodeURIComponent(data.title)}" target="_blank" class="search-link">Amazon</a>
        </div>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Replacement Review - H-Moon Hydro</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: #1a1a2e;
      color: white;
      padding: 20px;
      margin: -20px -20px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .header h1 { margin: 0; font-size: 1.5em; }
    .stats { 
      display: flex; 
      gap: 15px;
      font-size: 14px;
    }
    .stats span { 
      background: rgba(255,255,255,0.1); 
      padding: 5px 10px; 
      border-radius: 4px; 
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      font-size: 13px;
    }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-primary:hover { background: #45a049; }
    .btn-secondary { background: #2196F3; color: white; }
    .btn-secondary:hover { background: #1976D2; }
    .btn-danger { background: #f44336; color: white; }
    .btn-copy {
      background: #607D8B;
      color: white;
      padding: 4px 8px;
      font-size: 12px;
      margin-left: 5px;
    }
    .btn-copy:hover { background: #455A64; }
    .btn-copy.copied { background: #4CAF50; }
    
    .filters {
      background: white;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filters label { font-weight: 500; }
    .filters select, .filters input {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    
    .product-card {
      background: white;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .product-card.rejected {
      opacity: 0.5;
    }
    .product-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
      flex-wrap: wrap;
    }
    .product-title {
      cursor: pointer;
    }
    .product-title:hover {
      color: #2196F3;
    }
    .vendor {
      background: #e3f2fd;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .handle-display {
      margin-left: auto;
      font-size: 11px;
      color: #999;
      font-family: monospace;
    }
    .images-row {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
    }
    .current-image {
      text-align: center;
      flex-shrink: 0;
    }
    .current-image img {
      width: 100px;
      height: 100px;
      object-fit: contain;
      border: 2px solid #ddd;
      border-radius: 4px;
    }
    .no-image {
      width: 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eee;
      border-radius: 4px;
      font-size: 12px;
      color: #999;
    }
    .arrow {
      font-size: 24px;
      color: #4CAF50;
      align-self: center;
    }
    .candidates {
      flex: 1;
      min-width: 300px;
    }
    .candidates-grid {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .candidate {
      text-align: center;
    }
    .candidate input[type="radio"] {
      display: none;
    }
    .candidate label {
      display: block;
      cursor: pointer;
      border: 3px solid transparent;
      border-radius: 8px;
      padding: 5px;
      transition: all 0.2s;
    }
    .candidate input:checked + label {
      border-color: #4CAF50;
      background: #e8f5e9;
    }
    .candidate img {
      width: 150px;
      height: 150px;
      object-fit: contain;
      border-radius: 4px;
    }
    .score {
      font-size: 12px;
      font-weight: bold;
      color: #4CAF50;
      margin-top: 5px;
    }
    .source {
      font-size: 11px;
      color: #666;
    }
    .label {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }
    
    /* Custom URL input */
    .custom-candidate label {
      border: 3px dashed #ccc;
    }
    .custom-candidate input:checked + label {
      border-color: #4CAF50;
      border-style: solid;
    }
    .custom-input-wrapper {
      width: 150px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .custom-preview {
      width: 150px;
      height: 150px;
      background: #f5f5f5;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 14px;
      overflow: hidden;
    }
    .custom-preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .custom-url-input {
      width: 100%;
      padding: 5px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
    }
    .source-select {
      width: 100%;
      padding: 4px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
    }
    
    /* Search links */
    .search-links {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-link {
      background: #f0f0f0;
      padding: 4px 10px;
      border-radius: 4px;
      text-decoration: none;
      color: #333;
      font-size: 12px;
    }
    .search-link:hover {
      background: #e0e0e0;
    }
    
    /* Toast notification */
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
      z-index: 1000;
    }
    .toast.show {
      display: block;
      animation: fadeIn 0.3s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, 20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    
    #export-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    #export-modal.show { display: flex; }
    .modal-content {
      background: white;
      padding: 30px;
      border-radius: 8px;
      max-width: 800px;
      width: 90%;
      max-height: 80vh;
      overflow: auto;
    }
    .modal-content h2 { margin-top: 0; }
    .modal-content textarea {
      width: 100%;
      height: 300px;
      font-family: monospace;
      font-size: 12px;
    }
    .modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🖼️ Image Replacement Review</h1>
    <div class="stats">
      <span>📊 Total: <strong id="total-count">${reviewable.length}</strong></span>
      <span>✅ Approved: <strong id="approved-count">${reviewable.length}</strong></span>
      <span>📝 Custom URLs: <strong id="custom-count">0</strong></span>
    </div>
    <div class="actions">
      <button class="btn-secondary" onclick="selectAll()">Select All</button>
      <button class="btn-danger" onclick="deselectAll()">Deselect All</button>
      <button class="btn-secondary" onclick="showOnlyNoImage()">Show No Image</button>
      <button class="btn-primary" onclick="exportApproved()">Export Approved ➜</button>
    </div>
  </div>
  
  <div class="filters">
    <label>Filter by Vendor:</label>
    <select id="vendor-filter" onchange="applyFilters()">
      <option value="">All Vendors</option>
    </select>
    <label>Min Score:</label>
    <input type="number" id="score-filter" value="0" min="0" max="100" onchange="applyFilters()">
    <label>Search:</label>
    <input type="text" id="search-filter" placeholder="Search products..." oninput="applyFilters()">
  </div>
  
  <div id="products-container">
    ${productCards}
  </div>
  
  <div class="toast" id="toast"></div>
  
  <div id="export-modal">
    <div class="modal-content">
      <h2>📦 Export Approved Images</h2>
      <p>Copy this JSON and save to <code>outputs/image_approved.json</code>, or download directly.</p>
      <textarea id="export-json" readonly></textarea>
      <div class="modal-actions">
        <button class="btn-primary" onclick="copyToClipboard()">📋 Copy to Clipboard</button>
        <button class="btn-secondary" onclick="downloadJson()">💾 Download JSON</button>
        <button onclick="closeModal()">Close</button>
      </div>
    </div>
  </div>
  
  <script>
    // Toast notification
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    // Copy title to clipboard
    function copyTitle(title, btn) {
      navigator.clipboard.writeText(title).then(() => {
        btn.classList.add('copied');
        btn.textContent = '✓';
        showToast('Copied: ' + title);
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = '📋';
        }, 1500);
      });
    }
    
    // Update custom preview when URL is entered
    function updateCustomPreview(handle) {
      const input = document.getElementById('url-' + handle);
      const preview = document.getElementById('preview-' + handle);
      const radio = document.getElementById('img-' + handle + '-custom');
      
      if (input.value && input.value.startsWith('http')) {
        preview.innerHTML = '<img src="' + input.value + '" onerror="this.parentElement.innerHTML=\\'<span>Invalid URL</span>\\'">';
        radio.value = input.value;
        radio.checked = true;
        updateCounts();
      } else {
        preview.innerHTML = '<span>+ Add URL</span>';
        radio.value = '';
      }
    }
    
    // Populate vendor filter
    const vendors = new Set();
    document.querySelectorAll('.vendor').forEach(el => vendors.add(el.textContent));
    const vendorSelect = document.getElementById('vendor-filter');
    [...vendors].sort().forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      vendorSelect.appendChild(opt);
    });
    
    // Update counts
    function updateCounts() {
      const approved = document.querySelectorAll('.approve-checkbox:checked').length;
      const customUrls = document.querySelectorAll('.custom-url-input').length;
      let customFilled = 0;
      document.querySelectorAll('.custom-url-input').forEach(input => {
        if (input.value && input.value.startsWith('http')) customFilled++;
      });
      document.getElementById('approved-count').textContent = approved;
      document.getElementById('custom-count').textContent = customFilled;
    }
    
    document.querySelectorAll('.approve-checkbox').forEach(cb => {
      cb.addEventListener('change', function() {
        this.closest('.product-card').classList.toggle('rejected', !this.checked);
        updateCounts();
      });
    });
    
    function selectAll() {
      document.querySelectorAll('.product-card:not([style*="display: none"]) .approve-checkbox').forEach(cb => {
        cb.checked = true;
        cb.closest('.product-card').classList.remove('rejected');
      });
      updateCounts();
    }
    
    function deselectAll() {
      document.querySelectorAll('.approve-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('.product-card').classList.add('rejected');
      });
      updateCounts();
    }
    
    function showOnlyNoImage() {
      document.querySelectorAll('.product-card').forEach(card => {
        const hasNoImage = card.querySelector('.no-image') !== null;
        card.style.display = hasNoImage ? '' : 'none';
      });
    }
    
    function applyFilters() {
      const vendor = document.getElementById('vendor-filter').value;
      const minScore = parseInt(document.getElementById('score-filter').value) || 0;
      const search = document.getElementById('search-filter').value.toLowerCase();
      
      document.querySelectorAll('.product-card').forEach(card => {
        const cardVendor = card.querySelector('.vendor').textContent;
        const scoreEl = card.querySelector('.score');
        const score = scoreEl ? parseInt(scoreEl.textContent.replace('Score: ', '') || 0) : 0;
        const title = card.dataset.title.toLowerCase();
        const handle = card.dataset.handle.toLowerCase();
        
        const vendorMatch = !vendor || cardVendor === vendor;
        const scoreMatch = score >= minScore;
        const searchMatch = !search || title.includes(search) || handle.includes(search);
        
        card.style.display = vendorMatch && scoreMatch && searchMatch ? '' : 'none';
      });
    }
    
    function exportApproved() {
      const approved = [];
      document.querySelectorAll('.product-card').forEach(card => {
        const checkbox = card.querySelector('.approve-checkbox');
        if (!checkbox.checked) return;
        
        const handle = card.dataset.handle;
        const title = card.dataset.title;
        const vendor = card.dataset.vendor;
        const selectedRadio = card.querySelector('input[type="radio"]:checked');
        if (!selectedRadio || !selectedRadio.value) return;
        
        // Get source - either from data attribute or from source select
        let source = selectedRadio.dataset.source || 'scraped';
        const sourceSelect = card.querySelector('.source-select');
        if (source === 'manual' && sourceSelect) {
          source = sourceSelect.value;
        }
        
        approved.push({
          handle,
          title,
          vendor,
          imageUrl: selectedRadio.value,
          source
        });
      });
      
      const json = JSON.stringify({ 
        generatedAt: new Date().toISOString(),
        count: approved.length,
        images: approved 
      }, null, 2);
      
      document.getElementById('export-json').value = json;
      document.getElementById('export-modal').classList.add('show');
    }
    
    function copyToClipboard() {
      const textarea = document.getElementById('export-json');
      textarea.select();
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    }
    
    function downloadJson() {
      const json = document.getElementById('export-json').value;
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'image_approved.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded image_approved.json');
    }
    
    function closeModal() {
      document.getElementById('export-modal').classList.remove('show');
    }
    
    // Initialize counts
    updateCounts();
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main();
