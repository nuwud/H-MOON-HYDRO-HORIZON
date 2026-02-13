# SPEC: IMAGE-004 — Local Image Matching System

## Status: 📋 SPECIFICATION COMPLETE

## Overview
A comprehensive system for matching products missing images to the **10,967 local image files** in the WooCommerce backup (`hmoonhydro.com/wp-content/uploads/`). Uses multiple matching strategies including SKU, product name, brand, and fuzzy text matching.

---

## Problem Statement

### Current State
- **131 products** have no images (8.9% of catalog)
- **10,967 images** exist locally in WooCommerce backup
- **No automated matching** between products and local images
- **Manual matching** is time-consuming and error-prone

### Target State
- **Automated matching** using multiple strategies
- **Confidence scoring** for each match
- **Human review queue** for low-confidence matches
- **Direct image assignment** for high-confidence matches
- **<50 products** remaining without images

---

## Local Image Inventory

### Directory Structure
```
hmoonhydro.com/wp-content/uploads/
├── 2019/
│   ├── 01/ through 12/
│   └── [~1,200 images]
├── 2020/
│   └── [~2,100 images]
├── 2021/
│   └── [~2,500 images]
├── 2022/
│   └── [~2,300 images]
├── 2023/
│   └── [~1,800 images]
├── 2024/
│   └── [~1,067 images]
└── woocommerce_uploads/
    └── [product-specific images]
```

### Image File Patterns
| Pattern | Example | Count Est. |
|---------|---------|------------|
| Product photos | `big-bud-1l.jpg` | ~4,000 |
| Scaled versions | `*-scaled.jpg` | ~2,000 |
| WebP variants | `*.webp` | ~1,500 |
| Thumbnails | `*-150x150.jpg` | ~3,000 |
| Size variants | `*-300x300.jpg`, `*-600x600.jpg` | ~2,500 |

### Image Quality Tiers
| Tier | Criteria | Priority |
|------|----------|----------|
| **Original** | No size suffix, largest file | Use first |
| **Scaled** | `-scaled.jpg/webp` | Use second |
| **Large** | `-600x600` or larger | Use third |
| **Medium** | `-300x300` | Fallback |
| **Thumbnail** | `-150x150` or smaller | Never use |

---

## Matching Strategies

### Strategy 1: WooCommerce Export Image URLs (Highest Confidence)

The WooCommerce export contains image URLs like:
```
https://hmoonhydro.com/wp-content/uploads/2020/05/big-bud-1l.jpg
```

Map directly to local path:
```
hmoonhydro.com/wp-content/uploads/2020/05/big-bud-1l.jpg
```

**Confidence: 1.0** (exact match)

### Strategy 2: SKU-Based Filename Match

Match product SKU to image filename patterns:

| Product SKU | Potential Filenames |
|-------------|---------------------|
| `AN-BIGBUD-1L` | `big-bud-1l.*`, `bigbud-1l.*`, `an-big-bud.*` |
| `FF-OCEAN-1GAL` | `foxfarm-ocean-forest.*`, `ff-ocean.*`, `ocean-forest.*` |
| `GH-FLORA-1QT` | `flora-gro.*`, `general-hydroponics-flora.*`, `gh-flora.*` |

**Confidence: 0.8-0.95** (depends on match quality)

### Strategy 3: Product Name Similarity

Use fuzzy matching between product name and image filename:

```python
from rapidfuzz import fuzz

product = "Advanced Nutrients Big Bud Liquid 1L"
filename = "big-bud-1l-advanced-nutrients.jpg"

# Tokenize and match
score = fuzz.token_set_ratio(
    product.lower().replace(' ', '-'),
    filename.lower().replace('.jpg', '')
)
# score = 85 → Good match
```

**Confidence: 0.6-0.9** (based on similarity score)

### Strategy 4: Brand + Size Extraction

Extract brand and size from product, match to image:

```python
product = "FoxFarm Ocean Forest 1.5 Cu Ft"
# Extract: brand="foxfarm", size="1-5-cu-ft"
# Search pattern: *foxfarm*ocean*forest* OR *ocean*forest*1-5*
```

**Confidence: 0.7-0.85**

### Strategy 5: WooCommerce Product ID Lookup

If we have WooCommerce product IDs, query image metadata:

```python
# From WooCommerce export
woo_id = 12345
# Check: uploads/attachment metadata for post_parent=12345
```

**Confidence: 0.95** (if metadata available)

---

## Matching Algorithm

