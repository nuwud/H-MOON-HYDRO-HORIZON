#!/usr/bin/env python3
"""
WooCommerce Import Data Enrichment
===================================
Fills gaps in:
- Brand (detect from product name/category)
- Short description (generate from name/attributes)
- Weight (estimate from size/category)
- Images (inherit from parent if missing)

Run: python scripts/enrich_woo_import.py
"""

import pandas as pd
import re
from pathlib import Path
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

INPUT_FILE = "outputs/woocommerce_variable_products.csv"
OUTPUT_FILE = "outputs/woocommerce_enriched_import.csv"

# ============================================================================
# BRAND DETECTION PATTERNS (from normalize_vendors.js)
# ============================================================================

BRAND_PATTERNS = [
    (r'general hydroponics|flora(gro|micro|bloom)|calimagic|armor si|rapidstart|koolbloom|floralicious|diamond nectar|bioroot|biothrive|floranova|florakleen|exotic blend|bio bud|bio weed|bio marine|flora blend|cacmg\+', 'General Hydroponics'),
    (r'advanced nutrients|big bud|bud ignitor|overdrive|voodoo juice|piranha|tarantula|b-52|bud candy|rhino skin|sensi|ph perfect|connoisseur|jungle juice|ancient earth', 'Advanced Nutrients'),
    (r'foxfarm|fox farm|tiger bloom|big bloom|grow big|ocean forest|happy frog|cha ching|beastie bloomz|open sesame|sledgehammer|kangaroots|microbe brew|boomerang|bushdoctor', 'FoxFarm'),
    (r'house (&|and) garden|h&g|roots excelurator|shooting powder|top booster|multi zen|drip clean|magic green|nitrogen boost', 'House & Garden'),
    (r'canna(?!bis)|cannazym|rhizotonic|pk 13\/14|boost accelerator|bio flores|bio vega|coco a|coco b|terra flores', 'Canna'),
    (r'botanicare|pure blend|hydroguard|cal-mag plus|silica blast|liquid karma|kind base|sweet|clearex|vitamino', 'Botanicare'),
    (r'ac infinity|cloudline|ionframe|ionboard|controller 6[79]|airplate|cloudray|s-type|t-type', 'AC Infinity'),
    (r'gavita|pro 1[07]00|ct 1930|e-series|uv-r|master controller', 'Gavita'),
    (r'fluence|spydr|vypr', 'Fluence'),
    (r'grodan|hugo|delta block|gro-slab|a-ok|uni-slab|growcube', 'Grodan'),
    (r'mother earth|hydroton|coco \+ perlite|groundswell|terracraft', 'Mother Earth'),
    (r'cyco|supa stiky|potash plus|dr\.? repair|silica|zyme', 'Cyco'),
    (r'bluelab|guardian monitor|ph pen|combo meter|conductivity pen|soil ph', 'Bluelab'),
    (r'apera|ph20|pc60|ai311', 'Apera'),
    (r'trolmaster|hydro-x|aqua-x|temp-x|co2-x', 'TrolMaster'),
    (r'athena|pro line|cleanse|stack|ipp|blended', 'Athena'),
    (r'vivosun|aerolight|vs \d+', 'VIVOSUN'),
    (r'mars hydro|fc-e|ts \d+|sp \d+|tsl', 'MARS HYDRO'),
    (r'spider farmer|se\d+|sf\d+|g series', 'Spider Farmer'),
    (r'hortilux|eye hortilux|super hps|blue daylight|ceramic hps', 'Hortilux'),
    (r'dimlux|expert series|xtreme series', 'Dimlux'),
    (r'\bsun system|sun grip|yield master|lec|cmh \d+', 'Sun System'),
    (r'hydrofarm', 'Hydrofarm'),
    (r'dutch master|dm gold|dm zone|silica|penetrator', 'Dutch Master'),
    (r'rock nutrients|rock resinator|rock supercharged', 'Rock Nutrients'),
    (r'emerald harvest|cali pro|honey chome|root wizard|king kola|emerald goddess', 'Emerald Harvest'),
    (r'roots organics|buddha|elemental|trinity|uprising', 'Roots Organics'),
    (r'nectar for the gods|medusas magic|zeus juice|athenas aminas|herculean harvest|demeter', 'Nectar for the Gods'),
    (r'humboldts secret|golden tree|flower stacker', "Humboldt's Secret"),
    (r'dyna-gro|dynagro|dyna grow|dyna bloom|pro-tekt|mag-pro|k-l-n', 'Dyna-Gro'),
    (r'flora flex|floraflex|full tilt|bulky b|veg foliar', 'FloraFlex'),
    (r'active aqua|water pump|utility sump|air pump', 'Active Aqua'),
    (r'autopot|easy2grow|airodome|aquavalve', 'AutoPot'),
    (r'clonex|mist|rooting', 'Hydrodynamics'),
    (r'technaflora|recipe for success|awesome blossom|sugar daddy|rootech', 'Technaflora'),
    (r'cutting edge|grow|bloom|micro|sugaree|uncle johns', 'Cutting Edge'),
    (r'current culture', 'Current Culture'),
    (r'mammoth p|mammoth microbes', 'Mammoth Microbes'),
    (r'great white|plant success|xtreme gardening', 'Plant Success'),
    (r'recharge', 'Real Growers'),
    (r'tribus', 'Tribus'),
    (r'soul synthetics', 'Soul Synthetics'),
    (r'hanna instruments|hanna|hi\d{4}', 'Hanna Instruments'),
    (r'ionic|growth technology', 'Ionic'),
    (r'plagron', 'Plagron'),
    (r'biobizz', 'BioBizz'),
    (r'mills|ultimate pk|basis', 'Mills Nutrients'),
    (r'remo nutrients|velokelp|magnifical|astroflower', 'Remo Nutrients'),
    (r'new millenium|equinox|ruby full|summer', 'New Millenium'),
    (r'nutrilife|sm-90|h2o2|humiboost', 'Nutrilife'),
    (r'can-fan|max-fan|iso-max|ruck', 'Can-Fan'),
    (r'original can|can \d+|can-filter|can filter|can-lite', 'Can-Filter'),
    (r'phresh|filter|carbon|inline|silencer', 'Phresh'),
    (r'quantum|hlg|horticultural lighting|v2 rspec|bspec', 'Horticulture Lighting Group'),
    (r'lumatek|attis|zeus|ballast|digital', 'Lumatek'),
    (r'adjust-a-wing|hellion|enforcer|defender', 'Adjust-A-Wings'),
    (r'sunblaster|t5ho|led strip|propagation', 'SunBlaster'),
    (r'super sprouter|heat mat|humidity dome|seedling', 'Super Sprouter'),
    (r'ez clone|ez-clone|aeroponic', 'EZ-CLONE'),
    (r'propagation|root riot|rapid rooter', 'Propagation'),
    (r'light rail|light mover|intellidrive', 'Light Rail'),
    (r'timemist|deodorizer|odor control|air freshener', 'TimeMist'),
    (r'terpinator|rhizoflora', 'Rhizoflora'),
    (r'growers edge|trim|scissor|magnifying', "Grower's Edge"),
    (r'quest|dehumidifier|overhead|dual', 'Quest'),
    (r'titan|environmental|co2 controller', 'Titan Controls'),
    (r'milwaukee|ec meter|conductivity', 'Milwaukee'),
    (r'oakton|ph tester', 'Oakton'),
    (r'philips|master color|son-t', 'Philips'),
    (r'ushio|hilux|opti-red', 'Ushio'),
    (r'sylvania|grolux|britelux', 'Sylvania'),
    (r'plantmax|hps|mh bulb|\d+w bulb', 'Plantmax'),
    (r'luxx|led fixture|de light', 'Luxx Lighting'),
    (r'mylar|reflective|panda film|black & white', 'Reflective'),
    (r'gorilla grow|grow tent|gorilla tent', 'Gorilla Grow Tent'),
    (r'secret jardin|darkroom|darkstreet', 'Secret Jardin'),
    (r'fabric pot|smart pot|root pouch|geopot', 'Fabric Pots'),
    (r'coco coir|royal gold|char coir', 'Growing Medium'),
    (r'perlite|vermiculite|pumice|hydroton|clay pebble', 'Growing Medium'),
]

