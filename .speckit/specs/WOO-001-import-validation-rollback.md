# SPEC: WOO-001 — Import Validation & Rollback System

## Status: 📋 SPECIFICATION COMPLETE

## Overview
A comprehensive **pre-import validation, post-import verification, and rollback** system for WooCommerce product imports. Prevents data corruption, catches errors before they hit production, and enables quick recovery from bad imports.

---

## Problem Statement

### Current State
- **No dry-run capability** — imports go straight to production
- **No pre-validation** — malformed data discovered after import
- **No rollback** — bad imports require manual cleanup or database restore
- **No verification** — no automated check that import succeeded
- **Downtime risk** — broken imports affect live store

### Target State
- **Dry-run mode** — validate everything before touching database
- **Pre-flight checks** — catch errors in CSV before import starts
- **Post-import verification** — confirm all products imported correctly
- **One-click rollback** — revert to pre-import state instantly
- **Zero downtime** — staging validation before production push

---

## Validation Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IMPORT VALIDATION PIPELINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Pre-Flight │───▶│   Dry-Run    │───▶│   Backup     │         │
│  │    Checks    │    │   Import     │    │   Snapshot   │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Schema     │    │   Conflict   │    │   Live       │         │
│  │   Validation │    │   Detection  │    │   Import     │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Report     │    │   Approve/   │    │   Post-Import│         │
│  │   Generation │    │   Reject     │    │   Verify     │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                 │                  │
│                                                 ▼                  │
│                                          ┌──────────────┐         │
│                                          │   Rollback   │         │
│                                          │   If Needed  │         │
│                                          └──────────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pre-Flight Checks

### 1. Schema Validation
Verify CSV structure matches WooCommerce import format.

```python
REQUIRED_COLUMNS = ['SKU', 'Name', 'Type']
OPTIONAL_COLUMNS = ['Regular price', 'Categories', 'Images', ...]

def validate_schema(csv_path):
    errors = []
    df = pd.read_csv(csv_path)
    
    # Check required columns
    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            errors.append(f"Missing required column: {col}")
    
    # Check for unknown columns
    known = set(REQUIRED_COLUMNS + OPTIONAL_COLUMNS)
    unknown = set(df.columns) - known
    if unknown:
        errors.append(f"Unknown columns: {unknown}")
    
    return errors
```

### 2. Data Type Validation
Ensure values are correct types.

| Column | Expected Type | Validation |
|--------|--------------|------------|
| SKU | String | Non-empty, no special chars |
| Regular price | Decimal | >0, max 2 decimal places |
| Sale price | Decimal | <= Regular price |
| Stock | Integer | >= 0 |
| Weight | Decimal | > 0 for physical products |
| Published | Boolean | 0 or 1 |

```python
def validate_types(df):
    errors = []
    
    # Price validation
    for idx, row in df.iterrows():
        if pd.notna(row.get('Sale price')) and pd.notna(row.get('Regular price')):
            if float(row['Sale price']) > float(row['Regular price']):
                errors.append(f"Row {idx}: Sale price > Regular price")
    
    # SKU validation
    for idx, row in df.iterrows():
        sku = row.get('SKU', '')
        if pd.isna(sku) or str(sku).strip() == '':
            if row.get('Type') != 'variable':
                errors.append(f"Row {idx}: Missing SKU")
        elif re.search(r'[<>:"/\\|?*]', str(sku)):
            errors.append(f"Row {idx}: Invalid characters in SKU: {sku}")
    
    return errors
```

### 3. Relationship Validation
Verify parent-child relationships are consistent.

```python
def validate_relationships(df):
    errors = []
    
    # Check all variations have valid parents
    variations = df[df['Type'] == 'variation']
    for idx, row in variations.iterrows():
        parent_sku = row.get('Parent')
        if pd.isna(parent_sku):
            errors.append(f"Row {idx}: Variation without parent SKU")
        else:
            parent = df[df['SKU'] == parent_sku]
            if parent.empty:
                errors.append(f"Row {idx}: Parent SKU not found: {parent_sku}")
            elif parent.iloc[0]['Type'] != 'variable':
                errors.append(f"Row {idx}: Parent is not variable type")
    
    return errors
```

### 4. Duplicate Detection

```python
def detect_duplicates(df):
    errors = []
    
    # Duplicate SKUs (excluding variations which share parent SKU)
    simple_variable = df[df['Type'].isin(['simple', 'variable'])]
    dupes = simple_variable[simple_variable['SKU'].duplicated(keep=False)]
    
    for sku in dupes['SKU'].unique():
        if pd.notna(sku):
            errors.append(f"Duplicate SKU: {sku}")
    
    return errors
```

### 5. Category Validation

