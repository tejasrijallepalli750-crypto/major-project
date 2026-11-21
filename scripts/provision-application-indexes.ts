import '../server/config/loadEnv';
import mongoose from 'mongoose';
import type { Collection, CreateIndexesOptions, Document, IndexDescription, IndexDirection, IndexSpecification } from 'mongodb';
import { OrderModel } from '../server/models/Order';
import { ProductModel } from '../server/models/Product';
import { ReviewModel } from '../server/models/Review';
import { UserModel } from '../server/models/User';
import { safeErrorSummary } from '../server/utils/safeError';
import {
  APPLICATION_INDEX_DATABASE,
  assertApplicationIndexDatabase,
  assertMongoUriTargetsApplicationIndexDatabase,
  makeCaseInsensitiveDuplicatePipeline,
  makeDuplicateKeyPipeline,
  parseIndexProvisioningMode,
  planApplicationIndexes,
  provisionMissingIndexes,
  type ExistingIndex,
  type RequiredIndex,
} from '../server/db/indexProvisioning';

class SafeProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeProvisioningError';
  }
}

const collectModelIndexes = (
  modelName: string,
  collection: string,
  schemaIndexes: Array<[Record<string, number | string>, Record<string, unknown>]>,
): RequiredIndex[] => schemaIndexes.map(([key, options]) => {
  const indexKey: Record<string, IndexDirection> = Object.fromEntries(Object.entries(key).map(([field, direction]) => {
    if (typeof direction === 'number') return [field, direction];
    if (['text', '2d', '2dsphere', 'geoHaystack', 'hashed'].includes(direction)) {
      return [field, direction as IndexDirection];
    }
    throw new SafeProvisioningError(`Unsupported index direction on ${modelName}.${collection}.${field}.`);
  }));
  return {
    model: modelName,
    collection,
    key: indexKey,
    options: { ...options },
    ...(modelName === 'User' && key.email === 1 ? { caseInsensitivePaths: ['email'] } : {}),
  };
});

const requiredIndexes: RequiredIndex[] = [
  ...collectModelIndexes('User', UserModel.collection.name, UserModel.schema.indexes()),
  ...collectModelIndexes('Product', ProductModel.collection.name, ProductModel.schema.indexes()),
  ...collectModelIndexes('Order', OrderModel.collection.name, OrderModel.schema.indexes()),
  ...collectModelIndexes('Review', ReviewModel.collection.name, ReviewModel.schema.indexes()),
];

const displayIndex = (index: RequiredIndex): string =>
  `${index.model}.${index.collection} ${JSON.stringify(index.key)}${index.options.unique === true ? ' (unique)' : ''}`;

const displayExistingIndex = (index: ExistingIndex): string =>
  `${index.name ?? '(unnamed)'} ${JSON.stringify({ key: index.key, ...index.options })}`;

const toNativeKey = (key: RequiredIndex['key']): IndexSpecification => key;

const toNativeOptions = (options: RequiredIndex['options']): CreateIndexesOptions => {
  const nativeOptions = { ...options };
  delete nativeOptions.background;
  return nativeOptions as CreateIndexesOptions;
};

const indexOptionsFromDescription = (description: IndexDescription): ExistingIndex => {
  const key = description.key instanceof Map
    ? Object.fromEntries(description.key)
    : description.key;
  const { key: _key, name, ...options } = description;
  return { name, key, options };
};

const hasDuplicateKeys = async (
  collection: Collection,
  index: RequiredIndex,
): Promise<boolean> => {
  const hasMatch = async (pipeline: Document[]): Promise<boolean> => {
    const cursor = collection.aggregate(pipeline, { allowDiskUse: true, maxTimeMS: 60000 });
    try {
      return await cursor.hasNext();
    } finally {
      await cursor.close();
    }
  };

  const exactDuplicates = await hasMatch(makeDuplicateKeyPipeline(index));
  if (exactDuplicates) return true;

  for (const field of index.caseInsensitivePaths ?? []) {
    const caseInsensitiveDuplicates = await hasMatch(makeCaseInsensitiveDuplicatePipeline(field));
    if (caseInsensitiveDuplicates) return true;
  }
  return false;
};

