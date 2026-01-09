/**
 * Brand Logo Downloader
 * 
 * Downloads brand logos from manufacturer websites and competitor sources.
 * Stores in outputs/brand_logos/ with normalized filenames.
 * 
 * Usage:
 *   npx tsx src/cli/downloadBrandLogos.ts --dry-run     # Preview what would download
 *   npx tsx src/cli/downloadBrandLogos.ts --confirm     # Download all logos
 *   npx tsx src/cli/downloadBrandLogos.ts --brand="Fox Farm"  # Download specific brand
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { KNOWN_BRANDS } from '../utils/brandRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../outputs/brand_logos');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'logo_manifest.json');

// ─────────────────────────────────────────────────────────────────────────────
// Brand Logo Sources
// ─────────────────────────────────────────────────────────────────────────────

interface BrandLogoSource {
  brand: string;
  manufacturerUrl?: string;
  logoUrls: string[];  // Priority order - try first, fall back to others
  searchTerms?: string[];  // For Google Image search fallback
}

/**
 * Known brand logo sources
 * Add manufacturer websites and direct logo URLs here
 */
export const BRAND_LOGO_SOURCES: BrandLogoSource[] = [
  // Nutrient Brands
  {
    brand: 'General Hydroponics',
    manufacturerUrl: 'https://generalhydroponics.com',
    logoUrls: [
      'https://generalhydroponics.com/wp-content/uploads/2020/08/GH-Logo.png',
      'https://cdn.shopify.com/s/files/1/0259/3898/8408/files/gh-logo.png',
    ],
    searchTerms: ['General Hydroponics logo transparent'],
  },
  {
    brand: 'Fox Farm',
    manufacturerUrl: 'https://foxfarm.com',
    logoUrls: [
      'https://foxfarm.com/wp-content/themes/foxfarm/images/logo.svg',
    ],
    searchTerms: ['FoxFarm logo transparent'],
  },
  {
    brand: 'Advanced Nutrients',
    manufacturerUrl: 'https://www.advancednutrients.com',
    logoUrls: [
      'https://www.advancednutrients.com/assets/images/logo.png',
    ],
    searchTerms: ['Advanced Nutrients logo transparent'],
  },
  {
    brand: 'Botanicare',
    manufacturerUrl: 'https://botanicare.com',
    logoUrls: [],
    searchTerms: ['Botanicare logo transparent'],
  },
  {
    brand: 'Canna',
    manufacturerUrl: 'https://www.canna.com',
    logoUrls: [
      'https://www.canna.com/sites/all/themes/canna/logo.svg',
    ],
    searchTerms: ['CANNA nutrients logo'],
  },
  {
    brand: 'Athena',
    manufacturerUrl: 'https://www.athenaproducts.com',
    logoUrls: [],
    searchTerms: ['Athena nutrients logo'],
  },
  {
    brand: 'Humboldt Nutrients',
    manufacturerUrl: 'https://humboldtnutrients.com',
    logoUrls: [],
    searchTerms: ['Humboldt Nutrients logo'],
  },
  {
    brand: 'House & Garden',
    manufacturerUrl: 'https://house-garden.us',
    logoUrls: [],
    searchTerms: ['House and Garden nutrients logo'],
  },
  {
    brand: 'Cyco',
    manufacturerUrl: 'https://www.cycoflower.com',
    logoUrls: [],
    searchTerms: ['Cyco Platinum Series logo'],
  },
  {
    brand: 'Mills',
    manufacturerUrl: 'https://millsnutrients.com',
    logoUrls: [],
    searchTerms: ['Mills Nutrients logo'],
  },
  {
    brand: 'Emerald Harvest',
    manufacturerUrl: 'https://emeraldharvest.com',
    logoUrls: [],
    searchTerms: ['Emerald Harvest logo'],
  },
  {
    brand: 'Remo Nutrients',
    manufacturerUrl: 'https://rfrnutrients.com',
    logoUrls: [],
    searchTerms: ['Remo Nutrients logo'],
  },
  {
    brand: 'Nectar for the Gods',
    manufacturerUrl: 'https://oregonsonly.com',
    logoUrls: [],
    searchTerms: ['Nectar for the Gods logo'],
  },
  {
    brand: 'Heavy 16',
    manufacturerUrl: 'https://heavy16.com',
    logoUrls: [],
    searchTerms: ['Heavy 16 nutrients logo'],
  },
  {
    brand: 'Floraflex',
    manufacturerUrl: 'https://floraflex.com',
    logoUrls: [],
    searchTerms: ['FloraFlex logo'],
  },
  {
    brand: 'Grease',
    manufacturerUrl: 'https://www.growwithgrease.com',
    logoUrls: [],
    searchTerms: ['Grease nutrients logo fermented plant'],
  },
  
  // Lighting Brands
  {
    brand: 'Spider Farmer',
    manufacturerUrl: 'https://www.spider-farmer.com',
    logoUrls: [],
    searchTerms: ['Spider Farmer LED logo'],
  },
  {
    brand: 'Mars Hydro',
    manufacturerUrl: 'https://www.mars-hydro.com',
    logoUrls: [],
    searchTerms: ['Mars Hydro logo'],
  },
  {
    brand: 'Gavita',
    manufacturerUrl: 'https://gavita.com',
    logoUrls: [],
    searchTerms: ['Gavita grow lights logo'],
  },
  {
    brand: 'Fluence',
    manufacturerUrl: 'https://fluence.science',
    logoUrls: [],
    searchTerms: ['Fluence by OSRAM logo'],
  },
  {
    brand: 'Growers Choice',
    manufacturerUrl: 'https://www.growerschoice.com',
    logoUrls: [],
    searchTerms: ['Growers Choice lighting logo'],
  },
  {
    brand: 'HLG',
    manufacturerUrl: 'https://horticulturelightinggroup.com',
    logoUrls: [],
    searchTerms: ['Horticulture Lighting Group HLG logo'],
  },
  {
    brand: 'Lumatek',
    manufacturerUrl: 'https://lumatek-lighting.com',
    logoUrls: [],
    searchTerms: ['Lumatek lighting logo'],
  },
  {
    brand: 'Hortilux',
    manufacturerUrl: 'https://eyehortilux.com',
    logoUrls: [],
    searchTerms: ['Eye Hortilux logo'],
  },
  
  // Environmental/Ventilation Brands
  {
    brand: 'AC Infinity',
    manufacturerUrl: 'https://www.acinfinity.com',
    logoUrls: [
      'https://www.acinfinity.com/images/logo.png',
    ],
    searchTerms: ['AC Infinity logo'],
  },
  {
    brand: 'Can-Fan',
    manufacturerUrl: 'https://can-filters.com',
    logoUrls: [],
    searchTerms: ['Can-Fan Can-Filters logo'],
  },
  {
    brand: 'Phresh',
    manufacturerUrl: 'https://phreshfilter.com',
    logoUrls: [],
    searchTerms: ['Phresh Filter logo'],
  },
  {
    brand: 'TrolMaster',
    manufacturerUrl: 'https://www.trolmaster.com',
    logoUrls: [],
    searchTerms: ['TrolMaster logo'],
  },
  {
    brand: 'Autopilot',
    manufacturerUrl: 'https://autopilotgrows.com',
    logoUrls: [],
    searchTerms: ['Autopilot grow controller logo'],
  },
  {
    brand: 'Inkbird',
    manufacturerUrl: 'https://inkbird.com',
    logoUrls: [],
    searchTerms: ['Inkbird logo'],
  },
  
  // Meters/Instruments
  {
    brand: 'Bluelab',
    manufacturerUrl: 'https://www.bluelab.com',
    logoUrls: [],
    searchTerms: ['Bluelab pH meters logo'],
  },
  {
    brand: 'Apera',
    manufacturerUrl: 'https://aperainst.com',
    logoUrls: [],
    searchTerms: ['Apera Instruments logo'],
  },
  {
    brand: 'Hanna Instruments',
    manufacturerUrl: 'https://www.hannainst.com',
    logoUrls: [],
    searchTerms: ['Hanna Instruments logo'],
  },
  
  // Media/Containers
  {
    brand: 'Grodan',
    manufacturerUrl: 'https://www.grodan.com',
    logoUrls: [],
    searchTerms: ['Grodan rockwool logo'],
  },
  {
    brand: 'Mother Earth',
    manufacturerUrl: 'https://www.motherearthgardening.com',
    logoUrls: [],
    searchTerms: ['Mother Earth coco logo'],
  },
  {
    brand: 'Smart Pot',
    manufacturerUrl: 'https://smartpots.com',
    logoUrls: [],
    searchTerms: ['Smart Pot fabric container logo'],
  },
  {
    brand: 'GeoPot',
    manufacturerUrl: 'https://geopot.com',
    logoUrls: [],
    searchTerms: ['GeoPot fabric pot logo'],
  },
  {
    brand: 'Pro-Mix',
    manufacturerUrl: 'https://www.pthorticulture.com',
    logoUrls: [],
    searchTerms: ['Pro-Mix Premier Tech logo'],
  },
  
  // Cloning/Propagation
  {
    brand: 'Clonex',
    manufacturerUrl: 'https://www.hydrodynamicsintl.com',
    logoUrls: [],
    searchTerms: ['Clonex rooting gel logo'],
  },
  {
    brand: 'EZ Clone',
    manufacturerUrl: 'https://ezclone.com',
    logoUrls: [],
    searchTerms: ['EZ Clone logo'],
  },
  {
    brand: 'Turboklone',
    manufacturerUrl: 'https://turboklone.com',
    logoUrls: [],
    searchTerms: ['TurboKlone logo'],
  },
  
  // Pest Control
  {
    brand: 'Lost Coast',
    manufacturerUrl: 'https://lostcoastplanttherapy.com',
    logoUrls: [],
    searchTerms: ['Lost Coast Plant Therapy logo'],
  },
  {
    brand: 'SNS',
    manufacturerUrl: 'https://sabornutrient.com',
    logoUrls: [],
    searchTerms: ['Sierra Natural Science SNS logo'],
  },
  {
    brand: 'Flying Skull',
    manufacturerUrl: 'https://flyingskull.net',
    logoUrls: [],
    searchTerms: ['Flying Skull Nuke Em logo'],
  },
  
  // House brand
  {
    brand: 'UNO',
    manufacturerUrl: undefined,  // Private label
    logoUrls: [],
    searchTerms: ['UNO hydroponics private label'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Logo Download Functions
// ─────────────────────────────────────────────────────────────────────────────

interface LogoManifestEntry {
  brand: string;
  filename: string;
  source: string;
  downloadedAt: string;
  fileSize: number;
  mimeType: string;
}

interface LogoManifest {
  generatedAt: string;
  totalBrands: number;
  downloadedCount: number;
  missingCount: number;
  logos: LogoManifestEntry[];
  missing: string[];
}

function normalizeFilename(brand: string, ext: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + ext;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Accept': 'image/*,*/*',
      },
    });
    
    if (!response.ok) {
      console.log(`  ✗ Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    
    return { buffer, mimeType: contentType };
  } catch (error) {
    console.log(`  ✗ Error downloading ${url}: ${(error as Error).message}`);
    return null;
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
  };
  return mimeMap[mimeType] || '.png';
}

async function downloadBrandLogo(
  source: BrandLogoSource,
  dryRun: boolean
): Promise<LogoManifestEntry | null> {
  console.log(`\n📦 ${source.brand}`);
  
  // Try each logo URL in priority order
  for (const url of source.logoUrls) {
    console.log(`  → Trying: ${url}`);
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would download from ${url}`);
      return {
        brand: source.brand,
        filename: normalizeFilename(source.brand, '.png'),
        source: url,
        downloadedAt: new Date().toISOString(),
        fileSize: 0,
        mimeType: 'image/png',
      };
    }
    
    const result = await downloadImage(url);
    if (result) {
      const ext = getExtensionFromMime(result.mimeType);
      const filename = normalizeFilename(source.brand, ext);
      const filePath = resolve(OUTPUT_DIR, filename);
      
      writeFileSync(filePath, result.buffer);
      console.log(`  ✓ Downloaded: ${filename} (${result.buffer.length} bytes)`);
      
      return {
        brand: source.brand,
        filename,
        source: url,
        downloadedAt: new Date().toISOString(),
        fileSize: result.buffer.length,
        mimeType: result.mimeType,
      };
    }
  }
  
  // If no direct URLs worked, log for manual download
  if (source.searchTerms?.length) {
    console.log(`  ⚠ No direct URL worked. Manual search: "${source.searchTerms[0]}"`);
  } else if (source.manufacturerUrl) {
    console.log(`  ⚠ No logo URL. Check manufacturer: ${source.manufacturerUrl}`);
  } else {
    console.log(`  ⚠ No logo source available`);
  }
  
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  const brandFilter = args.find(a => a.startsWith('--brand='))?.split('=')[1];
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Brand Logo Downloader');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (use --confirm to download)' : 'DOWNLOADING'}`);
  if (brandFilter) {
    console.log(`  Filter: ${brandFilter}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Filter sources if brand specified
  let sources = BRAND_LOGO_SOURCES;
  if (brandFilter) {
    sources = sources.filter(s => 
      s.brand.toLowerCase().includes(brandFilter.toLowerCase())
    );
    if (sources.length === 0) {
      console.log(`No brands matching "${brandFilter}" found in BRAND_LOGO_SOURCES`);
      return;
    }
  }
  
  console.log(`Found ${sources.length} brands with logo sources`);
  console.log(`Total known brands in registry: ${KNOWN_BRANDS.size}`);
  
  // Download logos
  const manifest: LogoManifest = {
    generatedAt: new Date().toISOString(),
    totalBrands: KNOWN_BRANDS.size,
    downloadedCount: 0,
    missingCount: 0,
    logos: [],
    missing: [],
  };
  
  for (const source of sources) {
    const entry = await downloadBrandLogo(source, dryRun);
    if (entry) {
      manifest.logos.push(entry);
      manifest.downloadedCount++;
    } else {
      manifest.missing.push(source.brand);
      manifest.missingCount++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Find brands without logo sources
  const sourcedBrands = new Set(BRAND_LOGO_SOURCES.map(s => s.brand.toLowerCase()));
  const unsourcedBrands: string[] = [];
  for (const brand of KNOWN_BRANDS) {
    if (!sourcedBrands.has(brand.toLowerCase())) {
      unsourcedBrands.push(brand);
    }
  }
  
  // Write manifest
  if (!dryRun) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`\n✓ Manifest written to ${MANIFEST_PATH}`);
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Downloaded: ${manifest.downloadedCount}`);
  console.log(`  Missing:    ${manifest.missingCount}`);
  console.log(`  Unsourced:  ${unsourcedBrands.length} brands have no logo source config`);
  
  if (manifest.missing.length > 0) {
    console.log('\n  Brands needing manual logo download:');
    manifest.missing.forEach(b => console.log(`    - ${b}`));
  }
  
  if (unsourcedBrands.length > 0 && unsourcedBrands.length <= 20) {
    console.log('\n  Brands without logo source config:');
    unsourcedBrands.slice(0, 10).forEach(b => console.log(`    - ${b}`));
    if (unsourcedBrands.length > 10) {
      console.log(`    ... and ${unsourcedBrands.length - 10} more`);
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
