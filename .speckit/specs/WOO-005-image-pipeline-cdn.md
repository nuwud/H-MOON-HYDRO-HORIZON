# SPEC: WOO-005 — Product Image Pipeline & CDN Strategy

## Status: 📋 SPECIFICATION COMPLETE

## Overview
An end-to-end **image processing pipeline** for WooCommerce product images, covering sourcing, optimization, CDN delivery, and SEO. Ensures fast-loading, properly-sized images across all devices with proper alt text and schema markup.

---

## Problem Statement

### Current State
- **10,967 images** in WooCommerce backup, many unoptimized
- **Mixed formats** — JPEG, PNG, WebP inconsistently
- **No CDN** — images served from origin server
- **Missing alt text** — poor accessibility and SEO
- **Oversized images** — 2000px+ images served to mobile
- **No lazy loading** — all images load at once
- **Duplicate images** — same image with different filenames

### Target State
- **All images optimized** — proper compression, dimensions
- **WebP with fallback** — modern format with JPEG backup
- **CDN delivery** — edge-cached images worldwide
- **100% alt text** — all products have descriptive alts
- **Responsive srcset** — correct sizes for each viewport
- **Lazy loading** — below-fold images load on scroll
- **Deduplicated** — no duplicate images wasting storage

---

## Image Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRODUCT IMAGE PIPELINE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   SOURCE     │───▶│   PROCESS    │───▶│   OPTIMIZE   │         │
│  │   Images     │    │   & Resize   │    │   & Convert  │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         │                   │                   │                  │
│  ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐           │
│  │ Local files │    │ Crop/Resize │    │ JPEG 85%    │           │
│  │ Scraped     │    │ 1200x1200   │    │ WebP 80%    │           │
│  │ Uploaded    │    │ + sizes     │    │ AVIF 70%    │           │
│  └─────────────┘    └─────────────┘    └─────────────┘           │
│                                                 │                  │
│                                                 ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   METADATA   │◄───│   STORAGE    │───▶│   CDN        │         │
│  │   & SEO      │    │   & Index    │    │   Delivery   │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│  ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐           │
│  │ Alt text    │    │ wp-content/ │    │ Cloudflare  │           │
│  │ Schema.org  │    │ uploads/    │    │ or BunnyCDN │           │
│  │ OG images   │    │ + DB refs   │    │ Edge cache  │           │
│  └─────────────┘    └─────────────┘    └─────────────┘           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Image Size Standards

### Product Image Sizes

| Name | Dimensions | Use Case | Format |
|------|------------|----------|--------|
| `full` | 1200×1200 | Lightbox zoom | WebP + JPEG |
| `large` | 800×800 | Single product page | WebP + JPEG |
| `medium` | 400×400 | Product archive grid | WebP + JPEG |
| `thumbnail` | 150×150 | Cart, admin | WebP + JPEG |
| `gallery_thumb` | 100×100 | Gallery thumbnails | WebP + JPEG |

### WordPress Size Registration

```php
// functions.php or mu-plugin
add_action('after_setup_theme', function() {
    // Remove default sizes we don't need
    remove_image_size('medium_large');
    remove_image_size('1536x1536');
    remove_image_size('2048x2048');
    
    // Add our optimized sizes
    add_image_size('hmoon-full', 1200, 1200, true);
    add_image_size('hmoon-large', 800, 800, true);
    add_image_size('hmoon-medium', 400, 400, true);
    add_image_size('hmoon-gallery', 100, 100, true);
    
    // Set WooCommerce to use our sizes
    add_filter('woocommerce_get_image_size_single', function() {
        return ['width' => 800, 'height' => 800, 'crop' => 1];
    });
    
    add_filter('woocommerce_get_image_size_thumbnail', function() {
        return ['width' => 400, 'height' => 400, 'crop' => 1];
    });
    
    add_filter('woocommerce_get_image_size_gallery_thumbnail', function() {
        return ['width' => 100, 'height' => 100, 'crop' => 1];
    });
});
```

---

## Image Processing Pipeline

### Step 1: Source Validation

