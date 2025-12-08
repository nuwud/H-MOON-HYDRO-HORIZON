export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status?: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  descriptionHtml?: string;
  imagesCount?: number;
  hasSeo?: boolean;
}

export interface ProductHealthScore {
  productId: string;
  handle: string;
  title: string;
  score: number;
  issues: string[];
}
