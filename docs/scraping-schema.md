# Hydroponics Product Scraping Schema

This document defines the TypeScript interfaces for scraping competitor product data in the hydroponics industry. The schema is optimized for enriching H-Moon Hydro product listings with detailed specifications.

## Overview

Scraped data flows through this pipeline:
```
Competitor Site → ScrapedCompetitorProduct → Normalizers → Shopify Metafields
```

## Source Files

- **Type definitions**: `hmoon-pipeline/src/scraping/types.ts`
- **Example scraper**: `hmoon-pipeline/src/scraping/exampleScraper.ts`

---

## Core Interface: `ScrapedCompetitorProduct`

The main container for all scraped product data:

```typescript
interface ScrapedCompetitorProduct {
  sourceDomain: string;     // "htgsupply.com", "growgeneration.com"
  url: string;              // Full product URL

  core: {
    title: string;
    brand?: string;
    sku?: string;
    mpn?: string;           // Manufacturer Part Number
    upc?: string;           // Universal Product Code
    breadcrumbs?: string[];
    categoryPath?: string[];
    availability?: string;  // 'in_stock', 'out_of_stock', 'backorder'
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
    generic?: Record<string, string>;  // Catch-all for non-category specs
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
  rawBlocks?: RawBlocks;
}
```

---

## Category-Specific Specifications

### `NutrientSpecs` — Fertilizers, Supplements, Additives

```typescript
interface NutrientSpecs {
  npkRatio?: string;                  // "3-1-2", "0-10-10"
  guaranteedAnalysis?: Record<string, string>;  // {"Nitrogen (N)": "3%", ...}
  form?: 'liquid' | 'powder' | 'granular' | 'other';
  organicCertifications?: string[];   // ["OMRI Listed", "CDFA Organic"]
  omriListed?: boolean;               // Quick flag for OMRI
  growthStage?: string[];             // ['veg', 'bloom', 'clone', 'transition']
  compatibleMedia?: string[];         // ['hydro', 'soil', 'coco', 'aero']
  usageNotes?: string[];              // Raw usage hints from product page
  
  // Enhanced fields for better enrichment
  applicationMethod?: string;         // "Foliar spray", "Root drench"
  dilutionRate?: string;             // "5ml per gallon"
  phRange?: string;                  // "5.5-6.5"
  ecRange?: string;                  // "1.2-2.0 mS/cm"
  shelfLife?: string;                // "2 years unopened"
  storageRequirements?: string;      // "Keep cool, shake before use"
}
```

### `LightingSpecs` — Grow Lights, Fixtures, Ballasts

```typescript
interface LightingSpecs {
  fixtureType?: string;               // 'LED', 'DE HPS', 'CMH', 'SE HPS', 'T5'
  wattageActual?: number;             // Actual power draw
  wattageLabel?: number;              // "1000W equivalent"
  inputVoltage?: string;              // '120-277V', '240V'
  amperage?: string;                  // '4.2A @ 120V'
  spectrum?: string;                  // '3000K full spectrum', '660nm red'
  
  // PAR/PPF metrics (critical for grow lights)
  ppf?: string;                       // '1700 μmol/s' - total photon flux
  ppfd?: string;                      // '1500 μmol/m²/s @ 12"' - at specific height
  efficacy?: string;                  // '2.7 μmol/J' - efficiency rating
  
  // Coverage areas
  coverageFlower?: string;            // '4x4', '5x5'
  coverageVeg?: string;               // '5x5', '6x6'
  hangHeight?: string;                // "12-18 inches recommended"
  
  // Features
  dimmingOptions?: string[];          // ['0-10V', 'RJ14 daisy-chain']
  controllerCompat?: string[];        // ['AC Infinity Controller', 'Gavita']
  isKitComplete?: boolean;            // Includes ballast, reflector, bulb?
  
  // Physical
  ipRating?: string;                  // 'IP65', 'IP67'
  dimensions?: string;                // '44" x 44" x 3"'
  weight?: string;                    // '28 lbs'
  mountingType?: string;              // 'Hanging', 'Rack-mount'
  
  warranty?: string;                  // '5 years', 'Lifetime LED diodes'
  lifespan?: string;                  // '100,000 hours'
  certifications?: string[];          // ['ETL Listed', 'FCC', 'RoHS']
}
```

### `EnvironmentSpecs` — Fans, Filters, Climate Control

