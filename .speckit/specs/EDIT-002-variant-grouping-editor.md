# EDIT-002: Enhanced Product Editor with Variant Grouping

## Summary
Create a comprehensive browser-based product editor that allows:
1. **Drag & Drop Variant Grouping** - Combine separate products into multi-variant products
2. **Multi-Image Management** - Add, reorder, delete multiple images per product
3. **Individual Save** - Save each product as you go
4. **Batch Operations** - Select and modify multiple products at once
5. **Smart Search** - Google Images, Amazon, manufacturer links
6. **Export Corrected CSV** - Generate properly consolidated import file
7. **WooCommerce Integration** - Import parent/child relationships from WooCommerce exports

## Current Status: ✅ Phase 1 + Phase 2 Complete (Jan 2026)

### Implemented Features

#### WooCommerce Integration (NEW)
- **Data Parser**: `scripts/parse_woo_data.js` parses fresh WooCommerce exports
- **Parent/Child Detection**: Identifies 252 parent groups with 843 children from WooCommerce `Grouped products` field
- **Category Mapping**: Extracts product categories for filtering
- **Data File**: `outputs/woo_groups.json` stores the hierarchy

#### Visual Hierarchy
- **Parent Products**: Highlighted with 📦 badge, collapsible children
- **Child Products**: Indented with ↳ indicator, linked to parent
- **Expand/Collapse**: Click toggle to show/hide children under parents

#### Category Filter
- **Dropdown Filter**: Filter products by WooCommerce category
- **Multi-category Support**: Products can belong to multiple categories

#### Tab Navigation (5 Tabs in 3x2 Grid)
| Tab | Purpose |
|-----|---------|
| All Products | Show all products with WooCommerce hierarchy |
| Ungrouped | Products not yet grouped as Shopify variants |
| Grouped | Products already grouped as Shopify variants |
| 📦 WooCommerce Parents | Only show parent products from WooCommerce |
| ↳ WooCommerce Children | Only show child products from WooCommerce |

#### Multi-Select Operations
- Checkbox selection with Ctrl+click
- "Group Selected" button to merge into variants
- Selection counter in toolbar

## Problem Statement
WooCommerce products are importing as separate products when they should be variants. For example:
- "FloraMicro 1 qt" → should be variant of "FloraMicro"
- "FloraMicro 1 gal" → should be variant of "FloraMicro"
- "FloraMicro 6 gal" → should be variant of "FloraMicro"

The current import process creates 3 separate product listings instead of 1 product with 3 size variants.

## Feature Requirements

### 1. Variant Grouping UI
- **Group Detection Panel**: Show products that look like they should be grouped (same base name, different sizes/colors)
- **Drag & Drop**: Drag a product onto another to make it a variant
- **Auto-Suggest Groups**: AI/pattern matching to suggest groupings like "Product Name" + size patterns (qt, gal, lt, oz, ml, lb, kg, etc.)
- **Variant Options**: Set Option1 Name (Size), Option1 Value (1 qt), Option2, Option3
- **Parent Selection**: Choose which product becomes the "parent" (gets the primary handle)

### 2. Multi-Image Support
- **Up to 10 images per product**
- **Drag to reorder** image positions
- **Set primary image** (position 1)
- **Image preview** with zoom
- **Add from URL** with source tracking
- **Quick search links**: Google Images, Amazon, manufacturer, HTG Supply, Grow Generation

### 3. Product Data Editing
- Title (editable)
- Description (HTML, word count, suggestions)
- Vendor (dropdown from known brands)
- Tags (comma-separated, suggestions)
- Price
- SKU
- Weight (grams)
- SEO Title / Description
- Spec Sheet URL
- MSDS/SDS URL

### 4. Save & Export
- **Save Individual**: LocalStorage auto-save + manual "Save" button
- **Save Batch**: Select multiple products, apply changes to all
- **Export JSON**: Full edit history for backup
- **Export CSV**: Shopify-ready CSV with:
  - Proper variant grouping (same Handle = variants)
  - Option1 Name, Option1 Value properly set
  - All images included

### 5. Filtering & Search
- Search by title, SKU, vendor
- Filter: No image, needs description, low quality, edited
- Filter: Grouped / Ungrouped / Suggested groups
- Sort: Alphabetical, by vendor, by edit status

### 6. Quality Indicators
- 🔴 No image
- 🟠 Poor description (<50 words)
- 🟡 Missing vendor
- 🟢 Complete product

## Technical Approach

### Data Model
```javascript
interface EditedProduct {
  handle: string;           // Shopify handle
  parentHandle?: string;    // If variant, parent's handle
  isVariant: boolean;
  
  title: string;
  body: string;
  vendor: string;
  tags: string[];
  price: string;
  sku: string;
  weightGrams: number;
  
  // Variant-specific
  option1Name?: string;     // "Size"
  option1Value?: string;    // "1 Gallon"
  option2Name?: string;
  option2Value?: string;
  
  // Images
  images: Array<{
    src: string;
    position: number;
    alt: string;
    source: string;         // Where it came from
  }>;
  
  // SEO
  seoTitle: string;
  seoDesc: string;
  
  // Documents
  specSheet?: string;
  msds?: string;
  
  // Meta
  editedAt: string;
  editedFields: string[];
}

interface ProductGroup {
  parentHandle: string;
  parentTitle: string;
  variants: string[];       // handles of variant products
  optionName: string;       // "Size", "Color", etc.
  suggested: boolean;       // AI-suggested or user-created
}
```

