/**
 * Fix remaining SKUs (missing + placeholder + duplicates)
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const BASE = path.join(__dirname, '..');
const importFile = path.join(BASE, 'outputs', 'woocommerce_import_with_prices.csv');

const CATEGORY_CODES = {
  nutrients: 'NUT',
  grow_media: 'GRO',
  seeds: 'SED',
  propagation: 'PRO',
  irrigation: 'IRR',
  ph_meters: 'PHM',
  environmental_monitors: 'ENV',
  controllers: 'CTL',
  grow_lights: 'LIT',
  hid_bulbs: 'HID',
  airflow: 'AIR',
  odor_control: 'ODR',
  water_filtration: 'WTR',
  containers: 'POT',
  harvesting: 'HAR',
  trimming: 'TRM',
  pest_control: 'PES',
  co2: 'CO2',
  grow_room_materials: 'GRM',
  books: 'BOK',
  electrical_supplies: 'ELC',
  extraction: 'EXT',
};

function normalizeHandle(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 6);
}

function getCategoryCode(categories) {
  const cat = String(categories || '').toLowerCase();
  for (const [key, code] of Object.entries(CATEGORY_CODES)) {
    if (cat.includes(key.replace(/_/g, ' ')) || cat.includes(key)) return code;
  }
  return 'GEN';
}

function isPlaceholderSku(sku) {
  const s = String(sku || '').trim().toUpperCase();
  if (!s) return true;
  if (/^HMH0+$/.test(s)) return true;
  if (/^HMH0+-V\d+$/i.test(s)) return true;
  if (/^HMH00000-V\d+$/i.test(s)) return true;
  return false;
}

console.log('=== FIX REMAINING SKUs ===\n');
console.log(`Input: ${importFile}`);

const csv = fs.readFileSync(importFile, 'utf8');
const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});

console.log(`Loaded ${rows.length} rows`);

const skuFreq = new Map();
for (const row of rows) {
  const sku = String(row.SKU || '').trim();
  if (!sku) continue;
  skuFreq.set(sku.toLowerCase(), (skuFreq.get(sku.toLowerCase()) || 0) + 1);
}

const usedSkus = new Set();
let sequence = 7000;
const parentSlugToSku = new Map();
const variationCounterByBase = new Map();

function ensureUnique(candidate) {
  let c = String(candidate || '').trim();
  while (!c || usedSkus.has(c.toLowerCase())) {
    c = `HMH-GEN-${String(sequence++).padStart(5, '0')}`;
  }
  usedSkus.add(c.toLowerCase());
  return c;
}

function nextVariantSku(baseSku) {
  const base = ensureUniqueBase(baseSku);
  let n = (variationCounterByBase.get(base.toLowerCase()) || 0) + 1;
  let candidate = `${base}-V${String(n).padStart(2, '0')}`;
  while (usedSkus.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${base}-V${String(n).padStart(2, '0')}`;
  }
  variationCounterByBase.set(base.toLowerCase(), n);
  usedSkus.add(candidate.toLowerCase());
  return candidate;
}

function ensureUniqueBase(baseSku) {
  let base = String(baseSku || '').trim();
  if (!base) base = `HMH-GEN-${String(sequence++).padStart(5, '0')}`;
  if (!usedSkus.has(base.toLowerCase())) {
    usedSkus.add(base.toLowerCase());
    return base;
  }
  // Keep existing base as-is if already used by the parent row itself.
  return base;
}

function generateSimpleOrVariableSku(row) {
  const catCode = getCategoryCode(row.Categories);
  const seed = `${row.Name || ''}|${row.Categories || ''}`;
  const hash = hashString(seed || String(Date.now()));
  let candidate = `HMH-${catCode}-${hash}`;
  if (usedSkus.has(candidate.toLowerCase())) {
    candidate = `HMH-${catCode}-${String(sequence++).padStart(5, '0')}`;
  }
  return ensureUnique(candidate);
}

const stats = {
  fixedMissing: 0,
  fixedPlaceholder: 0,
  fixedDuplicates: 0,
  totalFixed: 0,
  samples: []
};

let currentParentSku = '';

for (const row of rows) {
  const type = String(row.Type || '').toLowerCase();
  const oldSku = String(row.SKU || '').trim();
  const isDuplicate = !!oldSku && (skuFreq.get(oldSku.toLowerCase()) || 0) > 1;
  const missing = !oldSku;
  const placeholder = isPlaceholderSku(oldSku);
  const needsFix = missing || placeholder || (isDuplicate && type === 'variation');

  if (type === 'simple' || type === 'variable') {
    let newSku = oldSku;
    if (needsFix) {
      newSku = generateSimpleOrVariableSku(row);
      row.SKU = newSku;
      stats.totalFixed++;
      if (missing) stats.fixedMissing++;
      if (placeholder) stats.fixedPlaceholder++;
      if (isDuplicate) stats.fixedDuplicates++;
    } else {
      if (!usedSkus.has(oldSku.toLowerCase())) usedSkus.add(oldSku.toLowerCase());
    }

    currentParentSku = String(row.SKU || '').trim();
    const slug = normalizeHandle(row.Name);
    if (slug && currentParentSku) parentSlugToSku.set(slug, currentParentSku);
  } else if (type === 'variation') {
    const parentSlug = String(row.Parent || '').trim().toLowerCase();
    const parentSku = parentSlugToSku.get(parentSlug) || currentParentSku;

    if (needsFix) {
      const base = parentSku || `HMH-GEN-${String(sequence++).padStart(5, '0')}`;
      const newSku = nextVariantSku(base);
      row.SKU = newSku;
      stats.totalFixed++;
      if (missing) stats.fixedMissing++;
      if (placeholder) stats.fixedPlaceholder++;
      if (isDuplicate) stats.fixedDuplicates++;
    } else {
      if (!usedSkus.has(oldSku.toLowerCase())) usedSkus.add(oldSku.toLowerCase());
      const base = parentSku || oldSku.replace(/-V\d+$/i, '');
      const m = oldSku.match(/-V(\d+)$/i);
      if (base && m) {
        const n = Number(m[1]);
        const k = base.toLowerCase();
        variationCounterByBase.set(k, Math.max(variationCounterByBase.get(k) || 0, n));
      }
    }
  } else {
    if (oldSku && !usedSkus.has(oldSku.toLowerCase())) usedSkus.add(oldSku.toLowerCase());
  }

  if (needsFix && stats.samples.length < 12) {
    stats.samples.push({
      type,
      parent: row.Parent || '',
      name: String(row.Name || '').slice(0, 45),
      oldSku,
      newSku: row.SKU
    });
  }
}

const out = stringify(rows, { header: true, columns: Object.keys(rows[0] || {}) });
fs.writeFileSync(importFile, out, 'utf8');

console.log(`\nFixed SKUs: ${stats.totalFixed}`);
console.log(`  missing: ${stats.fixedMissing}`);
console.log(`  placeholder: ${stats.fixedPlaceholder}`);
console.log(`  duplicates: ${stats.fixedDuplicates}`);
console.log('\nSample changes:');
for (const s of stats.samples) {
  console.log(`  [${s.type}] ${s.oldSku || '(blank)'} -> ${s.newSku} | ${s.parent || s.name}`);
}

console.log(`\nUpdated: ${importFile}`);
