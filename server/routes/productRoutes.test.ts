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
