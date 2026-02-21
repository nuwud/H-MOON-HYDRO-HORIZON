# WooCommerce Hydroponics Store — Product Structure Best Practices

> Based on research of HTG Supply, GrowersHouse, GrowGeneration, and industry standards.
> Created: Feb 19, 2026 | H-Moon Hydro

## 1. Product Types & When to Use Each

### Simple Products
- **Use for**: Single-SKU items with no size or variant options
- **Examples**: Books, individual tools, meters, single-size kits, one-off accessories
- **Rule**: If a product has ONLY ONE purchasable form, it's simple

### Grouped Products (WooCommerce native)
- **Use for**: Products sold in multiple sizes where each size has its own SKU/price
- **Examples**: Nutrients (1 Lt, 4 Lt, 10 Lt), grow media (1 cu ft, 2 cu ft), pest sprays (16 oz, 32 oz)
- **Rule**: The parent is a "catalog card" — not purchasable itself. Each child is a simple product with its own price
- **Visibility**: Parent = visible, Children = hidden (`exclude-from-catalog` + `exclude-from-search`)

### Variable Products (alternative approach)
- **When better than grouped**: When sizes share the same base price tier, or need a dropdown selector
- **Industry standard**: Most major stores (GrowGeneration, GrowersHouse) use variable products with size dropdowns
- **H-Moon Hydro**: Currently uses grouped; migration to variable is optional but would improve UX

## 2. Size Variant Naming Convention

### Title Format
```
Parent title:  "Big Bud Liquid"
Child titles:  "Big Bud Liquid 500 ml"
               "Big Bud Liquid 1 Lt"
               "Big Bud Liquid 4 Lt"
               "Big Bud Liquid 10 Lt"
```

### Standard Size Abbreviations (hydroponics industry)
| Size | Abbreviation | Notes |
|------|-------------|-------|
| Milliliter | ml, mL | NOT "ML" |
| Liter | Lt, L | "Lt" is industry standard |
| Gallon | gal | NOT "Gal" |
| Quart | qt | |
| Ounce (fluid) | oz, fl oz | |
| Pound | lb | |
| Gram | g | |
| Kilogram | kg | |
| Cubic foot | cu ft | For grow media |

### Size Pattern in Product Titles
Always append size AFTER the product name, separated by a space:
- ✅ `HYGROZYME 4 L`
- ✅ `Holland Secret Bloom 10L`
- ✅ `Quick Roots Gel 8 oz`
- ❌ `HYGROZYME (4 Liter)` — too verbose
- ❌ `4L HYGROZYME` — size should be at end

## 3. Category Hierarchy (HTG Supply Model)

Based on HTG Supply's proven 3-level category structure:

```
Nutrients/
├── Base Nutrients/
│   ├── 2-Part
│   ├── 3-Part
│   ├── All-In-One
│   └── Starter Kits
├── Supplements/
│   ├── Calcium Magnesium
│   ├── Silica
│   └── Foliar Sprays
├── Enhancers/
│   ├── Bloom Boosters
│   ├── Root Boosters
│   └── Sweeteners
├── Conditioners/
│   ├── pH Up & Down
│   ├── Enzymes
│   └── Mycorrhizae
└── Organic/
    ├── Compost Tea
    └── Worm Castings

Grow Lights/
├── LED
├── HPS & MH
├── CMH/LEC
├── T5 Fluorescent
├── Bulbs/
└── Accessories/

Environmental Controls/
├── Fans & Ducting
├── Dehumidifiers
├── CO2
├── Air Filters & Odor Control
└── Controllers

Grow Media/
├── Coco Coir
├── Potting Soil
├── Perlite & Vermiculite
├── Rockwool
└── Clay Pebbles

Pots & Containers/
├── Fabric Pots
├── Plastic Pots
├── Net Pots
└── Reservoirs

Propagation/
├── Cloning
├── Seed Starting
└── Heat Mats

Pest Control/
├── Insecticides
├── Fungicides
├── Spider Mites
└── Organic

Harvesting & Processing/
├── Trimmers
├── Drying
└── Extraction

Controllers & Meters/
├── pH Meters
├── TDS/EC Meters
├── Timers
└── Environment Controllers
```

## 4. SKU Convention

### Format: `HMH-{CATEGORY}-{UNIQUE}`
- `HMH` = H-Moon Hydro prefix
- Category codes: NUT, LIT, AIR, GRO, POT, PRO, PES, etc.
- Unique: 6-char alphanumeric hash or sequential number

