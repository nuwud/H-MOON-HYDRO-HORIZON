/**
 * buildCatalogQAReport.ts
 * 
 * Generates a comprehensive QA report for the catalog
 * 
 * Outputs:
 *   - catalog_qa_report.md    (Human-readable summary)
 *   - catalog_qa_issues.csv   (Actionable issue list)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  primary_category: string;
  secondary_categories: string;
  price: string;
  compare_at_price: string;
  cost: string;
  inventory_qty: string;
  images: string;
  description: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
  source: string;
  needs_review: string;
}

interface QAIssue {
  handle: string;
  title: string;
  issue_type: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  field: string;
  current_value: string;
  suggested_action: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function escapeCsvField(field: string): string {
  if (!field) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Data
// ─────────────────────────────────────────────────────────────────────────────

function loadCatalog(): CatalogProduct[] {
  const path = resolve(CSV_DIR, 'master_catalog_index.csv');
  if (!existsSync(path)) {
    console.error('❌ master_catalog_index.csv not found');
    process.exit(1);
  }
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const products: CatalogProduct[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    products.push(row as unknown as CatalogProduct);
  }
  
  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// QA Checks
// ─────────────────────────────────────────────────────────────────────────────

function runQAChecks(products: CatalogProduct[]): QAIssue[] {
  const issues: QAIssue[] = [];
  
  for (const product of products) {
    // Critical: Missing title
    if (!product.title?.trim()) {
      issues.push({
        handle: product.handle,
        title: product.title || '(empty)',
        issue_type: 'missing_title',
        severity: 'critical',
        field: 'title',
        current_value: '',
        suggested_action: 'Add product title',
      });
    }
    
    // Critical: Missing handle
    if (!product.handle?.trim()) {
      issues.push({
        handle: product.handle || '(empty)',
        title: product.title,
        issue_type: 'missing_handle',
        severity: 'critical',
        field: 'handle',
        current_value: '',
        suggested_action: 'Generate handle from title',
      });
    }
    
    // Major: No price
    if (!product.price || parseFloat(product.price) <= 0) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'missing_price',
        severity: 'major',
        field: 'price',
        current_value: product.price || '',
        suggested_action: 'Add price from inventory or set draft status',
      });
    }
    
    // Major: Unknown brand
    if (!product.brand || product.brand === 'Unknown') {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'unknown_brand',
        severity: 'major',
        field: 'brand',
        current_value: product.brand || '',
        suggested_action: 'Identify brand from title or set to H Moon Hydro',
      });
    }
    
    // Major: No category
    if (!product.primary_category?.trim()) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'missing_category',
        severity: 'major',
        field: 'primary_category',
        current_value: '',
        suggested_action: 'Assign to appropriate category',
      });
    }
    
    // Minor: No images
    if (!product.images?.trim()) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'missing_images',
        severity: 'minor',
        field: 'images',
        current_value: '',
        suggested_action: 'Add product images',
      });
    }
    
    // Minor: No description
    if (!product.description?.trim()) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'missing_description',
        severity: 'minor',
        field: 'description',
        current_value: '',
        suggested_action: 'Add product description',
      });
    }
    
    // Info: No SKU
    if (!product.sku?.trim()) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'missing_sku',
        severity: 'info',
        field: 'sku',
        current_value: '',
        suggested_action: 'Will be auto-generated if needed',
      });
    }
    
    // Info: Price is suspiciously low
    const price = parseFloat(product.price || '0');
    if (price > 0 && price < 1) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'suspicious_price',
        severity: 'major',
        field: 'price',
        current_value: product.price,
        suggested_action: 'Verify price is correct (under $1)',
      });
    }
    
    // Info: Price is very high
    if (price > 5000) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'high_price',
        severity: 'info',
        field: 'price',
        current_value: product.price,
        suggested_action: 'Verify high-value item pricing',
      });
    }
    
    // Check for HTML in title
    if (/<[^>]+>/.test(product.title || '')) {
      issues.push({
        handle: product.handle,
        title: product.title,
        issue_type: 'html_in_title',
        severity: 'major',
        field: 'title',
        current_value: product.title.substring(0, 50),
        suggested_action: 'Strip HTML tags from title',
      });
    }
  }
  
  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate Report
// ─────────────────────────────────────────────────────────────────────────────

function generateMarkdownReport(products: CatalogProduct[], issues: QAIssue[]): string {
  const lines: string[] = [];
  
  lines.push('# H Moon Hydro Catalog QA Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  
  // Overall stats
  lines.push('## 📊 Overall Statistics');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Products | ${products.length} |`);
  lines.push(`| Total Issues | ${issues.length} |`);
  lines.push(`| Critical Issues | ${issues.filter(i => i.severity === 'critical').length} |`);
  lines.push(`| Major Issues | ${issues.filter(i => i.severity === 'major').length} |`);
  lines.push(`| Minor Issues | ${issues.filter(i => i.severity === 'minor').length} |`);
  lines.push('');
  
  // Field coverage
  lines.push('## 📋 Field Coverage');
  lines.push('');
  const coverage = {
    title: products.filter(p => p.title?.trim()).length,
    handle: products.filter(p => p.handle?.trim()).length,
    sku: products.filter(p => p.sku?.trim()).length,
    brand: products.filter(p => p.brand && p.brand !== 'Unknown').length,
    category: products.filter(p => p.primary_category?.trim()).length,
    price: products.filter(p => parseFloat(p.price || '0') > 0).length,
    images: products.filter(p => p.images?.trim()).length,
    description: products.filter(p => p.description?.trim()).length,
  };
  
  lines.push(`| Field | Coverage | Percentage |`);
  lines.push(`|-------|----------|------------|`);
  for (const [field, count] of Object.entries(coverage)) {
    const pct = ((count / products.length) * 100).toFixed(1);
    const bar = pct >= '80' ? '🟢' : pct >= '50' ? '🟡' : '🔴';
    lines.push(`| ${field} | ${count}/${products.length} | ${bar} ${pct}% |`);
  }
  lines.push('');
  
  // Category breakdown
  lines.push('## 🏷️ Category Distribution');
  lines.push('');
  const categories = new Map<string, number>();
  for (const p of products) {
    const cat = p.primary_category || '(none)';
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }
  const sortedCats = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  
  lines.push(`| Category | Products |`);
  lines.push(`|----------|----------|`);
  for (const [cat, count] of sortedCats.slice(0, 15)) {
    lines.push(`| ${cat} | ${count} |`);
  }
  if (sortedCats.length > 15) {
    lines.push(`| ... | (${sortedCats.length - 15} more) |`);
  }
  lines.push('');
  
  // Brand breakdown
  lines.push('## 🏢 Top Brands');
  lines.push('');
  const brands = new Map<string, number>();
  for (const p of products) {
    const brand = p.brand || 'Unknown';
    brands.set(brand, (brands.get(brand) || 0) + 1);
  }
  const sortedBrands = [...brands.entries()].sort((a, b) => b[1] - a[1]);
  
  lines.push(`| Brand | Products |`);
  lines.push(`|-------|----------|`);
  for (const [brand, count] of sortedBrands.slice(0, 15)) {
    lines.push(`| ${brand} | ${count} |`);
  }
  lines.push('');
  
  // Issue breakdown
  lines.push('## ⚠️ Issues by Type');
  lines.push('');
  const issueTypes = new Map<string, number>();
  for (const issue of issues) {
    issueTypes.set(issue.issue_type, (issueTypes.get(issue.issue_type) || 0) + 1);
  }
  const sortedIssues = [...issueTypes.entries()].sort((a, b) => b[1] - a[1]);
  
  lines.push(`| Issue Type | Count | Severity |`);
  lines.push(`|------------|-------|----------|`);
  for (const [type, count] of sortedIssues) {
    const sample = issues.find(i => i.issue_type === type);
    const sev = sample?.severity || 'info';
    const icon = sev === 'critical' ? '🔴' : sev === 'major' ? '🟠' : sev === 'minor' ? '🟡' : '⚪';
    lines.push(`| ${type} | ${count} | ${icon} ${sev} |`);
  }
  lines.push('');
  
  // Source breakdown
  lines.push('## 📥 Data Sources');
  lines.push('');
  const sources = new Map<string, number>();
  for (const p of products) {
    const src = p.source || 'unknown';
    sources.set(src, (sources.get(src) || 0) + 1);
  }
  
  lines.push(`| Source | Products |`);
  lines.push(`|--------|----------|`);
  for (const [src, count] of [...sources.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${src} | ${count} |`);
  }
  lines.push('');
  
  // Publish readiness
  lines.push('## 🚀 Publish Readiness');
  lines.push('');
  const ready = products.filter(p => 
    p.title?.trim() && 
    p.handle?.trim() && 
    parseFloat(p.price || '0') > 0
  );
  const withImages = ready.filter(p => p.images?.trim());
  const withDesc = ready.filter(p => p.description?.trim());
  const knownBrand = ready.filter(p => p.brand && p.brand !== 'Unknown');
  
  lines.push(`| Readiness Level | Products |`);
  lines.push(`|-----------------|----------|`);
  lines.push(`| Has title + handle + price (publishable) | ${ready.length} (${((ready.length/products.length)*100).toFixed(1)}%) |`);
  lines.push(`| + Has images | ${withImages.length} (${((withImages.length/products.length)*100).toFixed(1)}%) |`);
  lines.push(`| + Has description | ${withDesc.length} (${((withDesc.length/products.length)*100).toFixed(1)}%) |`);
  lines.push(`| + Known brand | ${knownBrand.length} (${((knownBrand.length/products.length)*100).toFixed(1)}%) |`);
  lines.push('');
  
  // Top offenders (most issues)
  lines.push('## 🔍 Products with Most Issues');
  lines.push('');
  const productIssues = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.handle || issue.title;
    productIssues.set(key, (productIssues.get(key) || 0) + 1);
  }
  const topOffenders = [...productIssues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  lines.push(`| Handle | Issue Count |`);
  lines.push(`|--------|-------------|`);
  for (const [handle, count] of topOffenders) {
    lines.push(`| ${handle.substring(0, 50)} | ${count} |`);
  }
  lines.push('');
  
  // Recommendations
  lines.push('## 💡 Recommendations');
  lines.push('');
  lines.push('### Priority 1: Critical Fixes');
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  if (criticalCount > 0) {
    lines.push(`- Fix ${criticalCount} critical issues (missing titles/handles)`);
  } else {
    lines.push('- ✅ No critical issues!');
  }
  lines.push('');
  
  lines.push('### Priority 2: Merchandising');
  const unknownBrands = products.filter(p => !p.brand || p.brand === 'Unknown').length;
  if (unknownBrands > 0) {
    lines.push(`- Identify brands for ${unknownBrands} products`);
  }
  const noPrice = products.filter(p => !parseFloat(p.price || '0')).length;
  if (noPrice > 0) {
    lines.push(`- Add pricing for ${noPrice} products`);
  }
  lines.push('');
  
  lines.push('### Priority 3: Content');
  const noImages = products.filter(p => !p.images?.trim()).length;
  const noDesc = products.filter(p => !p.description?.trim()).length;
  if (noImages > 0) {
    lines.push(`- Add images to ${noImages} products`);
  }
  if (noDesc > 0) {
    lines.push(`- Add descriptions to ${noDesc} products`);
  }
  lines.push('');
  
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Generating Catalog QA Report');
  console.log('================================\n');
  
  // Load data
  console.log('📂 Loading catalog...');
  const products = loadCatalog();
  console.log(`   Loaded ${products.length} products\n`);
  
  // Run QA checks
  console.log('🔍 Running QA checks...');
  const issues = runQAChecks(products);
  console.log(`   Found ${issues.length} issues\n`);
  
  // Generate markdown report
  console.log('📝 Generating report...');
  const markdown = generateMarkdownReport(products, issues);
  const mdPath = resolve(CSV_DIR, 'catalog_qa_report.md');
  writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`✅ Written: CSVs/catalog_qa_report.md`);
  
  // Write issues CSV
  const issueHeaders = ['handle', 'title', 'issue_type', 'severity', 'field', 'current_value', 'suggested_action'];
  const csvLines = [
    issueHeaders.join(','),
    ...issues.map(i => issueHeaders.map(h => escapeCsvField(i[h as keyof QAIssue])).join(','))
  ];
  const csvPath = resolve(CSV_DIR, 'catalog_qa_issues.csv');
  writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Written: CSVs/catalog_qa_issues.csv (${issues.length} issues)`);
  
  // Print summary
  console.log('\n══════════════════════════════════════════════════');
  console.log('📈 QA SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major = issues.filter(i => i.severity === 'major').length;
  const minor = issues.filter(i => i.severity === 'minor').length;
  
  console.log(`🔴 Critical: ${critical}`);
  console.log(`🟠 Major: ${major}`);
  console.log(`🟡 Minor: ${minor}`);
  console.log(`⚪ Info: ${issues.length - critical - major - minor}`);
  
  const ready = products.filter(p => 
    p.title?.trim() && 
    p.handle?.trim() && 
    parseFloat(p.price || '0') > 0
  ).length;
  
  console.log(`\n🚀 Publish Ready: ${ready}/${products.length} (${((ready/products.length)*100).toFixed(1)}%)`);
  
  console.log('\n✅ QA Report complete!');
}

main().catch(console.error);