```typescript
interface EnvironmentSpecs {
  // Fan/ventilation specs
  diameterInches?: number;            // 6, 8, 10, 12
  cfm?: number;                       // Cubic feet per minute airflow
  cfmRange?: string;                  // "200-800 CFM" for variable speed
  staticPressure?: string;            // "1.5" H2O"
  noiseLevel?: string;                // '32 dB @ low', '48 dB @ max'
  speedSettings?: number;             // Number of speed settings
  
  // Filter specs  
  filterLife?: string;                // "12-18 months", "2 years"
  carbonDepth?: string;               // "2 inch RC-48 carbon"
  filterSize?: string;                // "6x24"
  
  // CO2 control
  co2ControlType?: string;            // 'regulator', 'generator', 'controller'
  co2Range?: string;                  // "0-2000 ppm"
  
  // Sensors/monitors
  sensorRange?: string;               // "0-99% RH", "32-122°F"
  sensorAccuracy?: string;            // "±2% RH, ±1°C"
  dataLogging?: boolean;              // Has data logging capability
  
  // Operating conditions
  operatingRange?: string;            // "32-120°F, 5-95% RH"
  maxRoomSize?: string;               // "8x8 tent", "1000 sq ft"
  
  // Connectivity
  controllerIntegration?: string[];   // ['AC Infinity App', 'Bluetooth']
  automationFeatures?: string[];      // ['Temp trigger', 'Humidity trigger']
}
```

### `MediaSpecs` — Growing Media, Substrates

```typescript
interface MediaSpecs {
  mediaType?: string;                 // 'rockwool', 'coco coir', 'perlite', 'clay pebbles'
  volume?: string;                    // '50L', '4 cu ft'
  weight?: string;                    // '40 lbs'
  packSize?: string;                  // '6 slabs', '100 cubes'
  
  // Physical properties
  waterRetention?: string;            // 'High', 'Medium', '70%'
  aeration?: string;                  // 'Excellent', '30% air porosity'
  ph?: string;                        // 'Neutral 6.5-7.0', 'Buffered to 6.0'
  ec?: string;                        // '<0.5 mS/cm'
  
  // Coco-specific
  cocoSource?: string;                // 'Sri Lankan', 'Indian'
  washLevel?: string;                 // 'Triple-washed', 'Low salt'
  
  // Rockwool-specific
  density?: string;                   // 'Standard', 'Grodan Master'
  dimensions?: string;                // '4x4x4 inch cubes'
  
  notes?: string[];                   // Additional product notes
}
```

### `ContainerSpecs` — Pots, Fabric Pots, Trays

```typescript
interface ContainerSpecs {
  sizeGallons?: number;               // 1, 3, 5, 7, 10, 15, 25, etc.
  sizeLiters?: number;                // Metric equivalent
  material?: string;                  // 'fabric', 'plastic', 'air-pot', 'terracotta'
  
  diameter?: string;                  // "12 inch"
  height?: string;                    // "10 inch"
  
  specialFeatures?: string[];         // ['handles', 'aeration', 'self-watering']
  color?: string;                     // 'Black', 'Tan', 'White'
  
  // For trays/saucers
  innerDimensions?: string;           // "4x4 inner"
  drainageType?: string;              // 'Bottom drain', 'No holes'
  
  packQuantity?: number;              // Sold in packs of 5, 10, etc.
}
```

### `PumpSpecs` — Water Pumps, Air Pumps

```typescript
interface PumpSpecs {
  pumpType?: string;                  // 'submersible', 'inline', 'air'
  gph?: number;                       // Gallons per hour (water pumps)
  lpm?: number;                       // Liters per minute (air pumps)
  headHeight?: string;                // Max lift: "10 ft"
  submersible?: boolean;
  powerWatts?: number;
  inletSize?: string;                 // "3/4 inch"
  outletSize?: string;                // "1 inch"
  
  // Air pump specific
  outlets?: number;                   // Number of air outlets
  psi?: string;                       // Pressure rating
  
  noiseLevel?: string;                // '35 dB'
  dutyCycle?: string;                 // 'Continuous', '50% duty'
}
```

### `MeterSpecs` — pH, EC, TDS, Combo Meters

```typescript
interface MeterSpecs {
  meterType?: string;                 // 'pH', 'EC', 'TDS', 'Combo', 'DO'
  range?: string;                     // "0-14 pH", "0-9999 ppm"
  accuracy?: string;                  // "±0.01 pH", "±2%"
  resolution?: string;                // "0.01 pH"
  
  calibration?: string;               // 'Auto 1-3 point', 'Manual'
  calibrationPoints?: number;         // 1, 2, 3
  
  displayType?: string;               // 'LCD', 'OLED', 'Backlit'
  waterproof?: string;                // 'IP67', 'Waterproof'
  
  electrodeType?: string;             // 'Replaceable', 'Fixed'
  electrodeLife?: string;             // '12-18 months'
  
  includesCalibration?: boolean;      // Includes calibration solutions
  powerSource?: string;               // 'AAA batteries', 'Rechargeable'
}
```

### `SystemSpecs` — Complete Hydro Systems, Kits

```typescript
interface SystemSpecs {
  systemType?: string;                // 'DWC', 'RDWC', 'NFT', 'Ebb & Flow', 'Drip'
  plantSites?: number;                // Number of plant sites
  reservoirVolume?: string;           // '20 gallon', '55 gallon'
  
  includedItems?: string[];           // ['air pump', 'net pots', 'tubing']
  dimensions?: string;                // System footprint
  
  // For drip/irrigation systems
  emitterCount?: number;
  flowRate?: string;                  // "2 GPH per emitter"
  pressureRating?: string;            // "15-30 PSI"
  
  // For aeroponics
  cycleTimer?: string;                // "1 min on / 5 min off"
  misterType?: string;                // "High pressure", "Low pressure"
}
```

