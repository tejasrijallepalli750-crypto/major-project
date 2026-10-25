import '../server/config/loadEnv';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { OrderModel } from '../server/models/Order';
import { ProductModel } from '../server/models/Product';
import { UserModel } from '../server/models/User';
import { catalogSeed } from '../server/catalog/catalogSeed';
import {
  assertOlistTargetDatabase,
  buildOlistProductPlan,
  OLIST_TARGET_DATABASE,
  OLIST_TO_INR_RATE,
  parseOlistCsv,
} from './olist-product-importer';
import {
  buildProductReferenceIndex,
  ExistingCatalogueProduct,
  getOlistProductIdFromSku,
  getPermanentDeleteCandidates,
  makeOlistReconciliationOperations,
  makeSimulatedInventoryOperations,
  parseOlistReconciliationOptions,
  OlistReconciliationOptions,
  planOlistCatalogueReconciliation,
  planSimulatedInventory,
  resolveSafeLocalImagePath,
} from './olist-catalogue-reconciliation';

const PROJECT_ROOT = process.cwd();
const RAW_DIRECTORY = path.resolve(PROJECT_ROOT, 'dataset', 'olist_raw');
const PUBLIC_DIRECTORY = path.resolve(PROJECT_ROOT, 'public');

class SafeReconciliationError extends Error {}

