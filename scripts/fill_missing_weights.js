#!/usr/bin/env node
/**
 * fill_missing_weights.js
 *
 * Conservative weight enrichment for WooCommerce import CSV.
 *
 * Rules:
 *  1) Fill only missing/non-positive weights.
 *  2) Parse explicit size token from Name (e.g. 500ml, 1 gal, 2 kg).
 *  3) Always accept mass units (lb/lbs/kg).
 *  4) Accept volume units (ml/l/liter/pt/qt/gal/oz) only in liquid-like context.
 *
 * Usage:
 *   node scripts/fill_missing_weights.js            # dry-run
 *   node scripts/fill_missing_weights.js --confirm  # apply changes
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const BASE = path.join(__dirname, '..');
const INPUT = path.join(BASE, 'outputs', 'woocommerce_import_with_prices.csv');
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--confirm');

// Approximate shipping weights in lbs.
const UNIT_TO_LBS = {
  lb: 1,
  lbs: 1,
  kg: 2.20462,
  ml: 0.00220462,
  l: 2.20462,
  liter: 2.20462,
  litre: 2.20462,
  pt: 1.043,
  pint: 1.043,
  qt: 2.086,
  quart: 2.086,
  gal: 8.5,
  gallon: 8.5,
  oz: 0.065,
};

const MASS_UNITS = new Set(['lb', 'lbs', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l', 'liter', 'litre', 'pt', 'pint', 'qt', 'quart', 'gal', 'gallon', 'oz']);

const LIQUID_HINTS = /(nutrient|supplement|solution|liquid|bloom|micro|ph\b|cal[- ]?mag|silica|enzyme|additive|tea|spray|concentrate|rtu|clonex|floranova|floragro|floramicro|florabloom|pro[- ]?tekt|big\s*bud|azaguard|dead\s*bug|clean\s*leaf|sns|dyna[- ]?gro|fox\s*farm)/i;
const LIQUID_CATEGORIES = /(nutrients?|supplements?|pest_control|pest control|ph\/?ec|ph meters|water treatment|solutions?)/i;
const NON_LIQUID_CATEGORIES = /(accessories|environment|airflow|fan|electrical|grow\s*lights|meters?|timers?|books?|containers?|pots?)/i;
const VOLUME_BLOCKLIST = /(\bl\s*\/\s*min\b|\bgph\b|\bcfm\b|\brpm\b|\bwatt\b|\bw\b|\bbowl\b|\bpump\b|\bfan\b|\bblower\b|\bfilter\b|\bclamp\b|\bscale\b|\bcontainer\b|\bbucket\b|\bpot\b)/i;

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function isMissingWeight(row) {
  const w = clean(row['Weight (lbs)']);
  if (!w) return true;
  const n = Number(w);
  return !Number.isFinite(n) || n <= 0;
}

function extractSizeToken(name) {
  const n = clean(name);
  if (!n) return null;

  const m = n.match(/(\d+(?:\.\d+)?)\s*(gal(?:lon)?|l(?:iter|itre)?|qt|quart|pt|pint|oz|ml|lb|lbs|kg)\b/i);
  if (!m) return null;

  return {
    value: Number(m[1]),
    unit: String(m[2]).toLowerCase(),
    token: m[0],
  };
}

function hasLiquidContext(row) {
  const text = [row.Name, row.Categories, row.Tags, row['Short description'], row.Description]
    .map(clean)
    .join(' ');

  const name = clean(row.Name);
  const category = clean(row.Categories);
  if (VOLUME_BLOCKLIST.test(name)) return false;

  const hasStrongHint = LIQUID_HINTS.test(text);
  const hasLiquidCategory = LIQUID_CATEGORIES.test(category);

  if (!hasStrongHint && !hasLiquidCategory) return false;
  if (NON_LIQUID_CATEGORIES.test(category)) return false;

  return true;
}

function estimateWeightLbs(row) {
  const parsed = extractSizeToken(row.Name || '');
  if (!parsed) return null;
  if (!Number.isFinite(parsed.value) || parsed.value <= 0) return null;

  let unit = parsed.unit;
  if (unit === 'liter' || unit === 'litre') unit = 'l';
  if (unit === 'gallon') unit = 'gal';
  if (unit === 'quart') unit = 'qt';
  if (unit === 'pint') unit = 'pt';

  if (!(unit in UNIT_TO_LBS)) return null;

  if (VOLUME_UNITS.has(unit) && !hasLiquidContext(row)) {
    return null;
  }

  const estimate = parsed.value * UNIT_TO_LBS[unit];
  if (!Number.isFinite(estimate) || estimate <= 0) return null;

  // Guardrails: avoid absurd automated values.
  if (estimate > 150) return null;

  return {
    lbs: Math.round(estimate * 100) / 100,
    unit,
    token: parsed.token,
    confidence: MASS_UNITS.has(unit) ? 'high' : 'medium',
  };
}

function main() {
  console.log('=== FILL MISSING WEIGHTS (CONSERVATIVE) ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLYING CHANGES'}`);
  console.log(`Input: ${INPUT}`);

  if (!fs.existsSync(INPUT)) {
    console.error(`ERROR: Missing input file: ${INPUT}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const stats = {
    totalRows: rows.length,
    targets: 0,
    filled: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    skippedNoToken: 0,
    skippedLowConfidence: 0,
    unitCounts: {},
    samples: [],
  };

  for (const row of rows) {
    const type = clean(row.Type).toLowerCase();
    if (type !== 'simple' && type !== 'variation') continue;

    if (!isMissingWeight(row)) continue;
    stats.targets++;

    const parsed = extractSizeToken(row.Name || '');
    if (!parsed) {
      stats.skippedNoToken++;
      continue;
    }

    const est = estimateWeightLbs(row);
    if (!est) {
      stats.skippedLowConfidence++;
      continue;
    }

    stats.filled++;
    if (est.confidence === 'high') stats.highConfidence++;
    else stats.mediumConfidence++;

    stats.unitCounts[est.unit] = (stats.unitCounts[est.unit] || 0) + 1;

    if (stats.samples.length < 20) {
      stats.samples.push({
        sku: clean(row.SKU),
        name: clean(row.Name).slice(0, 70),
        token: est.token,
        lbs: est.lbs,
        confidence: est.confidence,
      });
    }

    if (!dryRun) {
      row['Weight (lbs)'] = String(est.lbs);
    }
  }

  if (!dryRun) {
    const out = stringify(rows, { header: true, columns: Object.keys(rows[0] || {}) });
    fs.writeFileSync(INPUT, out, 'utf8');
  }

  console.log(`Rows: ${stats.totalRows}`);
  console.log(`Missing-weight targets (simple+variation): ${stats.targets}`);
  console.log(`Filled: ${stats.filled}`);
  console.log(`  High confidence:   ${stats.highConfidence}`);
  console.log(`  Medium confidence: ${stats.mediumConfidence}`);
  console.log(`Skipped (no size token): ${stats.skippedNoToken}`);
  console.log(`Skipped (low confidence): ${stats.skippedLowConfidence}`);
  console.log(`Unit fills: ${JSON.stringify(stats.unitCounts)}`);

  console.log('\nSamples:');
  for (const s of stats.samples) {
    console.log(`  [${s.confidence}] ${s.lbs} lbs (${s.token}) <- ${s.name} ${s.sku ? `[${s.sku}]` : ''}`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - No files modified');
    console.log('Run with --confirm to apply');
  } else {
    console.log(`\nUpdated: ${INPUT}`);
  }
}

main();
