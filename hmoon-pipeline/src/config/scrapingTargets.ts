/**
 * Scraping Targets Configuration
 * 
 * Centralized configuration for all competitor/source websites.
 * Each target defines selectors, rate limits, and extraction patterns.
 */

export interface ScrapingTarget {
  domain: string;
  baseUrl: string;
  tier: 1 | 2 | 3;
  platform: 'shopify' | 'woocommerce' | 'magento' | 'custom';
  rateLimit: {
    requestsPerSecond: number;
    retryAfterMs: number;
  };
  selectors: {
    // Product listing page
    productList?: string;
    productLink?: string;
    pagination?: string;
    
    // Product detail page
    title: string;
    price: string;
    compareAtPrice?: string;
    sku?: string;
    upc?: string;
    description: string;
    images: string;
    breadcrumbs?: string;
    specs?: string;
    availability?: string;
  };
  categories: string[];  // Which product categories this source is good for
  notes?: string;
}

// ============================================================================
// TIER 1: Manufacturer Sites (Authoritative)
// ============================================================================

export const GREASE_TARGET: ScrapingTarget = {
  domain: 'growwithgrease.com',
  baseUrl: 'https://www.growwithgrease.com',
  tier: 1,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    productList: '.collection-products',
    productLink: '.product-card a[href*="/products/"]',
    title: 'h1.product__title, h1.product-title',
    price: '.product__price, .price, [data-product-price]',
    sku: '[data-sku], .product-sku',
    description: '.product__description, .product-description, .rte',
    images: '.product__media img, .product-gallery img',
    specs: '.product-specs',
  },
  categories: ['nutrients'],
  notes: 'Priority source for Grease brand products. Fix broken images.',
};

export const GENERAL_HYDROPONICS_TARGET: ScrapingTarget = {
  domain: 'generalhydroponics.com',
  baseUrl: 'https://generalhydroponics.com',
  tier: 1,
  platform: 'custom',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-title',
    price: '.product-price',
    description: '.product-description',
    images: '.product-images img',
    specs: '.product-specifications',
  },
  categories: ['nutrients'],
  notes: 'Flora series, FloraNova, pH control',
};

export const AC_INFINITY_TARGET: ScrapingTarget = {
  domain: 'acinfinity.com',
  baseUrl: 'https://www.acinfinity.com',
  tier: 1,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    productLink: '.product-item a',
    title: 'h1.product-title',
    price: '.product-price',
    sku: '.product-sku',
    description: '.product-description',
    images: '.product-gallery img',
    specs: '.product-specs table',
  },
  categories: ['airflow', 'tents', 'controllers', 'environmental_monitors'],
  notes: 'CloudLine fans, Controller series, grow tents',
};

export const SPIDER_FARMER_TARGET: ScrapingTarget = {
  domain: 'spiderfarmer.com',
  baseUrl: 'https://www.spiderfarmer.com',
  tier: 1,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-single__title',
    price: '.product__price',
    description: '.product-single__description',
    images: '.product-single__photos img',
    specs: '.product-specs',
  },
  categories: ['lights'],
  notes: 'SF series LED grow lights',
};

export const MARS_HYDRO_TARGET: ScrapingTarget = {
  domain: 'mars-hydro.com',
  baseUrl: 'https://www.mars-hydro.com',
  tier: 1,
  platform: 'custom',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-title',
    price: '.product-price',
    description: '.product-description',
    images: '.product-gallery img',
    specs: '.specifications-table',
  },
  categories: ['lights', 'tents'],
  notes: 'TS, TSW, FC series LED lights',
};

// ============================================================================
// TIER 2: Major Retailers (Specs & Pricing)
// ============================================================================

export const GROW_GENERATION_TARGET: ScrapingTarget = {
  domain: 'growgeneration.com',
  baseUrl: 'https://www.growgeneration.com',
  tier: 2,
  platform: 'custom',
  rateLimit: { requestsPerSecond: 0.3, retryAfterMs: 10000 },
  selectors: {
    productList: '.product-list',
    productLink: '.product-item a',
    pagination: '.pagination a',
    title: 'h1.product-name',
    price: '.product-price .price',
    compareAtPrice: '.product-price .was-price',
    sku: '.product-sku',
    upc: '[itemprop="gtin13"]',
    description: '.product-description',
    images: '.product-gallery img',
    breadcrumbs: '.breadcrumbs a',
    specs: '.product-specs-table',
    availability: '.stock-status',
  },
  categories: ['nutrients', 'lights', 'airflow', 'media', 'containers'],
  notes: 'Largest hydro chain. Good specs and competitive pricing.',
};

