# SPEC: WOO-002 — Attribute Taxonomy Standardization

## Status: 📋 SPECIFICATION COMPLETE

## Overview
Standardize WooCommerce product attributes (Size, Color, Material, etc.) into a **consistent, normalized taxonomy** that enables proper filtering, variant selection, and cross-product comparison. Critical for variable products and faceted search.

---

## Problem Statement

### Current State
- **Inconsistent Size values**: "1 Liter", "1L", "1 Lt", "1 Litre", "1000ml"
- **Mixed attribute names**: "Size", "size", "Sizes", "Product Size"
- **Free-form text**: No standardized dropdown values
- **Broken filters**: Customers can't filter by size effectively
- **Variant confusion**: Same size represented differently across products

### Target State
- **Canonical attribute names**: `pa_size`, `pa_color`, `pa_material`
- **Standardized values**: "1 L" not "1 Liter" or "1 Lt"
- **Global attributes**: Shared across all products
- **Faceted search ready**: Clean filtering on archive pages
- **Variant consistency**: All products use same size notation

---

## Attribute Taxonomy

### Primary Attributes

| Attribute | Slug | Type | Products |
|-----------|------|------|----------|
| Size | `pa_size` | Select | Nutrients, grow media, containers |
| Color | `pa_color` | Color swatch | Grow bags, tubing, tents |
| Wattage | `pa_wattage` | Select | Lights, fans, heaters |
| Duct Size | `pa_duct-size` | Select | Fans, filters, ducting |
| Voltage | `pa_voltage` | Select | Electrical equipment |
| Pack Size | `pa_pack-size` | Select | Seeds, bulk items |
| Concentration | `pa_concentration` | Select | Nutrients, supplements |
| Material | `pa_material` | Select | Containers, tubing |

### Size Value Standardization

#### Liquid Volumes (nutrients, additives)

| Raw Input | Normalized | Sort Order |
|-----------|------------|------------|
| 250ml, 250 ml, 250ML | 250 mL | 10 |
| 500ml, 500 ml, 1/2 L | 500 mL | 20 |
| 1L, 1 L, 1 Liter, 1 Litre, 1000ml | 1 L | 30 |
| 2L, 2 L, 2 Liter | 2 L | 40 |
| 4L, 4 L, 1 Gal, 1 Gallon | 4 L | 50 |
| 10L, 10 L, 2.5 Gal | 10 L | 60 |
| 20L, 20 L, 5 Gal | 20 L | 70 |
| 23L, 6 Gal | 23 L | 80 |

#### Dry Weights (grow media, soil)

| Raw Input | Normalized | Sort Order |
|-----------|------------|------------|
| 8 qt, 8 quart, 8qt | 8 qt | 10 |
| 1 cf, 1 cu ft, 1 cubic foot | 1 cu ft | 20 |
| 1.5 cf, 1.5 cu ft | 1.5 cu ft | 30 |
| 2 cf, 2 cu ft | 2 cu ft | 40 |
| 3 cf, 3 cu ft | 3 cu ft | 50 |
| 50L, 50 Liter (coco) | 50 L | 60 |

#### Physical Dimensions (tents, lights)

| Raw Input | Normalized | Sort Order |
|-----------|------------|------------|
| 2x2, 2'x2', 2ft x 2ft | 2×2 ft | 10 |
| 2x4, 2'x4' | 2×4 ft | 20 |
| 3x3, 3'x3' | 3×3 ft | 30 |
| 4x4, 4'x4' | 4×4 ft | 40 |
| 4x8, 4'x8' | 4×8 ft | 50 |
| 5x5, 5'x5' | 5×5 ft | 60 |
| 8x8, 8'x8' | 8×8 ft | 70 |
| 10x10, 10'x10' | 10×10 ft | 80 |

#### Duct/Pipe Sizes

| Raw Input | Normalized | Sort Order |
|-----------|------------|------------|
| 4", 4 inch, 4in | 4 in | 10 |
| 6", 6 inch, 6in | 6 in | 20 |
| 8", 8 inch, 8in | 8 in | 30 |
| 10", 10 inch, 10in | 10 in | 40 |
| 12", 12 inch, 12in | 12 in | 50 |

---

## Normalization Algorithm

