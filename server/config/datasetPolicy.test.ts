import assert from 'node:assert/strict';
import test from 'node:test';
import { isDatasetMutationAllowed } from './datasetPolicy';

test('dataset mutations remain available outside production', () => {
  assert.equal(isDatasetMutationAllowed('development'), true);
  assert.equal(isDatasetMutationAllowed(undefined), true);
});

test('dataset mutations are disabled for normalized production environment values', () => {
  assert.equal(isDatasetMutationAllowed('production'), false);
  assert.equal(isDatasetMutationAllowed(' Production '), false);
});