### Size Pattern Detection
```javascript
const SIZE_PATTERNS = [
  // Volume
  /(\d+(?:\.\d+)?)\s*(gal(?:lon)?s?|qt|quarts?|pt|pints?|lt|liters?|ml|oz|fl\.?\s*oz)/i,
  // Weight  
  /(\d+(?:\.\d+)?)\s*(lb|lbs?|pounds?|kg|g|gm|grams?|oz)/i,
  // Quantity
  /(\d+)\s*(pack|pk|ct|count|pc|pcs|pieces?)/i,
  // Dimensions
  /(\d+)\s*(in|inch|"|ft|feet|\')/i,
];

function extractVariantOption(title) {
  for (const pattern of SIZE_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      return {
        name: detectOptionName(match[2]),  // "Size", "Weight", "Quantity"
        value: match[0]                     // "1 gal", "5 lb"
      };
    }
  }
  return null;
}
```

### Grouping Algorithm
1. Normalize titles (remove size/quantity patterns)
2. Group by normalized title + vendor
3. Rank groups by similarity score
4. Present suggested groups to user
5. User confirms/rejects/modifies

## UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  🌱 Product Editor - H-Moon Hydro                    [Export CSV] [💾]│
├────────────────────────┬─────────────────────────────────────────────┤
│  Search: [___________] │  📝 Editing: "FloraMicro"                   │
│  ──────────────────────│  ┌─────────────────────────────────────────┐│
│  Filter: [All ▼]       │  │  🖼️ Images (3)                    [+ Add]││
│                        │  │  ┌───┐ ┌───┐ ┌───┐ ┌ ─ ─ ┐              ││
│  📦 Products (1193)    │  │  │ 1 │ │ 2 │ │ 3 │ │  +  │              ││
│  ──────────────────────│  │  └───┘ └───┘ └───┘ └ ─ ─ ┘              ││
│  ☐ FloraMicro (3 var)  │  │  [Google] [Amazon] [HTG] [Mfr]          ││
│    ├─ 1 qt             │  └─────────────────────────────────────────┘│
│    ├─ 1 gal            │  ┌─────────────────────────────────────────┐│
│    └─ 6 gal            │  │  Variants: FloraMicro                   ││
│  ☐ FloraBloom          │  │  Option: Size                           ││
│  ☐ FloraGro            │  │  ┌─────────────┬────────────┐           ││
│  ☐ CALiMAGic           │  │  │ 1 qt        │ $12.99     │  [↑][↓][x]││
│  ...                   │  │  │ 1 gal       │ $38.99     │  [↑][↓][x]││
│                        │  │  │ 6 gal       │ $189.99    │  [↑][↓][x]││
│  ─── Suggested Groups ─│  │  └─────────────┴────────────┘           ││
│  🔗 Big Bloom (3)      │  │  [+ Add Variant]  [Ungroup]             ││
│  🔗 Tiger Bloom (2)    │  └─────────────────────────────────────────┘│
│  🔗 Grow Big (3)       │                                             │
│                        │  Title: [FloraMicro___________________]     │
│                        │  Vendor: [General Hydroponics ▼]            │
│                        │  Description: [________________________]    │
│                        │  Tags: [nutrients, hydro, GH____________]   │
│                        │  [💾 Save] [↩️ Reset] [🗑️ Delete]           │
└────────────────────────┴─────────────────────────────────────────────┘
```

## Implementation Plan

1. **Phase 1**: Basic variant grouping UI (drag & drop)
2. **Phase 2**: Auto-suggest groups based on title patterns
3. **Phase 3**: Multi-image management
4. **Phase 4**: CSV export with proper variant structure
5. **Phase 5**: Batch operations

## Files Created
- `scripts/parse_woo_data.js` - Parses WooCommerce CSV exports into hierarchy JSON
- `scripts/generate_variant_editor.js` - HTML generator
- `outputs/variant_editor.html` - The editor UI (1800+ lines)
- `outputs/woo_groups.json` - WooCommerce parent/child hierarchy data

## Data Flow
```
WooCommerce CSV Export
    ↓ (parse_woo_data.js)
outputs/woo_groups.json
    ↓ (async fetch in variant_editor.html)
Browser UI with hierarchy visualization
    ↓ (user drag-drop grouping)
Export as Shopify-ready CSV
```

## Success Criteria
- [x] Can drag products to group as variants
- [x] WooCommerce parent/child relationships display correctly
- [x] Category filter works
- [x] Expand/collapse parent groups works
- [x] Multi-select with checkboxes works
- [ ] Groups export as single product with multiple variants
- [x] Multiple images per product displayed
- [ ] Individual product save works
- [ ] Batch select and modify works
- [ ] Export produces valid Shopify import CSV

## Next Steps (Phase 3+)
1. **Export Functionality**: Generate Shopify CSV from grouped products
2. **LocalStorage Persistence**: Save/restore grouping state
3. **Image Enrichment**: Add images from scraping results
4. **Bulk Import**: "Import All" WooCommerce groups at once
