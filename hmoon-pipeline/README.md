# HMoonHydro Product Pipeline (Enhanced Seed)

This is a **seed toolkit** for auditing and enriching HMoonHydro products outside Shopify, then writing safe updates back via the Admin API. It now includes a strongly-typed schema for **competitor scraping**, tailored to hydroponics products.

## What it does right now

- Loads environment variables from `.env`.
- Has a Shopify GraphQL client ready to use.
- Provides a `sync:pull` CLI command that fetches products and writes them to `data/products_raw.json`.
- Provides a `score` CLI command that scores products using a simple "product health" metric.
- Provides a `scrape:demo` CLI command with a **hydro-specific scraping schema** and a placeholder scraper implementation.

You can grow this with GitHub Copilot into a full pipeline:
- Cross-reference POS CSV + Shopify export.
- Scrape competitors for detailed specs (NPK, PPF, CFM, etc.).
- Generate AI-powered descriptions, SEO, tags, and specs.
- Write back tags, metafields, and SEO into Shopify.

## Quick start

1. Unzip this `hmoon-pipeline` folder into your Shopify project root (or next to it).
2. In a terminal, `cd` into `hmoon-pipeline`.
3. Copy `.env.example` to `.env` and fill in your Shopify Admin API token:

   ```bash
   cp .env.example .env
   ```

4. Install dependencies:

   ```bash
   npm install
   ```

5. Try a product fetch:

   ```bash
   npm run sync:pull
   ```

6. Score products:

   ```bash
   npm run score
   ```

7. Try the scraping demo:

   ```bash
   # Set SCRAPE_DEMO_URL in .env first to point at a real product page
   npm run scrape:demo
   ```

## Folder layout

- `src/shopify` – Shopify client + product fetch helpers
- `src/config` – rules for what a "complete" product looks like
- `src/audit` – product health scoring
- `src/scraping` – competitor scraping types, normalizers, and a demo scraper
- `src/cli` – small CLI entrypoints you can grow into a full toolbelt
- `data/` – local JSON/CSV cache (ignored by git)

Use this as your **Crystal Seed**: open any of these files in VS Code and ask Copilot to extend them (e.g., implement per-site scrapers, normalize specs, or wire AI enrichment).
