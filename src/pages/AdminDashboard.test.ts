import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fileUrl = new URL('./AdminDashboard.tsx', import.meta.url);
const source = readFileSync(fileUrl, 'utf8');

test('Demo Inventory no longer renders the bulk action or its confirmation dialog', () => {
  const demoTabStart = source.indexOf("{activeTab === 'demo' && (");
  const nextTabStart = source.indexOf('{/* TAB 3: ORDERS MANAGEMENT */}', demoTabStart);
  assert.notEqual(demoTabStart, -1);
  assert.notEqual(nextTabStart, -1);

  const demoTabSource = source.slice(demoTabStart, nextTabStart);
  assert.doesNotMatch(demoTabSource, /ENABLE ALL PRODUCTS/i);
  assert.doesNotMatch(source, /handleBulkEnableDemoInventory|runConfirmedDemoInventoryBulkAction/);
  assert.doesNotMatch(source, /This will process \$\{total\} existing products/);
  assert.match(demoTabSource, /Refresh inventory/);
});
