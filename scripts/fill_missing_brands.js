#!/usr/bin/env node
/**
 * fill_missing_brands.js
 *
 * Conservative brand enrichment for WooCommerce import CSV.
 * Priority:
 *  1) Tags brand:... extraction
 *  2) Title pattern inference
 *
 * Targets only simple/variable rows with empty Brands.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const BASE = path.join(__dirname, '..');
const INPUT = path.join(BASE, 'outputs', 'woocommerce_import_with_prices.csv');

const BRAND_ALIASES = {
  'gh': 'General Hydroponics',
  'gen hydro': 'General Hydroponics',
  'general hydro': 'General Hydroponics',
  'adv nutrients': 'Advanced Nutrients',
  'an': 'Advanced Nutrients',
  'fox farm': 'FoxFarm',
  'ff': 'FoxFarm',
  'h&g': 'House & Garden',
  'house and garden': 'House & Garden',
  'bcuzz': 'Atami',
  'b\'cuzz': 'Atami',
  'holland secret': 'Holland Secret',
  'max-fan': 'Max-Fan',
  'can-fan': 'Can-Fan',
  'can-filter': 'Can-Filter',
  'hydro-logic': 'Hydro-Logic',
  'floraflex': 'FloraFlex',
  'ecoplus': 'EcoPlus',
  'plantmax': 'Plantmax',
  'trimpro': 'Trimpro',
  'timemist': 'TimeMist',
  'jetfan': 'Jetfan',
  'ac infinity': 'AC Infinity',
  'ionic': 'Ionic',
  'calnesium': 'Calnesium',
  'calcarb': 'CalCarb',
  'stealth ro': 'Hydro-Logic',
  'cool tube': 'Cool Tube',
  'solarmax': 'SolarMax',
  'badboy': 'Badboy',
  'hydrodynamics': 'Hydrodynamics',
  'bio bizz': 'BioBizz',
};

const BRAND_PATTERNS = [
  { re: /\bgeneral hydroponics\b|\bfloranova\b|\bflora(gro|micro|bloom|kleen|duo)\b|\bcalimagic\b|\bmaxi(gro|bloom)\b/i, brand: 'General Hydroponics' },
  { re: /\badvanced nutrients\b|\bbig bud\b|\bbud ignitor\b|\bbud candy\b|\bb-52\b|\brhino skin\b|\bvoodoo juice\b|\bpiranha\b|\btarantula\b/i, brand: 'Advanced Nutrients' },
  { re: /\bfox ?farm\b|\btiger bloom\b|\bbig bloom\b|\bgrow big\b|\bocean forest\b|\bhappy frog\b|\bcha ching\b|\bbeastie bloomz\b/i, brand: 'FoxFarm' },
  { re: /\bb'?cuzz\b|\batami\b/i, brand: 'Atami' },
  { re: /\bholland secret\b/i, brand: 'Holland Secret' },
  { re: /\btrimpro\b/i, brand: 'Trimpro' },
  { re: /\bfloraflex\b/i, brand: 'FloraFlex' },
  { re: /\bhydro-?logic\b|\bstealth ro\b|\bsmall boy\b|\btall boy\b/i, brand: 'Hydro-Logic' },
  { re: /\bac infinity\b|\bcloudline\b/i, brand: 'AC Infinity' },
  { re: /\bplantmax\b|\bsolarmax\b|\bbadboy\b/i, brand: 'Plantmax' },
  { re: /\becoplus\b/i, brand: 'EcoPlus' },
  { re: /\bcan-?fan\b/i, brand: 'Can-Fan' },
  { re: /\bcan-?filter\b/i, brand: 'Can-Filter' },
  { re: /\bmax-?fan\b/i, brand: 'Max-Fan' },
  { re: /\btimemist\b/i, brand: 'TimeMist' },
  { re: /\bjetfan\b/i, brand: 'Jetfan' },
  { re: /\bionic\b/i, brand: 'Ionic' },
  { re: /\bcalnesium\b/i, brand: 'Calnesium' },
  { re: /\bcalcarb\b/i, brand: 'CalCarb' },
  { re: /\bhydrodynamics\b|\bclonex\b/i, brand: 'Hydrodynamics' },
  { re: /\brock nutrients\b|\brock resinator\b/i, brand: 'Rock Nutrients' },
  { re: /\bathena\b/i, brand: 'Athena' },
  { re: /\bcanna\b/i, brand: 'CANNA' },
  { re: /\bbotanicare\b/i, brand: 'Botanicare' },
];

const BLOCKLIST = new Set([
  '',
  'unknown',
  'default',
  'other',
  'n/a',
  'na',
  'h moon hydro',
  'hmoonhydro',
  'h-moon hydro',
]);

function cleanBrand(raw) {
  let b = String(raw || '').trim();
  if (!b) return '';
  b = b.replace(/^brand\s*:\s*/i, '').trim();
  b = b.replace(/\s+/g, ' ');

  const lower = b.toLowerCase();
  if (BLOCKLIST.has(lower)) return '';
  if (BRAND_ALIASES[lower]) return BRAND_ALIASES[lower];

  // Title-case fallback while preserving known uppercase acronyms
  if (/^[A-Z0-9\- ]+$/.test(b)) return b;
  return b
    .split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
    .join(' ');
}

