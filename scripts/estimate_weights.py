#!/usr/bin/env python3
"""
Estimate product weights based on volume, category, and known densities.

Weight estimation rules:
- Nutrients (liquid): ~2.3 lbs/L (water-based, slightly heavier than water)
- Grow media (dry): varies by type
- Equipment: use package dimensions
"""

import pandas as pd
import re
from typing import Optional, Tuple

# ============================================================================
# DENSITY LOOKUP TABLE (lbs per liter)
# ============================================================================

DENSITY_LBS_PER_LITER = {
    # Liquid nutrients - water-based, ~1.05 kg/L = 2.31 lbs/L
    'nutrient': 2.3,
    'fertilizer': 2.3,
    'supplement': 2.1,
    'additive': 2.2,
    'booster': 2.2,
    
    # pH adjusters - concentrated acids/bases
    'ph_up': 2.5,
    'ph_down': 2.5,
    'ph_adjust': 2.5,
    
    # Organic liquids
    'seaweed': 2.3,
    'kelp': 2.3,
    'compost_tea': 2.2,
    'molasses': 2.8,
    
    # Grow media (lbs per liter)
    'perlite': 0.22,
    'vermiculite': 0.35,
    'coco_coir': 0.55,
    'hydroton': 0.44,
    'clay_pebbles': 0.55,
    'growstone': 0.33,
    'rockwool': 0.22,
    
    # Soils (lbs per liter)
    'potting_soil': 0.88,
    'seed_starter': 0.66,
    
    # Pest control
    'pesticide': 2.2,
    'insecticide': 2.2,
    'fungicide': 2.2,
    'neem_oil': 2.1,
    
    # Default
    'default_liquid': 2.2,
    'default_powder': 1.1,
    'default_granular': 1.3,
}

# Volume extraction patterns
VOLUME_PATTERNS = [
    # Milliliters
    (r'(\d+(?:\.\d+)?)\s*ml\b', 'ml', lambda x: x / 1000),
    # Liters
    (r'(\d+(?:\.\d+)?)\s*l(?:t|iter|itre)?(?:s)?\b', 'L', lambda x: x),
    # Gallons
    (r'(\d+(?:\.\d+)?)\s*gal(?:lon)?(?:s)?\b', 'gal', lambda x: x * 3.785),
    # Quarts
    (r'(\d+(?:\.\d+)?)\s*qt\.?s?\b', 'qt', lambda x: x * 0.946),
    # Fluid ounces
    (r'(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?oz\.?\b', 'oz', lambda x: x * 0.0296),
    # Pints
    (r'(\d+(?:\.\d+)?)\s*pt\.?s?\b', 'pt', lambda x: x * 0.473),
    # Cubic feet (grow media)
    (r'(\d+(?:\.\d+)?)\s*(?:cu\.?\s*ft\.?|cf)\b', 'cf', lambda x: x * 28.3168),
]

# Weight patterns (for direct extraction)
WEIGHT_PATTERNS = [
    # Pounds
    (r'(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)s?\b', 'lb'),
    # Ounces (weight)
    (r'(\d+(?:\.\d+)?)\s*oz\.?\b', 'oz_wt'),  # Will validate is weight, not volume
    # Kilograms
    (r'(\d+(?:\.\d+)?)\s*kg\b', 'kg'),
    # Grams
    (r'(\d+(?:\.\d+)?)\s*g\b', 'g'),
]


def extract_volume_liters(text: str) -> Optional[float]:
    """Extract volume from text and convert to liters."""
    text = text.lower()
    
    for pattern, unit, converter in VOLUME_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            return converter(value)
    
    return None


def extract_direct_weight(text: str) -> Optional[float]:
    """Extract weight directly if specified in lbs."""
    text = text.lower()
    
    # Check for lbs first
    match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b', text)
    if match:
        return float(match.group(1))
    
    # Kilograms → lbs
    match = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', text)
    if match:
        return float(match.group(1)) * 2.205
    
    # Grams → lbs (if > 100g, likely a weight spec)
    match = re.search(r'(\d+(?:\.\d+)?)\s*g\b', text)
    if match:
        grams = float(match.group(1))
        if grams >= 100:  # Likely weight, not concentration
            return grams / 453.592
    
    return None


