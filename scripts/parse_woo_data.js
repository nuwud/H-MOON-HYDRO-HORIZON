/**
 * parse_woo_data.js
 * 
 * Parse the December 2025 WooCommerce export to extract:
 * - Product categories with hierarchy
 * - Grouped products (parent + children relationships)
 * - Brand information
 * 
 * Input: hmoonhydro.com/data/Products-Export-2025-Dec-31-180709.csv
 *        hmoonhydro.com/data/Product-Categories-Export-2025-Dec-31-180812.csv
 * Output: outputs/woo_groups.json (enhanced)
 */

const fs = require('fs');
const path = require('path');

// Get workspace root
const WORKSPACE = path.resolve(__dirname, '..');
const PRODUCTS_CSV = path.join(WORKSPACE, 'hmoonhydro.com/data/Products-Export-2025-Dec-31-180709.csv');
const CATEGORIES_CSV = path.join(WORKSPACE, 'hmoonhydro.com/data/Product-Categories-Export-2025-Dec-31-180812.csv');
const OUTPUT_FILE = path.join(WORKSPACE, 'outputs/woo_groups.json');

/**
 * Simple CSV parser that handles quoted fields with commas
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const parseRow = (line) => {
    const fields = [];
    let field = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field);
    return fields;
  };
  
  // Parse header
  const headers = parseRow(lines[0]);
  const rows = [];
  
  // Handle multi-line fields
  let currentRow = '';
  let inQuotes = false;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line && !inQuotes) continue;
    
    currentRow += (currentRow ? '\n' : '') + line;
    
    // Count quotes to determine if we're inside a quoted field
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
    }
    
    if (!inQuotes) {
      const fields = parseRow(currentRow);
      if (fields.length >= headers.length * 0.5) { // Allow some missing fields
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = fields[idx] || '';
        });
        rows.push(row);
      }
      currentRow = '';
    }
  }
  
  return rows;
}

/**
 * Generate handle/slug from product name
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function main() {
  console.log('📊 Parsing WooCommerce December 2025 exports...\n');
  
  // Read products CSV
  console.log('📦 Reading products CSV...');
  const productsContent = fs.readFileSync(PRODUCTS_CSV, 'utf-8');
  const products = parseCSV(productsContent);
  console.log(`   Found ${products.length} product rows`);
  
  // Read categories CSV
  console.log('📁 Reading categories CSV...');
  const categoriesContent = fs.readFileSync(CATEGORIES_CSV, 'utf-8');
  const categories = parseCSV(categoriesContent);
  console.log(`   Found ${categories.length} category rows`);
  
  // Build category lookup (ID -> info)
  const categoryById = {};
  const categoryBySlug = {};
  
  categories.forEach(cat => {
    const id = cat.ID;
    const name = cat.Name;
    const slug = cat.Slug;
    const parentId = cat['Parent ID'];
    const parentName = cat['Parent Name'];
    const parentSlug = cat['Parent Slug'];
    const imageUrl = cat['Image URL'];
    
    categoryById[id] = {
      id,
      name,
      slug,
      parentId: parentId || null,
      parentName: parentName || null,
      parentSlug: parentSlug || null,
      imageUrl: imageUrl || null,
      fullPath: parentName ? `${parentName} > ${name}` : name
    };
    
    categoryBySlug[slug] = categoryById[id];
  });
  
  console.log(`   Built lookup for ${Object.keys(categoryById).length} categories\n`);
  
  // Process products
  const parentGroups = {};      // parentSlug -> { name, categories, brand, childSlugs, imageUrl }
  const slugToParent = {};      // childSlug -> parentSlug
  const productCategories = {}; // slug -> [categories]
  const productBrands = {};     // slug -> brand
  const productImages = {};     // slug -> imageUrl
  const shopifyIds = {};        // slug -> { productId, variantId }
  
  let groupedCount = 0;
  let simpleCount = 0;
  
  products.forEach(p => {
    const slug = p.Slug;
    const name = p['Product Name'];
    const type = p.Type; // 'grouped', 'simple', 'variable'
    const groupedProducts = p['Grouped products'] || '';
    const categoryPath = p['Product categories'] || '';
    const brand = p.Brands || '';
    const imageUrl = p['Image URL'] || '';
    const shopifyData = p['_w2s_shopify_data'] || '';
    
    if (!slug || !name) return;
    
    // Parse categories (format: "Parent > Child" or just "Category")
    const catParts = categoryPath.split(' > ').map(s => s.trim()).filter(Boolean);
    productCategories[slug] = catParts;
    
    // Store brand
    if (brand && brand !== 'General Hydroponics' && brand !== 'H Moon Hydro') {
      productBrands[slug] = brand;
    }
    
    // Store image
    if (imageUrl) {
      productImages[slug] = imageUrl;
    }
    
    // Parse Shopify IDs if present
    if (shopifyData) {
      try {
        const data = JSON.parse(shopifyData);
        const shopifyInfo = data['h-moon-hydro.myshopify.com'];
        if (shopifyInfo) {
          shopifyIds[slug] = {
            productId: shopifyInfo['_w2s_shopify_product_id'],
            variantId: shopifyInfo['_w2s_shopify_variant_id']
          };
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
    // Handle grouped products
    if (type === 'grouped' && groupedProducts) {
      groupedCount++;
      
      // Parse children (delimiter is |~|)
      const children = groupedProducts.split('|~|').map(s => s.trim()).filter(Boolean);
      const childSlugs = children.map(childName => toSlug(childName));
      
      parentGroups[slug] = {
        name,
        categories: catParts,
        brand: brand || null,
        childSlugs,
        childNames: children,
        imageUrl: imageUrl || null
      };
      
      // Map children to parent
      childSlugs.forEach(childSlug => {
        slugToParent[childSlug] = slug;
      });
    } else {
      simpleCount++;
    }
  });
  
  console.log(`📊 Product Analysis:`);
  console.log(`   Grouped products (parents): ${groupedCount}`);
  console.log(`   Simple/variable products: ${simpleCount}`);
  console.log(`   Children mapped: ${Object.keys(slugToParent).length}`);
  console.log(`   Products with categories: ${Object.keys(productCategories).length}`);
  console.log(`   Products with brands: ${Object.keys(productBrands).length}`);
  console.log(`   Products with Shopify IDs: ${Object.keys(shopifyIds).length}`);
  
  // Build category hierarchy for reference
  const categoryHierarchy = {};
  Object.values(categoryById).forEach(cat => {
    if (!cat.parentId) {
      // Top-level category
      if (!categoryHierarchy[cat.name]) {
        categoryHierarchy[cat.name] = {
          slug: cat.slug,
          children: []
        };
      }
    } else {
      // Child category
      const parentName = cat.parentName;
      if (!categoryHierarchy[parentName]) {
        categoryHierarchy[parentName] = {
          slug: cat.parentSlug,
          children: []
        };
      }
      categoryHierarchy[parentName].children.push({
        name: cat.name,
        slug: cat.slug
      });
    }
  });
  
  // Output the enhanced data
  const output = {
    generated: new Date().toISOString(),
    source: 'Products-Export-2025-Dec-31-180709.csv',
    stats: {
      totalProducts: products.length,
      groupedParents: groupedCount,
      childrenMapped: Object.keys(slugToParent).length,
      productsWithCategories: Object.keys(productCategories).length,
      productsWithBrands: Object.keys(productBrands).length,
      productsWithShopifyIds: Object.keys(shopifyIds).length,
      categoryCount: Object.keys(categoryById).length
    },
    parentGroups,
    slugToParent,
    productCategories,
    productBrands,
    productImages,
    shopifyIds,
    categoryHierarchy
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote enhanced data to: ${OUTPUT_FILE}`);
  
  // Show sample parent groups
  console.log('\n📦 Sample Parent Groups:');
  Object.entries(parentGroups).slice(0, 5).forEach(([slug, info]) => {
    console.log(`   ${info.name} (${slug})`);
    console.log(`      Category: ${info.categories.join(' > ')}`);
    console.log(`      Children: ${info.childSlugs.join(', ')}`);
  });
  
  // Show category hierarchy
  console.log('\n📁 Top-Level Categories:');
  Object.entries(categoryHierarchy)
    .filter(([name, info]) => info.children.length > 0)
    .slice(0, 10)
    .forEach(([name, info]) => {
      console.log(`   ${name} (${info.children.length} subcategories)`);
    });
}

main().catch(console.error);
