/**
 * Expanded Product Line Size Audit
 * 
 * Enhanced version with MORE BRANDS:
 * - Nectar for the Gods
 * - Roots Organics
 * - Earth Juice
 * - Technaflora
 * - Dutch Master
 * - Greenplanet
 * - Remo Nutrients
 * - Heavy 16
 * - Cultured Solutions
 * - Cutting Edge Solutions
 * - Botanicare (expanded)
 * - Plus all originals
 * 
 * OUTPUTS:
 * 1. Full size audit with all brands
 * 2. Special Order Catalog (HTML/JSON)
 * 3. Distributor Order List
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');

// === EXPANDED MANUFACTURER SIZE DATABASE ===
const MANUFACTURER_SIZES = {
  'General Hydroponics': {
    'Flora Series (FloraGro, FloraBloom, FloraMicro)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon', '15 Gallon', '55 Gallon Drum', '275 Gallon Tote'],
      type: 'liquid',
      note: 'Core 3-part - essential stock',
      priority: 1,
      distributor: 'Hawthorne'
    },
    'FloraNova (Grow & Bloom)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'CALiMAGic': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      note: 'Very popular supplement',
      priority: 2,
      distributor: 'Hawthorne'
    },
    'Armor Si': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Diamond Nectar': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Liquid KoolBloom': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Bloom booster',
      priority: 2,
      distributor: 'Hawthorne'
    },
    'Dry KoolBloom': {
      sizes: ['2.2 lb', '6 lb', '25 lb'],
      type: 'dry',
      distributor: 'Hawthorne'
    },
    'MaxiGro & MaxiBloom': {
      sizes: ['2.2 lb', '16 lb'],
      type: 'dry',
      note: 'Budget-friendly 1-part dry',
      distributor: 'Hawthorne'
    },
    'RapidStart': {
      sizes: ['125ml', 'Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Floralicious Plus': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'FloraNectar (Sugar/Pineapple/Fruit)': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'BioThrive (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      note: 'Organic line',
      distributor: 'Hawthorne'
    },
    'pH Up & pH Down': {
      sizes: ['8 oz', 'Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon', '15 Gallon', '55 Gallon Drum'],
      type: 'liquid',
      note: 'Always stock - essential',
      priority: 1,
      distributor: 'Hawthorne'
    },
  },
  
  'Advanced Nutrients': {
    'pH Perfect Sensi (Grow/Bloom A&B)': {
      sizes: ['500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Core 2-part with pH buffering',
      priority: 1,
      distributor: 'Advanced Nutrients Direct'
    },
    'pH Perfect Connoisseur (Grow/Bloom A&B)': {
      sizes: ['500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Premium line',
      distributor: 'Advanced Nutrients Direct'
    },
    'Big Bud': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Bloom booster - top seller',
      priority: 1,
      distributor: 'Advanced Nutrients Direct'
    },
    'B-52': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      priority: 2,
      distributor: 'Advanced Nutrients Direct'
    },
    'Bud Candy': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Overdrive': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Bud Ignitor': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Voodoo Juice': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Beneficial bacteria',
      priority: 2,
      distributor: 'Advanced Nutrients Direct'
    },
    'Piranha': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Tarantula': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Rhino Skin': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: 'Silica - popular add-on',
      priority: 2,
      distributor: 'Advanced Nutrients Direct'
    },
    'Nirvana': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Sensizym': {
      sizes: ['250ml', '500ml', '1L', '4L', '10L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
    'Flawless Finish': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Advanced Nutrients Direct'
    },
  },
  
  'Fox Farm': {
    'Trio (Grow Big, Big Bloom, Tiger Bloom)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Best-selling liquid trio',
      priority: 1,
      distributor: 'Sunlight Supply'
    },
    'Sledgehammer': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Sunlight Supply'
    },
    'Open Sesame': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - early bloom',
      priority: 2,
      distributor: 'Sunlight Supply'
    },
    'Beastie Bloomz': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - mid bloom',
      priority: 2,
      distributor: 'Sunlight Supply'
    },
    'Cha Ching': {
      sizes: ['6 oz', '1 lb', '5 lb'],
      type: 'dry',
      note: 'Soluble - late bloom',
      priority: 2,
      distributor: 'Sunlight Supply'
    },
    'Kangaroots': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Sunlight Supply'
    },
    'Microbe Brew': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Sunlight Supply'
    },
    'Happy Frog Jump Start': {
      sizes: ['3 lb', '18 lb'],
      type: 'dry',
      distributor: 'Sunlight Supply'
    },
    'Dirty Dozen Starter Kit': {
      sizes: ['Kit'],
      type: 'kit',
      note: 'Great entry point',
      distributor: 'Sunlight Supply'
    },
  },
  
  'Botanicare': {
    'Pure Blend Pro (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'CNS17 (Grow, Bloom, Ripe)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid',
      note: 'Professional 1-part formula',
      priority: 2,
      distributor: 'Hawthorne'
    },
    'Cal-Mag Plus': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Very popular - essential supplement',
      priority: 1,
      distributor: 'Hawthorne'
    },
    'Hydroplex': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Sweet (Raw, Berry, Citrus, Grape)': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Clearex': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Rhizo Blast': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
    'Liquid Karma': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Organic supplement',
      priority: 2,
      distributor: 'Hawthorne'
    },
    'Hydroguard': {
      sizes: ['8 oz', 'Quart', 'Gallon'],
      type: 'liquid',
      note: 'Root zone protection',
      priority: 2,
      distributor: 'Hawthorne'
    },
    'Silica Blast': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Hawthorne'
    },
  },
  
  'Canna': {
    'Coco A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid',
      note: 'Industry standard for coco',
      priority: 1,
      distributor: 'Hydrofarm'
    },
    'Terra Vega & Flores': {
      sizes: ['1L', '5L', '10L'],
      type: 'liquid',
      distributor: 'Hydrofarm'
    },
    'Aqua Vega/Flores A&B': {
      sizes: ['1L', '5L', '10L'],
      type: 'liquid',
      distributor: 'Hydrofarm'
    },
    'Boost': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid',
      priority: 2,
      distributor: 'Hydrofarm'
    },
    'Cannazym': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid',
      distributor: 'Hydrofarm'
    },
    'Rhizotonic': {
      sizes: ['250ml', '1L', '5L', '10L'],
      type: 'liquid',
      distributor: 'Hydrofarm'
    },
    'PK 13/14': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'Bloom booster',
      distributor: 'Hydrofarm'
    },
    'Bio Vega/Flores': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'Organic line',
      distributor: 'Hydrofarm'
    },
  },
  
  'House & Garden': {
    'Aqua Flakes A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
    'Coco A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
    'Roots Excelurator Gold': {
      sizes: ['100ml', '250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      note: 'Premium root stimulator - high margin',
      priority: 1,
      distributor: 'House & Garden Direct'
    },
    'Top Booster': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
    'Bud-XL': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
    'Shooting Powder': {
      sizes: ['sachet (5g)', '65g', '500g', '1kg'],
      type: 'dry',
      priority: 2,
      distributor: 'House & Garden Direct'
    },
    'Multi Zen': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
    'Drip Clean': {
      sizes: ['250ml', '500ml', '1L', '5L'],
      type: 'liquid',
      distributor: 'House & Garden Direct'
    },
  },
  
  'Athena': {
    'Pro Line Core': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon', '275 Gallon Tote'],
      type: 'liquid',
      note: 'Commercial focus - bulk pricing',
      priority: 1,
      distributor: 'Athena Direct'
    },
    'Grow A&B': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon'],
      type: 'liquid',
      distributor: 'Athena Direct'
    },
    'Bloom A&B': {
      sizes: ['Gallon', '5 Gallon', '15 Gallon', '55 Gallon'],
      type: 'liquid',
      distributor: 'Athena Direct'
    },
    'Balance': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Athena Direct'
    },
    'Cleanse': {
      sizes: ['Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Athena Direct'
    },
    'IPM': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Athena Direct'
    },
    'Stack': {
      sizes: ['Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'PK booster',
      distributor: 'Athena Direct'
    },
  },
  
  // === NEW BRANDS ===
  
  'Nectar for the Gods': {
    'One Shot Granules': {
      sizes: ['3 lb', '6 lb', '25 lb', '50 lb'],
      type: 'dry',
      note: 'Slow-release amendment',
      distributor: 'Oregon\'s Only Direct'
    },
    'Gaia Mania (Grow)': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Medusa\'s Magic (Grow)': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Zeus Juice (Nitrogen)': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Athena\'s Aminas': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Protein breakdown',
      distributor: 'Oregon\'s Only Direct'
    },
    'Bloom Khaos': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      note: 'Foliar spray',
      priority: 2,
      distributor: 'Oregon\'s Only Direct'
    },
    'Herculean Harvest': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Bone meal calcium',
      priority: 2,
      distributor: 'Oregon\'s Only Direct'
    },
    'Demeter\'s Destiny': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'The Kraken (Kelp)': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Triton\'s Trawl (Fish)': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Mega Morpheus (Bloom)': {
      sizes: ['Quart', 'Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Oregon\'s Only Direct'
    },
    'Starter Kit (Roman Regime)': {
      sizes: ['Kit'],
      type: 'kit',
      note: 'Great entry point',
      priority: 1,
      distributor: 'Oregon\'s Only Direct'
    },
  },
  
  'Roots Organics': {
    'Buddha Grow': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Aurora Innovations'
    },
    'Buddha Bloom': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      distributor: 'Aurora Innovations'
    },
    'Trinity (Catalyst)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Aurora Innovations'
    },
    'HPK (Bat Guano)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Bloom booster',
      distributor: 'Aurora Innovations'
    },
    'Soul Synthetics (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Mineral line',
      distributor: 'Aurora Innovations'
    },
    'Terp Tea (Grow & Bloom)': {
      sizes: ['3 lb', '9 lb', '40 lb'],
      type: 'dry',
      note: 'Compost tea base',
      priority: 2,
      distributor: 'Aurora Innovations'
    },
    'Elemental': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Cal-Mag',
      distributor: 'Aurora Innovations'
    },
    'Ancient Amber': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Aurora Innovations'
    },
    'Original Potting Soil': {
      sizes: ['1.5 cu ft', '3 cu ft'],
      type: 'soil',
      priority: 1,
      distributor: 'Aurora Innovations'
    },
    'Greenfields Potting Mix': {
      sizes: ['1.5 cu ft', '3 cu ft'],
      type: 'soil',
      distributor: 'Aurora Innovations'
    },
  },
  
  'Earth Juice': {
    'Grow': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      priority: 2,
      distributor: 'Hydro-Organics Wholesale'
    },
    'Bloom': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      priority: 2,
      distributor: 'Hydro-Organics Wholesale'
    },
    'Catalyst': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Hydro-Organics Wholesale'
    },
    'Meta-K': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      note: 'Potassium boost',
      distributor: 'Hydro-Organics Wholesale'
    },
    'Microblast': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hydro-Organics Wholesale'
    },
    'Sugar Peak (Grand/Vegetative/Transition/Flowering)': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      note: 'Stage-specific line',
      distributor: 'Hydro-Organics Wholesale'
    },
    'OilyCann': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      note: 'Essential oils supplement',
      distributor: 'Hydro-Organics Wholesale'
    },
    'SeaBlast (Grow & Bloom)': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Hydro-Organics Wholesale'
    },
  },
  
  'Technaflora': {
    'BC Boost': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Technaflora Direct'
    },
    'BC Grow': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Technaflora Direct'
    },
    'BC Bloom': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Technaflora Direct'
    },
    'MagiCal': {
      sizes: ['500ml', '1L', '4L', '10L'],
      type: 'liquid',
      note: 'Cal-Mag supplement',
      priority: 2,
      distributor: 'Technaflora Direct'
    },
    'Thrive Alive B-1 (Green & Red)': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      note: 'B-1 vitamin supplement',
      distributor: 'Technaflora Direct'
    },
    'Sugar Daddy': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Technaflora Direct'
    },
    'Awesome Blossoms': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Bloom enhancer',
      distributor: 'Technaflora Direct'
    },
    'Root 66': {
      sizes: ['250ml', '500ml', '1L', '4L'],
      type: 'liquid',
      distributor: 'Technaflora Direct'
    },
    'Recipe for Success Starter Kit': {
      sizes: ['Kit'],
      type: 'kit',
      priority: 1,
      distributor: 'Technaflora Direct'
    },
  },
  
  'Dutch Master': {
    'Advance Grow A&B': {
      sizes: ['1L', '5L', '20L'],
      type: 'liquid',
      distributor: 'Dutch Master Direct'
    },
    'Advance Flower A&B': {
      sizes: ['1L', '5L', '20L'],
      type: 'liquid',
      distributor: 'Dutch Master Direct'
    },
    'Gold Range Grow A&B': {
      sizes: ['1L', '5L', '20L'],
      type: 'liquid',
      note: 'Premium line',
      distributor: 'Dutch Master Direct'
    },
    'Gold Range Flower A&B': {
      sizes: ['1L', '5L', '20L'],
      type: 'liquid',
      note: 'Premium line',
      distributor: 'Dutch Master Direct'
    },
    'Silica': {
      sizes: ['1L', '5L'],
      type: 'liquid',
      distributor: 'Dutch Master Direct'
    },
    'Add.27 (Zone/Saturator)': {
      sizes: ['250ml', '1L'],
      type: 'liquid',
      note: 'Penetrant additive',
      distributor: 'Dutch Master Direct'
    },
    'Potash Plus': {
      sizes: ['1L', '5L'],
      type: 'liquid',
      distributor: 'Dutch Master Direct'
    },
    'Max Flower': {
      sizes: ['1L', '5L'],
      type: 'liquid',
      note: 'PK booster',
      distributor: 'Dutch Master Direct'
    },
  },
  
  'Greenplanet': {
    'Dual Fuel (1&2)': {
      sizes: ['1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: '2-part base',
      priority: 1,
      distributor: 'Greenplanet Direct'
    },
    'Medi One': {
      sizes: ['1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: '1-part complete',
      distributor: 'Greenplanet Direct'
    },
    'Massive Bloom Formulation': {
      sizes: ['500ml', '1L', '4L', '10L'],
      type: 'liquid',
      note: 'PK booster',
      priority: 2,
      distributor: 'Greenplanet Direct'
    },
    'GP3 (Grow, Micro, Bloom)': {
      sizes: ['1L', '4L', '10L', '23L'],
      type: 'liquid',
      note: '3-part like GH Flora',
      distributor: 'Greenplanet Direct'
    },
    'Vitathrive': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'B-vitamin',
      distributor: 'Greenplanet Direct'
    },
    'Ocean Magic': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Kelp extract',
      distributor: 'Greenplanet Direct'
    },
    'Pro Cal': {
      sizes: ['1L', '4L', '10L'],
      type: 'liquid',
      note: 'Cal-Mag',
      priority: 2,
      distributor: 'Greenplanet Direct'
    },
    'Rezin': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Terpene enhancer',
      distributor: 'Greenplanet Direct'
    },
    'Finisher': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Late bloom ripener',
      distributor: 'Greenplanet Direct'
    },
  },
  
  'Remo Nutrients': {
    'Grow': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Remo Direct'
    },
    'Micro': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Remo Direct'
    },
    'Bloom': {
      sizes: ['1L', '4L', '10L', '20L'],
      type: 'liquid',
      distributor: 'Remo Direct'
    },
    'VeloKelp': {
      sizes: ['500ml', '1L', '4L', '10L'],
      type: 'liquid',
      note: 'Kelp supplement',
      distributor: 'Remo Direct'
    },
    'MagNifiCal': {
      sizes: ['1L', '4L', '10L'],
      type: 'liquid',
      note: 'Cal-Mag',
      priority: 2,
      distributor: 'Remo Direct'
    },
    'Nature\'s Candy': {
      sizes: ['1L', '4L', '10L'],
      type: 'liquid',
      note: 'Carbs supplement',
      distributor: 'Remo Direct'
    },
    'AstroFlower': {
      sizes: ['500ml', '1L', '4L'],
      type: 'liquid',
      note: 'Bloom booster',
      distributor: 'Remo Direct'
    },
    'SuperCharged Starter Kit': {
      sizes: ['Kit'],
      type: 'kit',
      priority: 1,
      distributor: 'Remo Direct'
    },
  },
  
  'Heavy 16': {
    'Veg A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon', '15 Gallon'],
      type: 'liquid',
      note: 'Professional grade',
      priority: 1,
      distributor: 'Heavy 16 Direct'
    },
    'Bud A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon', '15 Gallon'],
      type: 'liquid',
      note: 'Professional grade',
      priority: 1,
      distributor: 'Heavy 16 Direct'
    },
    'Fire': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'PK booster',
      distributor: 'Heavy 16 Direct'
    },
    'Finish': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Heavy 16 Direct'
    },
    'Foliar': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Heavy 16 Direct'
    },
    'Roots': {
      sizes: ['Pint', 'Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Heavy 16 Direct'
    },
    'Prime': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Enzyme/vitamin',
      distributor: 'Heavy 16 Direct'
    },
  },
  
  'Cultured Solutions': {
    'Veg A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Cultured Solutions Direct'
    },
    'Bloom A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '5 Gallon', '15 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Cultured Solutions Direct'
    },
    'UC Roots': {
      sizes: ['Pint', 'Quart', 'Gallon', '2.5 Gallon', '5 Gallon'],
      type: 'liquid',
      note: 'Hypochlorous acid - system cleaner',
      priority: 1,
      distributor: 'Cultured Solutions Direct'
    },
    'Bud Booster Early': {
      sizes: ['8 oz', '1 lb', '5 lb', '25 lb'],
      type: 'dry',
      distributor: 'Cultured Solutions Direct'
    },
    'Bud Booster Mid': {
      sizes: ['8 oz', '1 lb', '5 lb', '25 lb'],
      type: 'dry',
      distributor: 'Cultured Solutions Direct'
    },
    'Bud Booster Late': {
      sizes: ['8 oz', '1 lb', '5 lb', '25 lb'],
      type: 'dry',
      distributor: 'Cultured Solutions Direct'
    },
    'Cal Mag Pro': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      priority: 2,
      distributor: 'Cultured Solutions Direct'
    },
  },
  
  'Cutting Edge Solutions': {
    'Grow (1-2-3 or Micro-Grow-Bloom)': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Cutting Edge Direct'
    },
    'Micro': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Cutting Edge Direct'
    },
    'Bloom': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Cutting Edge Direct'
    },
    'Uncle John\'s Blend': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Sugar/carb supplement',
      distributor: 'Cutting Edge Direct'
    },
    'Plant Amp': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Cutting Edge Direct'
    },
    'Sour-Dee': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      note: 'pH Down',
      distributor: 'Cutting Edge Direct'
    },
    'Sugaree': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      distributor: 'Cutting Edge Direct'
    },
  },
  
  'Mills Nutrients': {
    'Basis A&B': {
      sizes: ['1L', '5L', '10L', '20L'],
      type: 'liquid',
      priority: 1,
      distributor: 'Mills Direct'
    },
    'C4': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'Humic/fulvic',
      distributor: 'Mills Direct'
    },
    'Start': {
      sizes: ['100ml', '250ml', '1L'],
      type: 'liquid',
      note: 'Root/seedling starter',
      distributor: 'Mills Direct'
    },
    'Ultimate PK': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'PK booster',
      priority: 2,
      distributor: 'Mills Direct'
    },
    'Vitalize': {
      sizes: ['250ml', '1L', '5L'],
      type: 'liquid',
      note: 'Silica supplement',
      distributor: 'Mills Direct'
    },
  },
  
  'Emerald Harvest': {
    'Cali Pro A&B': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon', '6 Gallon'],
      type: 'liquid',
      priority: 1,
      distributor: 'Emerald Harvest Direct'
    },
    'Grow/Micro/Bloom': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: '3-part option',
      distributor: 'Emerald Harvest Direct'
    },
    'King Kola': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Bloom booster',
      priority: 2,
      distributor: 'Emerald Harvest Direct'
    },
    'Honey Chome': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Emerald Harvest Direct'
    },
    'Root Wizard': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      distributor: 'Emerald Harvest Direct'
    },
    'Emerald Goddess': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      note: 'Humic/kelp',
      distributor: 'Emerald Harvest Direct'
    },
    'Cal-Mag': {
      sizes: ['Quart', 'Gallon', '2.5 Gallon'],
      type: 'liquid',
      priority: 2,
      distributor: 'Emerald Harvest Direct'
    },
    'Sturdy Stalk': {
      sizes: ['Quart', 'Gallon'],
      type: 'liquid',
      note: 'Silica',
      distributor: 'Emerald Harvest Direct'
    },
  },
};

// === MATCHING RULES BY BRAND ===
const MATCH_RULES = {
  'General Hydroponics': [
    { pattern: /flora\s*(gro|grow|micro|bloom)/i, line: 'Flora Series (FloraGro, FloraBloom, FloraMicro)' },
    { pattern: /floranova/i, line: 'FloraNova (Grow & Bloom)' },
    { pattern: /calimagic|cal-?mag/i, line: 'CALiMAGic' },
    { pattern: /armor\s*si/i, line: 'Armor Si' },
    { pattern: /diamond\s*nectar/i, line: 'Diamond Nectar' },
    { pattern: /liquid\s*koolbloom/i, line: 'Liquid KoolBloom' },
    { pattern: /dry\s*koolbloom|koolbloom.*dry/i, line: 'Dry KoolBloom' },
    { pattern: /maxi\s*(gro|bloom)/i, line: 'MaxiGro & MaxiBloom' },
    { pattern: /rapidstart|rapid\s*start/i, line: 'RapidStart' },
    { pattern: /floralicious/i, line: 'Floralicious Plus' },
    { pattern: /floranectar|flora\s*nectar/i, line: 'FloraNectar (Sugar/Pineapple/Fruit)' },
    { pattern: /biothrive/i, line: 'BioThrive (Grow & Bloom)' },
    { pattern: /ph\s*(up|down)/i, line: 'pH Up & pH Down' },
  ],
  'Advanced Nutrients': [
    { pattern: /sensi.*(grow|bloom)/i, line: 'pH Perfect Sensi (Grow/Bloom A&B)' },
    { pattern: /connoisseur/i, line: 'pH Perfect Connoisseur (Grow/Bloom A&B)' },
    { pattern: /big\s*bud/i, line: 'Big Bud' },
    { pattern: /b-?52/i, line: 'B-52' },
    { pattern: /bud\s*candy/i, line: 'Bud Candy' },
    { pattern: /overdrive/i, line: 'Overdrive' },
    { pattern: /bud\s*ignitor/i, line: 'Bud Ignitor' },
    { pattern: /voodoo/i, line: 'Voodoo Juice' },
    { pattern: /piranha/i, line: 'Piranha' },
    { pattern: /tarantula/i, line: 'Tarantula' },
    { pattern: /rhino\s*skin/i, line: 'Rhino Skin' },
    { pattern: /nirvana/i, line: 'Nirvana' },
    { pattern: /sensizym/i, line: 'Sensizym' },
    { pattern: /flawless\s*finish/i, line: 'Flawless Finish' },
  ],
  'Fox Farm': [
    { pattern: /grow\s*big/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
    { pattern: /big\s*bloom/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
    { pattern: /tiger\s*bloom/i, line: 'Trio (Grow Big, Big Bloom, Tiger Bloom)' },
    { pattern: /sledgehammer/i, line: 'Sledgehammer' },
    { pattern: /open\s*sesame/i, line: 'Open Sesame' },
    { pattern: /beastie/i, line: 'Beastie Bloomz' },
    { pattern: /cha\s*ching/i, line: 'Cha Ching' },
    { pattern: /kangaroots/i, line: 'Kangaroots' },
    { pattern: /microbe\s*brew/i, line: 'Microbe Brew' },
    { pattern: /dirty\s*dozen/i, line: 'Dirty Dozen Starter Kit' },
  ],
  'Botanicare': [
    { pattern: /pure\s*blend/i, line: 'Pure Blend Pro (Grow & Bloom)' },
    { pattern: /cns\s*17/i, line: 'CNS17 (Grow, Bloom, Ripe)' },
    { pattern: /cal-?mag/i, line: 'Cal-Mag Plus' },
    { pattern: /hydroplex/i, line: 'Hydroplex' },
    { pattern: /sweet\s*(raw|berry|citrus|grape)?/i, line: 'Sweet (Raw, Berry, Citrus, Grape)' },
    { pattern: /clearex/i, line: 'Clearex' },
    { pattern: /rhizo\s*blast/i, line: 'Rhizo Blast' },
    { pattern: /liquid\s*karma/i, line: 'Liquid Karma' },
    { pattern: /hydroguard/i, line: 'Hydroguard' },
    { pattern: /silica\s*blast/i, line: 'Silica Blast' },
  ],
  'Canna': [
    { pattern: /coco\s*(a|b)/i, line: 'Coco A&B' },
    { pattern: /terra/i, line: 'Terra Vega & Flores' },
    { pattern: /aqua/i, line: 'Aqua Vega/Flores A&B' },
    { pattern: /boost/i, line: 'Boost' },
    { pattern: /cannazym/i, line: 'Cannazym' },
    { pattern: /rhizotonic/i, line: 'Rhizotonic' },
    { pattern: /pk\s*13/i, line: 'PK 13/14' },
    { pattern: /bio\s*(vega|flores)/i, line: 'Bio Vega/Flores' },
  ],
  'House & Garden': [
    { pattern: /aqua\s*flakes/i, line: 'Aqua Flakes A&B' },
    { pattern: /roots\s*excelurator/i, line: 'Roots Excelurator Gold' },
    { pattern: /top\s*booster/i, line: 'Top Booster' },
    { pattern: /bud-?xl/i, line: 'Bud-XL' },
    { pattern: /shooting\s*powder/i, line: 'Shooting Powder' },
    { pattern: /multi\s*zen/i, line: 'Multi Zen' },
    { pattern: /drip\s*clean/i, line: 'Drip Clean' },
  ],
  'Athena': [
    { pattern: /pro\s*line|core/i, line: 'Pro Line Core' },
    { pattern: /grow\s*(a|b)/i, line: 'Grow A&B' },
    { pattern: /bloom\s*(a|b)/i, line: 'Bloom A&B' },
    { pattern: /balance/i, line: 'Balance' },
    { pattern: /cleanse/i, line: 'Cleanse' },
    { pattern: /ipm/i, line: 'IPM' },
    { pattern: /stack/i, line: 'Stack' },
  ],
  'Nectar for the Gods': [
    { pattern: /one\s*shot/i, line: 'One Shot Granules' },
    { pattern: /gaia\s*mania/i, line: 'Gaia Mania (Grow)' },
    { pattern: /medusa/i, line: 'Medusa\'s Magic (Grow)' },
    { pattern: /zeus/i, line: 'Zeus Juice (Nitrogen)' },
    { pattern: /athena.*amina/i, line: 'Athena\'s Aminas' },
    { pattern: /bloom\s*khaos/i, line: 'Bloom Khaos' },
    { pattern: /herculean/i, line: 'Herculean Harvest' },
    { pattern: /demeter/i, line: 'Demeter\'s Destiny' },
    { pattern: /kraken/i, line: 'The Kraken (Kelp)' },
    { pattern: /triton/i, line: 'Triton\'s Trawl (Fish)' },
    { pattern: /mega\s*morpheus|morpheus/i, line: 'Mega Morpheus (Bloom)' },
    { pattern: /roman\s*regime|starter\s*kit/i, line: 'Starter Kit (Roman Regime)' },
  ],
  'Roots Organics': [
    { pattern: /buddha\s*grow/i, line: 'Buddha Grow' },
    { pattern: /buddha\s*bloom/i, line: 'Buddha Bloom' },
    { pattern: /trinity|catalyst/i, line: 'Trinity (Catalyst)' },
    { pattern: /hpk|bat\s*guano/i, line: 'HPK (Bat Guano)' },
    { pattern: /soul\s*synth/i, line: 'Soul Synthetics (Grow & Bloom)' },
    { pattern: /terp\s*tea/i, line: 'Terp Tea (Grow & Bloom)' },
    { pattern: /elemental/i, line: 'Elemental' },
    { pattern: /ancient\s*amber/i, line: 'Ancient Amber' },
    { pattern: /original.*soil|potting\s*soil/i, line: 'Original Potting Soil' },
    { pattern: /greenfields/i, line: 'Greenfields Potting Mix' },
  ],
  'Earth Juice': [
    { pattern: /earth\s*juice.*grow/i, line: 'Grow' },
    { pattern: /earth\s*juice.*bloom/i, line: 'Bloom' },
    { pattern: /catalyst/i, line: 'Catalyst' },
    { pattern: /meta-?k/i, line: 'Meta-K' },
    { pattern: /microblast/i, line: 'Microblast' },
    { pattern: /sugar\s*peak/i, line: 'Sugar Peak (Grand/Vegetative/Transition/Flowering)' },
    { pattern: /oilycann/i, line: 'OilyCann' },
    { pattern: /seablast/i, line: 'SeaBlast (Grow & Bloom)' },
  ],
  'Technaflora': [
    { pattern: /bc\s*boost/i, line: 'BC Boost' },
    { pattern: /bc\s*grow/i, line: 'BC Grow' },
    { pattern: /bc\s*bloom/i, line: 'BC Bloom' },
    { pattern: /magical/i, line: 'MagiCal' },
    { pattern: /thrive\s*alive/i, line: 'Thrive Alive B-1 (Green & Red)' },
    { pattern: /sugar\s*daddy/i, line: 'Sugar Daddy' },
    { pattern: /awesome\s*blossoms/i, line: 'Awesome Blossoms' },
    { pattern: /root\s*66/i, line: 'Root 66' },
    { pattern: /recipe.*success|starter\s*kit/i, line: 'Recipe for Success Starter Kit' },
  ],
  'Dutch Master': [
    { pattern: /advance.*grow/i, line: 'Advance Grow A&B' },
    { pattern: /advance.*flower/i, line: 'Advance Flower A&B' },
    { pattern: /gold.*grow/i, line: 'Gold Range Grow A&B' },
    { pattern: /gold.*flower/i, line: 'Gold Range Flower A&B' },
    { pattern: /silica/i, line: 'Silica' },
    { pattern: /add\.?27|zone|saturator/i, line: 'Add.27 (Zone/Saturator)' },
    { pattern: /potash\s*plus/i, line: 'Potash Plus' },
    { pattern: /max\s*flower/i, line: 'Max Flower' },
  ],
  'Greenplanet': [
    { pattern: /dual\s*fuel/i, line: 'Dual Fuel (1&2)' },
    { pattern: /medi\s*one/i, line: 'Medi One' },
    { pattern: /massive/i, line: 'Massive Bloom Formulation' },
    { pattern: /gp3/i, line: 'GP3 (Grow, Micro, Bloom)' },
    { pattern: /vitathrive/i, line: 'Vitathrive' },
    { pattern: /ocean\s*magic/i, line: 'Ocean Magic' },
    { pattern: /pro\s*cal/i, line: 'Pro Cal' },
    { pattern: /rezin/i, line: 'Rezin' },
    { pattern: /finisher/i, line: 'Finisher' },
  ],
  'Remo Nutrients': [
    { pattern: /remo.*grow/i, line: 'Grow' },
    { pattern: /remo.*micro/i, line: 'Micro' },
    { pattern: /remo.*bloom/i, line: 'Bloom' },
    { pattern: /velokelp/i, line: 'VeloKelp' },
    { pattern: /magnifical/i, line: 'MagNifiCal' },
    { pattern: /nature.*candy/i, line: 'Nature\'s Candy' },
    { pattern: /astroflower/i, line: 'AstroFlower' },
    { pattern: /supercharged/i, line: 'SuperCharged Starter Kit' },
  ],
  'Heavy 16': [
    { pattern: /veg\s*(a|b)/i, line: 'Veg A&B' },
    { pattern: /bud\s*(a|b)/i, line: 'Bud A&B' },
    { pattern: /fire/i, line: 'Fire' },
    { pattern: /finish/i, line: 'Finish' },
    { pattern: /foliar/i, line: 'Foliar' },
    { pattern: /roots/i, line: 'Roots' },
    { pattern: /prime/i, line: 'Prime' },
  ],
  'Cultured Solutions': [
    { pattern: /veg\s*(a|b)/i, line: 'Veg A&B' },
    { pattern: /bloom\s*(a|b)/i, line: 'Bloom A&B' },
    { pattern: /uc\s*roots/i, line: 'UC Roots' },
    { pattern: /bud.*early/i, line: 'Bud Booster Early' },
    { pattern: /bud.*mid/i, line: 'Bud Booster Mid' },
    { pattern: /bud.*late/i, line: 'Bud Booster Late' },
    { pattern: /cal\s*mag\s*pro/i, line: 'Cal Mag Pro' },
  ],
  'Cutting Edge Solutions': [
    { pattern: /cutting.*grow/i, line: 'Grow (1-2-3 or Micro-Grow-Bloom)' },
    { pattern: /cutting.*micro/i, line: 'Micro' },
    { pattern: /cutting.*bloom/i, line: 'Bloom' },
    { pattern: /uncle\s*john/i, line: 'Uncle John\'s Blend' },
    { pattern: /plant\s*amp/i, line: 'Plant Amp' },
    { pattern: /sour-?dee/i, line: 'Sour-Dee' },
    { pattern: /sugaree/i, line: 'Sugaree' },
  ],
  'Mills Nutrients': [
    { pattern: /basis/i, line: 'Basis A&B' },
    { pattern: /c4/i, line: 'C4' },
    { pattern: /start/i, line: 'Start' },
    { pattern: /ultimate\s*pk/i, line: 'Ultimate PK' },
    { pattern: /vitalize/i, line: 'Vitalize' },
  ],
  'Emerald Harvest': [
    { pattern: /cali\s*pro/i, line: 'Cali Pro A&B' },
    { pattern: /king\s*kola/i, line: 'King Kola' },
    { pattern: /honey\s*chome/i, line: 'Honey Chome' },
    { pattern: /root\s*wizard/i, line: 'Root Wizard' },
    { pattern: /emerald\s*goddess/i, line: 'Emerald Goddess' },
    { pattern: /cal-?mag/i, line: 'Cal-Mag' },
    { pattern: /sturdy\s*stalk/i, line: 'Sturdy Stalk' },
  ],
};

// === CSV PARSING ===
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && (i === 0 || content[i-1] !== '\\')) inQuotes = !inQuotes;
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else if (char !== '\r') {
      currentLine += char;
    }
  }
  if (currentLine.trim()) lines.push(currentLine);
  
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx] || '');
    return row;
  });
  
  return { headers, rows };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

// === SIZE NORMALIZATION ===
function normalizeSize(text) {
  if (!text) return null;
  text = text.toLowerCase();
  
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*gal/i, fmt: (v) => v >= 2 ? `${v} Gallon` : `${v} Gallon` },
    { regex: /(\d+(?:\.\d+)?)\s*qt/i, fmt: (v) => 'Quart' },
    { regex: /(\d+(?:\.\d+)?)\s*pt/i, fmt: (v) => 'Pint' },
    { regex: /(\d+(?:\.\d+)?)\s*l(?:iter)?(?!\s*b)/i, fmt: (v) => `${v}L` },
    { regex: /(\d+(?:\.\d+)?)\s*ml/i, fmt: (v) => `${v}ml` },
    { regex: /(\d+(?:\.\d+)?)\s*oz/i, fmt: (v) => `${v} oz` },
    { regex: /(\d+(?:\.\d+)?)\s*lb/i, fmt: (v) => `${v} lb` },
    { regex: /(\d+(?:\.\d+)?)\s*kg/i, fmt: (v) => `${v} kg` },
    { regex: /(\d+(?:\.\d+)?)\s*g(?:ram)?(?!\s*al)/i, fmt: (v) => `${v}g` },
    { regex: /(\d+(?:\.\d+)?)\s*cu\s*ft/i, fmt: (v) => `${v} cu ft` },
  ];
  
  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m) {
      return p.fmt(parseFloat(m[1]));
    }
  }
  return null;
}

// === MATCH PRODUCT TO PRODUCT LINE ===
function matchProductLine(title, brand) {
  title = (title || '').toLowerCase();
  
  const rules = MATCH_RULES[brand];
  if (!rules) return null;
  
  for (const rule of rules) {
    if (rule.pattern.test(title)) {
      return rule.line;
    }
  }
  return null;
}

// === MAIN AUDIT FUNCTION ===
async function runExpandedAudit() {
  console.log('🔍 EXPANDED PRODUCT LINE SIZE AUDIT');
  console.log('=' .repeat(60));
  console.log(`📦 Brands in database: ${Object.keys(MANUFACTURER_SIZES).length}`);
  
  // Load inventory
  const shopifyPath = path.join(BASE_DIR, 'outputs', 'shopify_complete_import.csv');
  const wooPath = path.join(BASE_DIR, 'CSVs', 'WooExport', 'Products-Export-2025-Dec-31-180709.csv');
  
  let products = [];
  
  if (fs.existsSync(shopifyPath)) {
    const content = fs.readFileSync(shopifyPath, 'utf-8');
    const { rows } = parseCSV(content);
    products = rows;
    console.log(`📂 Loaded ${rows.length} rows from Shopify import`);
  } else if (fs.existsSync(wooPath)) {
    const content = fs.readFileSync(wooPath, 'utf-8');
    const { rows } = parseCSV(content);
    products = rows;
    console.log(`📂 Loaded ${rows.length} rows from WooCommerce export`);
  }
  
  // Build inventory index by brand+line
  const inventory = {};
  
  for (const product of products) {
    const title = product['Title'] || product['Name'] || '';
    const vendor = product['Vendor'] || '';
    
    // Try to match brand
    let matchedBrand = null;
    for (const brand of Object.keys(MANUFACTURER_SIZES)) {
      if (title.toLowerCase().includes(brand.toLowerCase()) ||
          vendor.toLowerCase().includes(brand.toLowerCase())) {
        matchedBrand = brand;
        break;
      }
    }
    
    if (!matchedBrand) continue;
    
    // Match to product line
    const line = matchProductLine(title, matchedBrand);
    if (!line) continue;
    
    const key = `${matchedBrand}|${line}`;
    if (!inventory[key]) {
      inventory[key] = { brand: matchedBrand, line, products: [], sizes: new Set() };
    }
    
    const size = normalizeSize(title);
    if (size) inventory[key].sizes.add(size);
    inventory[key].products.push({ title, size });
  }
  
  // Analyze gaps
  const results = [];
  const specialOrderCatalog = [];
  const distributorOrders = {};
  
  for (const [brand, lines] of Object.entries(MANUFACTURER_SIZES)) {
    for (const [lineName, lineInfo] of Object.entries(lines)) {
      const key = `${brand}|${lineName}`;
      const inv = inventory[key] || { sizes: new Set() };
      
      const allSizes = lineInfo.sizes;
      const haveSizes = Array.from(inv.sizes);
      const missingSizes = allSizes.filter(s => !haveSizes.includes(s));
      const coverage = haveSizes.length / allSizes.length;
      
      const result = {
        brand,
        line: lineName,
        type: lineInfo.type,
        note: lineInfo.note || '',
        priority: lineInfo.priority || 3,
        distributor: lineInfo.distributor,
        allSizes,
        haveSizes,
        missingSizes,
        coverage: Math.round(coverage * 100),
        status: coverage === 1 ? 'complete' : coverage > 0 ? 'partial' : 'not_stocked'
      };
      
      results.push(result);
      
      // Add to special order catalog (missing sizes)
      if (missingSizes.length > 0) {
        specialOrderCatalog.push({
          brand,
          productLine: lineName,
          type: lineInfo.type,
          availableSizes: missingSizes.join(', '),
          note: lineInfo.note || '',
          distributor: lineInfo.distributor
        });
      }
      
      // Build distributor order list (priority items)
      if (missingSizes.length > 0 && lineInfo.priority && lineInfo.priority <= 2) {
        const dist = lineInfo.distributor || 'Unknown';
        if (!distributorOrders[dist]) distributorOrders[dist] = [];
        distributorOrders[dist].push({
          brand,
          line: lineName,
          sizes: missingSizes,
          priority: lineInfo.priority,
          type: lineInfo.type
        });
      }
    }
  }
  
  // Output directory
  const outDir = path.join(BASE_DIR, 'outputs', 'product_lines');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  // === OUTPUT 1: Full Audit Results ===
  const auditPath = path.join(outDir, `expanded_audit_${timestamp}.json`);
  fs.writeFileSync(auditPath, JSON.stringify({
    generated: new Date().toISOString(),
    brandsAnalyzed: Object.keys(MANUFACTURER_SIZES).length,
    productLinesAnalyzed: results.length,
    summary: {
      complete: results.filter(r => r.status === 'complete').length,
      partial: results.filter(r => r.status === 'partial').length,
      notStocked: results.filter(r => r.status === 'not_stocked').length
    },
    results
  }, null, 2));
  
  // === OUTPUT 2: Special Order Catalog ===
  const catalogPath = path.join(outDir, `special_order_catalog_${timestamp}.csv`);
  let catalogCSV = 'Brand,Product Line,Type,Sizes Available for Special Order,Notes,Distributor\n';
  for (const item of specialOrderCatalog) {
    catalogCSV += `"${item.brand}","${item.productLine}","${item.type}","${item.availableSizes}","${item.note}","${item.distributor}"\n`;
  }
  fs.writeFileSync(catalogPath, catalogCSV);
  
  // === OUTPUT 3: Distributor Order List ===
  const orderPath = path.join(outDir, `distributor_orders_${timestamp}.json`);
  fs.writeFileSync(orderPath, JSON.stringify({
    generated: new Date().toISOString(),
    note: 'Priority 1-2 items to fill gaps in top sellers',
    orders: distributorOrders
  }, null, 2));
  
  // === OUTPUT 4: HTML Special Order Page Template ===
  const htmlPath = path.join(outDir, `special_order_page_${timestamp}.html`);
  const htmlContent = generateSpecialOrderHTML(specialOrderCatalog);
  fs.writeFileSync(htmlPath, htmlContent);
  
  // === CONSOLE SUMMARY ===
  console.log('\n📊 AUDIT SUMMARY');
  console.log('=' .repeat(60));
  console.log(`📦 Brands analyzed: ${Object.keys(MANUFACTURER_SIZES).length}`);
  console.log(`📋 Product lines analyzed: ${results.length}`);
  console.log(`✅ Complete coverage: ${results.filter(r => r.status === 'complete').length}`);
  console.log(`⚠️  Partial coverage: ${results.filter(r => r.status === 'partial').length}`);
  console.log(`❌ Not stocked: ${results.filter(r => r.status === 'not_stocked').length}`);
  
  console.log('\n🛍️ SPECIAL ORDER OPPORTUNITIES');
  console.log('-'.repeat(60));
  console.log(`📄 ${specialOrderCatalog.length} product lines with sizes available for special order`);
  
  console.log('\n📦 DISTRIBUTOR ORDER PRIORITIES');
  console.log('-'.repeat(60));
  for (const [dist, items] of Object.entries(distributorOrders)) {
    console.log(`\n${dist}:`);
    for (const item of items.slice(0, 5)) {
      console.log(`  • ${item.brand} ${item.line}: ${item.sizes.slice(0, 3).join(', ')}${item.sizes.length > 3 ? '...' : ''}`);
    }
    if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
  }
  
  console.log('\n📁 OUTPUT FILES');
  console.log('-'.repeat(60));
  console.log(`  📊 Audit: ${auditPath}`);
  console.log(`  📋 Catalog: ${catalogPath}`);
  console.log(`  📦 Orders: ${orderPath}`);
  console.log(`  🌐 HTML: ${htmlPath}`);
  
  return { results, specialOrderCatalog, distributorOrders };
}

// === GENERATE HTML SPECIAL ORDER PAGE ===
function generateSpecialOrderHTML(catalog) {
  // Group by brand
  const byBrand = {};
  for (const item of catalog) {
    if (!byBrand[item.brand]) byBrand[item.brand] = [];
    byBrand[item.brand].push(item);
  }
  
  let brandSections = '';
  for (const [brand, items] of Object.entries(byBrand)) {
    let rows = '';
    for (const item of items) {
      rows += `
        <tr>
          <td class="product-line">${item.productLine}</td>
          <td class="sizes">${item.availableSizes}</td>
          <td class="type">${item.type}</td>
          <td class="notes">${item.note}</td>
          <td class="action">
            <button class="request-btn" onclick="requestQuote('${brand}', '${item.productLine}')">
              Request Quote
            </button>
          </td>
        </tr>`;
    }
    
    brandSections += `
      <div class="brand-section">
        <h2 class="brand-name">${brand}</h2>
        <table class="product-table">
          <thead>
            <tr>
              <th>Product Line</th>
              <th>Available Sizes</th>
              <th>Type</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Special Order Catalog - H Moon Hydro</title>
  <style>
    :root {
      --primary: #2e7d32;
      --primary-dark: #1b5e20;
      --accent: #4caf50;
      --bg: #f5f5f5;
      --card-bg: #ffffff;
      --text: #333333;
      --text-light: #666666;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    
    .header {
      background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 1.1rem;
      opacity: 0.9;
    }
    
    .info-banner {
      background: #e8f5e9;
      border-left: 4px solid var(--primary);
      padding: 20px;
      margin: 20px;
      border-radius: 4px;
    }
    
    .info-banner h3 {
      color: var(--primary-dark);
      margin-bottom: 10px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .brand-section {
      background: var(--card-bg);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 30px;
      overflow: hidden;
    }
    
    .brand-name {
      background: var(--primary);
      color: white;
      padding: 15px 20px;
      font-size: 1.4rem;
    }
    
    .product-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .product-table th {
      background: #f0f0f0;
      padding: 12px 15px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
    }
    
    .product-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #eee;
    }
    
    .product-table tr:hover {
      background: #f9f9f9;
    }
    
    .product-line { font-weight: 500; }
    .sizes { color: var(--primary-dark); }
    .type { text-transform: capitalize; }
    .notes { color: var(--text-light); font-size: 0.9rem; }
    
    .request-btn {
      background: var(--primary);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    
    .request-btn:hover {
      background: var(--primary-dark);
    }
    
    .footer {
      text-align: center;
      padding: 30px;
      color: var(--text-light);
    }
    
    @media (max-width: 768px) {
      .product-table { font-size: 0.9rem; }
      .product-table th, .product-table td { padding: 8px; }
      .header h1 { font-size: 1.8rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🌱 Special Order Catalog</h1>
    <p>Can't find the size you need? We can order it for you!</p>
  </div>
  
  <div class="info-banner">
    <h3>📋 How Special Orders Work</h3>
    <p>
      <strong>Lead Time:</strong> Most items ship within 3-7 business days<br>
      <strong>Minimum Order:</strong> No minimum for most items<br>
      <strong>Pricing:</strong> Request a quote for current pricing<br>
      <strong>Bulk Discounts:</strong> Available on case quantities and commercial orders
    </p>
  </div>
  
  <div class="container">
    ${brandSections}
  </div>
  
  <div class="footer">
    <p>Questions? Contact us at <strong>orders@hmoonhydro.com</strong></p>
    <p>© ${new Date().getFullYear()} H Moon Hydro - Your Local Hydroponic Supply</p>
  </div>
  
  <script>
    function requestQuote(brand, product) {
      const subject = encodeURIComponent(\`Special Order Request: \${brand} \${product}\`);
      const body = encodeURIComponent(\`Hi,\\n\\nI would like to request a quote for:\\n\\nBrand: \${brand}\\nProduct: \${product}\\n\\nPlease let me know pricing and availability.\\n\\nThank you!\`);
      window.location.href = \`mailto:orders@hmoonhydro.com?subject=\${subject}&body=\${body}\`;
    }
  </script>
</body>
</html>`;
}

// Run the audit
runExpandedAudit().catch(console.error);
