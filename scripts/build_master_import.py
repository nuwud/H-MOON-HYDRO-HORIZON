#!/usr/bin/env python3
"""
MASTER DATA CONSOLIDATION
Audits all data sources and creates ONE definitive import-ready CSV.

Data Sources (priority order):
1. POS Inventory - SKU, Price, Cost, UPC, Vendor (source of truth for pricing)
2. WooCommerce Export - Descriptions, Categories, Images
3. Shopify Export - Current state reference
4. Category Masters - Pre-classified products
"""

import csv
import json
import os
import re
from collections import defaultdict
from typing import Dict, List, Optional, Any

# Paths
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSVS = os.path.join(BASE, 'CSVs')
OUTPUTS = os.path.join(BASE, 'outputs')
WOO_EXPORT = os.path.join(CSVS, 'WooExport')

# Output
MASTER_OUTPUT = os.path.join(OUTPUTS, 'MASTER_IMPORT.csv')
AUDIT_OUTPUT = os.path.join(OUTPUTS, 'DATA_AUDIT.json')

# Shopify required columns
SHOPIFY_HEADER = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
    'SEO Title', 'SEO Description', 'Variant Weight Unit', 'Cost per item', 'Status'
]

def slugify(text: str) -> str:
    """Convert text to URL-safe handle."""
    if not text:
        return ''
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text[:200]  # Shopify limit

def read_csv_safe(filepath: str) -> List[Dict]:
    """Read CSV with error handling."""
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            return list(csv.DictReader(f))
    except Exception as e:
        print(f"  ⚠️ Error reading {filepath}: {e}")
        return []

def normalize_price(val: Any) -> str:
    """Extract numeric price."""
    if not val:
        return ''
    val = str(val).replace('$', '').replace(',', '').strip()
    try:
        return f"{float(val):.2f}"
    except:
        return ''

def audit_data_sources():
    """Audit all available data sources."""
    audit = {
        'pos_inventory': {'path': None, 'count': 0, 'fields': []},
        'woo_products': {'path': None, 'count': 0, 'fields': []},
        'shopify_export': {'path': None, 'count': 0, 'fields': []},
        'complete_import': {'path': None, 'count': 0, 'fields': []},
        'category_masters': [],
        'image_maps': [],
    }
    
    # POS Inventory
    pos_path = os.path.join(CSVS, 'HMoonHydro_Inventory.csv')
    if os.path.exists(pos_path):
        rows = read_csv_safe(pos_path)
        audit['pos_inventory'] = {
            'path': pos_path,
            'count': len(rows),
            'fields': list(rows[0].keys()) if rows else []
        }
        print(f"✅ POS Inventory: {len(rows)} items")
    
    # WooCommerce Products
    woo_path = os.path.join(WOO_EXPORT, 'Products-Export-2025-Dec-31-180709.csv')
    if os.path.exists(woo_path):
        rows = read_csv_safe(woo_path)
        audit['woo_products'] = {
            'path': woo_path,
            'count': len(rows),
            'fields': list(rows[0].keys())[:20] if rows else []  # First 20 fields
        }
        print(f"✅ WooCommerce Products: {len(rows)} items")
    
    # Latest Shopify Export
    shopify_exports = sorted([f for f in os.listdir(CSVS) if f.startswith('products_export_1')])
    if shopify_exports:
        latest = shopify_exports[-1]
        path = os.path.join(CSVS, latest)
        rows = read_csv_safe(path)
        audit['shopify_export'] = {
            'path': path,
            'count': len(rows),
            'fields': list(rows[0].keys())[:20] if rows else []
        }
        print(f"✅ Shopify Export ({latest}): {len(rows)} rows")
    
    # Complete Import (our best consolidated file)
    complete_path = os.path.join(OUTPUTS, 'shopify_complete_import.csv')
    if os.path.exists(complete_path):
        rows = read_csv_safe(complete_path)
        handles = set(r.get('Handle', '') for r in rows)
        audit['complete_import'] = {
            'path': complete_path,
            'count': len(handles),
            'rows': len(rows),
            'fields': list(rows[0].keys()) if rows else []
        }
        print(f"✅ Complete Import: {len(handles)} products, {len(rows)} rows")
    
    # Category Masters
    masters = [f for f in os.listdir(CSVS) if f.startswith('master_') and f.endswith('.csv')]
    for m in masters:
        path = os.path.join(CSVS, m)
        rows = read_csv_safe(path)
        cat = m.replace('master_', '').replace('.csv', '')
        audit['category_masters'].append({
            'category': cat,
            'path': path,
            'count': len(rows)
        })
    print(f"✅ Category Masters: {len(masters)} files")
    
    # Image Maps
    img_maps = ['woo_image_map.json', 'woo_image_index.json']
    for im in img_maps:
        path = os.path.join(CSVS, im)
        if not os.path.exists(path):
            path = os.path.join(OUTPUTS, im)
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                audit['image_maps'].append({
                    'name': im,
                    'path': path,
                    'count': len(data) if isinstance(data, (list, dict)) else 0
                })
            except:
                pass
    print(f"✅ Image Maps: {len(audit['image_maps'])} files")
    
    return audit

