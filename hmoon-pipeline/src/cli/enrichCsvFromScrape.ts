#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: enrichCsvFromScrape.ts
 * PURPOSE: Enrich Shopify import CSVs with scraped product data BEFORE import
 * 
 * This is the pre-import enrichment approach:
 * 1. Load scraped data (descriptions, images, specs)
 * 2. Load files_manifest.json for CDN URLs
 * 3. Update the import CSV with enriched data
 * 4. Output enriched CSV ready for Shopify import
 * 
 * Usage:
 *   npx tsx src/cli/enrichCsvFromScrape.ts --source=grease --dry-run
 *   npx tsx src/cli/enrichCsvFromScrape.ts --source=grease --confirm
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const CSVS_DIR = path.resolve(PROJECT_ROOT, 'CSVs');
const SCRAPED_DIR = path.resolve(OUTPUTS_DIR, 'scraped');
const MANIFEST_PATH = path.resolve(OUTPUTS_DIR, 'files_manifest.json');

// ============================================================================
// Types
// ============================================================================

interface ScrapedProduct {
  handle: string;
  title: string;
  vendor: string;
  source: string;
  images: {
    main: string;
    gallery: string[];
  };
  description?: string;
  specs?: Record<string, string>;
  scrapedAt: string;
}

interface ScrapeResult {
  source: string;
  scrapedAt: string;
  products: ScrapedProduct[];
  errors: string[];
  stats: {
    total: number;
    withImages: number;
    withDescriptions: number;
  };
}

interface ManifestEntry {
  originalFilename: string;
  shopifyUrl?: string;
}

interface FilesManifest {
  byFilename: Record<string, ManifestEntry>;
}

interface CsvRow {
  [key: string]: string;
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'grease';
const isDryRun = !args.includes('--confirm');
const inputCsvArg = args.find(a => a.startsWith('--input='))?.split('=')[1];
const outputCsvArg = args.find(a => a.startsWith('--output='))?.split('=')[1];

// ============================================================================
// CSV Parser/Writer
// ============================================================================

function parseCSV(content: string): { headers: string[]; rows: CsvRow[] } {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows: CsvRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip escaped quote
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

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCSV(row: CsvRow, headers: string[]): string {
  return headers.map(h => escapeCSVField(row[h] || '')).join(',');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ENRICH CSV FROM SCRAPE - H-Moon Hydro Pipeline');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log(`  Source: ${sourceArg}`);
  console.log(`  Dry Run: ${isDryRun}\n`);
  
  // Load scraped data
  const scrapePath = path.join(SCRAPED_DIR, `${sourceArg}.json`);
  if (!fs.existsSync(scrapePath)) {
    console.error(`❌ Scrape file not found: ${scrapePath}`);
    console.log(`   Run: npm run scrape:${sourceArg} first`);
    process.exit(1);
  }
  
  const scrapeData: ScrapeResult = JSON.parse(fs.readFileSync(scrapePath, 'utf-8'));
  console.log(`  Loaded ${scrapeData.products.length} scraped products\n`);
  
  // Build lookup by handle
  const scrapedByHandle = new Map<string, ScrapedProduct>();
  for (const product of scrapeData.products) {
    scrapedByHandle.set(product.handle, product);
  }
  
  // Load manifest for CDN URLs
  let manifest: FilesManifest = { byFilename: {} };
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    console.log(`  Loaded manifest with ${Object.keys(manifest.byFilename).length} CDN entries\n`);
  }
  
  // Process both import CSVs
  const csvFiles = [
    inputCsvArg || path.join(CSVS_DIR, 'products_export_1.csv'),
  ];
  
  let totalUpdated = 0;
  
  for (const csvPath of csvFiles) {
    if (!fs.existsSync(csvPath)) {
      console.log(`  ⚠️ CSV not found: ${csvPath}`);
      continue;
    }
    
    console.log(`  📄 Processing: ${path.basename(csvPath)}`);
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    const { headers, rows } = parseCSV(content);
    
    let updated = 0;
    const changes: string[] = [];
    
    for (const row of rows) {
      const handle = row['Handle'];
      const scraped = scrapedByHandle.get(handle);
      
      if (!scraped) continue;
      
      let rowChanged = false;
      
      // Update description if current is empty or short
      const currentDesc = row['Body (HTML)'] || '';
      if (scraped.description && (!currentDesc || currentDesc.length < 50)) {
        row['Body (HTML)'] = `<p>${scraped.description}</p>`;
        changes.push(`${handle}: Added description (${scraped.description.length} chars)`);
        rowChanged = true;
      }
      
      // Update vendor to "Grease" (proper capitalization)
      if (scraped.vendor && row['Vendor'] !== scraped.vendor) {
        row['Vendor'] = scraped.vendor;
        changes.push(`${handle}: Fixed vendor → ${scraped.vendor}`);
        rowChanged = true;
      }
      
      // Update image if we have a CDN URL and current is empty
      const currentImage = row['Image Src'] || '';
      if (scraped.images.main) {
        const filename = path.basename(scraped.images.main);
        const manifestEntry = manifest.byFilename[filename];
        
        if (manifestEntry?.shopifyUrl && !currentImage) {
          row['Image Src'] = manifestEntry.shopifyUrl;
          changes.push(`${handle}: Added image → ${filename}`);
          rowChanged = true;
        } else if (manifestEntry?.shopifyUrl && currentImage && !currentImage.includes(filename.replace('-scaled.webp', ''))) {
          // Image exists but might be wrong - log for review
          changes.push(`${handle}: Has image, CDN available: ${filename}`);
        }
      }
      
      if (rowChanged) updated++;
    }
    
    totalUpdated += updated;
    
    // Output changes
    console.log(`     Updates: ${updated} products\n`);
    
    if (changes.length > 0) {
      console.log('     Changes:');
      changes.forEach(c => console.log(`       - ${c}`));
      console.log('');
    }
    
    // Write updated CSV
    if (!isDryRun && updated > 0) {
      const outputPath = outputCsvArg || csvPath.replace('.csv', '_enriched.csv');
      const outputContent = [
        headers.join(','),
        ...rows.map(row => rowToCSV(row, headers)),
      ].join('\n');
      
      fs.writeFileSync(outputPath, outputContent);
      console.log(`     💾 Saved to: ${outputPath}\n`);
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Products updated: ${totalUpdated}`);
  
  if (isDryRun) {
    console.log('\n  [DRY RUN] No files written. Use --confirm to save changes.');
  }
  
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
