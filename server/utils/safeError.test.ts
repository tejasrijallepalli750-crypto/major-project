import assert from 'node:assert/strict';
import test from 'node:test';
import { safeErrorSummary } from './safeError';

test('safe error summaries retain known error type and diagnostic code only', () => {
  const error = new Error('mongodb://user:password@cluster.invalid/db token=private user@example.invalid');
  error.name = 'MongoServerError';
  Object.assign(error, { code: 11000 });

  assert.equal(safeErrorSummary(error), 'MongoServerError (code 11000)');
});

test('safe error summaries omit unrecognized names, messages, and unsafe codes', () => {
  const error = new Error('private email user@example.invalid bearer secret-token');
  error.name = 'secret-token';
  Object.assign(error, { code: 'user@example.invalid' });

  const summary = safeErrorSummary(error);
  assert.equal(summary, 'UnknownError');
  assert.equal(summary.includes(error.message), false);
  assert.equal(summary.includes(error.name), false);
});

test('safe error summaries identify allowlisted network errors without logging their messages', () => {
  const error = new Error('connection string: mongodb://user:password@cluster.invalid');
  error.name = 'MongoNetworkError';
  Object.assign(error, { code: 'ECONNRESET' });

  assert.equal(safeErrorSummary(error), 'MongoNetworkError (code ECONNRESET)');
});

test('non-Error values do not expose their string representation', () => {
  assert.equal(safeErrorSummary('password=private'), 'UnknownError');
  assert.equal(safeErrorSummary({ message: 'user@example.invalid' }), 'UnknownError');
});
