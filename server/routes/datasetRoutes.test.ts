import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { User } from '../../src/types';
import { db } from '../db/database';
import { generateToken } from '../middleware/auth';
import datasetRoutes from './datasetRoutes';

test('dataset catalogue sync refuses production before requiring a database connection', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = ' Production ';
  try {
    await assert.rejects(db.syncDatasetProducts(), /disabled in production/i);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('production dataset upload, sample, and sync endpoints perform no mutations', async () => {
  const environmentKeys = ['JWT_SECRET', 'NODE_ENV'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalSyncDatasetProducts = db.syncDatasetProducts;
  const originalMkdirSync = fs.mkdirSync;
  const originalWriteFileSync = fs.writeFileSync;
  const admin: User = {
    id: 'dataset-route-admin',
    name: 'Dataset Admin',
    email: 'dataset-admin@example.invalid',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  let databaseMutations = 0;
  let fileMutations = 0;

  process.env.JWT_SECRET = 'dataset-route-test-secret-at-least-32-characters';
  process.env.NODE_ENV = ' Production ';
  db.findUserById = async (id) => id === admin.id ? admin : undefined;
  db.syncDatasetProducts = async () => {
    databaseMutations += 1;
    throw new Error('Production dataset sync should have been blocked.');
  };
  fs.mkdirSync = (() => {
    fileMutations += 1;
    return undefined;
  }) as typeof fs.mkdirSync;
  fs.writeFileSync = (() => {
    fileMutations += 1;
  }) as typeof fs.writeFileSync;

  const app = express();
  app.use(express.json());
  app.use('/api/dataset', datasetRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/dataset`;
    const headers = {
      Authorization: `Bearer ${generateToken(admin)}`,
      'Content-Type': 'application/json',
    };

    const upload = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: 'products.csv', content: 'name,sku' }),
    });
    const sample = await fetch(`${baseUrl}/sample`, { method: 'POST', headers });
    const sync = await fetch(`${baseUrl}/sync`, { method: 'POST', headers });

    for (const response of [upload, sample, sync]) {
      assert.equal(response.status, 403);
      assert.match((await response.json() as { message: string }).message, /disabled in production/i);
    }
    assert.equal(fileMutations, 0);
    assert.equal(databaseMutations, 0);
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.syncDatasetProducts = originalSyncDatasetProducts;
    fs.mkdirSync = originalMkdirSync;
    fs.writeFileSync = originalWriteFileSync;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
