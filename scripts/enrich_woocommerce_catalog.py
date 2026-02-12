#!/usr/bin/env python3
"""
WooCommerce Catalog Enrichment Pipeline

This script enriches the product catalog with:
1. Brand detection and normalization
2. Hierarchical category structure (Parent > Child)
3. Cross-categorization (products in multiple relevant categories)
4. Product attributes (pa_brand, etc.)
5. Auto-generated tags
6. Enhanced short descriptions

Based on WooCommerce REST API best practices and competitor analysis.
"""

import csv
import re
import hashlib
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional

# ============================================================================
# BRAND REGISTRY (from hmoon-pipeline/src/utils/brandRegistry.ts)
# ============================================================================

KNOWN_BRANDS = {
    # Major Nutrient Brands
    'Advanced Nutrients', 'General Hydroponics', 'Fox Farm', 'FoxFarm',
    'Botanicare', 'Athena', 'Canna', 'CANNA', 'Humboldt', 'House & Garden',
    'Cyco', 'CYCO', 'Mills', 'Mammoth', 'Roots Organics', 'Nectar for the Gods',
    'Heavy 16', 'Emerald Harvest', 'Dyna-Gro', 'Floraflex', 'FloraFlex',
    'Technaflora', 'Vegamatrix', 'Bio Bizz', 'BioBizz', 'Remo', 'Green Planet',
    'Grotek', 'Plagron', 'Aptus', 'Nutrilife', 'Dutch Nutrient', 'Soul',
    'New Millennium', 'Cultured Biologix', 'NPK Industries', 'RAW',
    'Cutting Edge', 'Aurora', 'Lotus Nutrients', 'Future Harvest',
    
    # Lighting Brands
    'Spider Farmer', 'Mars Hydro', 'Gavita', 'Fluence', 'Growers Choice',
    'Phantom', 'Lumatek', 'Nanolux', 'Sun System', 'Ushio', 'Iluminar',
    'Dimlux', 'HLG', 'Optic LED', 'California Lightworks', 'Kind LED',
    'Medic Grow', 'Hortilux', 'Eye Hortilux', 'Solarmax', 'Plantmax',
    'Xtrasun', 'Sunmaster', 'Philips', 'GE', 'Sylvania', 'Osram',
    'Dutch Lighting Innovations', 'DLI', 'Agrowlyte', 'BadBoy',
    
    # Ventilation/Environmental
    'AC Infinity', 'Can-Fan', 'Phresh', 'Vortex', 'Hurricane', 'Hyperfan',
    'Active Air', 'Cloudline', 'Inkbird', 'TrolMaster', 'Titan Controls',
    'Autopilot', 'Max-Fan', 'MaxFan', 'JetFan', 'Can Filter',
    
    # Containers/Media
    'Gro Pro', 'Root Spa', 'Viagrow', 'Smart Pot', 'GeoPot', 'Mother Earth',
    'Black Gold', 'Ocean Forest', 'Happy Frog', 'Royal Gold', 'Promix',
    'Pro-Mix', 'Grodan', 'Root Pouch', 'Fabric Pot',
    
    # Water/pH/EC
    'Bluelab', 'Milwaukee', 'Apera', 'Hanna', 'Oakton', 'Myron L',
    'Hydro-Logic', 'HydroLogic', 'Ideal H2O', 'Stealth RO',
    
    # Cloning/Propagation
    'Clonex', 'EZ Clone', 'Turboklone', 'Super Sprouter', 'Root Riot',
    'Rapid Rooter', 'Clone King',
    
    # CO2
    'CO2Meter', 'Sentinel', 'Hydro Innovations',
    
    # Pest/IPM
    'Lost Coast', 'Trifecta', 'Pyganic', 'Monterey', 'SNS', 'Flying Skull',
    'Plant Therapy', 'Regalia', 'Growers Ally',
    
    # Growing Systems
    'EcoPlus', 'Sunleaves', 'AeroFlo', 'PowerGrower', 'RainForest', 'WaterFarm',
    
    # Misc
    'Dosatron', 'Jiffy', 'Microbe Life', 'Recharge', 'Buildasoil',
    'UNO', 'Silicium', 'Holland Secret',
    'BCuzz', 'Atami',
    # Additional brands discovered
    'BioSafe Systems', 'PBI Gordon', 'Flying Skull', 'Organic Laboratories',
    'Green Cure', 'Zero Tolerance', "Dr. Zymes", 'Marrone Bio Innovations',
    'BioWorks', 'Pulse', 'Black Dog LED', 'Gorilla Grow Tent', 'Secret Jardin',
    'Viagrow', 'Hydrofarm', 'Quest', 'Ideal Air', 'Air King', 'Dura Breeze',
    'Blueprint', 'Sunblaze', 'Sunblaster', 'Agrosun', 'American Agritech',
    'Terra Aquatica', 'GHE', 'Hesi', 'Grow More', 'Jack\'s', 'Masterblend',
    'DutchPro', 'Dutch Pro', 'DNF', 'Terra Vega', 'Formulex',
    'SoHum', 'Sungro', 'Sunshine', 'Vermicrop', 'Down to Earth', 'Jobes',
    'Espoma', 'Dr Earth', "Dr. Earth",
    # More brands discovered
    'ONA', 'TrimPro', "Neptune's Harvest", 'Sipco', 'NutraDip',
    'Centurion Pro', 'Mountain Air', 'Phat Filter', 'Safer', 'Bonide',
    'Coast Agri', 'Harvest More', 'Shear Perfection', 'TNB Naturals',
    'Fulham', 'Ruck', 'Air King',
}

