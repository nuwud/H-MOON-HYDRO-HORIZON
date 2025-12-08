import type { ShopifyProduct, ProductHealthScore } from '../types/Product.js';
import { PRODUCT_RULES } from '../config/productRules.js';

export function computeProductHealth(product: ShopifyProduct): ProductHealthScore {
  const issues: string[] = [];
  let score = 100;

  const words = product.descriptionHtml
    ? product.descriptionHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean)
    : [];

  if (!product.descriptionHtml || words.length < PRODUCT_RULES.minDescriptionWords) {
    issues.push(`Description too short (${words.length} words)`);
    score -= 25;
  }

  const imageCount = product.imagesCount ?? 0;
  if (imageCount < PRODUCT_RULES.minImages) {
    issues.push(`Not enough images (${imageCount}/${PRODUCT_RULES.minImages})`);
    score -= 20;
  }

  const tagsCount = product.tags?.length ?? 0;
  if (PRODUCT_RULES.requireTags && tagsCount === 0) {
    issues.push('No tags assigned');
    score -= 20;
  }

  if (PRODUCT_RULES.requireSeo && !product.hasSeo) {
    issues.push('Missing SEO title/description');
    score -= 20;
  }

  if (!product.productType) {
    issues.push('Missing product type');
    score -= 10;
  }

  if (!product.vendor) {
    issues.push('Missing vendor');
    score -= 5;
  }

  if (score < 0) score = 0;

  return {
    productId: product.id,
    handle: product.handle,
    title: product.title,
    score,
    issues,
  };
}
