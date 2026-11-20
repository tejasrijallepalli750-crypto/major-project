import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import {
  navigateToOrderedProduct,
  OrderItemProductCard,
} from '../components/OrderItemProductCard';
import { OrderItem } from '../types';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const makeItem = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  product: 'product-id-one',
  name: 'AURA Travel Mug',
  price: 799,
  quantity: 1,
  image: '/images/travel-mug.webp',
  sku: 'AURA-MUG-001',
  category: 'Home & Living',
  ...overrides,
});

test('ordered product image and name render inside an accessible clickable product card', () => {
  const item = makeItem();
  const markup = renderToStaticMarkup(React.createElement(OrderItemProductCard, {
    item,
    onNavigate: () => undefined,
  }));

  assert.match(markup, /<button[^>]*aria-label="View product details for AURA Travel Mug"/);
  assert.match(markup, /<img[^>]*alt="AURA Travel Mug"/);
  assert.match(markup, /AURA Travel Mug/);
  assert.match(markup, /cursor-pointer/);
  assert.match(markup, /hover:bg-slate-100/);
  const card = fs.readFileSync(path.join(projectRoot, 'src/components/OrderItemProductCard.tsx'), 'utf8');
  assert.match(card, /const productId = typeof item\.product === 'string' \? item\.product : ''/);
  assert.match(card, /onClick=\{\(\) => navigateToOrderedProduct\(productId, onNavigate\)\}/);
});

test('ordered products navigate by their stored IDs, including multiple products with the same name', () => {
  const firstItem = makeItem({ product: 'prod-1001', name: 'AURA Essentials' });
  const secondItem = makeItem({ product: 'prod-1002', name: 'AURA Essentials' });
  const navigations: Array<{ view: string; productId?: string }> = [];
  const onNavigate = (view: string, productId?: string) => navigations.push({ view, productId });

  assert.equal(navigateToOrderedProduct(firstItem.product, onNavigate), true);
  assert.equal(navigateToOrderedProduct(secondItem.product, onNavigate), true);
  assert.deepEqual(navigations, [
    { view: 'product-detail', productId: 'prod-1001' },
    { view: 'product-detail', productId: 'prod-1002' },
  ]);
});

test('missing product IDs show an unavailable message and do not navigate', () => {
  const item = makeItem({ product: '' });
  const navigations: string[] = [];
  const onNavigate = (_view: string, productId?: string) => {
    if (productId) navigations.push(productId);
  };
  const markup = renderToStaticMarkup(React.createElement(OrderItemProductCard, { item, onNavigate }));

  assert.match(markup, /Product details are unavailable/);
  assert.doesNotMatch(markup, /<button/);
  assert.equal(navigateToOrderedProduct(item.product, onNavigate), false);
  assert.deepEqual(navigations, []);
});

test('deleted or inactive products use the existing unavailable-product details state', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'src/pages/ProductDetailPage.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(projectRoot, 'server/routes/productRoutes.ts'), 'utf8');
  assert.match(page, /api\.getProductById\(productId\)/);
  assert.match(page, /Product Not Found/);
  assert.match(page, /removed or is no longer available/);
  assert.match(route, /product\.status !== 'active'/);
});

test('My Orders keeps invoice and order actions alongside product navigation', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'src/pages/OrderHistoryPage.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8');
  assert.match(page, /<OrderItemProductCard/);
  assert.match(page, /Download order invoice/);
  assert.match(page, /generateInvoicePDF\(order\)/);
  assert.match(page, /Pay Again/);
  assert.match(page, /Cancel Order/);
  assert.match(page, /order\.status === 'Cancelled' && !order\.isPaid/);
  assert.match(page, /Delete order \$\{order\.orderNumber\} from My Orders/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /api\.removeOrderFromMyHistory\(order\.id\)/);
  assert.match(page, /setOrders\(\(current\) => current\.filter\(\(saved\) => saved\.id !== order\.id\)\)/);
  assert.match(app, /onSelectProduct=\{\(id\) => handleNavigate\('product-detail', id\)\}/);
  assert.match(app, /productId=\{selectedProductId\}/);
});

test('My Orders removes notification banners while preserving order badges and actions', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'src/pages/OrderHistoryPage.tsx'), 'utf8');

  assert.doesNotMatch(
    page,
    /orderNotificationClassName|getPaymentRetryMessage|retryMessage|cancellationMessage|actionError|removalMessage|role="(?:alert|status)"/,
  );
  assert.match(page, /order\.status\.toUpperCase\(\)/);
  assert.match(page, /PAID · RAZORPAY VERIFIED/);
  assert.match(page, /Pay Again/);
  assert.match(page, /<CheckPaymentStatusButton/);
  assert.match(page, /Download order invoice/);
  assert.match(page, /Cancel Order/);
  assert.match(page, /Delete/);
  assert.match(page, /<OrderItemProductCard/);
});
