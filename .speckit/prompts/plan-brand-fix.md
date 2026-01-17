# Plan Template: Brand Product Fix

Use this template to create implementation plans for fixing products from a specific brand.

## Variables to Replace

| Variable | Description | Example |
|----------|-------------|---------|
| `{{BRAND}}` | Brand name (proper case) | `Grease`, `Fox Farm`, `AC Infinity` |
| `{{BRAND_LOWER}}` | Brand name (lowercase, hyphenated) | `grease`, `fox-farm`, `ac-infinity` |
| `{{VENDOR}}` | Shopify vendor field value | `Grease`, `FoxFarm`, `AC Infinity` |
| `{{PRODUCT_COUNT}}` | Number of products to fix | `9`, `47`, `125` |
| `{{SOURCE_TYPE}}` | Image source type | `local`, `manufacturer`, `competitor` |
| `{{SOURCE_PATH}}` | Path to source images | `hmoonhydro.com/wp-content/uploads/2024/03/` |
| `{{MANUFACTURER_URL}}` | Manufacturer website (if applicable) | `https://www.growwithgrease.com` |

---

## Plan: {{BRAND}} Product Fix

**Spec**: SCRAPE-001  
**Priority**: P2  
**Estimated Effort**: 2-4 hours  
**Products Affected**: {{PRODUCT_COUNT}}

### Objective

Fix product images and enrich data for all {{BRAND}} products using {{SOURCE_TYPE}} sources.

---

## Pre-Flight Checklist

- [ ] Identify all {{BRAND}} products in Shopify
- [ ] Verify source images are available ({{SOURCE_TYPE}})
- [ ] Check brand is in `brandRegistry.ts`
- [ ] Backup current products export

### Commands
```bash
# Count current products
grep -i "{{VENDOR}}" CSVs/products_export_1.csv | wc -l

# Verify brand in registry
grep -i "{{BRAND_LOWER}}" hmoon-pipeline/src/utils/brandRegistry.ts

# Create backup
cp CSVs/products_export_1.csv "CSVs/backups/products_export_1_$(date +%Y%m%d_%H%M%S).csv"
```

---

## Phase 1: Image Discovery

### Option A: Local WooCommerce Images
```bash
# Find local images
find "hmoonhydro.com/wp-content/uploads" -iname "*{{BRAND_LOWER}}*" -type f 2>/dev/null | sort
```

### Option B: Manufacturer Website
```bash
# Test if site is accessible
curl -I "{{MANUFACTURER_URL}}" 2>/dev/null | head -5
```

### Option C: Competitor Scraping
Use configured scrapers from `scrapingTargets.ts`:
```bash
npm run scrape:htg -- --brand="{{BRAND}}"
npm run scrape:growgen -- --brand="{{BRAND}}"
```

---

## Phase 2: Create Image Map

### Step 2.1: Generate Handle-to-Image Mapping

Create `hmoon-pipeline/src/scraping/{{BRAND_LOWER}}ImageMap.ts`:

```typescript
/**
 * {{BRAND}} Product → Image Mapping
 * Generated from {{SOURCE_TYPE}} source
 */

export const {{BRAND_UPPER}}_IMAGE_MAP: Record<string, string> = {
  // 'shopify-handle': 'source-filename-or-url',
  // Add mappings here
};

export function get{{BRAND}}Images(): Array<{handle: string; imagePath: string}> {
  return Object.entries({{BRAND_UPPER}}_IMAGE_MAP).map(([handle, path]) => ({
    handle,
    imagePath: path,
  }));
}
```

### Step 2.2: Generate Manifest
```bash
npx tsx src/scraping/{{BRAND_LOWER}}ImageMap.ts > outputs/{{BRAND_LOWER}}_image_manifest.json
```

---

## Phase 3: Upload Images

### Step 3.1: Upload to Shopify Files CDN

```bash
# Dry run first
npx tsx src/cli/uploadImagesToShopifyFiles.ts --dry-run --filter="{{BRAND_LOWER}}"

# Verify output, then apply
npx tsx src/cli/uploadImagesToShopifyFiles.ts --confirm --filter="{{BRAND_LOWER}}"
```

### Step 3.2: Verify CDN URLs
```bash
cat outputs/files_manifest.json | grep -i "{{BRAND_LOWER}}"
```

### Step 3.3: Attach to Products
```bash
# Dry run
npx tsx src/cli/uploadLocalImages.ts --dry-run --vendor="{{VENDOR}}"

# Apply
npx tsx src/cli/uploadLocalImages.ts --confirm --vendor="{{VENDOR}}"
```

---

## Phase 4: Enrichment

### Step 4.1: Dry Run
```bash
npm run enrich:{{BRAND_LOWER}} -- --dry-run
```

### Step 4.2: Apply
```bash
npm run enrich:{{BRAND_LOWER}} -- --confirm
```

### Step 4.3: Verify in Shopify Admin
- [ ] Check each {{BRAND}} product has correct image
- [ ] Verify descriptions updated
- [ ] Confirm metafields populated

---

## Phase 5: Validation

### Step 5.1: Re-export Products
```bash
npm run sync:pull
```

### Step 5.2: Health Score Check
```bash
npm run score -- --filter=vendor:{{VENDOR}}
```

---

## Rollback Steps

```bash
# Restore from backup
cp CSVs/backups/products_export_1_TIMESTAMP.csv CSVs/products_export_1.csv

# Re-import to Shopify via admin
```

---

## Product Checklist

| Handle | Image Source | Status |
|--------|--------------|--------|
| | | ⏳ |
| | | ⏳ |
| | | ⏳ |

---

## Notes

- Source type: {{SOURCE_TYPE}}
- Source path: {{SOURCE_PATH}}
- Manufacturer: {{MANUFACTURER_URL}}
