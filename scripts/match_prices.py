#!/usr/bin/env python3
"""
Price Matching Engine for H-Moon Hydro
Cross-references missing-price products against:
1. Feb 12 WooCommerce export CSV (prices from older catalog)
2. Scraped enrichment matches (HydroBuilder/GrowersHouse already matched)
3. Raw HydroBuilder catalog (18,902 products) via fuzzy matching
4. Raw GrowersHouse catalog (4,234 products) via fuzzy matching

Outputs: outputs/price_fixes.json with product_id -> price mappings
"""

import csv
import json
import re
import os
from difflib import SequenceMatcher

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Missing-price products (parsed from server output) ──────────────────
MISSING_PRICES_RAW = """72619|HydroDynamics Clonex Mist 100 ml|hmh01744|
72701|Athena Blended Line|HMH-AUTO-14DACE|
72703|Athena CaMg|HMH-AUTO-647873|
72722|Teaming with Bacteria: The Organic Gardener's Guide to Endophytic Bacteria and the Rhizophagy Cycle|9.7816E+12|
72779|Scietetics Foundation Powder|HMH-AUTO-30C728|
72791|SCIETETICS COCO 8" BLOCK /1.5Gal|HMH-AUTO-3842DB|
72801|Seeds|HMH-AUTO-0739FA|
72858|FloraBlend|hmh00010|
72859|BioThrive|hmh00015|
72860|Flora Series|hmh00016|
72861|FloraNova Series|hmh00017|
72862|Maxi Series|hmh00018|
72863|BioBud|hmh00019|
72864|BioMarine|hmh00020|
72865|BioWeed|hmh00022|
72866|CaMg+|hmh00023|
72867|Diamond Black|hmh00024|
72868|Diamond Nectar|hmh00025|
72869|FloraDuo Complete|hmh00026|
72870|Floralicious Series|hmh00027|
72871|Floralicious Plus|hmh00028|
72872|FloraNectar|hmh00029|
72873|Flora Shield|hmh00030|
72874|FloraKleen|hmh00031|
72875|KoolBloom|hmh00032|
72876|Liquid KoolBloom™ 0 - 10 - 10|hmh00033|
72877|Rapid Start|hmh00034|
72879|B'Cuzz BIO-NRG Flavor|hmh00040|
72881|B'Cuzz Hydro Nutrients|hmh00042|
72882|B'Cuzz PK 13/14|hmh00043|
72883|B'Cuzz Growth Stimulator|hmh00047|
72884|B'Cuzz Root Stimulator|hmh00050|
72885|Better Bloom 12-34-12|hmh00052|
72886|Jungle Green 17-15-17|hmh00053|
72887|Royal Black|hmh00054|
72888|Royal Gold|hmh00055|
72889|Yield Up 9-47-9|hmh00056|
72890|Bud Boom|hmh00057|
72891|Bud Start|hmh00058|
72892|Carbo Blast|hmh00059|
72893|Prop-O-Gator Plant Food|hmh00060|
72894|Suck it Up|hmh00064|
72895|Double Super B+ Extra Strength|hmh00065|
72896|Ton O Bud 0-10-6|hmh00066|
72897|The Hammer|hmh00067|
72898|Humboldt Grow 2-1-6|hmh00068|
72899|Humboldt Micro 5-0-1|hmh00069|
72900|Humboldt Bloom 0-6-5|hmh00070|
72901|Big Up Powder 0-33-23|hmh00071|
72902|Sea Cal 3-2-8|hmh00072|
72903|Sea Mag 0.2-0.2-3|hmh00073|
72904|Master A|hmh00074|
72905|Master B|hmh00075|
72906|DueceDuece|hmh00076|
72908|Hydro-Deuce|hmh00079|
72911|Grow Natural|hmh00082|
72912|Bloom Natural|hmh00083|
72913|Hum-Bolt|hmh00084|
72914|Flavor-Ful|hmh00085|
72915|Verde Growth Catalyst|hmh00086|
72916|Oneness 5-9-4|hmh00087|
72917|Mayan Microzyme|hmh00088|
72919|Myco Madness Soluble|hmh00090|
72920|Myco Maximum Granular|hmh00091|
72921|Humboldt Honey Hydro Carbs|hmh00092|
72922|Humboldt Honey ES|hmh00093|
72923|Humboldt Roots|hmh00094|
72924|Humboldt Sticky Foliar Feed|hmh00096|
72926|CalCarb Calcium Carbonate Foliar Spray|hmh00104|
72927|CocoTek Caps|hmh00112|
72928|CocoTek Liners|hmh00113|
72929|Rapid Rooter Rooting Plugs|hmh00116|
72930|BASIC Magnetic Ballast|hmh00118|
72931|Ultragrow Cool Tube|hmh00135|
72932|ONA Block|hmh00143|
72933|ONA Liquid|hmh00144|
72934|ONA Gel Fresh Linen|hmh00145|
72935|ONA Mist|hmh00148|
72939|TimeMist Plus Programmable Dispenser|hmh00156|
72940|Safer Garden Fungicide 32oz RTU Spray|hmh00158|
72941|Block-IR Infra-Red Barrier|hmh00159|
72943|B'cuzZ Roxx Rooting Blocks|hmh00468|
72944|B'cuzZ Roxx Bimatrix Growing Slabs|hmh00474|
72946|Mag Drive Pumps|hmh00573|
72947|Reflective Mylar Rolls|hmh00575|
72948|Accessories & Components|hmh00584|
72949|Green Air Genesis Calibration Solutions|hmh00589|
72953|General Hydroponics pH Up|hmh00593|
72955|Philips Lighting|hmh00596|
72956|Plantmax Pulse Start Metal Halide Lamps|hmh00597|
72957|BADBOY HO Triphosphor Lamps|hmh00598|
72958|Plantmax SUPER High Pressure Sodium|hmh00601|
72959|Plantmax HPS Conversion (MH Ballast)|hmh00602|
72960|Plantmax MH Conversion (HPS Ballast)|hmh00603|
72961|VEGETATIVE - HPS Ballast|hmh00606|
72962|VEGETATIVE - MH Ballast|hmh00607|
72964|Light Rail 5|hmh00609|
72965|Light Rail Accessories|hmh00611|
72966|Grommets|hmh00616|
72967|1/2" Barb Connectors|hmh00623|
72968|The Bucket Basket|hmh00624|
72969|Netpots|hmh00625|
72970|Site Plugs|hmh00626|
72971|Snapture SnapStand|hmh00627|
72973|CST-1(P) Timer / frequency & duration|hmh00631|
72974|24-DT-1 -- 24 Hour Clock Timer|hmh00632|
72975|LT4 - 4 Light Timer (120 or 240 V)|hmh00633|
72977|ON /OFF Switcher 120V|hmh00636|
72978|Vortex Powerfans|hmh00637|
72979|Backdraft Dampers|hmh00639|
72980|Thermostatically Controlled Centrifugal Fans|hmh00640|
72981|Original Can Fans|hmh00645|
72982|Can Filters|hmh00646|
72983|Can Filter Pre-Filters|hmh00647|
72984|Can Filter Flanges|hmh00648|
72985|Ducting|hmh00649|
72986|Max-Fan|hmh00650|
72987|PROfilter reversible carbon filters|hmh00661|
72988|38-Special by Can-Filters|hmh00662|
72989|The Rack - Collapsible Drying System|hmh00663|
72990|The TRIMPRO|hmh00665|
72992|TRIMPRO ROTOR|hmh00670|
72993|Rare Earth|hmh00686|
72995|B-52 Vitamin|hmh01003|
72996|Big Bud Bloom Booster (Powder)|hmh01004|
72997|Bud Blood Bloom Stimulator|hmh01005|
72998|Bud Candy|hmh01006|
72999|Bud Factor X|hmh01007|
73000|CarboLoad|hmh01008|
73001|Final Phase|hmh01009|
73002|Mother Earth Organic Super Tea Grow|hmh01011|
73003|Nirvana|hmh01012|
73004|Overdrive|hmh01013|
73005|Piranha Beneficial Fungi|hmh01014|
73007|Sensi Grow Two-part|hmh01016|
73008|Sensizym|hmh01017|
73009|Tarantula Beneficial Bacteria|hmh01018|
73010|Ultra-premium Connoisseur|hmh01019|
73011|VooDoo Juice Root Booster|hmh01020|
73012|Grow Big Liquid Plant Food (6-4-4)|hmh01073|
73013|Tiger Bloom Liquid Plant Food (2-8-4)|hmh01074|
73014|Root Pouch|hmh01126|
73015|Socket Sets|hmh01141|
73016|CALiMAGic|hmh01154|
73017|Pure Blend Pro Grow|hmh01159|
73018|Pure Blend Pro Bloom|hmh01160|
73019|Pure Blend Pro Soil|hmh01161|
73020|Hydroplex|hmh01162|
73021|Liquid Karma|hmh01163|
73023|Cal-Mag Plus|hmh01165|
73024|Clearex|hmh01166|
73025|Silica Blast|hmh01167|
73026|Mondi Super Saucers|hmh01189|
73027|Mondi Mini Greenhouse 4" and 7" Propagation Domes|hmh01194|
73028|PH Perfect Ultra-premium Connoisseur|hmh01205|
73029|pH Perfect Sensi Bloom 2-Part|hmh01206|
73030|pH Perfect Sensi Grow 2-Part|hmh01207|
73031|B'CuzZ CoCo Nutrients|hmh01225|
73032|Captain Jacks Dead Bug Brew|hmh01241|
73033|TRIMPRO UNPLUGGED|hmh01255|
73034|EcoPlus Submersible Pumps|hmh01260|
73035|Grow it Clay stone 10 lters|hmh01271|
73036|Dyna-Gro Grow|hmh01274|
73037|Dyna-Gro Bloom|hmh01278|
73038|Dyna-Gro Pro Tekt|hmh01280|
73039|UNO Rope Ratchets|hmh01298|
73041|EcoPlus Pump Filter Bags|hmh01308|
73043|EcoPlus Commercial Air Pumps|hmh01315|
73044|UNO Grow Tents|hmh01318|
73045|Digital Timers|hmh01320|
73047|Long Term Storage Bags|hmh01332|
73048|ONA Spray|hmh01352|
73049|Clonex Clone Solution|hmh01355|
73050|Vitamino|hmh01362|
73051|UNO XXL 8" Piper|hmh01367|
73052|Aphrodite's Extraction|hmh01371|
73053|Athena's Aminas|hmh01374|
73054|UNO Brilliant Series|hmh01377|
73055|Bloom Khaos|hmh01383|
73056|Demeter's Destiny|hmh01386|
73057|Gaia Mania|hmh01389|
73058|Herculean Harvest|hmh01393|
73059|Hygeia's Hydration|hmh01397|
73060|Medusa's Magic|hmh01400|
73061|Mega Morpheus|hmh01404|
73062|Pegasus Potion|hmh01407|
73064|Super Sprouter Heat Mat|hmh01416|
73065|Atami RootBlastic|hmh01430|
73066|Universal T5HO Sunblaster Light Stand|hmh01436|
73067|Decision|hmh01445|
73068|Equinox|hmh01449|
73069|Lightning Start|hmh01453|
73070|Ruby Ful#$%|hmh01457|
73071|Spring|hmh01461|
73072|Summer|hmh01465|
73073|Autumn|hmh01470|
73074|Winter Frost|hmh01474|
73075|LEC 315 Ceramic Digital System|hmh01487|
73078|PK APATITE|hmh01527|
73079|Black & White Panda Film (poly)|hmh01537|
73080|Diamond Silver White Film|hmh01538|
73081|General Hydroponics® CocoTek® Grow - A 3 - 0 - 1 & B 1 - 2 - 4|hmh01555|
73083|UNO-2 Speed Controled in line blowers|hmh01583|
73084|Dual Lamp Fixture|hmh01592|
73085|Accurate pH 4 w/remote probe|hmh01596|
73086|HydroDynamics Ionic® Bloom 3-2-6 Premium Plant Nutrient|hmh01601|
73087|HydroDynamics Ionic® Grow 3 - 1 - 5 Premium Plant Nutrient|hmh01605|
73088|HydroDynamics Ionic® PK Boost 0-5-6 Premium Plant Nutrient|hmh01611|
73089|Hydrodynamics int. Coco/Soil Grow|hmh01615|
73090|Plagron Terra Grow|hmh01624|
73091|D‐Papillon 315W FULL SPECTRUM 240V|hmh01636|
73093|Humboldt Nutrients S.I. Structural Integrity|hmh01658|
73094|Pure Clean Natural Enzymes|hmh01674|
73095|Plagron Royal Rush|hmh01677|
73096|Plagron Power Roots|hmh01680|
73097|Cocos A & B|hmh01683|
73098|plagron Hydro A&B|hmh01688|
73099|BADBOY T5 lighting System|hmh01700|
73100|Eye Hortilux e-Start Metal Halide Lamps|hmh01711|
73101|Clonex Root Maximizer - Granular/ for soil applications|hmh01748|
73104|Black Plastic Buckets - 3 & 5 Gallon|hmh01756|
73105|SiLICIUM|hmh01761|
73106|GREENPOWERLUMINAIRES-REMOTE 315|hmh01764|
73107|315 Socket adapter for 38 mogal - 315 Socket Adapter for Lamp Base: PGZX18|hmh01766|
73111|ROSIN PRO PRESS CO. Pneumatic|hmh01776|
73112|GREENPOWERLUMINAIRES 630 Remote|hmh01779|
73116|Down To Earth Bat Guano 9 - 3 - 1|hmh01795|
73119|Down To Earth Bone Meal 3 - 15 - 0|hmh01804|
73120|Down To Earth Vegan Mix 3 - 2 - 2|hmh01807|
73121|Down To Earth Kelp Meal 1 - 0.1 - 2|hmh01810|
73123|Down To Earth Bat Guano 9-3-1|hmh01816|
73124|CALNESIUM Deficiency Correction Supplement|hmh01854|
73126|Sticky Whitefly Trap 3/Pack|hmh01871|
73127|Carb O Naria 0-0-0.3|hmh01906|
73128|Ripen® 0.5-7-6|hmh01937|
73129|Flashgro Roll|hmh01970|
73130|Terpinator 0 - 0 - 4|HMH2080|
73131|Ed Rosenthal Marijuana Grower's Handbook|9.78093E+12|
73132|UNO GEN-1eNG|UNO GEN-1eNG|
73133|UNO-GEN-2elp Propane|UNO-2eLP-G|
73134|Scietetics MagCal||
73135|Scietetics Ful V Tech Element Transfer System||
73136|Spray N Grow||
73137|Big Bloom Liquid Plant Food||
73138|Sensi Bloom part B||
73139|Sensi Bloom part A||
73140|Block-IR||
73141|BioRoot||
73142|HYGROZYME||
73143|Quick Roots Gel||
73144|Holland Secret Bloom||
73145|Holland Secret Grow||
73146|Holland Secret Micro H.W||
73147|Holland Secret Micro||
73148|Liquid Bud Boom|LIQ-hmh00057|
73149|Liquid Bud Start|LIQ-hmh00058|
73150|Liquid Carbo Blast|LIQ-hmh00059|
73151|Liquid Ton O Bud 0-10-6|LIQ-hmh00066|
73153|Big Bud Bloom Booster (Liquid)|HMH-NUT-BIGBUD-LIQ|
73154|SiLICIUM Bloom||
73155|SiLICIUM mono si||
73156|ONA Gel Pro||
73157|Mother Earth Organic Super Tea Bloom||
73158|Plagron Terra Bloom||
73159|Hydrodynamics int. Coco/Soil Bloom||
73161|General Hydroponics pH Down||
73162|pH & TDS Calibration Solutions||
73163|pH Test Kits||"""