# Manual brand assignments for specific products
BRAND_OVERRIDES = {
    'basic magnetic ballast': 'Generic',
    'timemist': 'TimeMist',
    'block-ir': 'Generic',
    'reflective mylar': 'Generic',
    'light rail': 'Light Rail',
    'netpots': 'Generic',
    'site plugs': 'Generic',
    'mechanical timers': 'Generic',
    'backdraft dampers': 'Generic',
    'badboy': 'BadBoy',
    'can fans': 'Can-Fan',
    'can filter': 'Can-Filter',
}

# ============================================================================
# WEIGHT ESTIMATION (by category/size)
# ============================================================================

CATEGORY_WEIGHT_ESTIMATES = {
    'nutrients': {'default': 32, 'qt': 40, 'gal': 140, '2.5 gal': 350, '5 gal': 640, '6 gal': 768},
    'grow media': {'default': 320, 'small': 80, 'large': 640},
    'lighting': {'default': 80, 'bulb': 16, 'ballast': 200, 'reflector': 64},
    'fans': {'default': 32, 'small': 16, 'large': 96},
    'pots': {'default': 8, 'small': 4, 'large': 32},
    'pumps': {'default': 16, 'small': 8, 'large': 48},
    'meters': {'default': 8},
    'timers': {'default': 8},
    'propagation': {'default': 4},
    'books': {'default': 16},
    'seeds': {'default': 1},
}

