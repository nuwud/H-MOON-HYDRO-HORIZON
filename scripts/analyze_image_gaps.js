const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Load WooCommerce URL index
const wooUrls = JSON.parse(fs.readFileSync('outputs/woo_all_image_urls.json', 'utf8'));

// Load CSV properly
const csv = fs.readFileSync('outputs/woocommerce_import_ready.csv', 'utf8');
const parsed = Papa.parse(csv, { header: true });

const all = parsed.data.filter(r => r.Type);
const withImg = all.filter(r => r.Images);
const noImg = all.filter(r => !r.Images);
const noImgNonVar = noImg.filter(r => r.Type !== 'variation');

console.log('=== Image Status Summary ===');
console.log('Total products:', all.length);
console.log('With images:', withImg.length, '(' + Math.round(withImg.length/all.length*100) + '%)');
console.log('Without images:', noImg.length);
console.log('  - Variations (inherit from parent):', noImg.filter(r => r.Type === 'variation').length);
console.log('  - Non-variations needing images:', noImgNonVar.length);
console.log('');

console.log('=== Non-variations needing images by Type ===');
const byType = {};
noImgNonVar.forEach(r => { byType[r.Type] = (byType[r.Type] || 0) + 1; });
Object.entries(byType).forEach(([t,c]) => console.log(`  ${t}: ${c}`));
console.log('');

// Find products missing images (excluding variations)
console.log('=== Missing images by brand (top 15) ===');
const byBrand = {};
noImgNonVar.forEach(r => {
  const b = r.Brands || 'Unknown';
  byBrand[b] = (byBrand[b] || 0) + 1;
});
Object.entries(byBrand)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([b, c]) => console.log(`  ${c} - ${b}`));

// Show what CAN be sourced vs house brand
const houseBrand = noImgNonVar.filter(r => r.Brands === 'HMoonHydro' || r.Brands === 'UNO');
const canSource = noImgNonVar.filter(r => r.Brands && r.Brands !== 'HMoonHydro' && r.Brands !== 'UNO');
const unknownBrand = noImgNonVar.filter(r => !r.Brands || r.Brands === 'Unknown');

console.log('');
console.log('=== Image Sourcing Breakdown ===');
console.log('House brand (HMoonHydro/UNO - need photography):', houseBrand.length);
console.log('Third-party brand (can source from manufacturers):', canSource.length);
console.log('Unknown brand (need identification):', unknownBrand.length);
