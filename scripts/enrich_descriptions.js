/**
 * Enrich Product Descriptions
 * 
 * Strategy:
 * 1. Pull existing descriptions from products_export_final_ready.csv
 * 2. Generate descriptions for remaining products using title/vendor/category
 * 
 * Run: node scripts/enrich_descriptions.js
 */

const fs = require('fs');
const Papa = require('papaparse');

// Configuration
const SOURCE_FILE = 'outputs/shopify_complete_import.csv';
const FINAL_READY_FILE = 'CSVs/products_export_final_ready.csv';
const OUTPUT_FILE = 'outputs/shopify_complete_import_enriched.csv';

// Description templates by category
const CATEGORY_TEMPLATES = {
  nutrients: (p) => `${p.Vendor} ${p.Title} is a professional-grade nutrient solution designed for optimal plant growth. This ${p['Product Category'].split('>').pop().trim().toLowerCase()} provides essential elements for healthy, vigorous plants throughout their growth cycle. Trusted by hydroponic growers for consistent, high-quality results.`,
  
  'grow media': (p) => `${p.Title} by ${p.Vendor} provides an ideal growing medium for hydroponic and soil-based cultivation. This premium growing substrate offers excellent drainage, aeration, and root support for healthy plant development.`,
  
  lighting: (p) => `${p.Title} from ${p.Vendor} delivers professional-grade illumination for indoor growing. Engineered for efficiency and performance, this lighting solution provides the optimal spectrum for plant growth from seedling to harvest.`,
  
  'environmental': (p) => `${p.Title} by ${p.Vendor} helps maintain optimal growing conditions. This environmental control equipment ensures your plants thrive with consistent temperature, humidity, and air quality management.`,
  
  irrigation: (p) => `${p.Title} is essential equipment for efficient water and nutrient delivery. This ${p.Vendor} product ensures consistent, reliable irrigation for healthy plant growth in any growing system.`,
  
  propagation: (p) => `${p.Title} from ${p.Vendor} supports successful seed starting and cloning. Designed for propagation, this product helps establish strong, healthy plants from the very beginning.`,
  
  'pest control': (p) => `${p.Title} by ${p.Vendor} provides effective protection against common garden pests. This pest management solution helps keep your plants healthy without compromising quality.`,
  
  containers: (p) => `${p.Title} offers durable, reliable plant containment from ${p.Vendor}. Designed for hydroponic and traditional growing, these containers support healthy root development and plant growth.`,
  
  default: (p) => `${p.Title} by ${p.Vendor} is a quality hydroponics product designed for serious growers. Part of the ${p['Product Category'] ? p['Product Category'].split('>').pop().trim() : 'growing supplies'} category, this product delivers reliable performance for indoor and hydroponic cultivation.`
};

function getCategoryTemplate(category) {
  if (!category) return CATEGORY_TEMPLATES.default;
  const cat = category.toLowerCase();
  
  if (cat.includes('nutrient') || cat.includes('fertilizer')) return CATEGORY_TEMPLATES.nutrients;
  if (cat.includes('grow media') || cat.includes('soil') || cat.includes('coco')) return CATEGORY_TEMPLATES['grow media'];
  if (cat.includes('light') || cat.includes('bulb') || cat.includes('led')) return CATEGORY_TEMPLATES.lighting;
  if (cat.includes('fan') || cat.includes('ventil') || cat.includes('climate') || cat.includes('environment')) return CATEGORY_TEMPLATES['environmental'];
  if (cat.includes('irrigation') || cat.includes('pump') || cat.includes('tubing')) return CATEGORY_TEMPLATES.irrigation;
  if (cat.includes('propagation') || cat.includes('clone') || cat.includes('seed')) return CATEGORY_TEMPLATES.propagation;
  if (cat.includes('pest') || cat.includes('insect')) return CATEGORY_TEMPLATES['pest control'];
  if (cat.includes('container') || cat.includes('pot') || cat.includes('bucket')) return CATEGORY_TEMPLATES.containers;
  
  return CATEGORY_TEMPLATES.default;
}

function generateDescription(product) {
  const template = getCategoryTemplate(product['Product Category']);
  let desc = template(product);
  
  // Clean up any double spaces or undefined
  desc = desc.replace(/undefined/g, 'quality').replace(/\s+/g, ' ').trim();
  
  // Ensure minimum length with additional content
  if (desc.length < 150) {
    desc += ` Available at H-Moon Hydro, your trusted source for professional hydroponics equipment and supplies.`;
  }
  
  return desc;
}

async function main() {
  console.log('=== DESCRIPTION ENRICHMENT ===\n');
  
  // Load source files
  console.log('Loading source files...');
  const sourceData = Papa.parse(fs.readFileSync(SOURCE_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  const finalReadyData = Papa.parse(fs.readFileSync(FINAL_READY_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  
  console.log(`Source file: ${sourceData.length} rows`);
  console.log(`Final ready: ${finalReadyData.length} rows`);
  
  // Build lookup from final ready (by handle)
  const finalByHandle = {};
  finalReadyData.forEach(r => {
    if (r.Handle && r['Body (HTML)'] && r['Body (HTML)'].length > 100) {
      finalByHandle[r.Handle.toLowerCase()] = r['Body (HTML)'];
    }
  });
  console.log(`Descriptions available from final_ready: ${Object.keys(finalByHandle).length}`);
  
  // Process source data
  let stats = { recovered: 0, generated: 0, alreadyGood: 0, variants: 0 };
  
  const enrichedData = sourceData.map(row => {
    // Skip variant rows (no title)
    if (!row.Title || row.Title.trim() === '') {
      stats.variants++;
      return row;
    }
    
    const currentDesc = row['Body (HTML)'] || '';
    
    // Already has good description
    if (currentDesc.length > 100) {
      stats.alreadyGood++;
      return row;
    }
    
    // Try to recover from final_ready
    const handle = (row.Handle || '').toLowerCase();
    if (finalByHandle[handle]) {
      row['Body (HTML)'] = finalByHandle[handle];
      stats.recovered++;
      return row;
    }
    
    // Generate description
    row['Body (HTML)'] = generateDescription(row);
    stats.generated++;
    return row;
  });
  
  // Write output
  const output = Papa.unparse(enrichedData);
  fs.writeFileSync(OUTPUT_FILE, output);
  
  console.log('\n=== RESULTS ===');
  console.log(`Already good descriptions: ${stats.alreadyGood}`);
  console.log(`Recovered from final_ready: ${stats.recovered}`);
  console.log(`Generated new descriptions: ${stats.generated}`);
  console.log(`Variant rows (unchanged): ${stats.variants}`);
  console.log(`\nOutput: ${OUTPUT_FILE}`);
  
  // Verify output quality
  const verifyData = Papa.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'), { header: true, skipEmptyLines: true }).data;
  const verifyProducts = verifyData.filter(r => r.Title && r.Title.trim() !== '');
  const verifyWithDesc = verifyProducts.filter(r => (r['Body (HTML)'] || '').length > 100).length;
  console.log(`\nVerification: ${verifyWithDesc}/${verifyProducts.length} products now have descriptions (${(verifyWithDesc/verifyProducts.length*100).toFixed(1)}%)`);
}

main().catch(console.error);
