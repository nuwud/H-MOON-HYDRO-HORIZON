#!/usr/bin/env npx tsx
/**
 * Clean Master Conflicts
 * 
 * PURPOSE:
 * - Remove products from wrong masters based on known rules
 * - Apply deterministic conflict resolution
 * 
 * RUN: npx tsx src/cli/cleanMasterConflicts.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Resolution Rules
// ─────────────────────────────────────────────────────────────────────────────

interface RemovalRule {
  pattern: RegExp;
  removeFrom: string[];
  keepIn: string;
  reason: string;
}

const REMOVAL_RULES: RemovalRule[] = [
  // ONA products are odor control, not nutrients
  {
    pattern: /\bona\b/i,
    removeFrom: ['nutrients', 'containers_pots'],
    keepIn: 'odor_control',
    reason: 'ONA is odor control brand',
  },
  // Root Pouch are containers, not nutrients
  {
    pattern: /\broot\s*pouch\b/i,
    removeFrom: ['nutrients'],
    keepIn: 'containers_pots',
    reason: 'Root Pouch is container brand',
  },
  // Generic buckets are containers
  {
    pattern: /\bstandard\s+\d+(\.\d+)?\s*gallon\s+(black\s+)?bucket\b/i,
    removeFrom: ['nutrients'],
    keepIn: 'containers_pots',
    reason: 'Generic bucket is container',
  },
  // pH Up/Down are nutrients (chemicals), not meters
  {
    pattern: /\bph\s*(up|down)\b/i,
    removeFrom: ['ph_meters'],
    keepIn: 'nutrients',
    reason: 'pH adjusters are nutrients, not meters',
  },
  // Clonex liquid solutions are nutrients, not propagation equipment
  {
    pattern: /\bclonex\s+(solution|mycorrhizae|root\s*maximizer)\b/i,
    removeFrom: ['propagation'],
    keepIn: 'nutrients',
    reason: 'Clonex solutions/additives are nutrients',
  },
  // Ionic Coco nutrients are nutrients, not grow media
  {
    pattern: /\bionic\s+coco\s+(bloom|grow)\b/i,
    removeFrom: ['grow_media'],
    keepIn: 'nutrients',
    reason: 'Ionic Coco Bloom/Grow are nutrient solutions',
  },
  // BCuzz Coco Nutrition are nutrients, not grow media
  {
    pattern: /\bb'?cuzz\s+coco\s+nutrition/i,
    removeFrom: ['grow_media'],
    keepIn: 'nutrients',
    reason: 'BCuzz Coco Nutrition are nutrient solutions',
  },
  // Hose clamps belong in ventilation_accessories, not irrigation
  {
    pattern: /\bhose\s+clamps?\b/i,
    removeFrom: ['irrigation'],
    keepIn: 'ventilation_accessories',
    reason: 'Hose clamps are ventilation accessories',
  },
  // Garbage rows with descriptions as handles should be removed
  {
    pattern: /(this\s+clip\s+fan|contrary\s+to|the\s+fixture\s+is|source\s+turbo)/i,
    removeFrom: ['books', 'controllers_timers', 'ventilation_accessories', 'nutrients', 'grow_lights', 'extraction'],
    keepIn: 'REMOVE',
    reason: 'Garbage row with description as handle',
  },
  // Books about nutrients should stay in books, not nutrients
  {
    pattern: /\bteaming\s+with\s+(nutrients|fungi|microbes)\b/i,
    removeFrom: ['nutrients'],
    keepIn: 'books',
    reason: 'Book titles stay in books category',
  },
  // Cannabis Grower's Handbook is a book
  {
    pattern: /\bcannabis\s+grower'?s?\s+handbook\b/i,
    removeFrom: ['nutrients'],
    keepIn: 'books',
    reason: 'Cannabis Growers Handbook is a book',
  },
  // Spin Pro Manual Trimmer is harvesting equipment, not a book
  {
    pattern: /\bspin\s+pro\s+manual\s+trimmer\b/i,
    removeFrom: ['books'],
    keepIn: 'harvesting',
    reason: 'Spin Pro is harvesting equipment',
  },
  // Aphrodite's Extraction is extraction equipment, not nutrients
  {
    pattern: /\baphrodite'?s?\s+extraction\b/i,
    removeFrom: ['nutrients'],
    keepIn: 'extraction',
    reason: 'Aphrodites Extraction products are extraction equipment',
  },
  // Hydro-Logic Evolution RO is water filtration, not odor control
  {
    pattern: /\bhydro-?logic.*\bro\d+\b/i,
    removeFrom: ['odor_control'],
    keepIn: 'irrigation',
    reason: 'Hydro-Logic RO systems are water filtration',
  },
  // 360 Aeroponic Sprayer is propagation equipment
  {
    pattern: /\b360\s+aeroponic\s+sprayer\b/i,
    removeFrom: ['irrigation'],
    keepIn: 'propagation',
    reason: 'Aeroponic sprayer is propagation equipment',
  },
  // Heat Mat Thermostat is propagation, not controllers
  {
    pattern: /\bheat\s+mat\s+thermostat\b/i,
    removeFrom: ['controllers_timers'],
    keepIn: 'propagation',
    reason: 'Heat mat thermostat is propagation equipment',
  },
  // AC Infinity Controller is environmental_monitors, not controllers
  {
    pattern: /\bac\s+infinity.*controller\s+ai/i,
    removeFrom: ['controllers_timers'],
    keepIn: 'environmental_monitors',
    reason: 'AC Infinity Controller AI is environmental monitor',
  },
  // Nutradip EC/TDS meter is pH meters category
  {
    pattern: /\bnutradip\s+ec\s+tds/i,
    removeFrom: ['environmental_monitors'],
    keepIn: 'ph_meters',
    reason: 'EC/TDS meter belongs with pH meters',
  },
  // Elbow barbed fittings are irrigation, not ventilation
  {
    pattern: /\belbow\s+barbed\b/i,
    removeFrom: ['ventilation_accessories'],
    keepIn: 'irrigation',
    reason: 'Barbed fittings are irrigation',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CSV Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function readCsvWithHeaders(filePath: string): { headers: string[]; rows: string[][] } {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCsvLine(line));
  return { headers, rows };
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function writeCsv(filePath: string, headers: string[], rows: string[][]): void {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map(row => row.map(escapeCsvField).join(','));
  writeFileSync(filePath, [headerLine, ...dataLines].join('\n'), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface RemovalLog {
  file: string;
  sku: string;
  handle: string;
  title: string;
  rule: string;
}

async function main() {
  console.log('🧹 Cleaning Master Conflicts');
  console.log('=============================\n');

  const removals: RemovalLog[] = [];
  
  for (const rule of REMOVAL_RULES) {
    console.log(`📋 Rule: ${rule.reason}`);
    console.log(`   Pattern: ${rule.pattern}`);
    console.log(`   Remove from: ${rule.removeFrom.join(', ')}`);
    console.log(`   Keep in: ${rule.keepIn}\n`);

    for (const masterName of rule.removeFrom) {
      const filePath = resolve(CSV_DIR, `master_${masterName}.csv`);
      if (!existsSync(filePath)) {
        console.log(`   ⚠️  File not found: master_${masterName}.csv`);
        continue;
      }

      const { headers, rows } = readCsvWithHeaders(filePath);
      
      // Find column indices
      const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
      const handleIdx = headers.findIndex(h => h.toLowerCase() === 'handle');
      const titleIdx = headers.findIndex(h => h.toLowerCase() === 'title');
      
      const originalCount = rows.length;
      const filteredRows: string[][] = [];
      
      for (const row of rows) {
        const sku = skuIdx >= 0 ? row[skuIdx] || '' : '';
        const handle = handleIdx >= 0 ? row[handleIdx] || '' : '';
        const title = titleIdx >= 0 ? row[titleIdx] || '' : '';
        
        const searchText = `${sku} ${handle} ${title}`.toLowerCase();
        
        if (rule.pattern.test(searchText)) {
          // This row matches the removal pattern
          removals.push({
            file: `master_${masterName}.csv`,
            sku,
            handle,
            title,
            rule: rule.reason,
          });
        } else {
          filteredRows.push(row);
        }
      }
      
      const removedCount = originalCount - filteredRows.length;
      if (removedCount > 0) {
        writeCsv(filePath, headers, filteredRows);
        console.log(`   ✅ master_${masterName}.csv: removed ${removedCount} rows`);
      } else {
        console.log(`   ⏭️  master_${masterName}.csv: no matches`);
      }
    }
    console.log();
  }

  // Write removal log
  if (removals.length > 0) {
    const logPath = resolve(CSV_DIR, 'conflict_removals.log.csv');
    const logHeaders = ['file', 'sku', 'handle', 'title', 'rule'];
    const logRows = removals.map(r => [r.file, r.sku, r.handle, r.title, r.rule]);
    writeCsv(logPath, logHeaders, logRows);
    console.log(`📝 Removal log: CSVs/conflict_removals.log.csv (${removals.length} entries)`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('📈 SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`Total rows removed: ${removals.length}`);
  
  if (removals.length > 0) {
    console.log('\nRemoved products:');
    for (const r of removals.slice(0, 20)) {
      console.log(`   - ${r.title} (from ${r.file})`);
    }
    if (removals.length > 20) {
      console.log(`   ... and ${removals.length - 20} more`);
    }
  }

  console.log('\n✅ Master cleanup complete!');
  console.log('   Next: Run `npx tsx src/cli/buildCategoryIndexDraft.ts` to rebuild index');
}

main().catch(console.error);
