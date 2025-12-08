import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProducts } from '../shopify/fetchProducts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const limitEnv = process.env.HMOON_PIPELINE_LIMIT;
  const limit = limitEnv ? Number(limitEnv) : 250;

  console.log(`[sync:pull] Fetching up to ${limit} products from Shopify...`);
  const products = await fetchAllProducts(limit);
  console.log(`[sync:pull] Retrieved ${products.length} products.`);

  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outPath = path.join(dataDir, 'products_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`[sync:pull] Wrote ${products.length} products to ${outPath}`);
}

main().catch((err) => {
  console.error('[sync:pull] Unhandled error:', err);
  process.exit(1);
});
