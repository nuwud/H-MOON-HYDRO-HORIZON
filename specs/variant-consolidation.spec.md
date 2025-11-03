# Variant Consolidation Spec

## Overview

WooCommerce used grouped products with a blank parent/placeholder item that listed related simples in the `Grouped products` column. During migration the items were imported into Shopify as individual products, and a handful of families were manually rebuilt as multi-variant products (for example `the-trimpro`, `trimpro-rotor`, `ultra-premium-connoisseur`). We want an automated process that:

- Reads the legacy Woo export to discover product families.
- Rebuilds those families as multi-variant records that mirror the new manually curated pattern.
- Preserves and backfills key metadata (pricing, inventory policy, shipping, tax, publication state).
- Produces redirect mappings so every retired URL (Woo + legacy Shopify handles) points to the new consolidated handle.

This spec describes the data sources, transformation rules, outputs, and validation required to make the process repeatable.

## Data Sources

- `CSVs/Products-Export-2025-Oct-29-171532.csv` – WooCommerce export; authoritative for grouped relationships, SKU-level pricing, weights, and the `_w2s_shopify_data` JSON that records current Shopify IDs.
- `CSVs/products_export_1.csv` – latest pulled Shopify catalog; shows the desired structure for multi-variant products and current field defaults (status `active`, `Variant_Requires_Shipping=True`, etc.).
- `CSVs/shopify_inventory_synced.csv` – sync output; identical to the live Shopify export and safe to use for inspection. The automation does **not** overwrite this file directly; it creates its own outputs.

## Terminology

- **Woo parent** – A row where `Type == "grouped"`. Holds the canonical name, description, and slug for the family. `Grouped products` contains a pipe-delimited list (`|~|`) of child product display names.
- **Woo child** – Rows where `Type == "simple"` that are referenced by a parent via `Grouped products`. Children have the real SKU, price, stock, weight, and `_w2s_shopify_data` pointer to their current Shopify product + variant IDs.
- **Shopify variant template** – The set of fields copied from existing multi-variant Shopify records (status, inventory policy, shipping flags, published state, option labeling). These serve as defaults for regenerated variants.

## High-Level Flow

1. **Parse Woo data**
   - Index Woo rows by SKU and by normalized product name.
   - Parse `_w2s_shopify_data` for each simple row to capture existing Shopify `product_id` + `variant_id` mappings.
   - Parse grouped parent rows and split `Grouped products` on `|~|`, removing blanks.

2. **Build group definition**
   - For each parent row, resolve its child SKUs by matching child names (case-insensitive) and, if needed, joining on the `_w2s_shopify_data` map.
   - Record the parent’s metadata (name, slug, descriptions, SEO fields) as the canonical product content.
   - Record which Woo simple rows are claimed so we can detect stragglers that never get consolidated.

3. **Derive Shopify defaults**
   - Capture a template snapshot from the existing consolidated handles (status `active`, published timestamp populated, `Variant_Requires_Shipping=True`, `Variant_Taxable=True`, `Variant_Inventory=0` when stock missing, inventory policy `deny`, tracker `shopify`).
   - Determine option labeling strategy: use `Option1` with display text that matches each child’s Woo product name. If a parent already contains consistent tokens (`qt`, `gal`, `bag of 10`, etc.), normalize them via a mapping table (configurable) to ensure option values stay clean.

4. **Construct consolidated product rows**
   - Choose the new handle: default to the Woo parent slug, slugified; if the slug conflicts with an existing Shopify handle encountered in `_w2s_shopify_data`, append a suffix (e.g., `-bundle`).
   - Select the Shopify product ID to preserve: if any child’s `_w2s_shopify_data` product ID already points to a manually consolidated product, reuse that ID; otherwise plan to create a net-new product (ID left blank in the CSV to allow Shopify import to create it) and record old product IDs for removal/redirect.
   - Generate one CSV row per variant. Columns populated as follows:
     - `Product_Name`, `Description`, `SEO Title/Description`, `Tags`, `Vendor` pulled from the Woo parent (falling back to best child where necessary).
     - `Status` and `Published_Date` follow the template default (`active` and timestamp now). Allow override if Woo parent was unpublished.
     - `Variant_Title` and `Variant_Option1` use the child’s Woo `Product Name` after normalization.
     - `Variant_SKU`, `Variant_Price`, `Variant_Compare_Price`, and barcode pulled from Woo child.
     - `Variant_Inventory` uses Woo `Stock`; when blank, set to `0` and mark for review if `Manage Stock` was `yes`.
     - `Variant_Weight`/`Variant_Weight_Unit` from Woo child weight; if missing, apply configurable defaults (e.g., weight `0`, unit `lb`) and emit a "shipping follow-up" report line including SKU, handle, and Woo dimensions (or lack thereof).
     - `Variant_Requires_Shipping`, `Variant_Taxable`, `Variant_Inventory_Policy`, `Variant_Inventory_Tracker`, and `Variant_Fulfillment_Service` set from template (`True`, `True`, `deny`, `shopify`, `manual`).
     - `Image_URL` and related columns: prefer parent imagery; if absent, fall back to child's first image (Woo `Image URL` or Shopify existing image via `_w2s_shopify_data`).

5. **Retire superseded records**
   - For every child SKU that maps to a distinct Shopify product ID, generate entries for a retirement CSV with `Status=draft` or `Archived` so they can be deactivated after the consolidated product imports cleanly.
   - Build a redirect table mapping:
     - Legacy Shopify product handles (from `products_export_1.csv`) for each retired product.
     - Woo permalink slugs (`Permalink` column) for both parent and children.
     - Target URL = `/products/{new_handle}`.