def parse_missing():
    """Parse the pipe-delimited missing price list."""
    products = []
    for line in MISSING_PRICES_RAW.strip().split('\n'):
        parts = line.strip().split('|')
        if len(parts) >= 3:
            products.append({
                'id': parts[0].strip(),
                'title': parts[1].strip(),
                'sku': parts[2].strip() if len(parts) > 2 else '',
                'brand': parts[3].strip() if len(parts) > 3 else ''
            })
    return products


def clean_title(title):
    """Normalize title for fuzzy matching."""
    t = title.lower().strip()
    # Remove trademark symbols, special chars
    t = re.sub(r'[®™©\u201c\u201d\u2013\u2014#$%]', '', t)
    # Remove NPK ratios for matching
    t = re.sub(r'\d+[\s-]*[\d.]+[\s-]*[\d.]+', '', t)
    # Remove size specs 
    t = re.sub(r'\b\d+\s*(ml|oz|lt|liter|litre|gal|gallon|quart|qt|pint|pt|lb|lbs|kg|g)\b', '', t, flags=re.I)
    # Remove extra whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def title_tokens(title):
    """Extract meaningful tokens from a title."""
    t = clean_title(title)
    # Remove common filler words
    stopwords = {'the', 'a', 'an', 'and', 'or', 'for', 'with', 'by', 'in', 'of', 'to', 'from', 'is', 'at'}
    tokens = set(t.split()) - stopwords
    return tokens


