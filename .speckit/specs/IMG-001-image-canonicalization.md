# IMG-001: Product Image Canonicalization System

## Overview
Establish a canonical mapping between products and images by:
1. Parsing WooCommerce SQL for proper product→image relationships
2. Renaming images to SEO-friendly names matching product handles
3. Creating a reliable image pipeline for Shopify import

## Problem Statement
- WooCommerce images have arbitrary filenames (`FloraBloom.jpg`, `product_BIGBLOOM.jpg`)
- Shopify handles are slugified (`floragro-general-hydroponics-1-gallon`)
- Current matching relies on fuzzy algorithms (Dice, Jaccard) with ~40% threshold
- No canonical 1:1 mapping exists between products and their images
- 2,225 original images exist locally but many are unmatched

## Solution: Two-Phase Approach

### Phase 1: Build Definitive Product→Image Map from WooCommerce SQL

**Goal:** Parse SQL to get the ACTUAL relationships WordPress used.

**Data needed from SQL:**
- `wp_posts` where `post_type = 'attachment'` → gives `ID`, `guid` (file URL), `post_parent`
- `wp_postmeta` where `meta_key = '_wp_attached_file'` → gives relative file path
- `wp_postmeta` where `meta_key = '_thumbnail_id'` → links product ID → attachment ID
- `wp_postmeta` where `meta_key = '_product_image_gallery'` → additional image IDs

**Output:** `outputs/woo_product_image_map.json`
```json
{
  "floragro-general-hydroponics": {
    "productId": 13163,
    "thumbnailId": 872,
    "thumbnailPath": "wp-content/uploads/2019/08/FloraGro.jpg",
    "galleryIds": [873, 874],
    "galleryPaths": ["...", "..."]
  }
}
```

### Phase 2: Rename Images to SEO-Friendly Handles

**Goal:** Create canonical image names that match product handles.

**Naming Convention:**
```
{handle}-{position}.{ext}
```

Examples:
- `floragro-general-hydroponics-1-gallon-1.jpg` (main image)
- `floragro-general-hydroponics-1-gallon-2.jpg` (gallery image 1)
- `floragro-general-hydroponics-1-gallon-3.jpg` (gallery image 2)

**Output Directory:** `outputs/canonical-images/`

**Benefits:**
1. **SEO:** File names match product names for image search
2. **No Ambiguity:** Direct handle→filename mapping
3. **Variant Support:** `{handle}-{variant}-{position}.jpg` if needed
4. **Alt Text Auto-Generation:** Derive from filename

## Implementation Tasks

### Task 1: Upgrade `parseWooCommerceSQL.ts`
Add parsing of `wp_posts` attachments to resolve `imageId` → file path.

**Changes:**
```typescript
// Add attachment parsing
if (fullLine.includes('wp_posts') && fullLine.includes('INSERT INTO')) {
  // Parse for post_type = 'attachment' 
  // Store: id, guid, post_parent
}

// Add _wp_attached_file parsing  
if (metaKey === '_wp_attached_file') {
  attachments.set(postId, metaValue); // "2019/08/FloraGro.jpg"
}
```

### Task 2: Create `build_canonical_image_map.js`
Combines:
- WooCommerce product→attachment relationships
- Attachment→file path mappings
- Local file verification (does file exist?)

### Task 3: Create `rename_images_seo.js`
- Reads canonical map
- Copies images to `outputs/canonical-images/`
- Renames using SEO-friendly handle-based names
- Creates `image_manifest.json` with old→new mappings

### Task 4: Update Import Pipeline
Modify `runFullImportPipeline.ts` to use canonical image paths.

## Acceptance Criteria

1. [ ] SQL parser extracts attachment ID → file path mappings
2. [ ] Canonical map covers 90%+ of products with images
3. [ ] Renamed images in `outputs/canonical-images/`
4. [ ] Manifest maps old filenames to new SEO names
5. [ ] Import pipeline uses canonical images
6. [ ] Fallback to fuzzy matching for unmapped products

## Data Sources

| Source | Location | Purpose |
|--------|----------|---------|
| WooCommerce SQL | `hmoonhydro.com/hmoonhydro_com_1.sql` | Product→image relationships |
| WP Uploads | `hmoonhydro.com/wp-content/uploads/` | 2,225 original images |
| Thumbnail IDs | `CSVs/woo_thumbnail_ids.txt` | Extracted ID mappings |
| Product Lookup | `CSVs/woo_products_lookup.json` | Product slug→data |

## Existing Scripts to Leverage

| Script | Location | Upgrades Needed |
|--------|----------|-----------------|
| `parseWooCommerceSQL.ts` | `hmoon-pipeline/src/cli/` | Add attachment parsing |
| `enhanced_image_match.js` | root | Use as fallback |
| `aggressive_image_match.js` | `scripts/` | Use as fallback |
| `build_woo_image_index.js` | `scripts/` | Merge into canonical pipeline |

## Rollback Strategy
- Keep original images untouched in `wp-content/uploads/`
- Canonical images are copies, not moves
- Manifest enables reverse mapping if needed

## Success Metrics
- Products with matched images: >95%
- Image filename = product handle: 100% (for matched)
- Zero duplicate image references
- Import ready within 1 hour of spec completion
