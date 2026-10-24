import mongoose, { Schema } from 'mongoose';

export interface IProductDocument {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  activeImage?: string;
  stock: number;
  sku: string;
  status: 'active' | 'inactive';
  rating: number;
  numReviews: number;
  brand: string;
  features?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProductDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, index: true },
    image: { type: String, required: true },
    activeImage: { type: String },
    stock: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0, min: 0 },
    brand: { type: String, default: 'AURA', trim: true },
    features: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

productSchema.index({ status: 1, category: 1, name: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text', sku: 'text' });
productSchema.index({ activeImage: 1 }, { unique: true, sparse: true });

export const ProductModel = (mongoose.models.AuraProduct as mongoose.Model<IProductDocument> | undefined)
  || mongoose.model<IProductDocument>('AuraProduct', productSchema);