# Brand aliases for normalization
BRAND_ALIASES = {
    'ac infinity': 'AC Infinity',
    'acinfinity': 'AC Infinity',
    'cloudline': 'AC Infinity',
    'general hydroponics': 'General Hydroponics',
    'general hydro': 'General Hydroponics',
    'floragro': 'General Hydroponics',
    'florabloom': 'General Hydroponics',
    'floramicro': 'General Hydroponics',
    'fox farm': 'Fox Farm',
    'foxfarm': 'Fox Farm',
    'ocean forest': 'Fox Farm',
    'happy frog': 'Fox Farm',
    'advanced nutrients': 'Advanced Nutrients',
    'big bud': 'Advanced Nutrients',
    'bud candy': 'Advanced Nutrients',
    'overdrive': 'Advanced Nutrients',
    'sensizym': 'Advanced Nutrients',
    'sensi grow': 'Advanced Nutrients',
    'sensi bloom': 'Advanced Nutrients',
    'nirvana': 'Advanced Nutrients',
    'voodoo juice': 'Advanced Nutrients',
    'piranha': 'Advanced Nutrients',
    'tarantula': 'Advanced Nutrients',
    # MORE AN PRODUCTS (from store product images)
    'connoisseur': 'Advanced Nutrients',
    'bud ignitor': 'Advanced Nutrients',
    'carboload': 'Advanced Nutrients',
    'carbo load': 'Advanced Nutrients',
    'rhino skin': 'Advanced Nutrients',
    'jungle juice': 'Advanced Nutrients',
    'ph perfect': 'Advanced Nutrients',
    'hammerhead': 'Advanced Nutrients',
    'final phase': 'Advanced Nutrients',
    'flawless finish': 'Advanced Nutrients',
    'revive': 'Advanced Nutrients',
    'ancient earth': 'Advanced Nutrients',
    'bud factor x': 'Advanced Nutrients',
    'bud factor': 'Advanced Nutrients',
    'sensi cal-mag': 'Advanced Nutrients',
    'iguana juice': 'Advanced Nutrients',
    'kushie kush': 'Advanced Nutrients',
    'wet betty': 'Advanced Nutrients',
    'sensigrow': 'Advanced Nutrients',
    'sensibloom': 'Advanced Nutrients',
    'grow micro bloom': 'Advanced Nutrients',
    'ph perfect sensi': 'Advanced Nutrients',
    'ph perfect connoisseur': 'Advanced Nutrients',
    'ph perfect grow': 'Advanced Nutrients',
    'ph perfect bloom': 'Advanced Nutrients',
    'ph perfect micro': 'Advanced Nutrients',
    'mars hydro': 'Mars Hydro',
    'marshydro': 'Mars Hydro',
    'spider farmer': 'Spider Farmer',
    'spiderfarmer': 'Spider Farmer',
    'dli': 'Dutch Lighting Innovations',
    'hortilux': 'Eye Hortilux',
    'eye hortilux': 'Eye Hortilux',
    'root pouch': 'Root Pouch',
    'rootpouch': 'Root Pouch',
    'hydro-logic': 'Hydro-Logic',
    'hydrologic': 'Hydro-Logic',
    'stealth ro': 'Hydro-Logic',
    'pro-mix': 'Pro-Mix',
    'promix': 'Pro-Mix',
    'bio bizz': 'BioBizz',
    'biobizz': 'BioBizz',
    'canna': 'CANNA',
    'cannazym': 'CANNA',
    'cyco': 'CYCO',
    'floraflex': 'FloraFlex',
    'botanicare': 'Botanicare',
    'hydroguard': 'Botanicare',
    'cal-mag': 'Botanicare',
    'gavita': 'Gavita',
    'fluence': 'Fluence',
    'growers choice': 'Growers Choice',
    'lumatek': 'Lumatek',
    'nanolux': 'Nanolux',
    'sun system': 'Sun System',
    'can-fan': 'Can-Fan',
    'phresh': 'Phresh',
    'can filter': 'Can-Fan',
    'bluelab': 'Bluelab',
    'apera': 'Apera',
    'milwaukee': 'Milwaukee Instruments',
    'trolmaster': 'TrolMaster',
    'autopilot': 'Autopilot',
    'titan controls': 'Titan Controls',
    'clonex': 'Clonex',
    'ez clone': 'EZ Clone',
    'turboklone': 'TurboKlone',
    'super sprouter': 'Super Sprouter',
    'root riot': 'Root Riot',
    'rapid rooter': 'General Hydroponics',
    'grodan': 'Grodan',
    'smart pot': 'Smart Pot',
    'geopot': 'GeoPot',
    'mother earth': 'Mother Earth',
    'royal gold': 'Royal Gold',
    'roots organics': 'Roots Organics',
    'lost coast': 'Lost Coast Plant Therapy',
    'humboldt': 'Humboldt',
    'emerald harvest': 'Emerald Harvest',
    'house garden': 'House & Garden',
    'house and garden': 'House & Garden',
    # Additional brand mappings
    'b-52': 'Advanced Nutrients',
    "b'cuzz": 'Atami',
    'bcuzz': 'Atami',
    'aquavita': 'AquaVita',
    'azos': 'Xtreme Gardening',
    'mykos': 'Xtreme Gardening',
    'xtreme gardening': 'Xtreme Gardening',
    'flora series': 'General Hydroponics',
    'hydroton': 'Mother Earth',
    'rockwool': 'Grodan',
    'active air': 'Active Air',
    'viparspectra': 'ViparSpectra',
    'maxsisun': 'MaxSisun',
    'yield lab': 'Yield Lab',
    'vivosun': 'VIVOSUN',
    'king plus': 'King Plus',
    'phlizon': 'Phlizon',
    'bloom city': 'Bloom City',
    'emerald goddess': 'Emerald Harvest',
    'king kola': 'Emerald Harvest',
    'cal-mag plus': 'Botanicare',
    'liquid karma': 'Botanicare',
    'sweet': 'Botanicare',
    'fulvic': 'Botanicare',
    'green cleaner': 'Central Coast',
    # MORE ADVANCED NUTRIENTS PRODUCTS
    'bud ignitor': 'Advanced Nutrients',
    'carboload': 'Advanced Nutrients',
    'carbo load': 'Advanced Nutrients',
    'rhino skin': 'Advanced Nutrients',
    'jungle juice': 'Advanced Nutrients',
    'grow micro bloom': 'Advanced Nutrients',
    'ph perfect': 'Advanced Nutrients',
    'connoisseur': 'Advanced Nutrients',
    'hammerhead': 'Advanced Nutrients',
    'final phase': 'Advanced Nutrients',
    'flawless finish': 'Advanced Nutrients',
    'revive': 'Advanced Nutrients',
    'ancient earth': 'Advanced Nutrients',
    'mother earth tea': 'Advanced Nutrients',
    'bud factor x': 'Advanced Nutrients',
    'bud factor': 'Advanced Nutrients',
    # BioControl/IPM products
    'azaguard': 'BioSafe Systems',
    'azamax': 'General Hydroponics',
    'azatrol': 'PBI Gordon',
    'nuke em': "Flying Skull",
    'nuke \'em': "Flying Skull",
    'flying skull': "Flying Skull",
    'organocide': 'Organic Laboratories',
    'plant therapy': 'Lost Coast Plant Therapy',
    'green cure': 'Green Cure',
    'zero tolerance': 'Zero Tolerance',
    'dr zymes': "Dr. Zymes",
    'dr. zymes': "Dr. Zymes",
    'regalia': 'Marrone Bio Innovations',
    'cease': 'BioWorks',
    'rootshield': 'BioWorks',
    # Atami/B'Cuzz line
    'b\'cuzz bloom': 'Atami',
    'b\'cuzz root': 'Atami',
    'b\'cuzz grow': 'Atami',
    'wilma': 'Atami',
    # Canna line
    'cannacure': 'CANNA',
    'canna start': 'CANNA',
    'rhizotonic': 'CANNA',
    'boost': 'CANNA',
    'bio flores': 'CANNA',
    'bio vega': 'CANNA',
    'pk 13/14': 'CANNA',
    'pk13': 'CANNA',
    # House & Garden line
    'shooting powder': 'House & Garden',
    'drip clean': 'House & Garden',
    'roots excelurator': 'House & Garden',
    'top shooter': 'House & Garden',
    'top booster': 'House & Garden',
    'aqua flakes': 'House & Garden',
    # Athena line (bulk nutrients)
    'athena blended': 'Athena',
    'athena pro': 'Athena',
    'athena core': 'Athena',
    'athena bloom': 'Athena',
    'athena grow': 'Athena',
    'athena cleanse': 'Athena',
    'athena ipp': 'Athena',
    'athena stack': 'Athena',
    'athena balance': 'Athena',
    'athena fade': 'Athena',
    # General Hydroponics line
    'diamond nectar': 'General Hydroponics',
    'liquid koolbloom': 'General Hydroponics',
    'koolbloom': 'General Hydroponics',
    'dry kool bloom': 'General Hydroponics',
    'floralicious': 'General Hydroponics',
    'florakleen': 'General Hydroponics',
    'floranectar': 'General Hydroponics',
    'armor si': 'General Hydroponics',
    'defguard': 'General Hydroponics',
    'exile': 'General Hydroponics',
    'flora duo': 'General Hydroponics',
    'maxibloom': 'General Hydroponics',
    'maxigro': 'General Hydroponics',
    'ripen': 'General Hydroponics',
    # Humboldt line
    'bushmaster': 'Humboldt',
    'gravity': 'Humboldt',
    'ginormous': 'Humboldt',
    'snow storm': 'Humboldt',
    'snowstorm': 'Humboldt',
    'prozyme': 'Humboldt',
    'onyx': 'Humboldt',
    'verde': 'Humboldt',
    'bloom max': 'Humboldt',
    # Botanicare products
    'pure blend': 'Botanicare',
    'pureblend': 'Botanicare',
    'kind base': 'Botanicare',
    'pro silicate': 'Botanicare',
    'clearex': 'Botanicare',
    'hydroplex': 'Botanicare',
    'sugaree': 'Botanicare',
    'sweetberry': 'Botanicare',
    # Emerald Harvest
    'emerald goddess': 'Emerald Harvest',
    'cali pro': 'Emerald Harvest',
    'honey chome': 'Emerald Harvest',
    'king kola': 'Emerald Harvest',
    'root wizard': 'Emerald Harvest',
    'sturdy stalk': 'Emerald Harvest',
    # Blossom Builder (various brands make this)
    'blossom builder': 'Humboldt',
    # Grow media
    'coco coir': 'Roots Organics',
    'hydrokorrels': 'Plagron',
    # Monitoring equipment
    'ph pen': 'Bluelab',
    'truncheon': 'Bluelab',
    'pulse': 'Pulse',
    'photobio': 'Black Dog LED',
    # AC Infinity products
    'cloudline t6': 'AC Infinity',
    'cloudline t4': 'AC Infinity',
    'airplate': 'AC Infinity',
    'airtitan': 'AC Infinity',
    # Can-Fan products
    'max fan': 'Can-Fan',
    'iso-max': 'Can-Fan',
    'can 700': 'Can-Fan',
    'can 66': 'Can-Fan',
    'can 100': 'Can-Fan',
    'can 150': 'Can-Fan',
    'can pre-filter': 'Can-Fan',
    'can-fan': 'Can-Fan',
    # Diamond / Humboldt
    'diamond black': 'Humboldt',
    'diamond nectar': 'General Hydroponics',
    # Timers/Controllers
    'day/night': 'Titan Controls',
    'apollo': 'Titan Controls',
    'saturn': 'Titan Controls',
    'helios': 'Titan Controls',
    'spartan': 'Titan Controls',
    # Grow tents/rooms
    'gorilla grow': 'Gorilla Grow Tent',
    'gorilla tent': 'Gorilla Grow Tent',
    'secret jardin': 'Secret Jardin',
    'darkroom': 'Secret Jardin',
    # Odor control
    'ona': 'ONA',
    'ona gel': 'ONA',
    'ona block': 'ONA',
    'ona mist': 'ONA',
    'ona pro': 'ONA',
    'ona spray': 'ONA',
    'ona storm': 'ONA',
    'ona liquid': 'ONA',
    'ona breeze': 'ONA',
    # CocoTek (General Hydroponics sub-brand)
    'cocotek': 'General Hydroponics',
    'coco tek': 'General Hydroponics',
    # Trimming equipment
    'trimpro': 'TrimPro',
    'trim pro': 'TrimPro',
    'trimbox': 'TrimPro',
    'spin pro': 'Centurion Pro',
    # Neptune's Harvest
    "neptune's harvest": "Neptune's Harvest",
    'neptunes harvest': "Neptune's Harvest",
    "neptune's fish": "Neptune's Harvest",
    # Hygrozyme
    'hygrozyme': 'Sipco',
    # NutraDip meters
    'nutradip': 'NutraDip',
    # Dyna-Gro products
    'dyna-gro': 'Dyna-Gro',
    'dynagro': 'Dyna-Gro',
    'dyna ph': 'Dyna-Gro',
    'dyna foliage': 'Dyna-Gro',
    'dyna bloom': 'Dyna-Gro',
    'dyna grow': 'Dyna-Gro',
    'pro-tekt': 'Dyna-Gro',
    # Sunblaster products
    'sunblaster': 'Sunblaster',
    'sun blaster': 'Sunblaster',
    # Air purification
    'mountain air': 'Mountain Air',
    'phat filter': 'Phat Filter',
    # More grow media
    'coco loco': 'Fox Farm',
    'chunky perlite': 'Mother Earth',
    # Pest control additions
    'safer brand': 'Safer',
    'safer soap': 'Safer',
    'spinosad': 'Monterey',
    'captain jacks': 'Bonide',
    'take down': 'Monterey',
    # pH products
    'ph perfect': 'Advanced Nutrients',
    'ph control kit': 'General Hydroponics',
    'ph test kit': 'General Hydroponics',
    # Coast Garden products
    'coast garden': 'Coast Agri',
    # Common abbreviations
    'd.t.e.': 'Down to Earth',
    'dte ': 'Down to Earth',
    'd.t.e': 'Down to Earth',
    # More common brand keywords
    'better bloom': 'Earth Juice',
    'meta-k': 'Earth Juice',
    'catalyst': 'Earth Juice',
    'earth juice': 'Earth Juice',
    'alfalfa extract': 'AgRich',
    'alfalfa grease': 'AgRich',
    # More pH control
    'ph up': 'General Hydroponics',
    'ph down': 'General Hydroponics',
}

