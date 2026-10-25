import { parse } from 'csv-parse/sync';
import { Product } from '../src/types';
import {
  getCategoryArtPath,
  getCategoryArtFamily,
  formatCategoryLabel,
  getOlistCategoryImage,
  OLIST_CATALOG_FEATURE,
} from '../src/utils/productPresentation';

export const OLIST_TO_INR_RATE = 18.81;
export { OLIST_CATALOG_FEATURE };
export const OLIST_TARGET_DATABASE = 'aura_payment_test';
const PRODUCT_ID_PATTERN = /^[a-f\d]{32}$/i;

export interface OlistProductRow {
  product_id: string;
  product_category_name: string;
}

export interface OlistOrderItemRow {
  product_id: string;
  price: string;
}

export interface OlistCategoryTranslationRow {
  product_category_name: string;
  product_category_name_english: string;
}

export type OlistCatalogProduct = Omit<Product, 'createdAt' | 'updatedAt'>;

export interface OlistImportCounts {
  sourceRecordCount: number;
  uniqueProductIds: number;
  productsWithUsableHistoricalPrices: number;
  duplicateProductRows: number;
  invalidProductIdRows: number;
  invalidHistoricalPriceRows: number;
  noUsableHistoricalPrice: number;
  fallbackArtwork: number;
  categoryPhotoProducts: number;
  missingArtwork: number;
  eligibleProducts: number;
}

export interface OlistProductPlan {
  products: OlistCatalogProduct[];
  counts: OlistImportCounts;
}

export const parseOlistCsv = <TRow extends Record<string, string>>(content: string): TRow[] =>
  parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as TRow[];

export const assertOlistTargetDatabase = (uri: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI is not a valid MongoDB connection URI.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('MONGODB_URI must use a MongoDB URI scheme.');
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
  } catch {
    throw new Error('The database path in MONGODB_URI is invalid.');
  }
  if (databaseName !== OLIST_TARGET_DATABASE) {
    throw new Error(`MONGODB_URI must target ${OLIST_TARGET_DATABASE}.`);
  }
};

export const buildOlistProductPlan = (
  productRows: OlistProductRow[],
  orderItemRows: OlistOrderItemRow[],
  translationRows: OlistCategoryTranslationRow[],
  imageExists: (image: string) => boolean,
): OlistProductPlan => {
  const sourceProducts = new Map<string, OlistProductRow>();
  const counts: OlistImportCounts = {
    sourceRecordCount: productRows.length,
    uniqueProductIds: 0,
    productsWithUsableHistoricalPrices: 0,
    duplicateProductRows: 0,
    invalidProductIdRows: 0,
    invalidHistoricalPriceRows: 0,
    noUsableHistoricalPrice: 0,
    fallbackArtwork: 0,
    categoryPhotoProducts: 0,
    missingArtwork: 0,
    eligibleProducts: 0,
  };

  for (const row of productRows) {
    const productId = row.product_id?.trim() || '';
    if (!PRODUCT_ID_PATTERN.test(productId)) {
      counts.invalidProductIdRows += 1;
      continue;
    }
    if (sourceProducts.has(productId)) {
      counts.duplicateProductRows += 1;
      continue;
    }
    sourceProducts.set(productId, row);
  }
  counts.uniqueProductIds = sourceProducts.size;

  const priceTotals = new Map<string, { total: number; count: number }>();
  for (const row of orderItemRows) {
    const productId = row.product_id?.trim() || '';
    if (!sourceProducts.has(productId)) continue;
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) {
      counts.invalidHistoricalPriceRows += 1;
      continue;
    }
    const aggregate = priceTotals.get(productId) || { total: 0, count: 0 };
    aggregate.total += price;
    aggregate.count += 1;
    priceTotals.set(productId, aggregate);
  }
  counts.productsWithUsableHistoricalPrices = [...priceTotals.keys()].length;

  const translations = new Map(
    translationRows
      .filter((row) => row.product_category_name?.trim() && row.product_category_name_english?.trim())
      .map((row) => [row.product_category_name.trim(), row.product_category_name_english.trim()]),
  );
  const products: OlistCatalogProduct[] = [];

  for (const [productId, source] of sourceProducts) {
    const prices = priceTotals.get(productId);
    if (!prices) {
      counts.noUsableHistoricalPrice += 1;
      continue;
    }

    const sourceCategory = source.product_category_name?.trim() || '';
    const translated = (sourceCategory && translations.get(sourceCategory)) || sourceCategory || 'General';
    const category = formatCategoryLabel(translated);
    const categoryImage = getOlistCategoryImage(translated);
    let image = categoryImage.path;
    if (!imageExists(image)) {
      image = getCategoryArtPath('General');
      if (!imageExists(image)) {
        counts.missingArtwork += 1;
        continue;
      }
    }
    if (categoryImage.sourceType === 'approved-photo' && image === categoryImage.path) counts.categoryPhotoProducts += 1;
    else counts.fallbackArtwork += 1;

    const averageHistoricalBrl = prices.total / prices.count;
    const price = Math.max(1, Math.round(averageHistoricalBrl * OLIST_TO_INR_RATE));
    if (!Number.isSafeInteger(price)) {
      counts.noUsableHistoricalPrice += 1;
      continue;
    }

    const sku = `OLIST-${productId.toUpperCase()}`;
    const family = getCategoryArtFamily(category);
    products.push({
      id: `prod-${sku.toLowerCase()}`,
      name: `Olist ${category} product ${productId.slice(0, 8).toUpperCase()}`,
      description: `A catalogue display entry for an Olist product in ${category}. The representative category image is not an original Olist product photo. Its INR price is an estimate converted from the average historical order-item price in BRL, not a current market price.`,
      price,
      category,
      image,
      stock: 0,
      sku,
      status: 'active',
      rating: 0,
      numReviews: 0,
      brand: 'Olist Historical Catalogue',
      features: [
        OLIST_CATALOG_FEATURE,
        'Representative category image; not an original Olist product photo',
        `Generated display title based on translated category (${family})`,
        `Historical BRL average converted to an INR estimate at ${OLIST_TO_INR_RATE} INR per BRL`,
      ],
    });
  }
  counts.eligibleProducts = products.length;
  return { products, counts };
};

export interface OlistImportSummary {
  importedProducts: number;
  updatedProducts: number;
}

export const applyOlistImportPlan = async (
  plan: OlistProductPlan,
  existingSkus: ReadonlySet<string>,
  apply: boolean,
  write: (products: OlistCatalogProduct[]) => Promise<OlistImportSummary>,
): Promise<OlistImportSummary> => {
  const planned = plan.products.reduce(
    (counts, product) => {
      if (existingSkus.has(product.sku)) counts.updatedProducts += 1;
      else counts.importedProducts += 1;
      return counts;
    },
    { importedProducts: 0, updatedProducts: 0 },
  );
  return apply ? write(plan.products) : planned;
};

export const makeOlistBulkOperations = (products: OlistCatalogProduct[]) => products.map((product) => {
  const { id, stock, ...catalogFields } = product;
  return {
    updateOne: {
      filter: { sku: product.sku },
      update: {
        $set: catalogFields,
        $setOnInsert: { id, stock },
        $unset: { activeImage: true as const },
      },
      upsert: true,
    },
  };
});
