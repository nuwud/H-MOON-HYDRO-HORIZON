#!/usr/bin/env npx tsx
/**
 * Create test wave using csv-parse with relaxed options
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FINAL_CSV = path.join(__dirname, '../../../outputs/FINAL_IMPORT.csv');
const WAVE_CSV = path.join(__dirname, '../../../outputs/waves/wave_test.csv');

console.log('Creating test wave from FINAL_IMPORT.csv...');

const content = fs.readFileSync(FINAL_CSV, 'utf8');

// Parse with relaxed options
const rows = parse(content, { 
  columns: true, 
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
  skip_records_with_error: true
}) as Record<string, string>[];

console.log('Parsed rows:', rows.length);

// Find simple products to test
const testHandles = ['backdraft-damper', 'floragro-1'];
const testRows = rows.filter(r => testHandles.includes(r.Handle));

console.log('Test rows selected:', testRows.length);

// Get header
const header = Object.keys(rows[0]);

// Write test wave
const output: string[] = [header.join(',')];

testRows.forEach(row => {
  const values = header.map(col => {
    let val = row[col] || '';
    if (typeof val === 'string' && (val.includes(',') || val.includes('\n') || val.includes('"'))) {
      val = '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  });
  output.push(values.join(','));
});

// Create directory if needed
fs.mkdirSync(path.dirname(WAVE_CSV), { recursive: true });
fs.writeFileSync(WAVE_CSV, output.join('\n'));

console.log('✅ Saved to:', WAVE_CSV);
console.log('Rows:', output.length - 1);
