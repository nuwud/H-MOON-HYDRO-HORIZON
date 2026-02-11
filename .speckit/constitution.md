# H-Moon Hydro Project Constitution

## Project Identity

**Name**: H-Moon Hydro  
**Type**: WooCommerce Hydroponics eCommerce  
**Primary Languages**: PHP, JavaScript, Python  
**Package Manager**: Composer (WordPress/WooCommerce), npm (build tools)  
**GitHub Repository**: nuwud/H-MOON-HYDRO-HORIZON

---

## Current Status (Updated Feb 11, 2026)

### ✅ Import Ready
- **File**: `outputs/woocommerce_import_ready.csv`
- **Products**: 2,579 unique (4,727 total with variations)
- **Critical Data**: 100% SKUs, 100% Prices, 100% Descriptions

### Recent Work (Feb 11, 2026)
| Task | Status | Commit Reference |
|------|--------|------------------|
| Price recovery for 1,488 variations | ✅ Complete | See `enhanced_price_recovery.js` |
| SKU generation for 1,604 products | ✅ Complete | See `fix_remaining_skus.js` |
| Data quality validation | ✅ Complete | See `final_quality_report.js` |
| Documentation updates | ✅ Complete | README.md, copilot-instructions.md |

### Post-Import Tasks (Pending)
- [ ] Fix missing brands (317 products)
- [ ] Fix missing weights (3,056 products)
- [ ] Fix missing images (498 products)

---

## Architecture Overview

### Core Components
1. **WooCommerce Site** (`hmoonhydro.com/`): WordPress + WooCommerce + BeaverBuilder (LOCAL ONLY - not tracked)
2. **Product Data** (`outputs/`, `CSVs/`): Refined product catalog with 2,579 products
3. **Custom Plugins** (`wp-plugins/`): UPS shipping, analytics, security hardening
4. **Data Pipeline** (`hmoon-pipeline/`): ARCHIVED - data outputs still useful
5. **Shopify Theme** (`archive/shopify/`): ARCHIVED - Liquid templates preserved

### Custom Agents
Located in `agents/` — invoke before taking action:
- `@repo-archeologist` — Search existing scripts before creating new ones
- `@woocommerce-import-validator` — Validate CSV before WooCommerce import
- `@brand-normalizer` — Use 250+ brand registry
- `@category-classifier` — Handle category priority conflicts
- `@variant-consolidator` — Group products with size/color variants

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

## WooCommerce Documentation Requirements

### Official Resources
| Resource | URL |
|----------|-----|
| WooCommerce REST API | https://woocommerce.github.io/woocommerce-rest-api-docs/ |
| Product CSV Import | https://woocommerce.com/document/product-csv-importer-exporter/ |
| Variable Products | https://woocommerce.com/document/variable-product/ |
| WP-CLI WooCommerce | https://github.com/woocommerce/woocommerce/wiki/WC-CLI |
| WordPress Coding Standards | https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/ |

### WooCommerce Product Types
| Type | Use Case |
|------|----------|
| `simple` | Single product, no variations |
| `variable` | Parent product with size/color options |
| `variation` | Child of variable product |
| `grouped` | Collection of related products |
| `external` | Affiliate/external products |

### CSV Import Column Mapping
| Column | Required | Notes |
|--------|----------|-------|
| `ID` | No | Leave blank for new products |
| `Type` | Yes | `simple`, `variable`, `variation` |
| `SKU` | Yes | Used for matching existing products |
| `Name` | Yes | Product title |
| `Description` | No | Full HTML description |
| `Regular price` | Yes | Base price |
| `Categories` | No | Pipe-delimited: `Cat1 > SubCat \| Cat2` |
| `Images` | No | Comma-separated URLs |
| `Attribute 1 name` | For variants | e.g., "Size" |

---

## Technical Standards

### PHP/WordPress Patterns
- **WordPress Coding Standards**: Follow WPCS for all PHP code
- **Escaping Output**: Always escape with `esc_html()`, `esc_attr()`, `esc_url()`
- **Sanitizing Input**: Use `sanitize_text_field()`, `absint()`, etc.
- **Nonces**: Include nonce verification for all form submissions

### JavaScript/Node.js Patterns
- **Dry-Run Default**: All CLI scripts must default to dry-run mode
  ```javascript
  const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
  ```
- **Error Handling**: Always wrap API calls in try/catch with meaningful error messages

### Data Conventions
- **SKU Format**: `HMH-{CATEGORY_CODE}-{HASH}` (e.g., `HMH-NUT-A3F2B1`)
- **Category Codes**: NUT, GRO, IRR, PHM, LIT, HID, AIR, ODR, POT, PRO, SED, HAR, TRM, PES, CO2, BOK
- **Weight Unit**: Keep as lbs for WooCommerce (source data in grams ÷ 453.592)

