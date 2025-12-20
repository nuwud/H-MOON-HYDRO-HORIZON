/**
 * Brand Registry - Centralized brand detection and validation
 * 
 * Uses HMoonHydro_Inventory.csv Manufacturer column as source of truth
 * Provides normalized brand detection across all product sources
 * 
 * UNO is a valid house brand (private label), similar to Kirkland
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Known Brands (populated from HMoonHydro_Inventory.csv + common brands)
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_BRANDS = new Set<string>([
  // From HMoonHydro_Inventory.csv Manufacturer column
  'NCW',
  'NGW', 
  'AN',
  'SYS',
  'Nickel City Wholesale Garden Supply',
  'UNO',          // ← VALID house brand (private label) - 33 products
  'Uno',
  'NUT',
  'Sunlight Supply inc.',
  'Sunlight Supply',
  'Advanced Nutrients',
  'New Millenium',
  'New Millennium',
  'Environment Control',
  'Phive8',
  'Hortilux',
  'himalaya',
  'Himalaya',
  
  // Common hydroponic brands (expanded list)
  'AC Infinity',
  'AC INFINITY',
  'General Hydroponics',
  'General Hydro',
  'Fox Farm',
  'FoxFarm',
  'Botanicare',
  'Hydrofarm',
  'Athena',
  'Canna',
  'CANNA',
  'Humboldt',
  'Humboldt Nutrients',
  'Humboldt Secret',
  'House & Garden',
  'House and Garden',
  'Cyco',
  'CYCO',
  'Mills',
  'Mammoth',
  'Mammoth P',
  'Great White',
  'Roots Organics',
  'Aurora',
  'Nectar for the Gods',
  'Nectar',
  'Cultured Biologix',
  'Heavy 16',
  'Emerald Harvest',
  'Dutch Nutrient',
  'Dyna-Gro',
  'DynaGro',
  'Floraflex',
  'FloraFlex',
  'GH',
  'NPK Industries',
  'RAW',
  'Technaflora',
  'Vegamatrix',
  'Cutting Edge',
  'Soul',
  'Bio Bizz',
  'BioBizz',
  'Remo',
  'Remo Nutrients',
  'Green Planet',
  'Grotek',
  
  // Lighting brands
  'Spider Farmer',
  'Mars Hydro',
  'Gavita',
  'Fluence',
  'Growers Choice',
  'Phantom',
  'Lumatek',
  'Nanolux',
  'Sun System',
  'Ushio',
  'Iluminar',
  'Dimlux',
  'HLG',
  'Optic LED',
  'California Lightworks',
  'Kind LED',
  'Medic Grow',
  'Photon Grow',
  
  // Ventilation/Environmental
  'Can-Fan',
  'Phresh',
  'Vortex',
  'Hurricane',
  'Hyperfan',
  'Active Air',
  'Cloudline',
  'Inkbird',
  'TrolMaster',
  'Titan Controls',
  'Autopilot',
  
  // Containers/Media
  'Gro Pro',
  'Grow Pro',
  'Root Spa',
  'Viagrow',
  'Smart Pot',
  'Fabric Pot',
  'GeoPot',
  'Mother Earth',
  'Coco Coir',
  'Black Gold',
  'Ocean Forest',
  'Happy Frog',
  'Royal Gold',
  'Promix',
  'Pro-Mix',
  'Grodan',
  
  // Misc brands
  'EZ Clone',
  'Turboklone',
  'Turbo Klone',
  'Super Sprouter',
  'Root Riot',
  'Rapid Rooter',
  'Rockwool',
  'Hydroton',
  'Jiffy',
  'Microbe Life',
  'Recharge',
  'Buildasoil',
  'True Living Organics',
  'Grower\'s Ally',
  'Lost Coast',
  'Trifecta',
  'Pyganic',
  'Monterey',
  'SNS',
  'Flying Skull',
  'Plant Therapy',
  'Regalia',
  
  // Additional ventilation/airflow brands
  'Max-Fan',
  'Max Fan',
  'MaxFan',
  'JetFan',
  'Jet Fan',
  'PROfilter',
  'PRO filter',
  'Can Filter',
  'Can-Filter',
  'Stealth RO',
  'Phresh Filter',
  
  // Water/Reservoir brands
  'WaterFarm',
  'Water Farm',
  'AeroFlo',
  'PowerGrower',
  'RainForest',
  'Hydro-Logic',
  'HydroLogic',
  'Ideal H2O',
  'Hydrodynamics',
  
  // Propagation/Cloning brands
  'Clonex',
  'CloneX',
  'Root Pouch',
  'RootPouch',
  'Clone King',
  'CloneKing',
  
  // CO2 brands
  'Titan Controls',
  'CO2Meter',
  'Sentinel',
  'Autopilot',
  'Hydro Innovations',
  
  // Growing systems
  'Viagrow',
  'Via Grow',
  'EcoPlus',
  'Eco Plus',
  'Sunleaves',
  'Sun Leaves',
  'SunGro',
  'Sun Gro',
  
  // Nutrient brands
  'Plagron',
  'PLAGRON',
  'Ionic',
  'BCuzz',
  'B\'Cuzz',
  'B Cuzz',
  'Atami',
  'Aptus',
  'Biocanna',
  'Bio-Canna',
  'Greenhouse Feeding',
  'GHE',
  'Terra Aquatica',
  
  // Lighting - HID brands
  'Solarmax',
  'SolarMax',
  'Plantmax',
  'PlantMax',
  'Hortilux',
  'Eye Hortilux',
  'Xtrasun',
  'Sunmaster',
  'Venture',
  'Philips',
  'GE',
  'Sylvania',
  'Osram',
  
  // Misc equipment
  'Dosatron',
  'Bluelab',
  'Blue Lab',
  'Milwaukee',
  'Apera',
  'Hanna',
  'Hanna Instruments',
  'Oakton',
  'Myron L',
  'H Moon Hydro',
  'H-Moon-Hydro',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Brand Aliases (normalize variations to canonical name)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND_ALIASES = new Map<string, string>([
  // UNO is valid - preserve it
  ['uno', 'UNO'],
  ['UNO', 'UNO'],
  ['Uno', 'UNO'],
  
  // AC Infinity variations
  ['ac infinity', 'AC Infinity'],
  ['acinfinity', 'AC Infinity'],
  ['cloudline', 'AC Infinity'],
  ['cloudlab', 'AC Infinity'],
  ['AC INFINITY', 'AC Infinity'],
  
  // General Hydroponics
  ['general hydroponics', 'General Hydroponics'],
  ['general hydro', 'General Hydroponics'],
  ['gh', 'General Hydroponics'],
  ['GH', 'General Hydroponics'],
  ['flora series', 'General Hydroponics'],
  
  // Fox Farm
  ['fox farm', 'Fox Farm'],
  ['foxfarm', 'Fox Farm'],
  ['fox farms', 'Fox Farm'],
  ['happy frog', 'Fox Farm'],
  ['ocean forest', 'Fox Farm'],
  ['big bloom', 'Fox Farm'],
  ['tiger bloom', 'Fox Farm'],
  ['grow big', 'Fox Farm'],
  
  // Advanced Nutrients
  ['advanced nutrients', 'Advanced Nutrients'],
  ['advanced', 'Advanced Nutrients'],
  ['AN', 'Advanced Nutrients'],
  ['sensi', 'Advanced Nutrients'],
  ['ph perfect', 'Advanced Nutrients'],
  ['big bud', 'Advanced Nutrients'],
  ['overdrive', 'Advanced Nutrients'],
  
  // Humboldt brands
  ['humboldt', 'Humboldt'],
  ['humboldt nutrients', 'Humboldt'],
  ['humboldt county', 'Humboldt'],
  ['humboldt secret', 'Humboldt Secret'],
  ['humboldts secret', 'Humboldt Secret'],
  
  // Athena
  ['athena', 'Athena'],
  ['athena pro', 'Athena'],
  ['athena blended', 'Athena'],
  
  // Canna
  ['canna', 'Canna'],
  ['CANNA', 'Canna'],
  ['cannazym', 'Canna'],
  ['pk 13/14', 'Canna'],
  
  // Botanicare
  ['botanicare', 'Botanicare'],
  ['pure blend', 'Botanicare'],
  ['cal-mag', 'Botanicare'],
  ['hydroguard', 'Botanicare'],
  
  // Mars Hydro
  ['mars hydro', 'Mars Hydro'],
  ['marshydro', 'Mars Hydro'],
  ['mars-hydro', 'Mars Hydro'],
  
  // Spider Farmer
  ['spider farmer', 'Spider Farmer'],
  ['spiderfarmer', 'Spider Farmer'],
  ['sf-', 'Spider Farmer'],
  
  // Hydrofarm
  ['hydrofarm', 'Hydrofarm'],
  ['active air', 'Hydrofarm'],
  ['autopilot', 'Hydrofarm'],
  
  // Gavita
  ['gavita', 'Gavita'],
  ['gavita pro', 'Gavita'],
  
  // Cyco
  ['cyco', 'Cyco'],
  ['CYCO', 'Cyco'],
  
  // House & Garden
  ['house & garden', 'House & Garden'],
  ['house and garden', 'House & Garden'],
  ['h&g', 'House & Garden'],
  
  // Roots Organics
  ['roots organics', 'Roots Organics'],
  ['roots organic', 'Roots Organics'],
  ['aurora innovations', 'Aurora'],
  
  // Inventory manufacturer codes
  ['NCW', 'Nickel City Wholesale'],
  ['NGW', 'NGW'],
  ['SYS', 'SYS'],
  ['NUT', 'NUT'],
  
  // Ventilation/Airflow
  ['max-fan', 'Max-Fan'],
  ['maxfan', 'Max-Fan'],
  ['max fan', 'Max-Fan'],
  ['jetfan', 'JetFan'],
  ['jet fan', 'JetFan'],
  ['profilter', 'PROfilter'],
  ['pro filter', 'PROfilter'],
  ['can-filter', 'Can-Filter'],
  ['can filter', 'Can-Filter'],
  ['phresh', 'Phresh Filter'],
  ['phresh filter', 'Phresh Filter'],
  
  // Water systems
  ['waterfarm', 'WaterFarm'],
  ['water farm', 'WaterFarm'],
  ['aeroflo', 'AeroFlo'],
  ['powergrower', 'PowerGrower'],
  ['rainforest', 'RainForest'],
  ['hydro-logic', 'Hydro-Logic'],
  ['hydrologic', 'Hydro-Logic'],
  ['ideal h2o', 'Ideal H2O'],
  
  // Propagation
  ['clonex', 'Clonex'],
  ['clone x', 'Clonex'],
  ['root pouch', 'Root Pouch'],
  ['rootpouch', 'Root Pouch'],
  ['clone king', 'Clone King'],
  ['cloneking', 'Clone King'],
  ['ez clone', 'EZ Clone'],
  ['ez-clone', 'EZ Clone'],
  ['ezclone', 'EZ Clone'],
  
  // Equipment brands
  ['ecoplus', 'EcoPlus'],
  ['eco plus', 'EcoPlus'],
  ['eco-plus', 'EcoPlus'],
  ['viagrow', 'Viagrow'],
  ['bluelab', 'Bluelab'],
  ['blue lab', 'Bluelab'],
  ['milwaukee', 'Milwaukee'],
  ['hanna', 'Hanna Instruments'],
  ['apera', 'Apera'],
  
  // Nutrient brands
  ['plagron', 'Plagron'],
  ['ionic', 'Ionic'],
  ['bcuzz', 'BCuzz'],
  ['b\'cuzz', 'BCuzz'],
  ['atami', 'Atami'],
  ['aptus', 'Aptus'],
  
  // Lighting
  ['solarmax', 'Solarmax'],
  ['solar max', 'Solarmax'],
  ['plantmax', 'Plantmax'],
  ['plant max', 'Plantmax'],
  ['hortilux', 'Hortilux'],
  ['eye hortilux', 'Hortilux'],
  ['xtrasun', 'Xtrasun'],
  ['sunmaster', 'Sunmaster'],
  
  // Store house brand
  ['h moon hydro', 'H Moon Hydro'],
  ['h-moon-hydro', 'H Moon Hydro'],
  ['hmoon hydro', 'H Moon Hydro'],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Brand Blocklist (patterns that are NOT brands)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND_BLOCKLIST = new RegExp([
  // NOTE: H Moon Hydro is a VALID house brand, NOT blocked
  // Store URL patterns only
  'my\\s*shopify',
  'myshopify\\.com',
  
  // Generic garbage
  'default\\s*vendor',
  'unknown\\s*vendor',
  'test\\s*vendor',
  'sample\\s*vendor',
  'vendor\\s*name',
  'brand\\s*name',
  'your\\s*brand',
  'company\\s*name',
  
  // Category words mistaken as brands
  '^led$',
  '^hps$',
  '^mh$',
  '^grow$',
  '^hydro$',
  '^organic$',
  '^nutrients?$',
  '^lighting?$',
  '^tent$',
  '^fan$',
  '^filter$',
  
  // Common non-brand product descriptors
  '^complete$',
  '^premium$',
  '^professional$',
  '^pro$',
  '^basic$',
  '^deluxe$',
  '^ultimate$',
  '^indoor$',
  '^outdoor$',
  '^commercial$',
  '^digital$',
  '^analog$',
].join('|'), 'i');

// ─────────────────────────────────────────────────────────────────────────────
// Brand Pattern Extraction (from product titles)
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  // Major brands with clear patterns
  { pattern: /\bAC\s*Infinity\b/i, brand: 'AC Infinity' },
  { pattern: /\bcloudline\b/i, brand: 'AC Infinity' },
  { pattern: /\bcloudlab\b/i, brand: 'AC Infinity' },
  { pattern: /\bGeneral\s*Hydro(?:ponics)?\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFlora\s*(?:Gro|Micro|Bloom)\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFox\s*Farm\b/i, brand: 'Fox Farm' },
  { pattern: /\bOcean\s*Forest\b/i, brand: 'Fox Farm' },
  { pattern: /\bHappy\s*Frog\b/i, brand: 'Fox Farm' },
  { pattern: /\bAdvanced\s*Nutrients?\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bHumboldt\b/i, brand: 'Humboldt' },
  { pattern: /\bAthena\b/i, brand: 'Athena' },
  { pattern: /\bCanna\b/i, brand: 'Canna' },
  { pattern: /\bBotanicare\b/i, brand: 'Botanicare' },
  { pattern: /\bHydrofarm\b/i, brand: 'Hydrofarm' },
  { pattern: /\bCyco\b/i, brand: 'Cyco' },
  { pattern: /\bMammoth\b/i, brand: 'Mammoth' },
  { pattern: /\bGreat\s*White\b/i, brand: 'Great White' },
  { pattern: /\bHouse\s*(?:&|and)\s*Garden\b/i, brand: 'House & Garden' },
  { pattern: /\bRoots\s*Organics?\b/i, brand: 'Roots Organics' },
  { pattern: /\bNectar\s*(?:for\s*the\s*Gods)?\b/i, brand: 'Nectar' },
  { pattern: /\bEmerald\s*Harvest\b/i, brand: 'Emerald Harvest' },
  { pattern: /\bFloraFlex\b/i, brand: 'FloraFlex' },
  { pattern: /\bSpider\s*Farmer\b/i, brand: 'Spider Farmer' },
  { pattern: /\bMars\s*Hydro\b/i, brand: 'Mars Hydro' },
  { pattern: /\bGavita\b/i, brand: 'Gavita' },
  { pattern: /\bPhresh\b/i, brand: 'Phresh' },
  { pattern: /\bCan-?Fan\b/i, brand: 'Can-Fan' },
  { pattern: /\bGro\s*Pro\b/i, brand: 'Gro Pro' },
  { pattern: /\bTrolMaster\b/i, brand: 'TrolMaster' },
  { pattern: /\bAutopilot\b/i, brand: 'Autopilot' },
  { pattern: /\bTitan\s*Controls?\b/i, brand: 'Titan Controls' },
  { pattern: /\bGrodan\b/i, brand: 'Grodan' },
  { pattern: /\bRockwool\b/i, brand: 'Grodan' },
  { pattern: /\bHydroton\b/i, brand: 'Hydroton' },
  { pattern: /\bMother\s*Earth\b/i, brand: 'Mother Earth' },
  { pattern: /\bRoyal\s*Gold\b/i, brand: 'Royal Gold' },
  { pattern: /\bPro-?Mix\b/i, brand: 'Promix' },
  { pattern: /\bBlack\s*Gold\b/i, brand: 'Black Gold' },
  { pattern: /\bDyna-?Gro\b/i, brand: 'Dyna-Gro' },
  { pattern: /\bRAW\b/, brand: 'RAW' },
  { pattern: /\bNPK\s*Industries\b/i, brand: 'NPK Industries' },
  { pattern: /\bUNO\b/, brand: 'UNO' },
  { pattern: /\bHortilux\b/i, brand: 'Hortilux' },
  { pattern: /\bLumatek\b/i, brand: 'Lumatek' },
  { pattern: /\bNanolux\b/i, brand: 'Nanolux' },
  { pattern: /\bSun\s*System\b/i, brand: 'Sun System' },
  { pattern: /\bEZ\s*Clone\b/i, brand: 'EZ Clone' },
  { pattern: /\bTurbo\s*Klone\b/i, brand: 'Turbo Klone' },
  { pattern: /\bSuper\s*Sprouter\b/i, brand: 'Super Sprouter' },
  
  // Ventilation/Airflow brands
  { pattern: /\bMax-?Fan\b/i, brand: 'Max-Fan' },
  { pattern: /\bJet\s*Fan\b/i, brand: 'JetFan' },
  { pattern: /\bPROfilter\b/i, brand: 'PROfilter' },
  { pattern: /\bCan-?Filter\b/i, brand: 'Can-Filter' },
  { pattern: /\bVortex\b/i, brand: 'Vortex' },
  { pattern: /\bHyperfan\b/i, brand: 'Hyperfan' },
  { pattern: /\bHurricane\b/i, brand: 'Hurricane' },
  { pattern: /\bActive\s*Air\b/i, brand: 'Active Air' },
  
  // Water/Reservoir brands
  { pattern: /\bWater\s*Farm\b/i, brand: 'WaterFarm' },
  { pattern: /\bAeroFlo\b/i, brand: 'AeroFlo' },
  { pattern: /\bPowerGrower\b/i, brand: 'PowerGrower' },
  { pattern: /\bRainForest\b/i, brand: 'RainForest' },
  { pattern: /\bHydro-?Logic\b/i, brand: 'Hydro-Logic' },
  { pattern: /\bIdeal\s*H2O\b/i, brand: 'Ideal H2O' },
  { pattern: /\bStealth\s*RO\b/i, brand: 'Stealth RO' },
  
  // Container brands
  { pattern: /\bRoot\s*Pouch\b/i, brand: 'Root Pouch' },
  { pattern: /\bSmart\s*Pot\b/i, brand: 'Smart Pot' },
  { pattern: /\bGeoPot\b/i, brand: 'GeoPot' },
  { pattern: /\bGro\s*Bags?\b/i, brand: 'Gro Pro' },
  { pattern: /\bViagrow\b/i, brand: 'Viagrow' },
  { pattern: /\bMondi\b/i, brand: 'Mondi' },
  { pattern: /\bCocoTek\b/i, brand: 'CocoTek' },
  
  // Propagation brands  
  { pattern: /\bClonex\b/i, brand: 'Clonex' },
  { pattern: /\bClone\s*King\b/i, brand: 'Clone King' },
  { pattern: /\bRoot\s*Riot\b/i, brand: 'Root Riot' },
  { pattern: /\bRapid\s*Rooter\b/i, brand: 'Rapid Rooter' },
  { pattern: /\bJiffy\b/i, brand: 'Jiffy' },
  
  // Odor control
  { pattern: /\bONA\b/, brand: 'ONA' },
  { pattern: /\bPure\s*Filter\b/i, brand: 'Pure Filter' },
  
  // Nutrient brands
  { pattern: /\bPlagron\b/i, brand: 'Plagron' },
  { pattern: /\bIonic\b/i, brand: 'Ionic' },
  { pattern: /\bB'?Cuzz\b/i, brand: 'BCuzz' },
  { pattern: /\bAtami\b/i, brand: 'Atami' },
  { pattern: /\bAptus\b/i, brand: 'Aptus' },
  { pattern: /\bRemo\b/i, brand: 'Remo' },
  { pattern: /\bMills\b/i, brand: 'Mills' },
  { pattern: /\bHeavy\s*16\b/i, brand: 'Heavy 16' },
  { pattern: /\bGreen\s*Planet\b/i, brand: 'Green Planet' },
  { pattern: /\bGrotek\b/i, brand: 'Grotek' },
  { pattern: /\bTechnaflora\b/i, brand: 'Technaflora' },
  { pattern: /\bCutting\s*Edge\b/i, brand: 'Cutting Edge' },
  { pattern: /\bBio\s*Bizz\b/i, brand: 'BioBizz' },
  
  // Additional nutrient brand patterns
  { pattern: /\bTerpinator\b/i, brand: 'Terpinator' },
  { pattern: /\bSpray\s*N\s*Grow\b/i, brand: 'Spray N Grow' },
  { pattern: /\bSensizym\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bBig\s*Bud\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bOverdrive\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bSledge\s*Hammer\b/i, brand: 'Fox Farm' },
  { pattern: /\bSilica\s*Blast\b/i, brand: 'Botanicare' },
  { pattern: /\bHolland\s*Secret\b/i, brand: 'Holland Secret' },
  { pattern: /\bBioThrive\b/i, brand: 'General Hydroponics' },
  { pattern: /\bMedusa'?s?\s*Magic\b/i, brand: 'Medusa' },
  { pattern: /\bHerculean\s*Harvest\b/i, brand: 'Nectar' },
  { pattern: /\bSilicium\b/i, brand: 'Silicium' },
  { pattern: /\bScietetics\b/i, brand: 'Scietetics' },
  { pattern: /\bVerde\b/i, brand: 'Verde' },
  { pattern: /\bVitamino\b/i, brand: 'Vitamino' },
  { pattern: /\bSuck\s*it\s*Up\b/i, brand: 'Suck it Up' },
  { pattern: /\bTon\s*O\s*Bud\b/i, brand: 'Ton-O-Bud' },
  { pattern: /\bMaxi\s*Series\b/i, brand: 'General Hydroponics' },
  { pattern: /\bBloom\s*Khaos\b/i, brand: 'Bloom Khaos' },
  
  // More GH product lines
  { pattern: /\bFloraDuo\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFloraNectar\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFlora\s*Series\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFloraKleen\b/i, brand: 'General Hydroponics' },
  { pattern: /\bFloraBlend\b/i, brand: 'General Hydroponics' },
  { pattern: /\bRapid\s*Start\b/i, brand: 'General Hydroponics' },
  { pattern: /\bCALiMAGic\b/i, brand: 'General Hydroponics' },
  { pattern: /\bKoolBloom\b/i, brand: 'General Hydroponics' },
  { pattern: /\bLiquid\s*Kool\s*Bloom\b/i, brand: 'General Hydroponics' },
  { pattern: /\bDry\s*Kool\s*Bloom\b/i, brand: 'General Hydroponics' },
  { pattern: /\bArmor\s*Si\b/i, brand: 'General Hydroponics' },
  { pattern: /\bDiamond\s*Nectar\b/i, brand: 'General Hydroponics' },
  
  // General Organics / Aurora products
  { pattern: /\bBioWeed\b/i, brand: 'General Organics' },
  { pattern: /\bBioBud\b/i, brand: 'General Organics' },
  { pattern: /\bBioMarine\b/i, brand: 'General Organics' },
  { pattern: /\bBioRoot\b/i, brand: 'General Organics' },
  { pattern: /\bGeneral\s*Organics?\b/i, brand: 'General Organics' },
  { pattern: /\bCaMg\+\b/i, brand: 'General Organics' },
  
  // Mycorrhizae brands
  { pattern: /\bMykos\b/i, brand: 'Xtreme Gardening' },
  { pattern: /\bAzos\b/i, brand: 'Xtreme Gardening' },
  { pattern: /\bXtreme\s*Gardening\b/i, brand: 'Xtreme Gardening' },
  { pattern: /\bMyco\s*Madness\b/i, brand: 'Myco Madness' },
  { pattern: /\bGreat\s*White\b/i, brand: 'Great White' },
  
  // Nectar for the Gods products
  { pattern: /\bHygeia'?s?\b/i, brand: 'Nectar' },
  { pattern: /\bPoseidon'?s?\s*zyme\b/i, brand: 'Nectar' },
  { pattern: /\bTritan'?s?\s*Trawl\b/i, brand: 'Nectar' },
  { pattern: /\bMedusa\b/i, brand: 'Nectar' },
  { pattern: /\bMayan\s*Microzyme\b/i, brand: 'Nectar' },
  { pattern: /\bOlympus\s*Up\b/i, brand: 'Nectar' },
  { pattern: /\bGaia\s*Mania\b/i, brand: 'Nectar' },
  { pattern: /\bDemeters?\s*Destiny\b/i, brand: 'Nectar' },
  { pattern: /\bBloom\s*Khaos\b/i, brand: 'Nectar' },
  { pattern: /\bAphrodite'?s?\b/i, brand: 'Nectar' },
  { pattern: /\bHades\s*Down\b/i, brand: 'Nectar' },
  { pattern: /\bZeus\s*Juice\b/i, brand: 'Nectar' },
  
  // Advanced Nutrients product lines
  { pattern: /\bNirvana\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bCarboLoad\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bVoodoo\s*Juice\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bPiranha\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bTarantula\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bBud\s*Candy\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bBud\s*Ignitor\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bBud\s*Factor\s*X\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bRhino\s*Skin\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bConnoisseur\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bSensi\b/i, brand: 'Advanced Nutrients' },
  { pattern: /\bpH\s*Perfect\b/i, brand: 'Advanced Nutrients' },
  
  // Plagron products
  { pattern: /\bGreen\s*Sensation\b/i, brand: 'Plagron' },
  { pattern: /\bPower\s*Roots\b/i, brand: 'Plagron' },
  { pattern: /\bSugar\s*Royal\b/i, brand: 'Plagron' },
  
  // Humboldt products
  { pattern: /\bRuby\s*Ful\b/i, brand: 'Humboldt' },
  { pattern: /\bDiamond\s*Black\b/i, brand: 'Humboldt' },
  { pattern: /\bEquinox\b/i, brand: 'Humboldt' },
  { pattern: /\bAurora\s*Soul\b/i, brand: 'Humboldt' },
  { pattern: /\bHydro-?Deuce\b/i, brand: 'Humboldt' },
  { pattern: /\bCrystal\s*Burst\b/i, brand: 'Humboldt' },
  { pattern: /\bHumboldt'?s?\s*Secret\b/i, brand: 'Humboldt Secret' },
  { pattern: /\bHumboldt'?s?\s*Own\b/i, brand: 'Humboldt' },
  
  // Seasonal nutrients (likely house brand)
  { pattern: /\b(Spring|Summer|Autumn|Winter)\s*(Frost|Quart|Gallon|2\.5)?\b/i, brand: 'H Moon Hydro' },
  { pattern: /\bLightning\s*Start\b/i, brand: 'H Moon Hydro' },
  { pattern: /\bFlavor-?Ful\b/i, brand: 'H Moon Hydro' },
  { pattern: /\bDecision\b/i, brand: 'H Moon Hydro' },
  
  // More Nectar for the Gods
  { pattern: /\bPegasus\s*Potion\b/i, brand: 'Nectar' },
  { pattern: /\bDemeter'?s?\s*Destiny\b/i, brand: 'Nectar' },
  
  // Hygrozyme
  { pattern: /\bHYGROZYME\b/i, brand: 'Hygrozyme' },
  { pattern: /\bHygrozyme\b/i, brand: 'Hygrozyme' },
  
  // Can-Fan products
  { pattern: /\bCan-?Duct\b/i, brand: 'Can-Fan' },
  
  // Earth Juice / Natural products
  { pattern: /\bBloom\s*Natural\b/i, brand: 'Earth Juice' },
  { pattern: /\bGrow\s*Natural\b/i, brand: 'Earth Juice' },
  { pattern: /\bEarth\s*Juice\b/i, brand: 'Earth Juice' },
  { pattern: /\bSugar\s*Peak\b/i, brand: 'Earth Juice' },
  { pattern: /\bCatalyst\b/i, brand: 'Earth Juice' },
  { pattern: /\bMeta-?K\b/i, brand: 'Earth Juice' },
  { pattern: /\bMicroBlast\b/i, brand: 'Earth Juice' },
  
  // Carbo products
  { pattern: /\bCarbo\s*Blast\b/i, brand: 'Carbo Blast' },
  { pattern: /\bLiquid\s*Carbo\b/i, brand: 'Carbo Blast' },
  
  // Prop-O-Gator
  { pattern: /\bProp-?O-?Gator\b/i, brand: 'Prop-O-Gator' },
  
  // Bud Start / Quick Roots
  { pattern: /\bBud\s*Start\b/i, brand: 'Bud Start' },
  { pattern: /\bQuick\s*Roots\b/i, brand: 'Quick Roots' },
  
  // Better Bloom
  { pattern: /\bBetter\s*Bloom\b/i, brand: 'Better Bloom' },
  
  // Ton-O-Bud
  { pattern: /\bTon-?O-?Bud\b/i, brand: 'Ton-O-Bud' },
  
  // Yield Up
  { pattern: /\bYield\s*Up\b/i, brand: 'Yield Up' },
  
  // CalCarb / Calnesium
  { pattern: /\bCalCarb\b/i, brand: 'CalCarb' },
  { pattern: /\bCalnesium\b/i, brand: 'Calnesium' },
  
  // Double Super B+
  { pattern: /\bDouble\s*Super\s*B\+?\b/i, brand: 'Double Super B+' },
  
  // SunSoaker
  { pattern: /\bSunSoaker\b/i, brand: 'SunSoaker' },
  
  // Jacto sprayers
  { pattern: /\bJacto\b/i, brand: 'Jacto' },
  
  // HID/Lighting brands
  { pattern: /\bSolarmax\b/i, brand: 'Solarmax' },
  { pattern: /\bPlantmax\b/i, brand: 'Plantmax' },
  { pattern: /\bXtrasun\b/i, brand: 'Xtrasun' },
  { pattern: /\bSunmaster\b/i, brand: 'Sunmaster' },
  { pattern: /\bPhantom\b/i, brand: 'Phantom' },
  { pattern: /\bIluminar\b/i, brand: 'Iluminar' },
  { pattern: /\bDimlux\b/i, brand: 'Dimlux' },
  { pattern: /\bHLG\b/, brand: 'HLG' },
  { pattern: /\bOptic\s*LED\b/i, brand: 'Optic LED' },
  { pattern: /\bKind\s*LED\b/i, brand: 'Kind LED' },
  { pattern: /\bFluence\b/i, brand: 'Fluence' },
  { pattern: /\bGrowers?\s*Choice\b/i, brand: 'Growers Choice' },
  
  // Measurement brands
  { pattern: /\bBluelab\b/i, brand: 'Bluelab' },
  { pattern: /\bMilwaukee\b/i, brand: 'Milwaukee' },
  { pattern: /\bApera\b/i, brand: 'Apera' },
  { pattern: /\bHanna\b/i, brand: 'Hanna Instruments' },
  { pattern: /\bOakton\b/i, brand: 'Oakton' },
  { pattern: /\bNutradip\b/i, brand: 'Nutradip' },
  
  // CO2/Controllers
  { pattern: /\bSentinel\b/i, brand: 'Sentinel' },
  { pattern: /\bInkbird\b/i, brand: 'Inkbird' },
  { pattern: /\bDosatron\b/i, brand: 'Dosatron' },
  
  // Equipment brands
  { pattern: /\bEcoPlus\b/i, brand: 'EcoPlus' },
  { pattern: /\bSunleaves\b/i, brand: 'Sunleaves' },
  
  // Additional lighting brands
  { pattern: /\bSunBlaster\b/i, brand: 'SunBlaster' },
  { pattern: /\bBADBOY\b/i, brand: 'BADBOY' },
  { pattern: /\bReVolt\b/i, brand: 'ReVolt' },
  { pattern: /\bLEC\b/, brand: 'LEC' },
  { pattern: /\bGREENPOWER/i, brand: 'GreenPower' },
  { pattern: /\bPanda\b/i, brand: 'Panda' },
  { pattern: /\bAgrolite\b/i, brand: 'Agrolite' },
  { pattern: /\bNanotech\b/i, brand: 'SunBlaster' },
  { pattern: /\bUshio\b/i, brand: 'Ushio' },
  { pattern: /\bVenture\b/i, brand: 'Venture' },
  { pattern: /\bPhilips\b/i, brand: 'Philips' },
  { pattern: /\bSylvania\b/i, brand: 'Sylvania' },
  { pattern: /\bOsram\b/i, brand: 'Osram' },
  { pattern: /\bCool\s*Tube\b/i, brand: 'Cool Tube' },
  
  // Can-lite separate from Can-Filter  
  { pattern: /\bCan-?lite\b/i, brand: 'Can-lite' },
  
  // Additional container brands
  { pattern: /\bF\.?H\.?D\.?\b/i, brand: 'FHD' },
  
  // Store house brand
  { pattern: /\bH[\s-]*Moon[\s-]*Hydro\b/i, brand: 'H Moon Hydro' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Initialization - Load manufacturers from inventory
// ─────────────────────────────────────────────────────────────────────────────

let inventoryManufacturers: Map<string, string> = new Map();
let initialized = false;

/**
 * Initialize the brand registry by loading inventory CSV
 * Called lazily on first brand detection or explicitly
 */
