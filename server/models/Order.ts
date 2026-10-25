import mongoose, { Schema } from 'mongoose';
import { DemoPaymentAttempt } from '../../src/types';

export interface IOrderDocument {
  id: string;
  orderNumber: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  orderItems: Array<{
    product: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
    sku: string;
    category?: string;
    inventoryMode?: 'simulated-demo';
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    district?: string;
    state: string;
    postalCode: string;
    country: string;
  };
  razorpayOrderId?: string;
  checkoutIdempotencyKey?: string;
  checkoutPayloadHash?: string;
  demoPaymentAttempts?: Array<Omit<DemoPaymentAttempt, 'recordedAt'> & { recordedAt: Date }>;
  paymentMethod: string;
  paymentResult?: {
    id: string;
    status: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    verifiedAt?: string;
    method?: string;
    amount: number;
    currency: string;
  };
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  isPaid: boolean;
  paidAt?: Date;
  isDelivered: boolean;
  deliveredAt?: Date;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema(
  {
    product: { type: String, required: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    image: { type: String, required: true },
    sku: { type: String, required: true },
    category: { type: String, default: '' },
    inventoryMode: { type: String, enum: ['simulated-demo'] },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    user: {
      id: { type: String, required: true, index: true },
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, default: '' },
    },
    orderItems: { type: [orderItemSchema], required: true, validate: (items: unknown[]) => items.length > 0 },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      district: { type: String, default: '' },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },
    razorpayOrderId: { type: String, index: true, sparse: true },
    checkoutIdempotencyKey: { type: String },
    checkoutPayloadHash: { type: String },
    demoPaymentAttempts: {
      type: [{
        attemptId: { type: String, required: true },
        outcome: { type: String, enum: ['success', 'failure', 'cancelled'], required: true },
        mode: { type: String, enum: ['LOCAL_DEMO'], required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, enum: ['INR'], required: true },
        recordedAt: { type: Date, required: true },
      }],
      default: [],
    },
    paymentMethod: { type: String, default: 'Razorpay' },
    paymentResult: {
      id: { type: String },
      status: { type: String, enum: ['created', 'authorized', 'captured', 'failed'] },
      razorpay_order_id: { type: String },
      razorpay_payment_id: { type: String, unique: true, sparse: true },
      razorpay_signature: { type: String },
      verifiedAt: { type: String },
      method: { type: String },
      amount: { type: Number, min: 0 },
      currency: { type: String, default: 'INR' },
    },
    itemsPrice: { type: Number, required: true, min: 0 },
    shippingPrice: { type: Number, default: 0, min: 0 },
    taxPrice: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    isPaid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date },
    isDelivered: { type: Boolean, default: false },
    deliveredAt: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ 'user.id': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index(
  { 'user.id': 1, checkoutIdempotencyKey: 1 },
  { unique: true, partialFilterExpression: { checkoutIdempotencyKey: { $type: 'string' } } },
);

export const OrderModel = (mongoose.models.AuraOrder as mongoose.Model<IOrderDocument> | undefined)
  || mongoose.model<IOrderDocument>('AuraOrder', orderSchema);