const readCsv = <TRow extends Record<string, string>>(filename: string): TRow[] => {
  const filePath = path.resolve(RAW_DIRECTORY, filename);
  if (!filePath.startsWith(`${RAW_DIRECTORY}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new SafeReconciliationError(`Required Olist source file is missing: ${filename}`);
  }
  return parseOlistCsv<TRow>(fs.readFileSync(filePath, 'utf8'));
};

const hasSafeLocalImage = (image: string): boolean => {
  return Boolean(resolveSafeLocalImagePath(image, PUBLIC_DIRECTORY, fs.existsSync));
};

const readReferences = async () => {
  const [orders, users] = await Promise.all([
    OrderModel.find({}, { 'orderItems.product': 1, 'orderItems.sku': 1 }).lean().exec(),
    UserModel.find({}, { 'cartItems.productId': 1, wishlistIds: 1 }).lean().exec(),
  ]);
  return buildProductReferenceIndex(orders, users);
};

const safeProductProjection = {
  id: 1,
  sku: 1,
  status: 1,
  stock: 1,
  image: 1,
  features: 1,
  inventoryMode: 1,
} as const;

const printSummary = (
  options: OlistReconciliationOptions,
  sourceIds: Set<string>,
  products: ExistingCatalogueProduct[],
  reconciliation: ReturnType<typeof planOlistCatalogueReconciliation>,
  referenceIndex: ReturnType<typeof buildProductReferenceIndex>,
  plannedProductCount: number,
  updateCount: number,
  insertCount: number,
  blockedSourceIds: string[],
  demoInventoryPlan: ReturnType<typeof planSimulatedInventory>,
  photoCount: number,
  artworkCount: number,
  productsWithHistoricalPrices: number,
  productsWithoutHistoricalPrices: number,
): void => {
  const referencedOutside = reconciliation.outsideProducts.filter((product) => product.referenced).length;
  const unreferencedOutside = reconciliation.outsideProducts.filter((product) => !product.referenced).length;
  const safeDeleteCount = getPermanentDeleteCandidates(reconciliation.outsideProducts).length;
  const protectedSeedCount = reconciliation.outsideProducts.filter(
    (product) => !product.referenced && product.seedProduct,
  ).length;
  const activeOutside = reconciliation.outsideProducts.filter((product) => product.status === 'active').length;
  const duplicateRecords = reconciliation.duplicateSourceGroups.reduce(
    (count, group) => count + group.products.length - 1,
    0,
  );
  console.log(`Olist catalogue reconciliation (${options.apply ? 'APPLY' : 'DRY RUN'})`);
  console.log(`Source Olist product IDs: ${sourceIds.size}`);
  console.log(`Source ID sample: ${[...sourceIds].slice(0, 5).join(', ')}`);
  console.log(`Database products: ${products.length}`);
  console.log(`Matching Olist products: ${reconciliation.matchingProducts.length}`);
  console.log(`Duplicate matching Olist records: ${duplicateRecords} across ${reconciliation.duplicateSourceGroups.length} source IDs`);
  console.log(`Products outside source dataset: ${reconciliation.outsideProducts.length}`);
  console.log(`Outside products referenced by orders, carts, or wishlists: ${referencedOutside}`);
  console.log(`Outside products with no discovered references: ${unreferencedOutside}`);
  console.log(`Proposed keep: ${reconciliation.matchingProducts.length}`);
  console.log(`Proposed deactivate: ${activeOutside}`);
  console.log(`Potential permanent delete (unreferenced, non-seed; requires --delete-unreferenced): ${safeDeleteCount}`);
  console.log(`Unreferenced starter-seed products preserved inactive to prevent startup reseeding: ${protectedSeedCount}`);
  console.log(`Proposed Olist updates: ${updateCount}`);
  console.log(`Proposed eligible Olist inserts: ${insertCount}`);
  console.log(`Olist IDs missing from product collection: ${reconciliation.missingSourceProductIds.length}`);
  console.log(`Missing source IDs blocked by an existing product ID conflict: ${blockedSourceIds.length}`);
  if (blockedSourceIds.length) {
    console.log(`Blocked Olist source IDs: ${blockedSourceIds.join(', ')}`);
  }
  console.log(`Eligible Olist products in source plan: ${plannedProductCount}`);
  console.log(`Discovered references scanned: ${referenceIndex.productIds.size} product IDs, ${referenceIndex.skus.size} order SKUs`);
  console.log(`Valid local representative category photos: ${photoCount}`);
  console.log(`Category artwork fallback assignments: ${artworkCount}`);
  console.log(`Products with usable historical prices: ${productsWithHistoricalPrices}`);
  console.log(`Products skipped without historical prices: ${productsWithoutHistoricalPrices}`);
  console.log('Representative images are category-level assets, not original Olist product photos.');
  console.log(`Historical BRL-to-INR conversion (${OLIST_TO_INR_RATE}) is an estimate, not a current market price.`);
  if (options.enableDemoInventory) {
    console.log(`Demo inventory enabled: initialize eligible zero-stock Olist products to ${options.demoStock} simulated units.`);
    console.log(`Already marked simulated: ${demoInventoryPlan.alreadySimulated}`);
    console.log(`Non-zero unmarked Olist stock preserved: ${demoInventoryPlan.preservedNonZeroStock}`);
    console.log(`Eligible zero-stock Olist products: ${demoInventoryPlan.eligible.length}`);
  } else {
    console.log('Demo inventory disabled; all current stock values are preserved.');
  }
  if (options.deleteUnreferenced) {
    console.log('Permanent deletion is explicitly enabled for products with no discovered order, cart, or wishlist reference.');
  }
  if (reconciliation.duplicateSourceGroups.length) {
    console.log('Duplicate Olist source IDs requiring manual review:');
    for (const group of reconciliation.duplicateSourceGroups) {
      console.log(`${group.productId}: ${group.products.map((product) => `${product.id} (${product.sku})`).join(', ')}`);
    }
  }
  if (reconciliation.outsideProducts.length) {
    console.log('Products outside the source dataset (product ID | SKU | references | proposed action):');
    for (const product of reconciliation.outsideProducts) {
      const action = options.deleteUnreferenced && !product.referenced && !product.seedProduct
        ? 'permanent delete if apply is approved'
        : product.seedProduct ? 'deactivate and retain (startup seed protection)'
        : product.status === 'active' ? 'deactivate' : 'leave inactive';
      console.log(`${product.id} | ${product.sku} | ${product.referenced ? 'referenced' : 'unreferenced'} | ${action}`);
    }
  }
  if (reconciliation.missingSourceProductIds.length) {
    console.log(`Missing source ID sample: ${reconciliation.missingSourceProductIds.slice(0, 10).join(', ')}`);
  }
  if (!options.apply) console.log('No database writes were performed. Review this report before passing --apply.');
};

const main = async (): Promise<void> => {
  let options: OlistReconciliationOptions;
  try {
    options = parseOlistReconciliationOptions(process.argv.slice(2));
  } catch (error) {
    throw new SafeReconciliationError(error instanceof Error ? error.message : 'Reconciliation options are invalid.');
  }
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new SafeReconciliationError('MONGODB_URI is required.');
  assertOlistTargetDatabase(uri);

  try {
    try {
      await mongoose.connect(uri, {
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
    } catch (error) {
      const cause = error as { name?: string; code?: string | number };
      const code = typeof cause.code === 'string' || typeof cause.code === 'number' ? `, code ${cause.code}` : '';
      const failure = new Error(`MongoDB connection failed: ${cause.name || 'UnknownError'}${code}`);
      failure.name = 'MongoConnectionError';
      throw failure;
    }
    if (mongoose.connection.db?.databaseName !== OLIST_TARGET_DATABASE) {
      throw new SafeReconciliationError(`Connected MongoDB database is not ${OLIST_TARGET_DATABASE}.`);
    }

    const sourceRows = readCsv<{ product_id: string; product_category_name: string }>('olist_products_dataset.csv');
    const orderRows = readCsv<{ product_id: string; price: string }>('olist_order_items_dataset.csv');
    const translationRows = readCsv<{ product_category_name: string; product_category_name_english: string }>(
      'product_category_name_translation.csv',
    );
    const sourceIds = new Set(sourceRows.map((row) => row.product_id.trim().toLowerCase()));
    if (sourceIds.size !== sourceRows.length || [...sourceIds].some((id) => !/^[a-f\d]{32}$/.test(id))) {
      throw new SafeReconciliationError('Olist source product IDs contain invalid or duplicate values.');
    }
    const productPlan = buildOlistProductPlan(
      sourceRows,
      orderRows,
      translationRows,
      hasSafeLocalImage,
    );
    if (productPlan.counts.missingArtwork > 0) {
      throw new SafeReconciliationError('One or more catalogue products have no safe local category image.');
    }

    const [allProducts, referenceIndex] = await Promise.all([
      ProductModel.find({}, safeProductProjection).lean().exec(),
      readReferences(),
    ]);
    const products = allProducts.map((product) => ({
      ...product,
      id: String(product.id),
      sku: String(product.sku),
      status: product.status === 'inactive' ? 'inactive' as const : 'active' as const,
      stock: Number(product.stock),
      image: String(product.image),
    }));
    const reconciliation = planOlistCatalogueReconciliation(
      products,
      sourceIds,
      referenceIndex,
      new Set(catalogSeed.map((product) => product.sku)),
    );
    const sourceGroups = new Map<string, ExistingCatalogueProduct[]>();
    for (const product of reconciliation.matchingProducts) {
      const sourceId = getOlistProductIdFromSku(product.sku);
      if (!sourceId) continue;
      const group = sourceGroups.get(sourceId) || [];
      group.push(product);
      sourceGroups.set(sourceId, group);
    }
    const duplicateIds = new Set(reconciliation.duplicateSourceGroups.map((group) => group.productId));
    const existingIds = new Set(products.map((product) => product.id));
    const blockedSourceIds = productPlan.products
      .map((product) => getOlistProductIdFromSku(product.sku))
      .filter((id): id is string => Boolean(id))
      .filter((id) => !sourceGroups.has(id) && existingIds.has(`prod-olist-${id}`));
    const safePlanProducts = productPlan.products.filter((product) => {
      const id = getOlistProductIdFromSku(product.sku);
      return id !== undefined && !duplicateIds.has(id) && !blockedSourceIds.includes(id);
    });
    const operations = makeOlistReconciliationOperations(safePlanProducts, reconciliation.matchingProducts);
    const updateCount = operations.filter((operation) => !operation.updateOne.upsert).length;
    const insertCount = operations.length - updateCount;
    const plannedOlistInserts = safePlanProducts
      .filter((product) => {
        const id = getOlistProductIdFromSku(product.sku);
        return id !== undefined && !sourceGroups.has(id);
      })
      .map((product) => ({ ...product, inventoryMode: undefined }));
    const demoInventoryPlan = planSimulatedInventory(
      [...reconciliation.matchingProducts, ...plannedOlistInserts],
      sourceIds,
    );
    const photoCount = productPlan.counts.categoryPhotoProducts;
    const artworkCount = productPlan.counts.fallbackArtwork;

    printSummary(
      options,
      sourceIds,
      products,
      reconciliation,
      referenceIndex,
      productPlan.products.length,
      updateCount,
      insertCount,
      blockedSourceIds,
      demoInventoryPlan,
      photoCount,
      artworkCount,
      productPlan.counts.productsWithUsableHistoricalPrices,
      productPlan.counts.noUsableHistoricalPrice,
    );
    if (!options.apply) return;

    const outsideIds = reconciliation.outsideProducts.map((product) => product.id);
    let insertedCount = 0;
    let updatedCount = 0;
    if (operations.length) {
      const writeResult = await ProductModel.bulkWrite(operations, { ordered: false });
      insertedCount = writeResult.upsertedCount;
      updatedCount = writeResult.matchedCount;
    }
    let deactivatedCount = 0;
    if (outsideIds.length) {
      const result = await ProductModel.updateMany(
        { id: { $in: outsideIds }, status: 'active' },
        { $set: { status: 'inactive' }, $unset: { activeImage: 1 } },
      );
      deactivatedCount = result.modifiedCount;
    }
    let simulatedInventoryCount = 0;
    if (options.enableDemoInventory && demoInventoryPlan.eligible.length) {
      if (options.demoStock === undefined) {
        throw new SafeReconciliationError('Demo inventory is enabled without a resolved quantity.');
      }
      const result = await ProductModel.bulkWrite(
        makeSimulatedInventoryOperations(demoInventoryPlan.eligible, options.demoStock),
        { ordered: false },
      );
      simulatedInventoryCount = result.modifiedCount;
    }
    let deletedCount = 0;
    if (options.deleteUnreferenced) {
      const freshReferences = await readReferences();
      const deletableProducts = getPermanentDeleteCandidates(reconciliation.outsideProducts)
        .filter((product) =>
          !freshReferences.productIds.has(product.id)
          && !freshReferences.skus.has(product.sku.toUpperCase()),
        )
      if (deletableProducts.length) {
        const result = await ProductModel.deleteMany({
          $or: deletableProducts.map((product) => ({
            id: product.id,
            sku: product.sku,
            status: 'inactive',
          })),
        });
        deletedCount = result.deletedCount;
      }
      console.log(`Permanently deleted unreferenced outside products: ${deletedCount}`);
      console.log('Run deletion only while the backend is stopped to prevent concurrent cart writes.');
    }
    console.log(`Olist records inserted: ${insertedCount}`);
    console.log(`Olist records matched by updates: ${updatedCount}`);
    console.log(`Outside products deactivated: ${deactivatedCount}`);
    if (options.enableDemoInventory) {
      console.log(`Products initialized with simulated stock: ${simulatedInventoryCount}`);
    }
    console.log('Reconciliation database writes completed.');
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error
      ? ` (code ${String(error.code)})`
      : '';
    if (error instanceof SafeReconciliationError) {
      console.error(`Olist reconciliation stopped: ${error.message}`);
    } else {
      console.error(`Olist reconciliation failed: ${error instanceof Error ? error.name : 'UnknownError'}${code}`);
    }
    process.exitCode = 1;
  });
}
