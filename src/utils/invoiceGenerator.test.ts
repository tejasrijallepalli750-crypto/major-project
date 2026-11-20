import assert from 'node:assert/strict';
import test from 'node:test';
import { Order } from '../types';
import { createInvoiceDocument } from './invoiceGenerator';

const createOrder = (itemCount: number): Order => ({
  id: 'invoice-test-order',
  orderNumber: 'AURA-INV-TEST',
  user: { id: 'invoice-test-user', name: 'Invoice Test', email: 'invoice@example.invalid' },
  orderItems: Array.from({ length: itemCount }, (_, index) => ({
    product: `product-${index}`,
    name: `Invoice item ${index}`,
    price: 12.35,
    quantity: 1,
    image: '',
    sku: `SKU-${index}`,
  })),
  shippingAddress: {
    fullName: 'Invoice Test',
    phone: '1234567890',
    street: 'Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  paymentMethod: 'Razorpay',
  itemsPrice: itemCount * 12.35,
  shippingPrice: 0,
  taxPrice: Math.round(itemCount * 12.35 * 18) / 100,
  totalPrice: itemCount * 12.35 + Math.round(itemCount * 12.35 * 18) / 100,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
});

test('invoice stays on one page for a short order and paginates large orders', () => {
  const shortOrderInvoice = createInvoiceDocument(createOrder(1));
  assert.equal(shortOrderInvoice.getNumberOfPages(), 1);
  const pdfContent = shortOrderInvoice.output().replace(/\0/g, '');
  assert.ok(pdfContent.includes('GST \\(18%\\):'));
  assert.ok(pdfContent.includes('¹2.22'));
  assert.ok(createInvoiceDocument(createOrder(30)).getNumberOfPages() > 1);
});

test('invoice explains that estimated catalogue prices differ from charged order amounts', () => {
  const order = createOrder(1);
  order.orderItems[0].name = 'Olist Home Essentials product 44BE5793';
  order.orderItems[0].category = 'Home Essentials';
  order.orderItems[0].sku = 'OLIST-00000000000000000000000000000000';
  order.orderItems[0].inventoryMode = 'simulated-demo';
  order.orderItems[0].inventoryStatus = 'unverified';
  const pdfContent = createInvoiceDocument(order).output().replace(/\0/g, '');
  assert.ok(pdfContent.includes('Some catalogue prices are estimates; the order amounts above are the amounts charged.'));
  assert.ok(pdfContent.includes('Home Essentials product 44BE5793'));
  assert.equal(pdfContent.includes('Olist'), false);
  assert.equal(pdfContent.includes('OLIST-'), false);
  assert.equal(pdfContent.includes('Simulated demo stock'), false);
});
