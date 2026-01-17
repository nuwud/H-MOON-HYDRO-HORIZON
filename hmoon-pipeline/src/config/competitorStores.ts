/**
 * Competitor Hydroponic Stores Registry
 * 
 * Sourced from: https://shopifyspy.com/stores/niches/hydroponic/
 * 648 total stores, 100 captured (pages 1-5 of 33)
 * 
 * These are Shopify stores that can be scraped for:
 * - Product images
 * - Pricing data
 * - Product descriptions
 * - Brand logos
 * - Inventory levels (when exposed)
 */

export interface CompetitorStore {
  rank: number;
  domain: string;
  name: string;
  country: string;
  similarWebRank?: number;
  category?: string;
  avgPrice?: number;
  currency?: string;
  productCount?: number;
  openDate?: string;
  tier: 1 | 2 | 3 | 4;  // 1=Top competitors, 4=Long tail
  notes?: string;
}

// ============================================================================
// Top 100 Shopify Hydroponic Stores (from ShopifySpy)
// ============================================================================

export const SHOPIFY_HYDRO_STORES: CompetitorStore[] = [
  // === TIER 1: Top 10 by SimilarWeb Rank ===
  { rank: 1, domain: 'heyabby.com', name: 'Abby Fully Automated Grow Box', country: 'US', similarWebRank: 392786, category: 'Food and Drink', avgPrice: 390.44, currency: 'USD', productCount: 4, openDate: '2022-04-16', tier: 1, notes: 'Automated grow systems' },
  { rank: 2, domain: 'seedworldusa.com', name: 'Seed World', country: 'US', similarWebRank: 397258, category: 'Home and Garden', avgPrice: 38.43, currency: 'USD', productCount: 538, openDate: '2012-12-12', tier: 1, notes: 'Seeds, pest control, lawn care' },
  { rank: 3, domain: 'growlights.ca', name: 'Grow Lights Canada', country: 'CA', similarWebRank: 546703, category: 'Home and Garden', avgPrice: 197.45, currency: 'CAD', productCount: 555, openDate: '2021-06-02', tier: 1, notes: 'Canada #1 grow lights source' },
  { rank: 4, domain: 'growace.com', name: 'Grow Ace', country: 'IL', similarWebRank: 557699, category: 'Home and Garden', avgPrice: 377.26, currency: 'USD', productCount: 236, openDate: '2021-04-21', tier: 1, notes: 'LED, HPS, tents, hydroponics' },
  { rank: 5, domain: 'farmersdefense.com', name: 'Farmers Defense', country: 'US', similarWebRank: 600052, category: 'Pets and Animals', avgPrice: 27.62, currency: 'USD', productCount: 53, openDate: '2020-09-19', tier: 2, notes: 'Protective farming gear' },
  { rank: 6, domain: 'flowgardens.com', name: 'Flow Gardens', country: 'US', similarWebRank: 612252, category: 'Health', avgPrice: 21.29, currency: 'USD', productCount: 160, openDate: '2021-02-26', tier: 2, notes: 'Hemp products' },
  { rank: 7, domain: 'humboldtssecretsupplies.com', name: 'Humboldts Secret Supplies', country: 'US', similarWebRank: 684495, category: 'Home and Garden', avgPrice: 0.75, currency: 'USD', productCount: 1, openDate: '2019-04-17', tier: 2, notes: 'Advanced hydroponic nutrients' },
  { rank: 8, domain: 'eppinghydroponics.com.au', name: 'Epping Hydroponics', country: 'AU', similarWebRank: 729046, category: 'Home and Garden', avgPrice: 167.74, currency: 'AUD', productCount: 256, openDate: '2020-10-16', tier: 2, notes: 'Melbourne hydro supplies' },
  { rank: 9, domain: 'herbals.co.nz', name: 'Herbal House NZ', country: 'NZ', similarWebRank: 744524, category: 'Gambling', avgPrice: 449, currency: 'NZD', productCount: 15, openDate: '2017-04-10', tier: 3, notes: 'NZ hydro wholesalers' },
  { rank: 10, domain: 'urban-farm-it.com', name: 'Urban Farm-It', country: 'GB', similarWebRank: 883689, category: 'Food and Drink', avgPrice: undefined, currency: undefined, productCount: undefined, openDate: '2023-07-27', tier: 3, notes: 'Aquaponics, mushroom kits' },

  // === TIER 2: Ranks 11-30 ===
  { rank: 11, domain: 'happyhydro.com', name: 'Happy Hydro', country: 'US', similarWebRank: 924550, category: 'Home and Garden', avgPrice: 584.11, currency: 'USD', productCount: 181, openDate: '2017-06-09', tier: 1, notes: 'Full hydro supply store' },
  { rank: 12, domain: 'quickbloomlights.com.au', name: 'Quick Bloom Lights', country: 'AU', similarWebRank: 955123, category: 'eCommerce & Shopping', avgPrice: 262.97, currency: 'AUD', productCount: 57, openDate: '2016-10-26', tier: 2, notes: 'LED, HLG quantum boards' },
  { rank: 13, domain: 'shop.fifthseasongardening.com', name: 'Fifth Season Gardening', country: 'US', similarWebRank: 1004158, category: 'Home and Garden', avgPrice: 19.02, currency: 'USD', productCount: 513, openDate: '2020-12-16', tier: 2, notes: 'Organic, hydroponics, homebrew' },
  { rank: 14, domain: 'drgreenthumbs.com.au', name: 'Dr Green Thumbs', country: 'AU', similarWebRank: 1006234, category: 'Home and Garden', avgPrice: 77.09, currency: 'AUD', productCount: 182, openDate: '2016-12-26', tier: 2, notes: 'Living soil, organic, hydro' },
  { rank: 15, domain: 'canadagrowsupplies.com', name: 'Canada Grow Supplies', country: 'CA', similarWebRank: 1029389, category: 'Home and Garden', avgPrice: 1541.53, currency: 'CAD', productCount: 184, openDate: '2022-06-05', tier: 2, notes: 'LED, tents, nutrients, hydro' },
  { rank: 16, domain: 'shoptheplantroom.com', name: 'The Plant Room', country: 'US', similarWebRank: 1096374, avgPrice: 16.28, currency: 'USD', productCount: 772, openDate: '2020-10-19', tier: 3, notes: 'Rare & exotic plants' },
  { rank: 17, domain: 'kindledgrowlights.com', name: 'Kindled Grow Lights', country: 'US', similarWebRank: 1357252, category: 'Home and Garden', avgPrice: 295.32, currency: 'USD', productCount: 15, openDate: '2017-03-09', tier: 3, notes: 'LED grow lights' },
  { rank: 18, domain: 'ceceswarehouse.com', name: 'Ceces Warehouse', country: 'US', similarWebRank: 1399330, avgPrice: 77.62, currency: 'USD', productCount: 52, openDate: '2020-03-06', tier: 3 },
  { rank: 19, domain: 'rightbud.com', name: 'RightBud', country: 'US', similarWebRank: 1496696, category: 'Home and Garden', avgPrice: 492.04, currency: 'USD', productCount: 33, openDate: '2017-09-11', tier: 2, notes: 'Rosin presses, trimmers, hydro' },
  { rank: 20, domain: 'justvertical.com', name: 'Just Vertical', country: 'CA', similarWebRank: 1507145, category: 'Food and Drink', avgPrice: 949, currency: 'CAD', productCount: 2, openDate: '2017-04-27', tier: 3, notes: 'Indoor garden towers' },

  // === TIER 3: Ranks 21-50 ===
  { rank: 21, domain: 'us.justvertical.com', name: 'Just Vertical US', country: 'US', similarWebRank: 1507145, category: 'Food and Drink', avgPrice: 84.79, currency: 'USD', productCount: 34, openDate: '2021-03-09', tier: 3 },
  { rank: 22, domain: 'cfhydroponics.com', name: 'CF Hydroponics', country: 'US', similarWebRank: 1621752, avgPrice: 15.78, currency: 'USD', productCount: 442, openDate: '2016-12-16', tier: 2, notes: 'Soil-free growing supplies' },
  { rank: 23, domain: 'hydroponicsclub.ca', name: 'Hydroponics Club Canada', country: 'CA', similarWebRank: 1673879, avgPrice: 269.99, currency: 'CAD', productCount: 1013, openDate: '2020-02-12', tier: 2, notes: 'Large catalog' },
  { rank: 24, domain: 'electronicpro.co.za', name: 'Electronic Pro', country: 'ZA', similarWebRank: 1696834, category: 'Electronics', avgPrice: 3686.75, currency: 'ZAR', productCount: 20, openDate: '2019-05-05', tier: 4 },
  { rank: 25, domain: 'zenhydro.com', name: 'ZenHydro', country: 'US', similarWebRank: 1792971, category: 'Home and Garden', avgPrice: 83.75, currency: 'USD', productCount: 955, openDate: '2021-08-19', tier: 1, notes: 'Best hydro store, large catalog' },
  { rank: 26, domain: 'trimleaf.ca', name: 'TrimLeaf', country: 'CA', similarWebRank: 1816604, category: 'Food and Drink', avgPrice: 1965.25, currency: 'CAD', productCount: 73, openDate: '2016-12-14', tier: 2, notes: 'Grow & extraction equipment' },
  { rank: 27, domain: 'thehydrobros.com', name: 'The Hydro Bros', country: 'GB', similarWebRank: 1877599, category: 'Home and Garden', avgPrice: 221.89, currency: 'GBP', productCount: 295, openDate: '2021-05-04', tier: 2, notes: 'UK indoor garden centre' },
  { rank: 28, domain: 'freshpatch.com.au', name: 'Fresh Patch', country: 'AU', similarWebRank: 1906878, category: 'Pets and Animals', avgPrice: 29.25, currency: 'AUD', productCount: 2, openDate: '2015-12-02', tier: 4, notes: 'Dog grass potty' },
  { rank: 29, domain: 'incredigrow.ca', name: 'IncrediGrow', country: 'CA', similarWebRank: 1920749, category: 'Home and Garden', avgPrice: 77.43, currency: 'CAD', productCount: 26, openDate: '2015-12-02', tier: 3, notes: 'Hydro, aero, aquaponics' },
  { rank: 30, domain: 'futurefresh.ph', name: 'Future Fresh', country: 'PH', similarWebRank: 1955598, category: 'Food and Drink', avgPrice: 450.51, currency: 'PHP', productCount: 39, openDate: '2019-08-15', tier: 4, notes: 'Farm to door Philippines' },

  // === TIER 3/4: Ranks 31-50 ===
  { rank: 32, domain: 'kazeliving.com', name: 'Kaze Living', country: 'IN', similarWebRank: 2002360, category: 'Lifestyle', avgPrice: 767.68, currency: 'INR', productCount: 1064, openDate: '2021-09-15', tier: 3 },
  { rank: 33, domain: 'sunsethydro.com', name: 'Sunset Hydroponics', country: 'US', similarWebRank: 2053855, category: 'Food and Drink', avgPrice: 48.11, currency: 'USD', productCount: 82, openDate: '2017-05-27', tier: 2, notes: 'Hydro & home brewing' },
  { rank: 34, domain: 'homegrodepot.co.za', name: 'HomeGro Depot', country: 'ZA', similarWebRank: 2076765, category: 'Health', avgPrice: 3598.74, currency: 'ZAR', productCount: 233, openDate: '2020-08-18', tier: 3, notes: 'SA hydro & organic garden' },
  { rank: 35, domain: 'homegrow.com.au', name: 'HomeGrow Australia', country: 'AU', similarWebRank: 2094026, category: 'Home and Garden', avgPrice: 434.42, currency: 'AUD', productCount: 467, openDate: '2021-03-16', tier: 2, notes: 'Australia best hydro, low price guarantee' },
  { rank: 36, domain: 'terra-bloom.com', name: 'TerraBloom', country: 'US', similarWebRank: 2111455, category: 'Industrial', avgPrice: 114.99, currency: 'USD', productCount: 6, openDate: '2015-07-28', tier: 3, notes: 'EC inline fans, carbon filters' },
  { rank: 37, domain: 'gabbarfarms.com', name: 'Gabbar Farms', country: 'IN', similarWebRank: 2232027, avgPrice: 119, currency: 'INR', productCount: 1, openDate: '2021-02-11', tier: 4, notes: 'Hydro vegetables Ahmedabad' },
  { rank: 38, domain: 'mass-hydro.com', name: 'Mass Hydroponics', country: 'US', similarWebRank: 2289661, avgPrice: 50.19, currency: 'USD', productCount: 762, openDate: '2022-02-17', tier: 2, notes: 'MA large catalog' },
  { rank: 39, domain: 'ledgrowshop.co.uk', name: 'LED Grow Shop UK', country: 'GB', similarWebRank: 2433550, avgPrice: 181.27, currency: 'GBP', productCount: 105, openDate: '2021-01-10', tier: 2, notes: 'Official HLG, AC Infinity UK' },
  { rank: 40, domain: 'lotusnutrients.com', name: 'Lotus Nutrients', country: 'US', similarWebRank: 2482196, category: 'Home and Garden', avgPrice: 24.1, currency: 'USD', productCount: 4, openDate: '2016-10-22', tier: 2, notes: 'Premium hydro powder nutrients' },

  // === TIER 4: Ranks 51-100 (Long tail) ===
  { rank: 41, domain: 'likyhome.com', name: 'LikyHome', country: 'AU', similarWebRank: 2623702, avgPrice: 308.66, currency: 'AUD', productCount: 96, openDate: '2020-10-05', tier: 4 },
  { rank: 42, domain: 'rosineer.com', name: 'Rosineer', country: 'US', similarWebRank: 2658364, category: 'Health', avgPrice: 122.21, currency: 'USD', productCount: 16, openDate: '2017-01-14', tier: 3, notes: 'Rosin presses, extraction' },
  { rank: 43, domain: 'worldoforganicsandhydroponics.com', name: 'World of Organics & Hydroponics', country: 'US', similarWebRank: 2670011, avgPrice: 32.42, currency: 'USD', productCount: 51, openDate: '2019-03-22', tier: 3, notes: 'Texas best hydro/organic' },
  { rank: 44, domain: 'plantliving.co.za', name: 'Plant Living SA', country: 'ZA', similarWebRank: 2743318, avgPrice: 2076.46, currency: 'ZAR', productCount: 304, openDate: '2020-08-05', tier: 3, notes: 'SA leading hydro store' },
  { rank: 45, domain: 'treeoflifecannabis.ca', name: 'Tree of Life', country: 'CA', similarWebRank: 2903300, avgPrice: 46.26, currency: 'CAD', productCount: 11, openDate: '2019-01-02', tier: 4, notes: 'Durham hydro store' },
  { rank: 46, domain: 'discountedhydroponics.com', name: 'Discounted Hydroponics', country: 'US', similarWebRank: 2943253, avgPrice: 351.49, currency: 'USD', productCount: 40, openDate: '2020-02-06', tier: 3, notes: 'Discount grow supplies' },
  { rank: 47, domain: 'pakenhamhydroponics.com.au', name: 'Pakenham Hydroponics', country: 'AU', similarWebRank: 2947997, avgPrice: 483.31, currency: 'AUD', productCount: 147, openDate: '2020-04-02', tier: 3 },
  { rank: 48, domain: 'radongrow.com', name: 'RadonGrow', country: 'IN', similarWebRank: 2982743, category: 'Industrial', avgPrice: 2250, currency: 'INR', productCount: 2, openDate: '2022-04-15', tier: 4 },
  { rank: 49, domain: 'shop.myfarmhand.com', name: 'FarmHand Shop', country: 'US', similarWebRank: 3173647, avgPrice: 244.62, currency: 'USD', productCount: 8, openDate: '2018-03-09', tier: 4 },
  { rank: 50, domain: 'hydrohq.com.au', name: 'Hydro HQ', country: 'AU', similarWebRank: 3180942, avgPrice: 45.6, currency: 'AUD', productCount: 5, openDate: '2020-08-14', tier: 4 },

  // Ranks 51-100 (selected high-value stores)
  { rank: 51, domain: 'plantrevolution.com', name: 'Plant Revolution', country: 'US', similarWebRank: 3427409, category: 'Home and Garden', avgPrice: 13.49, currency: 'USD', productCount: 3, openDate: '2019-01-23', tier: 4, notes: 'Mycorrhizae inoculant' },
  { rank: 54, domain: 'agradehydroponics.com', name: 'A-Grade Hydroponics', country: 'AU', similarWebRank: 3583700, category: 'Home and Garden', avgPrice: 426.56, currency: 'AUD', productCount: 51, openDate: '2014-08-11', tier: 3, notes: 'Melbourne online hydro' },
  { rank: 55, domain: 'mrfertilizer.ca', name: 'Mr. Fertilizer', country: 'CA', similarWebRank: 3644724, avgPrice: 99.79, currency: 'CAD', productCount: 36, openDate: '2019-06-11', tier: 3, notes: 'Victoria BC hydro' },
  { rank: 56, domain: 'hydro45.com', name: 'Hydro 45', country: 'US', similarWebRank: 3653256, avgPrice: 270.26, currency: 'USD', productCount: 121, openDate: '2020-08-13', tier: 3 },
  { rank: 61, domain: 'bloomponic.com', name: 'Bloomponic', country: 'US', similarWebRank: 3841923, avgPrice: 674.42, currency: 'USD', productCount: 105, openDate: '2020-08-27', tier: 3, notes: 'Hydroponic gardening supplies' },
  { rank: 66, domain: 'atlantishydroponics.com', name: 'Atlantis Hydroponics', country: 'US', similarWebRank: 4161225, category: 'Home and Garden', avgPrice: 119.74, currency: 'USD', productCount: 224, openDate: '2020-04-25', tier: 2, notes: 'Garden center & hydro' },
  { rank: 68, domain: 'premiergrow.com', name: 'Premier Grow', country: 'GB', similarWebRank: 4245386, avgPrice: 95.73, currency: 'GBP', productCount: 348, openDate: '1974-06-29', tier: 2, notes: 'UK hydroponics' },
  { rank: 69, domain: 'growlightparadise.com', name: 'Grow Light Paradise', country: 'US', similarWebRank: 4347227, avgPrice: 2160.48, currency: 'USD', productCount: 386, openDate: '2022-09-16', tier: 2, notes: 'Best LED grow lights' },
  { rank: 70, domain: 'thegrowdepot.ca', name: 'The Grow Depot', country: 'CA', similarWebRank: 4355318, category: 'Home and Garden', avgPrice: 37.06, currency: 'CAD', productCount: 7, openDate: '2020-06-05', tier: 3 },
  { rank: 71, domain: 'shop.amhydro.com', name: 'American Hydroponics', country: 'US', similarWebRank: 4360722, category: 'Industrial', avgPrice: 3670.64, currency: 'USD', productCount: 108, openDate: '2020-08-16', tier: 2, notes: 'Commercial hydro systems' },
  { rank: 72, domain: 'growitnaturally.com', name: 'Grow It Naturally', country: 'US', similarWebRank: 4377077, category: 'Home and Garden', avgPrice: 59.29, currency: 'USD', productCount: 40, openDate: '2011-11-16', tier: 3, notes: 'Organic products' },
  { rank: 74, domain: 'hellohydroponics.com.au', name: 'Hello Hydroponics', country: 'AU', similarWebRank: 4437643, avgPrice: 422.93, currency: 'AUD', productCount: 714, openDate: '2022-06-14', tier: 2, notes: 'AU large catalog' },
  { rank: 76, domain: 'costaricahydroponics.com', name: 'Costa Rica Hydroponics', country: 'US', similarWebRank: 4442388, avgPrice: 96.98, currency: 'USD', productCount: 1488, openDate: '2019-03-16', tier: 1, notes: 'Huge catalog 1488 products' },
  { rank: 78, domain: 'rightbud.ca', name: 'RightBud Canada', country: 'CA', similarWebRank: 4503971, avgPrice: 2433.28, currency: 'CAD', productCount: 404, openDate: '2019-09-18', tier: 2, notes: 'Rosin, trimmers, lights' },
  { rank: 79, domain: 'customgrow.ca', name: 'Custom Indoor Grow', country: 'CA', similarWebRank: 4516850, avgPrice: 72, currency: 'CAD', productCount: 281, openDate: '2020-04-11', tier: 3 },
  { rank: 81, domain: 'growitall.ca', name: 'Grow It All', country: 'CA', similarWebRank: 4717098, category: 'Home and Garden', avgPrice: 17.61, currency: 'CAD', productCount: 210, openDate: '2016-05-07', tier: 3, notes: 'Toronto hydro store' },
  { rank: 85, domain: 'indoorgrow.nz', name: 'Indoor Grow NZ', country: 'NZ', similarWebRank: 4847497, avgPrice: 128.04, currency: 'NZD', productCount: 694, openDate: '2022-04-13', tier: 2, notes: 'NZ large catalog' },
  { rank: 86, domain: 'dulytek.com', name: 'Dulytek', country: 'US', similarWebRank: 4885021, category: 'Health', avgPrice: 187.4, currency: 'USD', productCount: 5, openDate: '2017-09-27', tier: 3, notes: 'Rosin presses' },
  { rank: 88, domain: 'taprootshydroponics.com', name: 'TapRoots Hydroponics', country: 'CA', similarWebRank: 4994521, avgPrice: 1427.37, currency: 'CAD', productCount: 73, openDate: '2020-08-10', tier: 3 },
  { rank: 91, domain: 'growituk.com', name: 'Grow It UK', country: 'GB', similarWebRank: 5215869, avgPrice: 153.53, currency: 'GBP', productCount: 381, openDate: '2021-06-04', tier: 3 },
  { rank: 92, domain: 'npktechnology.co.uk', name: 'NPK Technology', country: 'GB', similarWebRank: 5217326, category: 'Home and Garden', avgPrice: 31.81, currency: 'GBP', productCount: 16, openDate: '2013-10-15', tier: 4, notes: 'Liverpool hydro' },
  { rank: 93, domain: 'yourgrowdepot.com', name: 'Your Grow Depot', country: 'US', similarWebRank: 5341400, avgPrice: 2161.31, currency: 'USD', productCount: 138, openDate: '2019-05-02', tier: 3 },
  { rank: 94, domain: 'thehydrocentre.co.nz', name: 'The Hydro Centre', country: 'NZ', similarWebRank: 5501699, category: 'Home and Garden', avgPrice: 220.37, currency: 'NZD', productCount: 167, openDate: '2020-11-04', tier: 3 },
  { rank: 97, domain: '5pointsgrowing.com', name: '5 Points Growing Malta', country: 'MT', similarWebRank: 5793573, avgPrice: 71.19, currency: 'EUR', productCount: 519, openDate: '2022-06-14', tier: 3, notes: 'Malta indoor growing' },
  { rank: 100, domain: 'anuwayhydro.com', name: 'AnuWay Hydro', country: 'US', similarWebRank: 6049579, avgPrice: 58.89, currency: 'USD', productCount: 210, openDate: '2021-12-30', tier: 3, notes: 'Hydro & brew supply' },
];

