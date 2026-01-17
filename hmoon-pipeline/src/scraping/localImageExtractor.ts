/**
 * WooCommerce Local Image Extractor
 * 
 * Extracts and maps product images from the local WooCommerce backup
 * to use as a fallback when manufacturer sites block scraping.
 */

import * as fs from 'fs';
import * as path from 'path';

const WOO_UPLOADS_PATH = path.resolve(
  __dirname, 
  '../../../../hmoonhydro.com/wp-content/uploads'
);

export interface LocalImageMatch {
  productSlug: string;
  imagePath: string;
  imageUrl: string;  // Relative URL for reference
  size: 'full' | 'scaled' | 'thumbnail';
  width?: number;
  height?: number;
}

/**
 * Known Grease product image mappings
 * Maps product handle → local image filename pattern
 */
export const GREASE_IMAGE_MAP: Record<string, string> = {
  'alfa-grease-alfalfa-extract': 'AlfaGreasecopy-1',
  'bloom-grease-fermented-flowering-plant-juice': 'BloomGrease-1',
  'blue-grease-algae-extract': 'BlueGreasecopy-1',
  'grow-grease-fermented-vegetative-plant-juice': 'GrowGreasecopy-1',
  'og-grease-trace-booster': 'OGGreasecopy-1',
  'super-grease-canna-super-labs': 'SuperGrease-1',
  'amber-label-sativa': 'GreaseBottle1LAmbercopy_a63f0624-e655-4d29-b26a-0269d7cbfd4e-1',
  'purple-label-indica': 'GreaseBottle1LPurplecopy-1',
  'yellow-label-finisher': 'GreaseBottle1LYellowcopy-1',
};

/**
 * Find local images matching a product
 */
export function findLocalImages(productSlug: string): LocalImageMatch[] {
  const pattern = GREASE_IMAGE_MAP[productSlug];
  if (!pattern) return [];
  
  const results: LocalImageMatch[] = [];
  
  // Check 2024/03 directory (where Grease images are)
  const uploadDir = path.join(WOO_UPLOADS_PATH, '2024', '03');
  
  if (!fs.existsSync(uploadDir)) {
    console.warn(`Upload directory not found: ${uploadDir}`);
    return [];
  }
  
  const files = fs.readdirSync(uploadDir);
  
  for (const file of files) {
    if (file.includes(pattern)) {
      const filePath = path.join(uploadDir, file);
      const stat = fs.statSync(filePath);
      
      // Determine size type
      let size: 'full' | 'scaled' | 'thumbnail' = 'full';
      if (file.includes('-scaled')) size = 'scaled';
      else if (file.includes('-100x100') || file.includes('-thumbnail')) size = 'thumbnail';
      
      // Extract dimensions if present
      const dimMatch = file.match(/(\d+)x(\d+)/);
      const width = dimMatch ? parseInt(dimMatch[1]) : undefined;
      const height = dimMatch ? parseInt(dimMatch[2]) : undefined;
      
      results.push({
        productSlug,
        imagePath: filePath,
        imageUrl: `/wp-content/uploads/2024/03/${file}`,
        size,
        width,
        height,
      });
    }
  }
  
  // Sort: scaled first, then by size (largest first)
  return results.sort((a, b) => {
    if (a.size === 'scaled' && b.size !== 'scaled') return -1;
    if (b.size === 'scaled' && a.size !== 'scaled') return 1;
    return (b.width || 0) - (a.width || 0);
  });
}

/**
 * Get best image for a product (highest quality)
 */
export function getBestImage(productSlug: string): LocalImageMatch | undefined {
  const images = findLocalImages(productSlug);
  // Prefer -scaled.webp (full resolution without dimensions in filename)
  const scaled = images.find(img => 
    img.imagePath.endsWith('-scaled.webp') && 
    !img.imagePath.match(/\d+x\d+/)
  );
  return scaled || images[0];
}

/**
 * Generate a Grease image manifest for enrichment
 */
export function generateGreaseManifest(): Record<string, LocalImageMatch> {
  const manifest: Record<string, LocalImageMatch> = {};
  
  for (const slug of Object.keys(GREASE_IMAGE_MAP)) {
    const best = getBestImage(slug);
    if (best) {
      manifest[slug] = best;
    }
  }
  
  return manifest;
}

/**
 * CLI: Generate manifest and output to file
 */
async function main() {
  const manifest = generateGreaseManifest();
  
  console.log('Grease Product Image Manifest:');
  console.log('==============================');
  
  for (const [slug, image] of Object.entries(manifest)) {
    console.log(`${slug}:`);
    console.log(`  Path: ${image.imagePath}`);
    console.log(`  Size: ${image.size}`);
    console.log('');
  }
  
  // Write manifest to outputs
  const outputPath = path.resolve(__dirname, '../../outputs/grease_image_manifest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  
  console.log(`\nManifest written to: ${outputPath}`);
  console.log(`Total products with images: ${Object.keys(manifest).length}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
