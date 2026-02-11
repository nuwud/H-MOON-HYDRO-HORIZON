# Archive Directory

**Purpose**: Preserve Shopify-related files that are no longer active but may be useful for reference.

---

## Archived Content

### `/shopify-theme/`
Shopify Horizon theme files moved here for reference. These were part of a cancelled Shopify migration.

**What was archived:**
- Liquid templates
- Theme sections and snippets
- Theme assets (if any unique CSS/JS patterns)
- Theme config files

**Note**: The original Shopify theme folders (`sections/`, `snippets/`, `layout/`, `templates/`, `blocks/`, `locales/`, `config/`, `assets/`) remain in place at root level for now. They can be moved here once verified safe.

### `/shopify-specs/`
Shopify-specific specifications that no longer apply to WooCommerce development.

**Move candidates:**
- Specs referencing Shopify GraphQL API
- Liquid theme specifications
- Shopify-specific compliance specs

---

## What's NOT Archived

The following remain **active** despite originally being created for Shopify:

| Item | Why Active |
|------|------------|
| `outputs/MASTER_IMPORT.csv` | Product data is platform-agnostic |
| `outputs/waves/*.csv` | Category-specific product data |
| `hmoon-pipeline/` data outputs | Enriched product information |
| Brand normalization rules | Apply to WooCommerce too |
| Category priority system | Apply to WooCommerce too |

---

## Migration Status

- [ ] Move Shopify theme folders to `archive/shopify-theme/`
- [ ] Move Shopify-specific specs to `archive/shopify-specs/`
- [ ] Update `.gitignore` to reflect archived paths
- [ ] Verify no broken references after archival

---

## Restoration

If Shopify is ever reconsidered, these files provide a starting point. The theme was based on the "Horizon" theme exported October 29, 2025.
