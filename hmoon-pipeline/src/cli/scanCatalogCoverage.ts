/**
 * Catalog Coverage Scanner
 * 
 * Scans all product sources and reports:
 * - Products captured by existing category masters
 * - Uncategorized products with keyword clustering
 * - Recommendations for next category to build
 * - Category conflicts (products matching multiple categories)
 * 
 * Outputs:
 * - CSVs/coverage_report.json
 * - CSVs/uncategorized_candidates.csv
 * - CSVs/category_conflicts.csv
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readCsvSafe, getColumn, CsvRow } from '../utils/csvSafeRead.js';
import { detectBrandNormalized, isValidBrand } from '../utils/brandRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Category Detection Patterns (copied from individual builders)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Record<string, { include: RegExp[]; exclude: RegExp[] }> = {
  airflow: {
    include: [
      /inline\s*fan/i,
      /exhaust\s*fan/i,
      /\bblower\b/i,
      /carbon\s*filter/i,
      /charcoal\s*filter/i,
      /\bcfm\b/i,
      /ac\s*infinity.*(?:cloudline|fan)/i,
      /can-?fan/i,
      /max\s*fan/i,
      /phresh\s*filter/i,
      /air\s*scrubber/i,
      /oscillating\s*fan/i,
      /clip\s*fan/i,
      /grow\s*tent\s*fan/i,
      /wall\s*mount.*fan/i,
    ],
    exclude: [
      /duct|clamp|fitting|damper|flange|reducer|connector|tape|hose/i,
      /timer|controller|thermostat/i,
      /nutrient|fertilizer|grow\s*medium|soil|coco/i,
    ],
  },
  
  lights: {
    include: [
      /grow\s*light/i,
      /led\s*light/i,
      /\bbar\s*light/i,
      /quantum\s*board/i,
      /\bhps\b/i,
      /\bmh\b.*grow/i,
      /\bcmh\b/i,
      /\blec\b/i,
      /spider\s*farmer/i,
      /mars\s*hydro/i,
      /gavita/i,
      /grower'?s?\s*choice/i,
      /\bppfd\b/i,
      /\bpar\b.*(?:light|output|map)/i,
      /full\s*spectrum/i,
      /flower\s*(?:stage|phase)/i,
      /veg\s*(?:stage|phase)/i,
      // Additional LED brands
      /dutch\s*lighting\s*innovations/i,
      /diode.*series.*led/i,
      /multilayer.*led/i,
      /fluence/i,
      /hlg\b/i,
      /horticulture\s*lighting/i,
      /optic\s*led/i,
      /medic\s*grow/i,
      /california\s*lightworks/i,
      /kind\s*led/i,
    ],
    exclude: [
      /controller|timer/i,
      /nutrient|fertilizer/i,
      /tent|fan|filter/i,
    ],
  },
  
  tents: {
    include: [
      /grow\s*tent/i,
      /grow\s*room/i,
      /mylar\s*tent/i,
      /indoor\s*grow.*(?:tent|room)/i,
      /\d+x\d+x\d+.*(?:tent|grow)/i,
      /gorilla\s*grow/i,
    ],
    exclude: [
      /clip\s*fan/i,
      /tent\s*fan/i,
      /oscillating/i,
      /for\s*(?:grow\s*)?tent/i,
      /inside\s*(?:grow\s*)?tent/i,
      /pole|clip|hanger|trellis|net|rope/i,
    ],
  },
  
  vent_accessories: {
    include: [
      /\bduct\b/i,
      /\bducting\b/i,
      /\bclamp\b/i,
      /\bflange\b/i,
      /\bdamper\b/i,
      /\breducer\b/i,
      /duct\s*(?:tape|connector|fitting)/i,
      /flex\s*duct/i,
      /aluminum\s*duct/i,
      /insulated\s*duct/i,
      /silencer/i,
      /air\s*stone/i,
    ],
    exclude: [
      /inline\s*fan|exhaust\s*fan|carbon\s*filter/i,
      /nutrient|fertilizer/i,
      /controller|timer/i,
    ],
  },
  
  grow_media: {
    include: [
      /\bcoco\b/i,
      /\bcoir\b/i,
      /\bsoil\b/i,
      /potting\s*mix/i,
      /\bperlite\b/i,
      /\bvermiculite\b/i,
      /rockwool/i,
      /hydroton/i,
      /clay\s*pebbles/i,
      /\bleca\b/i,
      /grow\s*(?:medium|media|cubes)/i,
      /root\s*(?:riot|plugs)/i,
      /rapid\s*rooter/i,
      /starter\s*(?:plugs|cubes)/i,
      /seed\s*starting\s*mix/i,
      /grodan/i,
      /pro-?mix/i,
      /sunshine\s*mix/i,
      /happy\s*frog\s*soil/i,
      /ocean\s*forest/i,
      /mother\s*earth/i,
      /bio365/i,
      /bioflower/i,
      /coarse\s*perlite/i,
      /fine\s*coir/i,
    ],
    exclude: [
      /nutrient|fertilizer|additive|supplement/i,
      /controller|timer|fan|filter|light/i,
    ],
  },
  
  nutrients: {
    include: [
      /\bnutrient/i,
      /\bfertilizer/i,
      /flora\s*(?:gro|grow|bloom|micro)/i,
      /cal-?mag/i,
      /\bsilica\b/i,
      /\bsilicium\b/i,
      /mono-?silicic/i,
      /ph\s*(?:up|down|adjust)/i,
      /bloom\s*boost/i,
      /bud\s*boost/i,
      /root\s*boost/i,
      /\bbooster\b/i,
      /\badditive\b/i,
      /\bsupplement\b/i,
      // Major nutrient brands (key scanner coverage)
      /general\s*hydroponics/i,
      /advanced\s*nutrients/i,
      /fox\s*farm/i,
      /botanicare/i,
      /humboldt/i,
      /athena/i,
      /sensi/i,
      /cuzz/i,
      /emerald\s*harvest/i,
      /roots\s*organics/i,
      /cyco/i,
      /plagron/i,
      /canna\b/i,
      /house\s*&?\s*garden/i,
      /biobizz/i,
      /mills/i,
      /h&g/i,
      /aptus/i,
      /cutting\s*edge/i,
      /heavy\s*16/i,
      /nectar.*gods/i,
      /mammoth.*p/i,
      /cultured\s*biologix/i,
      /great\s*white/i,
      /recharge/i,
      /hygrozyme/i,
      /cannazym/i,
      /sensizym/i,
      /mycorrhizae/i,
      /mycorrhizal/i,
      /\bmykos\b/i,
      /\bmyco\s*(?:maximum|madness)/i,
      /\binoculant\b/i,
      /microbe/i,
      /orca/i,
      /urb/i,
      /tribus/i,
      /soul\s*synthetics/i,
      /liquid\s*karma/i,
      /dyna-?gro/i,
      /raw.*nutrients/i,
      /green\s*planet/i,
      /hydro\s*dynamics/i,
      /technaflora/i,
      /vermicrop/i,
      /aurora\s*innovations/i,
      /npk.*industries/i,
      /earth\s*juice/i,
      /age\s*old/i,
      /dr\.\s*earth/i,
      /down\s*to\s*earth/i,
      /rare\s*earth/i,
      /voodoo\s*juice/i,
      /big\s*bud/i,
      /maxigro|maxibloom/i,
      // Earth Juice specific products
      /tritan'?s?\s*trawl/i,
      /oilycann/i,
      /meta-?k/i,
      /catalyst/i,
      /grow\s*big/i,
      /big\s*bloom/i,
      /tiger\s*bloom/i,
      /cha\s*ching/i,
      /open\s*sesame/i,
      // Down To Earth specific products
      /bat\s*guano/i,
      /bone\s*meal/i,
      /blood\s*meal/i,
      /kelp\s*meal/i,
      /fish\s*meal/i,
      /feather\s*meal/i,
      /vegan\s*mix/i,
      /alfalfa\s*meal/i,
      /oyster\s*shell/i,
      /beastie\s*bloomz/i,
      // Gallon/quart products without number prefix (likely nutrients)
      /(?:^|\s)gallon(?:\s|$)/i,
      /(?:^|\s)quart(?:\s|$)/i,
      /kool\s*bloom/i,
      // Advanced Nutrients product line
      /tarantula/i,
      /piranha/i,
      /b-?52/i,
      /rhino\s*skin/i,
      /sensizym/i,
      /nirvana/i,
      /carboload/i,
      /bud\s*factor/i,
      /iguana\s*juice/i,
      // Common nutrient product names
      /yield.*up|winter.*frost|spring.*gallon/i,
      /subculture/i,
      /suck.*it.*up/i,
      /the\s*hammer/i,
      /xtreme\s*tea/i,
      /tea\s*brew/i,
      /beneficial.*bacteria/i,
      /beneficial.*fungi/i,
      /enzyme/i,
      /compost\s*tea/i,
      /kelp|seaweed/i,
      /humic|fulvic/i,
      /carbo/i,
      // Specific nutrient product names
      /florablend/i,
      /hydroplex/i,
      /clearex/i,
      /microzyme/i,
      /scietetics/i,
      /ful-?v-?tech/i,
      /apatite/i,
      /rapid\s*start/i,
      /jungle\s*green/i,
      // Nutrient-related volume/quantity patterns
      /\b\d+\s*(?:gal|gallon)\b/i,
      /\b\d+\s*(?:liter|litre|lt)\b/i,
      /\b\d+\s*(?:quart|qt)\b/i,
      /\b\d+\s*(?:oz|ounce)\b/i,
      // Common nutrient product terms
      /\bbloom\b/i,
      /\bgrow\b(?!.*light|.*tent|.*room)/i,
      /\bmicro\b/i,
      /\bbase\b.*(?:a|b|nutrient)/i,
      /part\s*(?:a|b)/i,
      /liquid\s*(?:bloom|grow|feed)/i,
      /foliar/i,
      /\broot\s*(?:boost|drench|zone|excel)/i,
      /\bbud\b/i,
      /flowering/i,
      /vegetative/i,
      /ripening/i,
      /finisher/i,
      /\bflush\b/i,
    ],
    exclude: [
      /potting\s*mix/i,
      /rockwool|perlite|hydroton|clay\s*pebbles/i,
      /(?:grow\s*)?tent/i,
      /(?:inline\s*|exhaust\s*)?fan/i,
      /carbon\s*filter/i,
      /grow\s*light|hps|led\s*light|cmh/i,
      /water\s*pump/i,
      /timer/i,
      /duct(?:ing)?/i,
      /\bseeds?\b/i,
      /tray|dome|propagation/i,
    ],
  },
  
  controllers: {
    include: [
      /\btimer\b/i,
      /\bthermostat\b/i,
      /\bhumidistat\b/i,
      /\btimestat\b/i,
      /\btsc-?\d+\b/i,
      /fan\s*(?:speed\s*)?controller/i,
      /speed\s*controller/i,
      /temp(?:erature)?\s*controller/i,
      /humidity\s*controller/i,
      /co2\s*controller/i,
      /environment(?:al)?\s*controller/i,
      /controller\s*(?:ai|67|69|76)/i,
      /autopilot/i,
      /titan\s*controls/i,
      /repeat\s*cycle/i,
      /24\s*hour.*timer/i,
      /digital\s*timer/i,
      /mechanical\s*timer/i,
      /cycle.*timer/i,
      /light\s*switcher/i,
      /\d+\s*light.*(?:timer|switcher|controller)/i,
      /mlc[\s-]?\d+/i,
      /ls1[\s-]?\d*/i,
      /flip.*box/i,
      /relay\s*(?:box|switch)/i,
      /ballast\s*(?:controller|switcher)/i,
      /high\s*load\s*switcher/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco|media/i,
      /led\s*(?:grow\s*)?light|hps\s*(?:bulb|lamp)|cmh\s*(?:bulb|lamp)/i,
      /fan(?!\s*controller)|filter|duct/i,
      /controller.*(?:not\s*included|sold\s*separately)/i,
    ],
  },
  
  containers: {
    include: [
      /\bpot\b/i,
      /\bpots\b/i,
      /\bbucket\b/i,
      /\breservoir\b/i,
      /\bsaucer\b/i,
      /\btray\b/i,
      /\blid\b/i,
      /fabric\s*pot/i,
      /smart\s*pot/i,
      /root\s*pouch/i,
      /grow\s*bag/i,
      /net\s*(?:pot|cup)/i,
      /\bplanter\b/i,
      /\btote\b/i,
      /plant\s*(?:pot|container)/i,
      /hydro\s*bucket/i,
      /gro\s*pro/i,
      /\d+\s*gal(?:lon)?\b.*(?:pot|bucket|reservoir|fabric|smart|pouch)/i,
    ],
    exclude: [
      /\bseed\b/i,
      /nutrient|fertilizer|additive|supplement/i,
      /\bcoco\b|\bsoil\b|potting\s*mix|\bperlite\b|rockwool/i,
      /fan|filter|duct|inline|exhaust/i,
      /tent|light|led|hps/i,
      /controller|timer|thermostat/i,
      /pot(?:ash|assium)/i,
    ],
  },
  
  harvesting: {
    include: [
      /\btrimmer\b/i,
      /\btrim\s*(?:bin|bowl|tray)\b/i,
      /\bdrying\s*(?:rack|net|screen|system)\b/i,
      /\bdry\s*(?:rack|net)\b/i,
      /\bcollapsible.*drying/i,
      /\bthe\s*rack\b.*(?:dry|collapsible)/i,
      /\bscissor/i,
      /\bshear/i,
      /\bsnip/i,
      /\bpruner/i,
      /\bboveda\b/i,
      /\bintegra\s*boost\b/i,
      /\bhumidity\s*pack/i,
      /\bbubble\s*bag/i,
      /\brosin\s*(?:press|bag)\b/i,
      /\bchikamasa\b/i,
      /\bfiskars\b/i,
      /\btriminator\b/i,
      /\bgreenbroz\b/i,
      /cure.*(?:jar|bag|container)/i,
      /grove\s*bag/i,
    ],
    exclude: [
      /\bseed\b/i,
      /nutrient|fertilizer/i,
      /\bsoil\b|\bcoco\b|perlite|rockwool/i,
      /fan|filter(?!.*rosin)|duct|tent|light|led|hps/i,
      /controller|timer|pump|reservoir/i,
    ],
  },
  
  seeds: {
    include: [
      /\bseed\b/i,
      /\bseeds\b/i,
      /\bfeminised\b/i,
      /\bfeminized\b/i,
      /\bautoflower/i,
      /\bstrain\b/i,
      /\bgenetics\b/i,
      /humboldt\s*seed/i,
      /greenhouse\s*seed/i,
      /\bindica\b/i,
      /\bsativa\b/i,
      /\bhybrid\b/i,
      /(?:purple|gold|green|amber)\s*label/i,
    ],
    exclude: [
      /seed\s*starting\s*mix/i,
      /seedling\s*(?:tray|dome|heat|mat)/i,
      /nutrient|fertilizer|soil|coco|perlite/i,
      /fan|filter|duct|tent|light|led|hps/i,
      /controller|timer|pump|reservoir|pot|bucket/i,
    ],
  },
  
  ph_meters: {
    include: [
      /\bph\s*meter\b/i,
      /\bph\s*pen\b/i,
      /\bec\s*meter\b/i,
      /\btds\s*meter\b/i,
      /\bcalibration\s*solution\b/i,
      /\belectrode\b/i,
      /\bbluelab\b/i,
      /\bhanna\b/i,
      /\bapera\b/i,
    ],
    exclude: [
      /nutrient(?!.*calibration)/i,
      /fertilizer/i,
      /soil|coco|perlite/i,
      /fan|filter|duct|tent|light/i,
    ],
  },
  
  irrigation: {
    include: [
      /\bpump\b/i,
      /\btubing\b/i,
      /\bfitting\b/i,
      /\bvalve\b/i,
      /\bdrip\b/i,
      /\bemitter\b/i,
      /\bair\s*stone\b/i,
      /\bactive\s*aqua\b/i,
      /\becoplus\b/i,
      /\bfloraflex\b/i,
      /\bmag\s*drive\b/i,
      /pump\s*filter\s*bag/i,
      /\bhose\b.*(?:clamp|fitting|barb)/i,
      /\bfloat\s*valve\b/i,
      /\bgph\b/i,
      /\bsplitter\b/i,
      /\bconnector\b.*(?:\d\/\d|inch|in\.)/i,
      /\bunion\s*connector\b/i,
      /way\s*splitter/i,
      /\bbarb\b.*(?:fitting|connector)/i,
      /\bmanifold\b/i,
      /\bblue\s*tubing\b/i,
      /\bbarbed\b/i,
      /\btee\b.*(?:barb|fitting)/i,
      /\belbow\b.*(?:barb|fitting)/i,
      /\bstraight\b.*barb/i,
      /\bgrommet\b/i,
      /\bfloat\s*kit\b/i,
      /\bmerlin\s*garden/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan(?!.*pump)|duct|tent|light/i,
      /timer(?!.*pump)|controller(?!.*pump)/i,
      /carbon\s*filter|can\s*filter|phresh/i,
    ],
  },
  
  propagation: {
    include: [
      /\bclone\b/i,
      /\bcloning\b/i,
      /\brooting\s*(?:gel|powder)\b/i,
      /\bdome\b/i,
      /\bheat\s*mat\b/i,
      /\bclonex\b/i,
      /\bturbo\s*klone\b/i,
      /\bsuper\s*sprouter\b/i,
      /\bgreenhouse\s*kit\b/i,
      /\bmini\s*greenhouse\b/i,
      /\bseedling\s*tray\b/i,
      /\bpropagation\s*(?:tray|dome|kit)/i,
      /\bsite\s*plug/i,
      /\bneoprene\s*collar/i,
      /\bnet\s*pot\s*lid/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan|filter|duct|tent|light/i,
      /pump|reservoir/i,
    ],
  },
  
  odor_control: {
    include: [
      /\bcarbon\s*filter\b/i,
      /\bcan[\s-]?filter\b/i,
      /\bcan[\s-]?lite\b/i,
      /\bcan[\s-]?\d+\b/i,              // CAN 33, CAN 50, etc.
      /pre-?filter.*(?:can|model\s*pro)/i, // Pre-filters for carbon filters
      /\bphresh\b/i,
      /\bona\b/i,
      /\bodor\s*(?:control|neutralizer)\b/i,
      /\bneutralizer\b/i,
      /\bozone\s*generator\b/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /inline\s*fan|exhaust\s*fan/i,
      /tent|light|led|hps/i,
      /hydro-?logic|ro\s*system|reverse\s*osmosis/i, // Water filters go elsewhere
    ],
  },
  
  hid_bulbs: {
    include: [
      /\bhps\b/i,
      /high\s*pressure\s*sodium/i,
      /\bmh\b(?!.*hydro)/i,
      /metal\s*halide/i,
      /\bcmh\b/i,
      /\bt5\b/i,
      /\bt8\b/i,
      /\bcfl\b/i,
      /lumens/i,
      /\bballast\b/i,
      /\breflector\b/i,
      /\bhood\b.*(?:light|reflector|grow)/i,
      /\bsolarmax\b/i,
      /\bplantmax\b/i,
      /\bhortilux\b/i,
      /\bdigilux\b/i,
      /\bsunblaster\b/i,
      /\bultragrow\b/i,
      /\bsunsoaker\b/i,
      /\bparabolic\b/i,
      /mogul\s*(?:base|socket)/i,
      /\bconversion\b.*(?:bulb|lamp)/i,
      /\bsocket\b.*(?:bracket|horizontal|horizonal)/i,
      /\blamp\b(?!.*timer|.*controller)/i,
      /\bfixture\b.*(?:light|grow|hood)/i,
      /big\s*boy\s*(?:a\/c|ac)\s*reflector/i,
      /\buno\b.*(?:reflector|hood)/i,
      /pulse\s*start/i,
      /\d+\s*watt.*(?:hps|mh|metal)/i,
      /\d+w.*(?:hps|mh|halide)/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan|duct|tent/i,
      /led\s*grow\s*light/i,
    ],
  },
  
  pest_control: {
    include: [
      /\bpest\s*control\b/i,
      /\bpesticide\b/i,
      /\binsecticide\b/i,
      /\bfungicide\b/i,
      /\bmiticide\b/i,
      /\bspider\s*mite/i,
      /\baphid/i,
      /\bthrip/i,
      /\bzero\s*tolerance/i,
      /\bneem\s*oil/i,
      /\bpyrethrin/i,
      /\bsticky\s*trap/i,
      /\btimemist/i,
    ],
    exclude: [
      /nutrient|fertilizer|soil|coco/i,
      /fan|filter|duct|tent|light/i,
    ],
  },
  
  water_filtration: {
    include: [
      /\bro\s*(?:system|filter)\b/i,
      /reverse\s*osmosis/i,
      /\bstealth\s*ro\b/i,
      /\btall\s*boy\b/i,
      /\bsmall\s*boy\b/i,
      /de-?chlorinat/i,
      /sediment\s*filter/i,
      /carbon\s*(?:filter|block).*(?:water|replacement)/i,
      /\bgpd\b/i,
      /\bgrowonix\b/i,
      /hydro-?logic/i,
      /pre-?filter.*(?:ro|evolution|sediment)/i,
      /pre-?evolution/i,
      /\bwater\s*filter\b/i,
    ],
    exclude: [
      /carbon\s*filter.*(?:odor|smell|exhaust|can)/i,
      /\bair\b.*carbon/i,
      /nutrient|fertilizer/i,
    ],
  },
  
  co2: {
    include: [
      /\bco2\b/i,
      /\bcarbon\s*dioxide\b/i,
      /co2\s*generator/i,
      /co2\s*controller/i,
      /\bpropane\b.*(?:gen|generator)/i,
      /\bnatural\s*gas\b.*(?:gen|generator)/i,
      /uno.*gen/i,
      /gen-?\d+.*(?:propane|natural|lp|elp)/i,
      /ppm.*(?:monitor|controller)/i,
      /exhale.*(?:bag|co2)/i,
    ],
    exclude: [
      /nutrient|fertilizer/i,
      /\bcarbon\s*filter\b/i,
    ],
  },
  
  trimming: {
    include: [
      /\btrimpro\b/i,
      /\btrimbox\b/i,
      /\btrimmer\b.*(?:machine|bowl)/i,
      /\bspin\s*pro\b/i,
      /\btrolley\b/i,
      /\brotor\b.*(?:trim|grate|motor)/i,
      /\breplacement\s*(?:grate|bag|motor)/i,
      /\bexit\s*chute\b/i,
      /add-?a-?lamp\s*hardware/i,
    ],
    exclude: [
      /nutrient|fertilizer/i,
      /fan|filter|duct|tent|light(?!.*trolley)/i,
    ],
  },
  
  environmental_monitors: {
    include: [
      /\bec\s*meter/i,
      /\btds\s*meter/i,
      /\btds\s*monitor/i,
      /\btds-?\d+\b/i,
      /\bdm-?\d+\b.*(?:tds|monitor)/i,
      /\bppm\s*meter/i,
      /\bconductivity\s*meter/i,
      /\bthermometer\b/i,
      /\bhygrometer\b/i,
      /\btemp.*humidity/i,
      /\blight\s*meter/i,
      /\bpar\s*meter/i,
      /\blux\s*meter/i,
      /\bco2\s*monitor/i,
      /\bbluelab.*(?:truncheon|combo|guardian)/i,
      /\bsoil\s*moisture\s*meter/i,
      /accurate.*(?:ph|tds|ec)/i,
      /\bhandheld\s*meter/i,
      /\bprobe\b.*(?:replacement|electrode|sensor)/i,
      /storage\s*solution/i,
      /\bmicrobiometer\b/i,
      /\bsoil\s*test/i,
    ],
    exclude: [
      /\bph\s*(?:up|down|adjust)/i,
      /\btimer\b/i,
      /\bcontroller\b/i,
      /nutrient|fertilizer/i,
    ],
  },
  
  electrical_supplies: {
    include: [
      /\bpower\s*cord/i,
      /\bextension\s*cord/i,
      /\bmogul\s*socket/i,
      /\blamp\s*socket/i,
      /\bcord\s*set\b/i,
      /\bdigital\s*ballast/i,
      /\belectronic\s*ballast/i,
      /\breflector\s*hood/i,
      /\bcool\s*tube/i,
      /\bair\s*cooled\s*reflector/i,
      /\blight\s*mover/i,
      /\blight\s*rail/i,
      /\brope\s*ratchet/i,
      /\byoyo\s*hanger/i,
      /\bnema\s*\d/i,
      /\btwist\s*lock/i,
    ],
    exclude: [
      /\bcomplete\s*(?:grow|led)\s*light/i,
      /\bfull\s*spectrum/i,
      /\bhps\s*bulb/i,
      /\bmh\s*bulb/i,
      /nutrient|fertilizer/i,
    ],
  },
  
  books: {
    include: [
      /\bbook\b/i,
      /\bhandbook\b/i,
      /\bguide\b.*(?:grower|growing|garden|organic)/i,
      /teaming.*(?:microbes|fungi|nutrients)/i,
      /grower'?s?\s*(?:guide|handbook|bible)/i,
    ],
    exclude: [
      /\bph\s*guide/i,
      /\bfeeding\s*guide/i,
    ],
  },
  
  grow_room_materials: {
    include: [
      /\bmylar\b/i,
      /\bpanda\s*film/i,
      /\breflective\s*film/i,
      /\bblack\s*white\s*poly/i,
      /\blight\s*deprivation/i,
      /\bzipper\s*door/i,
      /\btrellis\s*net/i,
      /\bplant\s*support/i,
      /\byoyo\b/i,
      /\bflashgro\b/i,
      /\bblock-?ir\b/i,
      /\bdiamond.*(?:silver|white).*film/i,
      /\bsilver\s*white\s*film/i,
      /\bpoly\s*film/i,
      /(?:silver|white)\s*film\s*roll/i,
    ],
    exclude: [
      /nutrient|fertilizer/i,
      /\btent\b/i,
    ],
  },
  
  extraction: {
    include: [
      /\brosin\s*press/i,
      /\brosin\s*bag/i,
      /\brosin\s*plate/i,
      /\brosin\s*pro/i,
      /\bpress\s*club/i,
      /\bextraction\b/i,
      /\bbubble\s*bag/i,
      /\bhash\s*bag/i,
      /\bmicron\s*bag/i,
      /\bparchment\s*paper/i,
      /\bptfe\s*sheet/i,
      /\bdulytek\b/i,
      /\bnugsmasher\b/i,
      /pneumatic.*press/i,
      /manual.*press.*rosin/i,
    ],
    exclude: [
      /nutrient|fertilizer/i,
      /\btent\b|\bfan\b|\bfilter\b|\blight\b/i,
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Product Pool
// ─────────────────────────────────────────────────────────────────────────────

interface UnifiedProduct {
  id: string;           // Unique identifier (SKU or handle)
  handle: string;
  title: string;
  brand: string;
  vendor: string;
  description: string;
  tags: string;
  categories: string;
  source: 'shopify' | 'woo' | 'inventory' | 'multi';
  shopify: boolean;
  woo: boolean;
  inventory: boolean;
}

function buildUnifiedProductPool(): UnifiedProduct[] {
  console.log('📂 Loading source files...');
  
  // Load all sources
  const shopifyPath = resolve(CSV_DIR, 'products_export_1.csv');
  const wooPath = resolve(CSV_DIR, 'Products-Export-2025-Oct-29-171532.csv');
  const vendorPath = resolve(CSV_DIR, 'HMoonHydro_Inventory.csv');
  
  const shopifyRows = readCsvSafe(shopifyPath);
  const wooRows = readCsvSafe(wooPath);
  const vendorRows = readCsvSafe(vendorPath);
  
  console.log(`   Shopify: ${shopifyRows.length} rows`);
  console.log(`   WooCommerce: ${wooRows.length} rows`);
  console.log(`   Vendor Inventory: ${vendorRows.length} rows`);
  
  // Build unified map keyed by handle/slug
  const productMap = new Map<string, UnifiedProduct>();
  
  // Process Shopify
  for (const row of shopifyRows) {
    const handle = getColumn(row, 'Handle', 'handle');
    const title = getColumn(row, 'Title', 'title');
    const sku = getColumn(row, 'Variant SKU', 'SKU', 'sku');
    
    if (!handle && !title) continue;
    
    const key = handle || sku || title.toLowerCase().replace(/\s+/g, '-');
    
    if (!productMap.has(key)) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title,
        brand: '',
        vendor: getColumn(row, 'Vendor', 'vendor'),
        description: getColumn(row, 'Body (HTML)', 'Body HTML', 'Description'),
        tags: getColumn(row, 'Tags', 'tags'),
        categories: '',
        source: 'shopify',
        shopify: true,
        woo: false,
        inventory: false,
      });
    } else {
      productMap.get(key)!.shopify = true;
    }
  }
  
  // Process WooCommerce
  for (const row of wooRows) {
    const slug = getColumn(row, 'Slug', 'slug');
    const name = getColumn(row, 'Name', 'name', 'Title');
    const sku = getColumn(row, 'Sku', 'SKU', 'sku');
    
    if (!slug && !name) continue;
    
    const key = slug || sku || name.toLowerCase().replace(/\s+/g, '-');
    
    if (!productMap.has(key)) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title: name,
        brand: getColumn(row, 'Brands', 'Brand', 'brand'),
        vendor: '',
        description: getColumn(row, 'Description', 'Short Description', 'Short description'),
        tags: getColumn(row, 'Tags', 'tags'),
        categories: getColumn(row, 'Categories', 'categories'),
        source: 'woo',
        shopify: false,
        woo: true,
        inventory: false,
      });
    } else {
      const existing = productMap.get(key)!;
      existing.woo = true;
      existing.source = 'multi';
      // Merge data
      if (!existing.brand) existing.brand = getColumn(row, 'Brands', 'Brand', 'brand');
      if (!existing.description) existing.description = getColumn(row, 'Description', 'Short Description');
      if (!existing.categories) existing.categories = getColumn(row, 'Categories', 'categories');
    }
  }
  
  // Process Inventory
  for (const row of vendorRows) {
    const sku = getColumn(row, 'SKU', 'sku', 'Sku');
    const name = getColumn(row, 'Product Name', 'Name', 'name', 'Title', 'Description');
    
    if (!sku && !name) continue;
    
    const key = sku || name.toLowerCase().replace(/\s+/g, '-');
    
    // Try to match by SKU in existing products
    let matched = false;
    for (const [existingKey, product] of productMap) {
      if (product.id === sku || existingKey.includes(sku.toLowerCase())) {
        product.inventory = true;
        product.source = 'multi';
        // Add manufacturer as brand if missing
        if (!product.brand) {
          product.brand = getColumn(row, 'Manufacturer', 'manufacturer', 'Brand');
        }
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      productMap.set(key, {
        id: sku || key,
        handle: key,
        title: name,
        brand: getColumn(row, 'Manufacturer', 'manufacturer', 'Brand'),
        vendor: '',
        description: '',
        tags: '',
        categories: '',
        source: 'inventory',
        shopify: false,
        woo: false,
        inventory: true,
      });
    }
  }
  
  // Normalize brands using centralized brand registry
  const products = Array.from(productMap.values());
  for (const product of products) {
    const detectedBrand = detectBrandNormalized(
      product.title,
      product.brand,     // may be manufacturer from inventory
      product.vendor,    // shopify vendor
      product.brand      // woo brand field
    );
    product.brand = isValidBrand(detectedBrand) ? detectedBrand : 'Unknown';
  }
  
  console.log(`\n📦 Unified product pool: ${products.length} unique products\n`);
  
  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Matching
// ─────────────────────────────────────────────────────────────────────────────

function matchesCategory(text: string, category: string): boolean {
  const patterns = CATEGORY_PATTERNS[category];
  if (!patterns) return false;
  
  // Check exclusions first
  if (patterns.exclude.some(p => p.test(text))) {
    return false;
  }
  
  // Then check inclusions
  return patterns.include.some(p => p.test(text));
}

function categorizeProduct(product: UnifiedProduct): string[] {
  const combinedText = [
    product.title,
    product.description,
    product.tags,
    product.categories,
  ].join(' ');
  
  const matched: string[] = [];
  
  for (const category of Object.keys(CATEGORY_PATTERNS)) {
    if (matchesCategory(combinedText, category)) {
      matched.push(category);
    }
  }
  
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword Extraction for Clustering
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'that', 'this', 'these', 'those', 'it', 'its', 'you', 'your', 'we', 'our',
  'amp', 'nbsp', 'quot', 'lt', 'gt', 'html', 'div', 'span', 'class', 'style',
  'product', 'products', 'item', 'items', 'available', 'new', 'sale', 'shop',
  '', 'null', 'undefined', 'true', 'false',
]);

