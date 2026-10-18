import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User, Product, Order, KaggleInsight } from '../../src/types';
import { INITIAL_PRODUCTS } from '../../src/data/seedData';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aura_database.json');

interface DatabaseSchema {
  users: User[];
  products: Product[];
  orders: Order[];
  kaggleInsights: KaggleInsight;
  metadata: {
    initializedAt: string;
    lastSavedAt: string;
    version: string;
  };
}

// Pre-calculated authentic Olist Brazilian E-Commerce Kaggle dataset metrics
// Source: Brazilian E-Commerce Public Dataset by Olist (100k Orders, 2016-2018)
const INITIAL_KAGGLE_INSIGHTS: KaggleInsight = {
  totalOrders: 99441,
  totalRevenueBRL: 16008872.12,
  topCategories: [
    { category: 'cama_mesa_banho (Bed, Bath & Table)', orderCount: 9417, avgTicket: 130.4 },
    { category: 'beleza_saude (Health & Beauty)', orderCount: 8836, avgTicket: 142.8 },
    { category: 'esporte_lazer (Sports & Leisure)', orderCount: 7720, avgTicket: 138.9 },
    { category: 'informatica_acessorios (Computers & Tech)', orderCount: 6649, avgTicket: 181.2 },
    { category: 'utilidades_domesticas (Housewares)', orderCount: 5884, avgTicket: 122.5 },
    { category: 'relogios_presentes (Watches & Gifts)', orderCount: 5624, avgTicket: 221.7 },
    { category: 'telefonia (Telephony)', orderCount: 4199, avgTicket: 98.4 },
    { category: 'automotivo (Automotive)', orderCount: 3899, avgTicket: 161.3 },
  ],
  paymentDistribution: [
    { method: 'Credit Card', percentage: 73.9, count: 76795 },
    { method: 'Boleto (Voucher)', percentage: 19.0, count: 19784 },
    { method: 'Voucher / Gift', percentage: 5.5, count: 5775 },
    { method: 'Debit Card', percentage: 1.5, count: 1529 },
  ],
  deliveryPerformance: [
    { state: 'SP (São Paulo)', avgDays: 8.3, satisfaction: 4.2 },
    { state: 'PR (Paraná)', avgDays: 11.5, satisfaction: 4.1 },
    { state: 'MG (Minas Gerais)', avgDays: 12.0, satisfaction: 4.0 },
    { state: 'RJ (Rio de Janeiro)', avgDays: 14.8, satisfaction: 3.8 },
    { state: 'BA (Bahia)', avgDays: 18.9, satisfaction: 3.6 },
    { state: 'AM (Amazonas)', avgDays: 25.4, satisfaction: 3.4 },
  ],
  historicalYearDistribution: [
    { year: 2016, orders: 329 },
    { year: 2017, orders: 45101 },
    { year: 2018, orders: 54011 },
  ],
};

class PersistentDatabase {
  private data: DatabaseSchema = {
    users: [],
    products: [],
    orders: [],
    kaggleInsights: INITIAL_KAGGLE_INSIGHTS,
    metadata: {
      initializedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      version: '1.0.0',
    },
  };