```python
class AttributeNormalizer:
    SIZE_PATTERNS = [
        # Liquid volumes
        (r'(\d+(?:\.\d+)?)\s*ml', lambda m: f"{int(float(m.group(1)))} mL"),
        (r'(\d+(?:\.\d+)?)\s*(?:L|l|liter|litre)s?', lambda m: f"{m.group(1)} L"),
        (r'(\d+(?:\.\d+)?)\s*(?:gal|gallon)s?', lambda m: f"{float(m.group(1)) * 3.785:.0f} L"),
        (r'(\d+(?:\.\d+)?)\s*(?:qt|quart)s?', lambda m: f"{m.group(1)} qt"),
        
        # Dry volumes  
        (r'(\d+(?:\.\d+)?)\s*(?:cf|cu\s*ft|cubic\s*f(?:oo)?t)', lambda m: f"{m.group(1)} cu ft"),
        
        # Dimensions
        (r"(\d+)'\s*x\s*(\d+)'", lambda m: f"{m.group(1)}×{m.group(2)} ft"),
        (r'(\d+)\s*x\s*(\d+)\s*(?:ft|feet)?', lambda m: f"{m.group(1)}×{m.group(2)} ft"),
        
        # Duct sizes
        (r'(\d+)["″]\s*(?:duct|inch)?', lambda m: f"{m.group(1)} in"),
        (r'(\d+)\s*(?:inch|in)\s*(?:duct)?', lambda m: f"{m.group(1)} in"),
    ]
    
    def normalize_size(self, raw_value: str) -> str:
        """Normalize size value to standard format."""
        raw = raw_value.strip().lower()
        
        for pattern, replacement in self.SIZE_PATTERNS:
            match = re.search(pattern, raw, re.I)
            if match:
                return replacement(match)
        
        # Return original if no pattern matches
        return raw_value.strip()
    
    def get_sort_order(self, normalized: str) -> int:
        """Return numeric sort order for attribute value."""
        # Extract numeric value for sorting
        match = re.search(r'(\d+(?:\.\d+)?)', normalized)
        if match:
            return int(float(match.group(1)) * 10)
        return 999
```

---

## Migration Strategy

### Phase 1: Audit Current Attributes

```python
def audit_attributes(woo_client):
    """Analyze current attribute usage."""
    products = woo_client.get_all_products()
    
    attribute_usage = defaultdict(lambda: defaultdict(int))
    
    for product in products:
        for attr in product.get('attributes', []):
            name = attr['name'].lower()
            for value in attr.get('options', []):
                attribute_usage[name][value] += 1
    
    return attribute_usage

# Output:
# size:
#   1 Liter: 45
#   1L: 32
#   1 L: 18
#   1 Lt: 5
#   ...
```

### Phase 2: Create Global Attributes

```python
def create_global_attributes(woo_client):
    """Create standardized global attributes."""
    
    ATTRIBUTES = [
        {'name': 'Size', 'slug': 'pa_size', 'type': 'select'},
        {'name': 'Color', 'slug': 'pa_color', 'type': 'select'},
        {'name': 'Wattage', 'slug': 'pa_wattage', 'type': 'select'},
        {'name': 'Duct Size', 'slug': 'pa_duct-size', 'type': 'select'},
        {'name': 'Voltage', 'slug': 'pa_voltage', 'type': 'select'},
        {'name': 'Pack Size', 'slug': 'pa_pack-size', 'type': 'select'},
    ]
    
    for attr in ATTRIBUTES:
        woo_client.create_product_attribute(attr)
```

### Phase 3: Populate Attribute Terms

```python
def populate_size_terms(woo_client):
    """Add standardized size values as terms."""
    
    SIZE_TERMS = [
        # Liquids
        {'name': '250 mL', 'slug': '250-ml'},
        {'name': '500 mL', 'slug': '500-ml'},
        {'name': '1 L', 'slug': '1-l'},
        {'name': '2 L', 'slug': '2-l'},
        {'name': '4 L', 'slug': '4-l'},
        {'name': '10 L', 'slug': '10-l'},
        {'name': '20 L', 'slug': '20-l'},
        # Dry
        {'name': '8 qt', 'slug': '8-qt'},
        {'name': '1 cu ft', 'slug': '1-cu-ft'},
        {'name': '1.5 cu ft', 'slug': '1-5-cu-ft'},
        {'name': '2 cu ft', 'slug': '2-cu-ft'},
        {'name': '3 cu ft', 'slug': '3-cu-ft'},
        # ... etc
    ]
    
    size_attr_id = woo_client.get_attribute_id('pa_size')
    
    for term in SIZE_TERMS:
        woo_client.create_attribute_term(size_attr_id, term)
```

### Phase 4: Migrate Product Attributes

