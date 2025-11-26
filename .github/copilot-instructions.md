# H-Moon Hydro Horizon - AI Guide

## Repo Shape
- Shopify Horizon theme (v3.0.1) lives under `assets/`, `sections/`, `snippets/`, `templates/`; analytics automation scripts and CSV exports sit at repo root.
- Section groups (`sections/header-group.json`, `sections/footer-group.json`) compose header/footer from multiple subsections.
- Reusable fragments belong in `blocks/_*.liquid`; add new entries via section block schemas rather than duplicating markup.
- Type tooling comes from `assets/global.d.ts` and `assets/jsconfig.json`; update both when adding new module aliases.

## Theme Architecture
- `snippets/scripts.liquid` owns the ES module import map (`@theme/*`) and preload ordering; register new modules there so hydration works in production.
- All interactive components extend `Component` (`assets/component.js`) to gain `refs` autowiring (`ref` / `ref[]` attributes) and `on:event` declarative handlers; missing required refs throw `MissingRefError`.
- Render-blocking primitives (e.g. `DeclarativeShadowElement`, `OverflowList`) live in `assets/critical.js` and rely on `Theme.utilities.scheduler.schedule` for batched layout work.
- `assets/utilities.js` centralizes performance helpers (`requestIdleCallback`, `startViewTransition`, `prefersReducedMotion`, low-power checks); call these before kicking off heavy DOM or animation work.
- When extending the Theme global, merge into `Theme.*` (see `snippets/scripts.liquid`) instead of overwriting the object so existing consumers keep their hooks.

## Liquid & Styling Patterns
- Every section ultimately renders through `snippets/section.liquid`, which applies color scheme classes, overlay toggles, and CSS custom properties for width/height/padding.
- Global section schema in `sections/section.liquid` defines alignment controls reused across feature sections; extend those options rather than reimplementing layout knobs.
- Header/footer behavior depends on section group JSON; edit the nested sections (`sections/header.liquid`, etc.) instead of touching `layout/theme.liquid` directly.
- Maintain `data-testid="ui-test-*"` hooks when adding customer-facing content so editor smoke tests keep working.
- Color and overlay logic flow through `snippets/color-schemes.liquid`, `snippets/overlay.liquid`, and shared classes like `section-wrapper`, `layout-panel-flex`.

## Performance & UX Notes
- Modulepreload entries in `snippets/scripts.liquid` control critical path; preload new modules there if they gatefold above-the-fold UI.
- View transitions are toggled by settings (`page_transition_enabled`, `transition_to_main_product`); pass a transition type string already registered in `assets/utilities.js` when calling `startViewTransition`.
- `Theme.utilities.scheduler` and `requestYieldCallback` help defer DOM mutations after frame commits; prefer them over raw `setTimeout` for synchronized updates.
- Respect reduced motion and low-power guards before running animations; many components check `prefersReducedMotion()` and `isLowPowerDevice()`—follow suit for new behavior.
- Custom elements should register once (`customElements.get(...)`) to avoid double-definition when Shopify’s Section Rendering API rehydrates a section.

## Data & Inventory Tooling
- Python scripts (`sync_inventory.py`, `process_hmoon_products.py`, `align_pos_inventory.py`, etc.) expect Shopify and WooCommerce CSVs under `CSVs/` and emit enhanced files into `CSVs/` and `reports/`.
- Install dependencies from `requirements.txt`; run `python sync_inventory.py --help` for CLI options including Shopify API pushes (`--update-shopify`, `--dry-run`, `--throttle`).
- `sync_inventory.py` rewrites Shopify export rows in place, produces timestamped reports (`missing_shopify_fields_*.csv`, `price_updates_*.csv`, `barcode_backfill_*.csv`), and requires env vars `SHOPIFY_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_LOCATION_ID` when hitting the Admin API.
- `process_hmoon_products.py` builds Excel/JSON analytics (`h_moon_hydro_enhanced_analysis_*.xlsx`, `h_moon_hydro_reports_*.json`) and scores content completeness; keep numeric/date parsing consistent with its cleaning steps.
- `scripts/shopify_full_audit.mjs` (Node 18+) uses GraphQL to generate `CSVs/shopify_export_after_prod__INCLUDE_ALL.csv` plus `reports/coverage_report.csv` with an appended problem shortlist; requires `SHOPIFY_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, optional `SHOPIFY_LOCATION_ID`.

## Development Workflow
- Theme preview/build relies on Shopify CLI conventions; the `.shopify/` directory is ready for `shopify theme dev --path .` against the `h-moon-hydro` store after authenticating.
- In JavaScript, guard against `request.design_mode` and `Shopify.designMode` when running editor-only logic so components behave during Section Rendering API reloads.
- Keep additions aligned with existing utility classes (`layout-panel-*`, `spacing-style`, `border-style`) defined in `assets/base.css` to preserve spacing and chroma tokens.
- When adding modules, update import maps, ensure they export ES6 modules, and add `modulepreload` hints if they participate in fold-critical UI.
- Regenerate typings (`assets/global.d.ts`) when introducing new globals or custom element definitions so type-aware tooling remains accurate.