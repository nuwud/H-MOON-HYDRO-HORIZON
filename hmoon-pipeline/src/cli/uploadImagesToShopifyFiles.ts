#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: uploadImagesToShopifyFiles.ts
 * PURPOSE: Upload matched local images to Shopify Files (Phase 3.5)
 * 
 * ⚠️  DO NOT ADD: Consolidation logic, scraping code, or product mutations
 * ⚠️  DO NOT MERGE: Code from consolidateProducts.ts or matchImages.ts
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Uploads matched images from image_matches.json to Shopify Files section.
 * Uses SHA-1 hashing for deduplication - idempotent and resumable.
 * 
 * Outputs:
 * - outputs/files_manifest.json (filename/sha1 -> CDN URL mapping)
 * 
 * Usage:
 *   npx tsx src/cli/uploadImagesToShopifyFiles.ts --dry-run     # Preview
 *   npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm     # Upload
 *   npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm --limit=50
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Support both naming conventions
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// ============================================================================
// Types
// ============================================================================

interface MatchedImage {
  source: 'local' | 'remote';
  originalPath: string;
  absolutePath: string;
  filename: string;
  matchType: string;
  score: number;
  normalizedKey: string;
  position: number;
}

interface ManifestEntry {
  originalFilename: string;   // Original file basename
  shopifyFilename: string;    // Uploaded as: <sha1_8>__<original>
  sha1: string;
  shopifyUrl: string;
  shopifyFileId: string;
  uploadedAt: string;
  originalPath: string;
  sizeBytes: number;
}

interface FilesManifest {
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
const isPing = args.includes('--ping');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// ============================================================================
// Utilities
// ============================================================================

function computeSha1(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function loadManifest(): FilesManifest {
  const manifestPath = path.join(OUTPUTS_DIR, 'files_manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  return {
    byFilename: {},
    bySha1: {},
    stats: { totalUploaded: 0, lastUpdated: new Date().toISOString() }
  };
}

function saveManifest(manifest: FilesManifest): void {
  manifest.stats.lastUpdated = new Date().toISOString();
  manifest.stats.totalUploaded = Object.keys(manifest.byFilename).length;
  const manifestPath = path.join(OUTPUTS_DIR, 'files_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

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
    const text = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} - ${text}`);
  }

  return response.json();
}

// ============================================================================
// Shopify Upload Functions
// ============================================================================

async function uploadToShopifyFiles(
  filePath: string, 
  originalFilename: string,
  shopifyFilename: string,
  sha1: string
): Promise<{ url: string; fileId: string } | null> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(originalFilename).toLowerCase().slice(1);
  
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext] || 'image/jpeg';

  // Step 1: Create staged upload
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const stagedResult = await graphqlRequest(stagedQuery, {
    input: [{
      resource: 'FILE',
      filename: shopifyFilename,
      mimeType: mimeType,
      fileSize: buffer.length.toString(),
      httpMethod: 'POST',
    }],
  });

  if (stagedResult.errors) {
    console.error(`   ❌ GraphQL error:`, stagedResult.errors);
    return null;
  }

  if (stagedResult.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    console.error(`   ❌ Staged upload error:`, stagedResult.data.stagedUploadsCreate.userErrors);
    return null;
  }

  const target = stagedResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    console.error(`   ❌ No staged target returned`);
    return null;
  }

  // Step 2: Upload file to staged URL
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([buffer], { type: mimeType }), shopifyFilename);

  const uploadResponse = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    console.error(`   ❌ Upload failed: ${uploadResponse.status} - ${text.substring(0, 100)}`);
    return null;
  }

  // Step 3: Create file record in Shopify
  const fileCreateQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          createdAt
          ... on MediaImage {
            image {
              url
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

  const fileResult = await graphqlRequest(fileCreateQuery, {
    files: [{
      originalSource: target.resourceUrl,
      contentType: 'IMAGE',
      alt: originalFilename.replace(/\.[^.]+$/, ''),
    }],
  });

  if (fileResult.data?.fileCreate?.userErrors?.length > 0) {
    console.error(`   ❌ File create error:`, fileResult.data.fileCreate.userErrors);
    return null;
  }

  const file = fileResult.data?.fileCreate?.files?.[0];
  if (!file) {
    console.error(`   ❌ No file returned from fileCreate`);
    return null;
  }

  // Step 4: Poll for file to be ready (Shopify processes asynchronously)
  const fileId = file.id;
  let cdnUrl: string | null = null;
  
  const pollQuery = `
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

  // Poll up to 10 times with 1-second delay
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusResult = await graphqlRequest(pollQuery, { ids: [fileId] });
    const node = statusResult.data?.nodes?.[0];
    
    if (node?.fileStatus === 'READY') {
      cdnUrl = node.image?.url || node.url;
      break;
    } else if (node?.fileStatus === 'FAILED') {
      console.error(`   ❌ File processing failed`);
      return null;
    }
  }

  if (!cdnUrl) {
    console.error(`   ⚠️ File still processing after timeout, using resourceUrl`);
    cdnUrl = target.resourceUrl;
  }

  return { url: cdnUrl as string, fileId };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        UPLOAD IMAGES TO SHOPIFY FILES (Phase 3.5)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Validate environment
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing Shopify credentials in .env');
    console.error('   Required: SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN');
    process.exit(1);
  }

