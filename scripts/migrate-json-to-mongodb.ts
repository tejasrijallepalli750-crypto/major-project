import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { connectMongo, closeMongo } from '../server/db/mongo';
import mongoose from 'mongoose';
import { UserModel, IUserDocument } from '../server/models/User';
import { ProductModel, IProductDocument } from '../server/models/Product';
import { OrderModel, IOrderDocument } from '../server/models/Order';

interface LegacyStore {
  users: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
}

const source = path.resolve(process.cwd(), 'data', 'aura_database.json');
const backupDirectory = path.resolve(process.cwd(), 'data', 'backups');

async function importCollection<T extends { id: string }>(
  name: string,
  values: Array<Record<string, unknown>>,
  model: mongoose.Model<T>,
  transform: (record: Record<string, unknown>) => T,
): Promise<{ imported: number; existing: number; failed: number }> {
  let imported = 0;
  let existing = 0;
  let failed = 0;
  for (const value of values) {
    const sourceId = String(value.id || '');
    if (!sourceId) {
      failed += 1;
      continue;
    }
    try {
      if (await model.exists({ id: sourceId })) {
        existing += 1;
        continue;
      }
      const record = transform(value);
      const id = record.id;
      if (id !== sourceId) throw new Error('Transformed record ID does not match its source ID.');
      await model.create(record);
      imported += 1;
    } catch (error) {
      if ((error as { code?: number }).code === 11000 && await model.exists({ id: sourceId })) {
        existing += 1;
      } else {
        failed += 1;
        const detail = (error as { code?: number }).code === 11000
          ? 'A different record conflicts with a unique database field.'
          : error instanceof Error ? error.message : 'Unknown error.';
        console.error(`[Migration] Failed ${name} record with id ${sourceId}:`, detail);
      }
    }
  }
  return { imported, existing, failed };
}