```python
def validate_categories(df, woo_categories):
    """Check categories exist in WooCommerce."""
    errors = []
    warnings = []
    
    for idx, row in df.iterrows():
        cats = str(row.get('Categories', '')).split(',')
        for cat in cats:
            cat = cat.strip()
            if cat and cat not in woo_categories:
                # Will be auto-created, but warn
                warnings.append(f"Row {idx}: New category will be created: {cat}")
    
    return errors, warnings
```

---

## Dry-Run Mode

Simulates import without database changes.

### What Dry-Run Reports

| Check | Description |
|-------|-------------|
| Products to CREATE | New SKUs not in WooCommerce |
| Products to UPDATE | Existing SKUs that will be modified |
| Products UNCHANGED | SKUs with no data changes |
| Variations to ADD | New variant combinations |
| Variations to UPDATE | Existing variants to modify |
| Categories to CREATE | New category slugs |
| Attributes to CREATE | New attribute taxonomies |
| Images to DOWNLOAD | External URLs to fetch |
| **Conflicts** | SKU collisions, orphan variations |

### Dry-Run Output

```
=== DRY-RUN IMPORT REPORT ===

CSV File: woocommerce_MASTER_IMPORT.csv
Total Rows: 1,475
Execution Time: 12.3 seconds

SUMMARY:
  Products to CREATE: 287
  Products to UPDATE: 1,156
  Products UNCHANGED: 32
  Variations to ADD: 134
  Variations to UPDATE: 704
  
METADATA:
  Categories to CREATE: 3
    - Nutrients > Bloom Boosters (new)
    - Environmental > CO2 (new)
    - Propagation > Heat Mats (new)
  
  Attributes to CREATE: 0
  
  Images to DOWNLOAD: 89
    - External URLs: 12
    - Local files: 77

POTENTIAL ISSUES:
  ⚠️  23 products have no images
  ⚠️  5 variations reference missing parent SKUs
  ⚠️  12 products have $0.00 price (will be draft)

CONFLICTS (blocking):
  ❌  None detected

RECOMMENDATION: ✅ Safe to proceed with import
```

---

## Backup & Snapshot System

### Pre-Import Backup

```python
def create_import_backup(woo_client, backup_dir):
    """Export current state before import."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{backup_dir}/pre_import_{timestamp}"
    
    os.makedirs(backup_path, exist_ok=True)
    
    # Export all products
    products = woo_client.get_all_products()
    with open(f"{backup_path}/products.json", 'w') as f:
        json.dump(products, f, indent=2)
    
    # Export all categories
    categories = woo_client.get_all_categories()
    with open(f"{backup_path}/categories.json", 'w') as f:
        json.dump(categories, f, indent=2)
    
    # Export all attributes
    attributes = woo_client.get_all_attributes()
    with open(f"{backup_path}/attributes.json", 'w') as f:
        json.dump(attributes, f, indent=2)
    
    # Create manifest
    manifest = {
        'timestamp': timestamp,
        'product_count': len(products),
        'category_count': len(categories),
        'attribute_count': len(attributes),
        'woocommerce_version': woo_client.get_version(),
    }
    with open(f"{backup_path}/manifest.json", 'w') as f:
        json.dump(manifest, f, indent=2)
    
    return backup_path
```

### Backup Storage Structure

```
outputs/backups/
├── pre_import_20260212_143022/
│   ├── manifest.json
│   ├── products.json
│   ├── categories.json
│   ├── attributes.json
│   └── product_images/
│       ├── sku_123.jpg
│       └── ...
├── pre_import_20260210_091500/
│   └── ...
└── rollback_log.json
```

---

## Post-Import Verification

### Verification Checks

```python
def verify_import(csv_path, woo_client):
    """Verify import completed successfully."""
    df = pd.read_csv(csv_path)
    results = {
        'expected': len(df),
        'found': 0,
        'missing': [],
        'mismatched': [],
        'errors': []
    }
    
    for idx, row in df.iterrows():
        sku = row.get('SKU')
        if pd.isna(sku):
            continue
        
        # Fetch from WooCommerce
        product = woo_client.get_product_by_sku(sku)
        
        if not product:
            results['missing'].append(sku)
            continue
        
        results['found'] += 1
        
        # Verify critical fields
        if row.get('Name') and product['name'] != row['Name']:
            results['mismatched'].append({
                'sku': sku,
                'field': 'name',
                'expected': row['Name'],
                'actual': product['name']
            })
        
        if row.get('Regular price'):
            expected_price = str(row['Regular price'])
            if product['regular_price'] != expected_price:
                results['mismatched'].append({
                    'sku': sku,
                    'field': 'regular_price',
                    'expected': expected_price,
                    'actual': product['regular_price']
                })
    
    return results
```

### Verification Report

