import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldEnableAutoIndex } from './mongo';

test('automatic index creation remains enabled outside production', () => {
  assert.equal(shouldEnableAutoIndex('development'), true);
  assert.equal(shouldEnableAutoIndex(undefined), true);
});

test('automatic index creation is disabled for production environment values', () => {
  assert.equal(shouldEnableAutoIndex('production'), false);
  assert.equal(shouldEnableAutoIndex(' Production '), false);
});
