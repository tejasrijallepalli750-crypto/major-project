import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User, Product, Order } from '../../src/types';
import { INITIAL_PRODUCTS } from '../../src/data/seedData';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aura_database.json');

interface DatabaseSchema {
  users: User[];
  products: Product[];
  orders: Order[];
  metadata: {
    initializedAt: string;
    lastSavedAt: string;
    version: string;
  };
}

class PersistentDatabase {
  private data: DatabaseSchema = {
    users: [],
    products: [],
    orders: [],
    metadata: {
      initializedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      version: '2.0.0',
    },
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

      if (fs.existsSync(DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        if (parsed.users && parsed.products && parsed.orders) {
          // Rehydrate live-store schema and merge any new products from INITIAL_PRODUCTS
          const existingIds = new Set((parsed.products as Product[]).map((p) => p.id));
          const mergedProducts = [...parsed.products];
          for (const initProd of INITIAL_PRODUCTS) {
            if (!existingIds.has(initProd.id)) {
              mergedProducts.push(initProd);
            }
          }

          this.data = {
            users: parsed.users,
            products: mergedProducts,
            orders: parsed.orders,
            metadata: parsed.metadata || {
              initializedAt: new Date().toISOString(),
              lastSavedAt: new Date().toISOString(),
              version: '2.0.0',
            },
          };
          this.save();
          return;
        }
      }

      this.seedDefaultDatabase();
    } catch (error) {
      console.error('[DB] Unable to load local store; re-seeding:', error);
      this.seedDefaultDatabase();
    }
  }

