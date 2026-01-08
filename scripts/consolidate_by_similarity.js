#!/usr/bin/env node
/**
 * consolidate_by_similarity.js
 * 
 * Groups products into variants based on base name similarity
 * Handles title variations like:
 *   "Big Bud Bloom Booster (1 gal)" and "Big Bud Bloom Booster (1 )"
 *   "Big Bud Bloom Booster (130g powder)" and "Big Bud Bloom Booster ( powder)"
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const CURRENT_CSV = path.join(BASE, 'outputs/shopify_final_fixed.csv');
const OUTPUT_CSV = path.join(BASE, 'outputs/shopify_properly_grouped.csv');

// CSV parser
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++; }
        else { inQuotes = false; }
      } else { currentField += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') { currentField += char; }
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  // Always quote if contains comma, quote, newline, or carriage return
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes and wrap in quotes
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Extract base product name by removing size/variant info
function getBaseName(title) {
  return title
    // Remove content in parentheses
    .replace(/\s*\([^)]*\)\s*/g, '')
    // Remove size numbers with units (both spaced and adjacent)
    .replace(/\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|in|ft|foot|qt|quart|gal|gallon|L|lt|liter|ml|oz|lb|lbs|pound|g|gram|kg|kilogram|W|watt|cfm|gph|pack|count|pc)s?\b/gi, '')
    // Remove standalone numbers at word boundaries
    .replace(/\b\d+(?:\.\d+)?\b/g, '')
    // Remove size patterns like "T-5 4 ft - 16" → "T-5 ft -"
    .replace(/\s+[-/]\s*$/g, '')
    // Clean up extra spaces and dashes
    .replace(/\s+/g, ' ')
    .replace(/\s*[-/]\s*$/, '')
    .trim();
}

// Extract size/variant info from title
function extractSize(title) {
  // Look for content in parentheses first
  const parenMatch = title.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const content = parenMatch[1].trim();
    // Clean up incomplete info like "1 " or " powder"
    if (content.match(/^\d+\s*$/)) {
      // Just a number, look for unit after parentheses or guess
      const afterParen = title.substring(title.indexOf(')') + 1).trim();
      const unitMatch = afterParen.match(/^(qt|quart|gal|gallon|lb|lbs|oz)/i);
      if (unitMatch) return content + ' ' + unitMatch[1];
      return content; // Return as-is
    }
    return content;
  }
  
  // Look for size patterns anywhere in the title (not just at end)
  // Pattern: number + unit (like "100 CFM", "12 in.", "1140 cfm")
  const sizeMatch = title.match(/\b([\d.]+)\s*(mm|cm|m|inch|in|ft|foot|qt|quart|gal|gallon|L|lt|liter|ml|oz|lb|lbs|g|gram|kg|W|watt|cfm|gph|GPH|CFM|pack|count|pc)s?\b/i);
  if (sizeMatch) return sizeMatch[0].trim();
  
  // Look for standalone numbers that might be model numbers or sizes
  const numberMatch = title.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberMatch) return numberMatch[1];
  
  return 'Default';
}

// Generate handle from base name
function generateHandle(baseName) {
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 255);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     CONSOLIDATE VARIANTS BY SIMILARITY');
  console.log('═══════════════════════════════════════════════════════════════\\n');

  // Read enriched CSV
  console.log('📄 Reading enriched CSV...');
  const content = fs.readFileSync(CURRENT_CSV, 'utf-8');
  const rows = parseCSV(content);
  const header = rows[0];
  
  const idx = {};
  header.forEach((h, i) => {
    idx[h] = i;
  });
  
  console.log(`   ${rows.length - 1} rows\\n`);

  // Group products by base name
  console.log('🔍 Grouping by base name...');
  const groups = new Map(); // base name -> array of row indices
  
  for (let i = 1; i < rows.length; i++) {
    const title = rows[i][idx['Title']] || '';
    const baseName = getBaseName(title);
    
    if (!groups.has(baseName)) {
      groups.set(baseName, []);
    }
    groups.get(baseName).push(i);
  }
  
  const multiVariant = Array.from(groups.entries()).filter(([_, rows]) => rows.length >= 2);
  console.log(`   Found ${groups.size} unique base names`);
  console.log(`   ${multiVariant.length} products with multiple variants\\n`);

  // Build consolidated output
  console.log('🔄 Building consolidated CSV...');
  const outputRows = [];  // Don't include header yet
  const processedRows = new Set();
  let stats = { grouped: 0, totalVariants: 0, single: 0 };

  // Process multi-variant products
  for (const [baseName, variantRows] of multiVariant) {
    // Sort by title
    variantRows.sort((a, b) => {
      const titleA = rows[a][idx['Title']] || '';
      const titleB = rows[b][idx['Title']] || '';
      return titleA.localeCompare(titleB);
    });

    const handle = generateHandle(baseName);


    // First variant
    const firstRow = [...rows[variantRows[0]]];
    firstRow[idx['Handle']] = handle;
    firstRow[idx['Title']] = baseName; // Use clean base name
    firstRow[idx['Option1 Name']] = 'Size';
    firstRow[idx['Option1 Value']] = extractSize(rows[variantRows[0]][idx['Title']]);
    outputRows.push(firstRow);
    processedRows.add(variantRows[0]);

    // Additional variants
    for (let i = 1; i < variantRows.length; i++) {
      const varRow = [...rows[variantRows[i]]];
      varRow[idx['Handle']] = '';
      varRow[idx['Title']] = '';
      varRow[idx['Body (HTML)']] = '';
      varRow[idx['Vendor']] = '';
      varRow[idx['Product Category']] = '';
      varRow[idx['Type']] = '';
      varRow[idx['Tags']] = '';
      varRow[idx['Option1 Name']] = '';
      varRow[idx['Option1 Value']] = extractSize(rows[variantRows[i]][idx['Title']]);
      outputRows.push(varRow);
      processedRows.add(variantRows[i]);
    }

    stats.grouped++;
    stats.totalVariants += variantRows.length;
  }

  // Add single-variant products

  for (let i = 1; i < rows.length; i++) {
    if (!processedRows.has(i)) {
      outputRows.push(rows[i]);
      stats.single++;
    }
  }

  console.log(`   Grouped products: ${stats.grouped} (${stats.totalVariants} variants)`);
  console.log(`   Single products: ${stats.single}\\n`);

  // Write output
  console.log('💾 Writing output...');
  // Include header row!
  const allRows = [rows[0], ...outputRows];
  const output = allRows.map(row => row.map(escapeCSV).join(',')).join('\n');
  fs.writeFileSync(OUTPUT_CSV, output);
  console.log(`   Saved to: ${OUTPUT_CSV}\\n`);

  // Show sample groupings
  console.log('📋 Sample grouped products:\\n');
  const samples = multiVariant.slice(0, 10);
  for (const [baseName, variantRows] of samples) {
    console.log(`   ${baseName} (${variantRows.length} variants)`);
    variantRows.slice(0, 3).forEach(rowIdx => {
      const size = extractSize(rows[rowIdx][idx['Title']]);
      console.log(`     - ${size}`);
    });
    if (variantRows.length > 3) console.log(`     ... and ${variantRows.length - 3} more`);
  }

  console.log('\\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Input rows: ${rows.length - 1}`);
  console.log(`   Output rows: ${outputRows.length - 1}`);
  console.log(`   Unique products: ${stats.grouped + stats.single}`);
  console.log(`   Multi-variant products: ${stats.grouped}`);
  console.log(`   Total variants: ${stats.totalVariants}`);
  console.log(`   Single-variant products: ${stats.single}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
