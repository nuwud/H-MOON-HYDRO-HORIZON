/**
 * buildShopifyCollections.ts
 * 
 * Generates Shopify Smart Collection rules from category data
 * 
 * Outputs:
 *   - shopify_collections.json    (Smart Collection definitions)
 *   - shopify_collections.csv     (For manual reference)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SmartCollection {
  title: string;
  handle: string;
  body_html: string;
  sort_order: string;
  published: boolean;
  disjunctive: boolean;
  rules: CollectionRule[];
  image?: { src: string; alt: string };
  seo?: { title: string; description: string };
}

interface CollectionRule {
  column: 'tag' | 'title' | 'type' | 'vendor' | 'variant_price' | 'variant_compare_at_price' | 'variant_inventory';
  relation: 'equals' | 'not_equals' | 'starts_with' | 'ends_with' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
  condition: string;
}

// Category display names and descriptions
const CATEGORY_META: Record<string, { name: string; description: string; seo: string }> = {
  nutrients: {
    name: 'Nutrients & Supplements',
    description: 'Premium plant nutrients, fertilizers, and supplements for every growth stage.',
    seo: 'Shop hydroponic nutrients, fertilizers, and plant supplements. General Hydroponics, Advanced Nutrients, Botanicare and more.',
  },
  grow_media: {
    name: 'Grow Media',
    description: 'Quality growing mediums including rockwool, coco coir, perlite, and hydro stones.',
    seo: 'Hydroponic grow media, coco coir, rockwool, perlite, clay pebbles. Professional growing substrates.',
  },
  irrigation: {
    name: 'Irrigation & Watering',
    description: 'Drip systems, pumps, tubing, fittings, and automated watering solutions.',
    seo: 'Hydroponic irrigation systems, pumps, tubing, drip systems. Automated watering for indoor gardens.',
  },
  ph_meters: {
    name: 'pH & Water Testing',
    description: 'pH meters, EC meters, TDS testers, and calibration solutions for precise water management.',
    seo: 'pH meters, EC testers, TDS meters, calibration solutions. Water quality testing for hydroponics.',
  },
  grow_lights: {
    name: 'Grow Lights',
    description: 'LED grow lights, HPS, MH, and T5 fluorescent lighting systems.',
    seo: 'LED grow lights, HPS, MH, T5 fluorescent. Professional indoor grow lighting systems.',
  },
  hid_bulbs: {
    name: 'HID Bulbs & Lamps',
    description: 'Replacement HPS, MH, and CMH bulbs for high-intensity grow lights.',
    seo: 'HPS bulbs, MH bulbs, CMH lamps. Replacement grow light bulbs for indoor gardens.',
  },
  airflow: {
    name: 'Airflow & Ventilation',
    description: 'Inline fans, ducting, carbon filters, and climate control equipment.',
    seo: 'Inline fans, ducting, ventilation systems for grow rooms. Climate control equipment.',
  },
  odor_control: {
    name: 'Odor Control',
    description: 'Carbon filters, ONA products, and odor neutralizers for discreet growing.',
    seo: 'Carbon filters, ONA gel, odor neutralizers. Grow room odor control solutions.',
  },
  water_filtration: {
    name: 'Water Filtration',
    description: 'Reverse osmosis systems, carbon filters, and water treatment for pure, clean water.',
    seo: 'RO systems, water filters, water treatment. Clean water for hydroponic gardens.',
  },
  containers_pots: {
    name: 'Containers & Pots',
    description: 'Fabric pots, plastic containers, reservoirs, and plant trays.',
    seo: 'Fabric pots, grow bags, containers, reservoirs. Quality plant containers for indoor growing.',
  },
  propagation: {
    name: 'Propagation & Cloning',
    description: 'Clone machines, rooting hormones, domes, and propagation trays.',
    seo: 'Clone machines, rooting gels, propagation domes. Everything for successful plant cloning.',
  },
  seeds: {
    name: 'Seeds',
    description: 'Quality seeds for vegetables, herbs, and specialty plants.',
    seo: 'Vegetable seeds, herb seeds, specialty plant seeds. Quality seeds for hydroponic growing.',
  },
  harvesting: {
    name: 'Harvesting',
    description: 'Drying racks, curing containers, harvest scissors, and processing equipment.',
    seo: 'Drying racks, harvest tools, curing equipment. Professional harvesting supplies.',
  },
  trimming: {
    name: 'Trimming',
    description: 'Trim machines, scissors, and processing equipment for efficient harvest prep.',
    seo: 'Trim machines, trimming scissors, processing equipment. Professional trimming tools.',
  },
  pest_control: {
    name: 'Pest Control',
    description: 'Organic pesticides, fungicides, and integrated pest management solutions.',
    seo: 'Organic pesticides, IPM, pest control sprays. Safe pest management for indoor gardens.',
  },
  co2: {
    name: 'CO2 Enrichment',
    description: 'CO2 controllers, generators, and enrichment systems for faster growth.',
    seo: 'CO2 controllers, CO2 generators, enrichment systems. Boost plant growth with CO2.',
  },
  books: {
    name: 'Books & Education',
    description: 'Growing guides, reference books, and educational materials.',
    seo: 'Hydroponic growing guides, gardening books, educational materials for growers.',
  },
  electrical_supplies: {
    name: 'Electrical Supplies',
    description: 'Timers, power strips, light hangers, and electrical accessories.',
    seo: 'Grow room timers, power strips, light hangers. Electrical supplies for indoor gardens.',
  },
  environmental_monitors: {
    name: 'Environmental Monitors',
    description: 'Temperature and humidity controllers, CO2 monitors, and climate sensors.',
    seo: 'Temperature controllers, humidity monitors, environmental sensors for grow rooms.',
  },
  controllers: {
    name: 'Controllers & Automation',
    description: 'Digital controllers, automation systems, and smart grow room management.',
    seo: 'Grow room controllers, automation systems. Smart control for indoor gardens.',
  },
  ventilation_accessories: {
    name: 'Ventilation Accessories',
    description: 'Duct clamps, flanges, speed controllers, and ventilation fittings.',
    seo: 'Duct clamps, fan controllers, ventilation fittings. Ventilation system accessories.',
  },
  grow_room_materials: {
    name: 'Grow Room Materials',
    description: 'Mylar, reflective films, grow tents, and room construction materials.',
    seo: 'Grow tents, mylar, reflective materials. Grow room construction and setup supplies.',
  },
  extraction: {
    name: 'Extraction',
    description: 'Rosin presses, extraction equipment, and processing tools.',
    seo: 'Rosin presses, extraction equipment. Professional extraction and processing tools.',
  },
};

// Top brands to create brand collections for
const TOP_BRANDS = [
  'General Hydroponics',
  'Advanced Nutrients',
  'Botanicare',
  'Fox Farm',
  'Humboldt',
  'Nectar for the Gods',
  'ONA',
  'Hydro-Logic',
  'Can-Fan',
  'Can-Filter',
  'Sunlight Supply',
  'Dutch Lighting Innovations',
  'EcoPlus',
  'Roots Organics',
  'Aurora Innovations',
];

// ─────────────────────────────────────────────────────────────────────────────
// CSV Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Build Collections
// ─────────────────────────────────────────────────────────────────────────────

function getCategories(): Map<string, number> {
  const path = resolve(CSV_DIR, 'master_catalog_index.csv');
  if (!existsSync(path)) {
    console.error('❌ master_catalog_index.csv not found');
    process.exit(1);
  }
  
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const categoryIdx = headers.findIndex(h => h === 'primary_category');
  const categories = new Map<string, number>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const category = values[categoryIdx]?.trim();
    if (category) {
      categories.set(category, (categories.get(category) || 0) + 1);
    }
  }
  
  return categories;
}

function getBrands(): Map<string, number> {
  const path = resolve(CSV_DIR, 'master_catalog_index.csv');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  
  const brandIdx = headers.findIndex(h => h === 'brand');
  const brands = new Map<string, number>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const brand = values[brandIdx]?.trim();
    if (brand && brand !== 'Unknown') {
      brands.set(brand, (brands.get(brand) || 0) + 1);
    }
  }
  
  return brands;
}

function buildCategoryCollection(category: string, count: number): SmartCollection {
  const meta = CATEGORY_META[category] || {
    name: formatTitle(category),
    description: `Quality ${formatTitle(category).toLowerCase()} for hydroponic growing.`,
    seo: `Shop ${formatTitle(category).toLowerCase()} at H Moon Hydro.`,
  };
  
  return {
    title: meta.name,
    handle: `category-${category.replace(/_/g, '-')}`,
    body_html: `<p>${meta.description}</p>`,
    sort_order: 'best-selling',
    published: true,
    disjunctive: false,
    rules: [
      {
        column: 'type',
        relation: 'equals',
        condition: formatTitle(category),
      },
    ],
    seo: {
      title: `${meta.name} | H Moon Hydro`,
      description: meta.seo,
    },
  };
}

function buildBrandCollection(brand: string, count: number): SmartCollection {
  const handle = `brand-${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
  
  return {
    title: brand,
    handle,
    body_html: `<p>Shop ${brand} products at H Moon Hydro. Quality hydroponic supplies from a trusted manufacturer.</p>`,
    sort_order: 'best-selling',
    published: true,
    disjunctive: false,
    rules: [
      {
        column: 'vendor',
        relation: 'equals',
        condition: brand,
      },
    ],
    seo: {
      title: `${brand} Products | H Moon Hydro`,
      description: `Shop ${brand} hydroponic supplies and equipment. ${count} products available.`,
    },
  };
}

function formatTitle(str: string): string {
  return str
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📁 Building Shopify Collection Rules');
  console.log('=====================================\n');
  
  // Get categories and brands from catalog
  console.log('📂 Analyzing catalog...');
  const categories = getCategories();
  const brands = getBrands();
  
  console.log(`   Found ${categories.size} categories`);
  console.log(`   Found ${brands.size} brands\n`);
  
  // Build category collections
  const collections: SmartCollection[] = [];
  
  console.log('🏷️  Creating Category Collections:');
  for (const [category, count] of categories) {
    if (count >= 5) { // Only create collections with 5+ products
      const collection = buildCategoryCollection(category, count);
      collections.push(collection);
      console.log(`   ✓ ${collection.title} (${count} products)`);
    }
  }
  
  // Build brand collections (top brands only)
  console.log('\n🏢 Creating Brand Collections:');
  for (const brandName of TOP_BRANDS) {
    const count = brands.get(brandName);
    if (count && count >= 3) {
      const collection = buildBrandCollection(brandName, count);
      collections.push(collection);
      console.log(`   ✓ ${collection.title} (${count} products)`);
    }
  }
  
  // Add featured collections
  console.log('\n⭐ Creating Special Collections:');
  
  // New Arrivals (using tag)
  collections.push({
    title: 'New Arrivals',
    handle: 'new-arrivals',
    body_html: '<p>Check out our newest products and latest additions to the H Moon Hydro catalog.</p>',
    sort_order: 'created-desc',
    published: true,
    disjunctive: false,
    rules: [
      { column: 'tag', relation: 'equals', condition: 'new-arrival' },
    ],
    seo: {
      title: 'New Arrivals | H Moon Hydro',
      description: 'Shop the newest hydroponic products and equipment at H Moon Hydro.',
    },
  });
  console.log('   ✓ New Arrivals');
  
  // On Sale
  collections.push({
    title: 'On Sale',
    handle: 'sale',
    body_html: '<p>Save on quality hydroponic equipment. Limited time offers on top brands.</p>',
    sort_order: 'best-selling',
    published: true,
    disjunctive: false,
    rules: [
      { column: 'variant_compare_at_price', relation: 'greater_than', condition: '0' },
    ],
    seo: {
      title: 'Sale | H Moon Hydro',
      description: 'Shop hydroponic supplies on sale. Great deals on nutrients, lights, and equipment.',
    },
  });
  console.log('   ✓ On Sale');
  
  // Write JSON
  const jsonPath = resolve(CSV_DIR, 'shopify_collections.json');
  writeFileSync(jsonPath, JSON.stringify(collections, null, 2), 'utf-8');
  console.log(`\n✅ Written: CSVs/shopify_collections.json (${collections.length} collections)`);
  
  // Write CSV reference
  const csvLines = [
    'handle,title,rules_summary,product_count,published',
    ...collections.map(c => {
      const rulesStr = c.rules.map(r => `${r.column} ${r.relation} "${r.condition}"`).join(' AND ');
      return `${c.handle},"${c.title.replace(/"/g, '""')}","${rulesStr}",${categories.get(c.handle.replace('category-', '').replace(/-/g, '_')) || brands.get(c.title) || '?'},${c.published}`;
    }),
  ];
  const csvPath = resolve(CSV_DIR, 'shopify_collections.csv');
  writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`✅ Written: CSVs/shopify_collections.csv`);
  
  // Summary
  console.log('\n══════════════════════════════════════════════════');
  console.log('📈 COLLECTION SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  
  const categoryCollections = collections.filter(c => c.handle.startsWith('category-'));
  const brandCollections = collections.filter(c => c.handle.startsWith('brand-'));
  const specialCollections = collections.filter(c => !c.handle.startsWith('category-') && !c.handle.startsWith('brand-'));
  
  console.log(`📁 Total Collections: ${collections.length}`);
  console.log(`   Category: ${categoryCollections.length}`);
  console.log(`   Brand: ${brandCollections.length}`);
  console.log(`   Special: ${specialCollections.length}`);
  
  console.log('\n📋 Implementation:');
  console.log('   1. Use Shopify Admin API to create Smart Collections');
  console.log('   2. Or manually create using the CSV as reference');
  console.log('   3. Collections auto-populate based on Product Type/Vendor');
  
  console.log('\n✅ Collection rules complete!');
}

main().catch(console.error);