  private seedDefaultDatabase() {
    console.log('[DB] Seeding initial store administrator and catalog...');
    const salt = bcrypt.genSaltSync(10);
    const adminPasswordHash = bcrypt.hashSync('Admin@123', salt);
    const now = new Date().toISOString();

    const users: User[] = [
      {
        id: 'usr-admin-01',
        name: 'Store Administrator',
        email: 'admin@aura.store',
        password: adminPasswordHash,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    ];

    this.data = {
      users,
      products: INITIAL_PRODUCTS,
      orders: [],
      metadata: { initializedAt: now, lastSavedAt: now, version: '2.0.0' },
    };
    this.save();
  }

  private save() {
    try {
      this.data.metadata.lastSavedAt = new Date().toISOString();
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (error) {
      console.error('[DB] Failed to persist local store:', error);
    }
  }

  public findUserByEmail(email: string): User | undefined {
    return this.data.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find((user) => user.id === id);
  }

  public createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const created: User = {
      ...user,
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.users.push(created);
    this.save();
    return created;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const index = this.data.users.findIndex((user) => user.id === id);
    if (index === -1) return undefined;
    this.data.users[index] = { ...this.data.users[index], ...updates, updatedAt: new Date().toISOString() };
    this.save();
    return this.data.users[index];
  }

  public findProducts(options: { search?: string; category?: string; sort?: string; status?: string; page?: number; limit?: number }) {
    let result = [...this.data.products];
    if (options.status) result = result.filter((product) => product.status === options.status);
    if (options.category && options.category !== 'All') result = result.filter((product) => product.category.toLowerCase() === options.category?.toLowerCase());
    if (options.search) {
      const query = options.search.toLowerCase();
      result = result.filter((product) => [product.name, product.description, product.sku, product.brand].some((value) => value.toLowerCase().includes(query)));
    }
    if (options.sort === 'price-low') result.sort((a, b) => a.price - b.price);
    else if (options.sort === 'price-high') result.sort((a, b) => b.price - a.price);
    else if (options.sort === 'rating') result.sort((a, b) => b.rating - a.rating);
    else result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = result.length;
    const page = Math.max(1, options.page || 1);
    const limit = options.limit || 50;
    return { products: result.slice((page - 1) * limit, page * limit), total, page, totalPages: Math.ceil(total / limit) };
  }

  public findProductById(id: string): Product | undefined {
    return this.data.products.find((product) => product.id === id);
  }

  public createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const product: Product = {
      ...data,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.products.unshift(product);
    this.save();
    return product;
  }

  public updateProduct(id: string, updates: Partial<Product>): Product | undefined {
    const index = this.data.products.findIndex((product) => product.id === id);
    if (index === -1) return undefined;
    this.data.products[index] = { ...this.data.products[index], ...updates, updatedAt: new Date().toISOString() };
    this.save();
    return this.data.products[index];
  }

  public deleteProduct(id: string): boolean {
    const originalCount = this.data.products.length;
    this.data.products = this.data.products.filter((product) => product.id !== id);
    if (this.data.products.length === originalCount) return false;
    this.save();
    return true;
  }

  public getCategories(): { name: string; count: number }[] {
    const categories = new Map<string, number>();
    this.data.products.filter((product) => product.status === 'active').forEach((product) => categories.set(product.category, (categories.get(product.category) || 0) + 1));
    return Array.from(categories.entries()).map(([name, count]) => ({ name, count }));
  }

  public createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>): Order {
    const created: Order = {
      ...order,
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: `AURA-${new Date().getFullYear()}-${this.data.orders.length + 1001}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    for (const item of created.orderItems) {
      const product = this.data.products.find((candidate) => candidate.id === item.product);
      if (product) {
        product.stock = Math.max(0, product.stock - item.quantity);
        product.updatedAt = new Date().toISOString();
      }
    }
    this.data.orders.unshift(created);
    this.save();
    return created;
  }

  public findOrderById(id: string): Order | undefined {
    return this.data.orders.find((order) => order.id === id || order.orderNumber === id);
  }

  public findOrdersByUser(userId: string): Order[] {
    return this.data.orders.filter((order) => order.user.id === userId);
  }

  public findAllOrders(): Order[] {
    return [...this.data.orders];
  }

  public updateOrderStatus(orderId: string, status: Order['status']): Order | undefined {
    const order = this.findOrderById(orderId);
    if (!order) return undefined;
    order.status = status;
    if (status === 'Delivered') {
      order.isDelivered = true;
      order.deliveredAt = new Date().toISOString();
    }
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  public updateOrderRazorpayId(orderId: string, razorpayOrderId: string): Order | undefined {
    const order = this.findOrderById(orderId);
    if (!order || order.isPaid) return undefined;
    order.razorpayOrderId = razorpayOrderId;
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  public updateOrderPayment(orderId: string, paymentResult: NonNullable<Order['paymentResult']>): Order | undefined {
    const order = this.findOrderById(orderId);
    if (!order) return undefined;
    order.paymentResult = paymentResult;
    order.isPaid = paymentResult.status === 'captured';
    if (order.isPaid) {
      order.paidAt = new Date().toISOString();
      order.status = 'Processing';
    }
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  public getAdminStats() {
    const paidOrders = this.data.orders.filter((order) => order.isPaid);
    const categoryRevenue: Record<string, number> = {};
    for (const order of paidOrders) {
      for (const item of order.orderItems) {
        const category = this.findProductById(item.product)?.category || 'General';
        categoryRevenue[category] = (categoryRevenue[category] || 0) + item.price * item.quantity;
      }
    }
    return {
      totalSales: paidOrders.reduce((sum, order) => sum + order.totalPrice, 0),
      totalOrders: this.data.orders.length,
      paidOrdersCount: paidOrders.length,
      totalCustomers: this.data.users.filter((user) => user.role === 'customer').length,
      totalProducts: this.data.products.length,
      lowStockCount: this.data.products.filter((product) => product.stock < 10).length,
      categoryRevenue: Object.entries(categoryRevenue).map(([category, revenue]) => ({ category, revenue })),
      recentOrders: this.data.orders.slice(0, 8),
    };
  }

}

export const db = new PersistentDatabase();
