#!/usr/bin/env python3
"""
Deep enrichment pipeline - Round 2
1. Brand detection from product titles (knowledge-based)
2. Re-match existing catalogs with fuzzy matching
3. Scrape additional retailers (HTG Supply, Growers Network, etc.)
4. Web-fetch individual product pages for images/descriptions
5. Generate comprehensive enrichment payload
"""
import json, re, os, sys, time
from pathlib import Path
from difflib import SequenceMatcher

BASE = Path(__file__).resolve().parent.parent

# ──────────────────────────────────────────────────────────────
# 1. COMPREHENSIVE BRAND DICTIONARY
#    Maps title keywords/patterns to canonical brand names
# ──────────────────────────────────────────────────────────────
BRAND_PATTERNS = [
    # Advanced Nutrients family
    (r'\b(connoisseur|big\s*bud|bud\s*candy|bud\s*blood|flawless\s*finish|overdrive|sensizym|sensi\s*(grow|bloom)|piranha|tarantula|voodoo\s*juice|rhino\s*skin|nirvana|ancient\s*earth|bud\s*ignitor|bud\s*factor|final\s*phase|b[\-\s]?52)\b', 'Advanced Nutrients'),
    (r'\badvanced\s*nutrients?\b', 'Advanced Nutrients'),
    (r'\b(iguana\s*juice|ph\s*perfect\s*connoisseur)\b', 'Advanced Nutrients'),
    (r'\b(revive\s*(1|4|10)?\s*(lt|l|gal)?)\b', 'Advanced Nutrients'),

    # General Hydroponics
    (r'\b(flora\s*(gro|nova|blend|micro|bloom|kleen|nectar|licous|shield)|armor\s*si|cali\s*magic|diamond\s*nectar|liquid\s*koolbloom|dry\s*koolbloom|rapid\s*start|cocotek|general\s*hydroponics|maxi\s*(gro|bloom)|bio\s*thrive|defguard)\b', 'General Hydroponics'),
    (r'\b(GH\s+(Flora|Armor|Cali|Diamond|Rapid|Maxi|Bio|Liquid))\b', 'General Hydroponics'),
    (r'\bazamax\b', 'General Hydroponics'),

    # FoxFarm
    (r'\b(fox\s*farm|foxfarm|big\s*bloom|tiger\s*bloom|grow\s*big|bush\s*doctor|cha\s*ching|beastie\s*bloomz|open\s*sesame|happy\s*frog|ocean\s*forest|kangaroots|microbe\s*brew|boomerang)\b', 'FoxFarm'),
    (r'\bF\.?F\.?\b.*\b(air\s*bleed|valve|pump)\b', 'FloraFlex'),

    # FloraFlex
    (r'\b(floraflex|flora\s*flex|floracap|potpro|flora\s*fl)\b', 'FloraFlex'),

    # Botanicare
    (r'\b(botanicare|hydroplex|sweet\s*(raw|berry|citrus)|clearex|power\s*cloner|liquid\s*karma|silica\s*blast|pure\s*blend)\b', 'Botanicare'),

    # Nectar for the Gods
    (r'\b(nectar\s*for\s*the\s*gods|nftg|medusa.?s?\s*magic|gaia\s*mania|herculean\s*harvest|zeus\s*juice|athena.?s?\s*aminas|pegasus\s*potion|mega\s*morpheus|bloom\s*khaos|demeter.?s\s*destiny|olympus\s*up|triton.?s\s*trawl|the\s*kraken|poseidonzyme|hygeia.?s?\s*hydration)\b', 'Nectar For The Gods'),

    # Athena Products (NOT Athena's Aminas which is NFTG)
    (r'\bathena\s*(pro|blended?|cleanse|ipo|stack|fade|balance|core|bloom|grow|cal[\-\s]?mag|reset|renew|oxidizer)\b', 'Athena'),

    # CANNA
    (r'\b(canna\b(?!\s*butter)|cannazym|cannaboost|canna\s*(coco|terra|aqua|bio|rhizotonic|flush|pk|start|boost|plant\s*wash))\b', 'CANNA'),

    # Atami / B'Cuzz
    (r"\b(atami|b'?\s*cuzz|bcuzz)\b", 'Atami'),

    # Plagron
    (r'\b(plagron|alga[\s\-]?(grow|bloom)|sugar\s*royal|green\s*sensation|power\s*roots|pure\s*zym|terra\s*(grow|bloom)\s*plagron)\b', 'Plagron'),

    # Grodan / Rockwool
    (r'\b(grodan|hugo|delta\s*(4|6|8|10)\b|gro[\-\s]?block|bimatrix|bc[\-\s]?rb\d|rox\s*\d)\b', 'Grodan'),

    # Hydro Dynamics / Clonex
    (r'\b(clonex|clone\s*solution|hydrodynamics?\s*(int)?|hydro\s*dynamic)\b', 'Hydro Dynamics'),

    # AC Infinity
    (r'\b(ac\s*infinity|cloudline|cloudforge|cloudlab|ionframe|ionboard)\b', 'AC Infinity'),

    # SunBlaze / BadBoy T5
    (r'\b(sun\s*blaze|bad\s*boy\s*t5)\b', 'Sun Blaze'),

    # AutoPot
    (r'\b(auto\s*pot|autopot)\b', 'AutoPot'),

    # Mammoth
    (r'\bmammoth\s*(microbes|p|bio)?\b', 'Mammoth Microbes'),

    # Xtreme Gardening
    (r'\b(xtreme\s*gardening|mykos|azos|calcarb)\b', 'Xtreme Gardening'),

    # Growth Science
    (r'\b(growth\s*science|spring\s*gallon|summer\s*gallon|autumn\s*gallon|winter\s*frost|equinox\s*gallon|decision\s*gallon)\b', 'Growth Science'),

    # Monterey / Lawn & Garden
    (r'\b(monterey|montereybt)\b', 'Monterey'),

    # DTE / Down To Earth
    (r'\b(d\.?t\.?e\.?|down\s*to\s*earth)\b', 'Down To Earth'),

    # Dyna-Gro
    (r'\b(dyna[\-\s]?(gro|grow|bloom|foliage|mag|pro|tek|phup|ph\s*up))\b', 'Dyna-Gro'),

    # Big Foot Mycorrhizae
    (r'\bbig\s*foot\s*(mycorrhiz|myco)?\b', 'Big Foot Mycorrhizae'),

    # AZOMITE
    (r'\bazomite\b', 'Azomite'),

    # AzaSol (Arborjet)
    (r'\bazasol\b', 'Arborjet'),

    # Grease / Green Planet
    (r'\b(grease\s+(green|yellow|finisher|canna))\b', 'Green Planet'),
    (r'\bgreen\s*planet\b', 'Green Planet'),
    (r'\b(holland\s*secret|hammerhead)\b', 'Holland Secret'),

    # Aptus
    (r'\b(aptus|fasilitor|startbooster|topbooster|regulator|enzym\+|massbooster|system[\-\s]?clean|calmag)\b', 'Aptus'),

    # Hortilux
    (r'\b(hortilux|eye\s*hortilux)\b', 'EYE Hortilux'),

    # Gavita
    (r'\bgavita\b', 'Gavita'),

    # Hydrofarm
    (r'\b(hydrofarm|active\s*aqua)\b', 'Hydrofarm'),

    # Sunlight Supply
    (r'\bsunlight\s*supply\b', 'Sunlight Supply'),

    # Monster
    (r'\bmonster\s*(bloom|grow|garden)\b', 'Grotek'),

    # Hygrozyme
    (r'\bhygrozyme\b', 'Hygrozyme'),

    # SiLICIUM
    (r'\bsilicium\b', 'SiLICIUM'),

    # Hygroben
    (r'\bhygroben\b', 'BioNova'),

    # Hyshield  
    (r'\bhyshield\b', 'BioNova'),

    # Easy Grow
    (r'\beasy\s*grow\s*plus\b', 'Easy Grow'),

    # Flame Defender
    (r'\bflame\s*defender\b', 'Flame Defender'),

    # Jack's Nutrients
    (r'\bjacks?\s*(classic|nutrients?|5[\-\s]50|20[\-\s]20|15[\-\s]0|all\s*purpose|ultra\s*violet)\b', "Jack's Nutrients"),

    # Gro Pro
    (r'\bgro\s*pro\b', 'Gro Pro'),

    # LT Tray / Bootstrap Farmer
    (r'\blt\s*tray\b', 'Bootstrap Farmer'),

    # Flower Box  (Future Harvest)
    (r'\b(flower\s*box|future\s*harvest)\b', 'Future Harvest'),

    # Mighty / NPK Industries
    (r'\b(mighty\s*(bomb|wash)|npk\s*industries)\b', 'NPK Industries'),

    # Dead Bug / Bonide
    (r'\b(dead\s*bug|bonide)\b', 'Bonide'),

    # Growers House brand
    (r'\bgrowers?\s*house\b', 'Growers House'),

    # Ruby Ful
    (r'\bruby\s*ful\b', 'Ruby Ful#$%'),

    # microBIOMETER
    (r'\bmicrobiometer\b', 'microBIOMETER'),

    # Clean Leaf
    (r'\bclean\s*leaf\b', 'Grow Green MI'),

    # Coco / Soil specific brands  
    (r'\bcal[\-\s]?pow\b', 'Green Planet'),

    # GREEN wash
    (r'\bgreen\s*wash\b', 'Green Planet'),

    # Graduated Cylinder (generic/lab equipment)
    (r'\bgraduated\s*cylinder\b', ''),

    # Micro Kill
    (r'\bmicro\s*kill\b', 'Micro Kill'),

    # Liquified Seaweed (Maxicrop or similar)  
    (r'\bliquified?\s*seaweed\b', 'Maxicrop'),

    # Digital Scale
    (r'\bdigital\s*scale\b', ''),

    # Liquid All Purpose / Liquid Humus - DTE
    (r'\bliquid\s*(all\s*purpose|humus|bloom)\b', 'Down To Earth'),

    # Ton-O-Bud  
    (r'\bton[\-\s]o[\-\s]bud\b', 'Plant Prod'),

    # Coco Plagron
    (r'\bcoco\s*(a|b)\s*plagron\b', 'Plagron'),

    # Blossom Builder
    (r'\bblossom\s*builder\b', 'Grotek'),

    # Cal-Carb
    (r'\bcalcarb\b', 'Xtreme Gardening'),

    # Nuravine
    (r'\bnuravine\b', 'Nuravine'),

    # Flora series catch-all
    (r'\bflora\s*(micro|gro|bloom)\b', 'General Hydroponics'),
]

