# Shopify Import Runbook

This is the step-by-step guide for completely resetting and reimporting the H-Moon Hydro Shopify store from the clean catalog pipeline.

## Prerequisites

### 1. Environment Setup

```bash
cd hmoon-pipeline

# Install dependencies
npm install

# Set environment variables
export SHOPIFY_SHOP_DOMAIN="h-moon-hydro.myshopify.com"
export SHOPIFY_ADMIN_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 2. Verify Pipeline Outputs Exist

```bash
ls -la CSVs/shopify_import_ready.csv
ls -la CSVs/shopify_import_draft.csv
ls -la CSVs/shopify_collections.json
```

If missing, run the full pipeline:

```bash
npx tsx src/cli/runFullImportPipeline.ts
```

---

## Phase 1: Wipe Existing Store

### Step 1.1: Dry Run Preview

```bash
npx tsx src/cli/wipeShopifyStore.ts --dry-run
```

Expected output:
- List of all products that would be deleted
- List of all collections that would be deleted
- Total counts

### Step 1.2: Wipe Collections

Collections first (they're fewer and don't have variant complexity):

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope collections
```

Type your shop domain when prompted.

### Step 1.3: Wipe Products

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope products --pause-ms 300
```

Type your shop domain when prompted.

### Step 1.4: Verify Wipe

In Shopify Admin:
- Products → All products → Should show 0 products
- Collections → Should show 0 collections

---

## Phase 2: Import Products

### Step 2.1: Import Ready Products

1. Go to Shopify Admin → Products → Import
2. Upload `CSVs/shopify_import_ready.csv`
3. Click "Upload and preview"
4. Review the import summary
5. Click "Import products"

Expected: **1,249 products** imported as **Active**

### Step 2.2: Import Draft Products

1. Go to Shopify Admin → Products → Import
2. Upload `CSVs/shopify_import_draft.csv`
3. Click "Upload and preview"
4. Click "Import products"

Expected: **271 products** imported as **Draft**

### Step 2.3: Verify Product Count

In Shopify Admin:
- All products: ~1,520 products
- Active: ~1,249 products
- Draft: ~271 products

---

## Phase 3: Create Collections

### Smart Collections

Smart collections are created automatically based on rules. Create these in Shopify Admin:

#### By Brand

For each brand in `CSVs/shopify_collections.json`:

1. Collections → Create collection
2. Select "Automated"
3. Condition: Product vendor → is equal to → [Brand Name]
4. Save

**Brands to create:**
- H-Moon Hydro (main brand)
- Gavita
- California Lightworks
- Current Culture
- Trolmaster
- KIND LED
- FloraFlex
- Active Aqua
- Mars Hydro
- Spider Farmer
- (etc. - see collections JSON)

#### By Product Type

1. Collections → Create collection
2. Select "Automated"
3. Condition: Product type → is equal to → [Type]
4. Save

**Types to create:**
- LED Grow Lights
- HVAC Equipment
- Nutrients
- Grow Systems
- Environmental Controllers
- (etc. - see product types in catalog)

### Collection Images

After creating collections, add header images:
1. Click collection → Edit
2. Add Collection image
3. Save

---

## Phase 4: Sanity Check

### Products to Verify

Check these 15 products across categories:

| Handle | Expected |
|--------|----------|
| led-grow-light-hmh00311 | Active, has image, has price |
| nutrient-pack-hmh00xxx | Active, has SKU |
| gavita-1700e-led | Vendor = Gavita |
| current-culture-xxl-xxxx | Vendor = Current Culture |
| (random draft) | Status = Draft |

### What to Check

For each product:
- [ ] Title is correct (no duplicate words, proper casing)
- [ ] Vendor is correct (not "Unknown" for major brands)
- [ ] Product type is correct
- [ ] Price is set (for active products)
- [ ] SKU is set
- [ ] At least one image (for active products)
- [ ] SEO title/description populated
- [ ] Tags are present

### Collection Verification

- [ ] Brand collections show correct products
- [ ] Type collections show correct products
- [ ] No empty collections

---

## Troubleshooting

### "Invalid CSV format"

- Open CSV in text editor, check for encoding issues
- Ensure headers match Shopify exactly
- Check for unescaped quotes in HTML content

### "SKU already exists"

- Some products have duplicate SKUs
- Check `CSVs/quality_report.json` for duplicates
- Remove duplicates from CSV before reimport

### "Product not found in collection"

- Collection rules may not match product attributes
- Check vendor/type spelling matches exactly
- Case sensitivity matters

### Import Times Out

- Break import into smaller batches (500 products each)
- Use Shopify's bulk import API instead

---

## Rollback

If something goes wrong:

1. **Products**: Wipe again and reimport from backup CSV
2. **Collections**: Delete collections, recreate from JSON
3. **Full reset**: Wipe everything, run pipeline again, reimport

---

## Post-Import Tasks

- [ ] Set up navigation menus
- [ ] Configure shipping zones
- [ ] Set up tax settings
- [ ] Test checkout flow
- [ ] Configure payment methods
- [ ] Set up email notifications
- [ ] Test search functionality
- [ ] Verify collection pages
- [ ] Check mobile responsiveness

---

## Schedule

Recommended timing:

| Task | Duration |
|------|----------|
| Wipe store | 5-10 minutes |
| Import ready.csv | 10-15 minutes |
| Import draft.csv | 5 minutes |
| Create collections | 30-60 minutes |
| Sanity check | 30 minutes |
| **Total** | **~2 hours** |

---

## Contact

For issues with the import pipeline:
- Check `CSVs/quality_report.json` for data issues
- Check `CSVs/wipe_log.csv` for deletion audit
- Run `npx tsx src/cli/runFullImportPipeline.ts` to regenerate

