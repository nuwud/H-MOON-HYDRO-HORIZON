/**
 * parse_woo_groups.js
 * 
 * Parses WooCommerce products export to extract:
 * 1. Grouped products (parent-child relationships)
 * 2. Product categories
 * 3. Product tags
 * 
 * Output: outputs/woo_groups.json
 */

const fs = require('fs');
const path = require('path');

// Paths
const WOO_PRODUCTS = path.join(__dirname, '../hmoonhydro.com/data/Products-Export-2025-Dec-31-180709.csv');
const WOO_CATEGORIES = path.join(__dirname, '../hmoonhydro.com/data/Product-Categories-Export-2025-Dec-31-180812.csv');
const OUTPUT_FILE = path.join(__dirname, '../outputs/woo_groups.json');

// Parse CSV with proper quote handling
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (char !== '\r') {
      current += char;
    }
  }
  if (current) lines.push(current);
  
  // Parse each line into fields
  return lines.map(line => {
    const fields = [];
    let field = '';
    let inQ = false;
    
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
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

// Slugify a product name for matching
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Normalize product name for matching
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['"()®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('🔍 Parsing WooCommerce product groups...\n');
  
  // Read products export
  if (!fs.existsSync(WOO_PRODUCTS)) {
    console.error('❌ Products export not found:', WOO_PRODUCTS);
    process.exit(1);
  }
  
  const productsContent = fs.readFileSync(WOO_PRODUCTS, 'utf-8');
  const productsRows = parseCSV(productsContent);
  const headers = productsRows[0];
  
  console.log('📊 Products CSV columns:');
  headers.slice(0, 20).forEach((h, i) => console.log(`  ${i}: ${h}`));
  console.log('  ...\n');
  
  // Find column indexes
  const idxId = headers.indexOf('ID');
  const idxName = headers.indexOf('Product Name');
  const idxType = headers.indexOf('Type');
  const idxCategories = headers.indexOf('Product categories');
  const idxTags = headers.indexOf('Product tags');
  const idxGrouped = headers.indexOf('Grouped products');
  const idxSlug = headers.indexOf('Slug');
  const idxSku = headers.indexOf('Sku');
  
  console.log('📍 Column indexes:');
  console.log(`  ID: ${idxId}`);
  console.log(`  Product Name: ${idxName}`);
  console.log(`  Type: ${idxType}`);
  console.log(`  Product categories: ${idxCategories}`);
  console.log(`  Product tags: ${idxTags}`);
  console.log(`  Grouped products: ${idxGrouped}`);
  console.log(`  Slug: ${idxSlug}`);
  console.log(`  Sku: ${idxSku}\n`);
  
  // Build name -> product map
  const productsByName = new Map();
  const productsBySlug = new Map();
  const products = [];
  
  for (let i = 1; i < productsRows.length; i++) {
    const row = productsRows[i];
    if (row.length < 5) continue;
    
    const product = {
      id: row[idxId],
      name: row[idxName] || '',
      type: row[idxType] || 'simple',
      categories: row[idxCategories] || '',
      tags: row[idxTags] || '',
      groupedProducts: row[idxGrouped] || '',
      slug: row[idxSlug] || '',
      sku: row[idxSku] || '',
    };
    
    if (!product.name) continue;
    
    products.push(product);
    productsByName.set(normalizeName(product.name), product);
    if (product.slug) {
      productsBySlug.set(product.slug, product);
    }
  }
  
  console.log(`📦 Loaded ${products.length} products\n`);
  
  // Find grouped products (parents with children)
  const groupedProducts = products.filter(p => p.type === 'grouped');
  console.log(`🔗 Found ${groupedProducts.length} grouped products (parents)\n`);
  
  // Build parent-child relationships
  const groups = [];
  let matchedChildren = 0;
  let unmatchedChildren = 0;
  
  for (const parent of groupedProducts) {
    if (!parent.groupedProducts) continue;
    
    // Split by |~| delimiter (WooCommerce uses this for grouped products)
    const childNames = parent.groupedProducts.split('|~|').map(s => s.trim()).filter(Boolean);
    
    const children = [];
    for (const childName of childNames) {
      // Try exact match first
      let child = productsByName.get(normalizeName(childName));
      
      // Try fuzzy match if not found
      if (!child) {
        const normalized = normalizeName(childName);
        for (const [key, prod] of productsByName.entries()) {
          if (key.includes(normalized) || normalized.includes(key)) {
            child = prod;
            break;
          }
        }
      }
      
      if (child) {
        children.push({
          id: child.id,
          name: child.name,
          slug: child.slug,
          sku: child.sku,
        });
        matchedChildren++;
      } else {
        children.push({
          name: childName,
          unmatched: true,
        });
        unmatchedChildren++;
      }
    }
    
    if (children.length > 0) {
      groups.push({
        parent: {
          id: parent.id,
          name: parent.name,
          slug: parent.slug,
          categories: parent.categories,
        },
        children,
      });
    }
  }
  
  console.log(`✅ Matched ${matchedChildren} children`);
  console.log(`⚠️  Unmatched ${unmatchedChildren} children\n`);
  
  // Build category hierarchy
  const categoryMap = new Map();
  for (const product of products) {
    if (!product.categories) continue;
    
    // Categories are in format: "Parent > Child > Grandchild"
    const cats = product.categories.split(',').map(c => c.trim());
    for (const cat of cats) {
      const path = cat.split('>').map(s => s.trim().replace(/&amp;/g, '&'));
      const leafCategory = path[path.length - 1];
      
      if (!categoryMap.has(leafCategory)) {
        categoryMap.set(leafCategory, {
          name: leafCategory,
          path: path,
          products: [],
        });
      }
      categoryMap.get(leafCategory).products.push({
        id: product.id,
        name: product.name,
        slug: product.slug,
      });
    }
  }
  
  // Build product -> categories lookup
  const productCategories = {};
  for (const product of products) {
    if (!product.categories) continue;
    
    const slug = product.slug || slugify(product.name);
    const cats = product.categories.split(',').map(c => {
      const path = c.trim().split('>').map(s => s.trim().replace(/&amp;/g, '&'));
      return path[path.length - 1]; // Get leaf category
    });
    
    productCategories[slug] = cats;
  }
  
  // Build slug -> parent mapping for Shopify handles
  const slugToParent = {};
  const parentGroups = {};
  
  for (const group of groups) {
    const parentSlug = group.parent.slug || slugify(group.parent.name);
    parentGroups[parentSlug] = {
      name: group.parent.name,
      categories: group.parent.categories,
      childSlugs: group.children
        .filter(c => !c.unmatched)
        .map(c => c.slug || slugify(c.name)),
    };
    
    for (const child of group.children) {
      if (!child.unmatched) {
        const childSlug = child.slug || slugify(child.name);
        slugToParent[childSlug] = parentSlug;
      }
    }
  }
  
  // Output structure
  const output = {
    generated: new Date().toISOString(),
    stats: {
      totalProducts: products.length,
      groupedParents: groupedProducts.length,
      totalGroups: groups.length,
      matchedChildren,
      unmatchedChildren,
      uniqueCategories: categoryMap.size,
    },
    groups,
    parentGroups,
    slugToParent,
    productCategories,
    categories: Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      path: data.path,
      productCount: data.products.length,
    })),
  };
  
  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${OUTPUT_FILE}\n`);
  
  // Show sample groups
  console.log('📋 Sample grouped products:');
  for (const group of groups.slice(0, 5)) {
    console.log(`\n  PARENT: ${group.parent.name}`);
    console.log(`  Categories: ${group.parent.categories}`);
    console.log(`  Children (${group.children.length}):`);
    for (const child of group.children.slice(0, 4)) {
      if (child.unmatched) {
        console.log(`    ⚠️  ${child.name} (not found)`);
      } else {
        console.log(`    ✓ ${child.name}`);
      }
    }
    if (group.children.length > 4) {
      console.log(`    ... and ${group.children.length - 4} more`);
    }
  }
  
  // Show top categories
  console.log('\n\n📁 Top categories by product count:');
  const sortedCats = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].products.length - a[1].products.length)
    .slice(0, 15);
  
  for (const [name, data] of sortedCats) {
    console.log(`  ${data.products.length.toString().padStart(4)} - ${name}`);
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