def estimate_weight(name: str, category: str, size: str) -> float:
    """Estimate weight in oz based on product type and size."""
    name_lower = name.lower()
    cat_lower = str(category).lower()
    size_lower = str(size).lower() if pd.notna(size) else ''
    
    # Determine category type
    cat_type = 'default'
    if 'nutrient' in cat_lower or 'supplement' in cat_lower:
        cat_type = 'nutrients'
    elif 'grow' in cat_lower and 'media' in cat_lower:
        cat_type = 'grow media'
    elif 'light' in cat_lower or 'bulb' in cat_lower or 'ballast' in cat_lower:
        cat_type = 'lighting'
    elif 'fan' in cat_lower or 'blower' in cat_lower or 'air' in cat_lower:
        cat_type = 'fans'
    elif 'pot' in cat_lower or 'container' in cat_lower:
        cat_type = 'pots'
    elif 'pump' in cat_lower:
        cat_type = 'pumps'
    elif 'meter' in cat_lower or 'ph' in cat_lower or 'ec' in cat_lower:
        cat_type = 'meters'
    elif 'timer' in cat_lower:
        cat_type = 'timers'
    elif 'propagation' in cat_lower or 'seed' in cat_lower and 'starting' in name_lower:
        cat_type = 'propagation'
    elif 'book' in cat_lower:
        cat_type = 'books'
    elif 'seed' in cat_lower:
        cat_type = 'seeds'
    
    weights = CATEGORY_WEIGHT_ESTIMATES.get(cat_type, {'default': 16})
    
    # Try to match size pattern
    if cat_type == 'nutrients':
        if '5 gal' in size_lower or '5gal' in size_lower or '20 l' in size_lower:
            return 640
        elif '2.5 gal' in size_lower or '10 l' in size_lower:
            return 350
        elif '1 gal' in size_lower or 'gal' in size_lower or '4 l' in size_lower:
            return 140
        elif 'qt' in size_lower or '32 oz' in size_lower or '1 l' in size_lower:
            return 40
        elif '16 oz' in size_lower or 'pt' in size_lower or '500 ml' in size_lower:
            return 20
        elif '8 oz' in size_lower or '250 ml' in size_lower:
            return 12
        else:
            return 32  # Default nutrient weight
    
    return weights.get('default', 16)


# ============================================================================
# SHORT DESCRIPTION GENERATION
# ============================================================================

def generate_short_description(row: pd.Series) -> str:
    """Generate a short description from available data."""
    name = str(row.get('Name', '')) if pd.notna(row.get('Name')) else ''
    brand = str(row.get('Brand', '')) if pd.notna(row.get('Brand')) else ''
    category = str(row.get('Categories', '')) if pd.notna(row.get('Categories')) else ''
    product_type = str(row.get('Type', '')) if pd.notna(row.get('Type')) else ''
    
    # Don't generate for variations (they inherit parent desc)
    if product_type == 'variation':
        return ''
    
    # Clean up HTML from name
    clean_name = re.sub(r'<[^>]+>', '', name).strip()
    
    # Extract key category
    main_cat = ''
    if category:
        cats = category.split(',')[0].split('>')
        main_cat = cats[-1].strip() if cats else ''
    
    # Build description
    parts = []
    
    if brand and brand not in ['Generic', 'H-Moon Hydro']:
        parts.append(f"{brand}")
    
    parts.append(clean_name)
    
    # Add category context if not in name
    if main_cat and main_cat.lower() not in clean_name.lower():
        parts.append(f"- {main_cat}")
    
    desc = ' '.join(parts)
    
    # Keep it short (under 150 chars)
    if len(desc) > 150:
        desc = desc[:147] + '...'
    
    return desc


# ============================================================================
# BRAND DETECTION
# ============================================================================

def detect_brand(name: str, category: str = '') -> str:
    """Detect brand from product name and category."""
    text = f"{name} {category}".lower()
    
    # Check manual overrides first
    for key, brand in BRAND_OVERRIDES.items():
        if key in text:
            return brand
    
    # Check patterns
    for pattern, brand in BRAND_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return brand
    
    return ''


# ============================================================================
# MAIN ENRICHMENT
# ============================================================================