---

## Critical Files (Never Modify Without Backup)

| File | Purpose |
|------|---------|
| `outputs/woocommerce_import_ready.csv` | **IMPORT THIS** - Ready for WooCommerce (4,727 rows) |
| `outputs/shopify_complete_import_enriched.csv` | Source data with 100% descriptions |
| `CSVs/WooExport/Products-Export-*.csv` | Current WooCommerce exports |
| `CSVs/HMoonHydro_Inventory.csv` | POS source of truth |
| `outputs/pos_shopify_alignment.csv` | Manual SKU mappings (review edits preserved) |

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

- All destructive scripts must have `--dry-run` mode
- Test WooCommerce imports on staging before production
- CSV imports must validate against WooCommerce column format
- POS alignment changes must be tested against alignment file

---

## Documentation Requirements

- New CLI scripts must include JSDoc comments
- New agents must follow `.agent.md` format in `agents/`
- API changes must be documented in relevant docs/ files
- **All issues tracked in GitHub Issues**

---

## Deployment Guardrails

1. Always validate CSV format before WooCommerce import
2. Backup current WooCommerce products before bulk import
3. Test on staging environment first
4. Create GitHub Issue before starting any migration phase
5. Verify WooCommerce documentation before API code changes

---

## WooCommerce ACH Batch Plugin (`woo-ach-batch/`)

### ⚠️ SECURITY-FIRST DEVELOPMENT

**MANDATORY**: Read `woo-ach-batch/docs/SENSITIVE_DATA_STORAGE_PLAN.md` before ANY code changes.

### Sensitive Data Categories

| Data | Sensitivity | Storage |
|------|-------------|---------|
| Bank Routing Number | 🔴 HIGH | AES-256-GCM encrypted in order meta |
| Bank Account Number | 🔴 HIGH | AES-256-GCM encrypted in order meta |
| KYC Documents | 🔴 HIGH | Protected directory (`/kyc/`) with `.htaccess` deny |
| NACHA Files | 🔴 HIGH | Protected directory with `.htaccess` deny |
| Plaid Access Tokens | 🔴 HIGH | Encrypted in order meta |
| SFTP Credentials | 🔴 HIGH | Encrypted in wp_options |

### NEVER Do These Things

```php
// ❌ NEVER log bank details
error_log($routing_number);
\Nuwud\WooAchBatch\log_message($account_number);

// ❌ NEVER return full bank details in API
return ['account' => $bank_details['account']];

// ❌ NEVER display full bank details in admin
echo $bank_details['routing'];

// ❌ NEVER store plaintext bank data
$order->update_meta_data('_ach_routing', $routing_number);
```

### ALWAYS Do These Things

```php
// ✅ Encrypt before storage
$encrypted = $encryption->encrypt($routing_number);
$order->update_meta_data('_ach_routing_encrypted', $encrypted);

// ✅ Only expose last4
return ['account_last4' => $bank_details['last4']];

// ✅ Audit log significant actions
$audit_log->log('bank_details_accessed', 'order', $order_id);

// ✅ Clear after settlement (if configured)
$order_meta->clear_bank_details($order);
```

### ACH Plugin Architecture

| Directory | Purpose |
|-----------|---------|
| `src/Security/` | Encryption, AuditLog |
| `src/Order/` | OrderMeta (encrypted storage), OrderStatuses |
| `src/Gateway/` | WooCommerce payment gateway |
| `src/Nacha/` | NachaBuilder, **MappingConfig** |
| `src/Batch/` | BatchRunner, BatchRepository |
| `src/Sftp/` | SFTP client abstraction |
| `src/Verification/` | Bank verification methods |
| `src/Kyc/` | Document upload handling |

### MappingConfig Profiles

For processor-specific NACHA formatting:

```php
// Switch profile
$mapping = service('mapping_config');
$mapping->set_active_profile('dan_processor');

// Get field value with formatting
$value = $mapping->get_field_value('entry_detail', 'dfi_account_number', $order, [
    'bank_details' => $bank_details,
]);
```

Available profiles: `default`, `dan_processor`, `test`

### Key Rotation

When rotating encryption keys:
1. Define `WOO_ACH_BATCH_ENCRYPTION_KEY_NEW` in wp-config.php
2. Run `$encryption->rotate_key($old_key, $new_key)`
3. Verify all orders decrypt successfully
4. Update constant name to remove `_NEW` suffix
5. Audit log the rotation event