const run = async (): Promise<void> => {
  let apply: boolean;
  try {
    apply = parseIndexProvisioningMode(process.argv.slice(2));
  } catch (error) {
    throw new SafeProvisioningError(error instanceof Error ? error.message : 'Invalid index provisioning mode.');
  }
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new SafeProvisioningError('MONGODB_URI must be set in the environment.');
  try {
    assertMongoUriTargetsApplicationIndexDatabase(uri);
  } catch (error) {
    throw new SafeProvisioningError(error instanceof Error ? error.message : 'MONGODB_URI target validation failed.');
  }

  let operationFailed = false;
  try {
    await mongoose.connect(uri, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    const database = mongoose.connection.db;
    if (!database) throw new SafeProvisioningError('MongoDB connected without a database handle.');
    try {
      assertApplicationIndexDatabase(database.databaseName);
    } catch (error) {
      throw new SafeProvisioningError(error instanceof Error ? error.message : 'Connected database validation failed.');
    }

    const collectionNames = new Set(
      await database.listCollections({}, { nameOnly: true }).map(({ name }) => name).toArray(),
    );
    const requiredCollections = [...new Set(requiredIndexes.map(({ collection }) => collection))];
    const absentCollections = requiredCollections.filter((name) => !collectionNames.has(name));
    if (absentCollections.length) {
      throw new SafeProvisioningError(`Required application collections are absent: ${absentCollections.join(', ')}. No indexes were created.`);
    }

    const existingByCollection = new Map<string, ExistingIndex[]>();
    for (const collectionName of requiredCollections) {
      const descriptions = await database.collection(collectionName).listIndexes().toArray();
      existingByCollection.set(collectionName, descriptions.map(indexOptionsFromDescription));
    }

    const allPlans = requiredCollections.map((collectionName) => {
      const collectionIndexes = requiredIndexes.filter((index) => index.collection === collectionName);
      const plan = planApplicationIndexes(collectionIndexes, existingByCollection.get(collectionName) ?? []);
      return { collectionName, plan };
    });

    console.info(`[IndexProvisioner] Connected database verified: ${APPLICATION_INDEX_DATABASE}.`);
    console.info(`[IndexProvisioner] Mode: ${apply ? 'APPLY' : 'DRY RUN'}; ${requiredIndexes.length} schema indexes checked.`);
    for (const { collectionName, plan } of allPlans) {
      console.info(`[IndexProvisioner] ${collectionName}:`);
      console.info(`  Existing indexes: ${(existingByCollection.get(collectionName) ?? []).map(displayExistingIndex).join('; ') || '(none)'}`);
      console.info(`  Missing indexes: ${plan.missing.map(displayIndex).join('; ') || '(none)'}`);
      for (const conflict of plan.incompatible) {
        console.error(`  Incompatible: ${displayIndex(conflict.required)}; existing ${conflict.existing.name ?? '(unnamed)'}: ${conflict.reason}`);
      }
    }

    const incompatible = allPlans.flatMap(({ plan }) => plan.incompatible);
    const missing = allPlans.flatMap(({ plan }) => plan.missing);
    const combinedPlan = { missing, incompatible };
    for (const index of missing) console.info(`[IndexProvisioner] Missing: ${displayIndex(index)}.`);
    const result = await provisionMissingIndexes(combinedPlan, {
      apply,
      hasDuplicates: async (index) => hasDuplicateKeys(database.collection(index.collection), index),
      createIndex: async (index) => {
        try {
          await database.collection(index.collection).createIndex(toNativeKey(index.key), toNativeOptions(index.options));
        } catch {
          throw new SafeProvisioningError(`Could not create ${displayIndex(index)}. No indexes were removed; indexes created earlier in this run, if any, remain.`);
        }
      },
    });

    if (result.duplicateIndexes.length) {
      for (const index of result.duplicateIndexes) {
        console.error(`[IndexProvisioner] Duplicate values prevent unique index creation: ${displayIndex(index)}. No indexes were created.`);
      }
    }
    if (result.blockedByIncompatibleIndexes || result.duplicateIndexes.length) {
      throw new SafeProvisioningError('Index conflicts were detected. Resolve them manually; no indexes were created.');
    }

    if (apply) {
      for (const index of result.created) console.info(`[IndexProvisioner] Created ${displayIndex(index)}.`);
      console.info(`[IndexProvisioner] Complete. Created ${result.created.length} index(es); no application documents were modified.`);
    } else {
      console.info(`[IndexProvisioner] Dry run complete. ${missing.length} index(es) would be created if safe; no indexes or documents were modified.`);
    }
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    } catch (cleanupError) {
      if (!operationFailed) throw cleanupError;
      const cleanupErrorSummary = safeErrorSummary(cleanupError);
      console.error(`[IndexProvisioner] Disconnect also failed (${cleanupErrorSummary}); the original error is preserved.`);
    }
  }
};

run().catch((error: unknown) => {
  const safeMessage = error instanceof SafeProvisioningError
    ? error.message
    : `Provisioning stopped (${safeErrorSummary(error)}). No application documents were modified.`;
  console.error(`[IndexProvisioner] ${safeMessage}`);
  process.exitCode = 1;
});