  private isLoaded = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.products && parsed.orders) {
          this.data = parsed;
          this.isLoaded = true;
          return;
        }
      }

      this.seedDefaultDatabase();
    } catch (err) {
      console.error('[DB] Error loading persistent file, re-seeding:', err);
      this.seedDefaultDatabase();
    }
  }

  private seedDefaultDatabase() {
    console.log('[DB] Seeding initial database with users, catalog & Kaggle dataset...');

    const salt = bcrypt.genSaltSync(10);
    const adminPasswordHash = bcrypt.hashSync('Admin@123', salt);
    const customerPasswordHash = bcrypt.hashSync('Customer@123', salt);

    const initialUsers: User[] = [
      {
        id: 'usr-admin-01',
        name: 'System Administrator',
        email: 'admin@aura.store',
        password: adminPasswordHash,
        role: 'admin',
        phone: '+91 98765 43210',
        address: {
          street: 'Tech Park Blvd, Suite 400',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560100',
          country: 'India',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-cust-01',
        name: 'Demo Student Customer',
        email: 'student@college.edu',
        password: customerPasswordHash,
        role: 'customer',
        phone: '+91 91234 56789',
        address: {
          street: '14 Lake View Residency, Koramangala',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560034',
          country: 'India',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Seed one completed historical order for demo customer
    const initialOrders: Order[] = [
      {
        id: 'ord-hist-1001',
        orderNumber: 'AURA-2026-1001',
        user: {
          id: 'usr-cust-01',
          name: 'Demo Student Customer',
          email: 'student@college.edu',
          phone: '+91 91234 56789',
        },
        orderItems: [
          {
            product: 'prod-001',
            name: 'AcousticPro ANC Studio Headphones',
            price: 18999,
            quantity: 1,
            image: '/src/assets/images/product_headphones_matte_1792292817977.jpg',
            sku: 'AUDIO-ANC-001',
          },
        ],
        shippingAddress: {
          fullName: 'Demo Student Customer',
          phone: '+91 91234 56789',
          street: '14 Lake View Residency, Koramangala',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560034',
          country: 'India',
        },
        paymentMethod: 'Razorpay',
        paymentResult: {
          id: 'pay_hist_test_998877',
          status: 'captured',
          razorpay_order_id: 'order_test_razorpay_1001',
          razorpay_payment_id: 'pay_test_razorpay_verified_998877',
          razorpay_signature: '7f9c8d5a1b3e6f2c4a8d0e2b4c6a8f0e2d4b6a8c0e2f4a6b8d0e2c4a6f8b0d2e',
          verifiedAt: '2026-03-01T14:30:00.000Z',
          method: 'Razorpay Test Card',
          amount: 18999,
          currency: 'INR',
        },
        itemsPrice: 18999,
        shippingPrice: 0,
        taxPrice: 3419.82,
        totalPrice: 22418.82,
        isPaid: true,
        paidAt: '2026-03-01T14:30:00.000Z',
        isDelivered: true,
        deliveredAt: '2026-03-04T11:00:00.000Z',
        status: 'Delivered',
        createdAt: '2026-03-01T14:28:00.000Z',
        updatedAt: '2026-03-04T11:00:00.000Z',
      },
    ];

    this.data = {
      users: initialUsers,
      products: INITIAL_PRODUCTS,
      orders: initialOrders,
      kaggleInsights: INITIAL_KAGGLE_INSIGHTS,
      metadata: {
        initializedAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    this.save();
    this.isLoaded = true;
  }

  private save() {
    try {
      this.data.metadata.lastSavedAt = new Date().toISOString();
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Failed to persist data to disk:', err);
    }
  }

  // --- Users Operations ---
  public findUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const newUser: User = {
      ...user,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return undefined;
    this.data.users[index] = {
      ...this.data.users[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.users[index];
  }

  // --- Products Operations ---
  public findProducts(options: {
    search?: string;
    category?: string;
    sort?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): { products: Product[]; total: number; page: number; totalPages: number } {
    let result = [...this.data.products];

    // Filter by status (default active for catalog)
    if (options.status) {
      result = result.filter((p) => p.status === options.status);
    }

    // Category filter
    if (options.category && options.category !== 'All') {
      result = result.filter((p) => p.category.toLowerCase() === options.category?.toLowerCase());
    }

    // Search query
    if (options.search) {
      const q = options.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }

    // Sorting
    if (options.sort === 'price-low') {
      result.sort((a, b) => a.price - b.price);
    } else if (options.sort === 'price-high') {
      result.sort((a, b) => b.price - a.price);
    } else if (options.sort === 'rating') {
      result.sort((a, b) => b.rating - a.rating);
    } else {
      // Default: newest
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const total = result.length;
    const page = Math.max(1, options.page || 1);
    const limit = options.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = result.slice(startIndex, startIndex + limit);

    return {
      products: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  public findProductById(id: string): Product | undefined {
    return this.data.products.find((p) => p.id === id);
  }

  public createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const newProduct: Product = {
      ...data,
      id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.products.unshift(newProduct);
    this.save();
    return newProduct;
  }

  public updateProduct(id: string, updates: Partial<Product>): Product | undefined {
    const index = this.data.products.findIndex((p) => p.id === id);
    if (index === -1) return undefined;
    this.data.products[index] = {
      ...this.data.products[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.products[index];
  }

  public deleteProduct(id: string): boolean {
    const initialLen = this.data.products.length;
    this.data.products = this.data.products.filter((p) => p.id !== id);
    if (this.data.products.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getCategories(): { name: string; count: number }[] {
    const map = new Map<string, number>();
    for (const p of this.data.products) {
      if (p.status === 'active') {
        map.set(p.category, (map.get(p.category) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }

  // --- Orders Operations ---
  public createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>): Order {
    const count = this.data.orders.length + 1001;
    const newOrder: Order = {
      ...order,
      id: `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderNumber: `AURA-2026-${count}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Atomic stock decrement
    for (const item of newOrder.orderItems) {
      const prod = this.data.products.find((p) => p.id === item.product);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        prod.updatedAt = new Date().toISOString();
      }
    }

    this.data.orders.unshift(newOrder);
    this.save();
    return newOrder;
  }

  public findOrderById(id: string): Order | undefined {
    return this.data.orders.find((o) => o.id === id || o.orderNumber === id);
  }

  public findOrdersByUser(userId: string): Order[] {
    return this.data.orders.filter((o) => o.user.id === userId);
  }

  public findAllOrders(): Order[] {
    return [...this.data.orders];
  }

  public updateOrderStatus(orderId: string, status: Order['status']): Order | undefined {
    const order = this.data.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
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

  public updateOrderPayment(orderId: string, paymentResult: NonNullable<Order['paymentResult']>): Order | undefined {
    const order = this.data.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
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

  // --- Kaggle Dataset & Admin Analytics ---
  public getAdminStats() {
    const orders = this.data.orders;
    const paidOrders = orders.filter((o) => o.isPaid);
    const totalSales = paidOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const totalOrders = orders.length;
    const totalCustomers = this.data.users.filter((u) => u.role === 'customer').length;
    const totalProducts = this.data.products.length;
    const lowStockCount = this.data.products.filter((p) => p.stock < 10).length;

    // Category breakdown
    const categoryRevenueMap: Record<string, number> = {};
    for (const order of paidOrders) {
      for (const item of order.orderItems) {
        const prod = this.data.products.find((p) => p.id === item.product);
        const cat = prod?.category || 'General';
        categoryRevenueMap[cat] = (categoryRevenueMap[cat] || 0) + item.price * item.quantity;
      }
    }

    return {
      totalSales,
      totalOrders,
      paidOrdersCount: paidOrders.length,
      totalCustomers,
      totalProducts,
      lowStockCount,
      categoryRevenue: Object.entries(categoryRevenueMap).map(([category, revenue]) => ({
        category,
        revenue,
      })),
      recentOrders: orders.slice(0, 8),
    };
  }

  public getKaggleInsights(): KaggleInsight {
    return this.data.kaggleInsights;
  }

  public resetToDemo() {
    this.seedDefaultDatabase();
    return { success: true, message: 'Database reset to initial demo state.' };
  }
}

export const db = new PersistentDatabase();
