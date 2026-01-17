# SPEC: IMAGE-001 — Product Image SEO Optimization

## Overview
Rename and optimize product images in Shopify with SEO-friendly filenames and alt text.

## Status: ✅ PHASE 1 COMPLETE (Alt Text Generated)

## Completion Summary (2025-01-09)

### Delivered
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Alt text generated | All images | 758 images | ✅ |
| Already had alt | - | 92 images | ✅ |
| Template compliance | SEO template | 100% | ✅ |
| Max length | 125 chars | ≤125 chars | ✅ |

### Script Delivered
- `scripts/generate_alt_text.js` — Generates SEO-friendly alt text
- **Template**: `{Brand} {Product Name} - {Variant} | H-Moon Hydro`
- **Output**: `CSVs/products_export_with_alt.csv`

### Sample Alt Text
```
"Zero Tolerance Pest Control gal | H-Moon Hydro"
"Yield Up 9-47-9 2 kg | H-Moon Hydro"
"UNO-2 Speed 10" in line Blower 845 cfm | H-Moon Hydro"
```

---

## Goals
1. ~~Rename image files to SEO-friendly format~~ (Deferred - Shopify API limitation)
2. ✅ Add descriptive alt text to all product images
3. Compress images for faster load times (Phase 2)
4. Add structured data for Google Images (SEO-001)

## Current State
- **Total Products**: 1,199
- **With Images**: 842 (70.2%)
- **Missing Images**: 357 (29.8%)
- **Images needing alt text**: ~90%

## Implementation Options

### Option A: Shopify Admin Bulk Editor
- Use Shopify Admin → Products → Bulk editor
- Select all products → Edit → Add alt text
- **Pros**: No code needed
- **Cons**: Manual, cannot rename files

### Option B: Shopify CLI + Theme API
- Use `shopify theme` commands
- Update metafields for alt text
- **Pros**: Automated, scriptable
- **Cons**: Cannot rename image files via API

### Option C: GraphQL Product Media API
```graphql
mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
  productUpdateMedia(productId: $productId, media: $media) {
    media {
      alt
    }
  }
}
```
- **Pros**: Can update alt text programmatically
- **Cons**: Still cannot rename files

### Option D: Re-upload Images (Full Solution)
1. Download all current images
2. Rename locally to SEO format
3. Delete existing images from Shopify
4. Re-upload with new names
- **Pros**: Complete control over filenames
- **Cons**: Time-consuming, may break variant associations

## Recommended Approach

### Phase 1: Alt Text Optimization (Quick Win)
Create script to generate and apply SEO-friendly alt text:
```
{Brand} {Product Name} - {Variant Option} | H-Moon Hydro
```

Example:
```
General Hydroponics FloraSeries Trio - 1 Gallon | H-Moon Hydro
```

### Phase 2: Image Filename Audit
Generate report of current image filenames vs ideal SEO names.

### Phase 3: Gradual Re-upload (Optional)
For new products or products being updated, use SEO-optimized filenames.

## Alt Text Generation Rules

1. **Include brand name** first (helps brand recognition)
2. **Include product name** (main keyword)
3. **Include variant** if applicable (size, color)
4. **Include store name** (branding)
5. **Max length**: 125 characters
6. **Avoid**: "image of", "picture of", "photo of"

## Script to Create

`scripts/generate_alt_text.js`:
- Read products from CSV
- Generate alt text using template
- Output CSV with Image Alt Text column populated

## Files to Modify
- `CSVs/products_export_final.csv` — Add alt text to Image Alt Text column

## Success Criteria
- [ ] 100% of images have alt text
- [ ] Alt text follows SEO template
- [ ] Alt text < 125 characters
- [ ] Includes brand + product + variant

## Dependencies
- Completed product enrichment (descriptions, categories)
- Brand normalization via `brandRegistry.ts`

## Related Specs
- SEO-001: Product SEO & structured data
- THEME-001: Multi-product catalog theme upgrade