async function main(): Promise<void> {
  if (!fs.existsSync(source)) throw new Error(`Legacy data file not found: ${source}`);
  const legacy = JSON.parse(fs.readFileSync(source, 'utf8')) as LegacyStore;
  if (!Array.isArray(legacy.users) || !Array.isArray(legacy.products) || !Array.isArray(legacy.orders)) {
    throw new Error('Legacy data file must contain users, products, and orders arrays.');
  }

  await connectMongo();
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDirectory, `aura_database.pre-mongodb-${timestamp}.json`);
  fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
  if (!fs.readFileSync(source).equals(fs.readFileSync(backup))) {
    throw new Error(`JSON backup verification failed: ${backup}`);
  }
  await Promise.all([UserModel.init(), ProductModel.init(), OrderModel.init()]);

  const asDate = (value: unknown): Date => {
    if (!value) throw new Error('Record is missing a required timestamp.');
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error('Record contains an invalid date.');
    return date;
  };
  const asString = (value: unknown): string => typeof value === 'string' ? value : '';
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

  const users = await importCollection('user', legacy.users, UserModel, (record): IUserDocument => {
    const address = asRecord(record.address);
    const cartItems = Array.isArray(record.cartItems)
      ? record.cartItems.flatMap((item) => {
        const cartItem = asRecord(item);
        return typeof cartItem.productId === 'string' && Number.isInteger(cartItem.quantity) && Number(cartItem.quantity) > 0
          ? [{ productId: cartItem.productId, quantity: Number(cartItem.quantity) }]
          : [];
      })
      : [];
    return {
      id: asString(record.id),
      name: asString(record.name),
      email: asString(record.email).trim().toLowerCase(),
      password: asString(record.password),
      role: record.role === 'admin' ? 'admin' : 'customer',
      phone: asString(record.phone),
      address: {
        street: asString(address.street),
        city: asString(address.city),
        district: asString(address.district),
        state: asString(address.state),
        postalCode: asString(address.postalCode),
        country: asString(address.country) || 'India',
      },
      cartItems,
      wishlistIds: asStringArray(record.wishlistIds),
      createdAt: asDate(record.createdAt),
      updatedAt: asDate(record.updatedAt),
    };
  });
  const products = await importCollection('product', legacy.products, ProductModel, (record): IProductDocument => {
    const image = asString(record.image);
    return {
      id: asString(record.id),
      name: asString(record.name),
      description: asString(record.description),
      price: Number(record.price),
      category: asString(record.category),
      image,
      activeImage: undefined,
      stock: Number(record.stock),
      sku: asString(record.sku),
      status: 'inactive',
      rating: Number(record.rating || 0),
      numReviews: Number(record.numReviews || 0),
      brand: asString(record.brand),
      features: asStringArray(record.features),
      createdAt: asDate(record.createdAt),
      updatedAt: asDate(record.updatedAt),
    };
  });
  const orders = await importCollection('order', legacy.orders, OrderModel, (record): IOrderDocument => {
    const user = asRecord(record.user);
    const address = asRecord(record.shippingAddress);
    const payment = asRecord(record.paymentResult);
    const items = Array.isArray(record.orderItems) ? record.orderItems.map((item) => {
      const orderItem = asRecord(item);
      return {
        product: asString(orderItem.product),
        name: asString(orderItem.name),
        price: Number(orderItem.price),
        quantity: Number(orderItem.quantity),
        image: asString(orderItem.image),
        sku: asString(orderItem.sku),
        category: asString(orderItem.category),
      };
    }) : [];
    return {
      id: asString(record.id),
      orderNumber: asString(record.orderNumber),
      user: {
        id: asString(user.id),
        name: asString(user.name),
        email: asString(user.email).toLowerCase(),
        phone: asString(user.phone),
      },
      orderItems: items,
      shippingAddress: {
        fullName: asString(address.fullName),
        phone: asString(address.phone),
        street: asString(address.street),
        city: asString(address.city),
        district: asString(address.district),
        state: asString(address.state),
        postalCode: asString(address.postalCode),
        country: asString(address.country) || 'India',
      },
      razorpayOrderId: asString(record.razorpayOrderId) || undefined,
      paymentMethod: asString(record.paymentMethod) || 'Razorpay',
      paymentResult: Object.keys(payment).length ? {
        id: asString(payment.id),
        status: ['created', 'authorized', 'captured', 'failed'].includes(String(payment.status))
          ? String(payment.status) as NonNullable<IOrderDocument['paymentResult']>['status']
          : 'failed',
        razorpay_order_id: asString(payment.razorpay_order_id),
        razorpay_payment_id: asString(payment.razorpay_payment_id),
        razorpay_signature: asString(payment.razorpay_signature),
        verifiedAt: asString(payment.verifiedAt),
        method: asString(payment.method),
        amount: Number(payment.amount || 0),
        currency: asString(payment.currency) || 'INR',
      } : undefined,
      itemsPrice: Number(record.itemsPrice),
      shippingPrice: Number(record.shippingPrice || 0),
      taxPrice: Number(record.taxPrice || 0),
      totalPrice: Number(record.totalPrice),
      isPaid: Boolean(record.isPaid),
      paidAt: record.paidAt ? asDate(record.paidAt) : undefined,
      isDelivered: Boolean(record.isDelivered),
      deliveredAt: record.deliveredAt ? asDate(record.deliveredAt) : undefined,
      status: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(String(record.status))
        ? String(record.status) as IOrderDocument['status']
        : 'Pending',
      createdAt: asDate(record.createdAt),
      updatedAt: asDate(record.updatedAt),
    };
  });

  console.log(`JSON backup created at ${backup}`);
  console.log(`Users: imported ${users.imported}, already present ${users.existing}, failed ${users.failed}`);
  console.log(`Products: imported ${products.imported}, already present ${products.existing}, failed ${products.failed}`);
  console.log(`Orders: imported ${orders.imported}, already present ${orders.existing}, failed ${orders.failed}`);
  console.log('No existing MongoDB records were updated or deleted.');

  if (users.failed + products.failed + orders.failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('[Migration] Aborted:', error instanceof Error ? error.message : 'Unknown migration error.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
