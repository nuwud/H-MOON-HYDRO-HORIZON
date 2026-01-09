/**
 * Brand Logo Uploader
 * 
 * Uploads downloaded brand logos to Shopify Files CDN.
 * Uses same staged upload workflow as uploadImagesToShopifyFiles.ts
 * 
 * Usage:
 *   npx tsx src/cli/uploadBrandLogos.ts --dry-run    # Preview
 *   npx tsx src/cli/uploadBrandLogos.ts --confirm    # Upload all
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = resolve(__dirname, '../../outputs/brand_logos');
const MANIFEST_PATH = resolve(LOGOS_DIR, 'logo_manifest.json');
const CDN_MANIFEST_PATH = resolve(LOGOS_DIR, 'cdn_manifest.json');

// ─────────────────────────────────────────────────────────────────────────────
// Shopify Config
// ─────────────────────────────────────────────────────────────────────────────

function loadShopifyConfig() {
  const dotenvPath = resolve(__dirname, '../../.env');
  if (existsSync(dotenvPath)) {
    const envContent = readFileSync(dotenvPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }

  const domain = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

  if (!domain || !token) {
    throw new Error('Missing SHOPIFY_DOMAIN or SHOPIFY_ADMIN_TOKEN in .env');
  }

  return { domain, token, apiVersion };
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Operations
// ─────────────────────────────────────────────────────────────────────────────

async function shopifyGraphQL(query: string, variables: Record<string, unknown> = {}) {
  const config = loadShopifyConfig();
  const url = `https://${config.domain}/admin/api/${config.apiVersion}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

async function createStagedUpload(filename: string, mimeType: string, fileSize: number): Promise<StagedUploadTarget> {
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

  const result = await shopifyGraphQL(query, {
    input: [{
      filename,
      mimeType,
      fileSize: String(fileSize),
      httpMethod: 'POST',
      resource: 'FILE',
    }],
  });

  const data = result.data?.stagedUploadsCreate;
  if (data?.userErrors?.length) {
    throw new Error(`Staged upload error: ${JSON.stringify(data.userErrors)}`);
  }

  return data.stagedTargets[0];
}

async function uploadToStagedTarget(target: StagedUploadTarget, fileBuffer: Buffer, filename: string): Promise<void> {
  const formData = new FormData();
  
  // Add all parameters from staged upload
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  
  // Add file last - convert Buffer to Uint8Array for Blob compatibility
  const blob = new Blob([new Uint8Array(fileBuffer)]);
  formData.append('file', blob, filename);

  const response = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }
}

async function createFile(resourceUrl: string, filename: string): Promise<string> {
  const query = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          createdAt
          ... on GenericFile {
            url
          }
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

  const result = await shopifyGraphQL(query, {
    files: [{
      originalSource: resourceUrl,
      alt: `${filename.replace(/\.[^.]+$/, '')} brand logo`,
      contentType: 'IMAGE',
    }],
  });

  const data = result.data?.fileCreate;
  if (data?.userErrors?.length) {
    throw new Error(`File create error: ${JSON.stringify(data.userErrors)}`);
  }

  const file = data.files[0];
  return file.url || file.image?.url || resourceUrl;
}

async function pollForFileReady(fileId: string, maxAttempts = 10): Promise<string | null> {
  const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile {
          url
          fileStatus
        }
        ... on MediaImage {
          image {
            url
          }
          fileStatus
        }
      }
    }
  `;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    
    const result = await shopifyGraphQL(query, { id: fileId });
    const node = result.data?.node;
    
    if (node?.fileStatus === 'READY') {
      return node.url || node.image?.url;
    }
    
    if (node?.fileStatus === 'FAILED') {
      console.log(`    ✗ File processing failed`);
      return null;
    }
  }
  
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Upload Logic
// ─────────────────────────────────────────────────────────────────────────────

interface CdnManifestEntry {
  brand: string;
  filename: string;
  localPath: string;
  cdnUrl: string;
  uploadedAt: string;
  sha1: string;
}

interface CdnManifest {
  generatedAt: string;
  uploadedCount: number;
  entries: CdnManifestEntry[];
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  return mimeMap[ext.toLowerCase()] || 'image/png';
}

function computeSha1(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

async function uploadLogo(
  filepath: string,
  dryRun: boolean
): Promise<CdnManifestEntry | null> {
  const filename = basename(filepath);
  const ext = extname(filename);
  const brand = filename.replace(ext, '').replace(/-/g, ' ');
  
  console.log(`\n📦 ${brand}`);
  console.log(`   File: ${filename}`);
  
  const buffer = readFileSync(filepath);
  const sha1 = computeSha1(buffer);
  const fileSize = statSync(filepath).size;
  const mimeType = getMimeType(ext);
  
  console.log(`   Size: ${fileSize} bytes, SHA1: ${sha1.slice(0, 8)}...`);
  
  if (dryRun) {
    console.log(`   [DRY RUN] Would upload to Shopify Files`);
    return {
      brand,
      filename,
      localPath: filepath,
      cdnUrl: `https://cdn.shopify.com/s/files/.../brand_logos/${filename}`,
      uploadedAt: new Date().toISOString(),
      sha1,
    };
  }
  
  try {
    // Step 1: Create staged upload
    console.log(`   → Creating staged upload...`);
    const target = await createStagedUpload(filename, mimeType, fileSize);
    
    // Step 2: Upload to staged target
    console.log(`   → Uploading to staging...`);
    await uploadToStagedTarget(target, buffer, filename);
    
    // Step 3: Create file in Shopify
    console.log(`   → Creating file record...`);
    const cdnUrl = await createFile(target.resourceUrl, filename);
    
    console.log(`   ✓ Uploaded: ${cdnUrl}`);
    
    return {
      brand,
      filename,
      localPath: filepath,
      cdnUrl,
      uploadedAt: new Date().toISOString(),
      sha1,
    };
  } catch (error) {
    console.log(`   ✗ Error: ${(error as Error).message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Brand Logo Uploader → Shopify Files CDN');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (use --confirm to upload)' : 'UPLOADING'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (!existsSync(LOGOS_DIR)) {
    console.log(`No logos directory found at ${LOGOS_DIR}`);
    console.log('Run `npm run logos:download -- --confirm` first.');
    return;
  }
  
  // Find all logo files
  const files = readdirSync(LOGOS_DIR)
    .filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f))
    .map(f => resolve(LOGOS_DIR, f));
  
  if (files.length === 0) {
    console.log('No logo files found in outputs/brand_logos/');
    console.log('Run `npm run logos:download -- --confirm` first.');
    return;
  }
  
  console.log(`Found ${files.length} logo files to upload\n`);
  
  // Load existing CDN manifest to skip already-uploaded
  let existingManifest: CdnManifest = { generatedAt: '', uploadedCount: 0, entries: [] };
  if (existsSync(CDN_MANIFEST_PATH)) {
    existingManifest = JSON.parse(readFileSync(CDN_MANIFEST_PATH, 'utf-8'));
  }
  
  const existingSha1s = new Set(existingManifest.entries.map(e => e.sha1));
  
  // Upload each logo
  const manifest: CdnManifest = {
    generatedAt: new Date().toISOString(),
    uploadedCount: 0,
    entries: [...existingManifest.entries],  // Preserve existing
  };
  
  let skipped = 0;
  let uploaded = 0;
  let failed = 0;
  
  for (const filepath of files) {
    const buffer = readFileSync(filepath);
    const sha1 = computeSha1(buffer);
    
    if (existingSha1s.has(sha1)) {
      console.log(`⏭ Skipping ${basename(filepath)} (already uploaded)`);
      skipped++;
      continue;
    }
    
    const entry = await uploadLogo(filepath, dryRun);
    if (entry) {
      manifest.entries.push(entry);
      manifest.uploadedCount++;
      uploaded++;
    } else {
      failed++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Save manifest
  if (!dryRun && uploaded > 0) {
    writeFileSync(CDN_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\n✓ CDN manifest written to ${CDN_MANIFEST_PATH}`);
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped:  ${skipped} (already in CDN)`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${manifest.entries.length} logos in manifest`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
