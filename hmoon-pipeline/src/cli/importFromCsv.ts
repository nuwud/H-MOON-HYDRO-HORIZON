/**
 * Import products from existing Shopify CSV export
 * Converts CSV data to ShopifyProduct format for health scoring
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ShopifyProduct } from '../types/Product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const CSV_DIR = resolve(__dirname, '../../../CSVs');

interface CsvRow {
  [key: string]: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function convertToShopifyProduct(rows: CsvRow[]): ShopifyProduct[] {
  // Group by product handle (Shopify CSVs have one row per variant)
  const productMap = new Map<string, ShopifyProduct>();

  for (const row of rows) {
    // Support multiple CSV formats (including normalized exports)
    const handle = row['Handle'] || row['handle'] || row['product_handle'] || '';
    if (!handle) continue;

    if (!productMap.has(handle)) {
      // Count images - check various column names
      let imageCount = 0;
      const totalImages = row['Total_Images'] || row['total_images'];
      if (totalImages) {
        imageCount = parseInt(totalImages, 10) || 0;
      } else {
        for (const key of Object.keys(row)) {
          if (key.toLowerCase().includes('image') && key.toLowerCase().includes('src') && row[key]) {
            imageCount++;
          }
        }
      }

      // Parse tags - support multiple formats
      const tagsStr = row['Tags'] || row['tags'] || row['product_tags'] || '';
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

      // Check for SEO (various column names)
      const seoTitle = row['SEO_Title'] || row['SEO Title'] || row['seo_title'] || row['meta_title'] || '';
      const seoDesc = row['SEO_Description'] || row['SEO Description'] || row['seo_description'] || row['meta_description'] || '';
      const hasSeo = Boolean(seoTitle || seoDesc);

      // Support multiple column naming conventions
      const product: ShopifyProduct = {
        id: row['Product_ID'] || row['ID'] || row['id'] || row['product_id'] || handle,
        title: row['Product_Name'] || row['Title'] || row['title'] || row['product_title'] || '',
        handle,
        status: row['Status'] || row['status'] || row['product_status'] || 'active',
        productType: row['Product_Type'] || row['Type'] || row['Product Type'] || row['product_type'] || '',
        vendor: row['Vendor'] || row['vendor'] || row['product_vendor'] || '',
        tags,
        descriptionHtml: row['Description'] || row['Body (HTML)'] || row['Body HTML'] || row['body_html'] || row['description'] || '',
        imagesCount: imageCount || (row['Image_URL'] || row['Image Src'] ? 1 : 0),
        hasSeo,
      };

      productMap.set(handle, product);
    } else {
      // Additional variant row - count additional images if present
      const existing = productMap.get(handle)!;
      const imgUrl = row['Image_URL'] || row['Image Src'] || row['image_src'];
      if (imgUrl && existing.imagesCount === 0) {
        existing.imagesCount = 1;
      }
    }
  }

  return Array.from(productMap.values());
}

async function main() {
  console.log('📥 Importing products from CSV...\n');

  // Find the most comprehensive CSV (prefer normalized with full fields)
  const csvFiles = [
    'shopify_export_after_prod__NORMALIZED.csv',  // Has Product_ID, Product_Name, Handle, Description, Tags, Images
    'shopify_export_after_prod__INCLUDE_ALL.csv',
    'shopify_export_after_prod.csv',
    'shopify_products_h-moon-hydro_20251029_094151.csv',
  ];

  let csvPath: string | null = null;
  for (const file of csvFiles) {
    const path = resolve(CSV_DIR, file);
    if (existsSync(path)) {
      csvPath = path;
      break;
    }
  }

  if (!csvPath) {
    console.error('❌ No Shopify CSV found in CSVs/ folder');
    console.log('Expected one of:', csvFiles.join(', '));
    process.exit(1);
  }

  console.log(`📄 Reading: ${csvPath.split(/[/\\]/).pop()}`);

  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);
  console.log(`   Found ${rows.length} CSV rows`);

  const products = convertToShopifyProduct(rows);
  console.log(`   Converted to ${products.length} unique products\n`);

  // Write to data folder
  const outputPath = resolve(DATA_DIR, 'products_raw.json');
  writeFileSync(outputPath, JSON.stringify(products, null, 2));
  console.log(`✅ Saved to: data/products_raw.json`);

  // Show sample
  console.log('\n📊 Sample products:');
  products.slice(0, 5).forEach(p => {
    console.log(`   - ${p.title} (${p.handle})`);
    console.log(`     Type: ${p.productType || 'none'}, Vendor: ${p.vendor || 'none'}, Images: ${p.imagesCount}`);
  });

  console.log(`\n🎯 Next: Run 'npm run score' to analyze product health`);
}

main().catch(console.error);
