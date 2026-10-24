import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Product, Order, CartItem, DemoPaymentAttempt } from '../../src/types';
import { UserModel } from '../models/User';
import { IUserDocument } from '../models/User';
import { ProductModel } from '../models/Product';
import { IProductDocument } from '../models/Product';
import { OrderModel } from '../models/Order';
import { IOrderDocument } from '../models/Order';
import { closeMongo, connectMongo, getMongoConnectionState, pingMongo } from './mongo';
import { catalogSeed } from '../catalog/catalogSeed';

const DATASET_DIR = path.resolve(process.cwd(), 'dataset');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

export class DatabaseUnavailableError extends Error {
  constructor() {
    super('The MongoDB database is currently unavailable.');
    this.name = 'DatabaseUnavailableError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('This checkout request key was already used for different order details.');
    this.name = 'IdempotencyConflictError';
  }
}

export class OrderCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderCancellationError';
  }
}

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

export const getDatabaseErrorStatus = (error: unknown): 500 | 503 => {
  const unavailableMongoErrors = new Set([
    'MongoNetworkError',
    'MongoServerSelectionError',
    'MongoTopologyClosedError',
    'MongoNotConnectedError',
  ]);
  return error instanceof DatabaseUnavailableError
    || getMongoConnectionState() !== 'connected'
    || (error instanceof Error && unavailableMongoErrors.has(error.name))
    ? 503
    : 500;
};

const normalizeDate = (value: Date | string | undefined): string =>
  value ? new Date(value).toISOString() : new Date().toISOString();

const userFromDocument = (document: IUserDocument): User => ({
  id: String(document.id),
  name: String(document.name),
  email: String(document.email),
  password: String(document.password),
  role: document.role === 'admin' ? 'admin' : 'customer',
  phone: String(document.phone || ''),
  address: document.address as User['address'],
  createdAt: normalizeDate(document.createdAt as Date | string | undefined),
  updatedAt: normalizeDate(document.updatedAt as Date | string | undefined),
});

const productFromDocument = (document: IProductDocument): Product => ({
  id: String(document.id),
  name: String(document.name),
  description: String(document.description),
  price: Number(document.price),
  category: String(document.category),
  image: String(document.image),
  stock: Number(document.stock),
  sku: String(document.sku),
  status: document.status === 'inactive' ? 'inactive' : 'active',
  rating: Number(document.rating || 0),
  numReviews: Number(document.numReviews || 0),
  brand: String(document.brand || ''),
  features: Array.isArray(document.features) ? document.features.map(String) : [],
  createdAt: normalizeDate(document.createdAt as Date | string | undefined),
  updatedAt: normalizeDate(document.updatedAt as Date | string | undefined),
});

