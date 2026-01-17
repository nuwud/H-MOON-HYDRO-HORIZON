# Contributing to H-Moon Hydro

Thank you for your interest in contributing! This document provides guidelines and workflows.

## Quick Start

1. Clone the repository
2. Copy `hmoon-pipeline/.env.example` to `hmoon-pipeline/.env` and fill in credentials
3. Run `npm install` in the `hmoon-pipeline/` directory
4. You're ready to develop!

## Before Making Changes

### Use the Agents!

We have custom agents in `agents/` that should be consulted:

| Agent | When to Use |
|-------|-------------|
| `@repo-archeologist` | **BEFORE creating any new script** — search 80+ existing scripts |
| `@shopify-compliance-auditor` | **BEFORE merge/deploy** — validate changes |
| `@safe-shopify-operator` | **BEFORE API mutations** — ensure dry-run guardrails |
| `@brand-normalizer` | When detecting vendors — use 250+ brand registry |
| `@category-classifier` | Product categorization — handle priority conflicts |

### Critical Files

**Never modify without backup:**
- `products_export_1.csv` — Canonical Shopify export
- `pos_shopify_alignment.csv` — Manual SKU mappings
- `HMoonHydro_Inventory.csv` — POS source of truth

### Dry-Run Pattern

All CLI scripts MUST default to dry-run mode:

```typescript
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
// Default is SAFE (dry-run)
```

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes...

# Test with dry-run
npx tsx src/cli/yourScript.ts --dry-run

# If successful, run with confirm
npx tsx src/cli/yourScript.ts --confirm
```

### 2. Data Processing Scripts

When creating scripts that process CSV data:

1. Read with `csvSafeRead.ts` for robust parsing
2. Use `getColumn(row, ...names)` for column name flexibility
3. Validate output matches Shopify's 32-column format
4. Include progress logging for large datasets

### 3. Shopify API Operations

- Always use `200-500ms` pause between mutations
- Handle rate limiting with `throttleStatus` checks
- Wrap all API calls in try/catch

## Code Style

### TypeScript
- Use strict mode
- Prefer `async/await` over raw Promises
- Document functions with JSDoc

### Liquid
- Prefix internal blocks with `_`
- Use `{% content_for 'block' %}` for references
- Never manually edit `templates/*.json`

## Testing

Before submitting a PR:

1. ✅ Run with `--dry-run`
2. ✅ Verify against sample data
3. ✅ Check Shopify import format compatibility
4. ✅ Run `@shopify-compliance-auditor`

## Pull Request Process

1. Fill out the PR template completely
2. Ensure all checklist items are addressed
3. Request review
4. Address feedback
5. Merge when approved

## Questions?

Check the documentation:
- [docs/](./docs/) — General documentation
- [hmoon-pipeline/docs/](./hmoon-pipeline/docs/) — Pipeline-specific docs
- [agents/](./agents/) — Agent definitions

Or open a Discussion for questions!