6. **Reporting**
   - `variant_consolidation.csv` – the primary Shopify import file containing consolidated products.
   - `variant_retirements.csv` – rows for existing Shopify products to unpublish/archive.
   - `redirect_mappings.csv` – three columns: `source_url`, `target_url`, `notes` (e.g., `woo-parent`, `legacy-shopify`).
   - `shipping_follow_up.csv` – SKUs lacking weight/dimension data.
   - `unmatched_children.csv` – Woo simple items that never joined a parent (possible data issue).

## Field Mapping Details

| Shopify column | Source | Notes |
| --- | --- | --- |
| `Handle` | Woo parent slug normalized to Shopify format | Deduplicate by suffixing `-bundle` or `-set` if needed |
| `Product_Name` | Woo parent `Product Name` | Clean HTML entities |
| `Description` | Woo parent `Product description` (HTML) | Fallback to first child description |
| `Tags` | Merge Woo parent tags with child tags | De-duplicate, comma-separated |
| `Vendor` | Woo parent `Brands`; fallback to manual default (`H Moon Hydro`) |
| `Variant_SKU` | Woo child `Sku` | Required |
| `Variant_Title` | Normalized Woo child `Product Name` | 1:1 with option value |
| `Variant_Price` | Woo child `Price` or `Regular Price` | Format to two decimals |
| `Variant_Compare_Price` | Woo child `Regular Price` when greater than primary price | Empty otherwise |
| `Variant_Inventory` | Woo child `Stock`; zero when missing | When Woo `Manage Stock` == `no`, set `Variant_Inventory` to `0` and mark `shipping_follow_up` |
| `Variant_Requires_Shipping` | Template default (`True`) | Override only if Woo marks item `Virtual` |
| `Variant_Taxable` | Template default (`True`) | Override when Woo `Tax Status` == `none` |
| `Variant_Weight` | Woo child `Weight`; default when missing | Units taken from Woo (`lb` when blank) |
| `Image_URL` | Woo parent `Image URL`; fallback to first child image | Additional images staged via separate media CSV if needed |

## Option Normalization

- Build a dictionary translating common suffixes to clean option tokens, e.g.:
  - `1 qt` → `1 qt`
  - `1 gal` → `1 gal`
  - `bag of 10` → `Bag of 10`
  - `replacement grate original 1/4"` → keep literal for clarity.
- Option label (`Option1 Name`) defaults to `Variant` but can be set to `Size` when all children share a consistent unit keyword. Rule: if every option value contains a volume/quantity token from the dictionary, set `Option1 Name = Size`; otherwise use `Style`.
- When a parent only yields one child SKU, skip consolidation and leave it out of the output (log to `unmatched_children.csv`).

## Redirect Strategy

- Use `_w2s_shopify_data` to capture existing Shopify product IDs for each child SKU. Cross-reference those IDs with the latest Shopify CSV to get original handles.
- Redirect each original handle to `/products/{new_handle}`.
- Include Woo URLs (parent + each child `Permalink`) in the redirect file so the web server / Shopify redirect manager can be seeded with both old domains (`hmoonhydro.com/...`) and new ones.
- Provide optional `metafields/redirect` JSON to feed into Shopify if bulk import via API is preferred.

## Configuration & Defaults

- YAML or JSON config file (`config/variant_consolidation.json`) storing:
  - `option_value_map` (dictionary of replacements).
  - `default_weight`: numeric + unit.
  - `default_inventory_policy`: `deny`.
  - `redirect_domain_prefixes`: list of base URLs to prepend for Woo redirects.
  - `handle_suffixes`: order of suffixes to apply when deduplicating handles.
- CLI parameters for the eventual script:
  - `--woo-csv`, `--shopify-csv`, `--output-dir` (defaults to above paths).
  - `--dry-run` to emit reports without generating the consolidated CSV.
  - `--limit` for debugging specific parent slugs.

## Validation & QA

- **Integrity** – confirm every Woo grouped parent results in ≥1 Shopify variant row. Compare counts: number of unique grouped child names vs. generated variants.
- **SKU coverage** – ensure all Woo child SKUs that belong to a grouped parent appear exactly once in the consolidated CSV.
- **Price parity** – difference between Woo price and generated variant price must be zero.
- **Redirect completeness** – verify every legacy Shopify handle detected in `_w2s_shopify_data` has a redirect entry.
- **Manual spot-check** – after import, inspect a sample of multi-variant products in Shopify admin to verify option labels, pricing, and shipping flags.

## Deliverables

1. `specs/variant-consolidation.spec.md` (this document).
2. Implementation scripts (future work) that:
   - Generate the consolidated CSV + auxiliary reports.
   - Provide a command to write redirects and retire legacy products.
3. Updated project README notes pointing to the new workflow once implemented.

## Out of Scope

- Automatic deletion/archival of retired products inside Shopify (manual or separate script).
- Media gallery deduplication beyond selecting a single primary image.
- Automated metafield or tag enrichment beyond what exists in Woo export.
- Handling of Woo variable products (none present in the export).

## Open Questions (resolved during spec drafting)

- **Handle naming** – default to Woo parent slug; append suffix only on collision.
- **Option label vocabulary** – use `Size` when all option values match the dictionary; otherwise `Variant`.
- **Content source precedence** – prefer Woo parent description/SEO; fallback to the richest child (longest description) when parent is empty.

This spec is ready for implementation via the Spec Kit workflow.
