import fs from 'fs';
import path from 'path';
import { randomInt, randomUUID } from 'crypto';
import mongoose, { AnyBulkWriteOperation } from 'mongoose';
import {
  DemoInventoryBulkProductIssue,
  DemoInventoryBulkResult,
  User,
  Product,
  Order,
  CartItem,
  DemoPaymentAttempt,
  Review,
} from '../../src/types';
import { UserModel } from '../models/User';
import { IUserDocument } from '../models/User';
import { ProductModel } from '../models/Product';
import { IProductDocument } from '../models/Product';
import { ReviewModel, IReviewDocument } from '../models/Review';
import { OrderModel } from '../models/Order';
import { IOrderDocument } from '../models/Order';
import { closeMongo, connectMongo, getMongoConnectionState, pingMongo } from './mongo';
import { runCatalogStartupMaintenance } from './catalogStartup';
import { catalogSeed } from '../catalog/catalogSeed';
import {
  getPurchaseEligibility,
  isManagedOlistCatalogProduct,
} from '../../src/utils/productPresentation';
import {
  isDemoOrderStatusUpdateForbidden,
  isDemoTestOrder,
} from '../../src/utils/orderPresentation';
import {
  getValidDemoStock,
  makeDemoStockAllocationOperation,
  makeStockAllocationOperation,
} from '../orders/inventory';
import { DEMO_RESERVATION_TTL_MS, isDemoModeEnabled, isNonProductionMongoTarget } from '../config/demoMode';
import { getRazorpayConfig } from '../payments/razorpay';
import { calculateReviewSummary } from '../reviews/reviewRules';
import { isDatasetMutationAllowed } from '../config/datasetPolicy';
import { safeErrorSummary } from '../utils/safeError';

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

export type CustomerOrderHistoryRemovalResult =
  | 'removed'
  | 'already-removed'
  | 'not-found'
  | 'forbidden'
  | 'not-cancelled';

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

export const productFromDocument = (document: IProductDocument): Product => {
  const demoModeEnabled = isDemoModeEnabled();
  const demoStockValue = getValidDemoStock(document.demoStock);
  const product: Product = {
    id: String(document.id),
    name: String(document.name),
    description: String(document.description),
    price: Number(document.price),
    category: String(document.category),
    image: String(document.image),
    stock: Number(document.stock),
    sku: String(document.sku),
    status: document.status === 'inactive' ? 'inactive' : 'active',
    inventoryMode: document.inventoryMode === 'simulated-demo' ? 'simulated-demo' : undefined,
    inventoryStatus: document.inventoryStatus === 'verified' ? 'verified' : 'unverified',
    demoModeEnabled,
    demoPurchasingAvailable: demoModeEnabled && getRazorpayConfig().isConfigured,
    demoEligible: document.demoEligible === true,
    demoStock: demoStockValue,
    inventoryVerifiedAt: document.inventoryVerifiedAt
      ? normalizeDate(document.inventoryVerifiedAt as Date | string)
      : undefined,
    rating: Number(document.rating || 0),
    numReviews: Number(document.numReviews || 0),
    brand: String(document.brand || ''),
    features: Array.isArray(document.features) ? document.features.map(String) : [],
    createdAt: normalizeDate(document.createdAt as Date | string | undefined),
    updatedAt: normalizeDate(document.updatedAt as Date | string | undefined),
  };
  const purchaseEligibility = getPurchaseEligibility(product);
  const canPurchase = product.status === 'active' && purchaseEligibility.availableStock > 0;
  return {
    ...product,
    canPurchase,
    purchaseUnavailableReason: canPurchase
      ? null
      : purchaseEligibility.unavailableReason || 'This product is not available for purchase.',
  };
};

const reviewFromDocument = (document: IReviewDocument): Review => ({
  id: String(document.id),
  productId: String(document.productId),
  userId: String(document.userId),
  userName: String(document.userName),
  rating: Number(document.rating),
  comment: String(document.comment),
  createdAt: normalizeDate(document.createdAt as Date | string | undefined),
});

