import '../server/config/loadEnv';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { ProductModel } from '../server/models/Product';
import {
  applyOlistImportPlan,
  assertOlistTargetDatabase,
  buildOlistProductPlan,
  OlistCatalogProduct,
  OlistImportSummary,
  OLIST_TARGET_DATABASE,
  OLIST_TO_INR_RATE,
  makeOlistBulkOperations,
  parseOlistCsv,
} from './olist-product-importer';
import { OLIST_CATALOG_FEATURE } from '../src/utils/productPresentation';

const PROJECT_ROOT = process.cwd();
const RAW_DIRECTORY = path.resolve(PROJECT_ROOT, 'dataset', 'olist_raw');
const PUBLIC_DIRECTORY = path.resolve(PROJECT_ROOT, 'public');
const BATCH_SIZE = 500;

class SafeImportError extends Error {}

const resolveLocalImage = (image: string): string | undefined => {
  if (!image.startsWith('/images/') || image.startsWith('//')) return undefined;
  const publicRoot = path.resolve(PUBLIC_DIRECTORY);
  const filePath = path.resolve(publicRoot, `.${image}`);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(filePath)) return undefined;
  return filePath;
};

const readCsv = <TRow extends Record<string, string>>(filename: string): TRow[] => {
  const filePath = path.resolve(RAW_DIRECTORY, filename);
  if (!filePath.startsWith(`${RAW_DIRECTORY}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new SafeImportError(`Required Olist input file is missing: ${filename}`);
  }
  return parseOlistCsv<TRow>(fs.readFileSync(filePath, 'utf8'));
};

const writeProducts = async (products: OlistCatalogProduct[]): Promise<OlistImportSummary> => {
  let importedProducts = 0;
  let updatedProducts = 0;
  for (let offset = 0; offset < products.length; offset += BATCH_SIZE) {
    const batch = products.slice(offset, offset + BATCH_SIZE);
    const result = await ProductModel.bulkWrite(makeOlistBulkOperations(batch), { ordered: false });
    importedProducts += result.upsertedCount;
    updatedProducts += result.matchedCount;
  }
  return { importedProducts, updatedProducts };
};

const printSummary = (
  mode: 'DRY RUN' | 'APPLY',
  counts: ReturnType<typeof buildOlistProductPlan>['counts'],
  summary: OlistImportSummary,
): void => {
  console.log(`Olist product catalogue import (${mode})`);
  console.log(`Source product records: ${counts.sourceRecordCount}`);
  console.log(`Unique valid product IDs: ${counts.uniqueProductIds}`);
  console.log(`Products with usable historical prices: ${counts.productsWithUsableHistoricalPrices}`);
  console.log(`Duplicate source rows collapsed: ${counts.duplicateProductRows}`);
  console.log(`Rows skipped for invalid product IDs: ${counts.invalidProductIdRows}`);
  console.log(`Historical order-item price rows skipped as invalid: ${counts.invalidHistoricalPriceRows}`);
  console.log(`Products skipped with no usable historical price: ${counts.noUsableHistoricalPrice}`);
  console.log(`Products using fallback category artwork: ${counts.fallbackArtwork}`);
  console.log(`Products using curated category photos: ${counts.categoryPhotoProducts}`);
  console.log(`Products skipped because category artwork is missing: ${counts.missingArtwork}`);
  console.log(`${mode === 'DRY RUN' ? 'Would import' : 'Imported'} products: ${summary.importedProducts}`);
  console.log(`${mode === 'DRY RUN' ? 'Would update' : 'Updated'} Olist products: ${summary.updatedProducts}`);
  console.log(`Eligible products: ${counts.eligibleProducts}`);
  console.log(`Price conversion: historical BRL average × ${OLIST_TO_INR_RATE}, rounded to whole INR`);
  console.log('New catalogue products have zero stock because the source dataset contains no inventory counts.');
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--apply') || args.filter((argument) => argument === '--apply').length > 1) {
    throw new SafeImportError('Only the optional --apply argument is supported.');
  }
  const apply = args.includes('--apply');
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new SafeImportError('MONGODB_URI is required.');
  try {
    assertOlistTargetDatabase(uri);
  } catch (error) {
    throw new SafeImportError(error instanceof Error ? error.message : 'MONGODB_URI must target the test database.');
  }

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
      const errorCode = typeof cause.code === 'string' || typeof cause.code === 'number'
        ? `, code ${cause.code}`
        : '';
      const connectionError = new Error(`MongoDB connection failed: ${cause.name || 'UnknownError'}${errorCode}`);
      connectionError.name = 'MongoConnectionError';
      throw connectionError;
    }
    const connectedDatabase = mongoose.connection.db?.databaseName;
    if (connectedDatabase !== OLIST_TARGET_DATABASE) {
      throw new SafeImportError(`Connected MongoDB database is not ${OLIST_TARGET_DATABASE}.`);
    }

    const products = readCsv<{ product_id: string; product_category_name: string }>('olist_products_dataset.csv');
    const orderItems = readCsv<{ product_id: string; price: string }>('olist_order_items_dataset.csv');
    const translations = readCsv<{ product_category_name: string; product_category_name_english: string }>(
      'product_category_name_translation.csv',
    );
    const plan = buildOlistProductPlan(
      products,
      orderItems,
      translations,
      (image) => Boolean(resolveLocalImage(image)),
    );
    if (plan.products.some((product) => !product.features?.includes(OLIST_CATALOG_FEATURE))) {
      throw new SafeImportError('Generated Olist product ownership marker validation failed.');
    }
    const existingProducts = await ProductModel.find({ sku: /^OLIST-/i }).select({ sku: 1 }).lean().exec();
    const existingSkus = new Set(existingProducts.map((product) => product.sku.toUpperCase()));
    const summary = await applyOlistImportPlan(plan, existingSkus, apply, writeProducts);

    printSummary(apply ? 'APPLY' : 'DRY RUN', plan.counts, summary);
    if (!apply) console.log('No database writes were performed. Pass --apply to write Olist-owned product records.');
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error
      ? ` (code ${String(error.code)})`
      : '';
    console.error(`Olist import failed: ${error instanceof Error ? error.name : 'UnknownError'}${code}`);
    if (error instanceof SafeImportError) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
