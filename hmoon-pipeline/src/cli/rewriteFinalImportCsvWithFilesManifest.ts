#!/usr/bin/env npx tsx
/**
 * ════════════════════════════════════════════════════════════════════════════════
 * FILE: rewriteFinalImportCsvWithFilesManifest.ts
 * PURPOSE: Rewrite Shopify import CSV to use Shopify CDN URLs from files_manifest.json
 * 
 * Replaces hmoonhydro.com image URLs with cdn.shopify.com URLs by:
 * 1. Extracting filename from the URL
 * 2. Finding the local file in wp-content/uploads
 * 3. Computing SHA1 of the local file
 * 4. Looking up the Shopify CDN URL from files_manifest.json
 * 
 * Usage:
 *   npx tsx src/cli/rewriteFinalImportCsvWithFilesManifest.ts --dry-run
 *   npx tsx src/cli/rewriteFinalImportCsvWithFilesManifest.ts
 *   npx tsx src/cli/rewriteFinalImportCsvWithFilesManifest.ts --in path/to/input.csv --out path/to/output.csv
 * ════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BASE_DIR = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(BASE_DIR, 'outputs');

// ============================================================================
// Types (matching uploadImagesToShopifyFiles.ts)
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
  byFilename: Record<string, ManifestEntry>;
  bySha1: Record<string, ManifestEntry>;
  stats: {
    totalUploaded: number;
    lastUpdated: string;
  };
}

interface GapEntry {
  handle: string;
  sku: string;
  filename: string;
  originalImageSrc: string;
  reason: 'local_not_found' | 'manifest_not_found' | 'thumbnail_no_fallback';
  localPath?: string;
  sha1?: string;
  thumbnailCandidates?: string[];
  searchedPaths?: string[];
}

interface RescueEntry {
  handle: string;
  sku: string;
  originalImageSrc: string;
  originalFilename: string;
  rescuedFilename: string;
  localPath: string;
  cdnUrl: string;
  method: 'thumbnail_fallback' | 'extension_fallback' | 'basename_match';
}

interface RewriteStats {
  totalRows: number;
  rowsWithImages: number;
  alreadyCdn: number;
  rewritten: number;
  rewrittenBySha1: number;
  rewrittenByFilename: number;
  missingLocalFile: number;
  missingManifestEntry: number;
  emptyImageSrc: number;
  otherUrls: number;
  rescuedByThumbnailFallback: number;
  // Multi-image expansion stats
  multiImageRowsDetected: number;
  multiImageRowsExpanded: number;
  multiImageExtraRowsCreated: number;
  // BB cache skip stats
  skippedBbCacheAssets: number;
}

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

const isDryRun = args.includes('--dry-run');
const includeDebugCols = args.includes('--debug-cols');
const enableThumbnailFallback = !args.includes('--no-thumbnail-fallback'); // default: true
const preferLargest = !args.includes('--no-prefer-largest'); // default: true
const fallbackExts = getArg('fallback-exts', 'jpg,jpeg,png,webp,gif').split(',');

// Determine input file (check for _fixed variant first)
const defaultInputFixed = path.resolve(OUTPUTS_DIR, 'shopify_import_final_fixed.csv');
const defaultInputBase = path.resolve(OUTPUTS_DIR, 'shopify_import_final.csv');
const defaultInput = fs.existsSync(defaultInputFixed) ? defaultInputFixed : defaultInputBase;

const inputPath = path.resolve(getArg('in', defaultInput));
const outputPath = path.resolve(getArg('out', path.resolve(OUTPUTS_DIR, 'shopify_import_final_cdn.csv')));
const manifestPath = path.resolve(getArg('manifest', path.resolve(OUTPUTS_DIR, 'files_manifest.json')));
const uploadsRoot = path.resolve(getArg('uploadsRoot', path.resolve(BASE_DIR, 'hmoonhydro.com/wp-content/uploads')));

// ============================================================================
// CSV Parsing (reusing pattern from csvSafeRead.ts)
// ============================================================================

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

// ============================================================================
// File Index Builder (avoids expensive full scans)
// ============================================================================

interface FileIndex {
  byFilename: Map<string, string>;  // filename -> absolute path
  byRelativePath: Map<string, string>;  // year/month/filename -> absolute path
  allFiles: Map<string, string[]>;  // filename -> [absolute paths...] (includes thumbnails)
  byBasename: Map<string, string[]>; // base name (no dims) -> [absolute paths...]
}

function buildFileIndex(uploadsRoot: string): FileIndex {
  console.log('📂 Building file index from uploads directory...');
  
  const index: FileIndex = {
    byFilename: new Map(),
    byRelativePath: new Map(),
    allFiles: new Map(),
    byBasename: new Map(),
  };

  if (!fs.existsSync(uploadsRoot)) {
    console.warn(`⚠️  Uploads root not found: ${uploadsRoot}`);
    return index;
  }

  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  let totalIndexed = 0;
  
  for (const year of years) {
    const yearDir = path.join(uploadsRoot, year);
    if (!fs.existsSync(yearDir)) continue;

    let months: string[] = [];
    try {
      months = fs.readdirSync(yearDir).filter(m => /^\d{2}$/.test(m));
    } catch { continue; }

    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      
      try {
        const files = fs.readdirSync(monthDir);
        
        for (const file of files) {
          if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) continue;

          const absPath = path.join(monthDir, file);
          const relPath = `${year}/${month}/${file}`;
          const lowerFile = file.toLowerCase();
          
          // Always index in allFiles (including thumbnails)
          if (!index.allFiles.has(lowerFile)) {
            index.allFiles.set(lowerFile, []);
          }
          index.allFiles.get(lowerFile)!.push(absPath);
          totalIndexed++;
          
          // Extract base name (without dimensions) for fuzzy matching
          const baseName = lowerFile
            .replace(/-\d{2,4}x\d{2,4}(-\d+)?(\.\w+)$/i, '$2')  // Remove -WxH suffix
            .replace(/-scaled(\.\w+)$/i, '$1');  // Remove -scaled suffix
          
          if (!index.byBasename.has(baseName)) {
            index.byBasename.set(baseName, []);
          }
          index.byBasename.get(baseName)!.push(absPath);
          
          // Skip small thumbnails for primary index (100x100, 150x150, 200x200 etc)
          if (/-\d{2,3}x\d{2,3}\.(jpg|jpeg|png|webp|gif)$/i.test(file)) continue;

          // Index by filename (may overwrite if duplicates, last wins)
          index.byFilename.set(lowerFile, absPath);
          // Index by relative path (unique)
          index.byRelativePath.set(relPath.toLowerCase(), absPath);
        }
      } catch { continue; }
    }
  }

  console.log(`   Indexed ${index.byFilename.size} unique filenames (primary)`);
  console.log(`   Indexed ${index.byRelativePath.size} relative paths`);
  console.log(`   Indexed ${totalIndexed} total files (including thumbnails)`);
  console.log(`   Indexed ${index.byBasename.size} unique base names`);
  
  return index;
}

// ============================================================================
// SHA1 Computation
// ============================================================================

function computeSha1(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

// ============================================================================
// URL Parsing
// ============================================================================

interface ParsedImageUrl {
  filename: string;
  relativePath: string | null;  // e.g., "2019/08/filename.jpg"
}

function parseWooImageUrl(url: string): ParsedImageUrl | null {
  // Match: /wp-content/uploads/YYYY/MM/filename.ext
  const match = url.match(/\/wp-content\/uploads\/(\d{4})\/(\d{2})\/([^/?#]+)/i);
  if (match) {
    const [, year, month, filename] = match;
    return {
      filename,
      relativePath: `${year}/${month}/${filename}`,
    };
  }
  
  // Handle bb-plugin/cache/ URLs
  const bbPluginMatch = url.match(/\/wp-content\/uploads\/bb-plugin\/cache\/([^/?#]+)/i);
  if (bbPluginMatch) {
    return { filename: bbPluginMatch[1], relativePath: null };
  }
  
  // Fallback: just extract filename from URL
  const urlPath = url.split('?')[0];
  const filename = urlPath.split('/').pop();
  if (filename) {
    return { filename, relativePath: null };
  }
  
  return null;
}

// ============================================================================
// Thumbnail Fallback Logic
// ============================================================================

/**
 * Detect if a filename is a WordPress thumbnail variant
 * Patterns: 
 *   name-300x300.jpg
 *   name-200x200-1.webp
 *   name_567x567px-300x300.jpg
 *   name-scaled.jpg
 */
