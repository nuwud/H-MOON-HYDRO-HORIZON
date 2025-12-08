# H-Moon Hydro Horizon - AI Guide

## Repo Shape
- Shopify Horizon theme (v3.0.1) lives under `assets/`, `sections/`, `snippets/`, `templates/`; analytics automation scripts and CSV exports sit at repo root.
- Section groups (`sections/header-group.json`, `sections/footer-group.json`) compose header/footer from multiple subsections.
- Reusable fragments belong in `blocks/_*.liquid`; add new entries via section block schemas rather than duplicating markup.
- Type tooling comes from `assets/global.d.ts` and `assets/jsconfig.json`; update both when adding new module aliases.
- **HMoon Pipeline** (`hmoon-pipeline/`) is a standalone Node.js + TypeScript toolbelt for product audit, scraping, and enrichment—keep it isolated from theme code.

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
- Custom elements should register once (`customElements.get(...)`) to avoid double-definition when Shopify's Section Rendering API rehydrates a section.

## Data & Inventory Tooling
- Python scripts (`sync_inventory.py`, `process_hmoon_products.py`, `align_pos_inventory.py`, etc.) live in `scripts/` and expect CSVs under `CSVs/`, emitting reports to `reports/`.
- Install dependencies from `requirements.txt`; run `python scripts/sync_inventory.py --help` for CLI options including Shopify API pushes (`--update-shopify`, `--dry-run`, `--throttle`).
- `sync_inventory.py` rewrites Shopify export rows in place, produces timestamped reports (`missing_shopify_fields_*.csv`, `price_updates_*.csv`, `barcode_backfill_*.csv`), and requires env vars `SHOPIFY_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_LOCATION_ID` when hitting the Admin API.
- `process_hmoon_products.py` builds Excel/JSON analytics (`h_moon_hydro_enhanced_analysis_*.xlsx`, `h_moon_hydro_reports_*.json`) and scores content completeness; keep numeric/date parsing consistent with its cleaning steps.
- `scripts/shopify_full_audit.mjs` (Node 18+) uses GraphQL to generate `CSVs/shopify_export_after_prod__INCLUDE_ALL.csv` plus `reports/coverage_report.csv` with an appended problem shortlist; requires `SHOPIFY_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, optional `SHOPIFY_LOCATION_ID`.

## Development Workflow
- Theme preview/build relies on Shopify CLI conventions; the `.shopify/` directory is ready for `shopify theme dev --path .` against the `h-moon-hydro` store after authenticating.
- In JavaScript, guard against `request.design_mode` and `Shopify.designMode` when running editor-only logic so components behave during Section Rendering API reloads.
- Keep additions aligned with existing utility classes (`layout-panel-*`, `spacing-style`, `border-style`) defined in `assets/base.css` to preserve spacing and chroma tokens.
- When adding modules, update import maps, ensure they export ES6 modules, and add `modulepreload` hints if they participate in fold-critical UI.
- Regenerate typings (`assets/global.d.ts`) when introducing new globals or custom element definitions so type-aware tooling remains accurate.

---

# HMoonHydro Product Pipeline (hmoon-pipeline/)

## Pipeline Overview
The `hmoon-pipeline/` folder is a **Node.js + TypeScript toolbelt** designed to:
1. **Pull & audit** product data from Shopify
2. **Score** product completeness
3. **Scrape competitor hydroponics websites**
4. **Extract detailed hydro-specific specs**
5. **Prepare enriched descriptions, SEO, tags, and metafields** for Shopify
6. **Write back** safe updates to Shopify via the Admin API

The project follows **Crystal Seed philosophy**: small files, composable, expandable.

## Pipeline Folder Structure
```
hmoon-pipeline/
  package.json
  .env                    # Shopify credentials (from .env.example)
  src/
    index.ts
    config/productRules.ts
    types/Product.ts
    shopify/
      client.ts           # Shopify GraphQL client
      fetchProducts.ts    # Product fetch logic
    audit/
      computeProductHealth.ts   # Product completeness scoring
    scraping/
      types.ts            # Master ScrapedCompetitorProduct interface
      exampleScraper.ts   # Generic scraper (extend per domain)
    cli/
      syncPull.ts         # npm run sync:pull
      scoreProducts.ts    # npm run score
      scrapeDemo.ts       # npm run scrape:demo
  data/                   # Generated output (products_raw.json, etc.)
