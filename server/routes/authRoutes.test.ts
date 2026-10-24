import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import { User } from '../../src/types';
import { db } from '../db/database';
import authRoutes from './authRoutes';

test('registration, login, and protected profile routes validate and persist credentials safely', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindUserByEmail = db.findUserByEmail;
  const originalCreateUser = db.createUser;
  const originalFindUserById = db.findUserById;
  const users = new Map<string, User>();
  let createCalls = 0;
  process.env.JWT_SECRET = 'auth-route-test-secret-that-is-at-least-32-characters';

  db.findUserByEmail = async (email) => users.get(email.trim().toLowerCase());
  db.createUser = async (input) => {
    createCalls += 1;
    const user: User = {
      ...input,
      id: 'usr-auth-route-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.set(user.email, user);
    return user;
  };
  db.findUserById = async (id) => [...users.values()].find((user) => user.id === id);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;
    const send = (route: string, body?: unknown, token?: string) => fetch(`${baseUrl}${route}`, {
      method: route === '/profile' && body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const malformedRegister = await send('/register', {
      name: 4,
      email: 'audit@example.invalid',
      password: 'valid-password',
    });
    assert.equal(malformedRegister.status, 400);

    const malformedLogin = await send('/login', { email: 4, password: 'valid-password' });
    assert.equal(malformedLogin.status, 400);

    process.env.JWT_SECRET = 'replace_with_a_private_random_secret_at_least_32_characters';
    const unavailableAuth = await send('/register', {
      name: 'Test Customer',
      email: 'audit@example.invalid',
      password: 'valid-password',
    });
    assert.equal(unavailableAuth.status, 503);
    assert.equal(createCalls, 0);
    process.env.JWT_SECRET = 'auth-route-test-secret-that-is-at-least-32-characters';

    const registration = await send('/register', {
      name: ' Test Customer ',
      email: ' Test.Customer@Example.invalid ',
      password: 'valid-password',
      phone: '123-456-7890',
    });
    assert.equal(registration.status, 201);
    const registrationData = await registration.json() as { token: string; user: User };
    assert.equal(registrationData.user.name, 'Test Customer');
    assert.equal(registrationData.user.email, 'test.customer@example.invalid');
    assert.equal(registrationData.user.password, undefined);
    assert.ok(await bcrypt.compare('valid-password', users.get(registrationData.user.email)!.password!));

    const duplicate = await send('/register', {
      name: 'Test Customer',
      email: 'test.customer@example.invalid',
      password: 'valid-password',
    });
    assert.equal(duplicate.status, 409);

    const invalidPassword = await send('/login', {
      email: 'test.customer@example.invalid',
      password: 'wrong-password',
    });
    assert.equal(invalidPassword.status, 401);

    process.env.JWT_SECRET = 'replace_with_a_private_random_secret_at_least_32_characters';
    const unavailableLogin = await send('/login', {
      email: 'test.customer@example.invalid',
      password: 'valid-password',
    });
    assert.equal(unavailableLogin.status, 503);
    process.env.JWT_SECRET = 'auth-route-test-secret-that-is-at-least-32-characters';

    const login = await send('/login', {
      email: ' TEST.CUSTOMER@example.invalid ',
      password: 'valid-password',
    });
    assert.equal(login.status, 200);
    const loginData = await login.json() as { token: string; user: User };
    assert.equal(loginData.user.password, undefined);

    const unauthorizedProfile = await send('/profile');
    assert.equal(unauthorizedProfile.status, 401);

    const profile = await send('/profile', undefined, loginData.token);
    assert.equal(profile.status, 200);
    assert.equal((await profile.json() as { user: User }).user.password, undefined);

    const originalFindUserByIdMock = db.findUserById;
    db.findUserById = async () => {
      throw Object.assign(new Error('temporary database failure'), { name: 'MongoNetworkError' });
    };
    try {
      const databaseFailure = await send('/profile', undefined, loginData.token);
      assert.equal(databaseFailure.status, 503);
    } finally {
      db.findUserById = originalFindUserByIdMock;
    }
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserByEmail = originalFindUserByEmail;
    db.createUser = originalCreateUser;
    db.findUserById = originalFindUserById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