---

## Supporting Interfaces

### `UsageAndSafety`

```typescript
interface UsageAndSafety {
  usageInstructions?: string;         // General usage text
  mixingRatios?: string[];            // ["1 tsp/gal seedling", "3 tsp/gal bloom"]
  feedingSchedule?: string;           // Link or description of feed chart
  safetyWarnings?: string[];          // Safety notes
  restrictedRegions?: string[];       // Where product can't ship
  sdsUrl?: string;                    // Safety Data Sheet URL
  hazardClass?: string;               // Shipping hazard classification
}
```

### `SeoAndUx`

```typescript
interface SeoAndUx {
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  h2s?: string[];
  featureBullets?: string[];          // Key selling points
  benefitBullets?: string[];          // Customer benefits
  
  faqs?: Array<{
    question: string;
    answer: string;
  }>;
  
  ratingAverage?: number;             // 4.5
  ratingCount?: number;               // 127 reviews
  reviewHighlights?: string[];        // Best quotes from reviews
}
```

### `ImageSet`

```typescript
interface ImageSet {
  main?: string;                      // Primary product image URL
  gallery?: string[];                 // Additional angles
  labelCloseups?: string[];           // Label/ingredient photos
  lifestyle?: string[];               // In-use photos
  diagrams?: string[];                // Sizing charts, feed charts
  
  // Image metadata for alt text generation
  altTextSuggestions?: string[];
}
```

### `RawBlocks`

```typescript
interface RawBlocks {
  tablesHtml?: string[];              // Raw HTML tables (specs tables)
  bulletLists?: string[][];           // Raw bullet lists
  paragraphs?: string[];              // Text paragraphs
  structuredData?: object;            // JSON-LD if present
}
```

---

## Scraper Implementation Guidelines

### 1. Priority Sites for Hydroponics

| Site | Products | Notes |
|------|----------|-------|
| growgeneration.com | Full catalog | Major chain, good specs |
| htgsupply.com | Lighting focus | Detailed light specs |
| hydrobuilder.com | Nutrients, media | Good pricing data |
| amazon.com | All | Rich reviews, inconsistent specs |
| homedepot.com | Basic supplies | Limited hydro-specific |

### 2. Extraction Priority

When scraping, prioritize in this order:
1. **SKU/UPC** — Critical for matching
2. **Title & Brand** — Identity
3. **Price & Availability** — Business data
4. **Category-specific specs** — The unique value
5. **Images** — For enrichment
6. **Description/bullets** — For AI generation

### 3. Normalization Rules

```typescript
// Weight normalization
"28 lbs" → { value: 28, unit: 'lb', grams: 12700.6 }
"12.7 kg" → { value: 12.7, unit: 'kg', grams: 12700 }

// Volume normalization  
"1 quart" → { value: 1, unit: 'qt', liters: 0.946 }
"4L" → { value: 4, unit: 'L', liters: 4 }

// Light coverage
"4x4'" → { width: 4, length: 4, unit: 'ft', area: 16 }
"3'x3'" → { width: 3, length: 3, unit: 'ft', area: 9 }
```

### 4. Brand Detection

Always extract brand from:
1. Breadcrumb (most reliable)
2. Title prefix (`"General Hydroponics Flora Series"`)
3. Separate brand field
4. URL slug (`/general-hydroponics/`)

Cross-reference with `brandRegistry.ts` to normalize.

---

## Usage Example

```typescript
import { ScrapedCompetitorProduct, NutrientSpecs } from './types';

const scrapedProduct: ScrapedCompetitorProduct = {
  sourceDomain: 'growgeneration.com',
  url: 'https://growgeneration.com/products/fox-farm-big-bloom',
  
  core: {
    title: 'FoxFarm Big Bloom Liquid Concentrate Fertilizer',
    brand: 'Fox Farm',
    sku: 'FX14000',
    upc: '752289790051',
    price: 24.99,
    availability: 'in_stock',
    variantOptions: { Size: ['1 Pint', '1 Quart', '1 Gallon'] }
  },
  
  specs: {
    nutrient: {
      npkRatio: '0-0.5-0.7',
      form: 'liquid',
      omriListed: true,
      growthStage: ['bloom', 'transition'],
      compatibleMedia: ['soil', 'hydro', 'coco'],
      dilutionRate: '4 tbsp per gallon'
    }
  },
  
  images: {
    main: 'https://cdn.example.com/big-bloom-1gal.jpg',
    labelCloseups: ['https://cdn.example.com/big-bloom-label.jpg']
  }
};
```

---

## Next Steps

1. **Implement per-site scrapers** in `hmoon-pipeline/src/scraping/`
2. **Add normalizers** for each spec type
3. **Create matching logic** to link scraped data to existing products
4. **Build enrichment writer** to update Shopify metafields

See `hmoon-pipeline/README.md` for CLI usage and `npm run scrape:demo` for testing.
