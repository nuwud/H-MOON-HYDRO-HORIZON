import 'dotenv/config';
import { demoConnection } from './shopify/client.js';

async function main() {
  console.log('HMoonHydro Product Pipeline Seed (Enhanced)');
  await demoConnection();
}

main().catch((err) => {
  console.error('[index] Unhandled error:', err);
  process.exit(1);
});
