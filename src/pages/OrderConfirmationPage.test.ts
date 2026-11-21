import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { Order } from '../types';
import { OrderConfirmationPage } from './OrderConfirmationPage';

const makeOrder = (purchaseMode?: 'physical' | 'demo'): Order => ({
  id: 'order-confirmation-test',
  orderNumber: 'AURA-CONFIRMATION-TEST',
  user: { id: 'confirmation-user', name: 'Confirmation User', email: 'private@example.invalid' },
  orderItems: [{
    product: 'confirmation-product',
    name: 'Confirmation Product',
    price: 100,
    quantity: 1,
    image: '/confirmation-product.webp',
    sku: 'CONFIRMATION-PRODUCT',
    purchaseMode,
  }],
  shippingAddress: {
    fullName: 'Private Recipient',
    phone: '1234567890',
    email: 'private@example.invalid',
    street: 'Private Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  purchaseMode,
  paymentMethod: 'Razorpay',
  paymentResult: {
    id: 'confirmation-payment',
    status: 'captured',
    amount: 118,
    currency: 'INR',
  },
  itemsPrice: 100,
  shippingPrice: 0,
  taxPrice: 18,
  totalPrice: 118,
  isPaid: true,
  isDelivered: false,
  status: purchaseMode === 'demo' ? 'Demo Completed' : 'Processing',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const renderPage = (order: Order): string => renderToStaticMarkup(React.createElement(OrderConfirmationPage, {
  order,
  onNavigate: () => undefined,
}));

test('demo confirmation identifies TEST checkout and never presents delivery details', () => {
  const markup = renderPage(makeOrder('demo'));

  assert.match(markup, /DEMO \/ RAZORPAY TEST checkout/);
  assert.match(markup, /No real payment or physical shipment is promised/);
  assert.match(markup, /No physical goods will be shipped/);
  assert.match(markup, /Download demo receipt/);
  assert.match(markup, /Shipping \(demo calculation\)/);
  assert.doesNotMatch(markup, /Delivery address|Private Recipient|Private Test Street|private@example\.invalid/);
});

test('physical confirmation retains the existing delivery details', () => {
  const markup = renderPage(makeOrder('physical'));

  assert.match(markup, /Order confirmed/);
  assert.match(markup, /Delivery address/);
  assert.match(markup, /Private Recipient/);
  assert.match(markup, /Private Test Street/);
  assert.match(markup, /Shipping:/);
});
