/**
 * SEO-001 Component 1: Meta Title Generator
 * Generates optimized meta titles per category template
 */

export interface ProductData {
  handle: string;
  title: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  variants?: Array<{
    title?: string;
    sku?: string;
  }>;
  metafields?: {
    specs?: {
      watts?: string;
      cfm?: string;
      npk?: string;
      growthStage?: string;
      diameter?: string;
      gallons?: string;
    };
  };
}

interface MetaTitleConfig {
  category: string;
  keywords: string[];
  template: string;
  fallback: string;
}

const TITLE_TEMPLATES: MetaTitleConfig[] = [
  {
    category: 'lights',
    keywords: ['light', 'led', 'hps', 'cmh', 'lamp', 'bulb', 'fixture', 'quantum'],
    template: '{brand} {name} {watts}W Grow Light | H-Moon Hydro',
    fallback: '{brand} {name} Grow Light | H-Moon Hydro',
  },
  {
    category: 'nutrients',
    keywords: ['nutrient', 'fertilizer', 'flora', 'bloom', 'grow', 'base', 'additive', 'supplement', 'grease'],
    template: '{brand} {name} - {stage} Plant Nutrient | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'fans',
    keywords: ['fan', 'inline', 'exhaust', 'ventilation', 'cloudline', 'duct'],
    template: '{brand} {name} {cfm}CFM Inline Fan | H-Moon Hydro',
    fallback: '{brand} {name} Ventilation | H-Moon Hydro',
  },
  {
    category: 'filters',
    keywords: ['filter', 'carbon', 'odor', 'scrubber', 'phresh'],
    template: '{brand} {name} Carbon Filter | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'tents',
    keywords: ['tent', 'grow tent', 'gorilla'],
    template: '{brand} {name} Grow Tent | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'meters',
    keywords: ['meter', 'ph', 'ec', 'tds', 'ppm', 'monitor', 'tester'],
    template: '{brand} {name} Digital Meter | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'media',
    keywords: ['coco', 'coir', 'perlite', 'rockwool', 'hydroton', 'clay', 'soil', 'medium'],
    template: '{brand} {name} Growing Media | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'containers',
    keywords: ['pot', 'container', 'fabric', 'gallon', 'planter', 'tray'],
    template: '{brand} {name} {gallons}Gal Pot | H-Moon Hydro',
    fallback: '{brand} {name} Container | H-Moon Hydro',
  },
  {
    category: 'irrigation',
    keywords: ['pump', 'drip', 'irrigation', 'reservoir', 'tubing', 'emitter'],
    template: '{brand} {name} Irrigation | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
  {
    category: 'controllers',
    keywords: ['controller', 'timer', 'thermostat', 'humidistat', 'automation'],
    template: '{brand} {name} Controller | H-Moon Hydro',
    fallback: '{brand} {name} | H-Moon Hydro',
  },
];

function detectCategory(product: ProductData): MetaTitleConfig | null {
  const searchText = [
    product.title,
    product.productType,
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const config of TITLE_TEMPLATES) {
    if (config.keywords.some((kw) => searchText.includes(kw))) {
      return config;
    }
  }
  return null;
}

function extractSpecs(product: ProductData): Record<string, string> {
  const specs: Record<string, string> = {};
  const title = product.title.toLowerCase();

  // Extract watts from title (e.g., "SF4000 450W")
  const wattsMatch = title.match(/(\d+)\s*w(?:att)?s?\b/i);
  if (wattsMatch) specs.watts = wattsMatch[1];

  // Extract CFM from title (e.g., "402 CFM")
  const cfmMatch = title.match(/(\d+)\s*cfm/i);
  if (cfmMatch) specs.cfm = cfmMatch[1];

  // Extract gallon size (e.g., "5 Gallon", "1 Gal")
  const galMatch = title.match(/(\d+)\s*(?:gal(?:lon)?s?)/i);
  if (galMatch) specs.gallons = galMatch[1];

  // Extract diameter (e.g., "6 inch", '6"')
  const diaMatch = title.match(/(\d+)[\s-]*(?:inch|in|")/i);
  if (diaMatch) specs.diameter = diaMatch[1];

  // Detect growth stage from title
  if (/bloom|flower/i.test(title)) specs.stage = 'Bloom';
  else if (/veg|grow|vegetative/i.test(title)) specs.stage = 'Veg';
  else if (/clone|root/i.test(title)) specs.stage = 'Clone';

  return specs;
}

export function generateMetaTitle(product: ProductData): string {
  const config = detectCategory(product);
  const specs = extractSpecs(product);

  // Merge extracted specs with metafield specs
  const allSpecs: Record<string, string | undefined> = {
    ...specs,
    ...product.metafields?.specs,
  };

  // Choose template or fallback
  let template: string;
  if (config) {
    // Use full template if we have the required specs
    const templateVars = config.template.match(/\{(\w+)\}/g) || [];
    const requiredVars = templateVars
      .map((v) => v.replace(/[{}]/g, ''))
      .filter((v) => !['brand', 'name'].includes(v));

    const hasAllSpecs = requiredVars.every((v) => allSpecs[v]);
    template = hasAllSpecs ? config.template : config.fallback;
  } else {
    template = '{brand} {name} | H-Moon Hydro';
  }

  // Replace tokens
  let title = template
    .replace('{brand}', product.vendor || '')
    .replace('{name}', cleanProductName(product.title, product.vendor))
    .replace('{watts}', allSpecs.watts || '')
    .replace('{cfm}', allSpecs.cfm || '')
    .replace('{gallons}', allSpecs.gallons || '')
    .replace('{stage}', allSpecs.stage || '')
    .replace('{diameter}', allSpecs.diameter || '');

  // Clean up empty tokens and extra spaces
  title = title.replace(/\s+/g, ' ').trim();

  // Truncate to 60 chars (Google's limit)
  if (title.length > 60) {
    title = title.slice(0, 57).replace(/\s+\S*$/, '') + '...';
  }

  return title;
}

function cleanProductName(title: string, vendor?: string): string {
  let name = title;

  // Remove vendor from start of title if present
  if (vendor) {
    const vendorPattern = new RegExp(`^${escapeRegex(vendor)}\\s*[-–—:]?\\s*`, 'i');
    name = name.replace(vendorPattern, '');
  }

  // Remove common suffixes that will be added by template
  name = name.replace(/\s*[-–—|]\s*h[- ]?moon\s*hydro.*$/i, '');
  name = name.replace(/\s*grow\s*light$/i, '');
  name = name.replace(/\s*inline\s*fan$/i, '');
  name = name.replace(/\s*carbon\s*filter$/i, '');

  return name.trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
