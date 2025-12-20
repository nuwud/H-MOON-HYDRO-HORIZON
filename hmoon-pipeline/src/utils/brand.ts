/**
 * Brand Normalization Utility
 * 
 * Centralizes brand detection, validation, and normalization logic.
 * Used across all category master builders for consistent brand handling.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Brand Blocklist (never accept as valid brand)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND_BLOCKLIST = new Set([
  // H Moon Hydro variants (we're the retailer, not a brand)
  'h moon hydro',
  'h-moon-hydro',
  'hmoonhydro',
  'hmoon hydro',
  'h moon',
  'hmh',
  'h-moon',
  'hmoon',
  'h moon hydro llc',
  
  // Generic/invalid
  'unknown',
  'other',
  'none',
  'n/a',
  'na',
  'watering',
  'tools',
  'default',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Brand Aliases (normalize variations to canonical form)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND_ALIASES: Record<string, string> = {
  // UNO (HMoonHydro house brand - like Costco/Kirkland)
  'uno': 'UNO',
  'UNO': 'UNO',
  'Uno': 'UNO',
  
  // General Hydroponics
  'general hydroponics': 'General Hydroponics',
  'gh': 'General Hydroponics',
  'general hydro': 'General Hydroponics',
  
  // AC Infinity
  'ac infinity': 'AC Infinity',
  'acinfinity': 'AC Infinity',
  'ac-infinity': 'AC Infinity',
  'cloudlab': 'AC Infinity',
  'cloudray': 'AC Infinity',
  'cloudline': 'AC Infinity',
  
  // Spider Farmer
  'spider farmer': 'Spider Farmer',
  'spiderfarmer': 'Spider Farmer',
  
  // Can-Fan
  'can-fan': 'Can-Fan',
  'can fan': 'Can-Fan',
  'canfan': 'Can-Fan',
  
  // FoxFarm
  'fox farm': 'FoxFarm',
  'foxfarm': 'FoxFarm',
  
  // Advanced Nutrients
  'advanced nutrients': 'Advanced Nutrients',
  'an': 'Advanced Nutrients',
  
  // Botanicare
  'botanicare': 'Botanicare',
  
  // Athena
  'athena': 'Athena',
  'athena ag': 'Athena',
  
  // Humboldt
  'humboldt': 'Humboldt Nutrients',
  'humboldt nutrients': 'Humboldt Nutrients',
  'humboldts secret': 'Humboldts Secret',
  
  // Titan Controls
  'titan controls': 'Titan Controls',
  'titan': 'Titan Controls',
  
  // Hydrofarm
  'hydrofarm': 'Hydrofarm',
  'hydro farm': 'Hydrofarm',
  
  // VIVOSUN
  'vivosun': 'VIVOSUN',
  'vivo sun': 'VIVOSUN',
  
  // Mars Hydro
  'mars hydro': 'Mars Hydro',
  'marshydro': 'Mars Hydro',
  
  // Gavita
  'gavita': 'Gavita',
  
  // Grower's Choice
  'growers choice': 'Growers Choice',
  "grower's choice": 'Growers Choice',
  
  // Cyco
  'cyco': 'Cyco',
  
  // House & Garden
  'house and garden': 'House & Garden',
  'house & garden': 'House & Garden',
  'h&g': 'House & Garden',
  
  // Canna
  'canna': 'Canna',
  
  // BioBizz
  'biobizz': 'BioBizz',
  'bio bizz': 'BioBizz',
  
  // Roots Organics
  'roots organics': 'Roots Organics',
  
  // Plagron
  'plagron': 'Plagron',
  
  // Dyna-Gro
  'dyna-gro': 'Dyna-Gro',
  'dyna gro': 'Dyna-Gro',
  'dynagro': 'Dyna-Gro',
  
  // Milwaukee
  'milwaukee': 'Milwaukee',
  
  // Bluelab
  'bluelab': 'Bluelab',
  'blue lab': 'Bluelab',
  
  // Inkbird
  'inkbird': 'Inkbird',
  
  // BN-Link
  'bn-link': 'BN-Link',
  'bnlink': 'BN-Link',
  'bn link': 'BN-Link',
  
  // iPower
  'ipower': 'iPower',
  'i power': 'iPower',
  
  // Century
  'century': 'Century',
  
  // Grodan
  'grodan': 'Grodan',
  
  // Mother Earth
  'mother earth': 'Mother Earth',
  
  // Coco Loco
  'coco loco': 'Coco Loco',
  
  // Royal Gold
  'royal gold': 'Royal Gold',
  
  // Char Coir
  'char coir': 'Char Coir',
  'charcoir': 'Char Coir',
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection Patterns (regex-based detection from product text)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND_DETECTION_PATTERNS: Record<string, RegExp> = {
  // Equipment brands
  'AC Infinity': /ac\s*infinity|cloudlab|cloudray|cloudline|controller\s*(?:ai|67|69|76)/i,
  'Spider Farmer': /spider\s*farmer|sf-?\d{3,4}/i,
  'Mars Hydro': /mars\s*hydro|ts\s*\d{3,4}/i,
  'VIVOSUN': /vivosun/i,
  'Gavita': /gavita/i,
  'Growers Choice': /grower'?s?\s*choice|roi-e\d+/i,
  'Can-Fan': /can-?fan|max\s*fan/i,
  'Phresh': /phresh\s*filter/i,
  
  // Nutrient brands
  'General Hydroponics': /general\s*hydro|gh\s|flora\s*(gro|grow|bloom|micro)|floranova|maxigro|maxibloom|diamond\s*nectar|rapid\s*start|florakleen|camg\+|florablend|floralicious|kool\s*bloom/i,
  'Advanced Nutrients': /advanced\s*nutrients|voodoo\s*juice|big\s*bud|bud\s*candy|overdrive|sensi\s*(grow|bloom)|connoisseur|rhino\s*skin|piranha|tarantula|b-?52/i,
  'FoxFarm': /fox\s*farm|foxfarm|big\s*bloom|grow\s*big|tiger\s*bloom|cha\s*ching|beastie|open\s*sesame|ocean\s*forest|happy\s*frog/i,
  'Botanicare': /botanicare|pure\s*blend|hydroplex|sweet\s*raw|clearex|cal-?mag\s*plus|vitamino/i,
  'Canna': /\bcanna\b/i,
  'House & Garden': /house\s*(?:&|and)\s*garden|h&g/i,
  'Cyco': /\bcyco\b/i,
  'Athena': /\bathena\b/i,
  'Mills': /\bmills\b/i,
  'Emerald Harvest': /emerald\s*harvest/i,
  'Roots Organics': /roots\s*organics/i,
  'BioBizz': /biobizz/i,
  'Technaflora': /technaflora/i,
  'Humboldt Nutrients': /humboldt(?!\s*secret)/i,
  'Humboldts Secret': /humboldts?\s*secret/i,
  'Dutch Master': /dutch\s*master/i,
  'Dyna-Gro': /dyna-?gro/i,
  'Earth Juice': /earth\s*juice/i,
  "Jack's Nutrients": /jack'?s\s*(?:nutrients|321|hydro)/i,
  'Plagron': /plagron/i,
  'Remo Nutrients': /\bremo\b/i,
  'Green Planet': /green\s*planet/i,
  'Cultured Solutions': /cultured\s*solutions/i,
  "Neptune's Harvest": /neptune'?s\s*harvest/i,
  'Age Old': /age\s*old/i,
  'Cutting Edge': /cutting\s*edge/i,
  
  // Controller/Timer brands
  'Titan Controls': /titan\s*controls?/i,
  'Inkbird': /inkbird/i,
  'BN-Link': /bn-?link/i,
  'iPower': /ipower/i,
  'Century': /\bcentury\b/i,
  'Autopilot': /autopilot/i,
  
  // Media brands
  'Grodan': /grodan/i,
  'Mother Earth': /mother\s*earth/i,
  'Royal Gold': /royal\s*gold/i,
  'Char Coir': /char\s*coir/i,
  'Coco Loco': /coco\s*loco/i,
  
  // Meters/Testing
  'Milwaukee': /\bmilwaukee\b/i,
  'Bluelab': /bluelab/i,
  'Apera': /apera/i,
  'Hanna': /\bhanna\b/i,
  
  // House brand
  'UNO': /\buno\b/i,
  
  // General
  'Hydrofarm': /hydrofarm/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a string looks like a valid brand name
 */
