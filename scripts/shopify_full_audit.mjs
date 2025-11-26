// scripts/shopify_full_audit.mjs
// HMoonHydro — Full Shopify Inventory & Product Audit
// Fresh GraphQL export (all statuses), variant-level details incl. per-location inventory,
// coverage metrics + problem shortlist, CSV outputs, robust rate-limit retries.

import fs from "fs";
import path from "path";
import os from "os";

// -------- Config / Env --------
const SHOPIFY_DOMAIN       = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const TARGET_LOCATION_ID   = process.env.SHOPIFY_LOCATION_ID; // numeric ID suffix provided (e.g., 75941806154)

if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error("ERROR: Missing SHOPIFY_DOMAIN or SHOPIFY_ACCESS_TOKEN env.");
  process.exit(1);
}

const OUT_ALL = path.join("CSVs", "shopify_export_after_prod__INCLUDE_ALL.csv");
const OUT_REPORT = path.join("reports", "coverage_report.csv");

// -------- Helpers --------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}, attempt = 1) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  // Handle rate limits & 5xx with backoff
  if (res.status === 429 || res.status >= 500) {
    const wait = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.warn(`[WARN] HTTP ${res.status} — backing off ${wait}ms (attempt ${attempt})`);
    await sleep(wait);
    return gql(query, variables, attempt + 1);
  }

  const json = await res.json();

  if (json.errors) {
    // Non-retriable GraphQL errors surfaced
    console.error("[GraphQL Errors]", JSON.stringify(json.errors, null, 2));
    throw new Error("GraphQL errors encountered.");
  }

  // Throttle hint (best-effort)
  const costInfo = json?.extensions?.cost;
  if (costInfo) {
    const currentlyAvailable = costInfo?.throttleStatus?.currentlyAvailable || null;
    const restoreRate = costInfo?.throttleStatus?.restoreRate || null;
    if (currentlyAvailable !== null && currentlyAvailable < 50) {
      const wait = 500 + (restoreRate ? 1000 / restoreRate : 500);
      console.log(`[INFO] Throttle low (${currentlyAvailable}). Sleeping ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }

  return json.data;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCSV(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))
  ];
  fs.writeFileSync(filePath, lines.join(os.EOL), "utf8");
}

// Extract numeric ID suffix from a gid (e.g. gid://shopify/Location/75941806154)
function gidToIdSuffix(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  return parts[parts.length - 1] || null;
}

// -------- Core Export Logic --------
async function fetchAllProducts() {
  const PROD_QUERY = `
    query Products($after: String) {
  products(first: 30, after: $after, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            status
            vendor
            productType
            variants(first: 40) {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity  # deprecated in future, fallback via inventoryLevels sum
                  inventoryItem {
                    id
                    unitCost { amount currencyCode }
                    inventoryLevels(first: 20) {
                      edges {
                        node {
                          location { id name }
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let hasNext = true;
  let cursor = null;
  const products = [];

  while (hasNext) {
    console.log(`[INFO] Fetching products page (after=${cursor})`);
    const data = await gql(PROD_QUERY, { after: cursor });
    const page = data?.products;
    if (!page) break;
    for (const edge of page.edges) {
      products.push(edge.node);
    }
    hasNext = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor || null;
  }

  console.log(`[INFO] Total products fetched: ${products.length}`);
  return products;
}

function flattenRows(products) {
  const rows = [];
  const metrics = {
    totalProducts: 0,
    byStatus: { ACTIVE: 0, DRAFT: 0, ARCHIVED: 0, UNKNOWN: 0 },
    totalVariants: 0,
    missingSKU: 0,
    zeroOrBlankPrice: 0,
    archivedOrDraftWithInventory: 0
  };

  const locationTarget = TARGET_LOCATION_ID ? String(TARGET_LOCATION_ID) : null;

  for (const p of products) {
    metrics.totalProducts++;
    const status = (p.status || "UNKNOWN").toUpperCase();
    if (!metrics.byStatus[status]) metrics.byStatus[status] = 0;
    metrics.byStatus[status]++;

    const productBasics = {
      product_id: p.id,
      product_handle: p.handle,
      product_title: p.title,
      product_status: status,
      product_vendor: p.vendor || "",
      product_type: p.productType || ""
    };

    const variants = p?.variants?.edges?.map(e => e.node) || [];
    if (!variants.length) {
      // produce a row with no variant info (edge case: product with zero variants)
      rows.push({
        ...productBasics,
        variant_id: "",
        variant_title: "",
        sku: "",
        barcode: "",
        price: "",
        compare_at_price: "",
        cost_amount: "",
        cost_currency: "",
        inv_total_all_locations: "",
        inv_at_target_location: "",
        inv_detail_json: "[]"
      });
      continue;
    }

    for (const v of variants) {
      metrics.totalVariants++;

      const invEdges = v?.inventoryItem?.inventoryLevels?.edges || [];
      let totalAvailable = 0;
      let atTarget = 0;
      const invDetail = [];

      for (const lv of invEdges) {
        const quantities = lv.node.quantities || [];
        const availableEntry = quantities.find(q => (q?.name || "").toLowerCase() === "available");
        const available = Number(availableEntry?.quantity || 0);
        const locGid = lv.node.location?.id || null;
        const locName = lv.node.location?.name || "";
        const locIdSuffix = gidToIdSuffix(locGid);

        totalAvailable += available;
        if (locationTarget && locIdSuffix === locationTarget) {
          atTarget += available;
        }
        invDetail.push({
          location_id_suffix: locIdSuffix,
          location_name: locName,
          available
        });
      }

      // price may be string or MoneyV2; handle both forms defensively
      const price = v.price?.amount ?? v.price ?? "";
      const compareAtPrice = v.compareAtPrice?.amount ?? v.compareAtPrice ?? "";

      if (!v.sku || String(v.sku).trim() === "") metrics.missingSKU++;
      if (!price || Number(price) === 0) metrics.zeroOrBlankPrice++;

      const row = {
        ...productBasics,
        variant_id: v.id,
        variant_title: v.title || "",
        sku: v.sku || "",
        barcode: v.barcode || "",
        price: price,
        compare_at_price: compareAtPrice,
        cost_amount: v.inventoryItem?.unitCost?.amount ?? "",
        cost_currency: v.inventoryItem?.unitCost?.currencyCode ?? "",
        inv_total_all_locations: totalAvailable,
        inv_at_target_location: atTarget,
        inv_detail_json: JSON.stringify(invDetail)
      };
      rows.push(row);

      if ((status === "ARCHIVED" || status === "DRAFT") && totalAvailable > 0) {
        metrics.archivedOrDraftWithInventory++;
      }
    }
  }

  // Derived metric
  const percentMissingSKU = metrics.totalVariants
    ? ((metrics.missingSKU / metrics.totalVariants) * 100)
    : 0;

  return { rows, metrics: { ...metrics, percentMissingSKU: Number(percentMissingSKU.toFixed(2)) } };
}

function buildCoverageReportRows(metrics) {
  const r = [];
  r.push({ metric: "Total Products", value: metrics.totalProducts });
  r.push({ metric: "Total Variants", value: metrics.totalVariants });
  r.push({ metric: "Active Products", value: metrics.byStatus.ACTIVE || 0 });
  r.push({ metric: "Draft Products", value: metrics.byStatus.DRAFT || 0 });
  r.push({ metric: "Archived Products", value: metrics.byStatus.ARCHIVED || 0 });
  r.push({ metric: "% Variants Missing SKU", value: metrics.percentMissingSKU + "%" });
  r.push({ metric: "Variants with Blank/Zero Price", value: metrics.zeroOrBlankPrice });
  r.push({ metric: "Archived/Draft with Inventory", value: metrics.archivedOrDraftWithInventory });
  return r;
}

// Also produce a *problem shortlist* section appended beneath the coverage metrics:
function buildProblemShortlistRows(allRows) {
  const isBlank = (x) => x === null || x === undefined || String(x).trim() === "";
  const zeroOrBlank = (x) => isBlank(x) || Number(x) === 0;

  const problems = allRows.filter(r =>
    isBlank(r.sku) ||
    zeroOrBlank(r.price) ||
    ((r.product_status === "ARCHIVED" || r.product_status === "DRAFT") && Number(r.inv_total_all_locations) > 0)
  );

  // Cap to top 300 for readability (still all issues exist in the main export)
  const MAX = 300;
  const slice = problems.slice(0, MAX);

  // We return rows that can be appended *after* a blank separator line in coverage_report.csv
  const header = [{ metric: "PROBLEM SHORTLIST (first 300)", value: "" }];
  const columnsHeader = [{
    metric: "product_handle / variant_id / sku",
    value: "status | price | total_inv | target_loc_inv"
  }];

  const list = slice.map(p => ({
    metric: `${p.product_handle} | ${p.variant_id} | ${p.sku || "(blank)"}`,
    value: `${p.product_status} | ${p.price || "(blank/0)"} | ${p.inv_total_all_locations} | ${p.inv_at_target_location}`
  }));

  return [...header, ...columnsHeader, ...list];
}

// -------- Main --------
(async function main() {
  try {
    console.log("[START] HMoonHydro Shopify Full Audit");
    console.log(`[INFO] Domain=${SHOPIFY_DOMAIN}  TargetLocationID=${TARGET_LOCATION_ID || "(none)"}`);

    // Ensure folders exist
    fs.mkdirSync("CSVs", { recursive: true });
    fs.mkdirSync("reports", { recursive: true });

    // Fresh live export
    const products = await fetchAllProducts();

    // Flatten to variant rows + metrics
    const { rows, metrics } = flattenRows(products);

    // Write the full variant export
    writeCSV(OUT_ALL, rows);
    console.log(`[OK] Wrote ${rows.length} rows -> ${OUT_ALL}`);

    // Build and write coverage report (+ problem shortlist)
    const cov = buildCoverageReportRows(metrics);
    writeCSV(OUT_REPORT, cov);

    // Append a blank line + problem shortlist
    const shortlist = buildProblemShortlistRows(rows);
    const appendLines = [
      "", // blank separator
      ...[
        Object.keys(shortlist[0]).join(","),
        ...shortlist.map(r => [csvEscape(r.metric), csvEscape(r.value)].join(","))
      ]
    ].join(os.EOL);
    fs.appendFileSync(OUT_REPORT, os.EOL + appendLines, "utf8");
    console.log(`[OK] Wrote coverage + shortlist -> ${OUT_REPORT}`);

    console.log("[DONE] Audit completed successfully.");

  } catch (err) {
    console.error("[FATAL] Audit failed:", err?.message || err);
    process.exit(2);
  }
})();
