/**
 * applyShopifyCollections.ts
 * 
 * Creates/updates Smart Collections in Shopify from shopify_collections.json
 * 
 * Usage:
 *   npx tsx src/cli/applyShopifyCollections.ts --dry-run           # Preview what would be created/updated
 *   npx tsx src/cli/applyShopifyCollections.ts --confirm           # Actually create/update collections
 *   npx tsx src/cli/applyShopifyCollections.ts --only category     # Only process category collections
 *   npx tsx src/cli/applyShopifyCollections.ts --only brand        # Only process brand collections
 *   npx tsx src/cli/applyShopifyCollections.ts --limit 10          # Process max 10 collections
 * 
 * Idempotent: finds existing collections by title, updates if exists, creates if missing
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadShopifyConfig,
  executeGraphQL,
  type ShopifyConfig,
} from '../utils/shopifyAdminGraphql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = resolve(__dirname, '../../../CSVs');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CollectionRule {
  column: string;
  relation: string;
  condition: string;
}

interface CollectionDefinition {
  title: string;
  handle: string;
  body_html: string;
  sort_order: string;
  published: boolean;
  disjunctive: boolean;
  rules: CollectionRule[];
  seo?: {
    title?: string;
    description?: string;
  };
}

interface ApplyOptions {
  dryRun: boolean;
  confirm: boolean;
  only: 'all' | 'category' | 'brand' | 'special';
  limit: number;
}

interface ApplyLogEntry {
  timestamp: string;
  title: string;
  handle: string;
  action: 'create' | 'update' | 'skip' | 'dry_run';
  status: 'success' | 'failed' | 'dry_run';
  shopify_id: string;
  error: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Queries/Mutations
// ─────────────────────────────────────────────────────────────────────────────

const FIND_COLLECTION_BY_TITLE = `
  query FindCollectionByTitle($query: String!) {
    collections(first: 1, query: $query) {
      edges {
        node {
          id
          title
          handle
          ruleSet {
            appliedDisjunctively
            rules {
              column
              relation
              condition
            }
          }
        }
      }
    }
  }
`;

const CREATE_SMART_COLLECTION = `
  mutation CreateSmartCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_COLLECTION = `
  mutation UpdateCollection($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): ApplyOptions {
  const args = process.argv.slice(2);
  const options: ApplyOptions = {
    dryRun: true, // Default to dry-run
    confirm: false,
    only: 'all',
    limit: Infinity,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') {
      options.confirm = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
      options.confirm = false;
    } else if (arg === '--only' && args[i + 1]) {
      const val = args[i + 1] as 'category' | 'brand' | 'special';
      if (['category', 'brand', 'special', 'all'].includes(val)) {
        options.only = val;
      }
      i++;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx tsx src/cli/applyShopifyCollections.ts [options]

Options:
  --dry-run         Preview what would be created/updated (default)
  --confirm         Actually create/update collections
  --only <type>     Only process: category, brand, special, or all
  --limit <n>       Process max N collections
  --help            Show this help

Examples:
  npx tsx src/cli/applyShopifyCollections.ts --dry-run
  npx tsx src/cli/applyShopifyCollections.ts --confirm --only category
  npx tsx src/cli/applyShopifyCollections.ts --confirm --limit 5
`);
      process.exit(0);
    }
  }

  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapColumnToShopify(column: string): string {
  // Map our JSON column names to Shopify's API column names
  const mapping: Record<string, string> = {
    'type': 'PRODUCT_TYPE',
    'vendor': 'VENDOR',
    'tag': 'TAG',
    'title': 'TITLE',
    'variant_price': 'VARIANT_PRICE',
    'variant_compare_at_price': 'VARIANT_COMPARE_AT_PRICE',
    'variant_weight': 'VARIANT_WEIGHT',
    'variant_inventory': 'VARIANT_INVENTORY',
    'variant_title': 'VARIANT_TITLE',
  };
  return mapping[column.toLowerCase()] || column.toUpperCase();
}

function mapRelationToShopify(relation: string): string {
  const mapping: Record<string, string> = {
    'equals': 'EQUALS',
    'not_equals': 'NOT_EQUALS',
    'contains': 'CONTAINS',
    'not_contains': 'NOT_CONTAINS',
    'starts_with': 'STARTS_WITH',
    'ends_with': 'ENDS_WITH',
    'greater_than': 'GREATER_THAN',
    'less_than': 'LESS_THAN',
  };
  return mapping[relation.toLowerCase()] || relation.toUpperCase();
}

function filterCollections(collections: CollectionDefinition[], only: string): CollectionDefinition[] {
  if (only === 'all') return collections;
  
  return collections.filter(c => {
    const handle = c.handle.toLowerCase();
    if (only === 'category') return handle.startsWith('category-');
    if (only === 'brand') return handle.startsWith('brand-');
    if (only === 'special') return !handle.startsWith('category-') && !handle.startsWith('brand-');
    return true;
  });
}

function initLogFile(): void {
  const logPath = resolve(CSV_DIR, 'collections_apply_log.csv');
  if (!existsSync(logPath)) {
    writeFileSync(logPath, 'timestamp,title,handle,action,status,shopify_id,error\n');
  }
}

function logEntry(entry: ApplyLogEntry): void {
  const logPath = resolve(CSV_DIR, 'collections_apply_log.csv');
  const line = [
    entry.timestamp,
    `"${entry.title.replace(/"/g, '""')}"`,
    entry.handle,
    entry.action,
    entry.status,
    entry.shopify_id,
    `"${entry.error.replace(/"/g, '""')}"`,
  ].join(',');
  appendFileSync(logPath, line + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           APPLY SHOPIFY COLLECTIONS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const options = parseArgs();

  // Load config
  let config: ShopifyConfig;
  try {
    config = loadShopifyConfig();
  } catch (err) {
    console.error(`❌ Configuration error: ${(err as Error).message}`);
    console.log('\nMake sure you have set these environment variables:');
    console.log('  SHOPIFY_DOMAIN=your-store.myshopify.com');
    console.log('  SHOPIFY_ADMIN_TOKEN=shpat_xxxxx\n');
    process.exit(1);
  }

  console.log(`📍 Store: ${config.shopDomain}`);
  console.log(`📋 Filter: ${options.only}`);
  console.log(`🔢 Limit: ${options.limit === Infinity ? 'unlimited' : options.limit}`);
  console.log(`🔒 Mode: ${options.dryRun ? 'DRY RUN (safe preview)' : '⚠️  LIVE (will create/update)'}`);
  console.log('');

  // Load collections JSON
  const collectionsPath = resolve(CSV_DIR, 'shopify_collections.json');
  if (!existsSync(collectionsPath)) {
    console.error(`❌ Collections file not found: ${collectionsPath}`);
    console.log('Run the pipeline first: npx tsx src/cli/runFullImportPipeline.ts');
    process.exit(1);
  }

  const allCollections: CollectionDefinition[] = JSON.parse(readFileSync(collectionsPath, 'utf-8'));
  console.log(`📁 Loaded ${allCollections.length} collection definitions`);

  // Filter by type
  let collections = filterCollections(allCollections, options.only);
  console.log(`📋 After filter (${options.only}): ${collections.length} collections`);

  // Apply limit
  if (options.limit < collections.length) {
    collections = collections.slice(0, options.limit);
    console.log(`🔢 After limit: ${collections.length} collections`);
  }

  console.log('');

  // Initialize log
  if (!options.dryRun) {
    initLogFile();
  }

  // Process collections
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < collections.length; i++) {
    const coll = collections[i];
    const progress = `[${i + 1}/${collections.length}]`;

    // Check if collection exists
    const searchQuery = `title:"${coll.title}"`;
    const searchResult = await executeGraphQL<{
      collections: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
          };
        }>;
      };
    }>(config, FIND_COLLECTION_BY_TITLE, { query: searchQuery });

    const existing = searchResult.data?.collections?.edges?.[0]?.node;

    if (options.dryRun) {
      if (existing) {
        console.log(`   ${progress} [UPDATE] ${coll.title} (exists: ${existing.id})`);
        updated++;
      } else {
        console.log(`   ${progress} [CREATE] ${coll.title}`);
        created++;
      }
      continue;
    }

    // Build collection input
    const ruleSet = {
      appliedDisjunctively: coll.disjunctive,
      rules: coll.rules.map(r => ({
        column: mapColumnToShopify(r.column),
        relation: mapRelationToShopify(r.relation),
        condition: r.condition,
      })),
    };

    const input: Record<string, unknown> = {
      title: coll.title,
      handle: coll.handle,
      descriptionHtml: coll.body_html,
      ruleSet,
      sortOrder: coll.sort_order.toUpperCase().replace(/-/g, '_'),
    };

    if (coll.seo?.title || coll.seo?.description) {
      input.seo = {
        title: coll.seo.title || coll.title,
        description: coll.seo.description || '',
      };
    }

    try {
      if (existing) {
        // Update existing
        input.id = existing.id;
        const result = await executeGraphQL<{
          collectionUpdate: {
            collection: { id: string; title: string; handle: string } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(config, UPDATE_COLLECTION, { input });

        if (result.data?.collectionUpdate?.userErrors?.length) {
          const err = result.data.collectionUpdate.userErrors[0].message;
          console.log(`   ${progress} ❌ UPDATE FAILED: ${coll.title} - ${err}`);
          logEntry({
            timestamp: new Date().toISOString(),
            title: coll.title,
            handle: coll.handle,
            action: 'update',
            status: 'failed',
            shopify_id: existing.id,
            error: err,
          });
          failed++;
        } else {
          console.log(`   ${progress} ✓ Updated: ${coll.title}`);
          logEntry({
            timestamp: new Date().toISOString(),
            title: coll.title,
            handle: coll.handle,
            action: 'update',
            status: 'success',
            shopify_id: existing.id,
            error: '',
          });
          updated++;
        }
      } else {
        // Create new
        const result = await executeGraphQL<{
          collectionCreate: {
            collection: { id: string; title: string; handle: string } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(config, CREATE_SMART_COLLECTION, { input });

        if (result.data?.collectionCreate?.userErrors?.length) {
          const err = result.data.collectionCreate.userErrors[0].message;
          console.log(`   ${progress} ❌ CREATE FAILED: ${coll.title} - ${err}`);
          logEntry({
            timestamp: new Date().toISOString(),
            title: coll.title,
            handle: coll.handle,
            action: 'create',
            status: 'failed',
            shopify_id: '',
            error: err,
          });
          failed++;
        } else {
          const newId = result.data?.collectionCreate?.collection?.id || '';
          console.log(`   ${progress} ✓ Created: ${coll.title} (${newId})`);
          logEntry({
            timestamp: new Date().toISOString(),
            title: coll.title,
            handle: coll.handle,
            action: 'create',
            status: 'success',
            shopify_id: newId,
            error: '',
          });
          created++;
        }
      }

      // Rate limit protection
      await sleep(300);
    } catch (err) {
      const errMsg = (err as Error).message;
      console.log(`   ${progress} ❌ ERROR: ${coll.title} - ${errMsg}`);
      logEntry({
        timestamp: new Date().toISOString(),
        title: coll.title,
        handle: coll.handle,
        action: existing ? 'update' : 'create',
        status: 'failed',
        shopify_id: existing?.id || '',
        error: errMsg,
      });
      failed++;
    }
  }

  // Summary
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('📊 APPLY SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');

  if (options.dryRun) {
    console.log('🔒 DRY RUN - No actual changes made');
    console.log('');
    console.log(`   📁 Would CREATE: ${created}`);
    console.log(`   ✏️  Would UPDATE: ${updated}`);
    console.log('');
    console.log('💡 To apply changes, run with --confirm flag');
  } else {
    console.log(`   📁 Created: ${created}`);
    console.log(`   ✏️  Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('');
    console.log(`📝 Log saved: CSVs/collections_apply_log.csv`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