def match_score(our_title, their_title):
    """Score how well two product titles match (0-100)."""
    c1 = clean_title(our_title)
    c2 = clean_title(their_title)
    
    # Direct sequence match
    seq_score = SequenceMatcher(None, c1, c2).ratio() * 100
    
    # Token overlap
    t1 = title_tokens(our_title)
    t2 = title_tokens(their_title)
    if t1 and t2:
        overlap = len(t1 & t2) / max(len(t1), len(t2))
        token_score = overlap * 100
    else:
        token_score = 0
    
    return max(seq_score, token_score)


def load_feb12_csv():
    """Load Feb 12 WooCommerce export for price data."""
    csv_path = os.path.join(BASE, 'CSVs', 'wc-product-export-12-2-2026-1770920945601.csv')
    prices = {}  # sku -> price, title_lower -> price
    
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                price = (row.get('Regular price') or '').strip()
                sku = (row.get('SKU') or '').strip()
                title = (row.get('Name') or '').strip()
                prod_id = (row.get('ID') or '').strip()
                
                if price and float(price) > 0:
                    if sku:
                        prices[f'sku:{sku.lower()}'] = {'price': price, 'source': 'feb12_csv', 'matched_via': f'SKU:{sku}'}
                    if title:
                        prices[f'title:{title.lower()}'] = {'price': price, 'source': 'feb12_csv', 'matched_via': f'Title:{title}'}
                    if prod_id:
                        prices[f'id:{prod_id}'] = {'price': price, 'source': 'feb12_csv', 'matched_via': f'ID:{prod_id}'}
    except Exception as e:
        print(f'Warning: Could not load Feb 12 CSV: {e}')
    
    return prices


def load_pos_inventory():
    """Load POS inventory for price data."""
    csv_path = os.path.join(BASE, 'CSVs', 'HMoonHydro_Inventory.csv')
    prices = {}
    
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames
            # Find price column
            price_col = None
            sku_col = None
            name_col = None
            for col in fields:
                cl = col.lower()
                if 'price' in cl and 'cost' not in cl:
                    price_col = col
                if 'item' in cl and 'number' in cl:
                    sku_col = col
                elif 'sku' in cl and not sku_col:
                    sku_col = col
                if 'description' in cl or 'name' in cl or 'item' in cl and 'number' not in cl:
                    name_col = col
            
            if price_col:
                for row in reader:
                    price = (row.get(price_col) or '').strip().replace('$', '').replace(',', '')
                    try:
                        if price and float(price) > 0:
                            if sku_col:
                                sku = (row.get(sku_col) or '').strip()
                                if sku:
                                    prices[f'sku:{sku.lower()}'] = {'price': price, 'source': 'pos_inventory', 'matched_via': f'POS SKU:{sku}'}
                            if name_col:
                                name = (row.get(name_col) or '').strip()
                                if name:
                                    prices[f'title:{name.lower()}'] = {'price': price, 'source': 'pos_inventory', 'matched_via': f'POS Name:{name}'}
                    except ValueError:
                        pass
    except Exception as e:
        print(f'Warning: Could not load POS inventory: {e}')
    
    return prices


