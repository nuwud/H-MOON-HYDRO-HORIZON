/**
 * shopifyAdminGraphql.ts
 * 
 * Minimal Shopify Admin GraphQL client with:
 * - Rate limit handling
 * - Automatic retries with exponential backoff
 * - Error logging
 * 
 * Loads from .env file automatically
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from hmoon-pipeline directory
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface ShopifyConfig {
  shopDomain: string;
  adminToken: string;
  apiVersion: string;
}

const DEFAULT_API_VERSION = '2024-01';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Load Shopify config from environment variables
 * Supports both SHOPIFY_DOMAIN and SHOPIFY_SHOP_DOMAIN
 */
export function loadShopifyConfig(): ShopifyConfig {
  // Support both naming conventions
  const shopDomain = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN;
  const adminToken = process.env.SHOPIFY_ADMIN_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION;

  if (!shopDomain) {
    throw new Error('Missing SHOPIFY_DOMAIN environment variable');
  }
  if (!adminToken) {
    throw new Error('Missing SHOPIFY_ADMIN_TOKEN environment variable');
  }

  // Normalize domain (remove https://, trailing slashes)
  const normalizedDomain = shopDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  return {
    shopDomain: normalizedDomain,
    adminToken,
    apiVersion,
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a GraphQL query/mutation with retry logic
 */
export async function executeGraphQL<T = unknown>(
  config: ShopifyConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const url = `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.adminToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Rate limited. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        continue;
      }

      // Handle server errors (5xx)
      if (response.status >= 500) {
        const waitMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`⚠️  Server error ${response.status}. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        continue;
      }

      // Parse response
      const json: GraphQLResponse<T> = await response.json();

      // Check for throttling in GraphQL extensions
      if (json.extensions?.cost?.throttleStatus) {
        const { currentlyAvailable, restoreRate } = json.extensions.cost.throttleStatus;
        if (currentlyAvailable < 100) {
          const waitMs = Math.ceil((100 - currentlyAvailable) / restoreRate * 1000);
          console.log(`⏳ Low query budget (${currentlyAvailable}). Waiting ${waitMs}ms...`);
          await sleep(waitMs);
        }
      }

      // Check for THROTTLED errors
      if (json.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
        const waitMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Throttled by GraphQL. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        continue;
      }

      return json;
    } catch (error) {
      lastError = error as Error;
      const waitMs = BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(`⚠️  Network error: ${lastError.message}. Waiting ${waitMs}ms before retry...`);
      await sleep(waitMs);
    }
  }

  throw new Error(`GraphQL request failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Paginate through a GraphQL connection
 */
export async function* paginateGraphQL<T>(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown>,
  getConnection: (data: unknown) => { edges: Array<{ node: T; cursor: string }>; pageInfo: { hasNextPage: boolean } }
): AsyncGenerator<T, void, unknown> {
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await executeGraphQL(
      config,
      query,
      { ...variables, cursor }
    );

    if (response.errors?.length) {
      throw new Error(`GraphQL errors: ${response.errors.map(e => e.message).join(', ')}`);
    }

    if (!response.data) {
      throw new Error('No data in GraphQL response');
    }

    const connection = getConnection(response.data);
    
    for (const edge of connection.edges) {
      yield edge.node;
      cursor = edge.cursor;
    }

    hasNextPage = connection.pageInfo.hasNextPage;
  }
}
