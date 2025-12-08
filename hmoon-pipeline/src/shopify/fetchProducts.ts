import { shopifyGraphQL } from './client.js';
import type { ShopifyProduct } from '../types/Product.js';

interface ShopifyProductEdge {
  node: any;
  cursor: string;
}

interface ProductsResponse {
  products: {
    edges: ShopifyProductEdge[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export async function fetchAllProducts(limit = 250): Promise<ShopifyProduct[]> {
  const first = Math.min(limit, 250);
  let hasNextPage = true;
  let after: string | null = null;
  const products: ShopifyProduct[] = [];

  const query = `
    query PipelineProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            handle
            title
            status
            productType
            vendor
            tags
            bodyHtml
            images(first: 10) {
              edges { node { id } }
            }
            seo {
              title
              description
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (hasNextPage && products.length < limit) {
    const data: ProductsResponse = await shopifyGraphQL<ProductsResponse>(query, { first, after });
    const edges = data.products.edges;

    for (const { node } of edges) {
      const descriptionHtml: string | undefined = (node.bodyHtml as string | undefined) ?? undefined;
      const words = descriptionHtml
        ? descriptionHtml
            .replace(/<[^>]+>/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
        : [];
      const hasSeo = Boolean(node.seo?.title || node.seo?.description);

      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        productType: node.productType ?? undefined,
        vendor: node.vendor ?? undefined,
        tags: node.tags ?? [],
        descriptionHtml,
        imagesCount: node.images?.edges?.length ?? 0,
        hasSeo,
      });
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor;
  }

  return products;
}
