/**
 * runFullImportPipeline.ts
 * 
 * Master script that runs the complete product import pipeline in order:
 * 
 * 1. buildCategoryIndexDraft.ts - Normalize categories from all masters
 * 2. buildMasterCatalogIndex.ts - Build unified catalog with enrichment
 * 3. buildShopifyImport.ts      - Generate Shopify-ready CSVs
 * 
 * Usage:
 *   npx tsx src/cli/runFullImportPipeline.ts
 *   npx tsx src/cli/runFullImportPipeline.ts --skip-category  # Skip step 1
 *   npx tsx src/cli/runFullImportPipeline.ts --validate-only  # Only validate outputs
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, '.');
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PipelineStep {
  name: string;
  script: string;
  outputFiles: string[];
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Definition
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STEPS: PipelineStep[] = [
  {
    name: 'Category Index',
    script: 'buildCategoryIndexDraft.ts',
    outputFiles: [
      'category_index_draft.csv',
      'category_conflicts.csv',
      'malformed_rows.csv',
    ],
    description: 'Normalize categories from master spreadsheets',
  },
  {
    name: 'Master Catalog',
    script: 'buildMasterCatalogIndex.ts',
    outputFiles: [
      'master_catalog_index.csv',
    ],
    description: 'Build unified catalog with Shopify/WooCommerce/Inventory enrichment',
  },
  {
    name: 'Shopify Import',
    script: 'buildShopifyImport.ts',
    outputFiles: [
      'shopify_import_ready.csv',
      'shopify_import_draft.csv',
      'sku_resolution_report.csv',
    ],
    description: 'Generate Shopify-ready import CSVs with SKU resolution',
  },
];

// Expected Shopify CSV header
const SHOPIFY_HEADER = 'Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,SEO Title,SEO Description,Gift Card,Status';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              H MOON HYDRO - FULL IMPORT PIPELINE                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
}

function runScript(scriptPath: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    
    const proc = spawn('npx', ['tsx', scriptPath], {
      cwd: CLI_DIR,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    
    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });
    
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });
    
    proc.on('close', (code) => {
      resolve({ success: code === 0, output });
    });
    
    proc.on('error', (err) => {
      output += err.message;
      resolve({ success: false, output });
    });
  });
}

function validateOutputFiles(files: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const file of files) {
    const path = resolve(CSV_DIR, file);
    if (!existsSync(path)) {
      missing.push(file);
    }
  }
  
  return { valid: missing.length === 0, missing };
}

function validateShopifyHeader(): { valid: boolean; message: string } {
  const path = resolve(CSV_DIR, 'shopify_import_ready.csv');
  
  if (!existsSync(path)) {
    return { valid: false, message: 'File does not exist' };
  }
  
  const content = readFileSync(path, 'utf-8');
  const firstLine = content.split(/\r?\n/)[0];
  
  if (firstLine !== SHOPIFY_HEADER) {
    return { valid: false, message: 'Header does not match Shopify schema' };
  }
  
  return { valid: true, message: 'Header matches Shopify schema exactly' };
}

function countCsvRows(filename: string): number {
  const path = resolve(CSV_DIR, filename);
  if (!existsSync(path)) return 0;
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  return Math.max(0, lines.length - 1); // Subtract header
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(options: { skipCategory: boolean; validateOnly: boolean }): Promise<void> {
  printBanner();
  
  const startTime = Date.now();
  const steps = options.skipCategory ? PIPELINE_STEPS.slice(1) : PIPELINE_STEPS;
  
  console.log(`📋 Pipeline: ${steps.length} steps to run\n`);
  
  // Run each step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = i + 1;
    
    console.log('─'.repeat(70));
    console.log(`\n📌 STEP ${stepNum}/${steps.length}: ${step.name}`);
    console.log(`   ${step.description}`);
    console.log(`   Script: ${step.script}\n`);
    
    if (options.validateOnly) {
      console.log('   [VALIDATE ONLY - Skipping execution]');
    } else {
      const scriptPath = resolve(CLI_DIR, step.script);
      const result = await runScript(scriptPath);
      
      if (!result.success) {
        console.error(`\n❌ STEP ${stepNum} FAILED: ${step.name}`);
        console.error(`   Script: ${step.script}`);
        console.error(`   The pipeline has stopped. Please fix the error and re-run.`);
        process.exit(1);
      }
    }
    
    // Validate outputs
    console.log(`\n   📁 Checking output files...`);
    const validation = validateOutputFiles(step.outputFiles);
    
    if (!validation.valid) {
      console.error(`   ❌ Missing files: ${validation.missing.join(', ')}`);
      process.exit(1);
    }
    
    for (const file of step.outputFiles) {
      const count = countCsvRows(file);
      console.log(`   ✓ ${file} (${count} rows)`);
    }
    
    console.log();
  }
  
  // Final validation
  console.log('─'.repeat(70));
  console.log('\n🔍 FINAL VALIDATION');
  console.log('─'.repeat(70));
  
  // Validate Shopify header
  const headerCheck = validateShopifyHeader();
  if (headerCheck.valid) {
    console.log(`\n✅ Shopify header: ${headerCheck.message}`);
  } else {
    console.error(`\n❌ Shopify header: ${headerCheck.message}`);
    process.exit(1);
  }
  
  // Count products
  const readyCount = countCsvRows('shopify_import_ready.csv');
  const draftCount = countCsvRows('shopify_import_draft.csv');
  const totalCount = readyCount + draftCount;
  
  console.log(`\n📦 Product Counts:`);
  console.log(`   Ready to publish: ${readyCount} (${((readyCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`   Draft (needs work): ${draftCount}`);
  console.log(`   Total: ${totalCount}`);
  
  // Timing
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Pipeline completed in ${elapsed}s`);
  
  // Summary
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('✅ PIPELINE COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  
  console.log('\n📋 Output Files:');
  console.log('   CSVs/shopify_import_ready.csv  → Import as Published');
  console.log('   CSVs/shopify_import_draft.csv  → Import as Draft');
  console.log('   CSVs/shopify_collections.json  → Smart Collection definitions');
  console.log('   CSVs/sku_resolution_report.csv → SKU source tracking');
  
  console.log('\n📋 Next Steps:');
  console.log('   1. Wipe existing Shopify products (optional, recommended)');
  console.log('   2. Import shopify_import_ready.csv via Shopify Admin');
  console.log('   3. Import shopify_import_draft.csv via Shopify Admin');
  console.log('   4. Create Smart Collections from shopify_collections.json');
  console.log('   5. Verify 5-10 products in each category');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
H Moon Hydro - Full Import Pipeline

Usage:
  npx tsx src/cli/runFullImportPipeline.ts [options]

Options:
  --skip-category   Skip the category index step (use existing category_index_draft.csv)
  --validate-only   Only validate outputs without running scripts
  --help            Show this help message

Pipeline Steps:
  1. buildCategoryIndexDraft.ts  - Normalize categories from masters
  2. buildMasterCatalogIndex.ts  - Build unified catalog
  3. buildShopifyImport.ts       - Generate Shopify CSVs

Output:
  CSVs/shopify_import_ready.csv  - Published products
  CSVs/shopify_import_draft.csv  - Draft products
  CSVs/sku_resolution_report.csv - SKU tracking
`);
  process.exit(0);
}

const options = {
  skipCategory: args.includes('--skip-category'),
  validateOnly: args.includes('--validate-only'),
};

runPipeline(options).catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
