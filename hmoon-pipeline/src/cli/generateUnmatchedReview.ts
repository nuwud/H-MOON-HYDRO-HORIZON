#!/usr/bin/env npx tsx
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FILE: generateUnmatchedReview.ts
 * PURPOSE: Generate actionable review file for unmatched images
 * 
 * ⚠️  DO NOT ADD: Upload logic, consolidation, or scraping code
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Unmatched Image Review Generator
 * 
 * Scans all local images and compares against image_matches.json to find
 * images that weren't matched. Generates a CSV for manual review with
 * suggested candidates based on filename analysis.
 * 
 * RUN: npx tsx src/cli/generateUnmatchedReview.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUTS_DIR = path.resolve(PROJECT_ROOT, 'outputs');
const WOO_UPLOADS = path.resolve(PROJECT_ROOT, 'hmoonhydro.com/wp-content/uploads');

// Image file extensions
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Thumbnail pattern to skip
const THUMBNAIL_PATTERN = /-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i;

// Known brand tokens
const BRAND_TOKENS = [
  'advanced', 'nutrients', 'general', 'hydroponics', 'fox', 'farm', 'foxfarm',
  'botanicare', 'hortilux', 'gavita', 'phantom', 'sunlight', 'supply',
  'growbright', 'can-filters', 'canfilters', 'active', 'air', 'hydrofarm',
  'sunblaster', 'ona', 'bcuzz', 'plagron', 'biobizz', 'canna', 'house',
  'garden', 'roots', 'organics', 'nectar', 'gods', 'emerald', 'harvest',
  'mammoth', 'recharge', 'athena', 'floraflex', 'autopot', 'blumat'
];

interface MasterProduct {
  handle: string;
  title: string;
  baseTitle?: string;
  vendor?: string;
}

interface MatchedImage {
  originalPath: string;
  filename: string;
}

function extractBrandTokens(filename: string): string[] {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length >= 3);
  return words.filter(w => BRAND_TOKENS.includes(w));
}

function extractKeyWords(filename: string): string[] {
  // Remove extension, numbers, and common suffixes
  let base = filename.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
  base = base.replace(/-\d+x\d+/, '');  // Remove size suffix
  base = base.replace(/[-_]/g, ' ');
  
  const words = base.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  // Filter out very common/generic words
  const generic = new Set(['img', 'image', 'photo', 'pic', 'the', 'and', 'for', 'with', 'new', 'old']);
  return words.filter(w => !generic.has(w) && !/^\d+$/.test(w));
}

function findCandidates(filename: string, products: MasterProduct[]): string[] {
  const keyWords = extractKeyWords(filename);
  const brandTokens = extractBrandTokens(filename);
  
  const candidates: Array<{ handle: string; score: number }> = [];
  
  for (const prod of products) {
    const handleWords = prod.handle.toLowerCase().split('-').filter(w => w.length >= 3);
    
    // Score based on word overlap
    let matchCount = 0;
    for (const kw of keyWords) {
      if (handleWords.some(hw => hw.includes(kw) || kw.includes(hw))) {
        matchCount++;
      }
    }
    
    // Bonus for brand matches
    for (const bt of brandTokens) {
      if (prod.handle.toLowerCase().includes(bt) || (prod.vendor || '').toLowerCase().includes(bt)) {
        matchCount += 2;
      }
    }
    
    if (matchCount >= 1) {
      candidates.push({ handle: prod.handle, score: matchCount });
    }
  }
  
  // Sort by score descending and take top 5
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5).map(c => c.handle);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         UNMATCHED IMAGE REVIEW GENERATOR                      ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Load matched images
  const matchesPath = path.join(OUTPUTS_DIR, 'image_matches.json');
  if (!fs.existsSync(matchesPath)) {
    console.error('❌ image_matches.json not found. Run matchImages.ts first.');
    process.exit(1);
  }
  
  const matches: Record<string, MatchedImage[]> = JSON.parse(fs.readFileSync(matchesPath, 'utf-8'));
  
  // Build set of matched filenames
  const matchedPaths = new Set<string>();
  for (const images of Object.values(matches)) {
    for (const img of images) {
      matchedPaths.add(img.originalPath);
    }
  }
  
  console.log(`📸 Matched images: ${matchedPaths.size}\n`);
  
  // Load master products for candidate suggestions
  const masterPath = path.join(OUTPUTS_DIR, 'master_products.json');
  const products: MasterProduct[] = fs.existsSync(masterPath)
    ? JSON.parse(fs.readFileSync(masterPath, 'utf-8'))
    : [];
  
  console.log(`📦 Products for matching: ${products.length}\n`);
  
  // Scan all images
  console.log('📂 Scanning uploads folder...');
  const unmatched: Array<{
    filename: string;
    relativePath: string;
    absolutePath: string;
    brandTokens: string[];
    candidates: string[];
  }> = [];
  
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  
  for (const year of years) {
    const yearDir = path.join(WOO_UPLOADS, year);
    if (!fs.existsSync(yearDir)) continue;
    
    const months = fs.readdirSync(yearDir).filter(m => /^\d{2}$/.test(m));
    
    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      
      const files = fs.readdirSync(monthDir);
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        if (THUMBNAIL_PATTERN.test(file)) continue;
        
        const relativePath = `${year}/${month}/${file}`;
        
        // Check if matched
        if (matchedPaths.has(relativePath)) continue;
        
        const absolutePath = path.join(monthDir, file);
        const brandTokens = extractBrandTokens(file);
        const candidates = findCandidates(file, products);
        
        unmatched.push({
          filename: file,
          relativePath,
          absolutePath,
          brandTokens,
          candidates
        });
      }
    }
  }
  
  console.log(`📷 Unmatched images: ${unmatched.length}\n`);
  
  // Generate review CSV
  const csvRows = [
    'Filename,Relative Path,Detected Brand Tokens,Suggested Candidates (LOW CONFIDENCE),Manual Handle,Notes'
  ];
  
  for (const img of unmatched) {
    csvRows.push([
      `"${img.filename}"`,
      img.relativePath,
      `"${img.brandTokens.join('; ')}"`,
      `"${img.candidates.join('; ')}"`,
      '',  // Manual handle - to be filled by user
      ''   // Notes - to be filled by user
    ].join(','));
  }
  
  const reviewPath = path.join(OUTPUTS_DIR, 'unmatched_images_review.csv');
  fs.writeFileSync(reviewPath, csvRows.join('\n'));
  console.log(`✅ Saved to: outputs/unmatched_images_review.csv`);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        SUMMARY                                 ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total unmatched: ${unmatched.length}`);
  console.log(`With brand tokens: ${unmatched.filter(u => u.brandTokens.length > 0).length}`);
  console.log(`With candidates: ${unmatched.filter(u => u.candidates.length > 0).length}`);
  
  // Show top unmatched by year
  const byYear = new Map<string, number>();
  for (const img of unmatched) {
    const year = img.relativePath.split('/')[0];
    byYear.set(year, (byYear.get(year) || 0) + 1);
  }
  
  console.log('\nBy year:');
  for (const [year, count] of [...byYear.entries()].sort()) {
    console.log(`  ${year}: ${count}`);
  }
  
  console.log('\n📝 Next steps:');
  console.log('   1. Open outputs/unmatched_images_review.csv');
  console.log('   2. Fill in "Manual Handle" column for images you want to assign');
  console.log('   3. Run applyManualMatches.ts to merge back into master_products.json');
}

main().catch(console.error);
