import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ShopifyProduct } from '../types/Product.js';
import { computeProductHealth } from '../audit/computeProductHealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const dataDir = path.resolve(__dirname, '../../data');
  const inPath = path.join(dataDir, 'products_raw.json');

  if (!fs.existsSync(inPath)) {
    console.error('[score] products_raw.json not found. Run `npm run sync:pull` first.');
    process.exit(1);
  }

  const raw = fs.readFileSync(inPath, 'utf-8');
  const products: ShopifyProduct[] = JSON.parse(raw);

  console.log(`[score] Scoring ${products.length} products...`);

  const scores = products.map(computeProductHealth);

  scores.sort((a, b) => a.score - b.score);

  const outPath = path.join(dataDir, 'product_health_scores.json');
  fs.writeFileSync(outPath, JSON.stringify(scores, null, 2), 'utf-8');

  const worst = scores.slice(0, 10);
  console.log('[score] 10 lowest scoring products:');
  for (const s of worst) {
    console.log(`- (${s.score}) ${s.title} [${s.handle}] -> ${s.issues.join('; ')}`);
  }

  console.log(`[score] Wrote full scores to ${outPath}`);
}

main().catch((err) => {
  console.error('[score] Unhandled error:', err);
  process.exit(1);
});