```python
class ImageMatcher:
    def __init__(self, image_dir: str, products: list):
        self.image_index = self.build_image_index(image_dir)
        self.products = products
    
    def build_image_index(self, image_dir: str) -> dict:
        """Index all images by normalized filename, excluding thumbnails."""
        index = {}
        for root, dirs, files in os.walk(image_dir):
            for f in files:
                if self.is_valid_image(f):
                    key = self.normalize_filename(f)
                    path = os.path.join(root, f)
                    size = os.path.getsize(path)
                    # Keep largest version
                    if key not in index or size > index[key]['size']:
                        index[key] = {'path': path, 'size': size, 'original': f}
        return index
    
    def is_valid_image(self, filename: str) -> bool:
        """Exclude thumbnails and small variants."""
        exclude_patterns = ['-150x150', '-100x100', '-50x50', 'thumb']
        ext = filename.lower().split('.')[-1]
        if ext not in ['jpg', 'jpeg', 'png', 'webp', 'gif']:
            return False
        for pattern in exclude_patterns:
            if pattern in filename.lower():
                return False
        return True
    
    def normalize_filename(self, filename: str) -> str:
        """Normalize for matching: lowercase, remove size suffixes."""
        name = filename.lower()
        # Remove size variants
        name = re.sub(r'-\d+x\d+', '', name)
        name = re.sub(r'-scaled', '', name)
        # Remove extension
        name = re.sub(r'\.(jpg|jpeg|png|webp|gif)$', '', name)
        return name
    
    def find_matches(self, product: dict) -> list:
        """Find all potential image matches for a product."""
        matches = []
        
        # Strategy 1: Exact URL match
        if product.get('images'):
            url_match = self.match_by_url(product['images'])
            if url_match:
                matches.append({'path': url_match, 'confidence': 1.0, 'strategy': 'url'})
        
        # Strategy 2: SKU match
        if product.get('sku'):
            sku_matches = self.match_by_sku(product['sku'])
            matches.extend(sku_matches)
        
        # Strategy 3: Name similarity
        name_matches = self.match_by_name(product['name'])
        matches.extend(name_matches)
        
        # Strategy 4: Brand + Size
        brand_matches = self.match_by_brand_size(
            product.get('brand', ''),
            product['name']
        )
        matches.extend(brand_matches)
        
        # Dedupe and sort by confidence
        return self.dedupe_matches(matches)
    
    def match_by_sku(self, sku: str) -> list:
        """Match SKU to filename patterns."""
        matches = []
        # Normalize SKU
        sku_norm = sku.lower().replace('-', '').replace('_', '')
        
        for key, info in self.image_index.items():
            key_norm = key.replace('-', '').replace('_', '')
            
            # Exact match
            if sku_norm in key_norm:
                matches.append({
                    'path': info['path'],
                    'confidence': 0.9,
                    'strategy': 'sku_exact'
                })
            # Partial match (75%+ of SKU)
            elif fuzz.partial_ratio(sku_norm, key_norm) > 75:
                matches.append({
                    'path': info['path'],
                    'confidence': 0.75,
                    'strategy': 'sku_partial'
                })
        
        return matches
    
    def match_by_name(self, name: str) -> list:
        """Fuzzy match product name to image filename."""
        matches = []
        name_tokens = set(name.lower().split())
        
        for key, info in self.image_index.items():
            key_tokens = set(key.replace('-', ' ').replace('_', ' ').split())
            
            # Token overlap
            overlap = len(name_tokens & key_tokens)
            total = len(name_tokens | key_tokens)
            
            if total > 0:
                jaccard = overlap / total
                if jaccard > 0.3:  # At least 30% token overlap
                    # Also check fuzzy ratio
                    ratio = fuzz.token_set_ratio(name.lower(), key) / 100
                    confidence = (jaccard + ratio) / 2
                    
                    if confidence > 0.5:
                        matches.append({
                            'path': info['path'],
                            'confidence': confidence,
                            'strategy': 'name_fuzzy'
                        })
        
        return matches
```

---

## Output Files

### High-Confidence Matches (Auto-Apply)
`outputs/image_matches_auto.csv`

| SKU | Product Name | Image Path | Confidence | Strategy |
|-----|--------------|------------|------------|----------|
| AN-BIGBUD-1L | Advanced Nutrients Big Bud 1L | uploads/2021/03/big-bud-1l.jpg | 0.95 | sku_exact |

**Threshold: confidence >= 0.85**

### Review Queue (Human Verification)
`outputs/image_matches_review.csv`

