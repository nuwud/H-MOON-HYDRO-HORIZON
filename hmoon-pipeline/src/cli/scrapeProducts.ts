#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: uploadGreaseImages.ts
 * PURPOSE: Upload missing Grease product images to Shopify CDN
 * 
 * Usage:
 *   npx tsx src/cli/uploadGreaseImages.ts --dry-run
 *   npx tsx src/cli/uploadGreaseImages.ts --confirm
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const WOO_UPLOADS = path.resolve(PROJECT_ROOT, 'hmoonhydro.com/wp-content/uploads/2024/03');
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
  shopifyUrl: string;
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

// Grease images to upload
const GREASE_IMAGES = [
  'AlfaGreasecopy-1-scaled.webp',
  'BloomGrease-1-scaled.webp',
  'BlueGreasecopy-1-scaled.webp',
  'GrowGreasecopy-1-scaled.webp',
  'OGGreasecopy-1-scaled.webp',
  'SuperGrease-1-scaled.webp',
  'GreaseBottle1LAmbercopy_a63f0624-e655-4d29-b26a-0269d7cbfd4e-1-scaled.webp',
  'GreaseBottle1LPurplecopy-1-scaled.webp',
  'GreaseBottle1LYellowcopy-1-scaled.webp',
];

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

// ============================================================================
// Utilities
// ============================================================================

function computeSha1(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function loadManifest(): FilesManifest {
  if (fs.existsSync(MANIFEST_PATH)) {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  }
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    byFilename: {},
    bySha1: {},
    stats: { totalUploaded: 0, lastUpdated: '' },
  };
}

function saveManifest(manifest: FilesManifest): void {
  manifest.stats.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Shopify File Upload via REST API
// ============================================================================

async function getUploadTarget(filename: string, mimeType: string, size: number): Promise<any> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const query = `
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
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({
      query,
      variables: {
        input: [{
          filename,
          mimeType,
          httpMethod: 'POST',
          resource: 'FILE',
          fileSize: String(size),
        }],
      },
    }),
  });
  
  const data = await response.json();
  
  if (data.errors || data.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    throw new Error(JSON.stringify(data.errors || data.data.stagedUploadsCreate.userErrors));
  }
  
  return data.data.stagedUploadsCreate.stagedTargets[0];
}

async function uploadToStagedUrl(target: any, filePath: string, mimeType: string): Promise<void> {
  const formData = new FormData();
  
  // Add parameters from staged upload
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  
  // Add file
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, path.basename(filePath));
  
  const response = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}

async function createFileFromStagedUpload(resourceUrl: string, filename: string): Promise<any> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  
  const query = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            image {
              url
            }
          }
          ... on GenericFile {
            id
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({
      query,
      variables: {
        files: [{
          originalSource: resourceUrl,
          filename,
          contentType: 'IMAGE',
        }],
      },
    }),
  });
  
  const data = await response.json();
  
  if (data.errors || data.data?.fileCreate?.userErrors?.length > 0) {
    throw new Error(JSON.stringify(data.errors || data.data.fileCreate.userErrors));
  }
  
  const file = data.data.fileCreate.files[0];
  return {
    id: file.id,
    url: file.image?.url || file.url,
  };
}

async function uploadImage(filePath: string, manifest: FilesManifest): Promise<ManifestEntry | null> {
  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const sha1 = computeSha1(filePath);
  
  // Check if already uploaded (by SHA1)
  if (manifest.bySha1[sha1]) {
    console.log(`    ⏭️  Already in CDN (SHA1 match)`);
    return null;
  }
  
  // Check if already uploaded (by filename)
  if (manifest.byFilename[filename]) {
    console.log(`    ⏭️  Already in CDN (filename match)`);
    return null;
  }
  
  // Get upload target
  const mimeType = filename.endsWith('.webp') ? 'image/webp' : 
                   filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 
                   'image/png';
  
  const target = await getUploadTarget(filename, mimeType, stat.size);
  
  // Upload to staged URL
  await uploadToStagedUrl(target, filePath, mimeType);
  
  // Create file in Shopify
  const file = await createFileFromStagedUpload(target.resourceUrl, filename);
  
  const entry: ManifestEntry = {
    originalFilename: filename,
    shopifyFilename: filename, // Shopify may rename
    sha1,
    shopifyUrl: file.url,
    shopifyFileId: file.id,
    uploadedAt: new Date().toISOString(),
    originalPath: `2024/03/${filename}`,
    sizeBytes: stat.size,
  };
  
  return entry;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  UPLOAD GREASE IMAGES - H-Moon Hydro Pipeline');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  if (!SHOPIFY_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing Shopify credentials. Set SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN.');
    process.exit(1);
  }
  
  console.log(`  Dry Run: ${isDryRun}`);
  console.log(`  Store: ${SHOPIFY_DOMAIN}`);
  console.log('');
  
  // Load manifest
  const manifest = loadManifest();
  console.log(`  Manifest has ${Object.keys(manifest.byFilename).length} entries\n`);
  
  // Find missing images
  const missing: string[] = [];
  const alreadyUploaded: string[] = [];
  
  for (const filename of GREASE_IMAGES) {
    if (manifest.byFilename[filename]) {
      alreadyUploaded.push(filename);
    } else {
      missing.push(filename);
    }
  }
  
  console.log(`  Already in CDN: ${alreadyUploaded.length}`);
  console.log(`  Need to upload: ${missing.length}\n`);
  
  if (missing.length === 0) {
    console.log('  ✅ All Grease images already in CDN!');
    return;
  }
  
  // Upload missing images
  let uploaded = 0;
  
  for (const filename of missing) {
    const filePath = path.join(WOO_UPLOADS, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ ${filename} - file not found`);
      continue;
    }
    
    console.log(`  📤 ${filename}`);
    
    if (isDryRun) {
      console.log(`    [DRY RUN] Would upload ${filePath}`);
      continue;
    }
    
    try {
      const entry = await uploadImage(filePath, manifest);
      
      if (entry) {
        manifest.byFilename[entry.originalFilename] = entry;
        manifest.bySha1[entry.sha1] = entry;
        manifest.stats.totalUploaded++;
        uploaded++;
        console.log(`    ✅ Uploaded → ${entry.shopifyUrl}`);
      }
      
      // Save manifest after each upload (resumable)
      saveManifest(manifest);
      
      // Throttle
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err: any) {
      console.log(`    ❌ Error: ${err.message}`);
    }
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Already in CDN: ${alreadyUploaded.length}`);
  console.log(`  Total Grease images: ${GREASE_IMAGES.length}`);
  
  if (isDryRun) {
    console.log('\n  [DRY RUN] No images uploaded. Use --confirm to upload.');
  }
  
  console.log('');
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
