import 'dotenv/config';
import fetch from 'node-fetch';

const domain = process.env.SHOPIFY_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-10';

if (!domain) {
  console.warn('[shopify/client] SHOPIFY_DOMAIN is not set in .env');
}
if (!token) {
  console.warn('[shopify/client] SHOPIFY_ADMIN_TOKEN is not set in .env');
}

export async function shopifyGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  if (!domain || !token) {
    throw new Error('Shopify credentials are missing. Set SHOPIFY_DOMAIN and SHOPIFY_ADMIN_TOKEN in .env');
  }

  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[shopifyGraphQL] HTTP ${res.status} - ${text}`);
  }

  const json = await res.json() as any;
  if (json.errors) {
    console.error('[shopifyGraphQL] GraphQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error('Shopify GraphQL returned errors');
  }
  return json.data as T;
}

export async function demoConnection() {
  if (!domain || !token) {
    console.log('[demoConnection] Skipping Shopify test; missing env vars.');
    return;
  }

  const query = `
    query PipelineDemoProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            handle
            title
            status
            productType
            vendor
            tags
            images(first: 1) {
              edges { node { id } }
            }
            seo {
              title
              description
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL<{
      products: {
        edges: { node: any }[];
      };
    }>(query, { first: 5 });

    const products = data.products.edges.map((e) => e.node);
    console.log(`[demoConnection] Pulled ${products.length} products from Shopify:`);
    for (const p of products) {
      console.log(`- ${p.title} (${p.handle}) [${p.status}]`);
    }
  } catch (err) {
    console.error('[demoConnection] Failed to query Shopify:', err);
  }
}