# Distributor names (NOT consumer brands - these are suppliers/wholesalers)
DISTRIBUTOR_NAMES = {
    'nickel city wholesale garden supply', 'nickel city', 'ncwgs',
    'sunlight supply', 'sunlight supply inc', 'sunlight supply inc.',
    'hawthorne', 'hawthorne hydroponics', 'hawthorne hydroponics llc',
    'hawthorne hydoponics', 'hawthorne hydoponics llc',  # Typo variants
    'ngw', 'bfg', 'system', 'd.l. wholesale', 'dl wholesale',
    'phive8', 'gease', 'grease', 'down to', 'liquid',
    '@flowers-hemp', 'h moon hydro', 'hmoonhydro', 'hmoon',
    'scietetics', 'scietetics ful',  # Internal codes
    'gh',  # Vendor code, not General Hydroponics
}

# ============================================================================
# CATEGORY HIERARCHY
# ============================================================================

# WooCommerce uses > for hierarchy: "Parent > Child"
CATEGORY_HIERARCHY = {
    # Nutrients & Additives
    'nutrients': {
        'parent': 'Nutrients & Additives',
        'keywords': ['nutrient', 'fertilizer', 'nute', 'feed', 'flora', 'bloom', 'grow', 'micro', 'npk'],
        'children': {
            'base_nutrients': ['flora', 'micro', 'grow', 'bloom', 'base', 'a+b', 'part a', 'part b', 'sensi'],
            'bloom_boosters': ['booster', 'pk', 'bud', 'flower', 'ripen', 'finisher', 'overdrive'],
            'root_enhancers': ['root', 'rhizo', 'mycorrhizae', 'myco', 'voodoo', 'piranha'],
            'cal_mag': ['cal-mag', 'calmag', 'calcium', 'magnesium', 'cal mag'],
            'silica': ['silica', 'silicium', 'mono-si', 'potassium silicate'],
            'enzymes': ['enzyme', 'zyme', 'cannazym', 'hygrozyme'],
            'beneficial_bacteria': ['beneficial', 'bacteria', 'microbe', 'mammoth', 'great white'],
        }
    },
    
    # Lighting
    'grow_lights': {
        'parent': 'Grow Lights',
        'keywords': ['light', 'led', 'hps', 'mh', 'cmh', 'lec', 'bulb', 'fixture', 'lamp', 'quantum'],
        'children': {
            'led_grow_lights': ['led', 'quantum board', 'bar', 'samsung', 'diode'],
            'hid_lighting': ['hps', 'mh', 'metal halide', 'high pressure sodium', 'hid'],
            'cmh_lec': ['cmh', 'lec', 'ceramic metal halide', '315w', '630w'],
            't5_fluorescent': ['t5', 'fluorescent', 't8', 'badboy'],
            'light_accessories': ['hanger', 'timer', 'controller', 'mover', 'reflector', 'hood'],
            'replacement_bulbs': ['bulb', 'lamp', 'replacement'],
        }
    },
    
    # Environmental Control
    'airflow': {
        'parent': 'Environmental Control',
        'keywords': ['fan', 'ventilation', 'duct', 'inline', 'exhaust', 'intake', 'cfm'],
        'children': {
            'inline_fans': ['inline', 'duct fan', 'exhaust', 'intake', 'cloudline', 'max fan'],
            'oscillating_fans': ['oscillating', 'clip fan', 'wall mount', 'floor fan'],
            'carbon_filters': ['carbon', 'filter', 'charcoal', 'odor', 'scrubber'],
            'ducting': ['ducting', 'duct', 'flex', 'insulated'],
            'fan_controllers': ['controller', 'speed', 'thermostat'],
        }
    },
    
    # Growing Media
    'grow_media': {
        'parent': 'Growing Media',
        'keywords': ['soil', 'coco', 'coir', 'perlite', 'vermiculite', 'rockwool', 'hydroton', 'clay'],
        'children': {
            'soil_mixes': ['soil', 'potting', 'ocean forest', 'happy frog', 'living soil'],
            'coco_coir': ['coco', 'coir', 'coconut'],
            'hydroponic_media': ['hydroton', 'clay pebble', 'rockwool', 'growstone', 'perlite'],
            'amendments': ['amendment', 'worm casting', 'guano', 'bone meal', 'kelp'],
        }
    },
    
    # Containers
    'containers_pots': {
        'parent': 'Containers & Pots',
        'keywords': ['pot', 'container', 'bucket', 'tray', 'saucer', 'planter'],
        'children': {
            'fabric_pots': ['fabric', 'smart pot', 'geopot', 'root pouch', 'cloth'],
            'plastic_pots': ['plastic', 'nursery', 'round', 'square'],
            'hydroponic_containers': ['bucket', 'reservoir', 'tote', 'dwc'],
            'trays_saucers': ['tray', 'saucer', 'flood', 'drain'],
        }
    },
    
    # Propagation
    'propagation': {
        'parent': 'Propagation & Cloning',
        'keywords': ['clone', 'seed', 'cutting', 'rooting', 'propagat', 'starter'],
        'children': {
            'cloning_systems': ['clone', 'cloner', 'aeroponic', 'ez clone', 'turboklone'],
            'rooting_hormones': ['rooting', 'hormone', 'clonex', 'gel', 'powder'],
            'starter_cubes': ['cube', 'plug', 'rapid rooter', 'root riot', 'rockwool'],
            'heat_mats': ['heat mat', 'heating', 'thermostat', 'propagation mat'],
            'humidity_domes': ['dome', 'humidity', 'tray', 'cover'],
        }
    },
    
    # Irrigation
    'irrigation': {
        'parent': 'Irrigation & Watering',
        'keywords': ['drip', 'irrigation', 'pump', 'tubing', 'emitter', 'timer', 'water'],
        'children': {
            'drip_systems': ['drip', 'emitter', 'dripper', 'stake'],
            'pumps': ['pump', 'submersible', 'inline pump', 'water pump'],
            'tubing_fittings': ['tubing', 'tube', 'fitting', 'connector', 'barb', 'y-connector'],
            'timers': ['timer', 'controller', 'irrigation timer'],
            'reservoirs': ['reservoir', 'tank', 'container'],
        }
    },
    
    # Water Quality
    'water_filtration': {
        'parent': 'Water Quality',
        'keywords': ['filter', 'ro', 'reverse osmosis', 'water', 'purif'],
        'children': {
            'ro_systems': ['ro', 'reverse osmosis', 'membrane'],
            'carbon_filters': ['carbon', 'sediment', 'chlorine'],
            'ph_adjustment': ['ph up', 'ph down', 'buffer'],
        }
    },
    
    # Meters & Monitoring
    'ph_meters': {
        'parent': 'Meters & Monitoring',
        'keywords': ['meter', 'ph', 'ec', 'tds', 'ppm', 'monitor', 'sensor'],
        'children': {
            'ph_meters': ['ph meter', 'ph pen'],
            'ec_tds_meters': ['ec', 'tds', 'ppm', 'conductivity'],
            'environmental_monitors': ['temperature', 'humidity', 'co2', 'monitor'],
            'calibration': ['calibration', 'solution', 'buffer'],
        }
    },
    
    # Pest & Disease Control
    'pest_control': {
        'parent': 'Pest & Disease Control',
        'keywords': ['pest', 'mite', 'bug', 'insect', 'fungus', 'mold', 'ipm'],
        'children': {
            'insecticides': ['insecticide', 'mite', 'aphid', 'spider', 'pyrethrin'],
            'fungicides': ['fungicide', 'mold', 'mildew', 'rot'],
            'organic_ipm': ['neem', 'organic', 'natural', 'essential oil', 'ipm'],
            'sticky_traps': ['trap', 'sticky', 'yellow', 'gnat'],
        }
    },
    
    # Grow Tents & Rooms  
    'grow_tents': {
        'parent': 'Grow Tents & Rooms',
        'keywords': ['tent', 'grow room', 'mylar', 'reflective'],
        'children': {
            'grow_tents': ['tent', 'grow tent'],
            'accessories': ['trellis', 'net', 'pole', 'rack'],
        }
    },
    
    # Harvesting & Processing
    'harvesting': {
        'parent': 'Harvesting & Processing',
        'keywords': ['trim', 'harvest', 'dry', 'cure', 'scissor', 'bag'],
        'children': {
            'trimmers': ['trimmer', 'trim', 'bowl', 'machine'],
            'drying': ['dry', 'rack', 'net', 'hang'],
            'storage': ['jar', 'container', 'bag', 'cure', 'boveda'],
        }
    },
    
    # CO2
    'co2': {
        'parent': 'CO2 Enrichment',
        'keywords': ['co2', 'carbon dioxide', 'generator', 'regulator', 'tank'],
        'children': {
            'co2_generators': ['generator', 'burner'],
            'co2_controllers': ['controller', 'monitor', 'sensor'],
            'co2_tanks': ['tank', 'regulator', 'bottle'],
        }
    },
}