def load_pos_data() -> Dict[str, Dict]:
    """Load POS inventory indexed by Item Number and Item Name."""
    pos_path = os.path.join(CSVS, 'HMoonHydro_Inventory.csv')
    rows = read_csv_safe(pos_path)
    
    by_sku = {}
    by_name = {}
    
    for row in rows:
        sku = row.get('Item Number', '').strip()
        name = row.get('Item Name', '').strip()
        
        data = {
            'sku': sku,
            'name': name,
            'description': row.get('Item Description', ''),
            'price': normalize_price(row.get('Regular Price', '')),
            'cost': normalize_price(row.get('Average Unit Cost', '')),
            'upc': row.get('UPC', '').strip(),
            'vendor': row.get('Vendor Name', '').strip(),
            'manufacturer': row.get('Manufacturer', '').strip(),
            'department': row.get('Department Name', '').strip(),
            'weight': row.get('Weight', '').strip(),
        }
        
        if sku:
            by_sku[sku] = data
        if name:
            by_name[name.lower()] = data
    
    return {'by_sku': by_sku, 'by_name': by_name}

def load_woo_data() -> Dict[str, Dict]:
    """Load WooCommerce data indexed by slug and name."""
    woo_path = os.path.join(WOO_EXPORT, 'Products-Export-2025-Dec-31-180709.csv')
    rows = read_csv_safe(woo_path)
    
    by_slug = {}
    by_name = {}
    
    for row in rows:
        slug = row.get('Slug', '').strip()
        name = row.get('Name', '').strip()
        
        # Get images
        images = []
        for i in range(1, 11):
            img = row.get(f'Image {i}', row.get(f'Images', '')).strip()
            if img and img.startswith('http'):
                images.append(img)
        
        data = {
            'slug': slug,
            'name': name,
            'description': row.get('Description', row.get('Short description', '')),
            'sku': row.get('SKU', '').strip(),
            'price': normalize_price(row.get('Regular price', row.get('Sale price', ''))),
            'categories': row.get('Categories', ''),
            'tags': row.get('Tags', ''),
            'images': images,
            'weight': row.get('Weight (lbs)', ''),
        }
        
        if slug:
            by_slug[slug] = data
        if name:
            by_name[name.lower()] = data
    
    return {'by_slug': by_slug, 'by_name': by_name}

def load_complete_import() -> List[Dict]:
    """Load the existing complete import as base."""
    path = os.path.join(OUTPUTS, 'shopify_complete_import.csv')
    return read_csv_safe(path)

def load_image_maps() -> Dict[str, str]:
    """Load all image mapping files."""
    images = {}
    
    # Try various image map files
    map_files = [
        os.path.join(CSVS, 'woo_image_map.json'),
        os.path.join(OUTPUTS, 'woo_image_map.json'),
        os.path.join(OUTPUTS, 'image_matches.json'),
        os.path.join(OUTPUTS, 'woo_fuzzy_matches.json'),
    ]
    
    for path in map_files:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        if k not in images and v:
                            if isinstance(v, list):
                                images[k] = v[0] if v else ''
                            else:
                                images[k] = v
            except:
                pass
    
    return images

