/**
 * Recover Missing Prices
 * 
 * Pulls prices from WooCommerce export and POS inventory to fill gaps
 * in the import data.
 * 
 * Priority:
 * 1. WooCommerce export (most recent retail prices)
 * 2. POS inventory (fallback)
 * 3. Parent product price (for variations)
 */

const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';

// File paths
const WOO_EXPORT = path.join(BASE, 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv');
const POS_INVENTORY = path.join(BASE, 'CSVs/HMoonHydro_Inventory.csv');
const IMPORT_FILE = path.join(BASE, 'outputs/woocommerce_import_ready.csv');
const OUTPUT_FILE = path.join(BASE, 'outputs/woocommerce_import_with_prices.csv');

function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            current += char;
        } else if (char === '\n' && !inQuotes) {
            if (current.trim()) lines.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) lines.push(current);
    
    return lines.map(line => {
        const fields = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                inQ = !inQ;
            } else if (c === ',' && !inQ) {
                fields.push(field.trim());
                field = '';
            } else {
                field += c;
            }
        }
        fields.push(field.trim());
        return fields;
    });
}

function normalizePrice(price) {
    if (!price) return null;
    const cleaned = String(price).replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) || num === 0 ? null : num.toFixed(2);
}

function normalizeSKU(sku) {
    if (!sku) return '';
    return String(sku).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

console.log('=== PRICE RECOVERY SCRIPT ===\n');

// Step 1: Build price lookup from WooCommerce export
console.log('Loading WooCommerce export...');
const wooData = parseCSV(fs.readFileSync(WOO_EXPORT, 'utf-8'));
const wooHeader = wooData[0];
const wooRows = wooData.slice(1);

// Find column indices
const wooSkuIdx = wooHeader.findIndex(h => h.toLowerCase() === 'sku');
const wooRegPriceIdx = wooHeader.findIndex(h => h.toLowerCase() === 'regular price');
const wooPriceIdx = wooHeader.findIndex(h => h.toLowerCase() === 'price');
const wooNameIdx = wooHeader.findIndex(h => h.toLowerCase() === 'product name');

console.log(`  Found ${wooRows.length} WooCommerce products`);
console.log(`  SKU col: ${wooSkuIdx}, Regular Price col: ${wooRegPriceIdx}, Price col: ${wooPriceIdx}`);

// Build SKU -> price map
const wooPrices = new Map();
const wooNamePrices = new Map();
let wooPriceCount = 0;

for (const row of wooRows) {
    const sku = normalizeSKU(row[wooSkuIdx]);
    const regPrice = normalizePrice(row[wooRegPriceIdx]);
    const price = normalizePrice(row[wooPriceIdx]);
    const bestPrice = regPrice || price;
    const name = row[wooNameIdx]?.toLowerCase().trim() || '';
    
    if (sku && bestPrice) {
        wooPrices.set(sku, bestPrice);
        wooPriceCount++;
    }
    if (name && bestPrice) {
        wooNamePrices.set(name, bestPrice);
    }
}
console.log(`  Built price lookup: ${wooPriceCount} SKUs with prices`);

// Step 2: Build price lookup from POS inventory
console.log('\nLoading POS inventory...');
const posData = parseCSV(fs.readFileSync(POS_INVENTORY, 'utf-8'));
const posHeader = posData[0];
const posRows = posData.slice(1);

const posSkuIdx = posHeader.findIndex(h => h.toLowerCase().includes('item number'));
const posPriceIdx = posHeader.findIndex(h => h.toLowerCase() === 'regular price');
const posNameIdx = posHeader.findIndex(h => h.toLowerCase().includes('item name'));

console.log(`  Found ${posRows.length} POS items`);
console.log(`  Item Number col: ${posSkuIdx}, Regular Price col: ${posPriceIdx}`);

const posPrices = new Map();
const posNamePrices = new Map();
let posPriceCount = 0;

for (const row of posRows) {
    const sku = normalizeSKU(row[posSkuIdx]);
    const price = normalizePrice(row[posPriceIdx]);
    const name = row[posNameIdx]?.toLowerCase().trim() || '';
    
    if (sku && price) {
        posPrices.set(sku, price);
        posPriceCount++;
    }
    if (name && price) {
        posNamePrices.set(name, price);
    }
}
console.log(`  Built price lookup: ${posPriceCount} SKUs with prices`);

// Step 3: Load import file and fix prices
console.log('\nLoading import file...');
const importData = parseCSV(fs.readFileSync(IMPORT_FILE, 'utf-8'));
const importHeader = importData[0];
const importRows = importData.slice(1);

const impSkuIdx = importHeader.indexOf('SKU');
const impPriceIdx = importHeader.indexOf('Regular price');
const impTypeIdx = importHeader.indexOf('Type');
const impNameIdx = importHeader.indexOf('Name');
const impParentIdx = importHeader.indexOf('Parent');

console.log(`  Found ${importRows.length} import rows`);
console.log(`  SKU col: ${impSkuIdx}, Price col: ${impPriceIdx}, Type col: ${impTypeIdx}`);

// Step 4: Build parent -> price lookup for variations
const parentPrices = new Map();
for (const row of importRows) {
    const type = row[impTypeIdx];
    const sku = normalizeSKU(row[impSkuIdx]);
    const parent = row[impParentIdx]?.toLowerCase().trim();
    const price = normalizePrice(row[impPriceIdx]);
    
    // If this is a simple or variable product with a price, store it
    if ((type === 'simple' || type === 'variable') && price) {
        if (sku) parentPrices.set(sku, price);
        if (row[impNameIdx]) {
            const normalizedName = row[impNameIdx].toLowerCase().trim();
            parentPrices.set(normalizedName, price);
        }
    }
}
console.log(`  Built parent price lookup: ${parentPrices.size} entries`);

// Step 5: Fix missing prices
const stats = {
    total: 0,
    hadPrice: 0,
    fixedFromWoo: 0,
    fixedFromPos: 0,
    fixedFromParent: 0,
    fixedFromNameMatch: 0,
    stillMissing: 0,
    missingProducts: []
};

const fixedRows = importRows.map(row => {
    const newRow = [...row];
    const type = row[impTypeIdx];
    const sku = normalizeSKU(row[impSkuIdx]);
    const currentPrice = normalizePrice(row[impPriceIdx]);
    const name = row[impNameIdx]?.toLowerCase().trim() || '';
    const parent = row[impParentIdx]?.toLowerCase().trim() || '';
    
    // Only fix simple products and variations (variable products don't need prices)
    if (type === 'variable') {
        return newRow;
    }
    
    stats.total++;
    
    if (currentPrice) {
        stats.hadPrice++;
        return newRow;
    }
    
    // Try to find price from various sources
    let foundPrice = null;
    let source = '';
    
    // 1. WooCommerce by SKU
    if (sku && wooPrices.has(sku)) {
        foundPrice = wooPrices.get(sku);
        source = 'woo_sku';
    }
    
    // 2. POS by SKU
    if (!foundPrice && sku && posPrices.has(sku)) {
        foundPrice = posPrices.get(sku);
        source = 'pos_sku';
    }
    
    // 3. WooCommerce by name
    if (!foundPrice && name && wooNamePrices.has(name)) {
        foundPrice = wooNamePrices.get(name);
        source = 'woo_name';
    }
    
    // 4. POS by name
    if (!foundPrice && name && posNamePrices.has(name)) {
        foundPrice = posNamePrices.get(name);
        source = 'pos_name';
    }
    
    // 5. Parent product price (for variations)
    if (!foundPrice && type === 'variation' && parent) {
        if (parentPrices.has(parent)) {
            foundPrice = parentPrices.get(parent);
            source = 'parent';
        }
    }
    
    // 6. Fuzzy name match for variations
    if (!foundPrice && type === 'variation' && name) {
        // Try to find by base product name (remove size/variant info)
        const baseName = name.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim();
        if (wooNamePrices.has(baseName)) {
            foundPrice = wooNamePrices.get(baseName);
            source = 'woo_fuzzy';
        } else if (posNamePrices.has(baseName)) {
            foundPrice = posNamePrices.get(baseName);
            source = 'pos_fuzzy';
        }
    }
    
    if (foundPrice) {
        newRow[impPriceIdx] = foundPrice;
        if (source.startsWith('woo')) stats.fixedFromWoo++;
        else if (source.startsWith('pos')) stats.fixedFromPos++;
        else if (source === 'parent') stats.fixedFromParent++;
        else stats.fixedFromNameMatch++;
    } else {
        stats.stillMissing++;
        stats.missingProducts.push({
            type,
            sku: row[impSkuIdx] || '',
            name: row[impNameIdx] || '',
            parent: row[impParentIdx] || ''
        });
    }
    
    return newRow;
});

// Step 6: Output results
console.log('\n=== PRICE RECOVERY RESULTS ===\n');
console.log(`Products needing prices: ${stats.total}`);
console.log(`  Already had price: ${stats.hadPrice}`);
console.log(`  Fixed from WooCommerce: ${stats.fixedFromWoo}`);
console.log(`  Fixed from POS: ${stats.fixedFromPos}`);
console.log(`  Fixed from parent: ${stats.fixedFromParent}`);
console.log(`  Fixed from name match: ${stats.fixedFromNameMatch}`);
console.log(`  Still missing: ${stats.stillMissing}`);

const totalFixed = stats.fixedFromWoo + stats.fixedFromPos + stats.fixedFromParent + stats.fixedFromNameMatch;
const recoveryRate = ((totalFixed / (stats.total - stats.hadPrice)) * 100).toFixed(1);
console.log(`\nRecovery rate: ${recoveryRate}% of missing prices found`);

// Write fixed CSV
function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

const outputLines = [
    importHeader.map(escapeCSV).join(','),
    ...fixedRows.map(row => row.map(escapeCSV).join(','))
];

fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
console.log(`\nWrote: ${OUTPUT_FILE}`);

// Write missing products report
if (stats.missingProducts.length > 0) {
    const reportFile = path.join(BASE, 'outputs/products_still_missing_prices.csv');
    const reportLines = [
        'Type,SKU,Name,Parent',
        ...stats.missingProducts.map(p => 
            [p.type, p.sku, p.name, p.parent].map(escapeCSV).join(',')
        )
    ];
    fs.writeFileSync(reportFile, reportLines.join('\n'), 'utf-8');
    console.log(`Wrote missing products report: ${reportFile}`);
    
    // Show sample of missing
    console.log('\nSample of products still missing prices:');
    stats.missingProducts.slice(0, 10).forEach(p => {
        console.log(`  [${p.type}] ${p.name || p.sku || '(no name)'}`);
    });
    if (stats.missingProducts.length > 10) {
        console.log(`  ... and ${stats.missingProducts.length - 10} more`);
    }
}