export function initBrandRegistry(): void {
  if (initialized) return;
  
  const inventoryPath = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  
  if (!existsSync(inventoryPath)) {
    console.warn('⚠️  HMoonHydro_Inventory.csv not found, brand detection may be limited');
    initialized = true;
    return;
  }
  
  try {
    const content = readFileSync(inventoryPath, 'utf-8');
    const lines = content.split('\n');
    
    if (lines.length < 2) {
      initialized = true;
      return;
    }
    
    // Parse header
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
    const mfgIdx = headers.findIndex(h => h === 'manufacturer' || h === 'mfg' || h === 'brand');
    const skuIdx = headers.findIndex(h => h === 'sku' || h === 'item' || h === 'product');
    const titleIdx = headers.findIndex(h => h === 'title' || h === 'name' || h === 'description');
    
    if (mfgIdx === -1) {
      console.warn('⚠️  No Manufacturer column found in inventory CSV');
      initialized = true;
      return;
    }
    
    // Build SKU -> Manufacturer map
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = parseCsvLine(line);
      const manufacturer = values[mfgIdx]?.trim();
      const sku = values[skuIdx]?.trim();
      const title = values[titleIdx]?.trim();
      
      if (manufacturer && sku) {
        inventoryManufacturers.set(sku.toLowerCase(), manufacturer);
      }
      if (manufacturer && title) {
        // Also index by title (normalized)
        const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
        inventoryManufacturers.set(`title:${titleKey}`, manufacturer);
      }
      
      // Add to known brands if valid
      if (manufacturer && isValidBrand(manufacturer)) {
        KNOWN_BRANDS.add(manufacturer);
      }
    }
    
    console.log(`📋 Brand registry loaded: ${inventoryManufacturers.size} SKU mappings, ${KNOWN_BRANDS.size} known brands`);
    
  } catch (err) {
    console.error('Error loading inventory for brand registry:', err);
  }
  
  initialized = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing Helper
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate if a string is a legitimate brand name
 */
