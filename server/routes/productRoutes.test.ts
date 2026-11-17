import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { Order, Product, Review, User } from '../../src/types';
import { db } from '../db/database';
import { generateToken } from '../middleware/auth';
import { calculateReviewSummary } from '../reviews/reviewRules';
import productRoutes from './productRoutes';

test('product reviews are public and restricted to eligible verified purchasers', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindUserById = db.findUserById;
  const originalFindProductById = db.findProductById;
  const originalFindProductReviews = db.findProductReviews;
  const originalFindOrdersByUser = db.findOrdersByUser;
  const originalCreateProductReview = db.createProductReview;
  const user: User = {
    id: 'usr-product-review-test',
    name: 'Review Customer',
    email: 'review-customer@example.invalid',
    role: 'customer',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const product: Product = {
    id: 'prod-product-review-test',
    name: 'Review Product',
    description: 'Test product',
    price: 100,
    category: 'Test',
    image: '/images/products/test.jpg',
    stock: 5,
    sku: 'REVIEW-TEST',
    status: 'active',
    rating: 0,
    numReviews: 0,
    brand: 'AURA',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const order: Order = {
    id: 'ord-product-review-test',
    orderNumber: 'AURA-REVIEW-TEST',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [{
      product: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image,
      sku: product.sku,
    }],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      street: '1 Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 0,
    taxPrice: 18,
    totalPrice: 118,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const createdReview: Review = {
    id: 'rev-product-review-test',
    productId: product.id,
    userId: user.id,
    userName: user.name,
    rating: 5,
    comment: 'Great product',
    createdAt: new Date(0).toISOString(),
  };

  process.env.JWT_SECRET = 'product-review-test-secret-that-is-at-least-32-characters';
  db.findUserById = async (id) => ({ ...user, id });
  db.findProductById = async (id) => id === product.id ? product : undefined;
  db.findProductReviews = async () => [createdReview];
  db.findOrdersByUser = async () => [order];
  db.createProductReview = async () => ({
    review: createdReview,
    ...calculateReviewSummary([4, createdReview.rating]),
  });

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/products/${product.id}/reviews`;

    const publicResponse = await fetch(baseUrl);
    assert.equal(publicResponse.status, 200);
    assert.equal((await publicResponse.json() as { data: Review[] }).data[0].id, createdReview.id);

    const token = generateToken(user);
    const submit = () => fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rating: 5, comment: 'Great product' }),
    });

    const ineligible = await submit();
    assert.equal(ineligible.status, 403);

    order.isPaid = true;
    const eligible = await submit();
    assert.equal(eligible.status, 201);
    const result = await eligible.json() as {
      data: Review;
      productRating: { rating: number; numReviews: number };
    };
    assert.equal(result.data.userId, user.id);
    assert.deepEqual(result.productRating, { rating: 4.5, numReviews: 2 });
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.findProductById = originalFindProductById;
    db.findProductReviews = originalFindProductReviews;
    db.findOrdersByUser = originalFindOrdersByUser;
    db.createProductReview = originalCreateProductReview;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('only admins can record a physically confirmed inventory quantity', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindUserById = db.findUserById;
  const originalUpdateProductInventory = db.updateProductInventory;
  const admin: User = {
    id: 'usr-inventory-admin-test',
    name: 'Inventory Admin',
    email: 'inventory-admin@example.invalid',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const customer: User = { ...admin, id: 'usr-inventory-customer-test', role: 'customer' };
  const product: Product = {
    id: 'prod-inventory-route-test',
    name: 'Inventory Test Product',
    description: 'Test product',
    price: 100,
    category: 'Test',
    image: '/images/products/test.jpg',
    stock: 0,
    sku: 'INVENTORY-TEST',
    status: 'active',
    inventoryStatus: 'unverified',
    rating: 0,
    numReviews: 0,
    brand: 'AURA',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  let updateCalls = 0;
  process.env.JWT_SECRET = 'inventory-route-test-secret-that-is-at-least-32-characters';
  db.findUserById = async (id) => id === admin.id ? admin : id === customer.id ? customer : undefined;
  db.updateProductInventory = async (id, stock, verifiedBy) => {
    updateCalls += 1;
    assert.equal(id, product.id);
    assert.equal(verifiedBy, admin.id);
    return { ...product, stock, inventoryStatus: 'verified', inventoryVerifiedAt: new Date(0).toISOString() };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/products/${product.id}/inventory`;
    const adminToken = generateToken(admin);
    const customerToken = generateToken(customer);
    const send = (body: unknown, token: string) => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    assert.equal((await send({ stock: 3, confirmPhysicalCount: true }, customerToken)).status, 403);
    assert.equal((await send({ stock: 3 }, adminToken)).status, 400);
    assert.equal(updateCalls, 0);

    const saved = await send({ stock: 3, confirmPhysicalCount: true }, adminToken);
    assert.equal(saved.status, 200);
    const result = await saved.json() as { data: Product };
    assert.equal(result.data.stock, 3);
    assert.equal(result.data.inventoryStatus, 'verified');
    assert.equal(updateCalls, 1);
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.updateProductInventory = originalUpdateProductInventory;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('new products require admin access and stay unverified until inventory is counted', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindUserById = db.findUserById;
  const originalCreateProduct = db.createProduct;
  const originalUpdateProduct = db.updateProduct;
  const admin: User = {
    id: 'usr-product-create-admin-test',
    name: 'Product Admin',
    email: 'product-admin@example.invalid',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const customer: User = { ...admin, id: 'usr-product-create-customer-test', role: 'customer' };
  const createdProducts: Product[] = [];
  let updateCalls = 0;

  process.env.JWT_SECRET = 'product-create-test-secret-that-is-at-least-32-characters';
  db.findUserById = async (id) => id === admin.id ? admin : id === customer.id ? customer : undefined;
  db.createProduct = async (data) => {
    const createdProduct: Product = {
      ...data,
      id: 'prod-product-create-test',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    createdProducts.push(createdProduct);
    return createdProduct;
  };
  db.updateProduct = async () => {
    updateCalls += 1;
    return undefined;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/products`;
    const payload = {
      name: 'New Test Product',
      description: 'A new product for the route test.',
      price: 99,
      category: 'Test',
      image: '/images/catalog-category-art/technology.svg',
      stock: 0,
      sku: 'NEW-TEST-PRODUCT',
      status: 'active',
    };
    const send = (method: string, body: unknown, token?: string) => fetch(
      method === 'POST' ? url : `${url}/prod-product-create-test`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      },
    );

    assert.equal((await send('POST', payload)).status, 401);
    assert.equal((await send('POST', payload, generateToken(customer))).status, 403);
    const adminToken = generateToken(admin);

    const nonzeroStock = await send('POST', { ...payload, stock: 5 }, adminToken);
    assert.equal(nonzeroStock.status, 400);
    assert.equal(createdProducts.length, 0);

    const created = await send('POST', payload, adminToken);
    assert.equal(created.status, 201);
    const savedProduct = createdProducts[0];
    assert.ok(savedProduct);
    assert.equal(savedProduct.stock, 0);
    assert.equal(savedProduct.inventoryStatus, 'unverified');
    assert.equal((await created.json() as { data: Product }).data.inventoryStatus, 'unverified');

    const stockBypass = await send('PUT', { stock: 5 }, adminToken);
    assert.equal(stockBypass.status, 400);
    assert.equal(updateCalls, 0);
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.createProduct = originalCreateProduct;
    db.updateProduct = originalUpdateProduct;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
