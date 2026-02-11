/**
 * Transform Shopify CSV to WooCommerce Import Format
 * 
 * Usage:
 *   node scripts/transform_to_woocommerce.js --dry-run    # Preview changes
 *   node scripts/transform_to_woocommerce.js --confirm    # Execute transformation
 * 
 * Input:  outputs/shopify_complete_import_enriched.csv (Shopify format with 100% descriptions)
 * Output: outputs/woocommerce_import_ready.csv (WooCommerce format)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  inputFile: path.join(__dirname, '..', 'outputs', 'shopify_complete_import_enriched.csv'),
  outputFile: path.join(__dirname, '..', 'outputs', 'woocommerce_import_ready.csv'),
  validationFile: path.join(__dirname, '..', 'outputs', 'woocommerce_import_validation.json'),
  gramsToLbs: 453.592,
};

// WooCommerce CSV column headers
const WOO_HEADERS = [
  'ID',
  'Type',
  'SKU',
  'Name',
  'Published',
  'Is featured?',
  'Visibility in catalog',
  'Short description',
  'Description',
  'Date sale price starts',
  'Date sale price ends',
  'Tax status',
  'Tax class',
  'In stock?',
  'Stock',
  'Low stock amount',
  'Backorders allowed?',
  'Sold individually?',
  'Weight (lbs)',
  'Length (in)',
  'Width (in)',
  'Height (in)',
  'Allow customer reviews?',
  'Purchase note',
  'Sale price',
  'Regular price',
  'Categories',
  'Tags',
  'Shipping class',
  'Images',
  'Download limit',
  'Download expiry days',
  'Parent',
  'Grouped products',
  'Upsells',
  'Cross-sells',
  'External URL',
  'Button text',
  'Position',
  'Brands',
  'Attribute 1 name',
  'Attribute 1 value(s)',
  'Attribute 1 visible',
  'Attribute 1 global',
];

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
const verbose = args.includes('--verbose') || args.includes('-v');

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

/**
 * Escape CSV field
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert grams to pounds
 */
function gramsToLbs(grams) {
  const g = parseFloat(grams);
  if (isNaN(g) || g === 0) return '';
  return (g / CONFIG.gramsToLbs).toFixed(2);
}

/**
 * Map Shopify category to WooCommerce format
 */
function mapCategory(shopifyType, shopifyTags) {
  // WooCommerce uses "Parent > Child" format with pipe delimiters
  // Shopify has Type and Tags
  
  if (!shopifyType) return '';
  
  // Clean up the category
  let category = shopifyType.trim();
  
  // Map common Shopify types to WooCommerce hierarchy
  const categoryMap = {
    'Nutrients': 'Nutrients',
    'Grow Lights': 'Grow Lights',
    'Grow Media': 'Grow Media',
    'Irrigation': 'Irrigation',
    'Airflow': 'Environment > Airflow',
    'Odor Control': 'Environment > Odor Control',
    'Environmental Monitors': 'Environment > Monitors',
    'Controllers': 'Environment > Controllers',
    'pH Meters': 'Testing > pH Meters',
    'Containers': 'Containers & Pots',
    'Propagation': 'Propagation',
    'Seeds': 'Seeds',
    'Harvesting': 'Harvesting',
    'Trimming': 'Harvesting > Trimming',
    'Pest Control': 'Pest Control',
    'CO2': 'Environment > CO2',
    'Books': 'Books & Media',
    'HID Bulbs': 'Grow Lights > HID Bulbs',
  };
  
  return categoryMap[category] || category;
}

/**
 * Determine WooCommerce product type
 */
function determineProductType(row, allRows, currentIndex) {
  const handle = row['Handle'];
  const hasVariantOptions = row['Option1 Name'] && row['Option1 Value'];
  
  // Check if this is a variant row (same handle as previous, no title)
  if (currentIndex > 0) {
    const prevRow = allRows[currentIndex - 1];
    if (prevRow['Handle'] === handle && !row['Title']) {
      return 'variation';
    }
  }
  
  // Check if next row is a variant of this product
  if (currentIndex < allRows.length - 1) {
    const nextRow = allRows[currentIndex + 1];
    if (nextRow['Handle'] === handle && !nextRow['Title']) {
      return 'variable';
    }
  }
  
  return 'simple';
}

/**
 * Transform a single row from Shopify to WooCommerce format
 */