const orderFromDocument = (document: IOrderDocument): Order => {
  const { checkoutIdempotencyKey: _checkoutKey, checkoutPayloadHash: _payloadHash, ...order } = { ...document };
  return {
    ...order,
    id: String(order.id),
    orderNumber: String(order.orderNumber),
    createdAt: normalizeDate(order.createdAt as Date | string | undefined),
    updatedAt: normalizeDate(order.updatedAt as Date | string | undefined),
    paidAt: order.paidAt ? normalizeDate(order.paidAt as Date | string) : undefined,
    deliveredAt: order.deliveredAt ? normalizeDate(order.deliveredAt as Date | string) : undefined,
    demoPaymentAttempts: order.demoPaymentAttempts?.map((attempt) => ({
      ...attempt,
      recordedAt: normalizeDate(attempt.recordedAt),
    })),
  } as Order;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

const isSafeLocalImage = (image: string): boolean => {
  if (!image.startsWith('/images/') || image.startsWith('//')) return false;
  const filePath = path.resolve(PUBLIC_DIR, `.${image}`);
  return filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && fs.existsSync(filePath);
};

const isGeneratedLegacyProduct = (product: Pick<Product, 'sku' | 'name'>): boolean =>
  product.sku.toUpperCase().startsWith('OLIST-')
  || /^(classic|modern|everyday|premium|essential|contemporary|signature) .+ (accent|essential|find|select|pick)$/i.test(product.name);

class MongoDatabase {
  public get isConnected(): boolean {
    return getMongoConnectionState() === 'connected';
  }

  public get connectionState(): string {
    return getMongoConnectionState();
  }

  private assertConnected(): void {
    if (!this.isConnected) throw new DatabaseUnavailableError();
  }

  public async connect(): Promise<void> {
    await connectMongo();
    await this.createConfiguredAdmin();
    await this.disableGeneratedLegacyProducts();
    await this.seedCatalogIfMissing();
  }

  public async ping(): Promise<boolean> {
    return pingMongo();
  }

  public async disconnect(): Promise<void> {
    await closeMongo();
  }

  private async createConfiguredAdmin(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      throw new Error('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must contain at least 12 characters.');
    }
    if (await UserModel.exists({ email })) return;
    const now = new Date();
    await UserModel.create({
      id: `usr-${randomUUID()}`,
      name: 'Store Administrator',
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
      phone: '',
      cartItems: [],
      wishlistIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  private async seedCatalogIfMissing(): Promise<void> {
    for (const product of catalogSeed) {
      if (await ProductModel.exists({ sku: product.sku })) continue;
      await ProductModel.create({
        id: `prod-${product.sku.toLowerCase()}`,
        ...product,
        activeImage: product.status === 'active' ? product.image : undefined,
      });
    }
  }

  private async disableGeneratedLegacyProducts(): Promise<void> {
    const legacy = await ProductModel.find({ status: 'active' }).lean().exec();
    const ids = legacy
      .filter((document) =>
        isGeneratedLegacyProduct({ sku: document.sku, name: document.name })
        || document.activeImage !== document.image
        || !isSafeLocalImage(document.image),
      )
      .map((document) => document.id);
    if (ids.length) {
      await ProductModel.updateMany(
        { id: { $in: ids } },
        { $set: { status: 'inactive' }, $unset: { activeImage: 1 } },
      );
    }
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    this.assertConnected();
    const user = await UserModel.findOne({ email: email.trim().toLowerCase() }).lean().exec();
    return user ? userFromDocument(user) : undefined;
  }

  public async findUserById(id: string): Promise<User | undefined> {
    this.assertConnected();
    const user = await UserModel.findOne({ id }).lean().exec();
    return user ? userFromDocument(user) : undefined;
  }

  public async createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    this.assertConnected();
    const document = await UserModel.create({
      ...user,
      id: `usr-${randomUUID()}`,
      cartItems: [],
      wishlistIds: [],
    });
    return userFromDocument(document.toObject());
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    this.assertConnected();
    const updated = await UserModel.findOneAndUpdate({ id }, { $set: updates }, { new: true, runValidators: true }).lean().exec();
    return updated ? userFromDocument(updated) : undefined;
  }

  public async getUserCart(id: string): Promise<CartItem[]> {
    this.assertConnected();
    const user = await UserModel.findOne({ id }).select('cartItems').lean().exec();
    if (!user) return [];
    const items: CartItem[] = [];
    for (const saved of user.cartItems || []) {
      const product = await this.findProductById(saved.productId);
      if (!product || product.status !== 'active') continue;
      items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        quantity: saved.quantity,
        stock: product.stock,
        sku: product.sku,
      });
    }
    return items;
  }

  public async saveUserCart(id: string, items: Array<{ productId: string; quantity: number }>): Promise<void> {
    this.assertConnected();
    if (!Array.isArray(items) || items.length > 100) throw new Error('Cart must contain no more than 100 items.');
    const valid: Array<{ productId: string; quantity: number }> = [];
    for (const item of items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        throw new Error('Cart item has an invalid product ID or quantity.');
      }
      const product = await this.findProductById(item.productId);
      if (!product || product.status !== 'active') throw new Error(`Product ${item.productId} is unavailable.`);
      if (product.stock > 0) valid.push({ productId: product.id, quantity: Math.min(item.quantity, product.stock) });
    }
    const result = await UserModel.updateOne({ id }, { $set: { cartItems: valid } });
    if (!result.matchedCount) throw new Error('User not found.');
  }

  public async getUserWishlist(id: string): Promise<string[]> {
    this.assertConnected();
    const user = await UserModel.findOne({ id }).select('wishlistIds').lean().exec();
    return user?.wishlistIds || [];
  }

  public async saveUserWishlist(id: string, productIds: string[]): Promise<void> {
    this.assertConnected();
    if (!Array.isArray(productIds) || productIds.length > 500 || productIds.some((value) => typeof value !== 'string')) {
      throw new Error('Wishlist must contain valid product IDs.');
    }
    const validProducts = await ProductModel.find({ id: { $in: [...new Set(productIds)] }, status: 'active' })
      .select('id')
      .lean()
      .exec();
    const allowedIds = new Set(validProducts.map((product) => product.id));
    const result = await UserModel.updateOne(
      { id },
      { $set: { wishlistIds: [...new Set(productIds)].filter((productId) => allowedIds.has(productId)) } },
    );
    if (!result.matchedCount) throw new Error('User not found.');
  }

  public async findProducts(options: {
    search?: string;
    category?: string;
    sort?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    this.assertConnected();
    const filter: Record<string, unknown> = {};
    if (options.status) filter.status = options.status;
    if (options.category && options.category !== 'All') filter.category = new RegExp(`^${options.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (options.search) {
      const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'description', 'sku', 'brand'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const sort: Record<string, 1 | -1> = options.sort === 'price-low' ? { price: 1 }
      : options.sort === 'price-high' ? { price: -1 }
        : options.sort === 'rating' ? { rating: -1 }
          : { createdAt: -1 };
    const page = Math.max(1, Math.floor(options.page || 1));
    const limit = Math.min(1000, Math.max(1, Math.floor(options.limit || 50)));
    const [documents, total] = await Promise.all([
      ProductModel.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean().exec(),
      ProductModel.countDocuments(filter),
    ]);
    return {
      products: documents.map((document) => productFromDocument(document)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async findProductById(id: string): Promise<Product | undefined> {
    this.assertConnected();
    const product = await ProductModel.findOne({ id }).lean().exec();
    return product ? productFromDocument(product) : undefined;
  }

  public async createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    this.assertConnected();
    const document = await ProductModel.create({
      ...data,
      id: `prod-${randomUUID()}`,
      activeImage: data.status === 'active' ? data.image : undefined,
    });
    return productFromDocument(document.toObject());
  }

  public async updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    this.assertConnected();
    const current = await ProductModel.findOne({ id }).select('image status').lean().exec();
    if (!current) return undefined;
    const status = updates.status ?? current.status;
    const image = updates.image ?? current.image;
    const update = status === 'active'
      ? { $set: { ...updates, activeImage: image } }
      : { $set: updates, $unset: { activeImage: 1 } };
    const updated = await ProductModel.findOneAndUpdate(
      { id },
      update,
      { new: true, runValidators: true },
    ).lean().exec();
    return updated ? productFromDocument(updated) : undefined;
  }

  public async deleteProduct(id: string): Promise<boolean> {
    this.assertConnected();
    const result = await ProductModel.updateOne(
      { id },
      { $set: { status: 'inactive' }, $unset: { activeImage: 1 } },
    );
    return result.matchedCount > 0;
  }

  public async getCategories(): Promise<{ name: string; count: number }[]> {
    this.assertConnected();
    return ProductModel.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $project: { _id: 0, name: '$_id', count: 1 } },
      { $sort: { name: 1 } },
    ]).exec();
  }

  public async findOrderByCheckoutRequest(
    userId: string,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<Order | undefined> {
    this.assertConnected();
    const existing = await OrderModel.findOne({
      'user.id': userId,
      checkoutIdempotencyKey: idempotencyKey,
    }).lean().exec();
    if (!existing) return undefined;
    if (existing.checkoutPayloadHash !== payloadHash || existing.status === 'Cancelled') {
      throw new IdempotencyConflictError();
    }
    return orderFromDocument(existing);
  }

  public async createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<Order> {
    this.assertConnected();
    const existing = await this.findOrderByCheckoutRequest(order.user.id, idempotencyKey, payloadHash);
    if (existing) return existing;
    const session = await mongoose.startSession();
    const id = `ord-${randomUUID()}`;
    const orderNumber = `AURA-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        for (const item of order.orderItems) {
          const allocation = await ProductModel.updateOne(
            { id: item.product, status: 'active', stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { session },
          );
          if (allocation.modifiedCount !== 1) {
            throw new InventoryError(`Insufficient inventory for "${item.name}". Please update your cart.`);
          }
        }
        const [created] = await OrderModel.create(
          [{ ...order, id, orderNumber, checkoutIdempotencyKey: idempotencyKey, checkoutPayloadHash: payloadHash }],
          { session },
        );
        result = orderFromDocument(created.toObject());
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await this.findOrderByCheckoutRequest(order.user.id, idempotencyKey, payloadHash);
        if (duplicate) return duplicate;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (!result) throw new Error('Order transaction completed without an order result.');
    return result;
  }

  public async recordDemoPaymentAttempt(
    orderId: string,
    userId: string,
    attempt: Pick<DemoPaymentAttempt, 'attemptId' | 'outcome'>,
  ): Promise<Order | undefined> {
    this.assertConnected();
    const session = await mongoose.startSession();
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        result = undefined;
        const current = await OrderModel.findOne({ id: orderId, 'user.id': userId })
          .session(session)
          .lean()
          .exec();
        if (!current) return;

        if (current.demoPaymentAttempts?.some((saved) => saved.attemptId === attempt.attemptId)) {
          result = orderFromDocument(current);
          return;
        }
        if (current.demoPaymentAttempts?.some((saved) => saved.outcome === 'success')) return;
        if (current.paymentMethod !== 'Local Demo'
          || current.isPaid
          || current.status !== 'Pending'
          || current.razorpayOrderId
          || current.paymentResult) {
          return;
        }

        const savedAttempt = {
          ...attempt,
          mode: 'LOCAL_DEMO' as const,
          amount: Number(current.totalPrice),
          currency: 'INR' as const,
          recordedAt: new Date(),
        };
        const updated = await OrderModel.findOneAndUpdate(
          {
            id: orderId,
            'user.id': userId,
            paymentMethod: 'Local Demo',
            isPaid: false,
            status: 'Pending',
            razorpayOrderId: { $exists: false },
            'demoPaymentAttempts.attemptId': { $ne: attempt.attemptId },
          },
          {
            $push: { demoPaymentAttempts: savedAttempt },
            ...(attempt.outcome === 'cancelled' ? { $set: { status: 'Cancelled' } } : {}),
          },
          { new: true, runValidators: true, session },
        ).lean().exec();
        if (!updated) return;

        if (attempt.outcome === 'cancelled') {
          for (const item of current.orderItems) {
            const restored = await ProductModel.updateOne(
              { id: item.product },
              { $inc: { stock: item.quantity } },
              { session },
            );
            if (restored.modifiedCount !== 1) {
              throw new Error(`Unable to restore inventory for cancelled order item "${item.product}".`);
            }
          }
        }
        result = orderFromDocument(updated);
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  public async findOrderById(id: string): Promise<Order | undefined> {
    this.assertConnected();
    const order = await OrderModel.findOne({ $or: [{ id }, { orderNumber: id }] }).lean().exec();
    return order ? orderFromDocument(order) : undefined;
  }

  public async findOrdersByUser(userId: string): Promise<Order[]> {
    this.assertConnected();
    const orders = await OrderModel.find({ 'user.id': userId }).sort({ createdAt: -1 }).lean().exec();
    return orders.map((order) => orderFromDocument(order));
  }

  public async findAllOrders(): Promise<Order[]> {
    this.assertConnected();
    const orders = await OrderModel.find().sort({ createdAt: -1 }).lean().exec();
    return orders.map((order) => orderFromDocument(order));
  }

  public async updateOrderStatus(orderId: string, status: Order['status']): Promise<Order | undefined> {
    this.assertConnected();
    if (status === 'Cancelled') {
      const session = await mongoose.startSession();
      let result: Order | undefined;
      try {
        await session.withTransaction(async () => {
          result = undefined;
          const current = await OrderModel.findOne({ $or: [{ id: orderId }, { orderNumber: orderId }] })
            .session(session)
            .lean()
            .exec();
          if (!current) return;
          if (current.status === 'Cancelled') {
            result = orderFromDocument(current);
            return;
          }
          if (current.isPaid) {
            throw new OrderCancellationError('Paid orders require a verified refund before cancellation.');
          }
          if (current.razorpayOrderId) {
            throw new OrderCancellationError('Orders with an active Razorpay order require payment-state reconciliation before cancellation.');
          }
          if (current.status === 'Delivered') {
            throw new OrderCancellationError('Delivered orders cannot be cancelled.');
          }

          const updated = await OrderModel.findOneAndUpdate(
            { id: current.id, isPaid: false, status: { $ne: 'Cancelled' } },
            { $set: { status: 'Cancelled' } },
            { new: true, runValidators: true, session },
          ).lean().exec();
          if (!updated) return;

          for (const item of current.orderItems) {
            const restored = await ProductModel.updateOne(
              { id: item.product },
              { $inc: { stock: item.quantity } },
              { session },
            );
            if (restored.modifiedCount !== 1) {
              throw new Error(`Unable to restore inventory for cancelled order item "${item.product}".`);
            }
          }
          result = orderFromDocument(updated);
        });
      } finally {
        await session.endSession();
      }
      return result;
    }

    const current = await OrderModel.findOne({ $or: [{ id: orderId }, { orderNumber: orderId }] }).lean().exec();
    if (!current) return undefined;
    if (current.status === 'Cancelled') {
      throw new OrderCancellationError('Cancelled orders cannot be reopened; create a new checkout order.');
    }
    if (!current.isPaid && ['Processing', 'Shipped', 'Delivered'].includes(status)) {
      throw new OrderCancellationError('Unpaid orders cannot move into fulfillment.');
    }

    const updates: Record<string, unknown> = { status };
    if (status === 'Delivered') {
      updates.isDelivered = true;
      updates.deliveredAt = new Date();
    }
    const order = await OrderModel.findOneAndUpdate(
      { $or: [{ id: orderId }, { orderNumber: orderId }], status: { $ne: 'Cancelled' } },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean().exec();
    if (!order) {
      const latest = await OrderModel.findOne({ $or: [{ id: orderId }, { orderNumber: orderId }] }).lean().exec();
      if (latest?.status === 'Cancelled') {
        throw new OrderCancellationError('Cancelled orders cannot be reopened; create a new checkout order.');
      }
    }
    return order ? orderFromDocument(order) : undefined;
  }

  public async updateOrderRazorpayId(orderId: string, razorpayOrderId: string): Promise<Order | undefined> {
    this.assertConnected();
    const updated = await OrderModel.findOneAndUpdate(
      {
        id: orderId,
        paymentMethod: 'Razorpay',
        status: 'Pending',
        isPaid: false,
        $or: [{ razorpayOrderId: { $exists: false } }, { razorpayOrderId: null }],
      },
      { $set: { razorpayOrderId } },
      { new: true },
    ).lean().exec();
    if (updated) return orderFromDocument(updated);
    const existing = await OrderModel.findOne({ id: orderId, isPaid: false }).lean().exec();
    return existing ? orderFromDocument(existing) : undefined;
  }

  public async findOrderByRazorpayId(razorpayOrderId: string): Promise<Order | undefined> {
    this.assertConnected();
    const order = await OrderModel.findOne({ razorpayOrderId }).lean().exec();
    return order ? orderFromDocument(order) : undefined;
  }

  public async updateOrderPayment(orderId: string, paymentResult: NonNullable<Order['paymentResult']>): Promise<Order | undefined> {
    this.assertConnected();
    const updates: Record<string, unknown> = { paymentResult, isPaid: paymentResult.status === 'captured' };
    if (paymentResult.status === 'captured') {
      updates.paidAt = new Date();
      updates.status = 'Processing';
    }
    const order = await OrderModel.findOneAndUpdate(
      { id: orderId, isPaid: false, status: 'Pending' },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean().exec();
    return order ? orderFromDocument(order) : undefined;
  }

  public async getAdminStats() {
    this.assertConnected();
    const [paidOrders, orders, totalCustomers, totalProducts, lowStockCount] = await Promise.all([
      OrderModel.find({ isPaid: true }).lean().exec(),
      OrderModel.find().sort({ createdAt: -1 }).limit(8).lean().exec(),
      UserModel.countDocuments({ role: 'customer' }),
      ProductModel.countDocuments(),
      ProductModel.countDocuments({ stock: { $lt: 10 }, status: 'active' }),
    ]);
    const allPaidOrders = await OrderModel.find({ isPaid: true }).lean().exec();
    const categoryRevenue = new Map<string, number>();
    for (const order of allPaidOrders) {
      for (const item of order.orderItems) {
        const product = await this.findProductById(item.product);
        const category = product?.category || item.category || 'General';
        categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + item.price * item.quantity);
      }
    }
    return {
      totalSales: paidOrders.reduce((sum, order) => sum + order.totalPrice, 0),
      totalOrders: await OrderModel.countDocuments(),
      paidOrdersCount: paidOrders.length,
      totalCustomers,
      totalProducts,
      lowStockCount,
      categoryRevenue: [...categoryRevenue.entries()].map(([category, revenue]) => ({ category, revenue })),
      recentOrders: orders.map((order) => orderFromDocument(order)),
    };
  }

  public async syncDatasetProducts() {
    this.assertConnected();
    const files = fs.existsSync(DATASET_DIR)
      ? fs.readdirSync(DATASET_DIR).filter((file) => !file.startsWith('.') && /\.(csv|json)$/i.test(file))
      : [];
    const result = {
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
      processedFiles: [] as string[],
      errors: [] as string[],
    };
    for (const filename of files) {
      result.processedFiles.push(filename);
      try {
        const content = fs.readFileSync(path.join(DATASET_DIR, filename), 'utf8').replace(/^\uFEFF/, '');
        const rows: Array<Record<string, unknown>> = [];
        if (/\.json$/i.test(filename)) {
          const json: unknown = JSON.parse(content);
          if (Array.isArray(json)) rows.push(...json.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null));
          else if (typeof json === 'object' && json !== null) rows.push(json as Record<string, unknown>);
        } else {
          const lines = content.split(/\r?\n/).filter((line) => line.trim());
          if (lines.length < 2) throw new Error('The CSV has a header but no product rows.');
          const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
          for (const line of lines.slice(1)) {
            const values = parseCsvLine(line);
            rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
          }
        }
        for (const row of rows) {
          const name = String(row.name || row.product_name || row.title || '').trim();
          const price = Number(row.price || row.price_inr);
          const category = String(row.category || row.product_category || '').trim();
          const sku = String(row.sku || '').trim();
          const image = String(row.image || row.image_url || '').trim();
          const stock = Number(row.stock ?? row.quantity);
          if (sku.toUpperCase().startsWith('OLIST-')
            || isGeneratedLegacyProduct({ sku, name })) {
            result.invalidCount += 1;
            result.skippedCount += 1;
            continue;
          }
          if (!name || !category || !sku || !Number.isFinite(price) || price <= 0
            || !Number.isInteger(stock) || stock < 0 || !isSafeLocalImage(image)) {
            result.invalidCount += 1;
            result.skippedCount += 1;
            continue;
          }
          const existing = await ProductModel.findOne({ sku: sku.toUpperCase() }).lean().exec();
          if (existing) {
            result.duplicateCount += 1;
            result.skippedCount += 1;
            continue;
          }
          if (await ProductModel.exists({ activeImage: image })) {
            result.invalidCount += 1;
            result.skippedCount += 1;
            continue;
          }
          await ProductModel.create({
            id: `prod-${randomUUID()}`,
            name,
            description: String(row.description || row.desc || `${name} from our ${category} collection.`),
            price,
            category,
            stock,
            sku,
            image,
            activeImage: image,
            status: 'active',
            rating: 0,
            numReviews: 0,
            brand: String(row.brand || 'AURA'),
            features: [],
          });
          result.importedCount += 1;
        }
      } catch (error) {
        result.errors.push(`${filename}: ${error instanceof Error ? error.message : 'Unable to process file.'}`);
      }
    }
    return result;
  }
}

export const db = new MongoDatabase();
