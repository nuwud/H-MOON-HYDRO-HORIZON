# H-Moon Hydro Project Constitution

## Project Identity

**Name**: H-Moon Hydro  
**Type**: Shopify Hydroponics eCommerce + WooCommerce Migration Pipeline  
**Primary Languages**: TypeScript, Liquid, JavaScript, Python  
**Package Manager**: npm (for hmoon-pipeline)  
**GitHub Repository**: nuwud/H-MOON-HYDRO-HORIZON

## Architecture Overview

### Core Components
1. **Shopify Horizon Theme** (`/` root): Liquid templates, sections, snippets, assets
2. **HMoon Pipeline** (`hmoon-pipeline/`): TypeScript CLI for product auditing, category building, Shopify GraphQL sync
3. **Legacy WooCommerce** (`hmoonhydro.com/`): WordPress site + SQL dump for data archaeology (NOT uploaded to GitHub)

### Custom Agents
Located in `agents/` — invoke before taking action:
- `@repo-archeologist` — Search existing scripts before creating new ones
- `@shopify-compliance-auditor` — Validate changes before deploy
- `@safe-shopify-operator` — Ensure dry-run guardrails for API mutations
- `@brand-normalizer` — Use 250+ brand registry
- `@category-classifier` — Handle category priority conflicts

---

## Issue Tracking Requirements

### GitHub Issues Mandate
**All issues, bugs, and feature requests MUST be documented in GitHub Issues.**

| Issue Type | Template | Labels |
|------------|----------|--------|
| Bug Reports | `bug_report.md` | `bug`, `priority:*` |
| Feature Requests | `feature_request.md` | `enhancement` |
| Migration Tasks | `migration_task.md` | `migration`, `data-quality` |

### Issue Workflow
1. **Before starting work**, check GitHub Issues for existing related issues
2. **Create or reference** a GitHub Issue for each task
3. **Link commits** to issues using `Fixes #123` or `Relates to #123`
4. **Close issues** only when verified complete

---

## Shopify API Documentation Requirements

### ⚠️ CRITICAL: Always Verify Against Official Docs
**Shopify's GraphQL API changes frequently.** Before writing or modifying ANY Shopify API code:

### 1. Consult Official Documentation First
- Product API: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate
- Bulk Operations: https://shopify.dev/docs/api/usage/bulk-operations
- Rate Limits: https://shopify.dev/docs/api/usage/rate-limits
- CSV Import: https://help.shopify.com/en/manual/products/import-export

### 2. Check API Version Compatibility
- Current project version: `2024-01`
- Verify mutations/queries exist in target version
- Note deprecated fields before using

### 3. Common Pitfalls (Updated Jan 2026)

| Old Way (Deprecated) | New Way (Current) |
|---------------------|-------------------|
| `productCreate(input: ProductInput!)` | `productCreate(product: ProductCreateInput!)` |
| `ProductInput.options` (string array) | `ProductCreateInput.productOptions` (with values) |
| `ProductInput.variants` | Use `productVariantsBulkCreate` after product creation |
| `variant.sku` directly | `variant.inventoryItem.sku` |

### 4. Documentation Reference Before API Work

| Task | Must Check |
|------|-----------|
| Creating products | `productCreate` mutation schema |
| Updating variants | `productVariantsBulkUpdate` schema |
| Bulk operations | Bulk operations documentation |
| Rate limiting | Current rate limit thresholds |

---

## Technical Standards

### TypeScript/Node.js Patterns
- **Dry-Run Default**: All CLI scripts must default to dry-run mode
  ```typescript
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  ```
- **Rate Limiting**: Use 200-500ms pause between Shopify mutations
- **Error Handling**: Always wrap API calls in try/catch with meaningful error messages

### Liquid Theme Standards
- Internal blocks prefixed with `_` (e.g., `_product-details.liquid`)
- Use `{% content_for 'block' %}` for block references
- Template JSON files are auto-generated — never manually edit

### Data Conventions
- **SKU Format**: `HMH-{CATEGORY_CODE}-{HASH}` (e.g., `HMH-NUT-A3F2B1`)
- **Category Codes**: NUT, GRO, IRR, PHM, LIT, HID, AIR, ODR, POT, PRO, SED, HAR, TRM, PES, CO2, BOK
- **Weight Unit**: Convert WooCommerce lbs → Shopify grams (×453.592)

---

## Critical Files (Never Modify Without Backup)

| File | Purpose |
|------|---------|
| `products_export_1.csv` | Canonical Shopify export |
| `pos_shopify_alignment.csv` | Manual SKU mappings (review edits preserved) |
| `HMoonHydro_Inventory.csv` | POS source of truth |

---

## Git & Version Control

### What Gets Committed
✅ Theme code (Liquid, CSS, JS)  
✅ Pipeline scripts (TypeScript, JS, Python)  
✅ Configuration files  
✅ Documentation and specs  
✅ Agent definitions  

### What NEVER Gets Committed
❌ `node_modules/`  
❌ `hmoonhydro.com/` (WooCommerce backup - 500MB+)  
❌ Large CSV/JSON data files  
❌ Image files  
❌ `.env` files  
❌ Generated outputs  

### Commit Message Format
```
[SCOPE] Brief description

- Detail 1
- Detail 2

Fixes #123
```
**Scopes**: `theme`, `pipeline`, `docs`, `scripts`, `config`

---

## Testing Requirements

- All scripts touching Shopify API must have `--dry-run` mode
- POS alignment changes must be tested against `pos_shopify_alignment.csv`
- CSV imports must validate against 32-column Shopify header format

---

## Documentation Requirements

- New CLI scripts must include JSDoc comments
- New agents must follow `.agent.md` format in `agents/`
- API changes must be documented in relevant docs/ files
- **All issues tracked in GitHub Issues**

---

## Deployment Guardrails

1. Always run `@shopify-compliance-auditor` before merge
2. Never run `wipeShopifyStore.ts` without typing domain confirmation
3. Backup `products_export_1.csv` before any bulk import
4. Create GitHub Issue before starting any migration phase
5. Verify Shopify API documentation before any API code changes
