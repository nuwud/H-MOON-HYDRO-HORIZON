#!/usr/bin/env npx tsx
/**
 * Build Category Index Draft
 * 
 * PURPOSE:
 * - Read ALL master_*.csv files
 * - Aggregate categories for each product
 * - Detect conflicts (multi-category products)
 * - Assign PRIMARY CATEGORY using strict priority rules
 * - Quarantine malformed rows
 * 
 * OUTPUTS:
 * - CSVs/category_conflicts.csv
 * - CSVs/category_index_draft.csv
 * - CSVs/malformed_rows.csv
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  initBrandRegistry,
  detectBrandNormalized,
  isValidBrand,
} from '../utils/brandRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Category Priority (strict order - higher = more specific/important)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRIORITY: Record<string, number> = {
  nutrients: 100,
  grow_media: 95,
  seeds: 90,
  propagation: 85,
  irrigation: 80,
  ph_meters: 75,
  environmental_monitors: 70,
  controllers: 65,
  grow_lights: 60,
  lights: 60, // alias
  hid_bulbs: 55,
  airflow: 50,
  odor_control: 45,
  water_filtration: 40,
  containers: 35,
  containers_pots: 35, // alias
  harvesting: 30,
  trimming: 25,
  pest_control: 20,
  co2: 15,
  grow_room_materials: 10,
  grow_tents: 10, // alias
  tents: 10, // alias
  vent_accessories: 10, // alias
  books: 5,
  books_educational: 5, // alias
  electrical_supplies: 3,
  extraction: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MasterRow {
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  category: string;
  source_file: string;
  raw_line?: string;
}

interface ProductAggregate {
  key: string;
  sku: string;
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  categories: string[];
  source_files: string[];
  primary_category: string;
  is_conflict: boolean;
  brand_invalid_reason: string;
}

interface MalformedRow {
  source_file: string;
  line_number: number;
  raw_line: string;
  issue: string;
  suggested_fix: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing (robust, handles edge cases)
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function detectMalformedRow(
  line: string,
  lineNumber: number,
  headers: string[],
  sourceFile: string
): MalformedRow | null {
  const values = parseCsvLine(line);

  // Check: field count mismatch
  if (values.length !== headers.length) {
    return {
      source_file: sourceFile,
      line_number: lineNumber,
      raw_line: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
      issue: `Field count mismatch: expected ${headers.length}, got ${values.length}`,
      suggested_fix: 'Check for unescaped quotes or commas in field values',
    };
  }

  // Check: title is empty or garbage
  const titleIndex = headers.indexOf('title');
  if (titleIndex >= 0) {
    const title = values[titleIndex];
    if (!title || title.length < 2) {
      return {
        source_file: sourceFile,
        line_number: lineNumber,
        raw_line: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
        issue: 'Empty or minimal title',
        suggested_fix: 'Populate title from handle or skip row',
      };
    }
    // Check for HTML/garbage in title
    if (/<[^>]+>/.test(title) || /^\s*[,\s]+\s*$/.test(title)) {
      return {
        source_file: sourceFile,
        line_number: lineNumber,
        raw_line: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
        issue: 'Title contains HTML or garbage characters',
        suggested_fix: 'Clean HTML tags from title field',
      };
    }
  }

  // Check: handle is empty
  const handleIndex = headers.indexOf('handle');
  if (handleIndex >= 0) {
    const handle = values[handleIndex];
    if (!handle || handle.length < 2) {
      return {
        source_file: sourceFile,
        line_number: lineNumber,
        raw_line: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
        issue: 'Empty or minimal handle',
        suggested_fix: 'Generate handle from title or skip row',
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read Master CSV Files
// ─────────────────────────────────────────────────────────────────────────────

function readMasterCsv(filePath: string): { rows: MasterRow[]; malformed: MalformedRow[] } {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const sourceFile = basename(filePath);
  
  if (lines.length < 2) {
    return { rows: [], malformed: [] };
  }

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows: MasterRow[] = [];
  const malformed: MalformedRow[] = [];

  // Extract category from filename: master_CATEGORY.csv
  const categoryMatch = sourceFile.match(/^master_(.+)\.csv$/);
  const category = categoryMatch ? categoryMatch[1] : 'unknown';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for malformed
    const malformedCheck = detectMalformedRow(line, i + 1, headers, sourceFile);
    if (malformedCheck) {
      malformed.push(malformedCheck);
      continue;
    }

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    rows.push({
      sku: row.sku || row.id || '',
      handle: row.handle || '',
      title: row.title || row.name || '',
      brand: row.brand || '',
      vendor: row.vendor || '',
      category,
      source_file: sourceFile,
      raw_line: line,
    });
  }

  return { rows, malformed };
}

function findMasterFiles(): string[] {
  const files = readdirSync(CSV_DIR);
  return files
    .filter(f => f.startsWith('master_') && f.endsWith('.csv'))
    .map(f => resolve(CSV_DIR, f));
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate Product Key (for deduplication)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 50);
}

function generateProductKey(row: MasterRow): string {
  // Priority: SKU > Handle > Normalized Title
  if (row.sku && row.sku.length > 2 && !row.sku.startsWith('hmh')) {
    return `sku:${row.sku}`;
  }
  if (row.handle && row.handle.length > 2) {
    return `handle:${row.handle}`;
  }
  if (row.title && row.title.length > 2) {
    return `title:${normalizeTitle(row.title)}`;
  }
  return `raw:${row.sku || row.handle || row.title}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign Primary Category
// ─────────────────────────────────────────────────────────────────────────────

function assignPrimaryCategory(categories: string[]): string {
  if (categories.length === 0) return 'uncategorized';
  if (categories.length === 1) return categories[0];

  // Sort by priority (descending) and return highest
  const sorted = [...categories].sort((a, b) => {
    const priorityA = CATEGORY_PRIORITY[a] ?? 0;
    const priorityB = CATEGORY_PRIORITY[b] ?? 0;
    return priorityB - priorityA;
  });

  return sorted[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateAndNormalizeBrand(
  title: string,
  brand: string,
  vendor: string
): { brand: string; invalidReason: string } {
  // Use brand registry for detection
  const detected = detectBrandNormalized(title, brand, vendor, brand);

  if (isValidBrand(detected)) {
    return { brand: detected, invalidReason: '' };
  }

  // Check for specific issues
  if (!detected || detected === 'Unknown') {
    if (!brand && !vendor) {
      return { brand: 'Unknown', invalidReason: 'No brand/vendor data' };
    }
    return { brand: 'Unknown', invalidReason: 'Brand not in registry' };
  }

  return { brand: detected, invalidReason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Uncategorized Candidates for Malformed Detection
// ─────────────────────────────────────────────────────────────────────────────

function loadUncategorizedForMalformed(): MalformedRow[] {
  const uncatPath = resolve(CSV_DIR, 'uncategorized_candidates.csv');
  if (!existsSync(uncatPath)) return [];

  const content = readFileSync(uncatPath, 'utf-8');
  const lines = content.split('\n');
  const malformed: MalformedRow[] = [];

  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });

    // Detect obvious garbage rows
    const title = row.title || '';
    const handle = row.handle || row.id || '';

    // Check for garbage patterns
    const isGarbage =
      // Title looks like raw CSV data
      title.includes(',,') ||
      title.includes('simple,') ||
      title.includes('false,Title') ||
      title.includes('deny,manual') ||
      // Title is just a URL
      title.startsWith('http') ||
      // Title contains escaped HTML
      /<[^>]{50,}>/.test(title) ||
      // Very long title (likely concatenated fields)
      title.length > 300 ||
      // Title matches handle exactly (often indicates parse issue)
      (title === handle && title.includes('-') && title.length > 50);

    if (isGarbage) {
      malformed.push({
        source_file: 'uncategorized_candidates.csv',
        line_number: i + 1,
        raw_line: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
        issue: 'Garbage/malformed data detected',
        suggested_fix: 'Re-parse source CSV or exclude row',
      });
    }
  }

  return malformed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Building Category Index Draft');
  console.log('================================\n');

  // Initialize brand registry
  initBrandRegistry();

  // Find all master files
  const masterFiles = findMasterFiles();
  console.log(`📂 Found ${masterFiles.length} master CSV files:`);
  masterFiles.forEach(f => console.log(`   - ${basename(f)}`));

  // Read all masters
  const allRows: MasterRow[] = [];
  const allMalformed: MalformedRow[] = [];

  for (const file of masterFiles) {
    const { rows, malformed } = readMasterCsv(file);
    allRows.push(...rows);
    allMalformed.push(...malformed);
    console.log(`   ${basename(file)}: ${rows.length} rows, ${malformed.length} malformed`);
  }

  console.log(`\n📦 Total rows from masters: ${allRows.length}`);
  console.log(`⚠️  Malformed from masters: ${allMalformed.length}`);

  // Also check uncategorized for malformed
  const uncatMalformed = loadUncategorizedForMalformed();
  allMalformed.push(...uncatMalformed);
  console.log(`⚠️  Malformed from uncategorized: ${uncatMalformed.length}`);

  // Aggregate by product key
  const productMap = new Map<string, ProductAggregate>();

  for (const row of allRows) {
    const key = generateProductKey(row);

    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      if (!existing.categories.includes(row.category)) {
        existing.categories.push(row.category);
        existing.source_files.push(row.source_file);
      }
      // Prefer non-empty values
      if (!existing.sku && row.sku) existing.sku = row.sku;
      if (!existing.handle && row.handle) existing.handle = row.handle;
      if (!existing.title && row.title) existing.title = row.title;
      if (existing.brand === 'Unknown' && row.brand && row.brand !== 'Unknown') {
        existing.brand = row.brand;
      }
    } else {
      const { brand, invalidReason } = validateAndNormalizeBrand(
        row.title,
        row.brand,
        row.vendor
      );

      productMap.set(key, {
        key,
        sku: row.sku,
        handle: row.handle,
        title: row.title,
        brand,
        vendor: row.vendor,
        categories: [row.category],
        source_files: [row.source_file],
        primary_category: '', // Will be assigned later
        is_conflict: false,
        brand_invalid_reason: invalidReason,
      });
    }
  }

  console.log(`\n🔑 Unique product keys: ${productMap.size}`);

  // Assign primary categories and detect conflicts
  const conflicts: ProductAggregate[] = [];
  let conflictCount = 0;

  for (const product of productMap.values()) {
    product.primary_category = assignPrimaryCategory(product.categories);
    product.is_conflict = product.categories.length > 1;

    if (product.is_conflict) {
      conflicts.push(product);
      conflictCount++;
    }
  }

  console.log(`⚔️  Products with category conflicts: ${conflictCount}`);

  // Write category_conflicts.csv
  const conflictsPath = resolve(CSV_DIR, 'category_conflicts.csv');
  const conflictHeaders = ['key', 'sku', 'handle', 'title', 'categories', 'primary_category', 'brand', 'source_files'];
  const conflictLines = [
    conflictHeaders.join(','),
    ...conflicts.map(c => [
      `"${c.key}"`,
      `"${c.sku}"`,
      `"${c.handle}"`,
      `"${c.title.replace(/"/g, '""')}"`,
      `"${c.categories.join('; ')}"`,
      `"${c.primary_category}"`,
      `"${c.brand}"`,
      `"${c.source_files.join('; ')}"`,
    ].join(',')),
  ];
  writeFileSync(conflictsPath, conflictLines.join('\n'));
  console.log(`\n✅ Written: ${conflictsPath}`);
  console.log(`   ${conflicts.length} conflict rows`);

  // Write category_index_draft.csv
  const indexPath = resolve(CSV_DIR, 'category_index_draft.csv');
  const indexHeaders = ['key', 'sku', 'handle', 'title', 'primary_category', 'categories', 'brand', 'brand_invalid_reason'];
  const indexLines = [
    indexHeaders.join(','),
    ...Array.from(productMap.values()).map(p => [
      `"${p.key}"`,
      `"${p.sku}"`,
      `"${p.handle}"`,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.primary_category}"`,
      `"${p.categories.join('; ')}"`,
      `"${p.brand}"`,
      `"${p.brand_invalid_reason}"`,
    ].join(',')),
  ];
  writeFileSync(indexPath, indexLines.join('\n'));
  console.log(`\n✅ Written: ${indexPath}`);
  console.log(`   ${productMap.size} product rows`);

  // Write malformed_rows.csv
  const malformedPath = resolve(CSV_DIR, 'malformed_rows.csv');
  const malformedHeaders = ['source_file', 'line_number', 'issue', 'suggested_fix', 'raw_line'];
  const malformedLines = [
    malformedHeaders.join(','),
    ...allMalformed.map(m => [
      `"${m.source_file}"`,
      m.line_number,
      `"${m.issue}"`,
      `"${m.suggested_fix}"`,
      `"${m.raw_line.replace(/"/g, '""')}"`,
    ].join(',')),
  ];
  writeFileSync(malformedPath, malformedLines.join('\n'));
  console.log(`\n✅ Written: ${malformedPath}`);
  console.log(`   ${allMalformed.length} malformed rows`);

  // Summary statistics
  console.log('\n' + '═'.repeat(50));
  console.log('📈 SUMMARY');
  console.log('═'.repeat(50));

  // Category distribution
  const categoryDist = new Map<string, number>();
  for (const product of productMap.values()) {
    const cat = product.primary_category;
    categoryDist.set(cat, (categoryDist.get(cat) || 0) + 1);
  }

  console.log('\n📊 Primary Category Distribution:');
  const sortedCats = Array.from(categoryDist.entries()).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats.slice(0, 15)) {
    console.log(`   ${cat}: ${count}`);
  }

  // Brand distribution (top 15)
  const brandDist = new Map<string, number>();
  for (const product of productMap.values()) {
    const brand = product.brand || 'Unknown';
    brandDist.set(brand, (brandDist.get(brand) || 0) + 1);
  }

  console.log('\n🏷️  Top Brands:');
  const sortedBrands = Array.from(brandDist.entries()).sort((a, b) => b[1] - a[1]);
  for (const [brand, count] of sortedBrands.slice(0, 15)) {
    console.log(`   ${brand}: ${count}`);
  }

  // UNO regression check
  const unoCount = brandDist.get('UNO') || 0;
  console.log(`\n🔍 UNO Brand Check: ${unoCount} products`);
  if (unoCount === 0) {
    console.log('   ⚠️  WARNING: UNO brand not found! Check brand detection.');
  } else {
    console.log('   ✅ UNO brand detection working');
  }

  // Conflict analysis
  console.log('\n⚔️  Most Common Conflict Patterns:');
  const conflictPatterns = new Map<string, number>();
  for (const c of conflicts) {
    const pattern = c.categories.sort().join(' + ');
    conflictPatterns.set(pattern, (conflictPatterns.get(pattern) || 0) + 1);
  }
  const sortedPatterns = Array.from(conflictPatterns.entries()).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sortedPatterns.slice(0, 10)) {
    console.log(`   ${pattern}: ${count}`);
  }

  console.log('\n✅ Category Index Draft complete!');
}

main().catch(console.error);