### Examples
```
HMH-NUT-001234    (Nutrients)
hmh00445          (Legacy format, still valid)
UNO-2eLP-G        (Vendor/house brand SKU, preserved as-is)
```

### Rules
1. NEVER change an existing SKU — it's the primary import key
2. Auto-generate only for products missing SKUs
3. Format: lowercase hex hash of product name + category

## 5. Grouped Product Structure Rules

### When to Group
A product should be grouped if it has **2+ sizes** in the catalog:
- ✅ Big Bud Liquid (1 Lt, 4 Lt, 10 Lt) → Grouped parent "Big Bud Liquid"
- ✅ Holland Secret Bloom (1L, 4L, 10L, 23L) → Grouped parent "Holland Secret Bloom"
- ❌ Bud Ignitor 1 Lt (only one size exists) → Simple product, NOT grouped

### Parent Product Rules
1. Title = base product name WITHOUT size
2. No price (parent is not purchasable)
3. Same category as children
4. `_children` postmeta = serialized array of child post IDs
5. Visibility = visible (shows in catalog/search)

### Child Product Rules
1. Title = base name + size suffix
2. Has own price and SKU
3. Same category as parent
4. Visibility = hidden (`exclude-from-catalog` + `exclude-from-search`)
5. Accessible only through parent product page

## 6. Size Extraction Patterns (for automation)

```regex
# Volume
/(\d+(?:\.\d+)?\s*(?:Lt|L|ml|Gal|gal|qt|Quart|Pint|pt|fl\s*oz)\.?)/i

# Weight  
/(\d+(?:\.\d+)?\s*(?:lb|lbs|oz|g|gm|kg|pound)s?\.?)/i

# Container
/(\d+(?:\.\d+)?\s*(?:cu\.?\s*ft|cubic\s*feet?)\.?)/i

# Length (rolls, ducting)
/(\d+(?:\.\d+)?\s*(?:ft|foot|feet|\')\s*(?:x\s*\d+.*)?)/i

# Wattage (bulbs)
/(\d+\s*(?:W|Watt|watt)s?)/i
```

## 7. Brand-Specific Product Line Structure

### Advanced Nutrients
Uses "pH Perfect" prefix for many products. Parent should include full name:
- Parent: "pH Perfect Sensi Bloom 2-Part"
- Children: Part A and Part B in various sizes
- Note: Part A and Part B are SEPARATE grouped products (different formulations)

### FoxFarm
Distinct product lines (Big Bloom ≠ Tiger Bloom ≠ Grow Big):
- "Big Bloom Liquid Plant Food" — grouped by size  
- "Tiger Bloom Liquid Plant Food" — SEPARATE grouped product
- "Grow Big" — SEPARATE grouped product

### Holland Secret (Future Harvest)
Clean line structure: Grow / Bloom / Micro each grouped separately

### House Brand (UNO)
Valid brand — group UNO products by product type, not all under one parent

## 8. Import/Export Workflow

### WooCommerce CSV Import
1. Upload via **WooCommerce > Products > Import**
2. Use "Update existing products" matching by SKU
3. Column mapping: `Type`, `SKU`, `Name`, `Regular price`, `Categories`
4. For grouped: set `Type` = `grouped`, `Grouped products` = child SKUs separated by `|~|`

### CLI Import (wp-cli)
```bash
wp_set_current_user(1);  # CRITICAL — without this, categories silently fail
```

### Performance Tips
- Direct SQL (`$wpdb->query()`) for bulk description/weight updates
- `wp_update_post()` for individual products that need hooks fired
- Split large operations into batches of ~200 to avoid SSH timeouts

## 9. Current Store Stats (Feb 19, 2026)

| Metric | Count |
|--------|-------|
| Total products | ~1,491 |
| Grouped parents | 261 (247 original + 14 new) |
| Children linked | 890 |
| Remaining orphans | 352 |
| Products with weights | 1,425 (96%) |
| Products with descriptions | 1,215 (82%) |
| Products with short descriptions | 1,146 (78%) |

### Orphan Breakdown
- ~100 have size in title but are SOLO (only 1 size exists in catalog) → legitimate standalone
- ~250 are truly standalone products (books, tools, one-off items, seeds)
- 0 false groupings (all matches verified)