  console.log(`🏪 Store: ${SHOPIFY_DOMAIN}`);

  // --ping: Quick smoke test for API connectivity
  if (isPing) {
    console.log('\n🔍 Running API smoke test...\n');
    try {
      const pingQuery = `{
        shop { name primaryDomain { url } }
        files(first: 1) { nodes { id } }
      }`;
      const result = await graphqlRequest(pingQuery);
      console.log(`✅ Connected to: ${result.data?.shop?.name}`);
      console.log(`   Domain: ${result.data?.shop?.primaryDomain?.url}`);
      console.log(`   Files API: ${result.data?.files?.nodes ? 'accessible' : 'no files yet'}`);
      console.log('\n🎉 API connection verified!');
    } catch (error) {
      console.error('❌ API smoke test failed:', error);
      process.exit(1);
    }
    return;
  }

  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE - Will upload files'}`);
  if (limit < Infinity) {
    console.log(`📦 Limit: ${limit} files`);
  }
  console.log();

  // Load image matches
  const matchesPath = path.join(OUTPUTS_DIR, 'image_matches.json');
  if (!fs.existsSync(matchesPath)) {
    console.error('❌ image_matches.json not found. Run matchImages.ts first.');
    process.exit(1);
  }

  const matches: Record<string, MatchedImage[]> = JSON.parse(fs.readFileSync(matchesPath, 'utf-8'));
  console.log(`📷 Loaded matches for ${Object.keys(matches).length} products`);

  // Load existing manifest
  const manifest = loadManifest();
  console.log(`📋 Existing manifest: ${Object.keys(manifest.byFilename).length} files\n`);

  // Collect unique images to upload
  const uniqueImages = new Map<string, { image: MatchedImage; sha1: string }>();
  let missingFiles = 0;

  for (const images of Object.values(matches)) {
    for (const img of images) {
      if (img.source !== 'local') continue;
      
      // Skip if already in uniqueImages (dedup by filename)
      if (uniqueImages.has(img.filename)) continue;
      
      // Check file exists
      if (!fs.existsSync(img.absolutePath)) {
        missingFiles++;
        continue;
      }

      // Compute hash
      const sha1 = computeSha1(img.absolutePath);
      uniqueImages.set(img.filename, { image: img, sha1 });
    }
  }

  console.log(`📷 Found ${uniqueImages.size} unique images to process`);
  if (missingFiles > 0) {
    console.log(`   ⚠️ ${missingFiles} files not found on disk`);
  }