function transformRow(row, type, parentSlug = '') {
  const wooRow = {};
  
  // ID - leave blank for new products
  wooRow['ID'] = '';
  
  // Type
  wooRow['Type'] = type;
  
  // SKU
  wooRow['SKU'] = row['Variant SKU'] || '';
  
  // Name
  wooRow['Name'] = type === 'variation' ? '' : row['Title'] || '';
  
  // Published
  wooRow['Published'] = row['Published'] === 'true' ? '1' : '1';
  
  // Is featured
  wooRow['Is featured?'] = '0';
  
  // Visibility
  wooRow['Visibility in catalog'] = 'visible';
  
  // Short description (first 150 chars of body)
  const body = row['Body (HTML)'] || '';
  const plainText = body.replace(/<[^>]*>/g, '').trim();
  wooRow['Short description'] = plainText.substring(0, 150);
  
  // Description
  wooRow['Description'] = body;
  
  // Sale dates
  wooRow['Date sale price starts'] = '';
  wooRow['Date sale price ends'] = '';
  
  // Tax
  wooRow['Tax status'] = row['Variant Taxable'] === 'true' ? 'taxable' : 'none';
  wooRow['Tax class'] = '';
  
  // Stock
  wooRow['In stock?'] = '1';
  wooRow['Stock'] = row['Variant Inventory Qty'] || '';
  wooRow['Low stock amount'] = '';
  wooRow['Backorders allowed?'] = '0';
  wooRow['Sold individually?'] = '0';
  
  // Dimensions
  wooRow['Weight (lbs)'] = gramsToLbs(row['Variant Grams']);
  wooRow['Length (in)'] = '';
  wooRow['Width (in)'] = '';
  wooRow['Height (in)'] = '';
  
  // Reviews
  wooRow['Allow customer reviews?'] = '1';
  
  // Purchase note
  wooRow['Purchase note'] = '';
  
  // Prices
  wooRow['Sale price'] = row['Variant Compare At Price'] ? row['Variant Price'] : '';
  wooRow['Regular price'] = row['Variant Compare At Price'] || row['Variant Price'] || '';
  
  // Categories (only for parent/simple, not variations)
  wooRow['Categories'] = type === 'variation' ? '' : mapCategory(row['Type'], row['Tags']);
  
  // Tags
  wooRow['Tags'] = type === 'variation' ? '' : (row['Tags'] || '').replace(/,/g, '|');
  
  // Shipping
  wooRow['Shipping class'] = '';
  
  // Images
  wooRow['Images'] = row['Image Src'] || '';
  
  // Downloads
  wooRow['Download limit'] = '';
  wooRow['Download expiry days'] = '';
  
  // Parent (for variations)
  wooRow['Parent'] = type === 'variation' ? parentSlug : '';
  
  // Related products
  wooRow['Grouped products'] = '';
  wooRow['Upsells'] = '';
  wooRow['Cross-sells'] = '';
  
  // External
  wooRow['External URL'] = '';
  wooRow['Button text'] = '';
  
  // Position
  wooRow['Position'] = '0';
  
  // Brands (from Vendor)
  wooRow['Brands'] = type === 'variation' ? '' : (row['Vendor'] || '');
  
  // Attributes (for variable products)
  if (type === 'variable' && row['Option1 Name']) {
    wooRow['Attribute 1 name'] = row['Option1 Name'];
    wooRow['Attribute 1 value(s)'] = row['Option1 Value'] || '';
    wooRow['Attribute 1 visible'] = '1';
    wooRow['Attribute 1 global'] = '1';
  } else if (type === 'variation' && row['Option1 Value']) {
    wooRow['Attribute 1 name'] = row['Option1 Name'] || 'Size';
    wooRow['Attribute 1 value(s)'] = row['Option1 Value'];
    wooRow['Attribute 1 visible'] = '';
    wooRow['Attribute 1 global'] = '';
  } else {
    wooRow['Attribute 1 name'] = '';
    wooRow['Attribute 1 value(s)'] = '';
    wooRow['Attribute 1 visible'] = '';
    wooRow['Attribute 1 global'] = '';
  }
  
  return wooRow;
}

/**
 * Main transformation function
 */
