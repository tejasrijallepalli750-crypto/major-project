import assert from 'node:assert/strict';
import test from 'node:test';
import { runCatalogStartupMaintenance } from './catalogStartup';

test('production startup skips product deactivation and seeding', async () => {
  const calls: string[] = [];

  await runCatalogStartupMaintenance(
    'production',
    async () => { calls.push('deactivate'); },
    async () => { calls.push('seed'); },
  );

  assert.deepEqual(calls, []);
});

test('production detection is case-insensitive and ignores surrounding whitespace', async () => {
  const calls: string[] = [];

  await runCatalogStartupMaintenance(
    ' Production ',
    async () => { calls.push('deactivate'); },
    async () => { calls.push('seed'); },
  );

  assert.deepEqual(calls, []);
});

test('non-production startup preserves catalog maintenance order', async () => {
  const calls: string[] = [];

  await runCatalogStartupMaintenance(
    'development',
    async () => { calls.push('deactivate'); },
    async () => { calls.push('seed'); },
  );

  assert.deepEqual(calls, ['deactivate', 'seed']);
});