| SKU | Product Name | Image Path | Confidence | Strategy | Notes |
|-----|--------------|------------|------------|----------|-------|
| GH-FLORA-1QT | GH Flora Gro 1 Qt | uploads/2020/06/flora-series.jpg | 0.72 | name_fuzzy | Multiple Flora products |

**Threshold: 0.50 <= confidence < 0.85**

### No Matches Found
`outputs/image_matches_none.csv`

Products that couldn't be matched to any local image with confidence >= 0.50.

---

## CLI Tool

```bash
# Build image index
python scripts/images/build_image_index.py
# Output: outputs/image_index.json (~10,967 entries)

# Run matching against products
python scripts/images/match_images.py --input outputs/woocommerce_MASTER_IMPORT.csv
# Output: 
#   outputs/image_matches_auto.csv
#   outputs/image_matches_review.csv
#   outputs/image_matches_none.csv

# Apply auto matches to import file
python scripts/images/apply_image_matches.py \
    --input outputs/woocommerce_MASTER_IMPORT.csv \
    --matches outputs/image_matches_auto.csv \
    --output outputs/woocommerce_with_images.csv

# Review tool (interactive)
python scripts/images/review_matches.py
# Shows image + product side-by-side for manual approval
```

---

## Image Index Schema

`outputs/image_index.json`

```json
{
  "big-bud-1l": {
    "path": "hmoonhydro.com/wp-content/uploads/2021/03/big-bud-1l.jpg",
    "original_filename": "big-bud-1l.jpg",
    "size_bytes": 245632,
    "dimensions": [800, 800],
    "year": 2021,
    "month": 3,
    "has_webp": true,
    "has_scaled": true
  },
  "foxfarm-ocean-forest": {
    "path": "hmoonhydro.com/wp-content/uploads/2020/05/FoxFarm-Ocean-Forest.jpg",
    "original_filename": "FoxFarm-Ocean-Forest.jpg",
    "size_bytes": 189456,
    "dimensions": [600, 600],
    "year": 2020,
    "month": 5,
    "has_webp": false,
    "has_scaled": true
  }
}
```

---

## Match Report

After running the matching algorithm, generate a summary:

```
=== IMAGE MATCHING REPORT ===

Total Products: 1,475
Products Missing Images: 131

Matching Results:
  High-Confidence (auto-apply): 78 (59.5%)
  Review Queue: 31 (23.7%)
  No Matches: 22 (16.8%)

Strategy Breakdown:
  URL Exact: 45 matches
  SKU Exact: 18 matches
  SKU Partial: 15 matches
  Name Fuzzy: 28 matches
  Brand+Size: 3 matches

After Auto-Apply:
  Products with Images: 1,397 (94.7%)
  Products Missing Images: 53 (3.6%)
  Products in Review: 25 (1.7%)
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/images/build_image_index.py` | Scan uploads dir, build index |
| `scripts/images/match_images.py` | Run matching algorithm |
| `scripts/images/apply_image_matches.py` | Apply matches to CSV |
| `scripts/images/review_matches.py` | Interactive review tool |
| `scripts/images/image_utils.py` | Shared utilities |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Image index built | ✅ All 10,967 images indexed |
| Matching algorithm accuracy | ✅ >90% precision on auto-apply |
| Human review queue size | ✅ <40 products |
| Final products missing images | ✅ <50 |
| Processing time | ✅ <5 minutes total |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Build Image Index | 0.5 day | `image_index.json` with all images |
| 2. Matching Algorithm | 1 day | Multi-strategy matcher |
| 3. Auto-Apply Pipeline | 0.5 day | CSV enrichment working |
| 4. Review Tool | 1 day | Interactive approval UI |
| 5. Documentation | 0.5 day | Usage guide |

**Total: ~3.5 days**

---

## Dependencies

- Python 3.10+
- rapidfuzz>=3.0 (fuzzy matching)
- Pillow>=10.0 (image dimensions)
- rich (CLI output)
- pandas>=2.0

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low match rate | Medium | Multiple fallback strategies |
| False positives | Medium | Review queue for uncertain matches |
| Large image index | Low | JSON streaming, chunked processing |
| Missing dimensions | Low | Fallback to file size |

---

## References

- [rapidfuzz Documentation](https://github.com/maxbachmann/RapidFuzz)
- [Pillow Image Processing](https://pillow.readthedocs.io/)
- Previous spec: [IMAGE-002](IMAGE-002-product-image-scraping.md)
