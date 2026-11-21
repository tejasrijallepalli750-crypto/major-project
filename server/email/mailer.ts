import nodemailer, { type Transporter } from 'nodemailer';
import type { Order } from '../../src/types';
import { isDemoTestOrder } from '../../src/utils/orderPresentation';

export type MailTransport = Pick<Transporter, 'sendMail'>;

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

const getSmtpConfig = (): SmtpConfig | undefined => {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
    return undefined;
  }

  return { host, port, user, password, from };
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

const formatInr = (amount: number): string => `INR ${amount.toFixed(2)}`;

const renderOrderConfirmation = (order: Order): string => {
  const isDemoOrder = isDemoTestOrder(order);
  const itemRows = order.orderItems.map((item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(item.name)}${/^OLIST-/i.test(item.sku) ? '<br><small>Historical Olist price estimate</small>' : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatInr(item.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatInr(item.price * item.quantity)}</td>
    </tr>`).join('');
  const addressLines = isDemoOrder ? '' : [
    order.shippingAddress.fullName,
    order.shippingAddress.phone,
    order.shippingAddress.street,
    [order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.state, order.shippingAddress.postalCode]
      .filter(Boolean)
      .join(', '),
    order.shippingAddress.country,
  ].filter(Boolean).map(escapeHtml).join('<br>');
  const paymentDescription = isDemoOrder
    ? 'Razorpay TEST (DEMO; no real charge)'
    : order.paymentMethod === 'Local Demo'
    ? 'Local Demo (simulated; no payment was collected)'
    : escapeHtml(order.paymentMethod);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
    <main style="max-width:680px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
      <h1 style="margin-top:0;font-size:24px">${isDemoOrder ? 'DEMO · TEST checkout confirmation' : 'Order confirmation'}</h1>
      <p>Thank you, ${escapeHtml(order.user.name)}. Your ${isDemoOrder ? 'demonstration order' : 'order'} <strong>${escapeHtml(order.orderNumber)}</strong> has been confirmed.</p>
      <p>Payment method: ${paymentDescription}</p>
      ${isDemoOrder ? '<p><strong>This is a DEMO / TEST order. No physical goods will be shipped, and no shipment is promised.</strong></p>' : ''}
      <h2 style="font-size:18px">Items</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:8px;text-align:left">Item</th>
          <th style="padding:8px;text-align:center">Qty</th>
          <th style="padding:8px;text-align:right">Unit price</th>
          <th style="padding:8px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;margin-top:16px">
        <tbody>
          <tr><td>Items</td><td style="text-align:right">${formatInr(order.itemsPrice)}</td></tr>
          <tr><td>Shipping</td><td style="text-align:right">${formatInr(order.shippingPrice)}</td></tr>
          <tr><td>Tax</td><td style="text-align:right">${formatInr(order.taxPrice)}</td></tr>
          <tr><th style="padding-top:8px;text-align:left">Total</th><th style="padding-top:8px;text-align:right">${formatInr(order.totalPrice)}</th></tr>
        </tbody>
      </table>
      ${isDemoOrder ? '' : `<h2 style="font-size:18px">Shipping address</h2><p>${addressLines}</p>`}
    </main>
  </body>
</html>`;
};

export const sendOrderConfirmation = async (
  order: Order,
  userEmail: string,
  transport?: MailTransport,
): Promise<void> => {
  const config = getSmtpConfig();
  if (!config) {
    console.warn('[Mailer] SMTP settings are incomplete or invalid; order confirmation email skipped.');
    return;
  }

  const mailTransport = transport || nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });

  await mailTransport.sendMail({
    from: config.from,
    to: userEmail,
    subject: isDemoTestOrder(order)
      ? 'AURA Store DEMO · TEST checkout confirmation'
      : 'AURA Store order confirmation',
    html: renderOrderConfirmation(order),
  });
};
