import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { DemoInventoryBulkResult, User } from '../../src/types';
import { db } from '../db/database';
import { generateToken } from '../middleware/auth';
import adminRoutes from './adminRoutes';

test('bulk demo inventory route requires admin access and rejects production mode', async () => {
  const environmentKeys = ['JWT_SECRET', 'DEMO_MODE_ENABLED', 'NODE_ENV'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalIsNonProductionDatabase = db.isNonProductionDatabase;
  const originalBulkEnableAllDemoInventory = db.bulkEnableAllDemoInventory;
  const customer: User = {
    id: 'bulk-demo-customer',
    name: 'Bulk Demo Customer',
    email: 'bulk-demo-customer@example.invalid',
    role: 'customer',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const admin: User = { ...customer, id: 'bulk-demo-admin', role: 'admin' };
  const result: DemoInventoryBulkResult = {
    totalProducts: 2,
    processedCount: 2,
    updatedCount: 2,
    skippedCount: 0,
    failedCount: 0,
    skippedProducts: [],
    failedProducts: [],
  };
  let bulkCalls = 0;

  process.env.JWT_SECRET = 'bulk-demo-route-test-secret-at-least-32-characters';
  process.env.DEMO_MODE_ENABLED = 'true';
  process.env.NODE_ENV = 'development';
  db.findUserById = async (id) => id === admin.id ? admin : id === customer.id ? customer : undefined;
  db.isNonProductionDatabase = () => true;
  db.bulkEnableAllDemoInventory = async () => {
    bulkCalls += 1;
    return result;
  };

  const app = express();
  app.use('/api/admin', adminRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const endpoint = `http://127.0.0.1:${address.port}/api/admin/demo-inventory/bulk-enable`;
    const anonymous = await fetch(endpoint, { method: 'POST' });
    assert.equal(anonymous.status, 401);

    const customerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${generateToken(customer)}` },
    });
    assert.equal(customerResponse.status, 403);

    const adminResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${generateToken(admin)}` },
    });
    assert.equal(adminResponse.status, 200);
    assert.deepEqual((await adminResponse.json() as { data: DemoInventoryBulkResult }).data, result);
    assert.equal(bulkCalls, 1);

    process.env.NODE_ENV = 'production';
    const productionResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${generateToken(admin)}` },
    });
    assert.equal(productionResponse.status, 403);
    assert.equal(bulkCalls, 1);
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.isNonProductionDatabase = originalIsNonProductionDatabase;
    db.bulkEnableAllDemoInventory = originalBulkEnableAllDemoInventory;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
