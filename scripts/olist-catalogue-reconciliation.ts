import path from 'node:path';
import { OlistCatalogProduct, OLIST_CATALOG_FEATURE } from './olist-product-importer';

const OLIST_SKU_PATTERN = /^OLIST-([a-f\d]{32})$/i;

export interface ExistingCatalogueProduct {
  id: string;
  sku: string;
  status: 'active' | 'inactive';
  stock: number;
  image: string;
  features?: string[];
  inventoryMode?: 'simulated-demo';
}

export interface ProductReferenceIndex {
  productIds: ReadonlySet<string>;
  skus: ReadonlySet<string>;
}

export interface OlistReconciliationOptions {
  apply: boolean;
  deleteUnreferenced: boolean;
  enableDemoInventory: boolean;
  demoStock: number | undefined;
}

export interface OlistReconciliationPlan {
  sourceProductIds: ReadonlySet<string>;
  matchingProducts: ExistingCatalogueProduct[];
  outsideProducts: Array<ExistingCatalogueProduct & { referenced: boolean; seedProduct: boolean }>;
  duplicateSourceGroups: Array<{ productId: string; products: ExistingCatalogueProduct[] }>;
  missingSourceProductIds: string[];
}

export const getPermanentDeleteCandidates = (
  outsideProducts: OlistReconciliationPlan['outsideProducts'],
) => outsideProducts.filter((product) => !product.referenced && !product.seedProduct);

export const getOlistProductIdFromSku = (sku: string): string | undefined => {
  const match = OLIST_SKU_PATTERN.exec(sku.trim());
  return match?.[1].toLowerCase();
};

export const resolveSafeLocalImagePath = (
  image: string,
  publicRoot: string,
  fileExists: (filePath: string) => boolean,
): string | undefined => {
  if (!image.startsWith('/images/') || image.startsWith('//')) return undefined;
  const resolvedPublicRoot = path.resolve(publicRoot);
  const filePath = path.resolve(resolvedPublicRoot, `.${image}`);
  if (!filePath.startsWith(`${resolvedPublicRoot}${path.sep}`) || !fileExists(filePath)) return undefined;
  return filePath;
};

export const buildProductReferenceIndex = (
  orders: ReadonlyArray<{ orderItems?: ReadonlyArray<{ product?: string; sku?: string }> }>,
  users: ReadonlyArray<{
    cartItems?: ReadonlyArray<{ productId?: string }>;
    wishlistIds?: ReadonlyArray<string>;
  }>,
): ProductReferenceIndex => {
  const productIds = new Set<string>();
  const skus = new Set<string>();
  for (const order of orders) {
    for (const item of order.orderItems || []) {
      if (item.product) productIds.add(item.product);
      if (item.sku) skus.add(item.sku.toUpperCase());
    }
  }
  for (const user of users) {
    for (const item of user.cartItems || []) {
      if (item.productId) productIds.add(item.productId);
    }
    for (const productId of user.wishlistIds || []) productIds.add(productId);
  }
  return { productIds, skus };
};

export const planOlistCatalogueReconciliation = (
  products: ExistingCatalogueProduct[],
  sourceIds: ReadonlySet<string>,
  references: ProductReferenceIndex,
  protectedSeedSkus: ReadonlySet<string> = new Set(),
): OlistReconciliationPlan => {
  const normalizedSourceIds = new Set([...sourceIds].map((id) => id.toLowerCase()));
  const normalizedSeedSkus = new Set([...protectedSeedSkus].map((sku) => sku.toUpperCase()));
  const sourceGroups = new Map<string, ExistingCatalogueProduct[]>();
  const matchingProducts: ExistingCatalogueProduct[] = [];
  const outsideProducts: OlistReconciliationPlan['outsideProducts'] = [];

  for (const product of products) {
    const productId = getOlistProductIdFromSku(product.sku);
    if (productId && normalizedSourceIds.has(productId)) {
      matchingProducts.push(product);
      const group = sourceGroups.get(productId) || [];
      group.push(product);
      sourceGroups.set(productId, group);
      continue;
    }
    outsideProducts.push({
      ...product,
      referenced: references.productIds.has(product.id) || references.skus.has(product.sku.toUpperCase()),
      seedProduct: normalizedSeedSkus.has(product.sku.toUpperCase()),
    });
  }

  const duplicateSourceGroups = [...sourceGroups.entries()]
    .filter(([, groupedProducts]) => groupedProducts.length > 1)
    .map(([productId, groupedProducts]) => ({ productId, products: groupedProducts }));
  const existingSourceIds = new Set(sourceGroups.keys());
  const missingSourceProductIds = [...normalizedSourceIds].filter((id) => !existingSourceIds.has(id));
  return {
    sourceProductIds: normalizedSourceIds,
    matchingProducts,
    outsideProducts,
    duplicateSourceGroups,
    missingSourceProductIds,
  };
};