function brandFromTags(tags) {
  const t = String(tags || '');
  const m = t.match(/(?:^|[;,|\s])brand:([^,;|]+)/i);
  if (!m) return '';
  return cleanBrand(m[1]);
}

function brandFromTitle(name) {
  const n = String(name || '');
  for (const rule of BRAND_PATTERNS) {
    if (rule.re.test(n)) return rule.brand;
  }
  return '';
}

function normalizeLooseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(oz|ml|l|lt|gal|gallon|lb|lbs|kg|qt|pt|pack|pk|ct|count|liter|liters|inch|in|cm|mm)\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\b/g, ' ')
    .replace(/\b(the|and|for|with|by|of|new|original)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSignature(name) {
  const tokens = normalizeLooseName(name)
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean);

  if (!tokens.length) return '';
  return [...new Set(tokens)].sort().join(' ');
}

function buildSignatureBrandVotes(rows) {
  const votes = new Map();

  for (const row of rows) {
    const brand = cleanBrand(row.Brands || '');
    if (!brand) continue;

    const sig = nameSignature(row.Name || '');
    if (!sig) continue;

    if (!votes.has(sig)) votes.set(sig, new Map());
    const bucket = votes.get(sig);
    bucket.set(brand, (bucket.get(brand) || 0) + 1);
  }

  return votes;
}

function brandFromSignature(name, signatureVotes) {
  const sig = nameSignature(name);
  if (!sig || !signatureVotes.has(sig)) return '';

  const ranked = [...signatureVotes.get(sig).entries()]
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return '';

  const [topBrand, topCount] = ranked[0];
  const secondCount = ranked[1]?.[1] || 0;

  // Conservative confidence: repeated evidence and clear winner.
  if (topCount < 2) return '';
  if (secondCount > 0 && topCount < secondCount * 2) return '';

  return topBrand;
}

function main() {
  console.log('=== FILL MISSING BRANDS ===\n');
  console.log(`Input: ${INPUT}`);

  if (!fs.existsSync(INPUT)) {
    console.error(`ERROR: Missing file ${INPUT}`);
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
    targetedMissing: 0,
    filledFromTags: 0,
    filledFromTitle: 0,
    filledFromSignature: 0,
    stillMissing: 0,
    samples: []
  };

  const signatureVotes = buildSignatureBrandVotes(rows);

  for (const row of rows) {
    const type = String(row.Type || '').toLowerCase();
    if (type !== 'simple' && type !== 'variable') continue;

    const existing = String(row.Brands || '').trim();
    if (existing) continue;

    stats.targetedMissing++;

    let brand = brandFromTags(row.Tags || '');
    let source = '';

    if (brand) {
      source = 'tags';
      stats.filledFromTags++;
    } else {
      brand = brandFromTitle(row.Name || '');
      if (brand) {
        source = 'title';
        stats.filledFromTitle++;
      } else {
        brand = brandFromSignature(row.Name || '', signatureVotes);
        if (brand) {
          source = 'signature';
          stats.filledFromSignature++;
        }
      }
    }

    if (brand) {
      row.Brands = brand;
      if (stats.samples.length < 15) {
        stats.samples.push({
          type,
          name: String(row.Name || '').slice(0, 48),
          brand,
          source
        });
      }
    } else {
      stats.stillMissing++;
    }
  }

  const out = stringify(rows, { header: true, columns: Object.keys(rows[0] || {}) });
  fs.writeFileSync(INPUT, out, 'utf8');

  console.log(`Rows: ${stats.totalRows}`);
  console.log(`Missing brand targets (simple+variable): ${stats.targetedMissing}`);
  console.log(`Filled from tags:  ${stats.filledFromTags}`);
  console.log(`Filled from title: ${stats.filledFromTitle}`);
  console.log(`Filled from signature: ${stats.filledFromSignature}`);
  console.log(`Still missing:     ${stats.stillMissing}`);
  console.log('\nSamples:');
  for (const s of stats.samples) {
    console.log(`  [${s.source}] ${s.brand} <- ${s.name}`);
  }
  console.log(`\nUpdated: ${INPUT}`);
}

main();