function isWpThumbnailFilename(filename: string): boolean {
  // Match common thumbnail dimension patterns
  const thumbnailPatterns = [
    /-\d{2,4}x\d{2,4}(-\d+)?(\.\w+)$/i,  // name-300x300.jpg, name-300x300-1.jpg
    /-scaled(\.\w+)$/i,                    // name-scaled.jpg
    /_\d{2,4}x\d{2,4}px-\d{2,4}x\d{2,4}/i, // name_567x567px-300x300.jpg
    /-portrait-[a-f0-9]+/i,                // BB plugin cache patterns
    /-square-[a-f0-9]+/i,                  // BB plugin cache patterns
  ];
  
  return thumbnailPatterns.some(p => p.test(filename));
}

/**
 * Parse dimensions from a thumbnail filename (returns [width, height] or null)
 */
function parseThumbnailDimensions(filename: string): [number, number] | null {
  const match = filename.match(/-(\d{2,4})x(\d{2,4})(?:-\d+)?(?:\.\w+)?$/i);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  return null;
}

/**
 * Get "base" name candidates for a thumbnail filename
 * e.g., "image-300x300.jpg" → ["image.jpg"]
 *       "image-300x300-1.webp" → ["image.webp", "image-1.webp"]
 *       "image_567x567px-300x300.jpg" → ["image_567x567px.jpg", "image.jpg"]
 */
