export interface NutrientSpecs {
  npkRatio?: string;
  guaranteedAnalysis?: Record<string, string>;
  form?: 'liquid' | 'powder' | 'granular' | 'other';
  organicCertifications?: string[];
  omriListed?: boolean;
  growthStage?: string[];        // ['veg', 'bloom', 'clone']
  compatibleMedia?: string[];    // ['hydro', 'soil', 'coco']
  usageNotes?: string[];         // raw text usage hints
}

export interface LightingSpecs {
  fixtureType?: string;          // 'LED', 'DE HPS', 'CMH', etc.
  wattageActual?: number;
  wattageLabel?: number;
  inputVoltage?: string;         // '120-277V'
  amperage?: string;
  spectrum?: string;             // '3000K full spectrum'
  ppf?: string;                  // '1700 μmol/s'
  efficacy?: string;             // '2.7 μmol/J'
  coverageFlower?: string;       // '4x4'
  coverageVeg?: string;
  dimmingOptions?: string[];
  controllerCompat?: string[];
  ipRating?: string;
  dimensions?: string;
  weight?: string;
  warranty?: string;
}

export interface EnvironmentSpecs {
  diameterInches?: number;
  cfm?: number;
  filterLife?: string;
  noiseLevel?: string;
  co2ControlType?: string;
  sensorRange?: string;
  operatingRange?: string;
}

export interface MediaSpecs {
  mediaType?: string;            // 'rockwool', 'coco', etc.
  volume?: string;               // '50L'
  notes?: string[];
}

export interface ContainerSpecs {
  sizeGallons?: number;
  material?: string;             // 'fabric', 'plastic'
  diameter?: string;
  height?: string;
  specialFeatures?: string[];    // 'handles', 'aeration'
}

export interface PumpSpecs {
  gph?: number;
  headHeight?: string;
  submersible?: boolean;
  powerWatts?: number;
}

export interface MeterSpecs {
  meterType?: string;            // 'pH', 'EC', 'Combo'
  range?: string;
  accuracy?: string;
  calibration?: string;
}

export interface SystemSpecs {
  systemType?: string;           // 'DWC', 'RDWC', 'drip'
  plantSites?: number;
  reservoirVolume?: string;
  includedItems?: string[];
}

export interface UsageAndSafety {
  usageInstructions?: string;
  mixingRatios?: string[];
  safetyWarnings?: string[];
  restrictedRegions?: string[];
  sdsUrl?: string;
}

export interface SeoAndUx {
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  h2s?: string[];
  featureBullets?: string[];
  benefitBullets?: string[];
  faqs?: { question: string; answer: string }[];
  ratingAverage?: number;
  ratingCount?: number;
}

export interface ImageSet {
  main?: string;
  gallery?: string[];
  labelCloseups?: string[];
  lifestyle?: string[];
  diagrams?: string[];
}

export interface ScrapedCompetitorProduct {
  sourceDomain: string;
  url: string;

  core: {
    title: string;
    brand?: string;
    sku?: string;
    mpn?: string;
    upc?: string;
    breadcrumbs?: string[];
    categoryPath?: string[];
    availability?: string;   // 'in_stock', 'out_of_stock', etc.
    price?: number;
    compareAtPrice?: number;
    currency?: string;
    variantOptions?: Record<string, string[]>; // { Size: ['1L','4L'] }
  };

  content: {
    shortDescription?: string;
    longDescriptionHtml?: string;
    featureBullets?: string[];
    benefitBullets?: string[];
  };

  specs: {
    generic?: Record<string, string>;
    nutrient?: NutrientSpecs;
    lighting?: LightingSpecs;
    environment?: EnvironmentSpecs;
    media?: MediaSpecs;
    container?: ContainerSpecs;
    pump?: PumpSpecs;
    meter?: MeterSpecs;
    system?: SystemSpecs;
  };

  usageAndSafety?: UsageAndSafety;
  seoAndUx?: SeoAndUx;

  images?: ImageSet;

  rawBlocks?: {
    tablesHtml?: string[];
    bulletLists?: string[][];
    paragraphs?: string[];
  };
}
