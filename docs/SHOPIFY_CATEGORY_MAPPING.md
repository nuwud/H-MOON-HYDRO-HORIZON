# Shopify Standard Product Taxonomy - Category Mapping for H-Moon Hydro

## Overview

Shopify requires products to use categories from their **Standard Product Taxonomy**. 
Custom categories (like "Hydroponic Nutrients") will trigger import warnings.

Reference: https://shopify.github.io/product-taxonomy/releases/unstable/

## Valid Hydroponics Categories

### Core Hydroponics Categories
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-1-19` | Home & Garden > Lawn & Garden > Gardening > Hydroponics |
| `hg-12-1-19-1` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems |
| `hg-12-1-19-1-1` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Deep Water Culture (DWC) |
| `hg-12-1-19-1-2` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Ebb & Flow |
| `hg-12-1-19-1-3` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Nutrient Film Technique (NFT) |
| `hg-12-1-19-1-4` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Drip Systems |
| `hg-12-1-19-1-5` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Aeroponics |
| `hg-12-1-19-1-6` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Systems > Aquaponics |

### Grow Lighting Categories
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-1-19-4` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting |
| `hg-12-1-19-4-1` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting > LED Grow Lights |
| `hg-12-1-19-4-2` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting > Fluorescent Grow Lights |
| `hg-12-1-19-4-3` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting > HID Grow Lights |

### Growing Media Categories
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-1-19-2` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media |
| `hg-12-1-19-2-1` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media > Clay Pebbles |
| `hg-12-1-19-2-2` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media > Rockwool |
| `hg-12-1-19-2-3` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media > Perlite |
| `hg-12-1-19-2-4` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media > Vermiculite |
| `hg-12-1-19-2-5` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media > Coconut Coir |

### Nutrients & Supplements Categories
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-1-19-3` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements |
| `hg-12-1-19-3-1` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements > Nutrient Solutions |
| `hg-12-1-19-3-2` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements > PH Adjusters |
| `hg-12-1-19-3-3` | Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements > Supplements |

## Other Relevant Categories

### Pest Control
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-10-11` | Home & Garden > Household Supplies > Pest Control |
| `hg-10-11-3` | Home & Garden > Household Supplies > Pest Control > Pesticides |
| `hg-10-11-3-1` | Home & Garden > Household Supplies > Pest Control > Pesticides > Fungicides |
| `hg-10-11-3-2` | Home & Garden > Household Supplies > Pest Control > Pesticides > Garden Insecticides |

### Watering & Irrigation
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-6` | Home & Garden > Lawn & Garden > Watering & Irrigation |
| `hg-12-6-9` | Home & Garden > Lawn & Garden > Watering & Irrigation > Irrigation Systems |

### Seeds
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-17-5-2` | Home & Garden > Plants > Seeds, Bulbs & Accessories > Seeds & Seed Tape |

### Gardening General
| Category ID | Breadcrumb Path |
|------------|-----------------|
| `hg-12-1` | Home & Garden > Lawn & Garden > Gardening |
| `hg-12-1-3` | Home & Garden > Lawn & Garden > Gardening > Fertilizers |
| `hg-12-1-16` | Home & Garden > Lawn & Garden > Gardening > Pots & Planters |

---

## Required Category Fixes for Import

### INVALID → VALID Mapping

| Invalid Category (Import Warning) | Valid Shopify Category |
|----------------------------------|------------------------|
| `Hydroponic Nutrients` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements` |
| `Grow Light Ballasts & Reflectors` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting` |
| `Hydroponic Growing Media` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media` |
| `Hydroponic Fans` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics` |
| `Hydroponic Grow Tents` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics` |
| `Hydroponic Test Equipment` | `Home & Garden > Lawn & Garden > Gardening > Hydroponics` |
| `Pest Control` (under Gardening) | `Home & Garden > Household Supplies > Pest Control` |
| `Seeds` (under Gardening) | `Home & Garden > Plants > Seeds, Bulbs & Accessories > Seeds & Seed Tape` |

### Notes
1. Shopify's taxonomy doesn't have a specific "Grow Tents" category - use the parent `Hydroponics`
2. For HID bulbs, use `HID Grow Lights` 
3. For fans/ventilation, the closest valid category is the parent `Hydroponics`
4. Test equipment (pH meters, EC meters) should use parent `Hydroponics`

---

## CSV Import Format

In CSV, use either:
- The full breadcrumb path: `Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements`
- OR the category ID: `hg-12-1-19-3`

Both formats are accepted by Shopify.

---

## Script to Fix Categories

Run this to fix categories in your import CSV:

```python
CATEGORY_FIX_MAP = {
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Nutrients': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Nutrients & Supplements',
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Light Ballasts & Reflectors': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Grow Lighting',
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Growing Media': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Growing Media',
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Fans': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Grow Tents': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
    'Home & Garden > Lawn & Garden > Gardening > Hydroponics > Hydroponic Test Equipment': 
        'Home & Garden > Lawn & Garden > Gardening > Hydroponics',
    'Home & Garden > Lawn & Garden > Gardening > Pest Control': 
        'Home & Garden > Household Supplies > Pest Control',
    'Home & Garden > Lawn & Garden > Gardening > Seeds': 
        'Home & Garden > Plants > Seeds, Bulbs & Accessories > Seeds & Seed Tape',
}
```