```python
class ImageValidator:
    MIN_DIMENSIONS = (400, 400)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    
    def validate(self, image_path: str) -> dict:
        """Validate image meets quality requirements."""
        
        from PIL import Image
        import magic
        
        errors = []
        warnings = []
        
        # Check file type
        mime = magic.from_file(image_path, mime=True)
        if mime not in self.ALLOWED_TYPES:
            errors.append(f"Invalid type: {mime}")
        
        # Check dimensions
        img = Image.open(image_path)
        w, h = img.size
        
        if w < self.MIN_DIMENSIONS[0] or h < self.MIN_DIMENSIONS[1]:
            warnings.append(f"Low resolution: {w}x{h}")
        
        # Check file size
        size = os.path.getsize(image_path)
        if size > self.MAX_FILE_SIZE:
            errors.append(f"File too large: {size / 1024 / 1024:.1f}MB")
        
        # Check aspect ratio (should be square or near-square)
        ratio = max(w, h) / min(w, h)
        if ratio > 1.5:
            warnings.append(f"Non-square aspect ratio: {ratio:.2f}")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'dimensions': (w, h),
            'file_size': size,
            'mime_type': mime
        }
```

### Step 2: Image Processing

```python
class ImageProcessor:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.sizes = {
            'full': (1200, 1200),
            'large': (800, 800),
            'medium': (400, 400),
            'thumbnail': (150, 150),
            'gallery': (100, 100)
        }
    
    def process(self, source_path: str, product_sku: str) -> dict:
        """Process image into all sizes and formats."""
        
        from PIL import Image
        
        img = Image.open(source_path)
        
        # Convert to RGB if necessary (for WebP/JPEG)
        if img.mode in ('RGBA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[3] if len(img.split()) > 3 else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        outputs = {}
        base_name = self.sanitize_filename(product_sku)
        
        for size_name, dimensions in self.sizes.items():
            # Resize with high-quality resampling
            resized = self.smart_crop(img.copy(), dimensions)
            
            # Save JPEG
            jpeg_path = f"{self.output_dir}/{base_name}-{size_name}.jpg"
            resized.save(jpeg_path, 'JPEG', quality=85, optimize=True)
            
            # Save WebP
            webp_path = f"{self.output_dir}/{base_name}-{size_name}.webp"
            resized.save(webp_path, 'WEBP', quality=80, method=6)
            
            outputs[size_name] = {
                'jpeg': jpeg_path,
                'webp': webp_path,
                'dimensions': dimensions
            }
        
        return outputs
    
    def smart_crop(self, img: Image, target_size: tuple) -> Image:
        """Crop to square, centering on subject."""
        
        # Make square first (center crop)
        w, h = img.size
        min_dim = min(w, h)
        
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim
        
        img = img.crop((left, top, right, bottom))
        
        # Resize to target
        return img.resize(target_size, Image.LANCZOS)
    
    def sanitize_filename(self, sku: str) -> str:
        """Convert SKU to safe filename."""
        return re.sub(r'[^a-zA-Z0-9-]', '-', sku.lower())
```

### Step 3: WebP Conversion with Fallback

```php
// Serve WebP with JPEG fallback
add_filter('wp_get_attachment_image_attributes', function($attr, $attachment) {
    // Check if WebP version exists
    $webp_url = preg_replace('/\.(jpe?g|png)$/i', '.webp', $attr['src']);
    $webp_path = str_replace(
        wp_upload_dir()['baseurl'],
        wp_upload_dir()['basedir'],
        $webp_url
    );
    
    if (file_exists($webp_path)) {
        // Use picture element approach via srcset
        $attr['srcset'] = str_replace('.jpg', '.webp', $attr['srcset'] ?? $attr['src']);
        $attr['data-fallback'] = $attr['src'];  // Original for fallback
    }
    
    return $attr;
}, 10, 2);
```

---

## Alt Text Generation

### Automated Alt Text Pattern

```python
def generate_alt_text(product: dict) -> str:
    """Generate SEO-friendly alt text for product image."""
    
    parts = []
    
    # Brand
    if product.get('brand') and product['brand'] != 'H-Moon Hydro':
        parts.append(product['brand'])
    
    # Product name (cleaned)
    name = product['name']
    # Remove size from name if present
    name = re.sub(r'\s*[-–]\s*\d+(?:\.\d+)?\s*(?:L|Liter|ml|Qt|Gal|oz|lb).*$', '', name, flags=re.I)
    parts.append(name)
    
    # Size if variation
    if product.get('size'):
        parts.append(product['size'])
    
    # Category context
    category = product.get('primary_category', '')
    if category and category.lower() not in name.lower():
        parts.append(f"- {category}")
    
    alt = ' '.join(parts)
    
    # Ensure not too long (125 chars recommended)
    if len(alt) > 125:
        alt = alt[:122] + '...'
    
    return alt

# Examples:
# "Advanced Nutrients Big Bud 1L - Bloom Boosters"
# "FoxFarm Ocean Forest Potting Soil 1.5 cu ft - Grow Media"
# "AC Infinity CLOUDLINE T8 8-inch Inline Fan - Environmental"
```