```
=== POST-IMPORT VERIFICATION ===

Import File: woocommerce_MASTER_IMPORT.csv
Verification Time: 45.2 seconds

RESULTS:
  Expected Products: 1,475
  Found in WooCommerce: 1,473 (99.9%)
  Missing: 2
  Field Mismatches: 0

MISSING PRODUCTS:
  - SKU: ACI-TENT-4X4 (import error, see WooCommerce logs)
  - SKU: GH-RIPEN-1QT (duplicate SKU conflict)

VERIFICATION: ⚠️ 2 issues require attention

NEXT STEPS:
  1. Check WooCommerce > Status > Logs for errors
  2. Manually import missing SKUs or fix duplicates
  3. Re-run verification after fixes
```

---

## Rollback System

### Rollback Procedure

```python
def rollback_import(backup_path, woo_client, dry_run=True):
    """Restore WooCommerce to pre-import state."""
    
    with open(f"{backup_path}/manifest.json") as f:
        manifest = json.load(f)
    
    with open(f"{backup_path}/products.json") as f:
        backup_products = json.load(f)
    
    backup_skus = {p['sku']: p for p in backup_products if p.get('sku')}
    
    # Get current products
    current_products = woo_client.get_all_products()
    
    actions = {
        'delete': [],   # Products added by import
        'restore': [],  # Products modified by import
        'skip': []      # Products unchanged
    }
    
    for product in current_products:
        sku = product.get('sku')
        if not sku:
            continue
        
        if sku not in backup_skus:
            # Product was added by import - delete it
            actions['delete'].append(product['id'])
        elif product != backup_skus[sku]:
            # Product was modified - restore backup version
            actions['restore'].append(backup_skus[sku])
        else:
            actions['skip'].append(sku)
    
    if dry_run:
        print(f"ROLLBACK DRY-RUN:")
        print(f"  Would DELETE: {len(actions['delete'])} products")
        print(f"  Would RESTORE: {len(actions['restore'])} products")
        print(f"  Unchanged: {len(actions['skip'])} products")
        return actions
    
    # Execute rollback
    for product_id in actions['delete']:
        woo_client.delete_product(product_id)
    
    for product_data in actions['restore']:
        woo_client.update_product(product_data['id'], product_data)
    
    return actions
```

### Rollback CLI

```bash
# List available backups
python scripts/woo/rollback.py --list

# Dry-run rollback
python scripts/woo/rollback.py --backup pre_import_20260212_143022 --dry-run

# Execute rollback (requires confirmation)
python scripts/woo/rollback.py --backup pre_import_20260212_143022 --confirm
```

---

## CLI Tool Design

```bash
# Full validation pipeline (dry-run by default)
python scripts/woo/validate_import.py --input woocommerce_MASTER_IMPORT.csv
# Output: validation_report_20260212_143022.md

# Run with pre-flight only (no WooCommerce connection)
python scripts/woo/validate_import.py --input file.csv --preflight-only

# Execute import with backup
python scripts/woo/safe_import.py --input file.csv --backup --confirm
# Creates backup, runs import, verifies

# Verify existing import
python scripts/woo/verify_import.py --input file.csv
# Checks all SKUs exist with correct data

# Rollback
python scripts/woo/rollback.py --backup pre_import_20260212_143022 --dry-run
python scripts/woo/rollback.py --backup pre_import_20260212_143022 --confirm
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/woo/validate_import.py` | Pre-flight validation |
| `scripts/woo/safe_import.py` | Import with backup/verify |
| `scripts/woo/verify_import.py` | Post-import verification |
| `scripts/woo/rollback.py` | Rollback to backup |
| `scripts/woo/backup.py` | Backup utilities |
| `scripts/woo/woo_client.py` | WooCommerce API wrapper |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Pre-flight catches all schema errors | ✅ 100% |
| Dry-run completes in reasonable time | ✅ <60 seconds for 2,000 products |
| Backup captures full state | ✅ Products, categories, attributes |
| Rollback restores exactly | ✅ 100% state restoration |
| Verification catches all mismatches | ✅ 100% |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Pre-flight validation | 0.5 day | Schema, type, relationship checks |
| 2. Dry-run mode | 1 day | Full simulation with reporting |
| 3. Backup system | 0.5 day | JSON export with manifest |
| 4. Post-import verification | 0.5 day | Field-by-field comparison |
| 5. Rollback system | 1 day | Full state restoration |
| 6. CLI integration | 0.5 day | All commands working |

**Total: ~4 days**

---

## Dependencies

- Python 3.10+
- woocommerce>=3.0 (WooCommerce API)
- pandas>=2.0
- rich (CLI output)
- click (CLI parsing)

---

## References

- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [WooCommerce CSV Import Format](https://woocommerce.com/document/product-csv-importer-exporter/)