def fuzzy_match_pos(title: str, pos_by_name: Dict, threshold: float = 0.6) -> Optional[Dict]:
    """Fuzzy match product title to POS inventory."""
    if not title:
        return None
    
    title_lower = title.lower().strip()
    title_words = set(title_lower.split())
    
    best_match = None
    best_score = 0
    
    for pos_name, pos_data in pos_by_name.items():
        # Exact match
        if pos_name == title_lower:
            return pos_data
        
        # Word overlap scoring
        pos_words = set(pos_name.split())
        if not pos_words:
            continue
            
        overlap = len(title_words & pos_words)
        total = len(title_words | pos_words)
        score = overlap / total if total > 0 else 0
        
        # Boost score for substring matches
        if title_lower in pos_name or pos_name in title_lower:
            score += 0.3
        
        if score > best_score and score >= threshold:
            best_score = score
            best_match = pos_data
    
    return best_match

def enrich_product(product: Dict, pos: Dict, woo: Dict, images: Dict) -> Dict:
    """Enrich a product with data from all sources."""
    handle = product.get('Handle', '')
    title = product.get('Title', '')
    sku = product.get('Variant SKU', '')
    
    # Try to find in POS by SKU first, then exact name match, then fuzzy
    pos_data = (
        pos['by_sku'].get(sku) or 
        pos['by_name'].get(title.lower()) or 
        fuzzy_match_pos(title, pos['by_name'])
    ) or {}
    
    # Try to find in WooCommerce by slug/name
    woo_data = woo['by_slug'].get(handle) or woo['by_name'].get(title.lower(), {})
    
    # Enrich fields (only if missing)
    enriched = dict(product)
    
    # Price (POS is source of truth)
    if not enriched.get('Variant Price') or enriched.get('Variant Price') == '0.00':
        enriched['Variant Price'] = pos_data.get('price') or woo_data.get('price') or ''
    
    # Cost
    if not enriched.get('Cost per item'):
        enriched['Cost per item'] = pos_data.get('cost', '')
    
    # Barcode/UPC
    if not enriched.get('Variant Barcode'):
        enriched['Variant Barcode'] = pos_data.get('upc', '')
    
    # Vendor
    if not enriched.get('Vendor') or enriched.get('Vendor') == 'Unknown':
        enriched['Vendor'] = pos_data.get('vendor') or pos_data.get('manufacturer') or woo_data.get('vendor', '')
    
    # Description
    if not enriched.get('Body (HTML)'):
        enriched['Body (HTML)'] = pos_data.get('description') or woo_data.get('description', '')
    
    # Image
    if not enriched.get('Image Src'):
        # Try image maps
        img = images.get(handle) or images.get(title.lower())
        if not img and woo_data.get('images'):
            img = woo_data['images'][0]
        enriched['Image Src'] = img or ''
    
    # Weight
    if not enriched.get('Variant Grams') or enriched.get('Variant Grams') == '0':
        weight_lbs = pos_data.get('weight') or woo_data.get('weight', '')
        if weight_lbs:
            try:
                grams = float(weight_lbs) * 453.592
                enriched['Variant Grams'] = str(int(grams))
            except:
                pass
    
    return enriched

