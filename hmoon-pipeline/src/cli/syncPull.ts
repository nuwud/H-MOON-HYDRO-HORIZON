import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProducts } from '../shopify/fetchProducts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🔄 Shopify Admin API Sync');
  console.log('=========================\n');

  // Check for required env vars
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!process.env.SHOPIFY_DOMAIN || !token || token === 'replace_me') {
    console.error('❌ Missing or invalid Shopify API credentials!');
    console.error('');
    console.error('To set up Shopify Admin API access:');
    console.error('');
    console.error('1. Go to: https://admin.shopify.com/store/h-moon-hydro/settings/apps/development');
    console.error('2. Click "Create an app" (or select existing)');
    console.error('3. Configure Admin API scopes: read_products');
    console.error('4. Install the app and copy the Admin API access token');
    console.error('5. Edit .env and set:');
    console.error('   SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxxxxx');
    console.error('');
    process.exit(1);
  }

  // Default to fetching all products (use a high limit)
  const limitEnv = process.env.HMOON_PIPELINE_LIMIT;
  const limit = limitEnv ? Number(limitEnv) : 10000;

  console.log(`📡 Fetching products from ${process.env.SHOPIFY_DOMAIN}...`);
  console.log(`   API Version: ${process.env.SHOPIFY_API_VERSION || '2024-10'}`);
  console.log(`   Limit: ${limit === 10000 ? 'all' : limit}\n`);

  const startTime = Date.now();
  const products = await fetchAllProducts(limit);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✅ Retrieved ${products.length} products in ${elapsed}s\n`);

  // Write to data/products_raw.json
  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outPath = path.join(dataDir, 'products_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`📁 Saved to: data/products_raw.json`);

  // Quick field coverage report
  const withDesc = products.filter(p => p.descriptionHtml && p.descriptionHtml.length > 10).length;
  const withTags = products.filter(p => p.tags && p.tags.length > 0).length;
  const withImages = products.filter(p => p.imagesCount && p.imagesCount > 0).length;
  const withSeo = products.filter(p => p.hasSeo).length;

  console.log('\n📊 Field Coverage:');
  console.log(`   Description: ${withDesc}/${products.length} (${Math.round(withDesc/products.length*100)}%)`);
  console.log(`   Tags: ${withTags}/${products.length} (${Math.round(withTags/products.length*100)}%)`);
  console.log(`   Images: ${withImages}/${products.length} (${Math.round(withImages/products.length*100)}%)`);
  console.log(`   SEO: ${withSeo}/${products.length} (${Math.round(withSeo/products.length*100)}%)`);

  console.log('\n🎯 Next: Run "npm run score" to compute health scores');
}

main().catch((err) => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