def detect_product_type(name: str, categories: str) -> str:
    """Detect product type for density lookup."""
    text = f"{name} {categories}".lower()
    
    # Grow media detection
    if any(x in text for x in ['perlite', 'perl']):
        return 'perlite'
    if any(x in text for x in ['vermiculite', 'verm']):
        return 'vermiculite'
    if any(x in text for x in ['coco', 'coir']):
        return 'coco_coir'
    if any(x in text for x in ['hydroton', 'clay pebble', 'leca']):
        return 'clay_pebbles'
    if any(x in text for x in ['growstone']):
        return 'growstone'
    if any(x in text for x in ['rockwool', 'rock wool', 'grodan']):
        return 'rockwool'
    if any(x in text for x in ['potting', 'soil', 'foxfarm ocean', 'happy frog']):
        return 'potting_soil'
    
    # pH adjusters
    if any(x in text for x in ['ph up', 'ph+', 'ph raise']):
        return 'ph_up'
    if any(x in text for x in ['ph down', 'ph-', 'ph lower']):
        return 'ph_down'
    
    # Organics
    if any(x in text for x in ['kelp', 'seaweed']):
        return 'seaweed'
    if 'molasses' in text:
        return 'molasses'
    
    # Pest control
    if any(x in text for x in ['pesticide', 'insecticide', 'bug', 'pest']):
        return 'pesticide'
    if any(x in text for x in ['fungicide', 'fungus']):
        return 'fungicide'
    if 'neem' in text:
        return 'neem_oil'
    
    # Nutrients (most common)
    if any(x in text for x in ['nutrient', 'fertilizer', 'feed']):
        return 'nutrient'
    if any(x in text for x in ['booster', 'bloom boost', 'root boost']):
        return 'booster'
    if any(x in text for x in ['supplement', 'additive']):
        return 'supplement'
    
    # Default based on category
    if 'grow media' in text or 'substrate' in text:
        return 'coco_coir'  # Safe default for bags
    
    return 'nutrient'  # Most products are liquid nutrients


def estimate_weight(
    name: str,
    categories: str,
    existing_weight: float = 0
) -> Tuple[float, str]:
    """
    Estimate weight in lbs. Returns (weight, method).
    Methods: 'existing', 'direct', 'calculated', 'default'
    """
    # Check if we already have a valid weight
    if existing_weight and existing_weight > 0:
        return (existing_weight, 'existing')
    
    # Try to extract weight directly from name
    direct_weight = extract_direct_weight(name)
    if direct_weight:
        return (direct_weight, 'direct')
    
    # Try to calculate from volume
    volume_L = extract_volume_liters(name)
    if volume_L:
        product_type = detect_product_type(name, categories)
        density = DENSITY_LBS_PER_LITER.get(product_type, 2.2)
        weight = volume_L * density
        return (round(weight, 2), 'calculated')
    
    # Default weights by category
    text = f"{name} {categories}".lower()
    if any(x in text for x in ['ballast', 'reflector', 'light', 'fixture']):
        return (15.0, 'default')
    if any(x in text for x in ['tent', 'grow tent']):
        return (45.0, 'default')
    if any(x in text for x in ['fan', 'blower', 'inline']):
        return (12.0, 'default')
    if any(x in text for x in ['filter', 'carbon filter']):
        return (20.0, 'default')
    if any(x in text for x in ['pump', 'air pump']):
        return (3.0, 'default')
    if any(x in text for x in ['timer', 'controller']):
        return (1.0, 'default')
    if any(x in text for x in ['book', 'guide']):
        return (1.5, 'default')
    if any(x in text for x in ['seed', 'seeds']):
        return (0.1, 'default')
    
    # Unknown - use safe default
    return (2.0, 'default')


def process_catalog(input_csv: str, output_csv: str):
    """Add weight estimates to catalog."""
    print(f"Loading {input_csv}...")
    df = pd.read_csv(input_csv)
    print(f"Loaded {len(df)} rows")
    
    # Track stats
    stats = {
        'existing': 0,
        'direct': 0,
        'calculated': 0,
        'default': 0,
    }
    
    # Process each row
    weights = []
    methods = []
    
    for _, row in df.iterrows():
        name = str(row.get('Name', ''))
        categories = str(row.get('Categories', ''))
        existing = float(row.get('Weight (lbs)', 0) or 0)
        
        weight, method = estimate_weight(name, categories, existing)
        weights.append(weight)
        methods.append(method)
        stats[method] += 1
    
    df['Weight (lbs)'] = weights
    df['Weight Method'] = methods
    
    print(f"\nWriting {output_csv}...")
    df.to_csv(output_csv, index=False)
    
    print("\n" + "=" * 60)
    print("WEIGHT ESTIMATION COMPLETE")
    print("=" * 60)
    print(f"Existing weights:   {stats['existing']:,}")
    print(f"Direct extraction:  {stats['direct']:,}")
    print(f"Calculated (vol):   {stats['calculated']:,}")
    print(f"Default estimate:   {stats['default']:,}")
    print(f"\nTotal rows:         {len(df):,}")
    
    # Show coverage
    weighted = sum(1 for w in weights if w > 0)
    print(f"Weight coverage:    {weighted / len(df) * 100:.1f}%")
    
    # Show sample calculations
    print("\nSample calculations:")
    samples = df[df['Weight Method'] == 'calculated'].head(5)
    for _, row in samples.iterrows():
        print(f"  {row['Name'][:50]}: {row['Weight (lbs)']} lbs")
    
    return df


if __name__ == '__main__':
    process_catalog(
        input_csv='outputs/woocommerce_EXPANDED.csv',
        output_csv='outputs/woocommerce_WEIGHTED.csv'
    )
