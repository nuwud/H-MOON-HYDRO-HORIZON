import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeHydroProduct } from '../scraping/exampleScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const url = process.env.SCRAPE_DEMO_URL;
  if (!url) {
    console.error('[scrape:demo] SCRAPE_DEMO_URL is not set in .env');
    process.exit(1);
  }

  console.log(`[scrape:demo] Scraping: ${url}`);
  const scraped = await scrapeHydroProduct(url);

  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const safeName = scraped.core.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scraped-product';

  const outPath = path.join(dataDir, `scraped_${safeName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(scraped, null, 2), 'utf-8');

  console.log(`[scrape:demo] Wrote scraped data to ${outPath}`);
}

main().catch((err) => {
  console.error('[scrape:demo] Unhandled error:', err);
  process.exit(1);
});