async function transform() {
  console.log('='.repeat(60));
  console.log('WooCommerce Product Import Transformation');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no files written)' : 'LIVE'}`);
  console.log(`Input: ${CONFIG.inputFile}`);
  console.log(`Output: ${CONFIG.outputFile}`);
  console.log('');
  
  // Check input file exists
  if (!fs.existsSync(CONFIG.inputFile)) {
    console.error(`ERROR: Input file not found: ${CONFIG.inputFile}`);
    process.exit(1);
  }
  
  // Read and parse input CSV
  console.log('Reading input file...');
  const content = fs.readFileSync(CONFIG.inputFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('ERROR: Input file is empty or has no data rows');
    process.exit(1);
  }
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  console.log(`Found ${headers.length} columns, ${lines.length - 1} data rows`);
  
  // Parse all rows into objects
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  // Transform rows
  console.log('Transforming to WooCommerce format...');
  const wooRows = [];
  const stats = {
    simple: 0,
    variable: 0,
    variation: 0,
    total: 0,
    withDescription: 0,
    withWeight: 0,
    withImage: 0,
    withSKU: 0,
  };
  
  let currentParentHandle = '';
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const type = determineProductType(row, rows, i);
    
    if (type === 'variable') {
      currentParentHandle = row['Handle'];
      
      // Collect all variant values for this parent
      const variantValues = [row['Option1 Value']];
      let j = i + 1;
      while (j < rows.length && rows[j]['Handle'] === currentParentHandle && !rows[j]['Title']) {
        if (rows[j]['Option1 Value']) {
          variantValues.push(rows[j]['Option1 Value']);
        }
        j++;
      }
      
      // Transform parent with all variant values
      const wooRow = transformRow(row, type, '');
      wooRow['Attribute 1 value(s)'] = [...new Set(variantValues)].join(' | ');
      wooRows.push(wooRow);
      stats.variable++;
    } else if (type === 'variation') {
      const wooRow = transformRow(row, type, currentParentHandle);
      wooRows.push(wooRow);
      stats.variation++;
    } else {
      currentParentHandle = '';
      const wooRow = transformRow(row, type, '');
      wooRows.push(wooRow);
      stats.simple++;
    }
    
    stats.total++;
    
    // Track coverage stats
    const wooRow = wooRows[wooRows.length - 1];
    if (wooRow['Description']) stats.withDescription++;
    if (wooRow['Weight (lbs)']) stats.withWeight++;
    if (wooRow['Images']) stats.withImage++;
    if (wooRow['SKU']) stats.withSKU++;
  }
  
  // Build output CSV
  const outputLines = [WOO_HEADERS.join(',')];
  for (const wooRow of wooRows) {
    const values = WOO_HEADERS.map(h => escapeCSV(wooRow[h] || ''));
    outputLines.push(values.join(','));
  }
  
  const output = outputLines.join('\n');
  
  // Report
  console.log('');
  console.log('Transformation Statistics:');
  console.log('-'.repeat(40));
  console.log(`  Total rows processed: ${stats.total}`);
  console.log(`  Simple products:      ${stats.simple}`);
  console.log(`  Variable products:    ${stats.variable}`);
  console.log(`  Variations:           ${stats.variation}`);
  console.log('');
  console.log('Coverage:');
  console.log(`  With description: ${stats.withDescription} (${((stats.withDescription/stats.total)*100).toFixed(1)}%)`);
  console.log(`  With weight:      ${stats.withWeight} (${((stats.withWeight/stats.total)*100).toFixed(1)}%)`);
  console.log(`  With image:       ${stats.withImage} (${((stats.withImage/stats.total)*100).toFixed(1)}%)`);
  console.log(`  With SKU:         ${stats.withSKU} (${((stats.withSKU/stats.total)*100).toFixed(1)}%)`);
  console.log('');
  
  // Validation report
  const validation = {
    timestamp: new Date().toISOString(),
    inputFile: CONFIG.inputFile,
    outputFile: CONFIG.outputFile,
    stats,
    dryRun,
  };
  
  if (dryRun) {
    console.log('DRY RUN - No files written');
    console.log('');
    console.log('Preview of first 3 rows:');
    console.log('-'.repeat(60));
    for (let i = 0; i < Math.min(4, outputLines.length); i++) {
      console.log(outputLines[i].substring(0, 200) + '...');
    }
    console.log('');
    console.log('To execute transformation, run with --confirm flag');
  } else {
    // Write output files
    fs.writeFileSync(CONFIG.outputFile, output);
    console.log(`✓ Written: ${CONFIG.outputFile}`);
    
    fs.writeFileSync(CONFIG.validationFile, JSON.stringify(validation, null, 2));
    console.log(`✓ Written: ${CONFIG.validationFile}`);
    
    console.log('');
    console.log('Transformation complete!');
    console.log('Next steps:');
    console.log('  1. Review outputs/woocommerce_import_ready.csv');
    console.log('  2. Test import on WooCommerce staging site');
    console.log('  3. Use "Update existing products" option for SKU matching');
  }
}

// Run
transform().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