// ============================================================================
// High-Value Stores for Scraping
// ============================================================================

/** 
 * Best stores for product data scraping (by product count and quality) 
 */
export const HIGH_VALUE_STORES = SHOPIFY_HYDRO_STORES.filter(s => 
  s.tier <= 2 && (s.productCount ?? 0) >= 100
);

/**
 * Get stores by country
 */
export function getStoresByCountry(country: string): CompetitorStore[] {
  return SHOPIFY_HYDRO_STORES.filter(s => s.country === country);
}

/**
 * Get US Shopify hydro stores (best for scraping - no currency conversion)
 */
export const US_HYDRO_STORES = getStoresByCountry('US');

/**
 * Get stores with large catalogs (500+ products)
 */
export const LARGE_CATALOG_STORES = SHOPIFY_HYDRO_STORES.filter(s => 
  (s.productCount ?? 0) >= 500
);

/**
 * Store count summary
 */
export const STORE_SUMMARY = {
  total: SHOPIFY_HYDRO_STORES.length,
  byTier: {
    tier1: SHOPIFY_HYDRO_STORES.filter(s => s.tier === 1).length,
    tier2: SHOPIFY_HYDRO_STORES.filter(s => s.tier === 2).length,
    tier3: SHOPIFY_HYDRO_STORES.filter(s => s.tier === 3).length,
    tier4: SHOPIFY_HYDRO_STORES.filter(s => s.tier === 4).length,
  },
  byCountry: {
    US: getStoresByCountry('US').length,
    CA: getStoresByCountry('CA').length,
    AU: getStoresByCountry('AU').length,
    GB: getStoresByCountry('GB').length,
    other: SHOPIFY_HYDRO_STORES.filter(s => !['US', 'CA', 'AU', 'GB'].includes(s.country)).length,
  },
  totalProducts: SHOPIFY_HYDRO_STORES.reduce((sum, s) => sum + (s.productCount ?? 0), 0),
};

console.log('Competitor Store Summary:', STORE_SUMMARY);