# Keywords for cross-categorization (secondary categories)
CROSS_CATEGORY_KEYWORDS = {
    'Organic Growing': ['organic', 'natural', 'living soil', 'vegan', 'bio'],
    'Hydroponic Systems': ['hydroponic', 'dwc', 'deep water', 'nft', 'ebb', 'flow', 'aeroponic'],
    'Indoor Growing': ['indoor', 'grow room', 'tent'],
    'Commercial Growing': ['commercial', 'professional', 'industrial', 'large scale'],
    'Beginner Kits': ['kit', 'starter', 'complete', 'package', 'bundle'],
}


def is_distributor(brand_name: str) -> bool:
    """Check if a brand name is actually a distributor/wholesaler."""
    if not brand_name:
        return False
    return brand_name.lower().strip() in DISTRIBUTOR_NAMES


def detect_brand(name: str, description: str = '', existing_brand: str = '') -> Optional[str]:
    """Extract and normalize brand from product name/description.
    
    Priority:
    1. Multi-word aliases (most specific - "captain jacks" → "Bonide")  
    2. Multi-word brands from KNOWN_BRANDS
    3. Single-word aliases
    4. Single-word brands
    5. Existing brand (if not a distributor)
    6. HMoonHydro house brand
    """
    text = f"{name} {description}".lower()
    
    # Check multi-word aliases FIRST (most specific - e.g., "captain jacks" → "Bonide")
    for alias, canonical in BRAND_ALIASES.items():
        if ' ' in alias and alias in text:
            return canonical
    
    # Check multi-word brands second
    multi_word_brands = sorted([b for b in KNOWN_BRANDS if ' ' in b], key=len, reverse=True)
    for brand in multi_word_brands:
        if brand.lower() in text:
            return brand
    
    # Check single-word aliases (with word boundary)
    for alias, canonical in BRAND_ALIASES.items():
        if ' ' not in alias and len(alias) >= 3:
            pattern = r'\b' + re.escape(alias) + r'\b'
            if re.search(pattern, text):
                return canonical
    
    # Check single-word brands (case-insensitive, word boundary)
    single_word_brands = [b for b in KNOWN_BRANDS if ' ' not in b]
    for brand in single_word_brands:
        pattern = r'\b' + re.escape(brand.lower()) + r'\b'
        if re.search(pattern, text):
            return brand
    
    # Check if first word is a brand (exact match)
    first_word = name.split()[0] if name.split() else ''
    if first_word in KNOWN_BRANDS:
        return first_word
    
    # Fall back to existing brand only if it's not a distributor
    if existing_brand and not is_distributor(existing_brand):
        return existing_brand
    
    # House brand fallback for unbranded generic items
    return 'HMoonHydro'