export function isValidBrand(brand: string): boolean {
  if (!brand || brand.length < 2) return false;
  
  const lower = brand.toLowerCase().trim();
  
  // Check blocklist
  if (BRAND_BLOCKLIST.has(lower)) return false;
  
  // Reject garbage patterns
  if (/[{}:]/.test(brand)) return false;
  if (/maxscore|error|\burl\b|http/i.test(brand)) return false;
  
  // Reject brands that are too long (likely sentence fragments)
  const wordCount = brand.trim().split(/\s+/).length;
  if (wordCount > 4) return false;
  
  // Reject if it looks like a description fragment
  if (/\b(with|for|and|the|a|an|is|are|was|were|has|have|this|that|from|by|in|on|at)\b/i.test(brand)) return false;
  
  // Reject if contains digits mixed with words (likely SKU or description)
  if (/\d+.*[a-z]+.*\d+/i.test(brand) && !/\d{4}/.test(brand)) return false;
  
  // Reject common garbage patterns
  if (/^\d+\s*(oz|ml|gal|qt|l|lb|g|kg)/i.test(brand)) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect brand from product text using regex patterns
 */
export function detectBrandFromText(text: string): string {
  if (!text) return '';
  
  for (const [brand, pattern] of Object.entries(BRAND_DETECTION_PATTERNS)) {
    if (pattern.test(text)) return brand;
  }
  
  return '';
}

/**
 * Normalize a brand name to canonical form
 */
export function normalizeBrand(raw: string): string {
  if (!raw) return '';
  
  const cleaned = raw.trim();
  if (!isValidBrand(cleaned)) return '';
  
  const lower = cleaned.toLowerCase();
  
  // Check alias map first
  if (BRAND_ALIASES[lower]) {
    return BRAND_ALIASES[lower];
  }
  
  // Title case
  return cleaned
    .split(' ')
    .map(w => (w.toUpperCase() === w ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Best Brand Selection (priority order)
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandSources {
  /** Combined text to search for brand patterns (title + description) */
  combinedText?: string;
  /** Woo Brands column */
  wooBrand?: string;
  /** Inventory Manufacturer column */
  inventoryManufacturer?: string;
  /** Shopify Vendor column */
  shopifyVendor?: string;
}

/**
 * Get the best brand from multiple sources with priority order:
 * 1) Hardcoded detection patterns (from combinedText)
 * 2) Woo Brands column
 * 3) Inventory Manufacturer column
 * 4) Shopify Vendor column
 * 5) Unknown (fallback)
 */
export function getBestBrand(sources: BrandSources): string {
  // Priority 1: Pattern detection from text
  if (sources.combinedText) {
    const fromPatterns = detectBrandFromText(sources.combinedText);
    if (fromPatterns) return fromPatterns;
  }
  
  // Priority 2: Woo Brands
  if (sources.wooBrand) {
    const normalized = normalizeBrand(sources.wooBrand);
    if (normalized) return normalized;
  }
  
  // Priority 3: Inventory Manufacturer
  if (sources.inventoryManufacturer) {
    const normalized = normalizeBrand(sources.inventoryManufacturer);
    if (normalized) return normalized;
  }
  
  // Priority 4: Shopify Vendor
  if (sources.shopifyVendor) {
    const normalized = normalizeBrand(sources.shopifyVendor);
    if (normalized) return normalized;
  }
  
  // Fallback
  return '';
}

/**
 * Get brand with "Unknown" as default instead of empty string
 */
export function getBestBrandOrUnknown(sources: BrandSources): string {
  return getBestBrand(sources) || 'Unknown';
}
