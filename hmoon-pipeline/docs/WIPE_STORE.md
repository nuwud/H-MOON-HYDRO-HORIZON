# Shopify Store Wipe Utility

⚠️ **WARNING: This tool PERMANENTLY DELETES products and collections from your Shopify store. This action is IRREVERSIBLE.**

## Overview

The `wipeShopifyStore.ts` script uses the Shopify Admin GraphQL API to delete all products and collections from a store. This is useful when you want to completely reset your store and reimport from your clean catalog pipeline.

## Prerequisites

### Environment Variables

Set these before running:

```bash
export SHOPIFY_SHOP_DOMAIN="h-moon-hydro.myshopify.com"
export SHOPIFY_ADMIN_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export SHOPIFY_API_VERSION="2024-01"  # Optional, defaults to 2024-01
```

### Getting an Admin API Token

1. Go to Shopify Admin → Settings → Apps and sales channels
2. Click "Develop apps" → "Create an app"
3. Configure Admin API scopes:
   - `write_products` (required for product deletion)
   - `write_product_listings`
   - `read_products`
4. Install the app and copy the Admin API access token

## Usage

### Dry Run (Safe Preview)

Always start with a dry run to see what would be deleted:

```bash
npx tsx src/cli/wipeShopifyStore.ts --dry-run
```

This shows you exactly what would be deleted without actually deleting anything.

### Delete Products Only

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope products
```

### Delete Collections Only

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope collections
```

### Delete Everything

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope all
```

### With Rate Limit Protection

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --pause-ms 500
```

### Limit Number of Deletions

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --limit 100
```

## Safety Features

### 1. Dry Run by Default

The script runs in dry-run mode by default. You must explicitly pass `--confirm` to perform actual deletions.

### 2. Domain Confirmation

When using `--confirm`, you must type the exact shop domain to proceed:

```
⚠️  DANGER ZONE - IRREVERSIBLE ACTION
======================================================================

You are about to PERMANENTLY DELETE data from: h-moon-hydro.myshopify.com
This action CANNOT be undone.

To confirm, type the shop domain exactly (h-moon-hydro.myshopify.com): 
```

### 3. Logging

All actions are logged to `CSVs/wipe_log.csv` with:
- Timestamp
- Entity type (product/collection)
- Entity ID
- Title and handle
- Action taken
- Status (success/failed/dry_run)
- Error message (if any)

### 4. Rate Limit Handling

The script automatically:
- Handles HTTP 429 (rate limit) responses
- Monitors GraphQL query cost budget
- Implements exponential backoff on errors
- Pauses between operations (configurable with `--pause-ms`)

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview what would be deleted | **Default behavior** |
| `--confirm` | Actually perform deletions | Off |
| `--scope <type>` | What to delete: `products`, `collections`, or `all` | `all` |
| `--limit <n>` | Maximum items to delete | Unlimited |
| `--pause-ms <n>` | Pause between operations (ms) | 200 |
| `--help` | Show help message | - |

## Recommended Workflow

### Before Wipe

1. **Export Products CSV** from Shopify Admin (as backup)
2. **Screenshot/Export Collections** (as reference)
3. **Run dry-run** to verify scope

### Wipe Process

```bash
# 1. Dry run first
npx tsx src/cli/wipeShopifyStore.ts --dry-run

# 2. Delete collections first (less data)
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope collections

# 3. Delete products
npx tsx src/cli/wipeShopifyStore.ts --confirm --scope products --pause-ms 300
```

### After Wipe

1. Verify store is empty in Shopify Admin
2. Import `shopify_import_ready.csv`
3. Import `shopify_import_draft.csv`
4. Create Smart Collections

## Troubleshooting

### "Missing SHOPIFY_ADMIN_TOKEN"

Make sure your environment variables are set:

```bash
# Check if set
echo $SHOPIFY_ADMIN_TOKEN

# Set in current session
export SHOPIFY_ADMIN_TOKEN="shpat_xxx"
```

### Rate Limit Errors

Increase pause time:

```bash
npx tsx src/cli/wipeShopifyStore.ts --confirm --pause-ms 1000
```

### Partial Deletion

If the script fails midway:
- Check `CSVs/wipe_log.csv` to see what was deleted
- Re-run the script (it will only delete remaining items)

## API Reference

This script uses:
- `products(first: 250, after: cursor)` query for pagination
- `productDelete` mutation for product deletion
- `collections(first: 250, after: cursor)` query for collections
- `collectionDelete` mutation for collection deletion

See [Shopify Admin API docs](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productDelete) for details.
