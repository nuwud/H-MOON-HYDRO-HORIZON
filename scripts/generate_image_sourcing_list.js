#!/usr/bin/env node
/**
 * generate_image_sourcing_list.js
 * Creates a CSV of third-party products needing images
 */

const fs = require('fs');
const Papa = require('papaparse');

const csv = fs.readFileSync('outputs/woocommerce_FINAL_WITH_IMAGES.csv', 'utf8');
const parsed = Papa.parse(csv, { header: true });

// Get non-variations missing images, excluding house brands
const missing = parsed.data.filter(r => 
  r.Type && r.Type !== 'variation' && !r.Images && 
  r.Brands && r.Brands !== 'HMoonHydro' && r.Brands !== 'UNO'
);

// Group by brand
const byBrand = {};
missing.forEach(r => {
  const b = r.Brands;
  if (!byBrand[b]) byBrand[b] = [];
  byBrand[b].push({ sku: r.SKU, name: r.Name, category: r.Categories });
});

// Manufacturer URLs
const urls = {
  'Advanced Nutrients': 'https://advancednutrients.com/',
  'FloraFlex': 'https://floraflex.com/',
  'Clonex': 'https://hydrodynamicsintl.com/',
  'groVE BAG': 'https://grovebag.com/',
  'Grodan': 'https://grodan.com/',
  'Fox Farm': 'https://foxfarm.com/',
  'Gavita': 'https://gavita.com/',
  'Hydro-Logic': 'https://hydrologicpurification.com/',
  'Pro-Mix': 'https://premier-horticulture.com/',
  'RAW': 'https://npkpro.com/',
  'General Hydroponics': 'https://generalhydroponics.com/',
  'AeroFlo': 'https://generalhydroponics.com/',
  'Amazon': '',
  'Shear Perfection': 'https://sunlightingsupply.com/'
};

// Generate CSV
let out = 'Brand,SKU,Name,Category,Manufacturer URL\n';
Object.entries(byBrand)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([brand, prods]) => {
    prods.forEach(p => {
      const url = urls[brand] || '';
      const name = (p.name || '').replace(/"/g, '""');
      out += `${brand},"${p.sku}","${name}","${p.category || ''}",${url}\n`;
    });
  });

fs.writeFileSync('outputs/third_party_images_needed.csv', out);

console.log('=== Third-Party Image Sourcing List ===');
console.log(`Total products: ${missing.length}`);
console.log(`Brands: ${Object.keys(byBrand).length}`);
console.log('');
console.log('By brand:');
Object.entries(byBrand)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([brand, prods]) => {
    console.log(`  ${prods.length} - ${brand}`);
  });
console.log('');
console.log('Output: outputs/third_party_images_needed.csv');
