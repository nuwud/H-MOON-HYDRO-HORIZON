#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: fixManifestUrls.ts
 * PURPOSE: Fetch missing CDN URLs for uploaded files in manifest
 * 
 * Queries Shopify to get the actual CDN URLs for files that were uploaded
 * but didn't have their URLs recorded (async processing issue).
 * 
 * Usage:
 *   npx tsx src/cli/fixManifestUrls.ts --dry-run
 *   npx tsx src/cli/fixManifestUrls.ts --confirm
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const MANIFEST_PATH = path.resolve(OUTPUTS_DIR, 'files_manifest.json');

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// ============================================================================
// Types
// ============================================================================

interface ManifestEntry {
  originalFilename: string;
  shopifyFilename: string;
  sha1: string;
  shopifyUrl?: string;
  shopifyFileId: string;
  uploadedAt: string;
  originalPath: string;
  sizeBytes: number;
}

interface FilesManifest {
  version?: string;
  generatedAt?: string;
  byFilename: Record<string, ManifestEntry>;
  bySha1: Record<string, ManifestEntry>;
  stats: {
    totalUploaded: number;
    lastUpdated: string;
  };
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

// ============================================================================
// GraphQL Client
// ============================================================================

async function graphqlRequest(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FIX MANIFEST URLS - H-Moon Hydro Pipeline');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing Shopify credentials.');
    process.exit(1);
  }
  
  console.log(`  Dry Run: ${isDryRun}`);
  console.log(`  Store: ${SHOPIFY_DOMAIN}\n`);
  
  // Load manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ Manifest not found');
    process.exit(1);
  }
  
  const manifest: FilesManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  
  // Find entries missing shopifyUrl
  const missingUrls: ManifestEntry[] = [];
  for (const entry of Object.values(manifest.byFilename)) {
    if (!entry.shopifyUrl && entry.shopifyFileId) {
      missingUrls.push(entry);
    }
  }
  
  console.log(`  Entries missing URLs: ${missingUrls.length}\n`);
  
  if (missingUrls.length === 0) {
    console.log('  ✅ All entries have URLs!');
    return;
  }
  
  // Query Shopify for file URLs in batches of 50
  const batchSize = 50;
  let fixed = 0;
  
  for (let i = 0; i < missingUrls.length; i += batchSize) {
    const batch = missingUrls.slice(i, i + batchSize);
    const ids = batch.map(e => e.shopifyFileId);
    
    console.log(`  Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} files)...`);
    
    const query = `
      query fileStatus($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on MediaImage {
            id
            fileStatus
            image {
              url
            }
          }
          ... on GenericFile {
            id
            fileStatus
            url
          }
        }
      }
    `;
    
    const result = await graphqlRequest(query, { ids });
    
    for (const node of result.data?.nodes || []) {
      if (!node) continue;
      
      const url = node.image?.url || node.url;
      if (!url) continue;
      
      // Find matching entry by fileId
      const entry = batch.find(e => e.shopifyFileId === node.id);
      if (!entry) continue;
      
      console.log(`    ✅ ${entry.originalFilename}`);
      console.log(`       → ${url.substring(0, 80)}...`);
      
      if (!isDryRun) {
        // Update both byFilename and bySha1
        if (manifest.byFilename[entry.originalFilename]) {
          manifest.byFilename[entry.originalFilename].shopifyUrl = url;
        }
        if (manifest.bySha1[entry.sha1]) {
          manifest.bySha1[entry.sha1].shopifyUrl = url;
        }
        fixed++;
      }
    }
    
    // Throttle between batches
    if (i + batchSize < missingUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Save manifest
  if (!isDryRun && fixed > 0) {
    manifest.stats.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\n  💾 Manifest updated with ${fixed} URLs`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Fixed: ${isDryRun ? '(dry run)' : fixed}`);
  console.log(`  Remaining: ${missingUrls.length - fixed}`);
  
  if (isDryRun) {
    console.log('\n  [DRY RUN] Use --confirm to save changes.');
  }
  
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