export function isValidBrand(name: string | undefined | null): boolean {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Empty or too short
  if (trimmed.length < 2) return false;
  
  // Too long to be a brand (probably a sentence)
  if (trimmed.length > 50) return false;
  
  // Check blocklist
  if (BRAND_BLOCKLIST.test(trimmed)) return false;
  
  // Contains JSON-like characters
  if (/[\[\]{}]/.test(trimmed)) return false;
  
  // More than 4 words is suspicious
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  
  // Looks like a sentence
  if (/^(the|a|an|this|that)\s/i.test(trimmed)) return false;
  
  // Contains obvious garbage
  if (/undefined|null|nan|true|false|object/i.test(trimmed)) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Detection - Priority Chain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect brand using priority chain:
 * 1. Title pattern matching (most reliable)
 * 2. Manufacturer from inventory (source of truth)
 * 3. Vendor field (Shopify)
 * 4. WooCommerce brand field
 * 5. "Unknown" fallback
 */
export function detectBrand(
  title: string,
  manufacturer?: string,
  vendor?: string,
  wooBrand?: string
): string {
  // Ensure registry is initialized
  if (!initialized) {
    initBrandRegistry();
  }
  
  // 1. Check title patterns first (most reliable)
  for (const { pattern, brand } of TITLE_BRAND_PATTERNS) {
    if (pattern.test(title)) {
      return brand;
    }
  }
  
  // 2. Check inventory manufacturer (source of truth)
  if (manufacturer && isValidBrand(manufacturer)) {
    const normalized = BRAND_ALIASES.get(manufacturer.toLowerCase()) || manufacturer;
    if (isValidBrand(normalized)) {
      return normalized;
    }
  }
  
  // 3. Check vendor (Shopify)
  if (vendor && isValidBrand(vendor)) {
    const normalized = BRAND_ALIASES.get(vendor.toLowerCase()) || vendor;
    if (isValidBrand(normalized)) {
      return normalized;
    }
  }
  
  // 4. Check WooCommerce brand field
  if (wooBrand && isValidBrand(wooBrand)) {
    const normalized = BRAND_ALIASES.get(wooBrand.toLowerCase()) || wooBrand;
    if (isValidBrand(normalized)) {
      return normalized;
    }
  }
  
  // 5. Fallback
  return 'Unknown';
}

/**
 * Alias for detectBrand with normalized output (uppercase first letter)
 */
export function detectBrandNormalized(
  title: string,
  manufacturer?: string,
  vendor?: string,
  wooBrand?: string
): string {
  const brand = detectBrand(title, manufacturer, vendor, wooBrand);
  
  // Already properly cased from KNOWN_BRANDS or patterns
  if (brand !== 'Unknown' && KNOWN_BRANDS.has(brand)) {
    return brand;
  }
  
  // Normalize casing for unknown/unlisted brands
  if (brand && brand !== 'Unknown') {
    return brand.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  return brand;
}

/**
 * Look up brand by SKU from inventory
 */
export function getBrandBySku(sku: string): string | undefined {
  if (!initialized) {
    initBrandRegistry();
  }
  
  const manufacturer = inventoryManufacturers.get(sku.toLowerCase());
  if (manufacturer && isValidBrand(manufacturer)) {
    return BRAND_ALIASES.get(manufacturer.toLowerCase()) || manufacturer;
  }
  
  return undefined;
}

/**
 * Get all known brands as array
 */
export function getKnownBrands(): string[] {
  return Array.from(KNOWN_BRANDS).sort();
}