function extractKeywords(text: string): string[] {
  // Remove HTML tags
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase();
  
  // Extract words
  const words = cleaned.match(/[a-z]{3,}/g) || [];
  
  // Filter and return
  return words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scanner
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Catalog Coverage Scanner');
  console.log('============================\n');
  
  const products = buildUnifiedProductPool();
  
  // Categorize all products
  console.log('🔍 Categorizing products...\n');
  
  const categorized: Record<string, UnifiedProduct[]> = {
    airflow: [],
    lights: [],
    tents: [],
    vent_accessories: [],
    grow_media: [],
    nutrients: [],
    controllers: [],
    containers: [],
    harvesting: [],
    seeds: [],
    ph_meters: [],
    irrigation: [],
    propagation: [],
    odor_control: [],
    hid_bulbs: [],
    pest_control: [],
    water_filtration: [],
    co2: [],
    trimming: [],
    environmental_monitors: [],
    electrical_supplies: [],
    books: [],
    grow_room_materials: [],
    extraction: [],
  };
  
  const uncategorized: UnifiedProduct[] = [];
  const multiCategory: UnifiedProduct[] = [];
  
  for (const product of products) {
    const categories = categorizeProduct(product);
    
    if (categories.length === 0) {
      uncategorized.push(product);
    } else if (categories.length > 1) {
      multiCategory.push(product);
      // Add to first matched category
      categorized[categories[0]].push(product);
    } else {
      categorized[categories[0]].push(product);
    }
  }
  
  // Summary
  console.log('📈 Coverage Summary:');
  console.log('────────────────────');
  let totalCategorized = 0;
  for (const [category, items] of Object.entries(categorized)) {
    console.log(`   ${category}: ${items.length} products`);
    totalCategorized += items.length;
  }
  console.log(`\n   ✅ Categorized: ${totalCategorized} (${((totalCategorized / products.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Uncategorized: ${uncategorized.length} (${((uncategorized.length / products.length) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Multi-category: ${multiCategory.length}`);
  
  // Keyword clustering for uncategorized
  console.log('\n\n🔑 Top Keywords in Uncategorized Products:');
  console.log('───────────────────────────────────────────');
  
  const keywordCounts = new Map<string, number>();
  
  for (const product of uncategorized) {
    const text = `${product.title} ${product.categories} ${product.tags}`;
    const keywords = extractKeywords(text);
    
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }
  
  // Sort and show top 50
  const sortedKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  
  for (let i = 0; i < sortedKeywords.length; i++) {
    const [keyword, count] = sortedKeywords[i];
    if (count >= 3) {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${keyword}: ${count}`);
    }
  }
  
  // Suggest next category
  console.log('\n\n💡 Suggested Next Categories (by keyword clusters):');
  console.log('────────────────────────────────────────────────────');
  
  const categoryHints: Record<string, string[]> = {
    'pH/EC Meters & Testing': ['meter', 'tester', 'testing', 'digital', 'calibration', 'probe', 'electrode', 'solution', 'buffer', 'storage'],
    'Propagation': ['clone', 'cloning', 'propagation', 'dome', 'tray', 'humidity', 'rooting', 'hormone', 'gel', 'powder', 'cutting'],
    'Irrigation & Watering': ['pump', 'reservoir', 'tubing', 'irrigation', 'drip', 'water', 'hose', 'fitting', 'valve', 'float', 'submersible'],
    'Pest Control': ['pest', 'insect', 'mite', 'spider', 'fungus', 'spray', 'organic', 'neem', 'pyrethrin', 'sticky', 'trap'],
    'Trellising & Training': ['trellis', 'net', 'netting', 'scrog', 'support', 'stake', 'tie', 'wire', 'clip', 'training', 'bending'],
    'Harvesting & Processing': ['trim', 'trimmer', 'harvest', 'dry', 'drying', 'rack', 'cure', 'curing', 'jar', 'bag', 'turkey'],
    'Containers & Pots': ['pot', 'container', 'fabric', 'smart', 'bucket', 'tote', 'planter', 'gallon', 'saucer', 'riser'],
    'HVAC & Climate': ['dehumidifier', 'humidifier', 'heater', 'air', 'conditioning', 'portable', 'mini', 'split', 'btu'],
    'CO2 Enrichment': ['co2', 'regulator', 'tank', 'generator', 'burner', 'propane', 'natural', 'gas', 'ppm', 'monitor'],
    'Hydroponic Systems': ['hydroponic', 'system', 'dwc', 'nft', 'ebb', 'flow', 'flood', 'drain', 'aeroponics', 'bucket'],
  };
  
  const categoryScores: [string, number, string[]][] = [];
  
  for (const [category, hints] of Object.entries(categoryHints)) {
    let score = 0;
    const matchedHints: string[] = [];
    for (const hint of hints) {
      const count = keywordCounts.get(hint) || 0;
      if (count > 0) {
        score += count;
        matchedHints.push(`${hint}(${count})`);
      }
    }
    if (score > 0) {
      categoryScores.push([category, score, matchedHints]);
    }
  }
  
  categoryScores.sort((a, b) => b[1] - a[1]);
  
  for (const [category, score, hints] of categoryScores.slice(0, 5)) {
    console.log(`\n   🎯 ${category} (score: ${score})`);
    console.log(`      Keywords: ${hints.slice(0, 8).join(', ')}`);
  }
  
  // Output files
  console.log('\n\n📁 Writing output files...');
  
  // Coverage report JSON
  const coverageReport = {
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    categorized: {
      total: totalCategorized,
      percentage: ((totalCategorized / products.length) * 100).toFixed(1),
      byCategory: Object.fromEntries(
        Object.entries(categorized).map(([k, v]) => [k, v.length])
      ),
    },
    uncategorized: {
      total: uncategorized.length,
      percentage: ((uncategorized.length / products.length) * 100).toFixed(1),
    },
    multiCategory: multiCategory.length,
    topKeywords: sortedKeywords.slice(0, 100),
    suggestedNextCategories: categoryScores.slice(0, 5).map(([name, score, hints]) => ({
      name,
      score,
      keywords: hints,
    })),
    sourceBreakdown: {
      shopifyOnly: products.filter(p => p.shopify && !p.woo && !p.inventory).length,
      wooOnly: products.filter(p => p.woo && !p.shopify && !p.inventory).length,
      inventoryOnly: products.filter(p => p.inventory && !p.shopify && !p.woo).length,
      multiSource: products.filter(p => (p.shopify ? 1 : 0) + (p.woo ? 1 : 0) + (p.inventory ? 1 : 0) > 1).length,
    },
  };
  
  const reportPath = resolve(CSV_DIR, 'coverage_report.json');
  writeFileSync(reportPath, JSON.stringify(coverageReport, null, 2));
  console.log(`   ✅ ${reportPath}`);
  
  // Uncategorized candidates CSV
  const csvHeader = 'id,handle,title,brand,vendor,source,shopify,woo,inventory,sample_keywords';
  const csvRows = uncategorized.map(p => {
    const keywords = extractKeywords(`${p.title} ${p.categories}`).slice(0, 5).join(';');
    return [
      `"${(p.id || '').replace(/"/g, '""')}"`,
      `"${(p.handle || '').replace(/"/g, '""')}"`,
      `"${(p.title || '').replace(/"/g, '""')}"`,
      `"${(p.brand || '').replace(/"/g, '""')}"`,
      `"${(p.vendor || '').replace(/"/g, '""')}"`,
      p.source,
      p.shopify ? 'yes' : 'no',
      p.woo ? 'yes' : 'no',
      p.inventory ? 'yes' : 'no',
      `"${keywords}"`,
    ].join(',');
  });
  
  const csvContent = [csvHeader, ...csvRows].join('\n');
  const csvPath = resolve(CSV_DIR, 'uncategorized_candidates.csv');
  writeFileSync(csvPath, csvContent);
  console.log(`   ✅ ${csvPath}`);
  
  // Final recommendation
  if (categoryScores.length > 0) {
    console.log(`\n\n🚀 RECOMMENDATION: Build "${categoryScores[0][0]}" next (${categoryScores[0][1]} keyword matches)`);
  }
  
  console.log('\n✅ Coverage scan complete!');
}

main().catch(console.error);
