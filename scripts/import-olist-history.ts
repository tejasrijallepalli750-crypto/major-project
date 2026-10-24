import '../server/config/loadEnv';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse';
import { parse as parseCsvSync } from 'csv-parse/sync';
import mongoose from 'mongoose';
import { closeMongo, connectMongo } from '../server/db/mongo';
import { OlistHistoryTable, olistHistoryModels } from '../server/models/OlistHistory';

interface CsvRow {
  [column: string]: string;
}

interface FileSpec {
  filename: string;
  table: OlistHistoryTable;
  headers: readonly string[];
}

interface ImportCounts {
  rows: number;
  imported: number;
  wouldImport: number;
  alreadyPresent: number;
  duplicateRows: number;
  invalid: number;
  relationshipErrors: number;
  unconfirmedBatchRows: number;
  untranslatedCategories?: number;
  errors: Array<{ row: number; message: string }>;
}

class OlistFileImportError extends Error {
  constructor(
    readonly table: OlistHistoryTable,
    readonly counts: ImportCounts,
    cause: unknown,
  ) {
    super(`Import failed for ${table}: ${cause instanceof Error ? cause.message : 'unknown database error'}`, { cause });
    this.name = 'OlistFileImportError';
  }
}

interface ImportState {
  dryRun: boolean;
  ids: Record<'customers' | 'sellers' | 'products' | 'orders', Set<string>>;
  translations: Map<string, string>;
}

const DATA_DIRECTORY = path.resolve(process.cwd(), 'dataset', 'olist_raw');
const BATCH_SIZE = 500;
const ERROR_SAMPLE_LIMIT = 20;

const files: FileSpec[] = [
  {
    filename: 'product_category_name_translation.csv',
    table: 'categoryTranslations',
    headers: ['product_category_name', 'product_category_name_english'],
  },
  {
    filename: 'olist_customers_dataset.csv',
    table: 'customers',
    headers: ['customer_id', 'customer_unique_id', 'customer_zip_code_prefix', 'customer_city', 'customer_state'],
  },
  {
    filename: 'olist_sellers_dataset.csv',
    table: 'sellers',
    headers: ['seller_id', 'seller_zip_code_prefix', 'seller_city', 'seller_state'],
  },
  {
    filename: 'olist_products_dataset.csv',
    table: 'products',
    headers: [
      'product_id', 'product_category_name', 'product_name_lenght',
      'product_description_lenght', 'product_photos_qty', 'product_weight_g',
      'product_length_cm', 'product_height_cm', 'product_width_cm',
    ],
  },
  {
    filename: 'olist_orders_dataset.csv',
    table: 'orders',
    headers: [
      'order_id', 'customer_id', 'order_status', 'order_purchase_timestamp',
      'order_approved_at', 'order_delivered_carrier_date',
      'order_delivered_customer_date', 'order_estimated_delivery_date',
    ],
  },
  {
    filename: 'olist_order_items_dataset.csv',
    table: 'orderItems',
    headers: ['order_id', 'order_item_id', 'product_id', 'seller_id', 'shipping_limit_date', 'price', 'freight_value'],
  },
  {
    filename: 'olist_order_payments_dataset.csv',
    table: 'payments',
    headers: ['order_id', 'payment_sequential', 'payment_type', 'payment_installments', 'payment_value'],
  },
  {
    filename: 'olist_order_reviews_dataset.csv',
    table: 'reviews',
    headers: [
      'review_id', 'order_id', 'review_score', 'review_comment_title',
      'review_comment_message', 'review_creation_date', 'review_answer_timestamp',
    ],
  },
  {
    filename: 'olist_geolocation_dataset.csv',
    table: 'geolocation',
    headers: [
      'geolocation_zip_code_prefix', 'geolocation_lat', 'geolocation_lng',
      'geolocation_city', 'geolocation_state',
    ],
  },
];

const required = (row: CsvRow, field: string): string => {
  const value = row[field]?.trim() ?? '';
  if (!value) throw new Error(`Required value is missing: ${field}`);
  return value;
};

const optional = (row: CsvRow, field: string): string | null => {
  const value = row[field]?.trim() ?? '';
  return value || null;
};

