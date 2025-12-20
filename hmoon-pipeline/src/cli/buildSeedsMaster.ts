/**
 * Catalog Coverage Scanner
 * 
 * Scans all product sources and reports:
 * - Products captured by existing category masters
 * - Uncategorized products with keyword clustering
 * - Recommendations for next category to build
 * 
 * Outputs:
 * - CSVs/coverage_report.json
 * - CSVs/uncategorized_candidates.csv
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readCsvSafe, getColumn, CsvRow } from '../utils/csvSafeRead.js';
import { getBestBrand } from '../utils/brand.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Category Detection Patterns (copied from individual builders)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Record<string, { include: RegExp[]; exclude: RegExp[] }> = {
  airflow: {
    include: [
      /inline\s*fan/i,
      /exhaust\s*fan/i,
      /\bblower\b/i,
      /carbon\s*filter/i,
      /charcoal\s*filter/i,
      /\bcfm\b/i,
      /ac\s*infinity.*(?:cloudline|fan)/i,
      /can-?fan/i,
      /max\s*fan/i,
      /phresh\s*filter/i,
      /air\s*scrubber/i,
      /oscillating\s*fan/i,
      /clip\s*fan/i,
      /grow\s*tent\s*fan/i,
      /wall\s*mount.*fan/i,
    ],
    exclude: [
      /duct|clamp|fitting|damper|flange|reducer|connector|tape|hose/i,
      /timer|controller|thermostat/i,
      /nutrient|fertilizer|grow\s*medium|soil|coco/i,
    ],
  },
  
  lights: {
    include: [
      /grow\s*light/i,
      /led\s*light/i,
      /\bbar\s*light/i,
      /quantum\s*board/i,
      /\bhps\b/i,
      /\bmh\b.*grow/i,
      /\bcmh\b/i,
      /\blec\b/i,
      /spider\s*farmer/i,
      /mars\s*hydro/i,
      /gavita/i,
      /grower'?s?\s*choice/i,
      /\bppfd\b/i,
      /\bpar\b.*(?:light|output|map)/i,
      /full\s*spectrum/i,
      /flower\s*(?:stage|phase)/i,
      /veg\s*(?:stage|phase)/i,
    ],
    exclude: [
      /controller|timer/i,
      /nutrient|fertilizer/i,
      /tent|fan|filter/i,
    ],
  },
  
  tents: {
    include: [
      /grow\s*tent/i,
      /grow\s*room/i,
      /mylar\s*tent/i,
      /indoor\s*grow.*(?:tent|room)/i,
      /\d+x\d+x\d+.*(?:tent|grow)/i,
      /gorilla\s*grow/i,
    ],
    exclude: [
      /clip\s*fan/i,
      /tent\s*fan/i,
      /oscillating/i,
      /for\s*(?:grow\s*)?tent/i,
      /inside\s*(?:grow\s*)?tent/i,
      /pole|clip|hanger|trellis|net|rope/i,
    ],
  },
  
  vent_accessories: {
    include: [
      /\bduct\b/i,
      /\bducting\b/i,
      /\bclamp\b/i,
      /\bflange\b/i,
      /\bdamper\b/i,
      /\breducer\b/i,
      /duct\s*(?:tape|connector|fitting)/i,
      /flex\s*duct/i,
      /aluminum\s*duct/i,
      /insulated\s*duct/i,
      /silencer/i,
      /air\s*stone/i,
    ],
    exclude: [
      /inline\s*fan|exhaust\s*fan|carbon\s*filter/i,
      /nutrient|fertilizer/i,
      /controller|timer/i,
    ],
  },
  
  grow_media: {
    include: [
      /\bcoco\b/i,
      /\bcoir\b/i,
      /\bsoil\b/i,
      /potting\s*mix/i,
      /\bperlite\b/i,
      /\bvermiculite\b/i,
      /rockwool/i,
      /hydroton/i,
      /clay\s*pebbles/i,
      /\bleca\b/i,
      /grow\s*(?:medium|media|cubes)/i,
      /root\s*(?:riot|plugs)/i,
      /rapid\s*rooter/i,
      /starter\s*(?:plugs|cubes)/i,
      /seed\s*starting\s*mix/i,
      /grodan/i,
    ],
    exclude: [
      /nutrient|fertilizer|additive|supplement/i,
      /controller|timer|fan|filter|light/i,
    ],
  },
  
  nutrients: {
    include: [
      /\bnutrient/i,
      /\bfertilizer/i,
      /flora\s*(?:gro|grow|bloom|micro)/i,
      /cal-?mag/i,
      /\bsilica\b/i,
      /ph\s*(?:up|down|adjust)/i,
      /bloom\s*boost/i,
      /bud\s*boost/i,
      /root\s*boost/i,
      /\bbooster\b/i,
      /\badditive\b/i,
      /\bsupplement\b/i,
      /general\s*hydroponics/i,
      /advanced\s*nutrients/i,
      /fox\s*farm.*liquid/i,
      /botanicare.*(?:grow|bloom|pure)/i,
      /voodoo\s*juice/i,
      /big\s*bud/i,
      /maxigro|maxibloom/i,
      /kool\s*bloom/i,
    ],
    exclude: [
      /\bsoil\b(?!.*hydro)/i,
      /potting\s*mix/i,
      /\bcoco\b(?!.*nutrient)/i,
      /rockwool|perlite|hydroton|clay\s*pebbles/i,
      /tent|fan|filter|light|pump|timer|duct/i,
    ],
  },
  
  controllers: {
    include: [
      /\btimer\b/i,
      /\bthermostat\b/i,
      /\bhumidistat\b/i,
      /fan\s*(?:speed\s*)?controller/i,
      /speed\s*controller/i,
      /temp(?:erature)?\s*controller/i,
      /humidity\s*controller/i,
      /co2\s*controller/i,
      /environment(?:al)?\s*controller/i,
      /controller\s*(?:ai|67|69|76)/i,
      /autopilot/i,
      /titan\s*controls/i,
      /repeat\s*cycle/i,
      /24\s*hour.*timer/i,
      /digital\s*timer/i,
      /mechanical\s*timer/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco|media/i,
      /light|led|grow\s*light|hps|cmh/i,
      /fan(?!\s*controller)|filter|duct/i,
      /controller.*(?:not\s*included|sold\s*separately)/i,
    ],
  },
  
  containers: {
    include: [
      /\bpot\b/i,
      /\bpots\b/i,
      /\bbucket\b/i,
      /\breservoir\b/i,
      /\bsaucer\b/i,
      /\btray\b/i,
      /\blid\b/i,
      /fabric\s*pot/i,
      /smart\s*pot/i,
      /root\s*pouch/i,
      /grow\s*bag/i,
      /net\s*(?:pot|cup)/i,
      /\bplanter\b/i,
      /\btote\b/i,
      /plant\s*(?:pot|container)/i,
      /hydro\s*bucket/i,
      /gro\s*pro/i,
      /\d+\s*gal(?:lon)?\b.*(?:pot|bucket|reservoir|fabric|smart|pouch)/i,
    ],
    exclude: [
      /\bseed\b/i,
      /nutrient|fertilizer|additive|supplement/i,
      /\bcoco\b|\bsoil\b|potting\s*mix|\bperlite\b|rockwool/i,
      /fan|filter|duct|inline|exhaust/i,
      /tent|light|led|hps/i,
      /controller|timer|thermostat/i,
      /pot(?:ash|assium)/i,
    ],
  },
  
  harvesting: {
    include: [
      /\btrimmer\b/i,
      /\btrim\s*(?:bin|bowl|tray)\b/i,
      /\bdrying\s*(?:rack|net|screen)\b/i,
      /\bdry\s*rack\b/i,
      /\bscissor/i,
      /\bshear/i,
      /\bsnip/i,
      /\bpruner/i,
      /\bboveda\b/i,
      /\bintegra\s*boost\b/i,
      /\bhumidity\s*pack/i,
      /\bbubble\s*bag/i,
      /\brosin\s*(?:press|bag)\b/i,
      /\bchikamasa\b/i,
      /\bfiskars\b/i,
      /\btriminator\b/i,
      /\bgreenbroz\b/i,
    ],
    exclude: [
      /\bseed\b/i,
      /nutrient|fertilizer/i,
      /\bsoil\b|\bcoco\b|perlite|rockwool/i,
      /fan|filter(?!.*rosin)|duct|tent|light|led|hps/i,
      /controller|timer|pump|reservoir/i,
    ],
  },
  
  seeds: {
    include: [
      /\bseed\b/i,
      /\bseeds\b/i,
      /\bfeminised\b/i,
      /\bfeminized\b/i,
      /\bautoflower/i,
      /\bstrain\b/i,
      /\bgenetics\b/i,
      /humboldt\s*seed/i,
      /greenhouse\s*seed/i,
    ],
    exclude: [
      /seed\s*starting\s*mix/i,
      /seedling\s*(?:tray|dome|heat|mat)/i,
      /nutrient|fertilizer|soil|coco|perlite/i,
      /fan|filter|duct|tent|light|led|hps/i,
      /controller|timer|pump|reservoir|pot|bucket/i,
    ],
  },
  
  ph_meters: {
    include: [
      /\bph\s*meter\b/i,
      /\bph\s*pen\b/i,
      /\bec\s*meter\b/i,
      /\btds\s*meter\b/i,
      /\bcalibration\s*solution\b/i,
      /\belectrode\b/i,
      /\bbluelab\b/i,
      /\bhanna\b/i,
      /\bapera\b/i,
    ],
    exclude: [
      /nutrient(?!.*calibration)/i,
      /fertilizer/i,
      /soil|coco|perlite/i,
      /fan|filter|duct|tent|light/i,
    ],
  },
  
  irrigation: {
    include: [
      /\bpump\b/i,
      /\btubing\b/i,
      /\bfitting\b/i,
      /\bvalve\b/i,
      /\bdrip\b/i,
      /\bemitter\b/i,
      /\bair\s*stone\b/i,
      /\bactive\s*aqua\b/i,
      /\becoplus\b/i,
      /\bfloraflex\b/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan(?!.*pump)|filter(?!.*pump)|duct|tent|light/i,
      /timer(?!.*pump)|controller(?!.*pump)/i,
    ],
  },
  
  propagation: {
    include: [
      /\bclone\b/i,
      /\bcloning\b/i,
      /\brooting\s*(?:gel|powder)\b/i,
      /\bdome\b/i,
      /\bheat\s*mat\b/i,
      /\bclonex\b/i,
      /\bturbo\s*klone\b/i,
      /\bsuper\s*sprouter\b/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan|filter|duct|tent|light/i,
      /pump|reservoir/i,
    ],
  },
  
  odor_control: {
    include: [
      /\bcarbon\s*filter\b/i,
      /\bcan[\s-]?filter\b/i,
      /\bcan[\s-]?lite\b/i,
      /\bphresh\b/i,
      /\bona\b/i,
      /\bodor\s*(?:control|neutralizer)\b/i,
      /\bneutralizer\b/i,
      /\bozone\s*generator\b/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /inline\s*fan|exhaust\s*fan/i,
      /tent|light|led|hps/i,
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Product Pool
// ─────────────────────────────────────────────────────────────────────────────

interface UnifiedProduct {
  id: string;           // Unique identifier (SKU or handle)
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  description: string;
  tags: string;
  categories: string;
  source: 'shopify' | 'woo' | 'inventory' | 'multi';
  shopify: boolean;
  woo: boolean;
  inventory: boolean;
}

function buildUnifiedProductPool(): UnifiedProduct[] {
  console.log('📂 Loading source files...');
  
  // Load all sources
  const shopifyPath = resolve(CSV_DIR, 'products_export_1.csv');
  const wooPath = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  const vendorPath = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  
  const shopifyRows = readCsvSafe(shopifyPath);
  const wooRows = readCsvSafe(wooPath);
  const vendorRows = readCsvSafe(vendorPath);
  
  console.log(`   Shopify: ${shopifyRows.length} rows`);
  console.log(`   WooCommerce: ${wooRows.length} rows`);
  console.log(`   Vendor Inventory: ${vendorRows.length} rows`);
  
  // Build unified map keyed by handle/slug
  const productMap = new Map<string, UnifiedProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = getColumn(row, 'Handle', 'handle');
    const title = getColumn(row, 'Title', 'title');
    const sku = getColumn(row, 'Variant SKU', 'SKU', 'sku');
    
    if (!handle && !title) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    
    if (!productMap.has(key)) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title,
        brand: '',
        vendor: getColumn(row, 'Vendor', 'vendor'),
        description: getColumn(row, 'Body (HTML)', 'Body HTML', 'Description'),
        tags: getColumn(row, 'Tags', 'tags'),
        categories: '',
        source: 'shopify',
        shopify: true,
        woo: false,
        inventory: false,
      });
    } else {
      productMap.get(key)!.shopify = true;
    }
  }
  
  // Process WooCommerce
  for (const row of wooRows) {
    const slug = getColumn(row, 'Slug', 'slug');
    const name = getColumn(row, 'Name', 'name', 'Title');
    const sku = getColumn(row, 'Sku', 'SKU', 'sku');
    
    if (!slug && !name) continue;
    
    const key = slug || sku || name.toLowerCase().replace(/\s+/g, '-');
    
    if (!productMap.has(key)) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title: name,
        brand: getColumn(row, 'Brands', 'Brand', 'brand'),
        vendor: '',
        description: getColumn(row, 'Description', 'Short Description', 'Short description'),
        tags: getColumn(row, 'Tags', 'tags'),
        categories: getColumn(row, 'Categories', 'categories'),
        source: 'woo',
        shopify: false,
        woo: true,
        inventory: false,
      });
    } else {
      const existing = productMap.get(key)!;
      existing.woo = true;
      existing.source = 'multi';
      // Merge data
      if (!existing.brand) existing.brand = getColumn(row, 'Brands', 'Brand', 'brand');
      if (!existing.description) existing.description = getColumn(row, 'Description', 'Short Description');
      if (!existing.categories) existing.categories = getColumn(row, 'Categories', 'categories');
    }
  }
  
  // Process Inventory
  for (const row of vendorRows) {
    const sku = getColumn(row, 'SKU', 'sku', 'Sku');
    const name = getColumn(row, 'Product Name', 'Name', 'name', 'Title', 'Description');
    
    if (!sku && !name) continue;
    
    const key = sku || name.toLowerCase().replace(/\s+/g, '-');
    
    // Try to match by SKU in existing products
    let matched = false;
    for (const [existingKey, product] of productMap) {
      if (product.id === sku || existingKey.includes(sku.toLowerCase())) {
        product.inventory = true;
        product.source = 'multi';
        // Add manufacturer as brand if missing
        if (!product.brand) {
          product.brand = getColumn(row, 'Manufacturer', 'manufacturer', 'Brand');
        }
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title: name,
        brand: getColumn(row, 'Manufacturer', 'manufacturer', 'Brand'),
        vendor: '',
        description: '',
        tags: '',
        categories: '',
        source: 'inventory',
        shopify: false,
        woo: false,
        inventory: true,
      });
    }
  }
  
  // Normalize brands
  const products = Array.from(productMap.values());
  for (const product of products) {
    product.brand = getBestBrand({
      combinedText: `${product.title} ${product.description}`,
      wooBrand: product.brand,
      inventoryManufacturer: product.brand,
      shopifyVendor: product.vendor,
    }) || 'Unknown';
  }
  
  console.log(`\n📦 Unified product pool: ${products.length} unique products\n`);
  
  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Matching
// ─────────────────────────────────────────────────────────────────────────────

function matchesCategory(text: string, category: string): boolean {
  const patterns = CATEGORY_PATTERNS[category];
  if (!patterns) return false;
  
  // Check exclusions first
  if (patterns.exclude.some(p => p.test(text))) {
    return false;
  }
  
  // Then check inclusions
  return patterns.include.some(p => p.test(text));
}

function categorizeProduct(product: UnifiedProduct): string[] {
  const combinedText = [
    product.title,
    product.description,
    product.tags,
    product.categories,
  ].join(' ');
  
  const matched: string[] = [];
  
  for (const category of Object.keys(CATEGORY_PATTERNS)) {
    if (matchesCategory(combinedText, category)) {
      matched.push(category);
    }
  }
  
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword Extraction for Clustering
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'that', 'this', 'these', 'those', 'it', 'its', 'you', 'your', 'we', 'our',
  'amp', 'nbsp', 'quot', 'lt', 'gt', 'html', 'div', 'span', 'class', 'style',
  'product', 'products', 'item', 'items', 'available', 'new', 'sale', 'shop',
  '', 'null', 'undefined', 'true', 'false',
]);

function extractKeywords(text: string): string[] {
  // Remove HTML tags
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase();
  
  // Extract words
  const words = cleaned.match(/[a-z]{3,}/g) || [];
  
  // Filter and return
  return words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scanner
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Catalog Coverage Scanner');
  console.log('============================\n');
  
  const products = buildUnifiedProductPool();
  
  // Categorize all products
  console.log('🔍 Categorizing products...\n');
  
  const categorized: Record<string, UnifiedProduct[]> = {
    airflow: [],
    lights: [],
    tents: [],
    vent_accessories: [],
    grow_media: [],
    nutrients: [],
    controllers: [],
    containers: [],
    harvesting: [],
    seeds: [],
    ph_meters: [],
    irrigation: [],
    propagation: [],
    odor_control: [],
  };
  
  const uncategorized: UnifiedProduct[] = [];
  const multiCategory: UnifiedProduct[] = [];
  
  for (const product of products) {
    const categories = categorizeProduct(product);
    
    if (categories.length === 0) {
      uncategorized.push(product);
    } else if (categories.length > 1) {
      multiCategory.push(product);
      // Add to first matched category
      categorized[categories[0]].push(product);
    } else {
      categorized[categories[0]].push(product);
    }
  }
  
  // Summary
  console.log('📈 Coverage Summary:');
  console.log('────────────────────');
  let totalCategorized = 0;
  for (const [category, items] of Object.entries(categorized)) {
    console.log(`   ${category}: ${items.length} products`);
    totalCategorized += items.length;
  }
  console.log(`\n   ✅ Categorized: ${totalCategorized} (${((totalCategorized / products.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Uncategorized: ${uncategorized.length} (${((uncategorized.length / products.length) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Multi-category: ${multiCategory.length}`);
  
  // Keyword clustering for uncategorized
  console.log('\n\n🔑 Top Keywords in Uncategorized Products:');
  console.log('───────────────────────────────────────────');
  
  const keywordCounts = new Map<string, number>();
  
  for (const product of uncategorized) {
    const text = `${product.title} ${product.categories} ${product.tags}`;
    const keywords = extractKeywords(text);
    
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }
  
  // Sort and show top 50
  const sortedKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  
  for (let i = 0; i < sortedKeywords.length; i++) {
    const [keyword, count] = sortedKeywords[i];
    if (count >= 3) {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${keyword}: ${count}`);
    }
  }
  
  // Suggest next category
  console.log('\n\n💡 Suggested Next Categories (by keyword clusters):');
  console.log('────────────────────────────────────────────────────');
  
  const categoryHints: Record<string, string[]> = {
    'pH/EC Meters & Testing': ['meter', 'tester', 'testing', 'digital', 'calibration', 'probe', 'electrode', 'solution', 'buffer', 'storage'],
    'Propagation': ['clone', 'cloning', 'propagation', 'dome', 'tray', 'humidity', 'rooting', 'hormone', 'gel', 'powder', 'cutting'],
    'Irrigation & Watering': ['pump', 'reservoir', 'tubing', 'irrigation', 'drip', 'water', 'hose', 'fitting', 'valve', 'float', 'submersible'],
    'Pest Control': ['pest', 'insect', 'mite', 'spider', 'fungus', 'spray', 'organic', 'neem', 'pyrethrin', 'sticky', 'trap'],
    'Trellising & Training': ['trellis', 'net', 'netting', 'scrog', 'support', 'stake', 'tie', 'wire', 'clip', 'training', 'bending'],
    'Harvesting & Processing': ['trim', 'trimmer', 'harvest', 'dry', 'drying', 'rack', 'cure', 'curing', 'jar', 'bag', 'turkey'],
    'Containers & Pots': ['pot', 'container', 'fabric', 'smart', 'bucket', 'tote', 'planter', 'gallon', 'saucer', 'riser'],
    'HVAC & Climate': ['dehumidifier', 'humidifier', 'heater', 'air', 'conditioning', 'portable', 'mini', 'split', 'btu'],
    'CO2 Enrichment': ['co2', 'regulator', 'tank', 'generator', 'burner', 'propane', 'natural', 'gas', 'ppm', 'monitor'],
    'Hydroponic Systems': ['hydroponic', 'system', 'dwc', 'nft', 'ebb', 'flow', 'flood', 'drain', 'aeroponics', 'bucket'],
  };
  
  const categoryScores: [string, number, string[]][] = [];
  
  for (const [category, hints] of Object.entries(categoryHints)) {
    let score = 0;
    const matchedHints: string[] = [];
    for (const hint of hints) {
      const count = keywordCounts.get(hint) || 0;
      if (count > 0) {
        score += count;
        matchedHints.push(`${hint}(${count})`);
      }
    }
    if (score > 0) {
      categoryScores.push([category, score, matchedHints]);
    }
  }
  
  categoryScores.sort((a, b) => b[1] - a[1]);
  
  for (const [category, score, hints] of categoryScores.slice(0, 5)) {
    console.log(`\n   🎯 ${category} (score: ${score})`);
    console.log(`      Keywords: ${hints.slice(0, 8).join(', ')}`);
  }
  
  // Output files
  console.log('\n\n📁 Writing output files...');
  
  // Coverage report JSON
  const coverageReport = {
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    categorized: {
      total: totalCategorized,
      percentage: ((totalCategorized / products.length) * 100).toFixed(1),
      byCategory: Object.fromEntries(
        Object.entries(categorized).map(([k, v]) => [k, v.length])
      ),
    },
    uncategorized: {
      total: uncategorized.length,
      percentage: ((uncategorized.length / products.length) * 100).toFixed(1),
    },
    multiCategory: multiCategory.length,
    topKeywords: sortedKeywords.slice(0, 100),
    suggestedNextCategories: categoryScores.slice(0, 5).map(([name, score, hints]) => ({
      name,
      score,
      keywords: hints,
    })),
    sourceBreakdown: {
      shopifyOnly: products.filter(p => p.shopify && !p.woo && !p.inventory).length,
      wooOnly: products.filter(p => p.woo && !p.shopify && !p.inventory).length,
      inventoryOnly: products.filter(p => p.inventory && !p.shopify && !p.woo).length,
      multiSource: products.filter(p => (p.shopify ? 1 : 0) + (p.woo ? 1 : 0) + (p.inventory ? 1 : 0) > 1).length,
    },
  };
  
  const reportPath = resolve(CSV_DIR, 'coverage_report.json');
  writeFileSync(reportPath, JSON.stringify(coverageReport, null, 2));
  console.log(`   ✅ ${reportPath}`);
  
  // Uncategorized candidates CSV
  const csvHeader = 'id,handle,title,brand,vendor,source,shopify,woo,inventory,sample_keywords';
  const csvRows = uncategorized.map(p => {
    const keywords = extractKeywords(`${p.title} ${p.categories}`).slice(0, 5).join(';');
    return [
      `"${(p.id || '').replace(/"/g, '""')}"`,
      `"${(p.handle || '').replace(/"/g, '""')}"`,
      `"${(p.title || '').replace(/"/g, '""')}"`,
      `"${(p.brand || '').replace(/"/g, '""')}"`,
      `"${(p.vendor || '').replace(/"/g, '""')}"`,
      p.source,
      p.shopify ? 'yes' : 'no',
      p.woo ? 'yes' : 'no',
      p.inventory ? 'yes' : 'no',
      `"${keywords}"`,
    ].join(',');
  });
  
  const csvContent = [csvHeader, ...csvRows].join('\n');
  const csvPath = resolve(CSV_DIR, 'uncategorized_candidates.csv');
  writeFileSync(csvPath, csvContent);
  console.log(`   ✅ ${csvPath}`);
  
  // Final recommendation
  if (categoryScores.length > 0) {
    console.log(`\n\n🚀 RECOMMENDATION: Build "${categoryScores[0][0]}" next (${categoryScores[0][1]} keyword matches)`);
  }
  
  console.log('\n✅ Coverage scan complete!');
}

main().catch(console.error);