### Bulk Alt Text Update

```python
def update_all_alt_text(db, woo_client):
    """Update alt text for all product images."""
    
    products = db.products.get_all()
    updated = 0
    
    for product in products:
        woo_product = woo_client.get_product_by_sku(product['sku'])
        if not woo_product:
            continue
        
        alt_text = generate_alt_text(product)
        
        # Update featured image
        if woo_product.get('images'):
            for image in woo_product['images']:
                woo_client.update_media(image['id'], {
                    'alt_text': alt_text
                })
                updated += 1
    
    return updated
```

---

## CDN Strategy

### Option 1: Cloudflare (Recommended)

**Free tier includes:**
- Global CDN for all static assets
- Automatic WebP conversion (Polish)
- Image resizing (paid)

```
Configuration:
- Cache Level: Standard
- Browser TTL: 1 month for images
- Polish: Lossy (auto WebP)
- Mirage: On (lazy load + responsive)

Page Rules:
  *hmoonhydro.com/wp-content/uploads/*
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 month
  - Browser Cache TTL: 1 year
```

### Option 2: BunnyCDN (Budget Alternative)

**~$1/month for typical store:**

```php
// Replace image URLs with CDN
add_filter('wp_get_attachment_url', function($url) {
    if (strpos($url, '/wp-content/uploads/') !== false) {
        $cdn_url = 'https://hmoon.b-cdn.net';
        $url = str_replace(
            'https://hmoonhydro.com/wp-content/uploads',
            $cdn_url,
            $url
        );
    }
    return $url;
});
```

### Option 3: Jetpack Site Accelerator (Free)

```php
// Enable Jetpack CDN for images
add_filter('jetpack_photon_skip_for_url', '__return_false');

// Customize Photon parameters
add_filter('jetpack_photon_url', function($url, $image_url) {
    // Force WebP
    $url = add_query_arg('format', 'webp', $url);
    // Set quality
    $url = add_query_arg('quality', 80, $url);
    return $url;
}, 10, 2);
```

---

## Duplicate Detection

```python
import hashlib
from collections import defaultdict

def detect_duplicate_images(image_dir: str) -> dict:
    """Find duplicate images by content hash."""
    
    hashes = defaultdict(list)
    
    for root, dirs, files in os.walk(image_dir):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                path = os.path.join(root, f)
                
                # Hash file content
                with open(path, 'rb') as file:
                    content_hash = hashlib.md5(file.read()).hexdigest()
                
                hashes[content_hash].append(path)
    
    # Find duplicates (same hash, multiple files)
    duplicates = {h: paths for h, paths in hashes.items() if len(paths) > 1}
    
    return duplicates

def deduplicate_images(duplicates: dict, keep='newest') -> list:
    """Remove duplicate images, keeping one copy."""
    
    removed = []
    
    for hash_value, paths in duplicates.items():
        if keep == 'newest':
            # Sort by modification time, keep newest
            paths.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        elif keep == 'smallest_path':
            # Keep the one with shortest path (usually original)
            paths.sort(key=len)
        
        keeper = paths[0]
        
        for path in paths[1:]:
            # Don't remove if it's a sized version of original
            if not is_sized_variant(path, keeper):
                os.remove(path)
                removed.append(path)
    
    return removed
```

---

## SEO & Schema

### Product Image Schema