function getWpThumbnailCandidates(filename: string, extensions: string[]): string[] {
  const candidates: string[] = [];
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  
  // Pattern 1: name-300x300.jpg → name.jpg
  // Pattern 2: name-300x300-1.jpg → name.jpg, name-1.jpg
  const dimMatch = baseName.match(/^(.+?)-(\d{2,4})x(\d{2,4})(-\d+)?$/i);
  if (dimMatch) {
    const [, base, , , suffix] = dimMatch;
    candidates.push(`${base}${ext}`);
    if (suffix) {
      candidates.push(`${base}${suffix}${ext}`);
    }
    // Also try larger sizes
    candidates.push(`${base}-1200x1200${ext}`);
    candidates.push(`${base}-1200x1328${ext}`);
    candidates.push(`${base}-1200x675${ext}`);
  }
  
  // Pattern 3: name_567x567px-300x300.jpg → name_567x567px.jpg, name.jpg
  const pxMatch = baseName.match(/^(.+?)_(\d+)x(\d+)px-(\d+)x(\d+)/i);
  if (pxMatch) {
    const [, base, w, h] = pxMatch;
    candidates.push(`${base}_${w}x${h}px${ext}`);
    candidates.push(`${base}${ext}`);
    // Try larger sizes of the same pattern
    candidates.push(`${base}_${w}x${h}px-1200x1200${ext}`);
  }
  
  // Pattern 4: name-scaled.jpg → name.jpg
  const scaledMatch = baseName.match(/^(.+?)-scaled$/i);
  if (scaledMatch) {
    candidates.push(`${scaledMatch[1]}${ext}`);
  }
  
  // Pattern 5: BB plugin cache (e.g., HMH_logo_small_03-200x200-portrait-hash-suffix.png)
  const bbMatch = baseName.match(/^(.+?)-\d+x\d+-(portrait|square|landscape)-[a-f0-9]+-\w+$/i);
  if (bbMatch) {
    candidates.push(`${bbMatch[1]}${ext}`);
  }
  
  // Try alternate extensions for all candidates
  const allCandidates = [...candidates];
  for (const candidate of candidates) {
    const candBase = path.basename(candidate, path.extname(candidate));
    for (const altExt of extensions) {
      const altFile = `${candBase}.${altExt}`;
      if (!allCandidates.includes(altFile)) {
        allCandidates.push(altFile);
      }
    }
  }
  
  return [...new Set(allCandidates)]; // dedupe
}