def categorize_product(product: Dict) -> str:
    """Determine product category from Type field, title, vendor, or keywords."""
    type_field = product.get('Type', '').lower().strip()
    title = product.get('Title', '').lower()
    tags = product.get('Tags', '').lower()
    vendor = product.get('Vendor', '').lower()
    handle = product.get('Handle', '').lower()
    
    # Normalize: replace hyphens with spaces so "bud-ignitor" matches "bud ignitor"
    combined = f"{title} {tags} {handle} {type_field}".replace('-', ' ')
    
    # NUTRIENT BRANDS - if vendor or title matches, it's nutrients
    nutrient_brands = [
        'advanced nutrients', 'general hydroponics', 'foxfarm', 'fox farm',
        'botanicare', 'house & garden', 'house and garden', 'canna', 'cyco',
        'emerald harvest', 'mills', 'athena', 'jacks', "jack's", 'cultured solutions',
        'current culture', 'heavy 16', 'soul', 'nectar for the gods', 'roots organics',
        'biobizz', 'humboldts secret', 'remo', 'green planet', 'grotek', 'technaflora',
        'dutch master', 'b cuzz', 'bcuzz', 'atami', 'aptus', 'mammoth', 'xtreme gardening',
        'great white', 'recharge', 'slf 100', 'drip clean', 'hygrozyme', 'sensizyme',
        'floralicious', 'liquid karma', 'clearex', 'koolbloom', 'ripen', 'overdrive',
        'big bud', 'bud candy', 'bud ignitor', 'rhino skin', 'piranha', 'voodoo juice',
        'azos', 'mykos', 'armor si', 'rapid start', 'flora', 'maxi', 'dyna gro', 'dynagro',
        'an b 52', 'an bud', 'an rino', 'bud blood', 'blossom builder', 'cal pow', 'calcarb',
        # More specific product names that are nutrients
        'double super b', 'flawless finish', 'jungle green', 'liquid bud', 'liquid humus',
        'ton o bud', 'super b', 'cal mag', 'super bloom', 'super veg', 'ph perfect',
        'sensi', 'connoisseur', 'jungle juice', 'grow big', 'tiger bloom', 'cha ching',
        'open sesame', 'beastie bloomz', 'sledgehammer', 'bushdoctor', 'happy frog',
        # Additional nutrients
        'aquashield', 'big foot', 'mycorrhizal', 'biobud', 'biomarine', 'bioroot',
        'biothrive', 'bioweed', 'bioheaven', 'biogrow', 'biobloom', 'big up', 'alice garden'
    ]
    
    # Check nutrient brands first (highest priority)
    for brand in nutrient_brands:
        if brand in combined or brand in vendor:
            return 'nutrients'
    
    # Nutrient keywords
    nutrient_keywords = [
        'nutrient', 'fertilizer', 'bloom', 'micro', 'cal mag', 'calmag',
        'pk boost', 'pk 13/14', 'enzyme', 'booster', 'additive', 'supplement',
        'flower', 'veg', 'base', 'a+b', 'part a', 'part b', 'component',
        'mycorrhizae', 'beneficial', 'inoculant', 'compost tea', 'guano', 'kelp',
        'silica', 'humic', 'fulvic', 'amino', 'carbo', 'sugar', 'molasses'
    ]
    
    # AIRFLOW keywords (before generic matches)
    airflow_keywords = [
        'fan', 'blower', 'inline', 'exhaust', 'intake', 'duct', 'damper',
        'backdraft', 'cfm', 'ventilation', 'ac infinity', 'cloudline', 'can fan',
        'hurricane', 'clip fan', 'oscillating', 'wall mount', 'floor fan'
    ]
    for kw in airflow_keywords:
        if kw in combined:
            return 'airflow'
    
    # CONTAINERS keywords
    container_keywords = [
        'pot', 'container', 'bucket', 'basket', 'net pot', 'fabric pot',
        'smart pot', 'air pot', 'grow bag', 'tray', 'saucer', 'reservoir',
        'tote', 'bin', 'lid', 'gallon', 'big mama'
    ]
    for kw in container_keywords:
        if kw in combined and 'potassium' not in combined:  # Avoid "pot" in nutrients
            return 'containers'
    
    # Category keyword maps with priority (check in order)
    category_patterns = [
        # Nutrients (after brand check)
        ('nutrients', nutrient_keywords),
        
        # Grow media
        ('grow_media', [
            'coco', 'coir', 'perlite', 'vermiculite', 'hydroton', 'clay pebble',
            'rockwool', 'stonewool', 'growstone', 'soil', 'potting mix', 'peat',
            'growing medium', 'substrate', 'leca', 'grow media'
        ]),
        
        # Seeds
        ('seeds', ['seed', 'seeds', 'germination', 'auto froot', 'feminized', 'autoflower']),
        
        # Propagation
        ('propagation', [
            'clone', 'cloning', 'propagation', 'cutting', 'rooting', 'dome',
            'humidity dome', 'heat mat', 'seedling', 'starter', 'rapid rooter',
            'root riot', 'plugs', 'tray insert', 'oasis', 'cubes', 'neoprene',
            'insert', 'biomatrix', 'slab'
        ]),
        
        # Irrigation
        ('irrigation', [
            'pump', 'tubing', 'drip', 'irrigation', 'sprayer', 'emitter',
            'dripper', 'fitting', 'manifold', 'valve', 'float', 'aerator',
            'air stone', 'air pump', 'water pump', 'submersible', 'hose',
            'hydroponic system', 'dwc', 'ebb and flow', 'nft', 'aeroponic',
            'flowmaster', 'gph', 'wand', 'connector', 'union'
        ]),
        
        # pH/EC meters
        ('ph_meters', [
            'ph meter', 'ec meter', 'tds', 'ppm', 'calibration', 'ph pen',
            'bluelab', 'hanna', 'apera', 'ph up', 'ph down', 'ph control',
            'ph test', 'buffer', 'storage solution', 'graduated', 'cylinder',
            'beaker', 'syringe', 'pipette', 'measuring'
        ]),
        
        # Environmental monitors
        ('environmental_monitors', [
            'thermometer', 'hygrometer', 'temperature', 'monitor',
            'sensor', 'datalogger', 'pulse', 'trolmaster', 'inkbird'
        ]),
        
        # Controllers
        ('controllers', [
            'timer', 'controller', 'relay', 'contactor', 'autopilot',
            'titan', 'speedster', 'dimmer', 'speed control', 'thermostat'
        ]),
        
        # Grow lights
        ('grow_lights', [
            'led', 'grow light', 'fixture', 'bar light', 'quantum board',
            'full spectrum', 'gavita', 'fluence', 'hlg', 'spider farmer',
            'mars hydro', 'growers choice', 'luxx', 'photontek', 'dimlux',
            'cmh', 'lec', 'ceramic metal halide', 'light emitting ceramic',
            'greenpower', 'luminaires', 'badboy', 't5', 't 5', 'ho t5', 'rail'
        ]),
        
        # HID bulbs
        ('hid_bulbs', [
            'bulb', 'lamp', 'hps', 'mh', 'metal halide', 'high pressure sodium',
            'eye hortilux', 'philips', 'ushio', 'sunmaster', 'ultra sun',
            '400w', '600w', '1000w', 'single ended', 'double ended', 'de bulb',
            'sunblaster', 'cfl', 'compact fluorescent', 'plantmax', 'conversion'
        ]),
        
        # Odor control
        ('odor_control', [
            'carbon filter', 'charcoal', 'odor', 'scrubber', 'can filter',
            'phresh filter', 'ona', 'deodorizer', 'air purifier', 'ozone',
            'apple crumble', 'fresh linen', 'gel', 'neutralizer', '38 special'
        ]),
        
        # Water filtration
        ('water_filtration', [
            'ro ', 'reverse osmosis', 'water filter', 'sediment', 'carbon block',
            'membrane', 'hydrologic', 'stealth ro', 'filtration'
        ]),
        
        # Harvesting
        ('harvesting', [
            'harvest', 'dry', 'drying', 'cure', 'curing', 'hang', 'rack',
            'drying rack', 'herb dryer', 'boveda', 'grove bag', 'jar', 'storage',
            'scale', 'digital scale', 'weigh', 'mesh bag'
        ]),
        
        # Trimming
        ('trimming', [
            'trim', 'trimmer', 'scissors', 'snip', 'shear', 'pruner',
            'fiskars', 'bonsai', 'defoliate', 'chikamasa'
        ]),
        
        # Pest control
        ('pest_control', [
            'pest', 'insect', 'fungicide', 'pesticide', 'neem', 'spray',
            'sticky trap', 'yellow trap', 'bug', 'mite', 'gnat', 'aphid',
            'azamax', 'agrowlyte', 'plantwash', 'plant wash'
            'lost coast', 'flying skull', 'sm 90', 'safer', 'flame defender'
        ]),
        
        # CO2
        ('co2', [
            'co2', 'carbon dioxide', 'enhancer', 'burner', 'generator',
            'tank', 'regulator', 'exhale', 'tnb naturals'
        ]),
        
        # Grow room materials
        ('grow_room_materials', [
            'mylar', 'reflective', 'panda film', 'sheeting', 'liner',
            'black and white', 'trellis', 'netting', 'scrog', 'yoyo',
            'plant support', 'stake', 'tie', 'wire', 'diamond silver', 'white film',
            'block ir', 'infra red barrier'
        ]),
        
        # Grow tents
        ('grow_tents', [
            'tent', 'grow tent', 'gorilla', 'secret jardin', 'apollo',
            'vivosun tent'
        ]),
        
        # Electrical
        ('electrical', [
            'ballast', 'power strip', 'surge', 'cord', 'plug', 'outlet',
            'extension', 'wire', 'breaker', 'electrical'
        ]),
        
        # Books
        ('books', ['book', 'guide', 'manual', 'dvd']),
        
        # Extraction
        ('extraction', [
            'extract', 'press', 'rosin', 'concentrate', 'bubble bag',
            'dry sift', 'screen', 'pollen'
        ]),
    ]
    
    # Check patterns in priority order
    for category, keywords in category_patterns:
        for kw in keywords:
            if kw in combined:
                return category
    
    return 'uncategorized'