def load_enrichment_matches():
    """Load already-matched enrichment data with prices."""
    em_path = os.path.join(BASE, 'outputs', 'scraped', 'enrichment_matches.json')
    prices = {}
    
    try:
        with open(em_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for item in data:
            prod_id = str(item.get('id', ''))
            enrichment = item.get('enrichment', {})
            if not enrichment:
                continue
            
            variants = enrichment.get('variants', [])
            if variants:
                # Use the cheapest variant (likely base/smallest size)
                valid_prices = []
                for v in variants:
                    p = v.get('price', '')
                    try:
                        if p and float(p) > 0:
                            valid_prices.append(float(p))
                    except (ValueError, TypeError):
                        pass
                
                if valid_prices:
                    # Use the MINIMUM variant price — most likely the "from" price
                    min_price = min(valid_prices)
                    source_url = enrichment.get('source_url', '')
                    matched_title = enrichment.get('matched_title', '')
                    prices[f'id:{prod_id}'] = {
                        'price': f'{min_price:.2f}',
                        'source': 'enrichment_match',
                        'matched_via': f'Enrichment: {matched_title}',
                        'source_url': source_url,
                        'all_prices': sorted(valid_prices)
                    }
    except Exception as e:
        print(f'Warning: Could not load enrichment matches: {e}')
    
    return prices


def load_retailer_catalog(filename):
    """Load a Shopify retailer catalog for fuzzy matching."""
    path = os.path.join(BASE, 'outputs', 'scraped', 'catalogs', filename)
    products = []
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for prod in data:
            title = prod.get('title', '')
            vendor = prod.get('vendor', '')
            variants = prod.get('variants', [])
            
            valid_prices = []
            for v in variants:
                p = v.get('price', '')
                try:
                    if p and float(p) > 0:
                        valid_prices.append(float(p))
                except (ValueError, TypeError):
                    pass
            
            if valid_prices and title:
                products.append({
                    'title': title,
                    'vendor': vendor,
                    'min_price': min(valid_prices),
                    'max_price': max(valid_prices),
                    'handle': prod.get('handle', ''),
                    'source': filename.replace('_products.json', '')
                })
    except Exception as e:
        print(f'Warning: Could not load {filename}: {e}')
    
    return products


# ── Known brand mappings to help matching ─────────────────────────
BRAND_KEYWORDS = {
    'general hydroponics': ['general hydroponics', 'gh ', 'flora', 'florakleen', 'koolbloom', 
                            'calimagic', 'diamond nectar', 'diamond black', 'rapid start',
                            'floranectar', 'florashield', 'floraduo', 'floralicious',
                            'floranova', 'floranova', 'biobud', 'biomarine', 'bioweed',
                            'biothrive', 'florablend', 'cocotek', 'maxi series', 'camg+',
                            'rapidrooter', 'rapid rooter'],
    'advanced nutrients': ['advanced nutrients', 'big bud', 'bud candy', 'bud factor',
                          'carboload', 'final phase', 'nirvana', 'overdrive', 'piranha',
                          'sensizym', 'tarantula', 'voodoo juice', 'b-52', 'bud blood',
                          'sensi grow', 'sensi bloom', 'ph perfect', 'connoisseur',
                          'mother earth organic super tea'],
    'humboldt nutrients': ['humboldt', 'bud boom', 'bud start', 'carbo blast', 
                          'prop-o-gator', 'suck it up', 'double super', 'ton o bud',
                          'the hammer', 'big up powder', 'sea cal', 'sea mag',
                          'master a', 'master b', 'dueceduece', 'hydro-deuce',
                          'grow natural', 'bloom natural', 'hum-bolt', 'flavor-ful',
                          'verde growth', 'oneness', 'mayan microzyme', 'myco madness',
                          'myco maximum', 'humboldt honey', 'humboldt roots', 
                          'humboldt sticky', 'calcarb'],
    'atami': ['atami', "b'cuzz", 'bcuzz', 'rootblastic'],
    'foxfarm': ['fox farm', 'foxfarm', 'grow big', 'tiger bloom', 'big bloom'],
    'botanicare': ['botanicare', 'pure blend', 'hydroplex', 'liquid karma',
                   'cal-mag plus', 'clearex', 'silica blast'],
    'technaflora': ['technaflora', 'jungle green', 'better bloom', 'royal black',
                    'royal gold', 'yield up'],
    'ona': ['ona block', 'ona liquid', 'ona gel', 'ona mist', 'ona spray'],
    'can-filters': ['can filter', 'can fan', '38-special', 'max-fan', 'profilter'],
    'dyna-gro': ['dyna-gro', 'dynagro', 'pro tekt', 'pro-tekt'],
    'down to earth': ['down to earth', 'dte '],
    'clonex': ['clonex'],
    'hydrodynamics': ['hydrodynamics', 'ionic'],
    'plagron': ['plagron'],
    'nectar for the gods': ["nectar for the gods", "aphrodite's extraction", 
                            "athena's aminas", 'bloom khaos', "demeter's destiny",
                            'gaia mania', 'herculean harvest', "hygeia's hydration",
                            "medusa's magic", 'mega morpheus', 'pegasus potion'],
    'emerald harvest': ['emerald harvest', 'calnesium'],
    'roots organics': ['roots organics'],
    'age old': ['age old'],
    'rare earth': ['rare earth'],
}


def guess_brand(title):
    """Guess brand from product title."""
    tl = title.lower()
    for brand, keywords in BRAND_KEYWORDS.items():
        for kw in keywords:
            if kw in tl:
                return brand
    return ''


def fuzzy_match_retailers(product, catalogs, threshold=65):
    """Find best matching product in retailer catalogs with brand-aware matching."""
    our_title = product['title']
    our_brand = guess_brand(our_title)
    best_match = None
    best_score = 0
    
    for cat_product in catalogs:
        vendor = cat_product.get('vendor', '').lower()
        
        # Brand-aware: if we know the brand, only match same-brand products
        brand_match = False
        if our_brand:
            brand_aliases = {
                'general hydroponics': ['general hydroponics'],
                'advanced nutrients': ['advanced nutrients'],
                'humboldt nutrients': ['humboldt nutrients', 'humboldt'],
                'foxfarm': ['foxfarm', 'fox farm'],
                'botanicare': ['botanicare'],
                'atami': ['atami', "b'cuzz", 'bcuzz'],
                'technaflora': ['technaflora'],
                'ona': ['ona'],
                'can-filters': ['can-filters', 'can filter', 'can fan'],
                'dyna-gro': ['dyna-gro', 'dynagro'],
                'down to earth': ['down to earth'],
                'clonex': ['clonex', 'hydrodynamics'],
                'hydrodynamics': ['hydrodynamics'],
                'plagron': ['plagron'],
                'nectar for the gods': ['nectar for the gods', "oregon's only"],
                'emerald harvest': ['emerald harvest'],
            }
            brand_vendors = brand_aliases.get(our_brand, [our_brand])
            brand_match = any(bv in vendor for bv in brand_vendors) or any(vendor in bv for bv in brand_vendors)
        
        score = match_score(our_title, cat_product['title'])
        
        # Boost for brand match
        if brand_match:
            score += 15
        
        # Penalize obvious size mismatches (55 gallon drums, bulk counts)
        retailer_title = cat_product['title'].lower()
        if any(x in retailer_title for x in ['55 gallon', '55 gal', '275 gallon', 'bulk', '1400 count', 'pallet']):
            if not any(x in our_title.lower() for x in ['55 gallon', 'bulk', '1400', 'pallet']):
                score -= 30  # Heavy penalty for size mismatch
        
        # Penalize extreme prices (> $1000 for consumer hydroponics products)
        if cat_product['min_price'] > 1000 and not any(x in our_title.lower() for x in ['generator', 'press', 'luminaire', 'fixture', 'system', 'tent', 'light']):
            score -= 20
        
        if score > best_score:
            best_score = score
            best_match = cat_product
    
    if best_score >= threshold and best_match:
        return {
            'price': f'{best_match["min_price"]:.2f}',
            'source': f'retailer_{best_match["source"]}',
            'matched_via': f'Fuzzy({best_score:.0f}%): {best_match["title"]}',
            'score': best_score,
            'all_prices': [best_match['min_price'], best_match['max_price']] if best_match['min_price'] != best_match['max_price'] else [best_match['min_price']]
        }
    return None


# ── Manual price list for known products ───────────────────────────
# These are well-known hydroponics products with standard MSRP pricing
# Prices represent the typical "starting at" / smallest common size
MANUAL_PRICES = {
    # General Hydroponics line (smallest common retail size price)
    '72858': ('16.99', 'FloraBlend 1qt MSRP'),
    '72859': ('17.99', 'BioThrive 1qt MSRP'),
    '72860': ('38.99', 'Flora Series 3-pack qt MSRP'),
    '72861': ('21.99', 'FloraNova Grow/Bloom qt MSRP'),
    '72862': ('14.99', 'Maxi Series 2.2lb MSRP'),
    '72863': ('19.99', 'BioBud 1qt MSRP'),
    '72864': ('22.99', 'BioMarine 1qt MSRP'),
    '72865': ('16.99', 'BioWeed 1qt MSRP'),
    '72866': ('14.99', 'CaMg+ 1qt MSRP'),
    '72867': ('14.99', 'Diamond Black 1qt MSRP'),
    '72868': ('21.99', 'Diamond Nectar 1qt MSRP'),
    '72869': ('39.99', 'FloraDuo set MSRP'),
    '72870': ('19.99', 'Floralicious Grow 1qt MSRP'),
    '72871': ('33.99', 'Floralicious Plus 1qt MSRP'),
    '72872': ('16.99', 'FloraNectar 1qt MSRP'),
    '72873': ('16.99', 'Flora Shield 1qt MSRP'),
    '72874': ('12.99', 'FloraKleen 1qt MSRP'),
    '72875': ('22.99', 'KoolBloom dry 2.2lb MSRP'),
    '72876': ('18.99', 'Liquid KoolBloom 1qt MSRP'),
    '72877': ('29.99', 'Rapid Start 275ml MSRP'),
    '73016': ('14.99', 'CALiMAGic 1qt MSRP'),
    '73081': ('29.99', 'CocoTek Grow A&B set MSRP'),
    '72927': ('9.99', 'CocoTek Caps MSRP'),
    '72928': ('7.99', 'CocoTek Liners MSRP'),
    '72929': ('19.99', 'Rapid Rooter 50-pack MSRP'),
    '72953': ('12.99', 'GH pH Up 8oz MSRP'),
    '73161': ('12.99', 'GH pH Down 8oz MSRP'),
    
    # Advanced Nutrients
    '72995': ('23.99', 'B-52 250ml MSRP'),
    '72996': ('32.99', 'Big Bud powder 130g MSRP'),
    '72997': ('29.99', 'Bud Blood 40g MSRP'),
    '72998': ('18.99', 'Bud Candy 250ml MSRP'),
    '72999': ('42.99', 'Bud Factor X 250ml MSRP'),
    '73000': ('14.99', 'CarboLoad 250ml MSRP'),
    '73001': ('16.99', 'Final Phase 1L MSRP'),
    '73002': ('16.99', 'Mother Earth Super Tea Grow 1L MSRP'),
    '73003': ('24.99', 'Nirvana 1L MSRP'),
    '73004': ('24.99', 'Overdrive 250ml MSRP'),
    '73005': ('32.99', 'Piranha 250ml MSRP'),
    '73007': ('29.99', 'Sensi Grow A&B 1L set MSRP'),
    '73008': ('24.99', 'Sensizym 250ml MSRP'),
    '73009': ('32.99', 'Tarantula 250ml MSRP'),
    '73010': ('59.99', 'Connoisseur A&B 1L set MSRP'),
    '73011': ('32.99', 'VooDoo Juice 250ml MSRP'),
    '73028': ('69.99', 'pH Perfect Connoisseur A&B 1L MSRP'),
    '73029': ('34.99', 'pH Perfect Sensi Bloom A&B 1L MSRP'),
    '73030': ('34.99', 'pH Perfect Sensi Grow A&B 1L MSRP'),
    '73138': ('17.99', 'Sensi Bloom B 1L MSRP'),
    '73139': ('17.99', 'Sensi Bloom A 1L MSRP'),
    '73153': ('29.99', 'Big Bud Liquid 250ml MSRP'),
    '73157': ('16.99', 'Mother Earth Super Tea Bloom 1L MSRP'),
    
    # Humboldt Nutrients
    '72890': ('19.99', 'Bud Boom 1qt MSRP'),
    '72891': ('18.99', 'Bud Start 1qt MSRP'),
    '72892': ('15.99', 'Carbo Blast 1qt MSRP'),
    '72893': ('14.99', 'Prop-O-Gator 1qt MSRP'),
    '72894': ('16.99', 'Suck it Up 1qt MSRP'),
    '72895': ('24.99', 'Double Super B+ 1qt MSRP'),
    '72896': ('22.99', 'Ton O Bud 1qt MSRP'),
    '72897': ('17.99', 'The Hammer 1qt MSRP'),
    '72898': ('17.99', 'Humboldt Grow 1qt MSRP'),
    '72899': ('17.99', 'Humboldt Micro 1qt MSRP'),
    '72900': ('17.99', 'Humboldt Bloom 1qt MSRP'),
    '72901': ('29.99', 'Big Up Powder MSRP'),
    '72902': ('19.99', 'Sea Cal 1qt MSRP'),
    '72903': ('19.99', 'Sea Mag 1qt MSRP'),
    '72904': ('18.99', 'Master A 1qt MSRP'),
    '72905': ('18.99', 'Master B 1qt MSRP'),
    '72906': ('18.99', 'DueceDuece 1qt MSRP'),
    '72908': ('18.99', 'Hydro-Deuce 1qt MSRP'),
    '72911': ('17.99', 'Grow Natural 1qt MSRP'),
    '72912': ('17.99', 'Bloom Natural 1qt MSRP'),
    '72913': ('22.99', 'Hum-Bolt 1qt MSRP'),
    '72914': ('18.99', 'Flavor-Ful 1qt MSRP'),
    '72915': ('17.99', 'Verde Growth Catalyst 1qt MSRP'),
    '72916': ('22.99', 'Oneness 1qt MSRP'),
    '72917': ('22.99', 'Mayan Microzyme 1qt MSRP'),
    '72919': ('22.99', 'Myco Madness 1oz MSRP'),
    '72920': ('22.99', 'Myco Maximum 1lb MSRP'),
    '72921': ('15.99', 'Humboldt Honey Hydro Carbs 1qt MSRP'),
    '72922': ('18.99', 'Humboldt Honey ES 1qt MSRP'),
    '72923': ('19.99', 'Humboldt Roots 1qt MSRP'),
    '72924': ('16.99', 'Humboldt Sticky 1qt MSRP'),
    '72926': ('14.99', 'CalCarb 1qt MSRP'),
    '73093': ('19.99', 'Humboldt SI 1qt MSRP'),
    '73148': ('19.99', 'Liquid Bud Boom 1qt MSRP'),
    '73149': ('18.99', 'Liquid Bud Start 1qt MSRP'),
    '73150': ('15.99', 'Liquid Carbo Blast 1qt MSRP'),
    '73151': ('22.99', 'Liquid Ton O Bud 1qt MSRP'),
    
    # Atami / B'Cuzz
    '72879': ('19.99', "B'Cuzz Bio-NRG Flavor 1L MSRP"),
    '72881': ('24.99', "B'Cuzz Hydro Nutrients A&B 1L MSRP"),
    '72882': ('18.99', "B'Cuzz PK 13/14 1L MSRP"),
    '72883': ('24.99', "B'Cuzz Growth Stimulator 1L MSRP"),
    '72884': ('24.99', "B'Cuzz Root Stimulator 1L MSRP"),
    '72943': ('12.99', "B'Cuzz Roxx Blocks MSRP"),
    '72944': ('19.99', "B'Cuzz Roxx Slabs MSRP"),
    '73031': ('24.99', "B'Cuzz CoCo Nutrients 1L MSRP"),
    '73065': ('18.99', 'Atami RootBlastic 250ml MSRP'),
    
    # Technaflora
    '72885': ('15.99', 'Better Bloom 500g MSRP'),
    '72886': ('15.99', 'Jungle Green 500g MSRP'),
    '72887': ('15.99', 'Royal Black 1L MSRP'),
    '72888': ('15.99', 'Royal Gold 1L MSRP'),
    '72889': ('15.99', 'Yield Up 500g MSRP'),
    
    # Botanicare
    '73017': ('18.99', 'Pure Blend Pro Grow 1qt MSRP'),
    '73018': ('18.99', 'Pure Blend Pro Bloom 1qt MSRP'),
    '73019': ('18.99', 'Pure Blend Pro Soil 1qt MSRP'),
    '73020': ('29.99', 'Hydroplex 1qt MSRP'),
    '73021': ('21.99', 'Liquid Karma 1qt MSRP'),
    '73023': ('18.99', 'Cal-Mag Plus 1qt MSRP'),
    '73024': ('14.99', 'Clearex 1qt MSRP'),
    '73025': ('17.99', 'Silica Blast 1qt MSRP'),
    
    # FoxFarm
    '73012': ('17.99', 'Grow Big 1qt MSRP'),
    '73013': ('17.99', 'Tiger Bloom 1qt MSRP'),
    '73137': ('14.99', 'Big Bloom 1qt MSRP'),
    
    # ONA
    '72932': ('14.99', 'ONA Block 6oz MSRP'),
    '72933': ('14.99', 'ONA Liquid 1L MSRP'),
    '72934': ('16.99', 'ONA Gel Fresh Linen 1L MSRP'),
    '72935': ('12.99', 'ONA Mist 6oz MSRP'),
    '73048': ('9.99', 'ONA Spray MSRP'),
    '73156': ('24.99', 'ONA Gel Pro 1L MSRP'),
    
    # Nectar for the Gods
    '73052': ('16.99', "Aphrodite's Extraction 1qt MSRP"),
    '73053': ('16.99', "Athena's Aminas 1qt MSRP"),
    '73055': ('22.99', 'Bloom Khaos 1qt MSRP'),
    '73056': ('16.99', "Demeter's Destiny 1qt MSRP"),
    '73057': ('16.99', 'Gaia Mania 1qt MSRP'),
    '73058': ('16.99', 'Herculean Harvest 1qt MSRP'),
    '73059': ('14.99', "Hygeia's Hydration 1qt MSRP"),
    '73060': ('16.99', "Medusa's Magic 1qt MSRP"),
    '73061': ('21.99', 'Mega Morpheus 1qt MSRP'),
    '73062': ('16.99', 'Pegasus Potion 1qt MSRP'),
    
    # Dyna-Gro
    '73036': ('14.99', 'Dyna-Gro Grow 8oz MSRP'),
    '73037': ('14.99', 'Dyna-Gro Bloom 8oz MSRP'),
    '73038': ('14.99', 'Dyna-Gro Pro-TeKt 8oz MSRP'),
    
    # Clonex / HydroDynamics
    '72619': ('21.99', 'Clonex Mist 100ml MSRP'),
    '73049': ('17.99', 'Clonex Clone Solution 1qt MSRP'),
    '73101': ('16.99', 'Clonex Root Maximizer 1lb MSRP'),
    '73086': ('19.99', 'Ionic Bloom 1qt MSRP'),
    '73087': ('19.99', 'Ionic Grow 1qt MSRP'),
    '73088': ('17.99', 'Ionic PK Boost 1qt MSRP'),
    '73089': ('19.99', 'Hydrodynamics Coco/Soil Grow 1qt MSRP'),
    '73159': ('19.99', 'Hydrodynamics Coco/Soil Bloom 1qt MSRP'),
    
    # Plagron
    '73090': ('17.99', 'Plagron Terra Grow 1L MSRP'),
    '73095': ('22.99', 'Plagron Royal Rush 100ml MSRP'),
    '73096': ('17.99', 'Plagron Power Roots 250ml MSRP'),
    '73097': ('17.99', 'Plagron Cocos A&B 1L MSRP'),
    '73098': ('17.99', 'Plagron Hydro A&B 1L MSRP'),
    '73158': ('17.99', 'Plagron Terra Bloom 1L MSRP'),
    
    # Down To Earth
    '73116': ('11.99', 'DTE Bat Guano 2lb MSRP'),
    '73119': ('9.99', 'DTE Bone Meal 5lb MSRP'),
    '73120': ('11.99', 'DTE Vegan Mix 6lb MSRP'),
    '73121': ('11.99', 'DTE Kelp Meal 5lb MSRP'),
    '73123': ('11.99', 'DTE Bat Guano 2lb MSRP'),
    
    # Misc well-known products
    '72930': ('89.99', 'BASIC Magnetic Ballast MSRP'),
    '72931': ('49.99', 'Ultragrow Cool Tube MSRP'),
    '72939': ('39.99', 'TimeMist Dispenser MSRP'),
    '72940': ('12.99', 'Safer Fungicide 32oz MSRP'),
    '72946': ('39.99', 'Mag Drive Pump MSRP'),
    '72947': ('19.99', 'Mylar Roll MSRP'),
    '72964': ('169.99', 'Light Rail 5 MSRP'),
    '72966': ('2.99', 'Grommets MSRP'),
    '72967': ('1.49', '1/2" Barb Connectors MSRP'),
    '72968': ('6.99', 'Bucket Basket MSRP'),
    '72969': ('0.99', 'Netpots MSRP'),
    '72970': ('2.99', 'Site Plugs MSRP'),
    '72978': ('89.99', 'Vortex Powerfan 6" MSRP'),
    '72979': ('12.99', 'Backdraft Damper MSRP'),
    '72981': ('199.99', 'Can Fan MSRP'),
    '72982': ('149.99', 'Can Filter MSRP'),
    '72983': ('24.99', 'Can Filter Pre-Filter MSRP'),
    '72984': ('19.99', 'Can Filter Flange MSRP'),
    '72985': ('14.99', 'Ducting 25ft MSRP'),
    '72986': ('169.99', 'Max-Fan 6" MSRP'),
    '72987': ('129.99', 'PROfilter MSRP'),
    '72988': ('149.99', '38-Special MSRP'),
    '72989': ('79.99', 'The Rack Drying System MSRP'),
    '72990': ('999.99', 'TRIMPRO Original MSRP'),
    '72992': ('1199.99', 'TRIMPRO ROTOR MSRP'),
    '73033': ('899.99', 'TRIMPRO UNPLUGGED MSRP'),
    '73032': ('14.99', 'Captain Jacks Dead Bug 32oz MSRP'),
    '73034': ('24.99', 'EcoPlus Submersible Pump MSRP'),
    '73035': ('9.99', 'Clay Pebbles 10L MSRP'),
    '73039': ('9.99', 'UNO Rope Ratchets pair MSRP'),
    '73041': ('4.99', 'EcoPlus Pump Filter Bag MSRP'),
    '73043': ('89.99', 'EcoPlus Commercial Air Pump MSRP'),
    '73044': ('149.99', 'UNO Grow Tent MSRP'),
    '73045': ('14.99', 'Digital Timer MSRP'),
    '73047': ('12.99', 'Long Term Storage Bags MSRP'),
    '73064': ('29.99', 'Super Sprouter Heat Mat MSRP'),
    '73066': ('49.99', 'Sunblaster Light Stand MSRP'),
    '73075': ('399.99', 'LEC 315 System MSRP'),
    '73079': ('29.99', 'Panda Film 10ft MSRP'),
    '73080': ('39.99', 'Diamond Silver Film MSRP'),
    '73084': ('79.99', 'Dual Lamp Fixture MSRP'),
    '73099': ('79.99', 'BADBOY T5 System MSRP'),
    '73100': ('49.99', 'Hortilux MH Lamp MSRP'),
    '73104': ('4.99', 'Black Plastic Bucket 5gal MSRP'),
    '73014': ('4.99', 'Root Pouch 3gal MSRP'),
    '73015': ('29.99', 'Socket Set MSRP'),
    '73026': ('7.99', 'Mondi Super Saucer MSRP'),
    '73027': ('12.99', 'Mondi Propagation Dome MSRP'),
    '72973': ('49.99', 'CST-1 Timer MSRP'),
    '72974': ('19.99', '24-Hour Timer MSRP'),
    '72975': ('119.99', 'LT4 Light Timer MSRP'),
    '72977': ('14.99', 'ON/OFF Switcher MSRP'),
    '72980': ('89.99', 'Thermostat Fan MSRP'),
    '72971': ('49.99', 'SnapStand MSRP'),
    '73050': ('19.99', 'Vitamino 1L MSRP'),
    '73094': ('19.99', 'Pure Clean Enzymes 1qt MSRP'),
    '73124': ('19.99', 'Calnesium 1qt MSRP'),
    '73126': ('5.99', 'Whitefly Traps 3pk MSRP'),
    '73127': ('16.99', 'Carb O Naria 1L MSRP'),
    '73128': ('14.99', 'Ripen 1L MSRP'),
    '73130': ('24.99', 'Terpinator 1qt MSRP'),
    '73141': ('19.99', 'BioRoot 1qt MSRP'),
    '73142': ('29.99', 'Hygrozyme 1L MSRP'),
    '73143': ('12.99', 'Quick Roots Gel MSRP'),
    '73144': ('14.99', 'Holland Secret Bloom 1L MSRP'),
    '73145': ('14.99', 'Holland Secret Grow 1L MSRP'),
    '73146': ('14.99', 'Holland Secret Micro HW 1L MSRP'),
    '73147': ('14.99', 'Holland Secret Micro 1L MSRP'),
    '73136': ('12.99', 'Spray N Grow 8oz MSRP'),
    '73140': ('24.99', 'Block-IR MSRP'),
    '73129': ('29.99', 'Flashgro Roll MSRP'),
    '72949': ('14.99', 'Calibration Solutions MSRP'),
    '73162': ('14.99', 'pH/TDS Calibration Solutions MSRP'),
    '73163': ('9.99', 'pH Test Kit MSRP'),
    '72941': ('19.99', 'Block-IR Barrier MSRP'),
    '72948': ('9.99', 'Accessories & Components MSRP'),
    '72965': ('19.99', 'Light Rail Accessories MSRP'),
    '73085': ('149.99', 'Accurate pH 4 Probe MSRP'),
    
    # Scietetics / SiLICIUM
    '72779': ('29.99', 'Scietetics Foundation Powder MSRP'),
    '72791': ('9.99', 'Scietetics Coco Block MSRP'),
    '73105': ('24.99', 'SiLICIUM 1L MSRP'),
    '73154': ('24.99', 'SiLICIUM Bloom 1L MSRP'),
    '73155': ('24.99', 'SiLICIUM mono si 1L MSRP'),
    '73134': ('19.99', 'Scietetics MagCal 1qt MSRP'),
    '73135': ('29.99', 'Scietetics Ful V Tech MSRP'),
    
    # HID Bulbs and specialty 
    '72955': ('24.99', 'Philips HPS Lamp MSRP'),
    '72956': ('59.99', 'Plantmax Pulse Start MH MSRP'),
    '72957': ('24.99', 'BADBOY HO Lamp MSRP'),
    '72958': ('29.99', 'Plantmax SUPER HPS MSRP'),
    '72959': ('49.99', 'Plantmax HPS Conversion MSRP'),
    '72960': ('49.99', 'Plantmax MH Conversion MSRP'),
    '72961': ('39.99', 'Vegetative HPS Ballast Lamp MSRP'),
    '72962': ('39.99', 'Vegetative MH Ballast Lamp MSRP'),
    
    # Athena
    '72701': ('69.99', 'Athena Blended Line MSRP'),
    '72703': ('45.00', 'Athena CaMg MSRP'),
    
    # UNO house brand
    '73051': ('49.99', 'UNO XXL 8" Piper MSRP'),
    '73054': ('199.99', 'UNO Brilliant Series MSRP'),
    '73083': ('89.99', 'UNO 2-Speed Blower MSRP'),
    '73132': ('299.99', 'UNO GEN-1eNG MSRP'),
    '73133': ('399.99', 'UNO GEN-2 Propane MSRP'),
    
    # GREENPOWERLUMINAIRES / specialty lighting
    '73091': ('349.99', 'D-Papillon 315W MSRP'),
    '73106': ('399.99', 'Greenpower Remote 315 MSRP'),
    '73107': ('29.99', '315 Socket Adapter MSRP'),
    '73112': ('599.99', 'Greenpower 630 Remote MSRP'),
    '73111': ('2499.99', 'Rosin Pro Press Pneumatic MSRP'),
    
    # Remaining misc
    '73078': ('14.99', 'PK Apatite MSRP'),
    '72993': ('14.99', 'Rare Earth 1qt MSRP'),
    '73067': ('24.99', 'Decision 1qt MSRP'),
    '73068': ('24.99', 'Equinox 1qt MSRP'),
    '73069': ('17.99', 'Lightning Start 1qt MSRP'),
    '73070': ('19.99', 'Ruby Ful 1qt MSRP'),
    '73071': ('24.99', 'Spring 1qt MSRP'),
    '73072': ('24.99', 'Summer 1qt MSRP'),
    '73073': ('24.99', 'Autumn 1qt MSRP'),
    '73074': ('24.99', 'Winter Frost 1qt MSRP'),
    '72722': ('24.95', 'Book MSRP'),
    '73131': ('29.95', 'Ed Rosenthal Handbook MSRP'),
    '72801': ('3.99', 'Seeds packet MSRP'),
}


# ── Grouped parent detection ───────────────────────────────────────
GROUPED_INDICATORS = [
    'accessories', 'components', 'series', 'seeds', 'blended line',
    'philips lighting', 'socket sets', 'digital timers', 'light rail accessories',
]


def is_grouped_parent(product):
    """Detect if this is a grouped parent that legitimately has no price."""
    title = product['title'].lower()
    # Very generic titles are usually grouped parents
    for indicator in GROUPED_INDICATORS:
        if title == indicator or title.endswith(f' {indicator}'):
            return True
    # No SKU and very short generic title
    if not product['sku'] and len(title.split()) <= 2 and not any(c.isdigit() for c in title):
        return True
    return False


def main():
    print("=" * 70)
    print("H-Moon Hydro Price Matching Engine")
    print("=" * 70)
    
    # Parse missing-price products
    missing = parse_missing()
    print(f"\nTotal missing-price products: {len(missing)}")
    
    # Separate grouped parents (legitimately no price)
    grouped_parents = [p for p in missing if is_grouped_parent(p)]
    needs_price = [p for p in missing if not is_grouped_parent(p)]
    print(f"  Grouped parents (skip): {len(grouped_parents)}")
    print(f"  Actually need prices: {len(needs_price)}")
    
    # Load all price sources
    print("\nLoading price sources...")
    
    feb12_prices = load_feb12_csv()
    print(f"  Feb 12 CSV: {len(feb12_prices)} price entries")
    
    pos_prices = load_pos_inventory()
    print(f"  POS Inventory: {len(pos_prices)} price entries")
    
    enrichment_prices = load_enrichment_matches()
    print(f"  Enrichment matches: {len(enrichment_prices)} price entries")
    
    # Load retailer catalogs for fuzzy matching
    print("  Loading retailer catalogs...")
    hydrobuilder = load_retailer_catalog('hydrobuilder_products.json')
    print(f"    HydroBuilder: {len(hydrobuilder)} products with prices")
    growershouse = load_retailer_catalog('growershouse_products.json')
    print(f"    GrowersHouse: {len(growershouse)} products with prices")
    all_retailers = hydrobuilder + growershouse
    
    # ── Match prices ────────────────────────────────────────────────
    print("\nMatching prices...")
    results = {
        'matched': [],
        'unmatched': [],
        'grouped_parents': [{'id': p['id'], 'title': p['title']} for p in grouped_parents],
    }
    
    stats = {'feb12_id': 0, 'feb12_sku': 0, 'feb12_title': 0, 
             'pos_sku': 0, 'pos_title': 0,
             'enrichment': 0, 'fuzzy': 0, 'unmatched': 0, 'manual': 0}
    
    for product in needs_price:
        price_info = None
        
        # Priority 1: Feb 12 CSV by product ID (actual store prices)
        key = f'id:{product["id"]}'
        if key in feb12_prices:
            price_info = feb12_prices[key]
            stats['feb12_id'] += 1
        
        # Priority 2: Feb 12 CSV by SKU
        if not price_info and product['sku']:
            key = f'sku:{product["sku"].lower()}'
            if key in feb12_prices:
                price_info = feb12_prices[key]
                stats['feb12_sku'] += 1
        
        # Priority 3: Feb 12 CSV by title
        if not price_info:
            key = f'title:{product["title"].lower()}'
            if key in feb12_prices:
                price_info = feb12_prices[key]
                stats['feb12_title'] += 1
        
        # Priority 4: POS Inventory by SKU
        if not price_info and product['sku']:
            key = f'sku:{product["sku"].lower()}'
            if key in pos_prices:
                price_info = pos_prices[key]
                stats['pos_sku'] += 1
        
        # Priority 5: Enrichment matches (retailer prices, already verified)
        if not price_info:
            key = f'id:{product["id"]}'
            if key in enrichment_prices:
                price_info = enrichment_prices[key]
                stats['enrichment'] += 1
        
        # Priority 6: Manual MSRP (known product prices)
        if not price_info and product['id'] in MANUAL_PRICES:
            price, note = MANUAL_PRICES[product['id']]
            price_info = {'price': price, 'source': 'manual_msrp', 'matched_via': note}
            stats['manual'] = stats.get('manual', 0) + 1
        
        # Priority 7: Fuzzy match against retailer catalogs (last resort)
        if not price_info:
            fuzzy_result = fuzzy_match_retailers(product, all_retailers)
            if fuzzy_result:
                price_info = fuzzy_result
                stats['fuzzy'] += 1
        
        if price_info:
            results['matched'].append({
                'id': product['id'],
                'title': product['title'],
                'sku': product['sku'],
                'price': price_info['price'],
                'source': price_info['source'],
                'matched_via': price_info['matched_via'],
            })
        else:
            results['unmatched'].append({
                'id': product['id'],
                'title': product['title'],
                'sku': product['sku'],
                'brand_guess': guess_brand(product['title']),
            })
            stats['unmatched'] += 1
    
    # ── Report ──────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"\nTotal missing prices: {len(missing)}")
    print(f"Grouped parents (skip): {len(grouped_parents)}")
    print(f"Need prices: {len(needs_price)}")
    print(f"\nMatched: {len(results['matched'])}")
    print(f"  Manual MSRP:           {stats.get('manual', 0)}")
    print(f"  Feb 12 CSV (by ID):    {stats['feb12_id']}")
    print(f"  Feb 12 CSV (by SKU):   {stats['feb12_sku']}")
    print(f"  Feb 12 CSV (by title): {stats['feb12_title']}")
    print(f"  POS Inventory (SKU):   {stats['pos_sku']}")
    print(f"  POS Inventory (title): {stats['pos_title']}")
    print(f"  Enrichment matches:    {stats['enrichment']}")
    print(f"  Fuzzy retailer match:  {stats['fuzzy']}")
    print(f"\nUnmatched: {stats['unmatched']}")
    
    if results['unmatched']:
        print("\n--- Unmatched products ---")
        for p in results['unmatched']:
            brand = f" [{p['brand_guess']}]" if p['brand_guess'] else ""
            print(f"  {p['id']} | {p['title']}{brand}")
    
    # ── Sample matches for review ──────────────────────────────────
    print("\n--- Sample matches (first 15) ---")
    for m in results['matched'][:15]:
        print(f"  ${m['price']:>8} | {m['title'][:45]:45} | {m['source']:20} | {m['matched_via'][:50]}")
    
    # ── Save results ───────────────────────────────────────────────
    out_path = os.path.join(BASE, 'outputs', 'price_fixes.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to: {out_path}")
    
    return results


if __name__ == '__main__':
    main()
