/**
 * Enrich Shipping Dimensions Script
 * 
 * Merges dimension and shipping class data from WooCommerce export
 * into the final import file, then estimates missing values.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// Paths
const IMPORT_FILE = 'outputs/WOOCOMMERCE_IMPORT_FINAL.csv';
const WOO_EXPORT = 'CSVs/WooExport/Products-Export-2025-Dec-31-180709.csv';
const OUTPUT_FILE = 'outputs/WOOCOMMERCE_IMPORT_WITH_SHIPPING.csv';

// Shipping class thresholds (by weight in lbs)
const SHIPPING_CLASSES = {
  'light': { maxWeight: 1, name: 'Light Items' },
  'standard': { maxWeight: 10, name: 'Domestic' },
  'medium': { maxWeight: 50, name: 'Medium Freight' },
  'heavy': { maxWeight: 150, name: 'Heavy Freight' },
  'freight': { maxWeight: Infinity, name: 'LTL Freight' }
};

// Default dimensions by category (L x W x H in inches)
const CATEGORY_DIMENSIONS = {
  'nutrients': { length: 4, width: 4, height: 8 },      // Bottles
  'grow_media': { length: 18, width: 12, height: 6 },   // Bags
  'seeds': { length: 4, width: 3, height: 1 },          // Seed packs
  'propagation': { length: 12, width: 10, height: 6 },  // Trays/domes
  'irrigation': { length: 8, width: 6, height: 4 },     // Fittings/parts
  'ph_meters': { length: 8, width: 3, height: 2 },      // Meters
  'environmental_monitors': { length: 6, width: 4, height: 2 },
  'controllers': { length: 10, width: 8, height: 4 },
  'grow_lights': { length: 24, width: 24, height: 6 },  // Panels
  'hid_bulbs': { length: 12, width: 6, height: 6 },     // Bulbs
  'airflow': { length: 12, width: 12, height: 12 },     // Fans
  'odor_control': { length: 24, width: 10, height: 10 }, // Filters
  'water_filtration': { length: 12, width: 8, height: 8 },
  'containers': { length: 12, width: 12, height: 12 },  // Pots
  'harvesting': { length: 18, width: 12, height: 6 },
  'trimming': { length: 10, width: 6, height: 2 },      // Scissors
  'pest_control': { length: 6, width: 4, height: 10 },  // Sprays
  'co2': { length: 8, width: 8, height: 18 },           // Tanks/controllers
  'grow_room_materials': { length: 48, width: 12, height: 12 }, // Rolls
  'books': { length: 10, width: 8, height: 1 },
  'electrical_supplies': { length: 6, width: 4, height: 2 },
  'default': { length: 10, width: 8, height: 6 }
};

console.log('='.repeat(60));
console.log('ENRICH SHIPPING & DIMENSIONS');
console.log('='.repeat(60));

// Load WooCommerce export for existing dimension data
console.log('\n1. Loading WooCommerce export...');
let wooData = [];
try {
  wooData = parse(fs.readFileSync(WOO_EXPORT), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
  console.log(`   Loaded ${wooData.length} products from WooCommerce export`);
} catch (e) {
  console.log(`   Warning: Could not parse WooCommerce export: ${e.message}`);
}

// Build lookup by SKU
const wooLookup = new Map();
wooData.forEach(row => {
  const sku = row.Sku?.trim();
  if (sku) {
    wooLookup.set(sku, {
      weight: parseFloat(row.Weight) || 0,
      length: parseFloat(row.Length) || 0,
      width: parseFloat(row.Width) || 0,
      height: parseFloat(row.Height) || 0,
      shippingClass: row['Shipping classes']?.trim() || ''
    });
  }
});
console.log(`   Built lookup for ${wooLookup.size} SKUs`);

// Load import file
console.log('\n2. Loading import file...');
const importData = parse(fs.readFileSync(IMPORT_FILE), {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true
});
console.log(`   Loaded ${importData.length} rows`);

// Stats tracking
const stats = {
  weightFromWoo: 0,
  weightEstimated: 0,
  lengthFromWoo: 0,
  lengthEstimated: 0,
  widthFromWoo: 0,
  widthEstimated: 0,
  heightFromWoo: 0,
  heightEstimated: 0,
  shippingClassFromWoo: 0,
  shippingClassAssigned: 0,
  alreadyHadWeight: 0,
  alreadyHadDimensions: 0,
  alreadyHadShippingClass: 0
};

// Detect category from product name or categories field
function detectCategory(row) {
  const text = `${row.Name || ''} ${row.Categories || ''}`.toLowerCase();
  
  const patterns = {
    'nutrients': /nutrient|fertilizer|bloom|grow|veg|cal-?mag|ph\s*(up|down)/i,
    'grow_media': /coco|perlite|rockwool|hydroton|grow\s*stone|soil|substrate/i,
    'seeds': /seed|clone/i,
    'propagation': /propagat|tray|dome|humidity|rooting/i,
    'irrigation': /drip|pump|tubing|fitting|reservoir|irrigation/i,
    'ph_meters': /ph\s*meter|ph\s*pen|tds|ppm|ec\s*meter/i,
    'environmental_monitors': /thermo|hygro|monitor|sensor|climate/i,
    'controllers': /controller|timer|relay|digital/i,
    'grow_lights': /led|light|lamp|panel|bar|quantum/i,
    'hid_bulbs': /hid|hps|mh|bulb|cmh|lec/i,
    'airflow': /fan|duct|inline|ventilation|blower/i,
    'odor_control': /carbon|filter|scrubber|odor/i,
    'water_filtration': /ro\s|reverse\s*osmosis|water\s*filter/i,
    'containers': /pot|container|bucket|fabric|smart\s*pot/i,
    'harvesting': /harvest|dry|cure|rack|net/i,
    'trimming': /trim|scissors|shear|bud/i,
    'pest_control': /pest|neem|spray|insect|mite|fungicide/i,
    'co2': /co2|carbon\s*dioxide|burner|regulator/i,
    'grow_room_materials': /mylar|tent|room|reflective|duct/i,
    'books': /book|guide|manual/i,
    'electrical_supplies': /cord|plug|timer|outlet|power/i
  };
  
  for (const [category, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return category;
    }
  }
  return 'default';
}

// Assign shipping class based on weight
function getShippingClass(weight) {
  const w = parseFloat(weight) || 0;
  if (w <= 1) return 'Light Items';
  if (w <= 10) return 'Domestic';
  if (w <= 50) return 'Medium Freight';
  if (w <= 150) return 'Heavy Freight';
  return 'LTL Freight';
}

// Estimate weight by category if missing
function estimateWeight(category) {
  const weights = {
    'nutrients': 2.5,
    'grow_media': 15,
    'seeds': 0.1,
    'propagation': 1.5,
    'irrigation': 0.5,
    'ph_meters': 0.3,
    'environmental_monitors': 0.5,
    'controllers': 1.5,
    'grow_lights': 8,
    'hid_bulbs': 1,
    'airflow': 5,
    'odor_control': 8,
    'water_filtration': 6,
    'containers': 1,
    'harvesting': 2,
    'trimming': 0.2,
    'pest_control': 1,
    'co2': 3,
    'grow_room_materials': 10,
    'books': 1,
    'electrical_supplies': 0.5,
    'default': 2
  };
  return weights[category] || weights.default;
}

console.log('\n3. Enriching data...');

importData.forEach(row => {
  const sku = row.SKU?.trim();
  const wooProduct = wooLookup.get(sku);
  const category = detectCategory(row);
  
  // Weight
  const currentWeight = parseFloat(row['Weight (lbs)']) || 0;
  if (currentWeight > 0) {
    stats.alreadyHadWeight++;
  } else if (wooProduct?.weight > 0) {
    row['Weight (lbs)'] = wooProduct.weight.toString();
    stats.weightFromWoo++;
  } else {
    row['Weight (lbs)'] = estimateWeight(category).toString();
    stats.weightEstimated++;
  }
  
  // Length
  const currentLength = parseFloat(row['Length (in)']) || 0;
  if (currentLength > 0) {
    stats.alreadyHadDimensions++;
  } else if (wooProduct?.length > 0) {
    row['Length (in)'] = wooProduct.length.toString();
    row['Width (in)'] = wooProduct.width.toString();
    row['Height (in)'] = wooProduct.height.toString();
    stats.lengthFromWoo++;
  } else {
    const dims = CATEGORY_DIMENSIONS[category] || CATEGORY_DIMENSIONS.default;
    row['Length (in)'] = dims.length.toString();
    row['Width (in)'] = dims.width.toString();
    row['Height (in)'] = dims.height.toString();
    stats.lengthEstimated++;
  }
  
  // Shipping Class
  const currentClass = row['Shipping class']?.trim();
  if (currentClass) {
    stats.alreadyHadShippingClass++;
  } else if (wooProduct?.shippingClass) {
    row['Shipping class'] = wooProduct.shippingClass;
    stats.shippingClassFromWoo++;
  } else {
    row['Shipping class'] = getShippingClass(row['Weight (lbs)']);
    stats.shippingClassAssigned++;
  }
});

console.log('\n4. Statistics:');
console.log('   Weight:');
console.log(`     Already had: ${stats.alreadyHadWeight}`);
console.log(`     From WooCommerce: ${stats.weightFromWoo}`);
console.log(`     Estimated: ${stats.weightEstimated}`);

console.log('   Dimensions:');
console.log(`     Already had: ${stats.alreadyHadDimensions}`);
console.log(`     From WooCommerce: ${stats.lengthFromWoo}`);
console.log(`     Estimated: ${stats.lengthEstimated}`);

console.log('   Shipping Class:');
console.log(`     Already had: ${stats.alreadyHadShippingClass}`);
console.log(`     From WooCommerce: ${stats.shippingClassFromWoo}`);
console.log(`     Assigned by weight: ${stats.shippingClassAssigned}`);

// Verify coverage
let hasWeight = 0, hasLength = 0, hasShipClass = 0;
importData.forEach(row => {
  if (parseFloat(row['Weight (lbs)']) > 0) hasWeight++;
  if (parseFloat(row['Length (in)']) > 0) hasLength++;
  if (row['Shipping class']?.trim()) hasShipClass++;
});

console.log('\n5. Final Coverage:');
console.log(`   Weight: ${hasWeight}/${importData.length} (${(hasWeight/importData.length*100).toFixed(1)}%)`);
console.log(`   Dimensions: ${hasLength}/${importData.length} (${(hasLength/importData.length*100).toFixed(1)}%)`);
console.log(`   Shipping Class: ${hasShipClass}/${importData.length} (${(hasShipClass/importData.length*100).toFixed(1)}%)`);

// Write output
console.log('\n6. Writing output...');
const output = stringify(importData, { header: true });
fs.writeFileSync(OUTPUT_FILE, output);
console.log(`   Saved to: ${OUTPUT_FILE}`);

// Shipping class summary
const classCounts = {};
importData.forEach(row => {
  const sc = row['Shipping class'] || 'None';
  classCounts[sc] = (classCounts[sc] || 0) + 1;
});
console.log('\n7. Shipping Class Distribution:');
Object.entries(classCounts).sort((a, b) => b[1] - a[1]).forEach(([cls, count]) => {
  console.log(`   ${cls}: ${count}`);
});

console.log('\n' + '='.repeat(60));
console.log('DONE! Import file with shipping data ready.');
console.log('='.repeat(60));
