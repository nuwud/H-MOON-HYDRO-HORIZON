/**
 * SEO-001: Enrich CSV with SEO Meta Titles & Descriptions
 * Applies optimized meta content to products before import
 *
 * Usage:
 *   npx tsx src/cli/enrichCsvSeo.ts --dry-run
 *   npx tsx src/cli/enrichCsvSeo.ts --confirm
 *   npx tsx src/cli/enrichCsvSeo.ts --input=CSVs/custom.csv --confirm
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateMetaTitle, ProductData } from '../seo/metaTitleGenerator.js';
import { generateMetaDescription } from '../seo/metaDescriptionGenerator.js';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get project root (two levels up from src/cli)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface CsvRow {
  [key: string]: string;
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const rows: CsvRow[] = [];
  let i = 1;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    // Handle multi-line values
    let line = lines[i];
    while (countQuotes(line) % 2 !== 0 && i + 1 < lines.length) {
      i++;
      line += '\n' + lines[i];
    }

    const values = parseCSVLine(line);
    const row: CsvRow = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    rows.push(row);
    i++;
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
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

function countQuotes(str: string): number {
  return (str.match(/"/g) || []).length;
}

function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function rowsToCSV(rows: CsvRow[], headers: string[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(escapeCSV).join(','));

  // Data rows
  for (const row of rows) {
    const values = headers.map((h) => escapeCSV(row[h] || ''));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

function csvRowToProductData(row: CsvRow): ProductData {
  // Strip HTML tags from title
  const cleanTitle = (row['Title'] || '').replace(/<[^>]*>/g, '');
  
  // Get vendor, but skip "H Moon Hydro" as it's not a useful brand name for SEO
  let vendor = row['Vendor'] || undefined;
  if (vendor && /h[- ]?moon\s*hydro/i.test(vendor)) {
    vendor = undefined; // Will trigger fallback template without brand prefix
  }
  
  return {
    handle: row['Handle'] || '',
    title: cleanTitle,
    vendor: vendor,
    productType: row['Type'] || row['Product Category'] || undefined,
    tags: row['Tags'] ? row['Tags'].split(',').map((t) => t.trim()) : undefined,
    variants: row['Variant SKU']
      ? [{ sku: row['Variant SKU'], title: row['Option1 Value'] }]
      : undefined,
  };
}

async function enrichCsvWithSeo(inputPath: string, dryRun: boolean): Promise<void> {
  console.log('🔍 SEO-001: Meta Title & Description Enrichment\n');

  // Read CSV
  const csvContent = fs.readFileSync(inputPath, 'utf-8');
  const rows = parseCSV(csvContent);
  const headers = Object.keys(rows[0] || {});

  // Ensure SEO columns exist
  if (!headers.includes('SEO Title')) headers.push('SEO Title');
  if (!headers.includes('SEO Description')) headers.push('SEO Description');

  console.log(`📊 Loaded ${rows.length} rows from ${path.basename(inputPath)}\n`);

  // Track stats
  let titleGenerated = 0;
  let descGenerated = 0;
  let skipped = 0;

  // Track unique handles (first row per handle is main, others are variants)
  const seenHandles = new Set<string>();

  for (const row of rows) {
    const handle = row['Handle'];
    if (!handle) continue;

    // Only process first row per handle (variants share parent SEO)
    if (seenHandles.has(handle)) {
      skipped++;
      continue;
    }
    seenHandles.add(handle);

    const product = csvRowToProductData(row);
    const existingTitle = row['SEO Title']?.trim();
    const existingDesc = row['SEO Description']?.trim();

    // Generate if missing or generic
    const needsTitle = !existingTitle || existingTitle === product.title;
    const needsDesc = !existingDesc || existingDesc.length < 50;

    if (needsTitle) {
      const newTitle = generateMetaTitle(product);
      row['SEO Title'] = newTitle;
      titleGenerated++;

      if (dryRun) {
        console.log(`📝 ${handle}`);
        console.log(`   Title: ${newTitle}`);
      }
    }

    if (needsDesc) {
      const newDesc = generateMetaDescription(product);
      row['SEO Description'] = newDesc;
      descGenerated++;

      if (dryRun) {
        console.log(`   Desc:  ${newDesc}`);
      }
    }

    if (dryRun && (needsTitle || needsDesc)) {
      console.log('');
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Products processed: ${seenHandles.size}`);
  console.log(`   SEO Titles generated: ${titleGenerated}`);
  console.log(`   SEO Descriptions generated: ${descGenerated}`);
  console.log(`   Variant rows skipped: ${skipped}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes written');
    console.log('   Run with --confirm to apply changes');
    return;
  }

  // Write output
  const outputPath = inputPath.replace('.csv', '_seo.csv');
  const csvOutput = rowsToCSV(rows, headers);
  fs.writeFileSync(outputPath, csvOutput, 'utf-8');

  console.log(`\n✅ Saved to: ${path.basename(outputPath)}`);
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');

  // Find input file
  let inputPath = path.join(PROJECT_ROOT, 'CSVs', 'products_export_1_enriched.csv');

  const inputArg = args.find((a) => a.startsWith('--input='));
  if (inputArg) {
    inputPath = inputArg.split('=')[1];
    if (!path.isAbsolute(inputPath)) {
      inputPath = path.join(PROJECT_ROOT, inputPath);
    }
  }

  // Fall back to non-enriched if enriched doesn't exist
  if (!fs.existsSync(inputPath)) {
    inputPath = path.join(PROJECT_ROOT, 'CSVs', 'products_export_1.csv');
  }

  if (!fs.existsSync(inputPath)) {
    console.error('❌ CSV file not found:', inputPath);
    process.exit(1);
  }

  await enrichCsvWithSeo(inputPath, dryRun);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