const numberValue = (
  row: CsvRow,
  field: string,
  options: { integer?: boolean; minimum?: number; optional?: boolean } = {},
): number | null => {
  const value = row[field]?.trim() ?? '';
  if (!value && options.optional) return null;
  if (!value) throw new Error(`Required numeric value is missing: ${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)
    || (options.integer && !Number.isInteger(parsed))
    || (options.minimum !== undefined && parsed < options.minimum)) {
    throw new Error(`Invalid numeric value: ${field}`);
  }
  return parsed;
};

const dateValue = (row: CsvRow, field: string, optionalDate = false): string | null => {
  const value = row[field]?.trim() ?? '';
  if (!value && optionalDate) return null;
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`Invalid date value: ${field}`);
  return value;
};

const stateValue = (row: CsvRow, field: string): string => {
  const state = required(row, field).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error(`Expected a two-letter state code: ${field}`);
  return state;
};

const normalizeZip = (row: CsvRow, field: string): string => {
  const zip = required(row, field);
  if (!/^\d{1,5}$/.test(zip)) throw new Error(`Invalid postal code prefix: ${field}`);
  return zip.padStart(5, '0');
};

const makeRecord = (
  table: OlistHistoryTable,
  row: CsvRow,
  state: ImportState,
): { key: string; record: Record<string, unknown>; categoryWasUntranslated?: boolean } => {
  switch (table) {
    case 'categoryTranslations': {
      const category = required(row, 'product_category_name');
      const english = required(row, 'product_category_name_english');
      const prior = state.translations.get(category);
      if (prior && prior !== english) throw new Error('Conflicting category translation.');
      return {
        key: category,
        record: { product_category_name: category, product_category_name_english: english },
      };
    }
    case 'customers': {
      const key = required(row, 'customer_id');
      return {
        key,
        record: {
          customer_id: key,
          customer_unique_id: required(row, 'customer_unique_id'),
          customer_zip_code_prefix: normalizeZip(row, 'customer_zip_code_prefix'),
          customer_city: required(row, 'customer_city'),
          customer_state: stateValue(row, 'customer_state'),
        },
      };
    }
    case 'sellers': {
      const key = required(row, 'seller_id');
      return {
        key,
        record: {
          seller_id: key,
          seller_zip_code_prefix: normalizeZip(row, 'seller_zip_code_prefix'),
          seller_city: required(row, 'seller_city'),
          seller_state: stateValue(row, 'seller_state'),
        },
      };
    }
    case 'products': {
      const key = required(row, 'product_id');
      const category = optional(row, 'product_category_name');
      return {
        key,
        categoryWasUntranslated: Boolean(category && !state.translations.has(category)),
        record: {
          product_id: key,
          product_category_name: category,
          product_category_name_english: category ? state.translations.get(category) ?? null : null,
          product_name_lenght: numberValue(row, 'product_name_lenght', { integer: true, minimum: 0, optional: true }),
          product_description_lenght: numberValue(row, 'product_description_lenght', { integer: true, minimum: 0, optional: true }),
          product_photos_qty: numberValue(row, 'product_photos_qty', { integer: true, minimum: 0, optional: true }),
          product_weight_g: numberValue(row, 'product_weight_g', { minimum: 0, optional: true }),
          product_length_cm: numberValue(row, 'product_length_cm', { minimum: 0, optional: true }),
          product_height_cm: numberValue(row, 'product_height_cm', { minimum: 0, optional: true }),
          product_width_cm: numberValue(row, 'product_width_cm', { minimum: 0, optional: true }),
        },
      };
    }
    case 'orders': {
      const key = required(row, 'order_id');
      const customerId = required(row, 'customer_id');
      if (!state.ids.customers.has(customerId)) throw new Error('Order references an unknown customer_id.');
      const status = required(row, 'order_status').toLowerCase();
      if (!['created', 'approved', 'invoiced', 'processing', 'shipped', 'delivered', 'unavailable', 'canceled', 'cancelled'].includes(status)) {
        throw new Error('Unknown order_status.');
      }
      return {
        key,
        record: {
          order_id: key,
          customer_id: customerId,
          order_status: status,
          order_purchase_timestamp: dateValue(row, 'order_purchase_timestamp'),
          order_approved_at: dateValue(row, 'order_approved_at', true),
          order_delivered_carrier_date: dateValue(row, 'order_delivered_carrier_date', true),
          order_delivered_customer_date: dateValue(row, 'order_delivered_customer_date', true),
          order_estimated_delivery_date: dateValue(row, 'order_estimated_delivery_date', true),
        },
      };
    }
    case 'orderItems': {
      const orderId = required(row, 'order_id');
      const productId = required(row, 'product_id');
      const sellerId = required(row, 'seller_id');
      if (!state.ids.orders.has(orderId)) throw new Error('Order item references an unknown order_id.');
      if (!state.ids.products.has(productId)) throw new Error('Order item references an unknown product_id.');
      if (!state.ids.sellers.has(sellerId)) throw new Error('Order item references an unknown seller_id.');
      const itemNumber = numberValue(row, 'order_item_id', { integer: true, minimum: 1 });
      return {
        key: `${orderId}:${itemNumber}`,
        record: {
          order_id: orderId,
          order_item_id: itemNumber,
          product_id: productId,
          seller_id: sellerId,
          shipping_limit_date: dateValue(row, 'shipping_limit_date'),
          price: numberValue(row, 'price', { minimum: 0 }),
          freight_value: numberValue(row, 'freight_value', { minimum: 0 }),
        },
      };
    }
    case 'payments': {
      const orderId = required(row, 'order_id');
      if (!state.ids.orders.has(orderId)) throw new Error('Payment references an unknown order_id.');
      const paymentType = required(row, 'payment_type').toLowerCase();
      if (!['credit_card', 'boleto', 'voucher', 'debit_card', 'not_defined'].includes(paymentType)) {
        throw new Error('Unknown payment_type.');
      }
      const sequence = numberValue(row, 'payment_sequential', { integer: true, minimum: 1 });
      const installments = numberValue(row, 'payment_installments', { integer: true, minimum: 0 });
      return {
        key: `${orderId}:${sequence}`,
        record: {
          order_id: orderId,
          payment_sequential: sequence,
          payment_type: paymentType,
          payment_installments: installments,
          payment_value: numberValue(row, 'payment_value', { minimum: 0 }),
          currency: 'BRL',
        },
      };
    }
    case 'reviews': {
      const reviewId = required(row, 'review_id');
      const orderId = required(row, 'order_id');
      if (!state.ids.orders.has(orderId)) throw new Error('Review references an unknown order_id.');
      const score = numberValue(row, 'review_score', { integer: true, minimum: 1 });
      if (score! > 5) throw new Error('Review score must be from 1 to 5.');
      return {
        key: `${reviewId}:${orderId}`,
        record: {
          review_id: reviewId,
          order_id: orderId,
          review_score: score,
          review_comment_title: optional(row, 'review_comment_title'),
          review_comment_message: optional(row, 'review_comment_message'),
          review_creation_date: dateValue(row, 'review_creation_date', true),
          review_answer_timestamp: dateValue(row, 'review_answer_timestamp', true),
        },
      };
    }
    case 'geolocation': {
      const zip = normalizeZip(row, 'geolocation_zip_code_prefix');
      const latitude = numberValue(row, 'geolocation_lat');
      const longitude = numberValue(row, 'geolocation_lng');
      if (latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180) {
        throw new Error('Geolocation coordinates are out of range.');
      }
      const city = required(row, 'geolocation_city');
      const stateCode = stateValue(row, 'geolocation_state');
      const record = {
        geolocation_zip_code_prefix: zip,
        geolocation_lat: latitude,
        geolocation_lng: longitude,
        geolocation_city: city,
        geolocation_state: stateCode,
      };
      const key = createHash('sha256').update(JSON.stringify(record)).digest('hex');
      return { key, record };
    }
  }
};

const addError = (counts: ImportCounts, row: number, message: string): void => {
  counts.invalid += 1;
  if (/references an unknown/.test(message)) counts.relationshipErrors += 1;
  if (counts.errors.length < ERROR_SAMPLE_LIMIT) counts.errors.push({ row, message });
};

async function verifyFiles(): Promise<void> {
  const problems: string[] = [];
  for (const file of files) {
    const filePath = path.join(DATA_DIRECTORY, file.filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      problems.push(`Missing required file: ${file.filename}`);
      continue;
    }
    const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    let headerLine: string | undefined;
    for await (const line of lines) {
      headerLine = line;
      break;
    }
    lines.close();
    if (!headerLine) {
      problems.push(`CSV is empty: ${file.filename}`);
      continue;
    }
    let headers: string[];
    try {
      headers = parseCsvSync(headerLine, { bom: true, trim: true, relax_column_count: false })[0] ?? [];
    } catch {
      problems.push(`Could not parse header: ${file.filename}`);
      continue;
    }
    if (new Set(headers).size !== headers.length) {
      problems.push(`Duplicate column names: ${file.filename}`);
      continue;
    }
    if (headers.some((header) => !header)) {
      problems.push(`Empty column name: ${file.filename}`);
      continue;
    }
    const missing = file.headers.filter((header) => !headers.includes(header));
    if (missing.length) problems.push(`${file.filename} is missing columns: ${missing.join(', ')}`);
  }
  if (problems.length) throw new Error(`CSV preflight failed before import:\n- ${problems.join('\n- ')}`);
}

const getExistingIds = async (table: 'customers' | 'sellers' | 'products' | 'orders'): Promise<Set<string>> => {
  const ids = await olistHistoryModels[table].distinct('_id');
  return new Set(ids.map(String));
};

async function importFile(file: FileSpec, state: ImportState): Promise<ImportCounts> {
  const counts: ImportCounts = {
    rows: 0,
    imported: 0,
    wouldImport: 0,
    alreadyPresent: 0,
    duplicateRows: 0,
    invalid: 0,
    relationshipErrors: 0,
    unconfirmedBatchRows: 0,
    ...(file.table === 'products' ? { untranslatedCategories: 0 } : {}),
    errors: [],
  };
  const seenInRun = new Set<string>();
  const seenRecords = new Map<string, string>();
  let pending = new Map<string, Record<string, unknown>>();
  let sourceRow = 1;

  const flush = async (): Promise<void> => {
    if (!pending.size) return;
    if (state.dryRun) {
      counts.wouldImport += pending.size;
      pending = new Map();
      return;
    }
    const operations = [...pending.entries()].map(([key, record]) => ({
      updateOne: {
        filter: { _id: key },
        update: {
          $setOnInsert: { _id: key, ...record, source: 'olist' as const, importedAt: new Date() },
        },
        upsert: true,
      },
    }));
    let result;
    try {
      result = await olistHistoryModels[file.table].bulkWrite(operations, { ordered: false });
    } catch (error) {
      counts.unconfirmedBatchRows += operations.length;
      throw error;
    }
    const accountedFor = result.upsertedCount + result.matchedCount;
    if (accountedFor !== operations.length) {
      counts.unconfirmedBatchRows += operations.length - accountedFor;
      throw new Error(`MongoDB accounted for ${accountedFor} of ${operations.length} ${file.table} records.`);
    }
    counts.imported += result.upsertedCount;
    counts.alreadyPresent += result.matchedCount;
    pending = new Map();
  };

  const parser = createReadStream(path.join(DATA_DIRECTORY, file.filename)).pipe(parse({
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    max_record_size: 1024 * 1024,
  }));
  try {
    for await (const parsedRow of parser) {
      sourceRow += 1;
      counts.rows += 1;
      if (counts.rows % 100000 === 0) {
        console.info(`[Olist import] ${file.table}: validated ${counts.rows} source rows.`);
      }
      const row = parsedRow as CsvRow;
      try {
        const { key, record, categoryWasUntranslated } = makeRecord(file.table, row, state);
        if (seenInRun.has(key)) {
          if (seenRecords.get(key) !== JSON.stringify(record)) {
            throw new Error('Conflicting rows use the same historical record key.');
          }
          counts.duplicateRows += 1;
          continue;
        }
        seenInRun.add(key);
        seenRecords.set(key, JSON.stringify(record));
        pending.set(key, record);
        if (categoryWasUntranslated && counts.untranslatedCategories !== undefined) {
          counts.untranslatedCategories += 1;
        }
        if (file.table === 'categoryTranslations') {
          state.translations.set(String(record.product_category_name), String(record.product_category_name_english));
        }
        if (file.table === 'customers' || file.table === 'sellers' || file.table === 'products' || file.table === 'orders') {
          const idField = {
            customers: 'customer_id',
            sellers: 'seller_id',
            products: 'product_id',
            orders: 'order_id',
          }[file.table];
          state.ids[file.table].add(String(record[idField]));
        }
        if (pending.size >= BATCH_SIZE) await flush();
      } catch (error) {
        addError(counts, sourceRow, error instanceof Error ? error.message : 'Invalid row.');
      }
    }
    await flush();
  } catch (error) {
    parser.destroy();
    throw new OlistFileImportError(
      file.table,
      counts,
      new Error(`CSV processing failed for ${file.filename}: ${error instanceof Error ? error.message : 'unknown parser error'}`, { cause: error }),
    );
  }
  return counts;
}

const summarize = (results: Partial<Record<OlistHistoryTable, ImportCounts>>) => {
  const counts = Object.values(results).filter((item): item is ImportCounts => Boolean(item));
  return counts.reduce((totals, item) => ({
    rows: totals.rows + item.rows,
    imported: totals.imported + item.imported,
    wouldImport: totals.wouldImport + item.wouldImport,
    alreadyPresent: totals.alreadyPresent + item.alreadyPresent,
    duplicateRows: totals.duplicateRows + item.duplicateRows,
    invalid: totals.invalid + item.invalid,
    relationshipErrors: totals.relationshipErrors + item.relationshipErrors,
    unconfirmedBatchRows: totals.unconfirmedBatchRows + item.unconfirmedBatchRows,
  }), {
    rows: 0,
    imported: 0,
    wouldImport: 0,
    alreadyPresent: 0,
    duplicateRows: 0,
    invalid: 0,
    relationshipErrors: 0,
    unconfirmedBatchRows: 0,
  });
};

const saveReport = (report: object): string => {
  const reportDirectory = path.resolve(process.cwd(), 'data', 'olist-import-reports');
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportFile = path.join(reportDirectory, `import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx' });
  return path.relative(process.cwd(), reportFile);
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
  if (unknownArguments.length) throw new Error(`Unknown argument: ${unknownArguments.join(', ')}`);

  await verifyFiles();
  const connected = !dryRun;
  if (connected) {
    await connectMongo();
    await olistHistoryModels.orders.collection.createIndex({ customer_id: 1 });
    await olistHistoryModels.orderItems.collection.createIndex({ order_id: 1 });
    await olistHistoryModels.orderItems.collection.createIndex({ product_id: 1 });
    await olistHistoryModels.orderItems.collection.createIndex({ seller_id: 1 });
    await olistHistoryModels.payments.collection.createIndex({ order_id: 1 });
    await olistHistoryModels.reviews.collection.createIndex({ order_id: 1 });
    await olistHistoryModels.products.collection.createIndex({ product_category_name: 1 });
  }

  const emptyIds = (): ImportState['ids'] => ({
    customers: new Set<string>(),
    sellers: new Set<string>(),
    products: new Set<string>(),
    orders: new Set<string>(),
  });
  const state: ImportState = { dryRun, ids: emptyIds(), translations: new Map<string, string>() };
  if (connected) {
    [state.ids.customers, state.ids.sellers, state.ids.products, state.ids.orders] = await Promise.all([
      getExistingIds('customers'),
      getExistingIds('sellers'),
      getExistingIds('products'),
      getExistingIds('orders'),
    ]);
    const existingTranslations = await olistHistoryModels.categoryTranslations
      .find({}, { product_category_name: 1, product_category_name_english: 1 })
      .lean()
      .exec();
    for (const translation of existingTranslations) {
      state.translations.set(String(translation.product_category_name), String(translation.product_category_name_english));
    }
  }

  const results: Partial<Record<OlistHistoryTable, ImportCounts>> = {};
  for (const file of files) {
    try {
      results[file.table] = await importFile(file, state);
    } catch (error) {
      if (error instanceof OlistFileImportError) results[file.table] = error.counts;
      const report = {
        status: 'failed',
        mode: 'MongoDB historical collections',
        sourceDirectory: path.relative(process.cwd(), DATA_DIRECTORY),
        finishedAt: new Date().toISOString(),
        database: 'connection lost or write failed',
        tables: results,
        totals: summarize(results),
      };
      console.log(JSON.stringify(report, null, 2));
      console.log(`Partial import report saved to ${saveReport(report)}`);
      throw error;
    }
  }
  const report = {
    status: 'completed',
    mode: dryRun ? 'dry-run (no database writes)' : 'MongoDB historical collections',
    sourceDirectory: path.relative(process.cwd(), DATA_DIRECTORY),
    finishedAt: new Date().toISOString(),
    database: dryRun ? 'not contacted' : 'MongoDB ping succeeded',
    tables: results,
    totals: summarize(results),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!dryRun) {
    console.log(`Import report saved to ${saveReport(report)}`);
  }
  if (report.totals.invalid > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('[Olist history import] Aborted:', error instanceof Error ? error.message : 'Unknown error.');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await closeMongo();
  });
