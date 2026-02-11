/**
 * Final Data Polish
 * 
 * Fixes:
 * 1. Copy Type → Product Category (for products with no category)
 * 2. Generate SEO Descriptions from Body HTML
 * 3. Ensure SEO Title exists
 * 
 * Run: node scripts/final_data_polish.js
 */

const fs = require('fs');
const Papa = require('papaparse');

const SOURCE_FILE = 'outputs/shopify_complete_import_normalized.csv';
const OUTPUT_FILE = 'outputs/shopify_final_ready.csv';

// Category mapping (Type → Shopify Standard Taxonomy)
const CATEGORY_MAP = {
  'nutrients': 'Home & Garden > Lawn & Garden > Gardening > Plant Care > Plant Food',
  'grow_lights': 'Home & Garden > Lawn & Garden > Gardening > Grow Lights',
  'grow_media': 'Home & Garden > Lawn & Garden > Gardening > Growing Media',
  'irrigation': 'Home & Garden > Lawn & Garden > Watering & Irrigation',
  'airflow': 'Home & Garden > Lawn & Garden > Greenhouse Accessories',
  'ventilation_accessories': 'Home & Garden > Lawn & Garden > Greenhouse Accessories',
  'propagation': 'Home & Garden > Lawn & Garden > Gardening > Seed Starting',
  'containers_pots': 'Home & Garden > Lawn & Garden > Gardening > Pots & Planters',
  'environmental_monitors': 'Home & Garden > Lawn & Garden > Gardening > Plant Care',
  'controllers_timers': 'Home & Garden > Lawn & Garden > Gardening > Plant Care',
  'ph_meters': 'Home & Garden > Lawn & Garden > Gardening > Soil Testing',
  'hid_bulbs': 'Home & Garden > Lawn & Garden > Gardening > Grow Lights',
  'odor_control': 'Home & Garden > Lawn & Garden > Greenhouse Accessories',
  'water_filtration': 'Home & Garden > Lawn & Garden > Watering & Irrigation',
  'pest_control': 'Home & Garden > Lawn & Garden > Gardening > Pest Control',
  'harvesting': 'Home & Garden > Lawn & Garden > Gardening > Harvesting',
  'trimming': 'Home & Garden > Lawn & Garden > Gardening > Pruning',
  'seeds': 'Home & Garden > Lawn & Garden > Gardening > Seeds',
  'co2': 'Home & Garden > Lawn & Garden > Greenhouse Accessories',
  'books': 'Media > Books > Nonfiction > Gardening Books',
  'grow_room_materials': 'Home & Garden > Lawn & Garden > Greenhouse Accessories',
  'electrical_supplies': 'Electronics > Electronics Accessories',
  'extraction': 'Home & Garden > Lawn & Garden > Gardening',
  'grow_tents': 'Home & Garden > Lawn & Garden > Greenhouses',
  'accessories': 'Home & Garden > Lawn & Garden > Gardening > Gardening Accessories',
  'environment control': 'Home & Garden > Lawn & Garden > Greenhouse Accessories'
};

function generateSEODescription(title, body, vendor) {
  // Strip HTML tags from body
  const plainBody = (body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (plainBody.length > 50) {
    // Use first 155 chars of body text
    let desc = plainBody.substring(0, 155);
    // Don't cut mid-word
    const lastSpace = desc.lastIndexOf(' ');
    if (lastSpace > 100) {
      desc = desc.substring(0, lastSpace);
    }
    return desc.trim() + '...';
  }
  
  // Fallback: generate from title
  return `Shop ${title} at H-Moon Hydro. Quality hydroponics supplies from ${vendor || 'top brands'}. Fast shipping.`;
}

async function main() {
  console.log('=== FINAL DATA POLISH ===\n');
  
  const data = Papa.parse(fs.readFileSync(SOURCE_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  console.log(`Loaded: ${data.length} rows`);
  
  let stats = { categoryFixed: 0, seoDescFixed: 0, seoTitleFixed: 0 };
  
  const polishedData = data.map(row => {
    const title = row.Title || '';
    
    // Skip variant rows
    if (!title.trim()) {
      return row;
    }
    
    // Fix Product Category
    if (!(row['Product Category'] || '').trim() && row['Type']) {
      const type = row['Type'].toLowerCase().trim();
      row['Product Category'] = CATEGORY_MAP[type] || CATEGORY_MAP[type.replace(/_/g, ' ')] || `Home & Garden > Lawn & Garden > Gardening`;
      stats.categoryFixed++;
    }
    
    // Fix SEO Description
    if (!(row['SEO Description'] || '').trim() || row['SEO Description'].length < 50) {
      row['SEO Description'] = generateSEODescription(title, row['Body (HTML)'], row['Vendor']);
      stats.seoDescFixed++;
    }
    
    // Fix SEO Title (if empty or too short)
    if (!(row['SEO Title'] || '').trim() || row['SEO Title'].length < 10) {
      row['SEO Title'] = `${title} | H-Moon Hydro`;
      stats.seoTitleFixed++;
    }
    
    return row;
  });
  
  // Write output
  const output = Papa.unparse(polishedData);
  fs.writeFileSync(OUTPUT_FILE, output);
  
  console.log('\n=== RESULTS ===');
  console.log(`Categories fixed: ${stats.categoryFixed}`);
  console.log(`SEO Descriptions fixed: ${stats.seoDescFixed}`);
  console.log(`SEO Titles fixed: ${stats.seoTitleFixed}`);
  console.log(`\nOutput: ${OUTPUT_FILE}`);
  
  // Final verification
  const verifyData = Papa.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  const products = verifyData.filter(r => r.Title && r.Title.trim() !== '');
  
  console.log('\n=== FINAL QUALITY CHECK ===');
  const checks = [
    ['Product Category', r => (r['Product Category'] || '').length > 10],
    ['SEO Description', r => (r['SEO Description'] || '').length > 50],
    ['SEO Title', r => (r['SEO Title'] || '').length > 10]
  ];
  
  checks.forEach(([name, check]) => {
    const count = products.filter(check).length;
    const pct = (count / products.length * 100).toFixed(1);
    console.log(`${name}: ${count}/${products.length} (${pct}%)`);
  });
}

main().catch(console.error);
