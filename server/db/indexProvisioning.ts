import type { Document, IndexDirection } from 'mongodb';

export const APPLICATION_INDEX_DATABASE = 'aura_payment_test';

export interface RequiredIndex {
  model: string;
  collection: string;
  key: Record<string, IndexDirection>;
  options: Record<string, unknown>;
  caseInsensitivePaths?: string[];
}

export interface ExistingIndex {
  name?: string;
  key: Record<string, IndexDirection>;
  options: Record<string, unknown>;
}

export interface IncompatibleIndex {
  required: RequiredIndex;
  existing: ExistingIndex;
  reason: string;
}

export interface IndexProvisioningPlan {
  missing: RequiredIndex[];
  incompatible: IncompatibleIndex[];
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
};

const keySignature = (key: Record<string, IndexDirection>): string =>
  JSON.stringify(Object.entries(key));

const isDeclaredTextIndex = (key: Record<string, IndexDirection>): boolean => {
  const entries = Object.entries(key);
  return entries.length > 0 && entries.every(([, direction]) => direction === 'text');
};

const isPhysicalMongoTextIndex = (key: Record<string, IndexDirection>): boolean =>
  keySignature(key) === JSON.stringify([['_fts', 'text'], ['_ftsx', 1]]);

const keysAreEquivalent = (
  required: RequiredIndex,
  existing: ExistingIndex,
): boolean =>
  keySignature(required.key) === keySignature(existing.key)
  || (isDeclaredTextIndex(required.key) && isPhysicalMongoTextIndex(existing.key));

const defaultIndexName = (key: Record<string, IndexDirection>): string =>
  Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join('_');

const normalizedOptions = (
  key: Record<string, IndexDirection>,
  options: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized = { ...options };
  for (const metadata of ['name', 'ns', 'v', 'version', 'background', 'textIndexVersion', '2dsphereIndexVersion']) {
    delete normalized[metadata];
  }

  normalized.unique = normalized.unique === true;
  normalized.sparse = normalized.sparse === true;
  normalized.hidden = normalized.hidden === true;

  const textFields = Object.entries(key).filter(([, direction]) => direction === 'text');
  if (textFields.length) {
    normalized.weights ??= Object.fromEntries(textFields.map(([field]) => [field, 1]));
    normalized.default_language ??= 'english';
    normalized.language_override ??= 'language';
  }

  return normalized;
};

const optionsSignature = (
  key: Record<string, IndexDirection>,
  options: Record<string, unknown>,
): string => JSON.stringify(canonicalize(normalizedOptions(key, options)));

const optionsAreEquivalent = (
  required: RequiredIndex,
  existing: ExistingIndex,
): boolean => {
  if (isDeclaredTextIndex(required.key)) {
    const weights = existing.options.weights;
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return false;
    return optionsSignature(required.key, required.options)
      === optionsSignature(required.key, existing.options);
  }
  return optionsSignature(existing.key, existing.options)
    === optionsSignature(required.key, required.options);
};

const expectedName = (index: RequiredIndex): string =>
  typeof index.options.name === 'string' ? index.options.name : defaultIndexName(index.key);

export const getMongoDatabaseName = (uri: string): string => {
  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI is not a valid MongoDB connection string.');
  }

  if (parsedUri.protocol !== 'mongodb:' && parsedUri.protocol !== 'mongodb+srv:') {
    throw new Error('MONGODB_URI must use the mongodb or mongodb+srv scheme.');
  }

  const encodedName = parsedUri.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  try {
    return encodedName ? decodeURIComponent(encodedName) : 'test';
  } catch {
    throw new Error('MONGODB_URI contains an invalid database name.');
  }
};

export const assertApplicationIndexDatabase = (databaseName: string | undefined): void => {
  if (databaseName !== APPLICATION_INDEX_DATABASE) {
    throw new Error(`Index provisioning is restricted to the ${APPLICATION_INDEX_DATABASE} database.`);
  }
};

export const assertMongoUriTargetsApplicationIndexDatabase = (uri: string): void => {
  assertApplicationIndexDatabase(getMongoDatabaseName(uri));
};