export const makeOlistReconciliationOperations = (
  plannedProducts: OlistCatalogProduct[],
  existingProducts: ExistingCatalogueProduct[],
) => {
  const bySourceId = new Map<string, ExistingCatalogueProduct[]>();
  for (const product of existingProducts) {
    const productId = getOlistProductIdFromSku(product.sku);
    if (!productId) continue;
    const group = bySourceId.get(productId) || [];
    group.push(product);
    bySourceId.set(productId, group);
  }

  return plannedProducts.flatMap((product) => {
    const productId = getOlistProductIdFromSku(product.sku);
    if (!productId) return [];
    const matches = bySourceId.get(productId) || [];
    if (matches.length > 1) return [];
    const { id, stock, inventoryMode: _inventoryMode, ...catalogFields } = product;
    const update = {
      $set: catalogFields,
      ...(!matches.length ? { $setOnInsert: { id, stock } } : {}),
      $unset: { activeImage: true as const },
    };
    return [{
      updateOne: {
        filter: matches.length ? { id: matches[0].id } : { sku: product.sku },
        update,
        upsert: matches.length === 0,
      },
    }];
  });
};

export const planSimulatedInventory = (
  products: ExistingCatalogueProduct[],
  sourceIds: ReadonlySet<string>,
) => {
  const eligible = products.filter((product) => {
    const productId = getOlistProductIdFromSku(product.sku);
    return productId !== undefined
      && sourceIds.has(productId)
      && product.features?.includes(OLIST_CATALOG_FEATURE) === true
      && product.stock === 0
      && product.inventoryMode !== 'simulated-demo';
  });
  const alreadySimulated = products.filter((product) =>
    getOlistProductIdFromSku(product.sku) !== undefined
    && product.inventoryMode === 'simulated-demo',
  ).length;
  const preservedNonZeroStock = products.filter((product) =>
    getOlistProductIdFromSku(product.sku) !== undefined
    && product.stock > 0
    && product.inventoryMode !== 'simulated-demo',
  ).length;
  return { eligible, alreadySimulated, preservedNonZeroStock };
};

export const resolveDemoInventoryStock = (
  enabled: boolean,
  requestedStock?: number,
): number | undefined => {
  if (!enabled) {
    if (requestedStock !== undefined) throw new Error('--demo-stock requires demo inventory to be enabled.');
    return undefined;
  }
  const stock = requestedStock ?? 20;
  if (!Number.isInteger(stock) || stock < 1 || stock > 100000) {
    throw new RangeError('Simulated demo stock must be a whole number from 1 to 100000.');
  }
  return stock;
};

export const parseOlistReconciliationOptions = (args: string[]): OlistReconciliationOptions => {
  let apply = false;
  let deleteUnreferenced = false;
  let enableDemoInventory = false;
  let requestedDemoStock: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply' && !apply) apply = true;
    else if (argument === '--delete-unreferenced' && !deleteUnreferenced) deleteUnreferenced = true;
    else if (argument === '--enable-demo-inventory' && !enableDemoInventory) enableDemoInventory = true;
    else if (argument === '--demo-stock' && requestedDemoStock === undefined && index + 1 < args.length) {
      const value = args[index + 1];
      if (!/^\d+$/.test(value)) throw new Error('--demo-stock requires a whole number.');
      requestedDemoStock = Number(value);
      index += 1;
    } else {
      throw new Error(
        'Supported options are --apply, --delete-unreferenced, --enable-demo-inventory, and --demo-stock <quantity>.',
      );
    }
  }
  const demoStock = resolveDemoInventoryStock(enableDemoInventory, requestedDemoStock);
  return { apply, deleteUnreferenced, enableDemoInventory, demoStock };
};

export const makeSimulatedInventoryOperations = (
  products: ExistingCatalogueProduct[],
  stock: number,
) => {
  const resolvedStock = resolveDemoInventoryStock(true, stock);
  if (resolvedStock === undefined) throw new Error('Demo inventory must be enabled before assigning stock.');
  return products.filter((product) =>
    getOlistProductIdFromSku(product.sku) !== undefined
    && product.features?.includes(OLIST_CATALOG_FEATURE) === true
    && product.stock === 0
    && product.inventoryMode !== 'simulated-demo',
  ).map((product) => ({
    updateOne: {
      filter: {
        id: product.id,
        sku: product.sku,
        features: OLIST_CATALOG_FEATURE,
        stock: 0,
        inventoryMode: { $ne: 'simulated-demo' },
      },
      update: { $set: { stock: resolvedStock, inventoryMode: 'simulated-demo' as const } },
      upsert: false,
    },
  }));
};
