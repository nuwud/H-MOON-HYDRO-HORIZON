# Security Hardening Summary

Date: 2026-02-20

## Overview

This document summarizes credential and account-path hardening applied to remote-operation scripts in this repository.

Primary outcomes:
- Removed hardcoded SSH credentials from scripts.
- Replaced host/user/password literals with environment-variable configuration.
- Removed user/account-specific absolute server paths from code where practical.
- Added git hygiene improvements to reduce accidental commits of generated/local artifacts.

## Security-related commits

- `7c31cbc` — security: remove hardcoded SSH credentials from remote ops scripts
- `63bc34c` — security: remove hardcoded host/account paths from ops scripts
- `a895629` — chore: tighten gitignore for generated outputs and local dump artifacts

Related structured cleanup commits:
- `1740dce` — chore: add audit and diagnostics script toolkit
- `9192203` — chore: add enrichment and import utility scripts
- `6241e4a` — chore: add remaining migration helper scripts

## Required environment variables

Remote-operation scripts now expect these variables:

- `HMOON_SSH_HOST`
- `HMOON_SSH_USER`
- `HMOON_SSH_PASS`
- `HMOON_SITE_DIR` (optional default typically `~/hmoonhydro.com`)

A local `.env` placeholder was created (gitignored) with these keys for developer setup.

## Script classes updated

### Python SSH runner/enrichment scripts

These scripts were updated to use env-based SSH config with fail-fast validation:

- `scripts/quick_check.py`
- `scripts/refresh_manifest.py`
- `scripts/run_audit.py`
- `scripts/upload_run.py`
- `scripts/apply_deep_enrichment.py`
- `scripts/apply_enrichment.py`
- `scripts/category_cleanup.py`
- `scripts/curate.py`
- `scripts/fresh_scrape_pipeline.py`
- `scripts/import_to_woocommerce.py`
- `scripts/quick_audit.py`
- `scripts/run_brand_cleanup.py`
- `scripts/run_enrichment.py`
- `scripts/run_final_audit.py`
- `scripts/run_fix_seeds.py`
- `scripts/run_logos_and_categorize.py`
- `scripts/run_seed_audit.py`
- `scripts/upload_category_icons.py`

### PHP scripts with account-specific absolute paths

These scripts were updated to derive paths from runtime site-root context instead of hardcoded account paths:

- `scripts/deep_enrich.php`
- `scripts/deep_image_match.php`
- `scripts/enrich_parents.php`
- `scripts/fix_images.php`
- `scripts/fix_product_types.php`
- `scripts/smart_desc_enrich.php`

## Git hygiene hardening

`.gitignore` was tightened to suppress noisy/generated artifacts and local dump/scratch files that can lead to accidental commits.

Examples added:
- `outputs/*.php`
- `reports/*.txt`
- `hydroponics_assets/`
- local dump/scratch artifacts (`postmeta`, `posts`, malformed scratch filenames)

## Verification performed

The following checks were run during hardening:

1. Hardcoded literal scan in scripts directory for host/user/password signatures.
2. Repeat scan after patches to confirm removal of sensitive literals.
3. Script diagnostics check for edited files to ensure no immediate errors.
4. Final repository status validation after commits.

## Ongoing recommendations

- Prefer key-based SSH auth over password auth where possible.
- Keep `.env` local-only and rotate credentials if exposure is suspected.
- Continue periodic scans for:
  - hardcoded credentials,
  - user/account absolute paths,
  - accidental commit of generated/output artifacts.
- Consider adding pre-commit secret scanning (e.g., gitleaks/trufflehog) to CI and local hooks.