def detect_brand(title):
    """Detect brand from product title using pattern matching."""
    title_lower = title.lower().strip()
    for pattern, brand in BRAND_PATTERNS:
        if re.search(pattern, title_lower, re.IGNORECASE):
            return brand
    return ''


STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'in', 'of', 'for', 'with', 'by', 'to', 'is', 'at', 'on'}

def tokenize(text):
    """Extract meaningful tokens from text."""
    tokens = set(re.findall(r'[a-z0-9]+', text.lower()))
    return tokens - STOP_WORDS

def build_inverted_index(catalog_items):
    """Build token -> [catalog_idx] inverted index for fast lookup."""
    index = {}
    for i, ci in enumerate(catalog_items):
        tokens = tokenize(ci.get('title', ''))
        for tok in tokens:
            if len(tok) >= 2:  # skip single chars
                index.setdefault(tok, []).append(i)
    return index

def find_best_match(title, catalog_items, inv_index, min_score=50):
    """Find best catalog match using inverted index for speed."""
    query_tokens = tokenize(title)
    if not query_tokens:
        return None, 0

    # Get candidate indices from inverted index
    candidate_counts = {}
    for tok in query_tokens:
        if tok in inv_index and len(tok) >= 2:
            for idx in inv_index[tok]:
                candidate_counts[idx] = candidate_counts.get(idx, 0) + 1

    # Only evaluate candidates with at least 2 token overlaps
    min_overlap = max(2, len(query_tokens) // 3)
    candidates = [idx for idx, cnt in candidate_counts.items() if cnt >= min_overlap]

    best_score = 0
    best_match = None
    for idx in candidates:
        ci_tokens = tokenize(catalog_items[idx].get('title', ''))
        if not ci_tokens:
            continue
        intersection = query_tokens & ci_tokens
        score = len(intersection) / max(len(query_tokens), 1) * 100
        if score > best_score:
            best_score = score
            best_match = catalog_items[idx]

    if best_score >= min_score:
        return best_match, best_score
    return None, 0


def main():
    # Load manifest
    manifest_path = BASE / 'outputs' / 'fresh_manifest.json'
    with open(manifest_path, 'r', encoding='utf-8') as f:
        products = json.load(f)

    # Load existing retailer catalogs
    catalog_dir = BASE / 'outputs' / 'scraped' / 'catalogs'
    catalogs = {}
    if catalog_dir.exists():
        for fp in catalog_dir.glob('*.json'):
            retailer = fp.stem.replace('_products', '')
            with open(fp, 'r', encoding='utf-8') as f:
                catalogs[retailer] = json.load(f)
            print(f"  Loaded {retailer}: {len(catalogs[retailer])} products")

    # Build combined catalog index by cleaned title
    catalog_index = []
    for retailer, items in catalogs.items():
        for item in items:
            # Extract main image - Shopify format: images[0].src or image.src
            main_image = ''
            images_list = item.get('images', [])
            if images_list:
                first = images_list[0]
                main_image = first.get('src', first) if isinstance(first, dict) else str(first)
            elif item.get('image'):
                img = item['image']
                main_image = img.get('src', img) if isinstance(img, dict) else str(img)

            # Extract all image URLs
            all_images = []
            for img in images_list:
                src = img.get('src', img) if isinstance(img, dict) else str(img)
                if src:
                    all_images.append(src)

            catalog_index.append({
                'retailer': retailer,
                'title': item.get('title', ''),
                'price': '',
                'image': main_image,
                'images': all_images,
                'description': item.get('body_html', item.get('description', '')),
                'vendor': item.get('vendor', ''),
                'handle': item.get('handle', ''),
                'url': item.get('url', ''),
                'variants': item.get('variants', []),
            })
            # Get price from first variant
            variants = item.get('variants', [])
            if variants:
                for v in variants:
                    if v.get('price') and v['price'] != '0.00':
                        catalog_index[-1]['price'] = str(v['price'])
                        break

    print(f"\nTotal catalog products: {len(catalog_index)}")
    print(f"Products to enrich: {len(products)}")

    # ── Phase 1: Brand detection ────────────────────────────
    brand_results = {}
    for p in products:
        if not p.get('brand'):
            detected = detect_brand(p['title'])
            if detected:
                brand_results[p['id']] = detected

    print(f"\n--- Phase 1: Brand Detection ---")
    print(f"Products without brand: {sum(1 for p in products if not p.get('brand'))}")
    print(f"Brands detected from titles: {len(brand_results)}")

    # ── Phase 2: Fuzzy matching against catalogs ──────────
    enrichment = {}  # id -> {field: value}
    match_count = 0

    # Build inverted index for fast lookup
    print("Building inverted index...")
    inv_index = build_inverted_index(catalog_index)
    print(f"Index built: {len(inv_index)} unique tokens")

    for p in products:
        pid = p['id']
        needs_thumb = not p.get('thumb')
        needs_price = not p.get('price')
        needs_desc = p.get('desc') != 'has'
        needs_short = p.get('short_desc') != 'has'
        needs_brand = not p.get('brand') and pid not in brand_results

        if not (needs_thumb or needs_price or needs_desc or needs_short or needs_brand):
            continue

        # Find best catalog match using inverted index
        best_match, best_score = find_best_match(p['title'], catalog_index, inv_index, min_score=50)

        if best_score >= 50:
            match_count += 1
            data = {}

            if needs_thumb and best_match.get('image'):
                data['image'] = best_match['image']

            if needs_price and best_match.get('price') and best_match['price'] != '0.00':
                data['price'] = str(best_match['price'])

            if needs_desc and best_match.get('description'):
                desc = best_match['description']
                if len(desc) > 30:
                    data['description'] = desc

            if needs_short and best_match.get('description'):
                desc = best_match['description']
                # Strip HTML and truncate for short desc
                clean = re.sub(r'<[^>]+>', '', desc).strip()
                if len(clean) > 20:
                    short = clean[:250]
                    if len(clean) > 250:
                        short = short.rsplit(' ', 1)[0] + '...'
                    data['short_description'] = short

            if needs_brand and best_match.get('vendor'):
                vendor = best_match['vendor'].strip()
                if vendor and vendor.lower() not in ('', 'default', 'unknown', 'n/a', 'other'):
                    data['brand'] = vendor

            if best_match.get('images') and len(best_match['images']) > 1:
                gallery = best_match['images'][:5]
                data['gallery'] = gallery

            if data:
                enrichment[pid] = data
                enrichment[pid]['_match_title'] = best_match['title']
                enrichment[pid]['_match_score'] = best_score
                enrichment[pid]['_retailer'] = best_match.get('retailer', '')

    print(f"\n--- Phase 2: Catalog Matching ---")
    print(f"Matched >=50%: {match_count}")
    print(f"With enrichment data: {len(enrichment)}")

    # ── Phase 3: Merge brand detections ──────────────────
    for pid, brand in brand_results.items():
        if pid not in enrichment:
            enrichment[pid] = {}
        if 'brand' not in enrichment[pid]:
            enrichment[pid]['brand'] = brand

    # Build summary
    has_image = sum(1 for e in enrichment.values() if 'image' in e)
    has_price = sum(1 for e in enrichment.values() if 'price' in e)
    has_desc = sum(1 for e in enrichment.values() if 'description' in e)
    has_short = sum(1 for e in enrichment.values() if 'short_description' in e)
    has_brand = sum(1 for e in enrichment.values() if 'brand' in e)
    has_gallery = sum(1 for e in enrichment.values() if 'gallery' in e)

    print(f"\n=== ENRICHMENT SUMMARY ===")
    print(f"Total products to update: {len(enrichment)}")
    print(f"  Images: {has_image}")
    print(f"  Gallery: {has_gallery}")
    print(f"  Prices: {has_price}")
    print(f"  Descriptions: {has_desc}")
    print(f"  Short descriptions: {has_short}")
    print(f"  Brands: {has_brand}")

    # Show brand detections
    print(f"\n--- Detected Brands ---")
    by_brand = {}
    for pid, brand in brand_results.items():
        by_brand.setdefault(brand, []).append(pid)
    for brand, pids in sorted(by_brand.items(), key=lambda x: -len(x[1])):
        print(f"  {brand}: {len(pids)} products")

    # Save enrichment
    out_path = BASE / 'outputs' / 'deep_enrichment.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(enrichment, f, indent=2)
    print(f"\nSaved to {out_path}")

    # Also save a products-needing-web-lookup list (still missing image after catalog match)
    web_lookup = []
    for p in products:
        pid = p['id']
        still_needs_thumb = not p.get('thumb') and 'image' not in enrichment.get(pid, {})
        still_needs_desc = p.get('desc') != 'has' and 'description' not in enrichment.get(pid, {})
        if still_needs_thumb or still_needs_desc:
            web_lookup.append({
                'id': pid,
                'title': p['title'],
                'brand': enrichment.get(pid, {}).get('brand', p.get('brand', '')),
                'needs': {
                    'thumb': still_needs_thumb,
                    'desc': still_needs_desc,
                }
            })

    lookup_path = BASE / 'outputs' / 'web_lookup_needed.json'
    with open(lookup_path, 'w', encoding='utf-8') as f:
        json.dump(web_lookup, f, indent=2)
    print(f"Products still needing web lookup: {len(web_lookup)}")
    print(f"Saved to {lookup_path}")


if __name__ == '__main__':
    main()
