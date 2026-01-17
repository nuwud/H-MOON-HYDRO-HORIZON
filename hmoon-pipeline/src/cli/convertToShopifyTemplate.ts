#!/usr/bin/env npx tsx
/**
 * convertToShopifyTemplate.ts
 * 
 * Converts our CSV to match the EXACT Shopify product import template format.
 * Uses the official column order and names from Shopify's template.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(BASE_DIR, 'outputs');

// EXACT Shopify template header (from product_template_unit_price.csv)
const SHOPIFY_TEMPLATE_HEADER = [
  'Title',
  'URL handle',
  'Description',
  'Vendor',
  'Product category',
  'Type',
  'Tags',
  'Published on online store',
  'Status',
  'SKU',
  'Barcode',
  'Option1 name',
  'Option1 value',
  'Option1 Linked To',
  'Option2 name',
  'Option2 value',
  'Option2 Linked To',
  'Option3 name',
  'Option3 value',
  'Option3 Linked To',
  'Price',
  'Compare-at price',
  'Cost per item',
  'Charge tax',
  'Tax code',
  'Unit price total measure',
  'Unit price total measure unit',
  'Unit price base measure',
  'Unit price base measure unit',
  'Inventory tracker',
  'Inventory quantity',
  'Continue selling when out of stock',
  'Weight value (grams)',
  'Weight unit for display',
  'Requires shipping',
  'Fulfillment service',
  'Product image URL',
  'Image position',
  'Image alt text',
  'Variant image URL',
  'Gift card',
  'SEO title',
  'SEO description',
];

// Map our CSV columns to Shopify template columns
const COLUMN_MAPPING: Record<string, string> = {
  'Handle': 'URL handle',
  'Title': 'Title',
  'Body (HTML)': 'Description',
  'Vendor': 'Vendor',
  'Product Category': 'Product category',
  'Type': 'Type',
  'Tags': 'Tags',
  'Published': 'Published on online store',
  'Status': 'Status',
  'Variant SKU': 'SKU',
  'Variant Barcode': 'Barcode',
  'Option1 Name': 'Option1 name',
  'Option1 Value': 'Option1 value',
  'Option2 Name': 'Option2 name',
  'Option2 Value': 'Option2 value',
  'Option3 Name': 'Option3 name',
  'Option3 Value': 'Option3 value',
  'Variant Price': 'Price',
  'Variant Compare At Price': 'Compare-at price',
  'Cost per item': 'Cost per item',
  'Variant Taxable': 'Charge tax',
  'Variant Inventory Tracker': 'Inventory tracker',
  'Variant Inventory Qty': 'Inventory quantity',
  'Variant Inventory Policy': 'Continue selling when out of stock',
  'Variant Grams': 'Weight value (grams)',
  'Variant Weight Unit': 'Weight unit for display',
  'Variant Requires Shipping': 'Requires shipping',
  'Variant Fulfillment Service': 'Fulfillment service',
  'Image Src': 'Product image URL',
  'Image Position': 'Image position',
  'Image Alt Text': 'Image alt text',
  'Gift Card': 'Gift card',
  'SEO Title': 'SEO title',
  'SEO Description': 'SEO description',
};

// Value transformations
function transformValue(shopifyColumn: string, value: string): string {
  // Convert inventory policy: "continue" -> TRUE, "deny" -> FALSE/DENY
  if (shopifyColumn === 'Continue selling when out of stock') {
    if (value.toLowerCase() === 'continue') return 'TRUE';
    if (value.toLowerCase() === 'deny') return 'DENY';
    return value;
  }
  
  // Status: lowercase -> Capitalized
  if (shopifyColumn === 'Status') {
    if (value.toLowerCase() === 'active') return 'Active';
    if (value.toLowerCase() === 'draft') return 'Draft';
    if (value.toLowerCase() === 'archived') return 'Archived';
    return value;
  }
  
  // Weight unit: "lb" -> "g" since we're providing grams
  if (shopifyColumn === 'Weight unit for display') {
    // Keep as-is, Shopify will interpret
    return value || 'g';
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
  const outputPath = path.resolve(OUTPUTS_DIR, 'shopify_import_template_format.csv');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Convert to Official Shopify Template Format');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  console.log(`📄 Input: ${inputPath}`);
  console.log(`   ${lines.length - 1} data rows\n`);
  
  // Parse our header
  const ourHeaders = parseCsvLine(lines[0]);
  console.log(`   Our format: ${ourHeaders.length} columns`);
  console.log(`   Shopify template: ${SHOPIFY_TEMPLATE_HEADER.length} columns\n`);
  
  // Build reverse mapping: Shopify column -> our column index
  const reverseMap: Map<string, number> = new Map();
  for (let i = 0; i < ourHeaders.length; i++) {
    const ourHeader = ourHeaders[i];
    const shopifyHeader = COLUMN_MAPPING[ourHeader];
    if (shopifyHeader) {
      reverseMap.set(shopifyHeader, i);
    }
  }
  
  // Show mappings
  console.log('🔄 Column mappings found:');
  let mappedCount = 0;
  for (const shopifyCol of SHOPIFY_TEMPLATE_HEADER) {
    if (reverseMap.has(shopifyCol)) {
      mappedCount++;
    }
  }
  console.log(`   ${mappedCount}/${SHOPIFY_TEMPLATE_HEADER.length} columns mapped\n`);
  
  // Show unmapped columns
  const unmapped = SHOPIFY_TEMPLATE_HEADER.filter(c => !reverseMap.has(c));
  if (unmapped.length > 0) {
    console.log('   Unmapped (will be empty):');
    for (const col of unmapped.slice(0, 10)) {
      console.log(`     - ${col}`);
    }
    if (unmapped.length > 10) {
      console.log(`     ... and ${unmapped.length - 10} more`);
    }
    console.log();
  }
  
  // Process rows
  const outputLines: string[] = [];
  
  // Header row - use exact Shopify template header
  outputLines.push(SHOPIFY_TEMPLATE_HEADER.map(escapeCsvValue).join(','));
  
  let rowCount = 0;
  let imageCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const ourValues = parseCsvLine(line);
    const newValues: string[] = [];
    
    for (const shopifyCol of SHOPIFY_TEMPLATE_HEADER) {
      const ourIdx = reverseMap.get(shopifyCol);
      let value = '';
      
      if (ourIdx !== undefined && ourIdx < ourValues.length) {
        value = ourValues[ourIdx];
      }
      
      // Apply value transformations
      value = transformValue(shopifyCol, value);
      
      newValues.push(value);
      
      // Track images
      if (shopifyCol === 'Product image URL' && value) {
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
  console.log(`   Columns: ${SHOPIFY_TEMPLATE_HEADER.length}`);
  console.log();
  console.log('📋 Next step: Import shopify_import_template_format.csv into Shopify Admin');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