```

## Pipeline CLI Commands
```bash
cd hmoon-pipeline
npm run sync:pull    # Fetch products → data/products_raw.json
npm run score        # Score products → data/product_health_scores.json
npm run scrape:demo  # Test competitor scraping (uses SCRAPE_DEMO_URL)
```

## Scraping Requirements
Competitor scraping extracts **hydro-specific specs** via the `ScrapedCompetitorProduct` interface:

### Core Commerce
- SKU, brand, MPN, UPC, availability, price, variants

### Hydro-Specific Specs
- **Nutrients**: NPK ratio, guaranteed analysis, organic certs, OMRI, growth stage, media compatibility
- **Lighting**: fixture type, wattage, spectrum, PPF, efficacy, coverage, dimming, IP rating
- **Environment**: CFM, diameter, filter life, noise level, CO₂ controller features
- **Media/Containers**: type, volume, size, material, special features
- **Pumps**: GPH, head height, submersible, power
- **Meters**: pH/EC/Combo, range, accuracy, calibration
- **Systems**: DWC/RDWC/drip, plant sites, reservoir volume

### Content & SEO
- Usage instructions, mixing ratios, safety warnings, SDS links
- Meta tags, headings, feature/benefit bullets, FAQs, ratings
- Image sets: main, gallery, label closeups, lifestyle, diagrams

### Raw Blocks (for AI interpretation)
- HTML tables, bullet lists, paragraphs

## Extending Scrapers
The base `exampleScraper.ts` is generic. Create domain-specific scrapers for:
- hydrobuilder.com
- growershouse.com
- hydroexperts.com
- growgreenmi.com

Each domain scraper should extract:
- Product title, price, availability
- Brand, SKU from structured data
- Description blocks and spec tables
- Image galleries with proper categorization

**Never overwrite** the master type definition (`scraping/types.ts`)—only extend or populate it.

## Future Modules (AI + Shopify Enrichment)
Planned CLI scripts:
- `npm run enrich` - Merge scraped data, normalize specs, build enriched products
- `npm run update:shopify` - Write metafields, SEO, tags back to Shopify

## Copilot Expectations for Pipeline

### ✔ DO:
- Follow the existing folder structure
- Use TypeScript with explicit interfaces
- Prefer small modular utilities over large monolithic functions
- Suggest improvements consistent with the hydroponics domain
- Maintain consistent naming conventions
- Keep scrapers site-specific and isolated
- Preserve Crystal Seed philosophy (small files, composable, expandable)

### ✘ DON'T:
- Replace or rewrite existing files unless explicitly asked
- Hard-code credentials or environment variables
- Introduce unrelated frameworks (React, Next.js) into this toolbelt
- Mix Shopify theme code with pipeline code

## Example Prompts for Pipeline Work
```
"Extend exampleScraper.ts to support hydrobuilder.com. Extract brand, SKU, price, availability, table specs, and image gallery."

"Create normalizeLightingSpecs.ts to parse raw spec tables into the LightingSpecs interface."

"Add a new CLI script scrape:hydrobuilder that scrapes URLs from data/competitor_urls.txt and saves structured output."

"Implement writeMetafields.ts to update Shopify metafields for specs and usage."
```

---

# Development Methodology

## Core Philosophy: Crystal Seed
- **Small files** (<200 lines) with single responsibility
- **Composable modules** that can be combined
- **Expandable patterns** that grow without rewrites
- **Explicit types** and interfaces over implicit any

## Copilot Workflow (Every Chat)
1. **Understand** - Read relevant files before suggesting changes
2. **Plan** - Explain approach before editing
3. **Execute** - Make incremental changes (<50 lines per edit preferred)
4. **Verify** - Build/lint/test after changes

## Safety Rules
- Never delete files without explicit confirmation
- Never rewrite entire files—edit surgically
- Preserve existing imports and exports
- Ask before changing shared types or interfaces
- Commit logical units of work separately

## Code Style
- **TypeScript**: explicit return types, interfaces over type aliases, named exports
- **Python**: type hints, docstrings on public functions, snake_case
- **Liquid**: use existing snippets, follow section schema patterns
- **Naming**: camelCase (functions/variables), PascalCase (types/classes/components)

## When in Doubt
- Prefer adding new files over modifying existing ones
- Prefer extending interfaces over changing them
- Prefer composition over inheritance
- Ask clarifying questions rather than assuming