export const parseIndexProvisioningMode = (args: string[]): boolean => {
  if (!args.length) return false;
  if (args.length === 1 && args[0] === '--apply') return true;
  throw new Error('Supported option: --apply. Without it, the command runs in dry-run mode.');
};

export const planApplicationIndexes = (
  requiredIndexes: RequiredIndex[],
  existingIndexes: ExistingIndex[],
): IndexProvisioningPlan => {
  const missing: RequiredIndex[] = [];
  const incompatible: IncompatibleIndex[] = [];

  for (const required of requiredIndexes) {
    const targetName = expectedName(required);
    const candidates = existingIndexes.filter((existing) =>
      keysAreEquivalent(required, existing)
      || existing.name === targetName
      || (isDeclaredTextIndex(required.key) && isPhysicalMongoTextIndex(existing.key)),
    );

    if (!candidates.length) {
      missing.push(required);
      continue;
    }

    for (const existing of candidates) {
      if (!keysAreEquivalent(required, existing)) {
        incompatible.push({ required, existing, reason: 'The required index name is already used by a different key.' });
      } else if (!optionsAreEquivalent(required, existing)) {
        incompatible.push({ required, existing, reason: 'The existing index has incompatible options.' });
      }
    }
  }

  return { missing, incompatible };
};

export const makeDuplicateKeyPipeline = (index: RequiredIndex): Document[] => {
  const matchClauses: Document[] = [];
  if (index.options.partialFilterExpression && typeof index.options.partialFilterExpression === 'object') {
    matchClauses.push(index.options.partialFilterExpression as Document);
  }

  if (index.options.sparse === true) {
    matchClauses.push({
      $or: Object.keys(index.key).map((field) => ({ [field]: { $exists: true } })),
    });
  }

  const pipeline: Document[] = [];
  if (matchClauses.length === 1) {
    pipeline.push({ $match: matchClauses[0] });
  } else if (matchClauses.length > 1) {
    pipeline.push({ $match: { $and: matchClauses } });
  }

  pipeline.push({
    $group: {
      _id: Object.fromEntries(Object.keys(index.key).map((field, position) => [`key${position}`, `$${field}`])),
      duplicateCount: { $sum: 1 },
    },
  });
  pipeline.push({ $match: { duplicateCount: { $gt: 1 } } });
  pipeline.push({ $limit: 1 });
  return pipeline;
};

export const makeCaseInsensitiveDuplicatePipeline = (field: string): Document[] => [
  { $match: { [field]: { $type: 'string' } } },
  {
    $group: {
      _id: { $toLower: { $trim: { input: `$${field}` } } },
      duplicateCount: { $sum: 1 },
    },
  },
  { $match: { duplicateCount: { $gt: 1 } } },
  { $limit: 1 },
];

export interface ProvisioningResult {
  created: RequiredIndex[];
  duplicateIndexes: RequiredIndex[];
  blockedByIncompatibleIndexes: boolean;
}

export const provisionMissingIndexes = async (
  plan: IndexProvisioningPlan,
  options: {
    apply: boolean;
    hasDuplicates: (index: RequiredIndex) => Promise<boolean>;
    createIndex: (index: RequiredIndex) => Promise<void>;
  },
): Promise<ProvisioningResult> => {
  const duplicateIndexes: RequiredIndex[] = [];
  for (const index of plan.missing) {
    if (index.options.unique !== true) continue;
    if (await options.hasDuplicates(index)) duplicateIndexes.push(index);
  }

  if (plan.incompatible.length || duplicateIndexes.length) {
    return {
      created: [],
      duplicateIndexes,
      blockedByIncompatibleIndexes: plan.incompatible.length > 0,
    };
  }

  if (!options.apply) {
    return { created: [], duplicateIndexes, blockedByIncompatibleIndexes: false };
  }

  const created: RequiredIndex[] = [];
  for (const index of plan.missing) {
    await options.createIndex(index);
    created.push(index);
  }

  return { created, duplicateIndexes, blockedByIncompatibleIndexes: false };
};
