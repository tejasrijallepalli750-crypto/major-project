export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'customer' | 'admin';
  phone?: string;
  address?: {
    street: string;
    city: string;
    district?: string;
    state: string;
    postalCode: string;
    country: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  stock: number;
  sku: string;
  status: 'active' | 'inactive';
  rating: number;
  numReviews: number;
  brand: string;
  features?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  category?: string;
  quantity: number;
  stock: number;
  sku: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  district?: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  sku: string;
  category?: string;
}

export interface PaymentResult {
  id: string;
  status: 'created' | 'authorized' | 'captured' | 'failed';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  verifiedAt?: string;
  method?: string;
  amount: number;
  currency: string;
}

export interface DemoPaymentAttempt {
  attemptId: string;
  outcome: 'success' | 'failure' | 'cancelled';
  mode: 'LOCAL_DEMO';
  amount: number;
  currency: 'INR';
  recordedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  orderItems: OrderItem[];
  shippingAddress: ShippingAddress;
  razorpayOrderId?: string;
  paymentMethod: 'Razorpay' | 'Local Demo' | 'Card' | 'UPI' | 'NetBanking' | 'Cash on Delivery';
  paymentResult?: PaymentResult;
  demoPaymentAttempts?: DemoPaymentAttempt[];
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  isPaid: boolean;
  paidAt?: string;
  isDelivered: boolean;
  deliveredAt?: string;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface SecurityTestResult {
  testId: string;
  category: 'Auth' | 'Products' | 'Cart & Orders' | 'Payment Gateway' | 'Invoices';
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'running';
  details: string;
  timestamp: string;
}
