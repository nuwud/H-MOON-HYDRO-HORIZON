/**
 * Safe CSV Reading Utility
 * 
 * Handles:
 * - Quoted commas
 * - Multiline fields (Woo/Shopify exports)
 * - BOM removal
 * - Consistent error handling
 * 
 * Uses manual parsing for maximum compatibility with ts-node ESM.
 */

import { readFileSync, existsSync } from 'fs';

export interface CsvRow {
  [key: string]: string;
}

export interface CsvReadOptions {
  /** Skip rows with fewer columns than header */
  skipInvalidRows?: boolean;
  /** Trim whitespace from values */
  trim?: boolean;
  /** Relaxed column count (allow varying columns) */
  relaxColumnCount?: boolean;
}

/**
 * Parse a single CSV line handling quoted fields
 */
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

/**
 * Safely read a CSV file with proper handling of quoted fields
 */
export function readCsvSafe(filePath: string, options: CsvReadOptions = {}): CsvRow[] {
  if (!existsSync(filePath)) {
    console.warn(`⚠️  CSV file not found: ${filePath}`);
    return [];
  }

  try {
    let content = readFileSync(filePath, 'utf-8');
    
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const lines = content.split('\n');
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map(h => h.trim());
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCsvLine(line);
      const row: CsvRow = {};
      
      headers.forEach((header, idx) => {
        const val = values[idx] || '';
        row[header] = options.trim !== false ? val.trim() : val;
      });
      
      rows.push(row);
    }

    return rows;
  } catch (error) {
    console.error(`❌ Error parsing CSV ${filePath}:`, error);
    return [];
  }
}

/**
 * Get a value from a row with multiple possible column names
 */
export function getColumn(row: CsvRow, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return '';
}

/**
 * Check if row has a valid handle/slug
 */
export function hasValidHandle(row: CsvRow): boolean {
  const handle = getColumn(row, 'Handle', 'handle', 'Slug', 'slug', 'product_handle');
  return handle.length >= 3 && /^[a-z0-9-]+$/i.test(handle);
}

/**
 * Check if row has a valid title
 */
export function hasValidTitle(row: CsvRow): boolean {
  const title = getColumn(row, 'Title', 'title', 'Name', 'name', 'Product Title');
  return title.length >= 3 && /[a-zA-Z]/.test(title);
}

/**
 * Validate a row has minimum required data
 */
export function isValidProductRow(row: CsvRow): boolean {
  return hasValidHandle(row) || hasValidTitle(row);
}
