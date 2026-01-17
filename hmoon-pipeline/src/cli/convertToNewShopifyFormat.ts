#!/usr/bin/env npx tsx
/**
 * convertToNewShopifyFormat.ts
 * 
 * Converts our old-format Shopify import CSV to the new Shopify import format.
 * 
 * Old format columns like "Image Src" become "Product image URL"
 * Old format columns like "Handle" become "URL handle"
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(BASE_DIR, 'outputs');

// Column mapping: Old Name -> New Name
const COLUMN_MAPPING: Record<string, string> = {
  'Handle': 'URL handle',
  'Title': 'Title',
  'Body (HTML)': 'Description',
  'Vendor': 'Vendor',
  'Product Category': 'Product category',
  'Type': 'Type',
  'Tags': 'Tags',
  'Collection': 'Collection',  // May not exist in new format
  'Published': 'Published on online store',
  'Option1 Name': 'Option1 name',
  'Option1 Value': 'Option1 value',
  'Option2 Name': 'Option2 name',
  'Option2 Value': 'Option2 value',
  'Option3 Name': 'Option3 name',
  'Option3 Value': 'Option3 value',
  'Variant SKU': 'SKU',
  'Variant Grams': 'Weight value (grams)',
  'Variant Inventory Tracker': 'Inventory tracker',
  'Variant Inventory Qty': 'Inventory quantity',
  'Variant Inventory Policy': 'Continue selling when out of stock',
  'Variant Fulfillment Service': 'Fulfillment service',
  'Variant Price': 'Price',
  'Variant Compare At Price': 'Compare-at price',
  'Variant Requires Shipping': 'Requires shipping',
  'Variant Taxable': 'Charge tax',
  'Variant Barcode': 'Barcode',
  'Image Src': 'Product image URL',
  'Image Position': 'Image position',
  'Image Alt Text': 'Image alt text',
  'Gift Card': 'Gift card',
  'SEO Title': 'SEO title',
  'SEO Description': 'SEO description',
  'Variant Weight Unit': 'Weight unit for display',
  'Cost per item': 'Cost per item',
  'Status': 'Status',
};

// Value transformations
function transformValue(oldHeader: string, value: string): string {
  // Convert inventory policy: "continue" -> TRUE, "deny" -> FALSE
  if (oldHeader === 'Variant Inventory Policy') {
    if (value.toLowerCase() === 'continue') return 'TRUE';
    if (value.toLowerCase() === 'deny') return 'FALSE';
    return value;
  }
  
  // Status: lowercase "active" -> "Active", "draft" -> "Draft"
  if (oldHeader === 'Status') {
    if (value.toLowerCase() === 'active') return 'Active';
    if (value.toLowerCase() === 'draft') return 'Draft';
    if (value.toLowerCase() === 'archived') return 'Archived';
    return value;
  }
  
  return value;
}

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
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  const inputPath = path.resolve(OUTPUTS_DIR, 'shopify_import_final_cdn.csv');
  const outputPath = path.resolve(OUTPUTS_DIR, 'shopify_import_new_format.csv');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Convert to New Shopify Import Format');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  console.log(`📄 Input: ${inputPath}`);
  console.log(`   ${lines.length - 1} data rows\n`);
  
  // Parse header
  const oldHeaders = parseCsvLine(lines[0]);
  console.log(`   Old format: ${oldHeaders.length} columns`);
  
  // Build new header mapping
  const newHeaders: string[] = [];
  const columnMap: number[] = []; // Maps new column index to old column index
  const oldHeaderNames: string[] = []; // Track old header names for value transformation
  
  for (const oldHeader of oldHeaders) {
    const newHeader = COLUMN_MAPPING[oldHeader];
    if (newHeader) {
      newHeaders.push(newHeader);
      columnMap.push(oldHeaders.indexOf(oldHeader));
      oldHeaderNames.push(oldHeader);
    } else {
      // Keep unmapped columns as-is
      console.log(`   ⚠️  Unmapped column: "${oldHeader}" - keeping as-is`);
      newHeaders.push(oldHeader);
      columnMap.push(oldHeaders.indexOf(oldHeader));
      oldHeaderNames.push(oldHeader);
    }
  }
  
  console.log(`   New format: ${newHeaders.length} columns\n`);
  
  // Show key mappings
  console.log('🔄 Key column mappings:');
  const keyColumns = ['Handle', 'Image Src', 'Variant SKU', 'Variant Price', 'Status'];
  for (const old of keyColumns) {
    const newName = COLUMN_MAPPING[old];
    if (newName) {
      console.log(`   "${old}" → "${newName}"`);
    }
  }
  console.log();
  
  // Process rows
  const outputLines: string[] = [];
  
  // New header row
  outputLines.push(newHeaders.map(escapeCsvValue).join(','));
  
  let rowCount = 0;
  let imageCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const oldValues = parseCsvLine(line);
    const newValues: string[] = [];
    
    for (let j = 0; j < columnMap.length; j++) {
      const oldIdx = columnMap[j];
      const oldHeader = oldHeaderNames[j];
      let value = oldIdx < oldValues.length ? oldValues[oldIdx] : '';
      
      // Apply value transformations
      value = transformValue(oldHeader, value);
      
      newValues.push(value);
      
      // Track images
      if (oldHeader === 'Image Src' && value) {
        imageCount++;
      }
    }
    
    outputLines.push(newValues.map(escapeCsvValue).join(','));
    rowCount++;
  }
  
  // Write output
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
  
  console.log('✅ Conversion complete!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Rows: ${rowCount}`);
  console.log(`   Images: ${imageCount}`);
  console.log();
  console.log('📋 Next step: Import this file into Shopify Admin');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