export const HYDROBUILDER_TARGET: ScrapingTarget = {
  domain: 'hydrobuilder.com',
  baseUrl: 'https://hydrobuilder.com',
  tier: 2,
  platform: 'woocommerce',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    productLink: '.product a.woocommerce-LoopProduct-link',
    title: 'h1.product_title',
    price: '.price .woocommerce-Price-amount',
    sku: '.sku',
    description: '.woocommerce-product-details__short-description',
    images: '.woocommerce-product-gallery__image img',
    specs: '.woocommerce-Tabs-panel--additional_information table',
  },
  categories: ['nutrients', 'media', 'containers'],
  notes: 'Good pricing data and variant information',
};

export const HTG_SUPPLY_TARGET: ScrapingTarget = {
  domain: 'htgsupply.com',
  baseUrl: 'https://htgsupply.com',
  tier: 2,
  platform: 'custom',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-name',
    price: '.product-price',
    description: '.product-description',
    images: '.product-image img',
    specs: '.product-specifications',
  },
  categories: ['lights', 'hid_bulbs'],
  notes: 'Detailed lighting specifications',
};

export const GH_HYDRO_TARGET: ScrapingTarget = {
  domain: 'ghhydro.com',
  baseUrl: 'https://ghhydro.com',
  tier: 2,
  platform: 'woocommerce',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product_title',
    price: '.price',
    description: '.product-description',
    images: '.woocommerce-product-gallery img',
  },
  categories: ['nutrients', 'media', 'irrigation'],
  notes: 'Good descriptions',
};

// ============================================================================
// TIER 3: Secondary Retailers
// ============================================================================

export const SHOP_URBAN_GREENHOUSE_TARGET: ScrapingTarget = {
  domain: 'shopurbangreenhouse.myshopify.com',
  baseUrl: 'https://shopurbangreenhouse.myshopify.com',
  tier: 3,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product__title',
    price: '.product__price',
    description: '.product__description',
    images: '.product__media img',
  },
  categories: ['nutrients', 'lights', 'containers'],
};

export const GROW_ACE_TARGET: ScrapingTarget = {
  domain: 'growace.com',
  baseUrl: 'https://growace.com',
  tier: 3,
  platform: 'shopify',
  rateLimit: { requestsPerSecond: 0.5, retryAfterMs: 5000 },
  selectors: {
    title: 'h1.product-title',
    price: '.product-price',
    description: '.product-description',
    images: '.product-images img',
  },
  categories: ['lights', 'tents', 'airflow'],
  notes: 'Budget options',
};

// ============================================================================
// Target Registry
// ============================================================================

export const ALL_TARGETS: ScrapingTarget[] = [
  // Tier 1
  GREASE_TARGET,
  GENERAL_HYDROPONICS_TARGET,
  AC_INFINITY_TARGET,
  SPIDER_FARMER_TARGET,
  MARS_HYDRO_TARGET,
  // Tier 2
  GROW_GENERATION_TARGET,
  HYDROBUILDER_TARGET,
  HTG_SUPPLY_TARGET,
  GH_HYDRO_TARGET,
  // Tier 3
  SHOP_URBAN_GREENHOUSE_TARGET,
  GROW_ACE_TARGET,
];

export const TARGETS_BY_DOMAIN = new Map<string, ScrapingTarget>(
  ALL_TARGETS.map(t => [t.domain, t])
);

export const TARGETS_BY_CATEGORY = new Map<string, ScrapingTarget[]>();
for (const target of ALL_TARGETS) {
  for (const cat of target.categories) {
    const existing = TARGETS_BY_CATEGORY.get(cat) || [];
    existing.push(target);
    TARGETS_BY_CATEGORY.set(cat, existing);
  }
}

/**
 * Get best source for a product category
 */
export function getBestSourceForCategory(category: string): ScrapingTarget | undefined {
  const sources = TARGETS_BY_CATEGORY.get(category);
  if (!sources?.length) return undefined;
  
  // Return highest tier (lowest number) source
  return sources.sort((a, b) => a.tier - b.tier)[0];
}

/**
 * Get target by domain name (partial match)
 */
export function getTargetByDomain(domain: string): ScrapingTarget | undefined {
  domain = domain.toLowerCase().replace(/^www\./, '');
  return TARGETS_BY_DOMAIN.get(domain);
}