```php
// Add image to Product schema
add_filter('woocommerce_structured_data_product', function($data, $product) {
    $image_id = $product->get_image_id();
    
    if ($image_id) {
        $image_url = wp_get_attachment_url($image_id);
        $image_meta = wp_get_attachment_metadata($image_id);
        
        $data['image'] = [
            '@type' => 'ImageObject',
            'url' => $image_url,
            'width' => $image_meta['width'] ?? 800,
            'height' => $image_meta['height'] ?? 800,
        ];
        
        // Add all gallery images
        $gallery_ids = $product->get_gallery_image_ids();
        if ($gallery_ids) {
            $data['image'] = [$data['image']];
            foreach ($gallery_ids as $id) {
                $data['image'][] = [
                    '@type' => 'ImageObject',
                    'url' => wp_get_attachment_url($id)
                ];
            }
        }
    }
    
    return $data;
}, 10, 2);
```

### Open Graph Images

```php
// Set OG image for products
add_action('wp_head', function() {
    if (is_product()) {
        global $product;
        $image_url = wp_get_attachment_url($product->get_image_id());
        
        if ($image_url) {
            echo '<meta property="og:image" content="' . esc_url($image_url) . '" />';
            echo '<meta property="og:image:width" content="800" />';
            echo '<meta property="og:image:height" content="800" />';
        }
    }
});
```

---

## CLI Tools

```bash
# Validate all product images
python scripts/images/validate_images.py --input outputs/woocommerce_MASTER_IMPORT.csv
# Output: image_validation_report.csv

# Process and optimize images
python scripts/images/process_images.py \
    --source hmoonhydro.com/wp-content/uploads/ \
    --output outputs/processed_images/ \
    --format webp,jpeg

# Generate alt text for all products
python scripts/images/generate_alt_text.py \
    --input outputs/woocommerce_MASTER_IMPORT.csv \
    --output outputs/product_alt_text.csv

# Find duplicate images
python scripts/images/deduplicate.py \
    --source hmoonhydro.com/wp-content/uploads/ \
    --dry-run

# Upload processed images to WordPress
python scripts/images/upload_images.py \
    --input outputs/processed_images/ \
    --map outputs/image_product_map.csv
```

---

## Image Index Schema

```json
{
  "images": {
    "an-big-bud-1l": {
      "original": "hmoonhydro.com/wp-content/uploads/2021/03/big-bud-1l.jpg",
      "processed": {
        "full": {
          "jpeg": "processed/an-big-bud-1l-full.jpg",
          "webp": "processed/an-big-bud-1l-full.webp"
        },
        "large": {
          "jpeg": "processed/an-big-bud-1l-large.jpg",
          "webp": "processed/an-big-bud-1l-large.webp"
        }
      },
      "alt_text": "Advanced Nutrients Big Bud 1L - Bloom Boosters",
      "dimensions": {
        "original": [2000, 2000],
        "processed": [1200, 1200]
      },
      "file_size": {
        "original": 524288,
        "webp_large": 45632
      },
      "product_sku": "AN-BIGBUD-1L"
    }
  }
}
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/images/validate_images.py` | Image validation |
| `scripts/images/process_images.py` | Resize + convert |
| `scripts/images/generate_alt_text.py` | Alt text generation |
| `scripts/images/deduplicate.py` | Find/remove duplicates |
| `scripts/images/upload_images.py` | WordPress upload |
| `mu-plugins/hmoon-image-delivery.php` | CDN + WebP serving |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| All images optimized | ✅ 100% processed |
| WebP versions available | ✅ 100% |
| Alt text coverage | ✅ 100% |
| Average image size | ✅ <100KB (large) |
| CDN hit ratio | ✅ >95% |
| Duplicate images removed | ✅ 0 duplicates |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Audit existing images | 0.5 day | Quality report |
| 2. Processing pipeline | 1 day | Batch processor |
| 3. Alt text generation | 0.5 day | All products |
| 4. CDN configuration | 0.5 day | Cloudflare/Bunny |
| 5. Deduplication | 0.5 day | Clean storage |
| 6. WordPress integration | 0.5 day | WebP serving |

**Total: ~3.5 days**

---

## Dependencies

- Python 3.10+
- Pillow>=10.0
- python-magic
- woocommerce>=3.0
- Cloudflare account or BunnyCDN

---

## References

- [WebP Compression Study](https://developers.google.com/speed/webp/docs/webp_study)
- [WooCommerce Image Settings](https://woocommerce.com/document/woocommerce-customizer/)
- [WordPress Responsive Images](https://developer.wordpress.org/plugins/media/working-with-images/)
- [Cloudflare Polish](https://developers.cloudflare.com/images/polish/)
