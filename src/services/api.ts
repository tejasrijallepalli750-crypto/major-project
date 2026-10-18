import { Product, User, Order, CartItem, KaggleInsight, SecurityTestResult } from '../types';

const BASE_URL = '/api';

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('aura_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const api = {
  // --- Auth Endpoints ---
  async login(email: string, password: string): Promise<{ success: boolean; token: string; user: User; message?: string }> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return data;
  },

  async register(payload: { name: string; email: string; password: string; phone?: string }): Promise<{ success: boolean; token: string; user: User; message?: string }> {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  async getProfile(): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${BASE_URL}/auth/profile`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load profile');
    return data;
  },

  async updateProfile(updates: Partial<User> & { currentPassword?: string; newPassword?: string }): Promise<{ success: boolean; user: User; message: string }> {
    const res = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update profile');
    return data;
  },

  // --- Products Endpoints ---
  async getProducts(params?: { search?: string; category?: string; sort?: string; page?: number; limit?: number }): Promise<{ success: boolean; data: Product[]; total: number; totalPages: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.category) query.append('category', params.category);
    if (params?.sort) query.append('sort', params.sort);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));

    const res = await fetch(`${BASE_URL}/products?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch products');
    return data;
  },

  async getProductById(id: string): Promise<{ success: boolean; data: Product }> {
    const res = await fetch(`${BASE_URL}/products/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Product not found');
    return data;
  },

  async getCategories(): Promise<{ success: boolean; data: { name: string; count: number }[] }> {
    const res = await fetch(`${BASE_URL}/products/categories/list`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch categories');
    return data;
  },

  async createProduct(product: Partial<Product>): Promise<{ success: boolean; data: Product; message: string }> {
    const res = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(product),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create product');
    return data;
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<{ success: boolean; data: Product; message: string }> {
    const res = await fetch(`${BASE_URL}/products/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update product');
    return data;
  },

  async deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete product');
    return data;
  },

  // --- Cart & Order Endpoints ---
  async validateCart(items: { productId: string; quantity: number }[]): Promise<{
    success: boolean;
    data: {
      items: CartItem[];
      itemsPrice: number;
      shippingPrice: number;
      taxPrice: number;
      totalPrice: number;
    };
  }> {
    const res = await fetch(`${BASE_URL}/orders/validate-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Cart validation failed');
    return data;
  },

  async createOrder(orderData: {
    orderItems: { productId: string; quantity: number }[];
    shippingAddress: any;
    paymentMethod: string;
  }): Promise<{ success: boolean; data: Order; message: string }> {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(orderData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Order creation failed');
    return data;
  },

  async getMyOrders(): Promise<{ success: boolean; data: Order[] }> {
    const res = await fetch(`${BASE_URL}/orders/my-orders`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch order history');
    return data;
  },

  async getOrderById(id: string): Promise<{ success: boolean; data: Order }> {
    const res = await fetch(`${BASE_URL}/orders/${id}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch order');
    return data;
  },

  async getAllOrders(): Promise<{ success: boolean; data: Order[] }> {
    const res = await fetch(`${BASE_URL}/orders`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch customer orders');
    return data;
  },

  async updateOrderStatus(id: string, status: string): Promise<{ success: boolean; data: Order; message: string }> {
    const res = await fetch(`${BASE_URL}/orders/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update order status');
    return data;
  },

  // --- Payment Endpoints ---
  async getPaymentConfig(): Promise<{ success: boolean; keyId: string; currency: string; mode: string }> {
    const res = await fetch(`${BASE_URL}/payment/config`);
    return res.json();
  },

  async createPaymentOrder(orderId: string): Promise<{
    success: boolean;
    data: {
      orderId: string;
      orderNumber: string;
      razorpayOrderId: string;
      amount: number;
      currency: string;
      keyId: string;
      customer: { name: string; email: string; phone?: string };
    };
  }> {
    const res = await fetch(`${BASE_URL}/payment/create-order`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Payment initiation failed');
    return data;
  },

  async verifyPayment(payload: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature?: string;
    simulateTestMode?: boolean;
  }): Promise<{ success: boolean; order: Order; message: string }> {
    const res = await fetch(`${BASE_URL}/payment/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Payment verification failed');
    return data;
  },

  // --- Admin & Kaggle Dataset Endpoints ---
  async getAdminStats(): Promise<{ success: boolean; data: any }> {
    const res = await fetch(`${BASE_URL}/admin/stats`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch admin stats');
    return data;
  },

  async getKaggleInsights(): Promise<{ success: boolean; dataset: any; data: KaggleInsight }> {
    const res = await fetch(`${BASE_URL}/admin/kaggle-insights`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch Kaggle insights');
    return data;
  },

  async importKaggleSample(): Promise<{ success: boolean; message: string; importedCount: number }> {
    const res = await fetch(`${BASE_URL}/admin/kaggle-import-sample`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to import sample');
    return data;
  },

  async resetDemoData(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/admin/reset-demo`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  // --- Automated Security & Transaction Test Runner ---
  async runSecuritySuite(): Promise<{
    success: boolean;
    totalTests: number;
    passedCount: number;
    failedCount: number;
    results: SecurityTestResult[];
  }> {
    const res = await fetch(`${BASE_URL}/tests/run-suite`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Test execution failed');
    return data;
  },

  async getSystemHealth(): Promise<any> {
    const res = await fetch(`${BASE_URL}/health`);
    return res.json();
  },

  async getServicesStatus(): Promise<any> {
    const res = await fetch(`${BASE_URL}/system/services-status`);
    return res.json();
  },
};
