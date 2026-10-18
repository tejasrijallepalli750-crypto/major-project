/**
 * Mongoose Schema & Types for Orders and Payments
 */
export interface IOrderDocument {
  _id?: string;
  orderNumber: string;
  userId: string;
  customerSnapshot: {
    name: string;
    email: string;
    phone?: string;
  };
  orderItems: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
    sku: string;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: string;
  paymentResult?: {
    id: string;
    status: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    verifiedAt?: string;
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

export const OrderSchemaDefinition = {
  orderNumber: { type: 'String', required: true, unique: true },
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  customerSnapshot: {
    name: { type: 'String', required: true },
    email: { type: 'String', required: true },
    phone: { type: 'String' },
  },
  orderItems: [
    {
      productId: { type: 'ObjectId', ref: 'Product', required: true },
      name: { type: 'String', required: true },
      price: { type: 'Number', required: true },
      quantity: { type: 'Number', required: true, min: 1 },
      image: { type: 'String', required: true },
      sku: { type: 'String', required: true },
    },
  ],
  shippingAddress: {
    fullName: { type: 'String', required: true },
    phone: { type: 'String', required: true },
    street: { type: 'String', required: true },
    city: { type: 'String', required: true },
    state: { type: 'String', required: true },
    postalCode: { type: 'String', required: true },
    country: { type: 'String', default: 'India' },
  },
  paymentMethod: { type: 'String', default: 'Razorpay' },
  paymentResult: {
    id: { type: 'String' },
    status: { type: 'String' },
    razorpay_order_id: { type: 'String' },
    razorpay_payment_id: { type: 'String' },
    razorpay_signature: { type: 'String' },
    verifiedAt: { type: 'Date' },
    amount: { type: 'Number' },
    currency: { type: 'String', default: 'INR' },
  },
  itemsPrice: { type: 'Number', required: true },
  shippingPrice: { type: 'Number', default: 0 },
  taxPrice: { type: 'Number', default: 0 },
  totalPrice: { type: 'Number', required: true },
  isPaid: { type: 'Boolean', default: false },
  paidAt: { type: 'Date' },
  isDelivered: { type: 'Boolean', default: false },
  deliveredAt: { type: 'Date' },
  status: {
    type: 'String',
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending',
  },
  timestamps: true,
};
