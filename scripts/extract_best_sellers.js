#!/usr/bin/env node
/**
 * extract_best_sellers.js
 * Build best-seller rankings from WooCommerce order export.
 *
 * Usage:
 *   node scripts/extract_best_sellers.js
 *   node scripts/extract_best_sellers.js --orders ./CSVs/WooExport/Shop-Orders-Export-2025-Dec-31-180904.csv --top 50
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ORDERS = path.join(ROOT, 'CSVs', 'WooExport', 'Shop-Orders-Export-2025-Dec-31-180904.csv');
const IMPORT_CANDIDATES = [
  path.join(ROOT, 'outputs', 'woocommerce_import_with_prices.csv'),
  path.join(ROOT, 'outputs', 'woocommerce_import_ready.csv')
];
const OUT_DIR = path.join(ROOT, 'outputs', 'analytics');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

function toNumber(value) {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : 0;
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(s) {
  return decodeHtml(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(s) {
  return cleanName(s)
    .toLowerCase()
    .replace(/\(\s*\d+\s*(oz|ml|l|lt|gal|gallon|lb|kg|qt|pt|pack|pc|count|liter|liters)\s*\)/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLooseName(s) {
  return normalizeName(s)
    .replace(/\b\d+(\.\d+)?\s*(oz|ml|l|lt|gal|gallon|lb|lbs|kg|qt|pt|pack|pk|ct|count|liter|liters|inch|in|cm|mm)\b/gi, ' ')
    .replace(/\b\d+(\.\d+)?\b/g, ' ')
    .replace(/\b(the|and|for|with|by|of|new|original)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSignature(s) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'by', 'of', 'new', 'original',
    'oz', 'ml', 'l', 'lt', 'gal', 'gallon', 'lb', 'lbs', 'kg', 'qt', 'pt',
    'pack', 'pk', 'ct', 'count', 'liter', 'liters', 'inch', 'in', 'cm', 'mm'
  ]);

  const tokens = normalizeLooseName(s)
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !stop.has(t));

  if (!tokens.length) return '';

  return [...new Set(tokens)].sort().join(' ');
}

function splitNames(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text.split('||||').map(cleanName).filter(Boolean);
}

function splitPositiveQuantities(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split('||')
    .map(v => toNumber(v))
    .filter(v => v > 0);
}

function bestEffortItems(names, qtyRaw) {
  if (!names.length) return [];
  const qty = splitPositiveQuantities(qtyRaw);
  if (!qty.length) {
    return names.map(name => ({ name, quantity: 1 }));
  }

  if (qty.length >= names.length) {
    return names.map((name, idx) => ({ name, quantity: qty[idx] || 1 }));
  }

  // Fallback: if quantities are fewer than names, use first quantity then 1s.
  return names.map((name, idx) => ({ name, quantity: idx === 0 ? (qty[0] || 1) : 1 }));
}

function resolveImportCsv() {
  for (const p of IMPORT_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildImportIndex(importCsvPath) {
  if (!importCsvPath || !fs.existsSync(importCsvPath)) return null;
  const data = fs.readFileSync(importCsvPath, 'utf8');
  const rows = parse(data, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

  const byName = new Map();
  const byLooseName = new Map();
  const bySignature = new Map();

  function chooseBetter(existing, candidate) {
    if (!existing) return candidate;
    const existingHasSku = Boolean(String(existing.sku || '').trim());
    const candidateHasSku = Boolean(String(candidate.sku || '').trim());
    if (candidateHasSku && !existingHasSku) return candidate;
    if (existingHasSku && !candidateHasSku) return existing;
    return String(candidate.name || '').length > String(existing.name || '').length ? candidate : existing;
  }

  for (const row of rows) {
    const type = String(row.Type || '').toLowerCase();
    if (type === 'variation') continue;

    const name = cleanName(row.Name || '');
    if (!name) continue;
    const strictKey = normalizeName(name);
    const looseKey = normalizeLooseName(name);
    const sigKey = nameSignature(name);
    if (!strictKey) continue;

    const rec = {
      sku: row.SKU || '',
      name,
      brand: row.Brands || '',
      category: row.Categories || ''
    };

    byName.set(strictKey, chooseBetter(byName.get(strictKey), rec));

    if (looseKey) {
      byLooseName.set(looseKey, chooseBetter(byLooseName.get(looseKey), rec));
    }

    if (sigKey) {
      bySignature.set(sigKey, chooseBetter(bySignature.get(sigKey), rec));
    }
  }

  return { byName, byLooseName, bySignature };
}

function main() {
  const ordersPath = argValue('--orders', DEFAULT_ORDERS);
  const topN = Math.max(1, toNumber(argValue('--top', '25')) || 25);

  if (!fs.existsSync(ordersPath)) {
    console.error(`ERROR: Orders CSV not found: ${ordersPath}`);
    process.exit(1);
  }

  const importCsvPath = resolveImportCsv();
  const importIndex = buildImportIndex(importCsvPath);

  const csv = fs.readFileSync(ordersPath, 'utf8');
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });

  const includeStatuses = new Set(['completed', 'processing']);
  const totals = new Map();

  for (const row of rows) {
    const status = String(row['Order Status'] || '').toLowerCase();
    if (!includeStatuses.has(status)) continue;

    const orderId = String(row['Order ID'] || '').trim();
    const names = splitNames(row['Item Name'] || row['Product Name'] || '');
    if (!names.length) continue;

    const lineItems = bestEffortItems(names, row['Quantity'] || row['Total Item Quantity'] || '');

    for (const item of lineItems) {
      const normalized = normalizeName(item.name);
      if (!normalized) continue;

      if (!totals.has(normalized)) {
        totals.set(normalized, {
          normalized,
          productName: item.name,
          unitsSold: 0,
          orderIds: new Set(),
          matched: false,
          sku: '',
          brand: '',
          category: ''
        });
      }

      const agg = totals.get(normalized);
      agg.unitsSold += item.quantity;
      if (orderId) agg.orderIds.add(orderId);
      if (item.name.length > agg.productName.length) agg.productName = item.name;
    }

    // Optional refund subtraction when available
    const refundNames = splitNames(row['Refund Items'] || '');
    if (refundNames.length) {
      const refundItems = bestEffortItems(refundNames, row['Refund Item Quantity'] || '');
      for (const item of refundItems) {
        const normalized = normalizeName(item.name);
        if (!normalized || !totals.has(normalized)) continue;
        const agg = totals.get(normalized);
        agg.unitsSold -= item.quantity;
      }
    }
  }

  // Join to current import catalog
  if (importIndex) {
    for (const [key, rec] of totals.entries()) {
      const strictMatch = importIndex.byName.get(key);
      const looseKey = normalizeLooseName(rec.productName);
      const sigKey = nameSignature(rec.productName);
      const looseMatch = looseKey ? importIndex.byLooseName.get(looseKey) : null;
      const sigMatch = sigKey ? importIndex.bySignature.get(sigKey) : null;

      const match = strictMatch || looseMatch || sigMatch;
      if (!match) continue;

      rec.matched = true;
      rec.sku = match.sku;
      rec.brand = match.brand;
      rec.category = match.category;
    }
  }

  const ranked = [...totals.values()]
    .filter(r => r.unitsSold > 0)
    .map(r => ({
      productName: r.productName,
      unitsSold: Number(r.unitsSold.toFixed(2)),
      orderCount: r.orderIds.size,
      matchedToImport: r.matched,
      sku: r.sku,
      brand: r.brand,
      category: r.category
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold);

  const top = ranked.slice(0, topN);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outJson = path.join(OUT_DIR, 'best_sellers_from_orders.json');
  const outCsv = path.join(OUT_DIR, 'best_sellers_from_orders.csv');

  fs.writeFileSync(outJson, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceOrdersCsv: ordersPath,
    sourceImportCsv: importCsvPath || null,
    includeStatuses: [...includeStatuses],
    totalRankedProducts: ranked.length,
    topN,
    top
  }, null, 2));

  const header = ['rank', 'productName', 'unitsSold', 'orderCount', 'matchedToImport', 'sku', 'brand', 'category'];
  const lines = [header.join(',')];
  top.forEach((row, i) => {
    const vals = [
      i + 1,
      row.productName,
      row.unitsSold,
      row.orderCount,
      row.matchedToImport ? 'yes' : 'no',
      row.sku,
      row.brand,
      row.category
    ].map(v => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(','));
  });
  fs.writeFileSync(outCsv, lines.join('\n'));

  const matchedCount = top.filter(r => r.matchedToImport).length;

  console.log('='.repeat(60));
  console.log('BEST SELLERS FROM ORDER EXPORT');
  console.log('='.repeat(60));
  console.log(`Orders source: ${ordersPath}`);
  console.log(`Import join: ${importCsvPath || 'not found (join skipped)'}`);
  console.log(`Ranked products: ${ranked.length}`);
  console.log(`Top exported: ${top.length}`);
  console.log(`Top matched to import: ${matchedCount}/${top.length}`);
  console.log('');
  top.slice(0, Math.min(15, top.length)).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2, ' ')}. ${r.productName} (${r.unitsSold})`);
  });
  console.log('');
  console.log(`Wrote: ${outCsv}`);
  console.log(`Wrote: ${outJson}`);
}

main();