def build_master_csv():
    """Build the master import CSV."""
    print("\n" + "="*60)
    print("BUILDING MASTER IMPORT CSV")
    print("="*60 + "\n")
    
    # Audit sources
    print("📊 Auditing data sources...\n")
    audit = audit_data_sources()
    
    # Load data
    print("\n📥 Loading data sources...")
    pos = load_pos_data()
    print(f"  POS: {len(pos['by_sku'])} items by SKU, {len(pos['by_name'])} by name")
    
    woo = load_woo_data()
    print(f"  WooCommerce: {len(woo['by_slug'])} by slug, {len(woo['by_name'])} by name")
    
    images = load_image_maps()
    print(f"  Image maps: {len(images)} mappings")
    
    base_products = load_complete_import()
    print(f"  Base products: {len(base_products)} rows")
    
    # Enrich and categorize
    print("\n🔧 Enriching products...")
    enriched = []
    categories = defaultdict(list)
    
    for product in base_products:
        # Enrich with all sources
        product = enrich_product(product, pos, woo, images)
        
        # Categorize
        category = categorize_product(product)
        product['Type'] = category
        
        # Ensure all required fields exist
        for field in SHOPIFY_HEADER:
            if field not in product:
                product[field] = ''
        
        enriched.append(product)
        categories[category].append(product)
    
    # Quality check
    print("\n📈 Quality metrics:")
    total = len(enriched)
    handles = set(p['Handle'] for p in enriched)
    with_price = sum(1 for p in enriched if p.get('Variant Price') and float(p.get('Variant Price', '0') or '0') > 0)
    with_image = sum(1 for p in enriched if p.get('Image Src'))
    with_desc = sum(1 for p in enriched if p.get('Body (HTML)'))
    
    print(f"  Total rows: {total}")
    print(f"  Unique products: {len(handles)}")
    print(f"  With price: {with_price} ({with_price/total*100:.1f}%)")
    print(f"  With image: {with_image} ({with_image/total*100:.1f}%)")
    print(f"  With description: {with_desc} ({with_desc/total*100:.1f}%)")
    
    # Write master CSV
    print(f"\n💾 Writing {MASTER_OUTPUT}...")
    with open(MASTER_OUTPUT, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=SHOPIFY_HEADER, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(enriched)
    
    # Write category waves
    waves_dir = os.path.join(OUTPUTS, 'waves')
    os.makedirs(waves_dir, exist_ok=True)
    
    print(f"\n📁 Writing category waves to {waves_dir}/...")
    print(f"\n{'Category':<25} {'Products':>10} {'Price%':>8} {'Image%':>8}")
    print("-" * 55)
    
    for cat, products in sorted(categories.items(), key=lambda x: -len(x[1])):
        filepath = os.path.join(waves_dir, f'wave_{cat}.csv')
        
        handles = set(p['Handle'] for p in products)
        with_price = sum(1 for p in products if p.get('Variant Price') and float(p.get('Variant Price', '0') or '0') > 0)
        with_image = sum(1 for p in products if p.get('Image Src'))
        
        price_pct = with_price / len(products) * 100 if products else 0
        image_pct = with_image / len(products) * 100 if products else 0
        
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=SHOPIFY_HEADER, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(products)
        
        status = "✅" if price_pct > 80 and image_pct > 70 else "⚠️"
        print(f"{cat:<25} {len(handles):>10} {price_pct:>7.0f}% {image_pct:>7.0f}% {status}")
    
    # Save audit
    audit['final_stats'] = {
        'total_rows': total,
        'unique_products': len(handles),
        'with_price': with_price,
        'with_image': with_image,
        'with_description': with_desc,
        'categories': {k: len(v) for k, v in categories.items()}
    }
    
    with open(AUDIT_OUTPUT, 'w') as f:
        json.dump(audit, f, indent=2, default=str)
    
    print(f"\n✅ Master CSV: {MASTER_OUTPUT}")
    print(f"✅ Audit log: {AUDIT_OUTPUT}")
    print(f"✅ Wave files: {waves_dir}/wave_*.csv")
    
    return audit

if __name__ == '__main__':
    build_master_csv()