  // Determine what needs uploading
  let toUpload = 0;
  let skippedByHash = 0;
  let skippedByFilename = 0;

  const uploadQueue: Array<{ image: MatchedImage; sha1: string }> = [];

  for (const [filename, { image, sha1 }] of uniqueImages) {
    // SHA1 is authoritative - check content hash FIRST
    if (manifest.bySha1[sha1]) {
      skippedByHash++;
      // Add alias to filename lookup (same content, maybe different filename)
      if (!manifest.byFilename[filename]) {
        manifest.byFilename[filename] = manifest.bySha1[sha1];
      }
      continue;
    }

    // Filename check is secondary (different content with same name = upload anyway)
    if (manifest.byFilename[filename]) {
      // Same filename but different SHA1 - log warning but still upload
      console.log(`   ⚠️ ${filename}: new content (sha1 differs from previous upload)`);
    }

    uploadQueue.push({ image, sha1 });
    toUpload++;
  }

  console.log('\n📊 Upload plan:');
  console.log(`   To upload: ${toUpload}`);
  console.log(`   Skipped (same filename): ${skippedByFilename}`);
  console.log(`   Skipped (same content): ${skippedByHash}`);
  if (missingFiles > 0) {
    console.log(`   Missing files: ${missingFiles}`);
  }
  console.log();

  if (isDryRun) {
    console.log('🔸 DRY RUN - No files will be uploaded');
    console.log('   Run with --confirm to upload');
    
    // Show sample
    if (uploadQueue.length > 0) {
      console.log('\n   Sample files that would be uploaded:');
      uploadQueue.slice(0, 10).forEach(({ image }) => {
        console.log(`     - ${image.filename} (${image.matchType})`);
      });
      if (uploadQueue.length > 10) {
        console.log(`     ... and ${uploadQueue.length - 10} more`);
      }
    }
    
    saveManifest(manifest);
    return;
  }

  // Process uploads
  const processQueue = uploadQueue.slice(0, limit);
  console.log(`🔄 Uploading ${processQueue.length} files...\n`);

  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < processQueue.length; i++) {
    const { image, sha1 } = processQueue[i];
    const progress = `[${i + 1}/${processQueue.length}]`;
    
    // Create collision-proof Shopify filename: <sha1_8>__<original>
    const shopifyFilename = `${sha1.slice(0, 8)}__${image.filename}`;
    const sizeBytes = fs.statSync(image.absolutePath).size;
    
    console.log(`${progress} ${image.filename} → ${shopifyFilename}`);

    try {
      const result = await uploadToShopifyFiles(image.absolutePath, image.filename, shopifyFilename, sha1);
      
      if (result) {
        console.log(`   ✅ ${result.url.substring(0, 60)}...`);
        
        const entry: ManifestEntry = {
          originalFilename: image.filename,
          shopifyFilename,
          sha1,
          shopifyUrl: result.url,
          shopifyFileId: result.fileId,
          uploadedAt: new Date().toISOString(),
          originalPath: image.originalPath,
          sizeBytes,
        };

        // bySha1 is authoritative, byFilename is convenience lookup
        manifest.bySha1[sha1] = entry;
        // Check for filename collision before adding to byFilename
        if (manifest.byFilename[image.filename] && manifest.byFilename[image.filename].sha1 !== sha1) {
          console.log(`   ⚠️ Filename collision: ${image.filename} (keeping newer)`);
        }
        manifest.byFilename[image.filename] = entry;
        uploaded++;

        // Save manifest periodically
        if (uploaded % 10 === 0) {
          saveManifest(manifest);
        }
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
      failed++;
    }

    // Rate limiting - don't hammer the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final save
  saveManifest(manifest);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        UPLOAD SUMMARY                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Processed: ${processQueue.length}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nManifest: ${Object.keys(manifest.byFilename).length} total files`);
  console.log(`Saved to: outputs/files_manifest.json`);
}

main().catch(console.error);
