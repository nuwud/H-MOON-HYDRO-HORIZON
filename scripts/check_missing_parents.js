const Papa = require('papaparse');
const fs = require('fs');

const csv = fs.readFileSync('outputs/woocommerce_FINAL_WITH_IMAGES.csv', 'utf8');
const r = Papa.parse(csv, { header: true });

const vars = r.data.filter(x => x.Type === 'variation');
const nonvars = r.data.filter(x => x.Type !== 'variation');

console.log('Variations:', vars.length, 'Non-variations:', nonvars.length);

// Get all variable product slugs
const variableProds = nonvars.filter(x => x.Type === 'variable');
const slugs = new Set();
variableProds.forEach(p => {
    const slug = p.Name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (slug) slugs.add(slug);
});

console.log('Variable product slugs:', slugs.size);

// Get unique parent refs from variations
const parents = [...new Set(vars.map(x => x.Parent))].filter(Boolean);
console.log('Unique parent refs:', parents.length);

// Find missing parents
const missing = parents.filter(p => {
    return !slugs.has(p);
});
console.log('Parent refs without matching variable product:', missing.length);

console.log('\nSample missing (first 20):');
missing.slice(0, 20).forEach(m => console.log('  -', m));
