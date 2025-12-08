import 'dotenv/config';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import type { ScrapedCompetitorProduct } from './types.js';

/**
 * Very lightweight, domain-agnostic scraper that:
 * - loads a page
 * - grabs a best-guess title, description, price text, and images
 * - packs them into the ScrapedCompetitorProduct schema
 *
 * This is intentionally simple so you can:
 * - clone it per competitor domain
 * - ask GitHub Copilot to specialize selectors for each site
 */
export async function scrapeHydroProduct(url: string): Promise<ScrapedCompetitorProduct> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`[scrapeHydroProduct] HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    'Unknown Title';

  const metaDesc = $('meta[name="description"]').attr('content')?.trim();
  const mainDesc =
    $('div.product-description, .product-description, #description')
      .first()
      .html() || '';

  // Very rough price detection (you will improve this per site)
  const priceText =
    $('[itemprop="price"], .price, .product-price')
      .first()
      .text()
      .replace(/[^0-9.,]/g, '')
      .trim() || undefined;
  const price = priceText ? Number(priceText.replace(',', '')) || undefined : undefined;

  // Collect some images
  const imageUrls: string[] = [];
  $('img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src');
    if (src && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  });

  const paragraphs: string[] = [];
  $('p').each((_, p) => {
    const txt = $(p).text().trim();
    if (txt.length > 40) {
      paragraphs.push(txt);
    }
  });

  const sourceDomain = new URL(url).hostname;

  const scraped: ScrapedCompetitorProduct = {
    sourceDomain,
    url,
    core: {
      title,
      // brand, sku, mpn, upc, availability, etc. can be filled out
      // in domain-specific scrapers or with AI help later
      price,
      compareAtPrice: undefined,
      currency: undefined,
      breadcrumbs: [],
      categoryPath: [],
      variantOptions: {},
    },
    content: {
      shortDescription: metaDesc,
      longDescriptionHtml: mainDesc || undefined,
      featureBullets: [],
      benefitBullets: [],
    },
    specs: {
      generic: {},
      nutrient: {},
      lighting: {},
      environment: {},
      media: {},
      container: {},
      pump: {},
      meter: {},
      system: {},
    },
    usageAndSafety: {},
    seoAndUx: {
      metaTitle: title,
      metaDescription: metaDesc,
      h1: $('h1').first().text().trim() || undefined,
      h2s: $('h2')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      featureBullets: [],
      benefitBullets: [],
      faqs: [],
      ratingAverage: undefined,
      ratingCount: undefined,
    },
    images: {
      main: imageUrls[0],
      gallery: imageUrls,
      labelCloseups: [],
      lifestyle: [],
      diagrams: [],
    },
    rawBlocks: {
      tablesHtml: $('table')
        .map((_, t) => $.html(t))
        .get(),
      bulletLists: $('ul, ol')
        .toArray()
        .map((list) =>
          $(list)
            .find('li')
            .map((__, li) => $(li).text().trim())
            .get()
            .filter(Boolean),
        ),
      paragraphs,
    },
  };

  return scraped;
}
