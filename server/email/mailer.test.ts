import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '../../src/types';
import { sendOrderConfirmation } from './mailer';
import type { MailTransport } from './mailer';

const smtpEnvironmentKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const;
const mockSentMessageInfo = {
  envelope: { from: 'store@example.invalid', to: ['customer@example.invalid'] },
  messageId: 'mock-message-id',
  accepted: ['customer@example.invalid'],
  rejected: [],
  pending: [],
  response: '250 Message accepted',
};

const createTestOrder = (): Order => ({
  id: 'ord-email-test',
  orderNumber: 'AURA-EMAIL-TEST',
  user: {
    id: 'usr-email-test',
    name: 'Customer & Co',
    email: 'customer@example.invalid',
  },
  orderItems: [{
    product: 'prod-email-test',
    name: 'Headphones <Premium>',
    price: 100,
    quantity: 2,
    image: '/images/products/headphones.jpg',
    sku: 'HEADPHONES-TEST',
  }],
  shippingAddress: {
    fullName: 'Customer & Co',
    phone: '1234567890',
    street: '1 Test Street',
    city: 'Test City',
    district: 'Test District',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  paymentMethod: 'Razorpay',
  itemsPrice: 200,
  shippingPrice: 10,
  taxPrice: 36,
  totalPrice: 246,
  isPaid: true,
  isDelivered: false,
  status: 'Processing',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const restoreEnvironment = (originalEnvironment: Map<string, string | undefined>) => {
  for (const key of smtpEnvironmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

test('sends an escaped HTML order confirmation through the configured transport', async () => {
  const originalEnvironment = new Map(smtpEnvironmentKeys.map((key) => [key, process.env[key]]));
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_USER = 'store@example.invalid';
  process.env.SMTP_PASS = 'test-app-password';
  process.env.MAIL_FROM = 'AURA Store <store@example.invalid>';

  let sentMessage: Parameters<MailTransport['sendMail']>[0] | undefined;
  const transport: MailTransport = {
    sendMail: async (message) => {
      sentMessage = message;
      return mockSentMessageInfo;
    },
  };

  try {
    const order = createTestOrder();
    order.orderItems[0].sku = 'OLIST-00000000000000000000000000000000';
    await sendOrderConfirmation(order, 'customer@example.invalid', transport);
  } finally {
    restoreEnvironment(originalEnvironment);
  }

  assert.ok(sentMessage);
  assert.equal(sentMessage.to, 'customer@example.invalid');
  assert.equal(sentMessage.from, 'AURA Store <store@example.invalid>');
  assert.equal(sentMessage.subject, 'AURA Store order confirmation');
  const html = String(sentMessage.html);
  assert.match(html, /AURA-EMAIL-TEST/);
  assert.match(html, /Headphones &lt;Premium&gt;/);
  assert.match(html, /Customer &amp; Co/);
  assert.match(html, /INR 246\.00/);
  assert.match(html, /Historical Olist price estimate/);
  assert.match(html, /1234567890/);
});

test('skips sending and warns when SMTP settings are incomplete', async () => {
  const originalEnvironment = new Map(smtpEnvironmentKeys.map((key) => [key, process.env[key]]));
  for (const key of smtpEnvironmentKeys) delete process.env[key];

  let warnings = 0;
  let sendCalls = 0;
  const originalWarn = console.warn;
  console.warn = () => { warnings += 1; };
  const transport: MailTransport = {
    sendMail: async () => {
      sendCalls += 1;
      return mockSentMessageInfo;
    },
  };

  try {
    await sendOrderConfirmation(createTestOrder(), 'customer@example.invalid', transport);
  } finally {
    console.warn = originalWarn;
    restoreEnvironment(originalEnvironment);
  }

  assert.equal(warnings, 1);
  assert.equal(sendCalls, 0);
});
