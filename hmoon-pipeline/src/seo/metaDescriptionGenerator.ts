/**
 * SEO-001 Component 2: Meta Description Generator
 * Generates optimized meta descriptions per category template
 */

import { ProductData } from './metaTitleGenerator.js';

interface MetaDescConfig {
  category: string;
  keywords: string[];
  template: string;
  fallback: string;
}

const DESC_TEMPLATES: MetaDescConfig[] = [
  {
    category: 'lights',
    keywords: ['light', 'led', 'hps', 'cmh', 'lamp', 'bulb', 'fixture', 'quantum'],
    template: 'Shop {brand} {name} grow lights at H-Moon Hydro. {wattage} professional LED/HPS lighting for indoor gardens. Fast shipping & expert support.',
    fallback: 'Shop {brand} {name} at H-Moon Hydro. Premium grow lights for indoor gardens. Phoenix hydro shop with fast shipping.',
  },
  {
    category: 'nutrients',
    keywords: ['nutrient', 'fertilizer', 'flora', 'bloom', 'grow', 'base', 'additive', 'supplement', 'grease'],
    template: 'Buy {brand} {name} plant nutrients at H-Moon Hydro. Professional-grade {stage} formula for maximum yields. Shop Phoenix\'s #1 hydro store.',
    fallback: 'Buy {brand} {name} at H-Moon Hydro. Premium plant nutrients for hydro, soil & coco. Phoenix\'s trusted grow shop.',
  },
  {
    category: 'fans',
    keywords: ['fan', 'inline', 'exhaust', 'ventilation', 'cloudline', 'duct'],
    template: 'Get {brand} {name} inline fans at H-Moon Hydro. {cfm} quiet ventilation for grow rooms. Temperature & humidity control. Free shipping!',
    fallback: 'Get {brand} {name} ventilation at H-Moon Hydro. Quiet inline fans for optimal grow room climate control.',
  },
  {
    category: 'filters',
    keywords: ['filter', 'carbon', 'odor', 'scrubber', 'phresh'],
    template: 'Shop {brand} {name} carbon filters at H-Moon Hydro. Eliminate odors from your grow room. Works with all inline fans. Fast AZ shipping.',
    fallback: 'Shop {brand} {name} at H-Moon Hydro. Premium carbon filters for complete odor control. Phoenix hydro experts.',
  },
  {
    category: 'tents',
    keywords: ['tent', 'grow tent', 'gorilla'],
    template: 'Buy {brand} {name} grow tents at H-Moon Hydro. Heavy-duty, light-proof grow room. Perfect for indoor gardens. Free setup tips!',
    fallback: 'Buy {brand} {name} grow tents at H-Moon Hydro. Quality indoor growing spaces. Phoenix\'s hydro headquarters.',
  },
  {
    category: 'meters',
    keywords: ['meter', 'ph', 'ec', 'tds', 'ppm', 'monitor', 'tester'],
    template: 'Shop {brand} {name} meters at H-Moon Hydro. Accurate pH, EC & TDS testing for hydroponics. Essential for healthy plants.',
    fallback: 'Shop {brand} {name} at H-Moon Hydro. Precision testing equipment for serious growers. Phoenix hydro experts.',
  },
  {
    category: 'media',
    keywords: ['coco', 'coir', 'perlite', 'rockwool', 'hydroton', 'clay', 'soil', 'medium'],
    template: 'Get {brand} {name} growing media at H-Moon Hydro. Premium substrate for hydro & soil grows. Better root development, bigger yields.',
    fallback: 'Get {brand} {name} at H-Moon Hydro. Quality growing media for all cultivation methods. Phoenix grow supply.',
  },
  {
    category: 'containers',
    keywords: ['pot', 'container', 'fabric', 'gallon', 'planter', 'tray'],
    template: 'Shop {brand} {name} pots at H-Moon Hydro. {gallons} containers for healthier roots. Fabric & plastic options. Fast Phoenix shipping.',
    fallback: 'Shop {brand} {name} containers at H-Moon Hydro. Quality pots for indoor & outdoor growing. Expert advice available.',
  },
  {
    category: 'irrigation',
    keywords: ['pump', 'drip', 'irrigation', 'reservoir', 'tubing', 'emitter'],
    template: 'Buy {brand} {name} irrigation at H-Moon Hydro. Reliable pumps, drip systems & reservoirs for automated growing. Shop now!',
    fallback: 'Buy {brand} {name} at H-Moon Hydro. Professional irrigation supplies for hydro systems. Phoenix\'s grow experts.',
  },
  {
    category: 'controllers',
    keywords: ['controller', 'timer', 'thermostat', 'humidistat', 'automation'],
    template: 'Get {brand} {name} controllers at H-Moon Hydro. Automate your grow room with precision timers & environmental controls.',
    fallback: 'Get {brand} {name} at H-Moon Hydro. Grow room automation for perfect environments. Phoenix hydro supply.',
  },
];