def detect_categories(name: str, description: str = '', current_cat: str = '') -> Tuple[str, List[str]]:
    """
    Detect primary and secondary categories.
    Returns: (primary_hierarchical_category, [secondary_categories])
    """
    text = f"{name} {description} {current_cat}".lower()
    
    primary = current_cat  # Keep existing if no better match
    primary_score = 0
    child_cat = None
    
    # Find primary category
    for cat_key, cat_data in CATEGORY_HIERARCHY.items():
        score = sum(1 for kw in cat_data['keywords'] if kw in text)
        if score > primary_score:
            primary_score = score
            primary = cat_data['parent']
            
            # Find child category
            for child_key, child_kws in cat_data.get('children', {}).items():
                if any(kw in text for kw in child_kws):
                    child_cat = child_key.replace('_', ' ').title()
                    break
    
    # Build hierarchical category string
    if child_cat:
        primary = f"{primary} > {child_cat}"
    
    # Detect cross-categories
    secondary = []
    for cross_cat, keywords in CROSS_CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            secondary.append(cross_cat)
    
    return primary, secondary


def generate_tags(name: str, brand: Optional[str], category: str) -> List[str]:
    """Generate relevant product tags."""
    tags = []
    
    # Add brand as tag
    if brand:
        tags.append(brand)
    
    # Extract meaningful words from name
    stopwords = {'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'to', 'of'}
    words = name.lower().replace('-', ' ').replace('/', ' ').split()
    
    for word in words:
        word = re.sub(r'[^a-z0-9]', '', word)
        if len(word) > 2 and word not in stopwords and not word.isdigit():
            tags.append(word.title())
    
    # Add category-based tags
    if 'nutrient' in category.lower():
        tags.append('Plant Nutrients')
    if 'led' in name.lower():
        tags.append('LED Lights')
    if 'hydroponic' in name.lower() or 'hydro' in name.lower():
        tags.append('Hydroponics')
    
    # Dedupe while preserving order
    seen = set()
    unique_tags = []
    for tag in tags:
        if tag.lower() not in seen:
            seen.add(tag.lower())
            unique_tags.append(tag)
    
    return unique_tags[:10]  # WooCommerce best practice: limit tags


def generate_short_description(name: str, brand: Optional[str], category: str, price: str) -> str:
    """Generate a compelling short description if missing."""
    parts = []
    
    if brand:
        parts.append(f"Quality {brand} product")
    
    # Extract key features from name
    features = []
    if 'gallon' in name.lower() or 'gal' in name.lower():
        match = re.search(r'(\d+(?:\.\d+)?)\s*(?:gallon|gal)', name.lower())
        if match:
            features.append(f"{match.group(1)} gallon size")
    
    if 'watt' in name.lower() or 'w' in name.lower():
        match = re.search(r'(\d+)\s*(?:watt|w\b)', name.lower())
        if match:
            features.append(f"{match.group(1)}W power")
    
    if features:
        parts.append(', '.join(features))
    
    # Add category context
    cat_simple = category.split('>')[0].strip()
    parts.append(f"for {cat_simple.lower()}")
    
    return '. '.join(parts) + '.' if parts else ''


def enrich_catalog(input_file: str, output_file: str):
    """Main enrichment function."""
    print(f"Loading {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = list(reader)
    
    print(f"Loaded {len(rows)} products")
    
    # Ensure we have the columns we need
    new_headers = list(headers)
    for col in ['Brands', 'Tags']:
        if col not in new_headers:
            new_headers.append(col)
    
    # Statistics
    stats = {
        'brands_detected': 0,
        'categories_enhanced': 0,
        'tags_added': 0,
        'short_desc_generated': 0,
    }
    
    enriched_rows = []
    
    for row in rows:
        ptype = row.get('Type', '')
        name = row.get('Name', '')
        desc = row.get('Description', '')
        current_cat = row.get('Categories', '')
        short_desc = row.get('Short description', '')
        existing_brand = row.get('Brands', '')
        
        # Skip variations (they inherit from parent)
        if ptype == 'variation':
            enriched_rows.append(row)
            continue
        
        # 1. Detect Brand (prefer consumer brand over distributor)
        brand = detect_brand(name, desc, existing_brand)
        if brand:
            row['Brands'] = brand  # WooCommerce attribute
            stats['brands_detected'] += 1
        else:
            row['Brands'] = ''  # Clear distributor names
        
        # 2. Enhance Categories
        primary_cat, secondary_cats = detect_categories(name, desc, current_cat)
        
        # Combine primary + secondary with pipe delimiter (WooCommerce format)
        all_cats = [primary_cat] + secondary_cats
        row['Categories'] = ', '.join(all_cats)
        
        if primary_cat != current_cat or secondary_cats:
            stats['categories_enhanced'] += 1
        
        # 3. Generate Tags
        tags = generate_tags(name, brand, primary_cat)
        if tags:
            existing_tags = row.get('Tags', '').split(',') if row.get('Tags') else []
            existing_tags = [t.strip() for t in existing_tags if t.strip()]
            all_tags = existing_tags + [t for t in tags if t not in existing_tags]
            row['Tags'] = ', '.join(all_tags[:15])
            stats['tags_added'] += len(tags)
        
        # 4. Generate Short Description if missing/short
        if not short_desc or len(short_desc.split()) < 10:
            generated = generate_short_description(name, brand, primary_cat, row.get('Regular price', ''))
            if generated:
                row['Short description'] = generated
                stats['short_desc_generated'] += 1
        
        enriched_rows.append(row)
    
    # Write enriched catalog
    print(f"\nWriting {output_file}...")
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=new_headers)
        writer.writeheader()
        writer.writerows(enriched_rows)
    
    print("\n" + "="*60)
    print("ENRICHMENT COMPLETE")
    print("="*60)
    print(f"Brands detected:        {stats['brands_detected']}")
    print(f"Categories enhanced:    {stats['categories_enhanced']}")
    print(f"Tags added:             {stats['tags_added']}")
    print(f"Short descriptions:     {stats['short_desc_generated']}")
    print(f"\nOutput: {output_file}")
    
    return stats


if __name__ == '__main__':
    import sys
    
    input_file = sys.argv[1] if len(sys.argv) > 1 else 'outputs/woocommerce_FIXED.csv'
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'outputs/woocommerce_ENRICHED.csv'
    
    enrich_catalog(input_file, output_file)
