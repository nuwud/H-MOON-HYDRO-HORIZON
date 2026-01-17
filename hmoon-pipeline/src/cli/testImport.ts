#!/usr/bin/env npx tsx
/**
 * SMALL BATCH TEST IMPORT
 * Import a small number of products via GraphQL API for testing.
 * This gives us more control and better error handling than CSV import.
 */

import { loadShopifyConfig, executeGraphQL } from '../utils/shopifyAdminGraphql.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadShopifyConfig();

// Step 1: Create product with options
const CREATE_PRODUCT = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        handle
        title
        options {
          id
          name
          optionValues {
            id
            name
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Step 2: Create additional variants if needed
const CREATE_VARIANTS = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        sku
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Step 2: Update variant with SKU and price (uses Bulk Update for single variant)
const UPDATE_VARIANT = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface CSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  Type: string;
  Tags: string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Alt Text': string;
  'Cost per item': string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Option3 Name': string;
  'Option3 Value': string;
  Status: string;
}

function groupVariantsByHandle(rows: CSVRow[]): Map<string, CSVRow[]> {
  const grouped = new Map<string, CSVRow[]>();
  for (const row of rows) {
    const handle = row.Handle;
    if (!grouped.has(handle)) {
      grouped.set(handle, []);
    }
    grouped.get(handle)!.push(row);
  }
  return grouped;
}

// Build product options with values for new API
function buildProductOptions(rows: CSVRow[]): any[] {
  const first = rows[0];
  const options: any[] = [];
  
  // Collect unique values for each option
  if (first['Option1 Name']) {
    const values = [...new Set(rows.map(r => r['Option1 Value']).filter(Boolean))];
    if (values.length > 0) {
      options.push({
        name: first['Option1 Name'],
        values: values.map(v => ({ name: v }))
      });
    }
  }
  
  if (first['Option2 Name']) {
    const values = [...new Set(rows.map(r => r['Option2 Value']).filter(Boolean))];
    if (values.length > 0) {
      options.push({
        name: first['Option2 Name'],
        values: values.map(v => ({ name: v }))
      });
    }
  }
  
  if (first['Option3 Name']) {
    const values = [...new Set(rows.map(r => r['Option3 Value']).filter(Boolean))];
    if (values.length > 0) {
      options.push({
        name: first['Option3 Name'],
        values: values.map(v => ({ name: v }))
      });
    }
  }
  
  return options;
}

function buildProductInput(handle: string, rows: CSVRow[]): any {
  const first = rows[0];
  const productOptions = buildProductOptions(rows);
  
  // Build product for new ProductCreateInput
  const product: any = {
    handle,
    title: first.Title,
    descriptionHtml: first['Body (HTML)'] || '',
    vendor: first.Vendor || 'H Moon Hydro',
    productType: first.Type || '',
    tags: first.Tags ? first.Tags.split(',').map((t: string) => t.trim()) : [],
    status: first.Status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
  };
  
  // Add options if present
  if (productOptions.length > 0) {
    product.productOptions = productOptions;
  }
  
  return product;
}

// Build variant data for updating after product creation
function buildVariantData(rows: CSVRow[]): any[] {
  return rows.map(row => {
    const optionValues: string[] = [];
    if (row['Option1 Value']) optionValues.push(row['Option1 Value']);
    if (row['Option2 Value']) optionValues.push(row['Option2 Value']);
    if (row['Option3 Value']) optionValues.push(row['Option3 Value']);
    
    return {
      sku: row['Variant SKU'] || undefined,
      price: row['Variant Price'] || '0.00',
      compareAtPrice: row['Variant Compare At Price'] || undefined,
      barcode: row['Variant Barcode'] || undefined,
      weight: row['Variant Grams'] ? parseFloat(row['Variant Grams']) : undefined,
      weightUnit: 'GRAMS',
      inventoryManagement: 'SHOPIFY',
      inventoryPolicy: 'CONTINUE',
      requiresShipping: true,
      taxable: true,
      optionValues: optionValues,
    };
  });
}

function buildMediaInput(rows: CSVRow[]): any[] {
  const media: any[] = [];
  const seenUrls = new Set<string>();
  
  for (const row of rows) {
    const imgSrc = row['Image Src'];
    if (imgSrc && !seenUrls.has(imgSrc)) {
      seenUrls.add(imgSrc);
      media.push({
        originalSource: imgSrc,
        mediaContentType: 'IMAGE',
        alt: row['Image Alt Text'] || row.Title || '',
      });
    }
  }
  
  return media;
}

async function importProduct(handle: string, rows: CSVRow[], dryRun: boolean): Promise<{ success: boolean; error?: string }> {
  const product = buildProductInput(handle, rows);
  const variantData = buildVariantData(rows);
  const media = buildMediaInput(rows);
  
  if (dryRun) {
    console.log(`   [DRY-RUN] Would create: ${product.title}`);
    console.log(`             Type: ${product.productType}`);
    console.log(`             Variants: ${variantData.length}`);
    console.log(`             Images: ${media.length}`);
    return { success: true };
  }
  
  try {
    // Step 1: Create the product with options
    const result = await executeGraphQL<any>(config, CREATE_PRODUCT, { product, media });
    
    if (result.errors?.length) {
      return { success: false, error: result.errors[0].message };
    }
    
    if (result.data?.productCreate?.userErrors?.length > 0) {
      return { success: false, error: result.data.productCreate.userErrors[0].message };
    }
    
    const createdProduct = result.data?.productCreate?.product;
    if (!createdProduct?.id) {
      return { success: false, error: 'No product ID returned' };
    }
    
    // Step 2: Update the default variant with SKU and price from first row
    const defaultVariant = createdProduct.variants?.edges?.[0]?.node;
    if (defaultVariant && variantData.length > 0) {
      const firstVariant = variantData[0];
      
      // Delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
      
      const updateResult = await executeGraphQL<any>(config, UPDATE_VARIANT, {
        productId: createdProduct.id,
        variants: [{
          id: defaultVariant.id,
          price: String(firstVariant.price),
          compareAtPrice: firstVariant.compareAtPrice ? String(firstVariant.compareAtPrice) : undefined,
          barcode: firstVariant.barcode,
          inventoryItem: {
            sku: firstVariant.sku,
            tracked: true,
          }
        }]
      });
      
      if (updateResult.errors?.length) {
        console.log(`   ⚠️  Variant update error: ${updateResult.errors[0].message}`);
      }
      
      if (updateResult.data?.productVariantsBulkUpdate?.userErrors?.length > 0) {
        console.log(`   ⚠️  Variant update warning: ${updateResult.data.productVariantsBulkUpdate.userErrors[0].message}`);
      }
    }
    
    // Step 3: Create additional variants if there are more than one
    if (variantData.length > 1 && createdProduct.options?.length > 0) {
      // Map option names to their IDs
      const optionIdMap = new Map<string, string>();
      for (const opt of createdProduct.options) {
        optionIdMap.set(opt.name, opt.id);
      }
      
      // Build variants for bulk create (skip first since it's the default)
      const bulkVariants = variantData.slice(1).map(v => {
        const variant: any = {
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          barcode: v.barcode,
          inventoryItem: {
            sku: v.sku,
            tracked: true,
          }
        };
        
        // Map option values to option IDs
        if (v.optionValues && v.optionValues.length > 0 && createdProduct.options) {
          variant.optionValues = v.optionValues.map((value: string, idx: number) => {
            const optionName = createdProduct.options[idx]?.name;
            return { optionName, name: value };
          }).filter((ov: any) => ov.optionName);
        }
        
        return variant;
      });
      
      if (bulkVariants.length > 0) {
        const bulkResult = await executeGraphQL<any>(config, CREATE_VARIANTS, {
          productId: createdProduct.id,
          variants: bulkVariants
        });
        
        if (bulkResult.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
          console.log(`   ⚠️  Bulk variant warning: ${bulkResult.data.productVariantsBulkCreate.userErrors[0].message}`);
        }
      }
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  
  // Get wave file to import
  const waveArg = args.find(a => a.startsWith('--wave='));
  const waveName = waveArg ? waveArg.split('=')[1] : 'odor_control';
  
  // Get limit
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📦 SMALL BATCH TEST IMPORT');
  console.log('═'.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes will be made');
    console.log('   Use --confirm to import products\n');
  } else {
    console.log('\n🔴 LIVE MODE - Importing products\n');
  }
  
  // Load wave file
  const waveFile = path.join(__dirname, `../../../outputs/waves/wave_${waveName}.csv`);
  
  if (!fs.existsSync(waveFile)) {
    console.error(`❌ Wave file not found: ${waveFile}`);
    process.exit(1);
  }
  
  console.log(`📁 Loading: wave_${waveName}.csv`);
  
  const content = fs.readFileSync(waveFile, 'utf-8');
  const rows: CSVRow[] = parse(content, { columns: true, skip_empty_lines: true });
  
  console.log(`   Total rows: ${rows.length}`);
  
  // Group by handle
  const products = groupVariantsByHandle(rows);
  console.log(`   Unique products: ${products.size}`);
  console.log(`   Import limit: ${limit}\n`);
  
  // Import products
  let imported = 0;
  let failed = 0;
  let count = 0;
  
  for (const [handle, productRows] of products) {
    if (count >= limit) break;
    count++;
    
    const result = await importProduct(handle, productRows, dryRun);
    
    if (result.success) {
      if (!dryRun) console.log(`   ✅ ${productRows[0].Title}`);
      imported++;
    } else {
      console.log(`   ❌ ${productRows[0].Title}: ${result.error}`);
      failed++;
    }
    
    // Rate limit
    if (!dryRun) await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Imported: ${imported}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Category: ${waveName}`);
  
  console.log('\n📌 USAGE:');
  console.log('   npx tsx src/cli/testImport.ts --wave=nutrients --limit=5 --confirm');
}

main().catch(console.error);