function detectCategory(product: ProductData): MetaDescConfig | null {
  const searchText = [
    product.title,
    product.productType || '',
    ...(product.tags || []),
  ].join(' ').toLowerCase();

  for (const template of DESC_TEMPLATES) {
    for (const keyword of template.keywords) {
      if (searchText.includes(keyword)) {
        return template;
      }
    }
  }

  return null;
}

function extractSpecs(product: ProductData): Record<string, string> {
  const specs: Record<string, string> = {};
  const title = product.title.toLowerCase();

  // Extract wattage
  const wattMatch = title.match(/(\d+)\s*w(?:att)?s?\b/i);
  if (wattMatch) {
    specs.wattage = `${wattMatch[1]}W`;
  }

  // Extract CFM
  const cfmMatch = title.match(/(\d+)\s*cfm/i);
  if (cfmMatch) {
    specs.cfm = `${cfmMatch[1]} CFM`;
  }

  // Extract gallons
  const galMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:gal(?:lon)?s?)/i);
  if (galMatch) {
    specs.gallons = `${galMatch[1]} gallon`;
  }

  // Extract growth stage
  const stagePatterns = [
    { pattern: /\bveg(?:etative)?\b/i, stage: 'vegetative' },
    { pattern: /\bbloom(?:ing)?\b/i, stage: 'bloom' },
    { pattern: /\bflower(?:ing)?\b/i, stage: 'flowering' },
    { pattern: /\bclone|rooting\b/i, stage: 'cloning' },
    { pattern: /\bseedling\b/i, stage: 'seedling' },
  ];

  for (const { pattern, stage } of stagePatterns) {
    if (pattern.test(product.title) || (product.tags || []).some(t => pattern.test(t))) {
      specs.stage = stage;
      break;
    }
  }

  return specs;
}

function cleanProductName(title: string, brand?: string): string {
  let name = title;

  // Remove brand prefix if present
  if (brand) {
    const brandRegex = new RegExp(`^${brand}\\s*[-:]?\\s*`, 'i');
    name = name.replace(brandRegex, '');
  }

  // Remove common suffixes/noise
  name = name
    .replace(/\s*[-–]\s*(qt|quart|gal|gallon|oz|liter|ml|lb|pound).*$/i, '')
    .replace(/\s*\(\d+\s*(qt|quart|gal|gallon|oz|liter|ml)\)$/i, '')
    .trim();

  return name;
}

export function generateMetaDescription(product: ProductData): string {
  const categoryConfig = detectCategory(product);
  const specs = extractSpecs(product);
  const brand = product.vendor || 'Premium';
  const name = cleanProductName(product.title, product.vendor);

  // Pick template based on specs availability
  let template: string;
  if (categoryConfig) {
    const hasSpecificSpecs =
      (categoryConfig.category === 'lights' && specs.wattage) ||
      (categoryConfig.category === 'fans' && specs.cfm) ||
      (categoryConfig.category === 'containers' && specs.gallons) ||
      (categoryConfig.category === 'nutrients' && specs.stage);

    template = hasSpecificSpecs ? categoryConfig.template : categoryConfig.fallback;
  } else {
    // Generic fallback
    template = 'Shop {brand} {name} at H-Moon Hydro. Quality hydroponics supplies in Phoenix. Expert advice & fast shipping.';
  }

  // Apply replacements
  let description = template
    .replace('{brand}', brand)
    .replace('{name}', name)
    .replace('{wattage}', specs.wattage || '')
    .replace('{cfm}', specs.cfm || '')
    .replace('{gallons}', specs.gallons || '')
    .replace('{stage}', specs.stage || 'growth')
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to 160 chars (SEO best practice)
  if (description.length > 160) {
    description = description.substring(0, 157) + '...';
  }

  return description;
}