const orderFromDocument = (document: IOrderDocument): Order => {
  const {
    checkoutIdempotencyKey: _checkoutKey,
    checkoutPayloadHash: _payloadHash,
    hiddenFromCustomerAt: _hiddenFromCustomerAt,
    ...order
  } = { ...document };
  return {
    ...order,
    id: String(order.id),
    orderNumber: String(order.orderNumber),
    purchaseMode: order.purchaseMode === 'demo' ? 'demo' : 'physical',
    orderItems: order.orderItems.map((item) => ({
      ...item,
      purchaseMode: item.purchaseMode ?? (order.purchaseMode === 'demo' ? 'demo' : 'physical'),
    })),
    demoReservationExpiresAt: order.demoReservationExpiresAt
      ? normalizeDate(order.demoReservationExpiresAt as Date | string)
      : undefined,
    demoGatewayOrderExpiresAt: order.demoGatewayOrderExpiresAt
      ? normalizeDate(order.demoGatewayOrderExpiresAt as Date | string)
      : undefined,
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

type DemoInventoryProductSummary = Pick<IProductDocument, 'id' | 'name'>;

interface DemoInventoryBulkPlan {
  operations: AnyBulkWriteOperation<IProductDocument>[];
  updateProducts: DemoInventoryProductSummary[];
  skippedProducts: DemoInventoryBulkProductIssue[];
}

export const buildDemoInventoryBulkPlan = (
  products: DemoInventoryProductSummary[],
  activeReservedQuantities: ReadonlyMap<string, number>,
  generateStock: (minimum: number, maximumExclusive: number) => number = randomInt,
): DemoInventoryBulkPlan => {
  const operations: AnyBulkWriteOperation<IProductDocument>[] = [];
  const updateProducts: DemoInventoryProductSummary[] = [];
  const skippedProducts: DemoInventoryBulkProductIssue[] = [];

  for (const product of products) {
    const activeReservedQuantity = activeReservedQuantities.get(product.id) || 0;
    if (activeReservedQuantity > 0) {
      skippedProducts.push({
        productId: product.id,
        name: product.name,
        reason: 'Active demo reservations exist; inventory was left unchanged.',
        activeReservedQuantity,
      });
      continue;
    }

    const demoStock = generateStock(1, 101);
    if (!Number.isSafeInteger(demoStock) || demoStock < 1 || demoStock > 100) {
      throw new InventoryError('The demo stock generator returned a quantity outside the allowed range.');
    }
    operations.push({
      updateOne: {
        filter: { id: product.id },
        update: { $set: { demoEligible: true, demoStock } },
      },
    });
    updateProducts.push(product);
  }

  return { operations, updateProducts, skippedProducts };
};

class MongoDatabase {
  public get isConnected(): boolean {
    return getMongoConnectionState() === 'connected';
  }

  public get databaseName(): string | undefined {
    return mongoose.connection.db?.databaseName;
  }

  public isNonProductionDatabase(): boolean {
    return isNonProductionMongoTarget(this.databaseName, process.env.MONGODB_URI);
  }

  public get connectionState(): string {
    return getMongoConnectionState();
  }

  private assertConnected(): void {
    if (!this.isConnected) throw new DatabaseUnavailableError();
  }

  public async connect(): Promise<void> {
    await connectMongo();
    await runCatalogStartupMaintenance(
      process.env.NODE_ENV,
      () => this.disableGeneratedLegacyProducts(),
      () => this.seedCatalogIfMissing(),
    );
  }

  public async ping(): Promise<boolean> {
    return pingMongo();
  }

  public async disconnect(): Promise<void> {
    await closeMongo();
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
      .filter((document) => {
        const isImportedOlistCatalogue = isManagedOlistCatalogProduct(
          document.sku,
          document.features,
          isSafeLocalImage(document.image),
        );
        return !isImportedOlistCatalogue && (
          isGeneratedLegacyProduct({ sku: document.sku, name: document.name })
          || document.activeImage !== document.image
          || !isSafeLocalImage(document.image)
        );
      })
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
        inventoryMode: product.inventoryMode,
        inventoryStatus: product.inventoryStatus,
        demoModeEnabled: product.demoModeEnabled,
        demoPurchasingAvailable: product.demoPurchasingAvailable,
        demoEligible: product.demoEligible,
        demoStock: product.demoStock,
        canPurchase: product.canPurchase,
        purchaseUnavailableReason: product.purchaseUnavailableReason,
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
      const availableStock = product.canPurchase
        ? isDemoModeEnabled() && product.demoEligible
          ? getValidDemoStock(product.demoStock)
          : product.stock
        : 0;
      if (availableStock > 0) valid.push({ productId: product.id, quantity: Math.min(item.quantity, availableStock) });
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
      filter.$or = ['name', 'description', 'sku', 'brand', 'category']
        .map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
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

  public async findProductReviews(productId: string): Promise<Review[]> {
    this.assertConnected();
    const reviews = await ReviewModel.find({ productId }).sort({ createdAt: -1 }).lean().exec();
    return reviews.map((review) => reviewFromDocument(review));
  }

  public async createProductReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<{
    review: Review;
    rating: number;
    numReviews: number;
  }> {
    this.assertConnected();
    const session = await mongoose.startSession();
    let result: { review: Review; rating: number; numReviews: number } | undefined;
    try {
      await session.withTransaction(async () => {
        const [created] = await ReviewModel.create([{
          ...review,
          id: `rev-${randomUUID()}`,
        }], { session });
        const savedReviews = await ReviewModel.find({ productId: review.productId })
          .select('rating')
          .session(session)
          .lean()
          .exec();
        const summary = calculateReviewSummary(savedReviews.map((savedReview) => Number(savedReview.rating)));
        const updatedProduct = await ProductModel.findOneAndUpdate(
          { id: review.productId },
          { $set: summary },
          { new: true, runValidators: true, session },
        ).lean().exec();
        if (!updatedProduct) throw new Error('Product disappeared while saving its review rating.');
        result = { review: reviewFromDocument(created.toObject()), ...summary };
      });
    } finally {
      await session.endSession();
    }
    if (!result) throw new Error('Review transaction completed without saving a review.');
    return result;
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

  public async updateProductInventory(
    id: string,
    stock: number,
    verifiedBy: string,
  ): Promise<Product | undefined> {
    this.assertConnected();
    const updated = await ProductModel.findOneAndUpdate(
      { id },
      {
        $set: {
          stock,
          inventoryStatus: 'verified',
          inventoryVerifiedAt: new Date(),
          inventoryVerifiedBy: verifiedBy,
        },
      },
      { new: true, runValidators: true },
    ).lean().exec();
    return updated ? productFromDocument(updated) : undefined;
  }

  public async updateDemoInventory(
    id: string,
    eligible: boolean,
    stock: number,
  ): Promise<Product | undefined> {
    this.assertConnected();
    if (!isDemoModeEnabled()) throw new Error('Demo inventory mode is disabled.');
    const session = await mongoose.startSession();
    let updatedProduct: IProductDocument | null = null;
    try {
      await session.withTransaction(async () => {
        const pendingOrder = await OrderModel.exists({
          purchaseMode: 'demo',
          demoReservationStatus: 'reserved',
          status: 'Pending',
          'orderItems.product': id,
        }).session(session);
        if (pendingOrder) {
          throw new InventoryError('Demo stock cannot be changed while a demo order is reserving this product.');
        }
        updatedProduct = await ProductModel.findOneAndUpdate(
          { id },
          { $set: { demoEligible: eligible, demoStock: eligible ? stock : 0 } },
          { new: true, runValidators: true, session },
        ).lean().exec();
      });
    } finally {
      await session.endSession();
    }
    return updatedProduct ? productFromDocument(updatedProduct) : undefined;
  }

  public async bulkEnableAllDemoInventory(): Promise<DemoInventoryBulkResult> {
    this.assertConnected();
    if (!isDemoModeEnabled()) throw new InventoryError('Demonstration inventory mode is disabled.');
    if (!this.isNonProductionDatabase()) {
      throw new InventoryError('Bulk demo inventory is allowed only on a confirmed non-production database.');
    }

    const products = await ProductModel.find({})
      .select({ id: 1, name: 1 })
      .sort({ id: 1 })
      .lean()
      .exec();
    const result: DemoInventoryBulkResult = {
      totalProducts: products.length,
      processedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedProducts: [],
      failedProducts: [],
    };
    if (products.length === 0) return result;

    const session = await mongoose.startSession();
    const batchSize = 500;
    try {
      for (let offset = 0; offset < products.length; offset += batchSize) {
        const batch = products.slice(offset, offset + batchSize);
        const productIds = batch.map((product) => product.id);
        let batchPlan: DemoInventoryBulkPlan & { missingProducts: DemoInventoryBulkProductIssue[] } | undefined;

        try {
          await session.withTransaction(async () => {
            batchPlan = undefined;
            const currentProducts = await ProductModel.find({ id: { $in: productIds } })
              .select({ id: 1, name: 1 })
              .session(session)
              .lean()
              .exec();
            const currentIds = new Set(currentProducts.map((product) => product.id));
            const missingProducts = batch
              .filter((product) => !currentIds.has(product.id))
              .map((product) => ({
                productId: product.id,
                name: product.name,
                reason: 'Product no longer exists.',
              }));

            const reservationOrders = await OrderModel.find({
              status: 'Pending',
              demoReservationStatus: 'reserved',
              'orderItems.product': { $in: productIds },
              $or: [{ purchaseMode: 'demo' }, { 'orderItems.purchaseMode': 'demo' }],
            })
              .select({ purchaseMode: 1, orderItems: 1 })
              .session(session)
              .lean()
              .exec();
            const reservedQuantities = new Map<string, number>();
            const productIdSet = new Set(productIds);
            for (const order of reservationOrders) {
              for (const item of order.orderItems) {
                if (!productIdSet.has(item.product) || (order.purchaseMode !== 'demo' && item.purchaseMode !== 'demo')) continue;
                reservedQuantities.set(
                  item.product,
                  (reservedQuantities.get(item.product) || 0) + item.quantity,
                );
              }
            }

            const plan = buildDemoInventoryBulkPlan(currentProducts, reservedQuantities);
            batchPlan = { ...plan, missingProducts };
            if (plan.operations.length > 0) {
              const writeResult = await ProductModel.bulkWrite(plan.operations, { session, ordered: true });
              if (writeResult.matchedCount !== plan.operations.length) {
                throw new Error('Bulk demo inventory update did not match every planned product.');
              }
            }
          });

          if (!batchPlan) throw new Error('Bulk demo inventory batch returned no result.');
          result.updatedCount += batchPlan.updateProducts.length;
          result.skippedProducts.push(...batchPlan.skippedProducts, ...batchPlan.missingProducts);
        } catch (error) {
          console.error('[Admin] Demo inventory bulk batch failed:', safeErrorSummary(error));
          result.skippedProducts.push(...(batchPlan?.skippedProducts || []), ...(batchPlan?.missingProducts || []));
          const failedProducts = batchPlan?.updateProducts || batch;
          result.failedProducts.push(...failedProducts.map((product) => ({
            productId: product.id,
            name: product.name,
            reason: 'The transaction for this batch failed; no updates were committed.',
          })));
        }
      }
    } finally {
      await session.endSession();
    }

    result.skippedCount = result.skippedProducts.length;
    result.failedCount = result.failedProducts.length;
    result.processedCount = result.updatedCount + result.skippedCount + result.failedCount;
    return result;
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
    const purchaseMode = order.purchaseMode ?? 'physical';
    if (purchaseMode === 'demo' && !isDemoModeEnabled()) {
      throw new InventoryError('Demo inventory mode is disabled.');
    }
    if (purchaseMode === 'demo'
      && (order.paymentMethod !== 'Razorpay' || !getRazorpayConfig().isConfigured)) {
      throw new InventoryError('Demo orders require valid Razorpay TEST credentials.');
    }
    if (order.orderItems.some((item) => (item.purchaseMode ?? purchaseMode) !== purchaseMode)) {
      throw new InventoryError('Physical and demo inventory cannot be mixed in one order.');
    }
    const existing = await this.findOrderByCheckoutRequest(order.user.id, idempotencyKey, payloadHash);
    if (existing) return existing;
    const session = await mongoose.startSession();
    const id = `ord-${randomUUID()}`;
    const orderNumber = `AURA-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        for (const item of order.orderItems) {
          const itemPurchaseMode = item.purchaseMode ?? purchaseMode;
          const allocationOperation = itemPurchaseMode === 'demo'
            ? makeDemoStockAllocationOperation(item.product, item.quantity)
            : makeStockAllocationOperation(item.product, item.quantity);
          const allocation = await ProductModel.updateOne(
            allocationOperation.filter,
            allocationOperation.update,
            { session },
          );
          if (allocation.modifiedCount !== 1) {
            throw new InventoryError(`Insufficient inventory for "${item.name}". Please update your cart.`);
          }
        }
        const [created] = await OrderModel.create(
          [{
            ...order,
            purchaseMode,
            ...(purchaseMode === 'demo' ? {
              demoReservationStatus: 'reserved',
              demoReservationExpiresAt: new Date(Date.now() + DEMO_RESERVATION_TTL_MS),
            } : {}),
            id,
            orderNumber,
            checkoutIdempotencyKey: idempotencyKey,
            checkoutPayloadHash: payloadHash,
          }],
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
    const orders = await OrderModel.find({
      'user.id': userId,
      hiddenFromCustomerAt: null,
    }).sort({ createdAt: -1 }).lean().exec();
    return orders.map((order) => orderFromDocument(order));
  }

  public async removeCancelledOrderFromCustomerHistory(
    orderId: string,
    userId: string,
  ): Promise<CustomerOrderHistoryRemovalResult> {
    this.assertConnected();
    const order = await OrderModel.findOne({ $or: [{ id: orderId }, { orderNumber: orderId }] })
      .select('id user.id status isPaid hiddenFromCustomerAt')
      .lean()
      .exec();
    if (!order) return 'not-found';
    if (order.user.id !== userId) return 'forbidden';
    if (order.status !== 'Cancelled' || order.isPaid) return 'not-cancelled';
    if (order.hiddenFromCustomerAt) return 'already-removed';

    const updated = await OrderModel.findOneAndUpdate(
      {
        id: order.id,
        'user.id': userId,
        status: 'Cancelled',
        isPaid: false,
        hiddenFromCustomerAt: null,
      },
      { $set: { hiddenFromCustomerAt: new Date() } },
      { new: true },
    ).lean().exec();
    if (updated) return 'removed';

    const latest = await OrderModel.findOne({ id: order.id })
      .select('user.id status isPaid hiddenFromCustomerAt')
      .lean()
      .exec();
    if (!latest) return 'not-found';
    if (latest.user.id !== userId) return 'forbidden';
    if (latest.status !== 'Cancelled' || latest.isPaid) return 'not-cancelled';
    return latest.hiddenFromCustomerAt ? 'already-removed' : 'not-cancelled';
  }

  public async findAllOrders(): Promise<Order[]> {
    this.assertConnected();
    const orders = await OrderModel.find().sort({ createdAt: -1 }).lean().exec();
    return orders.map((order) => orderFromDocument(order));
  }

  public async findExpiredDemoReservations(before = new Date()): Promise<Order[]> {
    this.assertConnected();
    const orders = await OrderModel.find({
      purchaseMode: 'demo',
      demoReservationStatus: 'reserved',
      demoReservationExpiresAt: { $lte: before },
      isPaid: false,
      status: 'Pending',
    }).lean().exec();
    return orders.map((order) => orderFromDocument(order));
  }

  public async releaseExpiredDemoReservation(orderId: string, before = new Date()): Promise<Order | undefined> {
    this.assertConnected();
    const session = await mongoose.startSession();
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        const current = await OrderModel.findOne({
          id: orderId,
          purchaseMode: 'demo',
          demoReservationStatus: 'reserved',
          demoReservationExpiresAt: { $lte: before },
          isPaid: false,
          status: 'Pending',
        }).session(session).lean().exec();
        if (!current) return;

        const updated = await OrderModel.findOneAndUpdate(
          {
            id: orderId,
            purchaseMode: 'demo',
            demoReservationStatus: 'reserved',
            demoReservationExpiresAt: { $lte: before },
            isPaid: false,
            status: 'Pending',
          },
          { $set: { status: 'Cancelled', demoReservationStatus: 'released' } },
          { new: true, runValidators: true, session },
        ).lean().exec();
        if (!updated) return;

        for (const item of current.orderItems) {
          const restored = await ProductModel.updateOne(
            { id: item.product },
            { $inc: { demoStock: item.quantity } },
            { session },
          );
          if (restored.modifiedCount !== 1) {
            throw new Error(`Unable to restore demo inventory for expired order item "${item.product}".`);
          }
        }
        result = orderFromDocument(updated);
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  private async cancelUnpaidOrder(
    orderId: string,
    userId: string,
    payment: { method: 'Razorpay'; razorpayOrderId: string }
      | { method: 'Local Demo' | 'Cash on Delivery' },
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
        if (current.status === 'Cancelled') {
          throw new OrderCancellationError('This order is already cancelled.');
        }
        if (current.isPaid || current.status !== 'Pending') {
          throw new OrderCancellationError('Only unpaid pending orders can be cancelled.');
        }
        if (current.demoPaymentAttempts?.some((attempt) => attempt.outcome === 'success')) {
          throw new OrderCancellationError('A successful payment attempt prevents cancellation.');
        }
        if (payment.method === 'Razorpay') {
          if (current.paymentMethod !== 'Razorpay'
            || current.razorpayOrderId !== payment.razorpayOrderId) {
            throw new OrderCancellationError('The order changed while its payment status was being checked.');
          }
          if (current.paymentResult && current.paymentResult.status !== 'failed') {
            throw new OrderCancellationError('Payment verification is unresolved; the order and reservation remain unchanged.');
          }
          if (isDemoTestOrder(current) && current.demoReservationStatus !== 'reserved') {
            throw new OrderCancellationError('The demonstration reservation is no longer reserved.');
          }
        } else if (current.paymentMethod !== payment.method
          || current.razorpayOrderId
          || current.paymentResult) {
          throw new OrderCancellationError('Payment recovery is required because the order may have an unresolved provider payment.');
        }

        const stateFilter = payment.method === 'Razorpay'
          ? {
            razorpayOrderId: payment.razorpayOrderId,
            $or: [
              { paymentResult: { $exists: false } },
              { paymentResult: null },
              { 'paymentResult.status': 'failed' },
            ],
          }
          : {
            razorpayOrderId: { $exists: false },
            paymentResult: { $exists: false },
          };
        const updated = await OrderModel.findOneAndUpdate(
          {
            id: orderId,
            'user.id': userId,
            paymentMethod: payment.method,
            isPaid: false,
            status: 'Pending',
            'demoPaymentAttempts.outcome': { $ne: 'success' },
            ...stateFilter,
          },
          {
            $set: {
              status: 'Cancelled',
              ...(isDemoTestOrder(current) ? { demoReservationStatus: 'released' } : {}),
            },
          },
          { new: true, runValidators: true, session },
        ).lean().exec();
        if (!updated) {
          throw new OrderCancellationError('The order changed while it was being cancelled; refresh and try again.');
        }

        for (const item of current.orderItems) {
          const restored = await ProductModel.updateOne(
            { id: item.product },
            { $inc: isDemoTestOrder(current)
              ? { demoStock: item.quantity }
              : { stock: item.quantity } },
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

  public async cancelUnpaidOrderWithoutGateway(
    orderId: string,
    userId: string,
    paymentMethod: 'Local Demo' | 'Cash on Delivery',
  ): Promise<Order | undefined> {
    return this.cancelUnpaidOrder(orderId, userId, { method: paymentMethod });
  }

  public async cancelOrderAfterVerifiedGatewayExpiry(
    orderId: string,
    userId: string,
    razorpayOrderId: string,
  ): Promise<Order | undefined> {
    return this.cancelUnpaidOrder(orderId, userId, { method: 'Razorpay', razorpayOrderId });
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
            {
              $set: {
                status: 'Cancelled',
                ...(isDemoTestOrder(current) ? { demoReservationStatus: 'released' } : {}),
              },
            },
            { new: true, runValidators: true, session },
          ).lean().exec();
          if (!updated) return;

          for (const item of current.orderItems) {
            const restored = await ProductModel.updateOne(
              { id: item.product },
              { $inc: isDemoTestOrder(current)
                ? { demoStock: item.quantity }
                : { stock: item.quantity } },
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
    if (status === 'Demo Completed') {
      throw new OrderCancellationError('DEMO/TEST completion is assigned only after verified payment capture.');
    }
    if (isDemoOrderStatusUpdateForbidden(current, status)) {
      throw new OrderCancellationError('DEMO/TEST order status is managed by payment verification and is not eligible for fulfillment.');
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

  public async updateOrderRazorpayId(
    orderId: string,
    razorpayOrderId: string,
    demoGatewayOrderExpiresAt?: Date,
  ): Promise<Order | undefined> {
    this.assertConnected();
    const now = new Date();
    const updated = await OrderModel.findOneAndUpdate(
      {
        id: orderId,
        paymentMethod: 'Razorpay',
        status: 'Pending',
        isPaid: false,
        $and: [
          { $or: [{ razorpayOrderId: { $exists: false } }, { razorpayOrderId: null }] },
          {
            $or: [
              { purchaseMode: { $ne: 'demo' } },
              {
                purchaseMode: 'demo',
                demoReservationStatus: 'reserved',
                demoReservationExpiresAt: { $gt: now },
              },
            ],
          },
        ],
      },
      {
        $set: {
          razorpayOrderId,
          ...(demoGatewayOrderExpiresAt ? { demoGatewayOrderExpiresAt } : {}),
        },
      },
      { new: true },
    ).lean().exec();
    if (updated) return orderFromDocument(updated);
    const existing = await OrderModel.findOne({
      id: orderId,
      paymentMethod: 'Razorpay',
      status: 'Pending',
      isPaid: false,
    }).lean().exec();
    if (existing?.purchaseMode === 'demo'
      && (existing.demoReservationStatus !== 'reserved'
        || !existing.demoReservationExpiresAt
        || new Date(existing.demoReservationExpiresAt).getTime() <= now.getTime())) {
      return undefined;
    }
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
    const unsets: Record<string, number> = {};
    if (paymentResult.status === 'captured') {
      updates.paidAt = new Date();
      const current = await OrderModel.findOne({ id: orderId })
        .select('purchaseMode orderItems.purchaseMode')
        .lean()
        .exec();
      const isDemoOrder = current ? isDemoTestOrder(current) : false;
      updates.status = isDemoOrder ? 'Demo Completed' : 'Processing';
      if (isDemoOrder) {
        updates.demoReservationStatus = 'consumed';
        unsets.demoReservationExpiresAt = 1;
      }
    }
    const order = await OrderModel.findOneAndUpdate(
      { id: orderId, isPaid: false, status: 'Pending' },
      { $set: updates, ...(Object.keys(unsets).length ? { $unset: unsets } : {}) },
      { new: true, runValidators: true },
    ).lean().exec();
    return order ? orderFromDocument(order) : undefined;
  }

  public async getHealthCounts() {
    this.assertConnected();
    const [totalProducts, totalOrders, totalCustomers] = await Promise.all([
      ProductModel.countDocuments(),
      OrderModel.countDocuments(),
      UserModel.countDocuments({ role: 'customer' }),
    ]);
    return { totalProducts, totalOrders, totalCustomers };
  }

  public async getAdminStats() {
    this.assertConnected();
    const demoOrderFilter = {
      $or: [{ purchaseMode: 'demo' }, { 'orderItems.purchaseMode': 'demo' }],
    };
    const physicalOrderFilter = {
      purchaseMode: { $ne: 'demo' },
      'orderItems.purchaseMode': { $ne: 'demo' },
    };
    const [
      paidOrders,
      orders,
      totalCustomers,
      totalProducts,
      lowStockCount,
      totalOrders,
      physicalOrdersCount,
      demoOrdersCount,
      demoPaidOrdersCount,
    ] = await Promise.all([
      OrderModel.find({ isPaid: true, ...physicalOrderFilter }).lean().exec(),
      OrderModel.find().sort({ createdAt: -1 }).limit(8).lean().exec(),
      UserModel.countDocuments({ role: 'customer' }),
      ProductModel.countDocuments(),
      ProductModel.countDocuments({ stock: { $lt: 10 }, status: 'active' }),
      OrderModel.countDocuments(),
      OrderModel.countDocuments(physicalOrderFilter),
      OrderModel.countDocuments(demoOrderFilter),
      OrderModel.countDocuments({ ...demoOrderFilter, isPaid: true }),
    ]);
    const categoryRevenue = new Map<string, number>();
    for (const order of paidOrders) {
      for (const item of order.orderItems) {
        const product = await this.findProductById(item.product);
        const category = product?.category || item.category || 'General';
        categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + item.price * item.quantity);
      }
    }
    return {
      totalSales: paidOrders.reduce((sum, order) => sum + order.totalPrice, 0),
      totalOrders,
      physicalOrdersCount,
      demoOrdersCount,
      demoPaidOrdersCount,
      paidOrdersCount: paidOrders.length,
      totalCustomers,
      totalProducts,
      lowStockCount,
      categoryRevenue: [...categoryRevenue.entries()].map(([category, revenue]) => ({ category, revenue })),
      recentOrders: orders.map((order) => orderFromDocument(order)),
    };
  }

  public async syncDatasetProducts() {
    if (!isDatasetMutationAllowed()) {
      throw new Error('Dataset catalogue sync is disabled in production.');
    }
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
