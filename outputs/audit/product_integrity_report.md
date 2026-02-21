# Product Integrity Report

Generated: 2026-02-21 14:46

## Sources Compared
- **Ground truth**: Dec 31, 2025 WooCommerce export (1315 SKUs)
- **Current state**: Feb 12, 2026 WooCommerce export (2845 SKUs)
- **Local images**: 2472 unique stems in `hmoonhydro.com/wp-content/uploads/`

## Image Issues

| Issue | Count |
|-------|-------|
| Images LOST (had in Dec31, missing now) | 0 |
| Images CHANGED (different URL) | 329 |
| Products absent from Feb12 export | 117 |
| New products with no image ever | 398 |
| **Restorable from local files** | **0** |

## Grouping Sub-line Issues

Found **12** grouped products mixing distinct sub-product-lines:

| Parent | Sub-line | Mixed Children | Suggested Fix |
|--------|----------|----------------|---------------|
| Bud Boom | Liquid | 6 children | Split "Liquid" children into separate grouped parent "Bud Bo |
| Bud Start | Liquid | 5 children | Split "Liquid" children into separate grouped parent "Bud St |
| Carbo Blast | Liquid | 5 children | Split "Liquid" children into separate grouped parent "Carbo  |
| Ton O Bud 0-10-6 | Liquid | 6 children | Split "Liquid" children into separate grouped parent "Ton O  |
| ONA Block | Pro | 1 children | Split "Pro" children into separate grouped parent "ONA Block |
| ONA Gel | Pro | 4 children | Split "Pro" children into separate grouped parent "ONA Gel P |
| Accessories & Components | Pro | 1 children | Split "Pro" children into separate grouped parent "Accessori |
| Can Filter Flanges | Max | 4 children | Split "Max" children into separate grouped parent "Can Filte |
| PROfilter reversible carbon filters | Pro | 11 children | Split "Pro" children into separate grouped parent "PROfilter |
| Big Bud Bloom Booster | Powder | 2 children | Split "Powder" children into separate grouped parent "Big Bu |
| ONA Spray | Pro | 1 children | Split "Pro" children into separate grouped parent "ONA Spray |
| Clonex Root Maximizer - Granular/ f | Soluble | 3 children | Split "Soluble" children into separate grouped parent "Clone |

## Next Steps

1. **Restore images**: Run image restore for 0 products that have local files
2. **Fix grouping**: Split 12 grouped products that mix sub-product-lines
3. **Source missing images**: 398 products still need images scraped/sourced

### See also
- `outputs/audit/image_regressions.csv`
- `outputs/audit/grouping_issues.csv`
- `outputs/audit/local_image_restores.csv`
- `outputs/audit/missing_images.csv`