```python
def migrate_product_attributes(woo_client, normalizer):
    """Convert product attributes to global taxonomy."""
    
    products = woo_client.get_all_products()
    
    for product in products:
        new_attributes = []
        
        for attr in product.get('attributes', []):
            name = attr['name'].lower()
            
            if name in ['size', 'sizes', 'product size']:
                # Normalize to pa_size
                normalized_values = [
                    normalizer.normalize_size(v) 
                    for v in attr.get('options', [])
                ]
                new_attributes.append({
                    'id': woo_client.get_attribute_id('pa_size'),
                    'name': 'Size',
                    'options': normalized_values,
                    'visible': True,
                    'variation': True
                })
            else:
                new_attributes.append(attr)
        
        woo_client.update_product(product['id'], {'attributes': new_attributes})
```

---

## CSV Import Format

For imports, use standardized attribute columns:

| Column | Values |
|--------|--------|
| `Attribute 1 name` | Size |
| `Attribute 1 value(s)` | 1 L \| 4 L \| 10 L |
| `Attribute 1 global` | 1 |
| `Attribute 1 visible` | 1 |
| `Attribute 1 default` | 1 L |

Variation rows:
| Column | Value |
|--------|-------|
| `Attribute 1 value(s)` | 1 L |

---

## Pre-Import Normalization

```python
def normalize_import_csv(input_csv, output_csv):
    """Normalize attribute values before WooCommerce import."""
    
    df = pd.read_csv(input_csv)
    normalizer = AttributeNormalizer()
    
    # Find attribute columns
    attr_cols = [c for c in df.columns if 'Attribute' in c and 'value' in c.lower()]
    
    for col in attr_cols:
        # Get corresponding name column
        name_col = col.replace('value(s)', 'name')
        
        for idx, row in df.iterrows():
            if pd.isna(row.get(name_col)):
                continue
            
            attr_name = str(row[name_col]).lower()
            
            if attr_name == 'size':
                values = str(row[col]).split('|')
                normalized = [normalizer.normalize_size(v.strip()) for v in values]
                df.at[idx, col] = ' | '.join(normalized)
    
    df.to_csv(output_csv, index=False)
```

---

## Filter Configuration

### Archive Page Filters

Configure WooCommerce filters to use global attributes:

```php
// functions.php or plugin
add_filter('woocommerce_layered_nav_term_html', function($term_html, $term) {
    // Custom styling for attribute swatches
    if ($term->taxonomy === 'pa_color') {
        // Add color swatch
    }
    return $term_html;
}, 10, 2);

// Sort Size filter by numeric value
add_filter('woocommerce_get_filtered_term_product_counts_query', function($query) {
    if (strpos($query, 'pa_size') !== false) {
        $query = str_replace('ORDER BY', 'ORDER BY CAST(name AS UNSIGNED),', $query);
    }
    return $query;
});
```

---

## CLI Tool

```bash
# Audit current attributes
python scripts/woo/audit_attributes.py
# Output: attribute_audit_20260212.json

# Dry-run normalization
python scripts/woo/normalize_attributes.py --input file.csv --dry-run
# Shows what would change

# Normalize CSV before import
python scripts/woo/normalize_attributes.py --input raw.csv --output normalized.csv

# Migrate existing products to global attributes
python scripts/woo/migrate_attributes.py --dry-run
python scripts/woo/migrate_attributes.py --confirm
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/woo/audit_attributes.py` | Audit current usage |
| `scripts/woo/normalize_attributes.py` | CSV normalization |
| `scripts/woo/migrate_attributes.py` | Live product migration |
| `scripts/woo/attribute_normalizer.py` | Normalization classes |
| `scripts/woo/create_global_attributes.py` | Setup global attributes |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| All Size values normalized | ✅ 100% |
| Global attributes created | ✅ All 8 attributes |
| Products migrated | ✅ 100% using global attributes |
| Archive filters working | ✅ Clean faceted search |
| Variant dropdowns consistent | ✅ Same format everywhere |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Audit & analysis | 0.5 day | Attribute usage report |
| 2. Normalization patterns | 0.5 day | Full pattern library |
| 3. CSV pre-processor | 0.5 day | Import normalization |
| 4. Global attribute setup | 0.5 day | Attributes + terms |
| 5. Product migration | 1 day | All products converted |
| 6. Filter configuration | 0.5 day | Archive filters working |

**Total: ~3.5 days**

---

## Dependencies

- Python 3.10+
- woocommerce>=3.0
- pandas>=2.0
- re (built-in)

---

## References

- [WooCommerce Product Attributes](https://woocommerce.com/document/managing-product-taxonomies/)
- [Global vs Custom Attributes](https://developer.woocommerce.com/2017/12/28/product-attributes-and-variations/)