/**
 * Score a candidate file for selection (higher = better)
 * Prefer: larger dimensions, non-thumbnail, certain extensions
 */
function scoreCandidateFile(filename: string): number {
  let score = 100;
  
  // Prefer larger images
  const dims = parseThumbnailDimensions(filename);
  if (dims) {
    score += Math.min(dims[0] * dims[1] / 10000, 200); // up to +200 for large images
  } else {
    // Non-thumbnail (original) gets a bonus
    score += 50;
  }
  
  // Prefer certain extensions
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.webp') score += 10;
  else if (ext === '.jpg' || ext === '.jpeg') score += 5;
  else if (ext === '.png') score += 3;
  
  return score;
}

// ============================================================================
// Main Rewrite Logic
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     REWRITE FINAL IMPORT CSV WITH SHOPIFY CDN URLs');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (no write)' : 'LIVE (will write output)'}`);
  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📄 Output: ${outputPath}`);
  console.log(`📋 Manifest: ${manifestPath}`);
  console.log(`📂 Uploads Root: ${uploadsRoot}\n`);

  // Validate inputs
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input CSV not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`);
    console.error('   Run: npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm');
    process.exit(1);
  }

  // Load manifest
  console.log('📋 Loading files manifest...');
  const manifest: FilesManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`   ${Object.keys(manifest.byFilename).length} entries by filename`);
  console.log(`   ${Object.keys(manifest.bySha1).length} entries by SHA1\n`);

  // Build file index
  const fileIndex = buildFileIndex(uploadsRoot);
  console.log();

  // Read input CSV
  console.log('📄 Reading input CSV...');
  let csvContent = fs.readFileSync(inputPath, 'utf-8');
  
  // Remove BOM if present
  if (csvContent.charCodeAt(0) === 0xFEFF) {
    csvContent = csvContent.slice(1);
  }

  const lines = csvContent.split('\n');
  if (lines.length < 2) {
    console.error('❌ CSV has no data rows');
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]);
  const imageSrcIdx = headers.indexOf('Image Src');
  const handleIdx = headers.indexOf('Handle');
  const skuIdx = headers.indexOf('Variant SKU');
  const titleIdx = headers.indexOf('Title');
  const imagePositionIdx = headers.indexOf('Image Position');

  if (imageSrcIdx === -1) {
    console.error('❌ No "Image Src" column found in CSV');
    process.exit(1);
  }

  console.log(`   ${lines.length - 1} data rows`);
  console.log(`   Image Src column index: ${imageSrcIdx}`);
  
  // ============================================================================
  // STEP 1: Preprocess - Expand multi-image rows (|| delimiter)
  // ============================================================================
  console.log('\n🔄 Step 1: Expanding multi-image rows...');
  
  let multiImageRowsDetected = 0;
  let multiImageRowsExpanded = 0;
  let multiImageExtraRowsCreated = 0;
  let skippedBbCacheAssets = 0;
  
  const expandedRows: string[][] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCsvLine(line);
    const imageSrc = values[imageSrcIdx] || '';
    const title = titleIdx !== -1 ? (values[titleIdx] || '') : '';
    const originalPosition = imagePositionIdx !== -1 ? (values[imagePositionIdx] || '') : '';
    
    // Skip BB plugin cache URLs entirely
    if (imageSrc.includes('/bb-plugin/cache/')) {
      skippedBbCacheAssets++;
      values[imageSrcIdx] = ''; // Clear the image src
      expandedRows.push(values);
      continue;
    }
    
    // Check for multi-image delimiter (||)
    if (imageSrc.includes('||')) {
      multiImageRowsDetected++;
      
      // Only expand on product header rows (rows with Title)
      if (title.trim()) {
        const urls = imageSrc.split('||').map(u => u.trim()).filter(u => u && u.startsWith('http'));
        
        if (urls.length > 1) {
          multiImageRowsExpanded++;
          
          // First URL stays on original row
          values[imageSrcIdx] = urls[0];
          if (imagePositionIdx !== -1 && !originalPosition) {
            values[imagePositionIdx] = '1';
          }
          expandedRows.push([...values]);
          
          // Create additional IMAGE-ONLY rows for extra URLs
          // These rows should have ONLY: Handle, Image Src, Image Position, Image Alt Text
          // All variant and product fields must be cleared
          for (let j = 1; j < urls.length; j++) {
            const clonedRow = [...values];
            clonedRow[imageSrcIdx] = urls[j];
            
            // Skip BB cache URLs in the split
            if (urls[j].includes('/bb-plugin/cache/')) {
              skippedBbCacheAssets++;
              continue;
            }
            
            // Clear ALL fields that are not image-related
            // In Shopify CSV format, additional image rows should ONLY have:
            // Handle, Image Src, Image Position, Image Alt Text
            const imageOnlyFields = new Set(['Handle', 'Image Src', 'Image Position', 'Image Alt Text']);
            for (let k = 0; k < headers.length; k++) {
              const header = headers[k];
              if (!imageOnlyFields.has(header)) {
                clonedRow[k] = '';
              }
            }
            
            // Set Image Position for the additional image
            if (imagePositionIdx !== -1) {
              const basePosition = parseInt(originalPosition) || 1;
              clonedRow[imagePositionIdx] = String(basePosition + j);
            }
            
            expandedRows.push(clonedRow);
            multiImageExtraRowsCreated++;
          }
        } else if (urls.length === 1) {
          // Only one valid URL after split
          values[imageSrcIdx] = urls[0];
          expandedRows.push(values);
        } else {
          // No valid URLs
          values[imageSrcIdx] = '';
          expandedRows.push(values);
        }
      } else {
        // Variant row with multi-image - just take first URL, don't expand
        const urls = imageSrc.split('||').map(u => u.trim()).filter(u => u && u.startsWith('http'));
        values[imageSrcIdx] = urls[0] || '';
        expandedRows.push(values);
      }
    } else {
      // No delimiter, keep as-is
      expandedRows.push(values);
    }
  }
  
  console.log(`   Multi-image rows detected: ${multiImageRowsDetected}`);
  console.log(`   Multi-image rows expanded: ${multiImageRowsExpanded}`);
  console.log(`   Extra rows created: ${multiImageExtraRowsCreated}`);
  console.log(`   BB cache assets skipped: ${skippedBbCacheAssets}`);
  console.log(`   Total rows after expansion: ${expandedRows.length}\n`);

  // Prepare output headers (optionally add debug columns)
  let outputHeaders = [...headers];
  if (includeDebugCols) {
    outputHeaders.push('_Image_Local_Path', '_Image_SHA1', '_Image_Lookup_Source');
  }

  // ============================================================================
  // STEP 2: Process rows - rewrite URLs to CDN
  // ============================================================================
  console.log('🔄 Step 2: Rewriting URLs to CDN...');
  
  const stats: RewriteStats = {
    totalRows: 0,
    rowsWithImages: 0,
    alreadyCdn: 0,
    rewritten: 0,
    rewrittenBySha1: 0,
    rewrittenByFilename: 0,
    missingLocalFile: 0,
    missingManifestEntry: 0,
    emptyImageSrc: 0,
    otherUrls: 0,
    rescuedByThumbnailFallback: 0,
    multiImageRowsDetected,
    multiImageRowsExpanded,
    multiImageExtraRowsCreated,
    skippedBbCacheAssets,
  };

  const gaps: GapEntry[] = [];
  const rescues: RescueEntry[] = [];
  const outputLines: string[] = [outputHeaders.map(escapeCsvValue).join(',')];

  // Process the expanded rows
  for (let i = 0; i < expandedRows.length; i++) {
    const values = expandedRows[i];

    stats.totalRows++;
    const imageSrc = values[imageSrcIdx] || '';
    const handle = handleIdx !== -1 ? (values[handleIdx] || '') : '';
    const sku = skuIdx !== -1 ? (values[skuIdx] || '') : '';

    let newImageSrc = imageSrc;
    let debugLocalPath = '';
    let debugSha1 = '';
    let debugSource = 'none';

    if (!imageSrc.trim()) {
      // Empty image src
      stats.emptyImageSrc++;
    } else if (imageSrc.includes('cdn.shopify.com')) {
      // Already a Shopify CDN URL
      stats.alreadyCdn++;
      stats.rowsWithImages++;
      debugSource = 'already_cdn';
    } else if (imageSrc.includes('hmoonhydro.com/wp-content/uploads')) {
      // WooCommerce URL - needs rewriting
      stats.rowsWithImages++;
      
      const parsed = parseWooImageUrl(imageSrc);
      if (!parsed) {
        stats.otherUrls++;
      } else {
        // Try to find local file
        let localPath: string | null = null;
        
        // Priority 1: Look up by relative path (year/month/filename)
        if (parsed.relativePath) {
          localPath = fileIndex.byRelativePath.get(parsed.relativePath.toLowerCase()) || null;
        }
        
        // Priority 2: Look up by filename only
        if (!localPath) {
          localPath = fileIndex.byFilename.get(parsed.filename.toLowerCase()) || null;
        }

        if (!localPath || !fs.existsSync(localPath)) {
          // Local file not found - try thumbnail fallback
          let rescued = false;
          const thumbnailCandidates: string[] = [];
          const searchedPaths: string[] = [parsed.filename];
          
          if (enableThumbnailFallback && isWpThumbnailFilename(parsed.filename)) {
            const candidates = getWpThumbnailCandidates(parsed.filename, fallbackExts);
            thumbnailCandidates.push(...candidates);
            
            // Collect all matching local files for candidates
            const matchingFiles: { path: string; filename: string; score: number }[] = [];
            
            for (const candidate of candidates) {
              searchedPaths.push(candidate);
              const lowerCandidate = candidate.toLowerCase();
              
              // Check primary index
              const primaryPath = fileIndex.byFilename.get(lowerCandidate);
              if (primaryPath && fs.existsSync(primaryPath)) {
                matchingFiles.push({
                  path: primaryPath,
                  filename: candidate,
                  score: scoreCandidateFile(path.basename(primaryPath)),
                });
              }
              
              // Check allFiles index for thumbnails we might have skipped
              const allPaths = fileIndex.allFiles.get(lowerCandidate);
              if (allPaths) {
                for (const p of allPaths) {
                  if (fs.existsSync(p) && !matchingFiles.some(m => m.path === p)) {
                    matchingFiles.push({
                      path: p,
                      filename: path.basename(p),
                      score: scoreCandidateFile(path.basename(p)),
                    });
                  }
                }
              }
            }
            
            // Also try base name matching (without dimensions)
            const baseName = parsed.filename.toLowerCase()
              .replace(/-\d{2,4}x\d{2,4}(-\d+)?(\.\w+)$/i, '$2')
              .replace(/-scaled(\.\w+)$/i, '$1')
              .replace(/_\d+x\d+px-\d+x\d+(\.\w+)$/i, '$1');
            
            const baseNameMatches = fileIndex.byBasename.get(baseName);
            if (baseNameMatches) {
              for (const p of baseNameMatches) {
                if (fs.existsSync(p) && !matchingFiles.some(m => m.path === p)) {
                  matchingFiles.push({
                    path: p,
                    filename: path.basename(p),
                    score: scoreCandidateFile(path.basename(p)),
                  });
                }
              }
            }
            
            // Sort by score (highest first) if preferLargest
            if (preferLargest) {
              matchingFiles.sort((a, b) => b.score - a.score);
            }
            
            // Try to find a manifest entry for any matching file
            for (const match of matchingFiles) {
              const fallbackSha1 = computeSha1(match.path);
              let entry: ManifestEntry | undefined;
              let method: RescueEntry['method'] = 'thumbnail_fallback';
              
              if (manifest.bySha1[fallbackSha1]) {
                entry = manifest.bySha1[fallbackSha1];
              } else if (manifest.byFilename[match.filename]) {
                entry = manifest.byFilename[match.filename];
              } else if (manifest.byFilename[match.filename.toLowerCase()]) {
                entry = manifest.byFilename[match.filename.toLowerCase()];
              }
              
              if (entry) {
                // Found a fallback!
                newImageSrc = entry.shopifyUrl;
                debugLocalPath = match.path;
                debugSha1 = fallbackSha1;
                debugSource = 'thumbnail_fallback';
                stats.rewritten++;
                stats.rescuedByThumbnailFallback++;
                rescued = true;
                
                rescues.push({
                  handle,
                  sku,
                  originalImageSrc: imageSrc,
                  originalFilename: parsed.filename,
                  rescuedFilename: match.filename,
                  localPath: match.path,
                  cdnUrl: entry.shopifyUrl,
                  method,
                });
                break;
              }
            }
          }
          
          if (!rescued) {
            stats.missingLocalFile++;
            gaps.push({
              handle,
              sku,
              filename: parsed.filename,
              originalImageSrc: imageSrc,
              reason: thumbnailCandidates.length > 0 ? 'thumbnail_no_fallback' : 'local_not_found',
              thumbnailCandidates: thumbnailCandidates.length > 0 ? thumbnailCandidates.slice(0, 10) : undefined,
              searchedPaths: searchedPaths.length > 1 ? searchedPaths.slice(0, 15) : undefined,
            });
          }
        } else {
          // Compute SHA1 of local file
          const sha1 = computeSha1(localPath);
          debugLocalPath = localPath;
          debugSha1 = sha1;

          // Look up in manifest (SHA1 first, then filename)
          let entry: ManifestEntry | undefined;
          let lookupSource: 'sha1' | 'filename' | null = null;

          if (manifest.bySha1[sha1]) {
            entry = manifest.bySha1[sha1];
            lookupSource = 'sha1';
          } else if (manifest.byFilename[parsed.filename]) {
            entry = manifest.byFilename[parsed.filename];
            lookupSource = 'filename';
          }

          if (entry) {
            newImageSrc = entry.shopifyUrl;
            stats.rewritten++;
            if (lookupSource === 'sha1') {
              stats.rewrittenBySha1++;
              debugSource = 'sha1';
            } else {
              stats.rewrittenByFilename++;
              debugSource = 'filename';
            }
          } else {
            // Not in manifest
            stats.missingManifestEntry++;
            gaps.push({
              handle,
              sku,
              filename: parsed.filename,
              originalImageSrc: imageSrc,
              reason: 'manifest_not_found',
              localPath,
              sha1,
            });
          }
        }
      }
    } else if (imageSrc.startsWith('http')) {
      // Other external URL (not hmoonhydro.com)
      stats.otherUrls++;
      stats.rowsWithImages++;
    }

    // Build output row
    values[imageSrcIdx] = newImageSrc;
    let outputRow = values.map(escapeCsvValue).join(',');
    
    if (includeDebugCols) {
      outputRow += ',' + [debugLocalPath, debugSha1, debugSource].map(escapeCsvValue).join(',');
    }
    
    outputLines.push(outputRow);

    // Progress indicator
    if (stats.totalRows % 500 === 0) {
      console.log(`   Processed ${stats.totalRows} rows...`);
    }
  }

  console.log(`   Processed ${stats.totalRows} total rows\n`);

  // Write output
  if (!isDryRun) {
    console.log('📝 Writing output CSV...');
    fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
    console.log(`   Written: ${outputPath}\n`);

    // Write gap report
    const gapReportPath = path.resolve(OUTPUTS_DIR, 'image_rewrite_gaps.json');
    fs.writeFileSync(gapReportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      stats: {
        totalGaps: gaps.length,
        localNotFound: stats.missingLocalFile,
        manifestNotFound: stats.missingManifestEntry,
        thumbnailFallbackEnabled: enableThumbnailFallback,
      },
      gaps,
    }, null, 2), 'utf-8');
    console.log(`📋 Gap report: ${gapReportPath}`);

    // Write rescue report
    if (rescues.length > 0) {
      const rescueReportPath = path.resolve(OUTPUTS_DIR, 'image_rewrite_rescues.json');
      fs.writeFileSync(rescueReportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        stats: {
          totalRescued: rescues.length,
          byMethod: {
            thumbnail_fallback: rescues.filter(r => r.method === 'thumbnail_fallback').length,
            extension_fallback: rescues.filter(r => r.method === 'extension_fallback').length,
            basename_match: rescues.filter(r => r.method === 'basename_match').length,
          },
        },
        rescues,
      }, null, 2), 'utf-8');
      console.log(`🔧 Rescue report: ${rescueReportPath}`);
    }
    console.log();
  } else {
    console.log('🔸 DRY RUN - No files written\n');
  }

  // Print summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Multi-image expansion stats
  if (stats.multiImageRowsDetected > 0) {
    console.log(`\n📸 Multi-Image Expansion:`);
    console.log(`   Rows with || delimiter: ${stats.multiImageRowsDetected}`);
    console.log(`   Rows expanded:         ${stats.multiImageRowsExpanded}`);
    console.log(`   Extra rows created:    ${stats.multiImageExtraRowsCreated}`);
  }
  
  if (stats.skippedBbCacheAssets > 0) {
    console.log(`\n🗑️  BB Cache Assets Skipped: ${stats.skippedBbCacheAssets}`);
  }
  
  console.log(`\n📊 Row Statistics:`);
  console.log(`   Total rows:          ${stats.totalRows}`);
  console.log(`   Rows with images:    ${stats.rowsWithImages}`);
  console.log(`   Empty Image Src:     ${stats.emptyImageSrc}`);
  console.log();
  console.log(`📷 Image URL Results:`);
  console.log(`   Already CDN:         ${stats.alreadyCdn} ✅`);
  console.log(`   Rewritten to CDN:    ${stats.rewritten} ✅`);
  console.log(`     - via SHA1:        ${stats.rewrittenBySha1}`);
  console.log(`     - via filename:    ${stats.rewrittenByFilename}`);
  if (stats.rescuedByThumbnailFallback > 0) {
    console.log(`     - via fallback:    ${stats.rescuedByThumbnailFallback} 🔧`);
  }
  console.log(`   Other URLs (kept):   ${stats.otherUrls}`);
  console.log();
  console.log(`⚠️  Gaps (not rewritten):`);
  console.log(`   Local file missing:  ${stats.missingLocalFile}`);
  console.log(`   Manifest missing:    ${stats.missingManifestEntry}`);
  console.log(`   Total gaps:          ${gaps.length}`);

  const successRate = stats.rowsWithImages > 0 
    ? ((stats.alreadyCdn + stats.rewritten) / stats.rowsWithImages * 100).toFixed(1)
    : '0.0';
  console.log(`\n✨ CDN Success Rate: ${successRate}%`);

  if (stats.rescuedByThumbnailFallback > 0) {
    console.log(`🔧 Thumbnail Fallback Rescues: ${stats.rescuedByThumbnailFallback}`);
  }

  if (gaps.length > 0 && !isDryRun) {
    console.log(`\n📋 Review gaps in: outputs/image_rewrite_gaps.json`);
    if (stats.missingManifestEntry > 0) {
      console.log(`   To fix missing manifest entries, run:`);
      console.log(`   npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