def enrich_import(df: pd.DataFrame) -> pd.DataFrame:
    """Apply all enrichments to the import file."""
    print("\n=== ENRICHMENT PHASE ===\n")
    
    stats = {
        'brand_filled': 0,
        'weight_filled': 0,
        'short_desc_filled': 0,
        'image_inherited': 0,
    }
    
    # Build parent lookup for variations
    parent_lookup = {}
    for idx, row in df[df['Type'] == 'variable'].iterrows():
        sku = row.get('SKU', '')
        if pd.notna(sku) and sku:
            parent_lookup[str(sku)] = row
    
    # Process each row
    for idx, row in df.iterrows():
        name = str(row.get('Name', '')) if pd.notna(row.get('Name')) else ''
        category = str(row.get('Categories', '')) if pd.notna(row.get('Categories')) else ''
        product_type = str(row.get('Type', ''))
        
        # 1. Brand enrichment
        current_brand = row.get('Brand', '')
        if pd.isna(current_brand) or current_brand == '':
            # For variations, try to get from parent first
            if product_type == 'variation':
                parent_sku = str(row.get('Parent', ''))
                if parent_sku in parent_lookup:
                    parent_row = parent_lookup[parent_sku]
                    parent_brand = parent_row.get('Brand', '')
                    if pd.notna(parent_brand) and parent_brand:
                        df.at[idx, 'Brand'] = parent_brand
                        stats['brand_filled'] += 1
                        continue
                    # Use parent name/category for detection
                    name = str(parent_row.get('Name', '')) if pd.notna(parent_row.get('Name')) else ''
                    category = str(parent_row.get('Categories', '')) if pd.notna(parent_row.get('Categories')) else ''
            
            # Detect from name/category
            detected = detect_brand(name, category)
            if detected:
                df.at[idx, 'Brand'] = detected
                stats['brand_filled'] += 1
        
        # 2. Weight enrichment (for variations and simple only)
        if product_type in ['variation', 'simple']:
            current_weight = row.get('Weight (oz)', '')
            if pd.isna(current_weight) or current_weight == '':
                size = str(row.get('Attribute 1 value(s)', '')) if pd.notna(row.get('Attribute 1 value(s)')) else ''
                estimated = estimate_weight(name, category, size)
                df.at[idx, 'Weight (oz)'] = estimated
                stats['weight_filled'] += 1
        
        # 3. Short description (for variable and simple only)
        if product_type in ['variable', 'simple']:
            current_desc = row.get('Short description', '')
            if pd.isna(current_desc) or current_desc == '':
                generated = generate_short_description(row)
                if generated:
                    df.at[idx, 'Short description'] = generated
                    stats['short_desc_filled'] += 1
        
        # 4. Image inheritance (variations inherit from parent)
        if product_type == 'variation':
            current_image = row.get('Images', '')
            if pd.isna(current_image) or current_image == '':
                parent_sku = str(row.get('Parent', ''))
                if parent_sku in parent_lookup:
                    parent_image = parent_lookup[parent_sku].get('Images', '')
                    if pd.notna(parent_image) and parent_image:
                        df.at[idx, 'Images'] = parent_image
                        stats['image_inherited'] += 1
    
    print(f"  Brand filled:       {stats['brand_filled']}")
    print(f"  Weight estimated:   {stats['weight_filled']}")
    print(f"  Short desc created: {stats['short_desc_filled']}")
    print(f"  Images inherited:   {stats['image_inherited']}")
    
    return df


def main():
    print("=" * 60)
    print("WOOCOMMERCE IMPORT ENRICHMENT")
    print("=" * 60)
    
    # Load data
    print(f"\nLoading: {INPUT_FILE}")
    df = pd.read_csv(INPUT_FILE, low_memory=False)
    print(f"  Rows: {len(df)}")
    
    # Pre-enrichment stats
    print("\n--- BEFORE ENRICHMENT ---")
    for field in ['Brand', 'Weight (oz)', 'Short description', 'Images']:
        non_empty = df[field].notna() & (df[field] != '')
        print(f"  {field:25}: {non_empty.sum():4}/{len(df)} ({non_empty.sum()/len(df)*100:.1f}%)")
    
    # Apply enrichments
    df = enrich_import(df)
    
    # Post-enrichment stats
    print("\n--- AFTER ENRICHMENT ---")
    for field in ['Brand', 'Weight (oz)', 'Short description', 'Images']:
        non_empty = df[field].notna() & (df[field] != '')
        print(f"  {field:25}: {non_empty.sum():4}/{len(df)} ({non_empty.sum()/len(df)*100:.1f}%)")
    
    # Save
    print(f"\nSaving: {OUTPUT_FILE}")
    df.to_csv(OUTPUT_FILE, index=False)
    
    # Create timestamped production file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    prod_file = f"outputs/woocommerce_ENRICHED_IMPORT_{timestamp}.csv"
    df.to_csv(prod_file, index=False)
    print(f"Production file: {prod_file}")
    
    print("\n" + "=" * 60)
    print("ENRICHMENT COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
