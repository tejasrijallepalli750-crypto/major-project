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

test('invoice identifies historical Olist prices as estimates', () => {
  const order = createOrder(1);
  order.orderItems[0].sku = 'OLIST-00000000000000000000000000000000';
  const pdfContent = createInvoiceDocument(order).output().replace(/\0/g, '');
  assert.ok(pdfContent.includes('Olist catalogue prices are historical estimates'));
});
