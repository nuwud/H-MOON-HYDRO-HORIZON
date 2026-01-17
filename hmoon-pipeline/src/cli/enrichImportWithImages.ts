/**
 * enrichImportWithImages.ts
 * 
 * Enriches shopify_import_ready.csv and shopify_import_draft.csv with image URLs
 * from products_export_1.csv (original Shopify export with CDN images)
 * 
 * Usage:
 *   npx tsx src/cli/enrichImportWithImages.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing
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

function escapeCsvValue(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Image Map from Original Export
// ─────────────────────────────────────────────────────────────────────────────

function loadImageMap(): Map<string, string> {
  console.log('📷 Loading image URLs from products_export_1.csv...');
  
  const content = readFileSync(resolve(CSV_DIR, 'products_export_1.csv'), 'utf-8');
  const lines = content.split('\n');
  const header = parseCsvLine(lines[0]);
  
  const handleIdx = header.indexOf('Handle');
  const imgSrcIdx = header.indexOf('Image Src');
  
  if (handleIdx === -1 || imgSrcIdx === -1) {
    throw new Error('Missing Handle or Image Src column in products_export_1.csv');
  }
  
  const imageMap = new Map<string, string>();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const handle = cols[handleIdx]?.toLowerCase().trim() || '';
    const imgUrl = cols[imgSrcIdx]?.trim() || '';
    
    // Only store if we have a valid image URL and don't already have one for this handle
    if (handle && imgUrl && imgUrl.startsWith('http') && !imageMap.has(handle)) {
      imageMap.set(handle, imgUrl);
    }
  }
  
  console.log(`   Found ${imageMap.size} unique products with images`);
  return imageMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrich Import CSV with Images
// ─────────────────────────────────────────────────────────────────────────────

function enrichImportCsv(filename: string, imageMap: Map<string, string>): { total: number; enriched: number } {
  const filepath = resolve(CSV_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  
  const header = parseCsvLine(lines[0]);
  const handleIdx = header.indexOf('Handle');
  const imgSrcIdx = header.indexOf('Image Src');
  const imgPosIdx = header.indexOf('Image Position');
  const imgAltIdx = header.indexOf('Image Alt Text');
  
  if (handleIdx === -1 || imgSrcIdx === -1) {
    throw new Error(`Missing Handle or Image Src column in ${filename}`);
  }
  
  let enriched = 0;
  const outputLines: string[] = [lines[0]]; // Keep header as-is
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = parseCsvLine(lines[i]);
    const handle = cols[handleIdx]?.toLowerCase().trim() || '';
    const existingImg = cols[imgSrcIdx]?.trim() || '';
    
    // If no image and we have one in the map, add it
    if (!existingImg && handle && imageMap.has(handle)) {
      cols[imgSrcIdx] = imageMap.get(handle)!;
      cols[imgPosIdx] = '1';
      // Use title for alt text if we have the column
      if (imgAltIdx !== -1 && !cols[imgAltIdx]) {
        const titleIdx = header.indexOf('Title');
        if (titleIdx !== -1) {
          cols[imgAltIdx] = cols[titleIdx] || '';
        }
      }
      enriched++;
    }
    
    // Rebuild the line
    outputLines.push(cols.map(escapeCsvValue).join(','));
  }
  
  // Write back
  writeFileSync(filepath, outputLines.join('\n'), 'utf-8');
  
  return { total: outputLines.length - 1, enriched };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         ENRICH SHOPIFY IMPORTS WITH IMAGE URLS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Load image map
  const imageMap = loadImageMap();
  
  // Enrich ready CSV
  console.log('\n📄 Enriching shopify_import_ready.csv...');
  const readyResult = enrichImportCsv('shopify_import_ready.csv', imageMap);
  console.log(`   Total: ${readyResult.total}, Added images: ${readyResult.enriched}`);
  
  // Enrich draft CSV
  console.log('\n📄 Enriching shopify_import_draft.csv...');
  const draftResult = enrichImportCsv('shopify_import_draft.csv', imageMap);
  console.log(`   Total: ${draftResult.total}, Added images: ${draftResult.enriched}`);
  
  // Summary
  const totalEnriched = readyResult.enriched + draftResult.enriched;
  const totalProducts = readyResult.total + draftResult.total;
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📷 Image sources available: ${imageMap.size}`);
  console.log(`📦 Products enriched: ${totalEnriched} / ${totalProducts}`);
  console.log(`\n   Ready CSV: ${readyResult.enriched} images added`);
  console.log(`   Draft CSV: ${draftResult.enriched} images added`);
  
  if (totalEnriched < imageMap.size) {
    console.log(`\n⚠️  ${imageMap.size - totalEnriched} images not matched (handle mismatch or already had image)`);
  }
  
  console.log('\n✅ Done! Re-import the CSVs to add images to Shopify.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
