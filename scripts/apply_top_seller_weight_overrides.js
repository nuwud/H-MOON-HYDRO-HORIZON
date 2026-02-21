#!/usr/bin/env node
/**
 * apply_top_seller_weight_overrides.js
 *
 * Applies high-confidence manual weight overrides for top-seller rows
 * that still have missing weights.
 *
 * Dry-run by default.
 *
 * Usage:
 *   node scripts/apply_top_seller_weight_overrides.js
 *   node scripts/apply_top_seller_weight_overrides.js --confirm
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const BASE = path.join(__dirname, '..');
const INPUT = path.join(BASE, 'outputs', 'woocommerce_import_with_prices.csv');
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--confirm');

// High-confidence overrides only.
// hmh01759 (bucket lid) intentionally excluded due insufficient direct evidence.
const OVERRIDES = {
  // Evidence: similar in catalog "4.76 Bucket - No Handle" has 1.0 lbs
  hmh01758: { lbs: 1.0, reason: 'Family match: 4.76 Bucket - No Handle = 1.0 lbs' },

  // Evidence: explicit size in name "5.5" + Woo family naming includes "5.5 oz"
  hmh00547: { lbs: 0.36, reason: 'Size-derived from Doktor Doom Total Fogger 5.5 oz' },

  // Evidence: sibling product with same family + wattage has existing 1.0 lbs
  hmh01730: { lbs: 1.0, reason: 'Sibling match: BadBoy HO T-5 Bloom 54W has 1.0 lbs' },
};

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function isMissingWeight(row) {
  const v = clean(row['Weight (lbs)']);
  if (!v) return true;
  const n = Number(v);
  return !Number.isFinite(n) || n <= 0;
}

function main() {
  console.log('=== APPLY TOP-SELLER WEIGHT OVERRIDES ===\n');
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

  let considered = 0;
  let applied = 0;
  const skipped = [];
  const updated = [];

  for (const row of rows) {
    const sku = clean(row.SKU).toLowerCase();
    if (!sku || !OVERRIDES[sku]) continue;

    considered++;

    if (!isMissingWeight(row)) {
      skipped.push({ sku, name: clean(row.Name), reason: 'already has weight' });
      continue;
    }

    const override = OVERRIDES[sku];
    if (!dryRun) row['Weight (lbs)'] = String(override.lbs);
    applied++;

    updated.push({
      sku,
      name: clean(row.Name),
      lbs: override.lbs,
      reason: override.reason,
    });
  }

  if (!dryRun) {
    const out = stringify(rows, { header: true, columns: Object.keys(rows[0] || {}) });
    fs.writeFileSync(INPUT, out, 'utf8');
  }

  console.log(`Override candidates found in CSV: ${considered}`);
  console.log(`Applied: ${applied}`);
  console.log(`Skipped: ${skipped.length}`);

  console.log('\nUpdated rows:');
  for (const u of updated) {
    console.log(`  ${u.sku} -> ${u.lbs} lbs | ${u.name}`);
    console.log(`    reason: ${u.reason}`);
  }

  if (skipped.length) {
    console.log('\nSkipped rows:');
    for (const s of skipped) {
      console.log(`  ${s.sku} | ${s.name} | ${s.reason}`);
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN - No files modified');
    console.log('Run with --confirm to apply');
  } else {
    console.log(`\nUpdated: ${INPUT}`);
  }
}

main();
