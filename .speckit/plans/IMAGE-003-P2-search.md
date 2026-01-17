# IMAGE-003-P2: Multi-Source Image Search

## Metadata
| Field | Value |
|-------|-------|
| Spec | IMAGE-003 |
| Phase | 2 - Image Search |
| Status | ✅ COMPLETE |
| Created | 2025-01-09 |

---

## Objective

Search multiple sources to find better product images for 1,108 products that need replacements.

---

## Completed Tasks

### ✅ Create `find_replacement_images.js`
- **Script**: `scripts/find_replacement_images.js`
- **Function**: Searches multiple sources for replacement images:
  1. Previously scraped images (from `image_scraper.js`)
  2. WooCommerce backup images
  3. Manufacturer website search URLs
  4. Distributor catalog search URLs
  5. Google Images search URLs

### ✅ Create `generate_image_review.js`
- **Script**: `scripts/generate_image_review.js`
- **Function**: Generates interactive HTML review page for human approval
- **Output**: `outputs/image_review.html`

---

## Results

```
══════════════════════════════════════════════════════════════════════
📊 SEARCH RESULTS
══════════════════════════════════════════════════════════════════════

   Products Needing Images:  1,108
   With Direct Image URLs:   303 (27.3%)
   Search URLs Only:         805 (72.7%)

   Direct Images by Source:
   - Previously Scraped:     303
   - WooCommerce Backup:     0
   - Manufacturer:           0
   - Distributor:            0
══════════════════════════════════════════════════════════════════════
```

---

## Output Files

| File | Purpose |
|------|---------|
| `outputs/image_candidates.json` | All candidates with scores |
| `outputs/image_review.html` | Interactive review page |

---

## Review Page Features

The HTML review page allows:
- ✅ See current image vs. replacement candidates side-by-side
- ✅ Select best candidate from multiple options
- ✅ Approve/reject replacements per product
- ✅ Filter by vendor and minimum score
- ✅ Export approved selections as JSON

---

## Next Steps

1. Open `outputs/image_review.html` in browser
2. Review and approve image replacements
3. Export approved JSON
4. Run Phase 4 uploader to apply changes

---

## Gap Analysis

**805 products** still need images sourced manually:
- Use Google Images search URLs provided
- Check manufacturer websites
- Consider stock photo services for generic products

### Priority Categories
1. **Nutrients** - Most valuable, brand-critical
2. **Lights** - High-ticket items
3. **Seeds/Propagation** - Unique products
4. **Accessories** - Can use generic images
