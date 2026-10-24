import mongoose, { Schema } from 'mongoose';

export interface IUserDocument {
  id: string;
  name: string;
  email: string;
  password: string;
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
  cartItems: Array<{ productId: string; quantity: number }>;
  wishlistIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false },
);

const userSchema = new Schema<IUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', required: true },
    phone: { type: String, default: '' },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    cartItems: { type: [cartItemSchema], default: [] },
    wishlistIds: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const UserModel = (mongoose.models.AuraUser as mongoose.Model<IUserDocument> | undefined)
  || mongoose.model<IUserDocument>('AuraUser', userSchema);
