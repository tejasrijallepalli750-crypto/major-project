const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'AggregateError',
  'CastError',
  'DatabaseUnavailableError',
  'DemoReservationReconciliationError',
  'Error',
  'IdempotencyConflictError',
  'InventoryError',
  'JsonWebTokenError',
  'MongoAPIError',
  'MongoBulkWriteError',
  'MongoError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoParseError',
  'MongoServerError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
  'MongoWriteConcernError',
  'MongooseError',
  'NotBeforeError',
  'OrderCancellationError',
  'PaymentRetryRejectedError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TimeoutError',
  'TokenExpiredError',
  'TypeError',
  'URIError',
  'ValidationError',
  'ZodError',
]);

const SAFE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ESOCKET',
  'ETIMEDOUT',
]);

export const safeErrorSummary = (error: unknown): string => {
  if (!(error instanceof Error)) return 'UnknownError';

  const name = SAFE_ERROR_NAMES.has(error.name) ? error.name : 'UnknownError';
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 && code <= 999999) {
    return `${name} (code ${code})`;
  }
  if (typeof code === 'string' && SAFE_ERROR_CODES.has(code)) {
    return `${name} (code ${code})`;
  }
  return name;
};
