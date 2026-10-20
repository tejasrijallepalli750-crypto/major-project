/**
 * Document shape for products.
 */
export interface IProductDocument {
  _id?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchemaDefinition = {
  name: { type: 'String', required: true, trim: true },
  description: { type: 'String', required: true },
  price: { type: 'Number', required: true, min: 0 },
  category: { type: 'String', required: true, index: true },
  image: { type: 'String', required: true },
  stock: { type: 'Number', required: true, default: 0, min: 0 },
  sku: { type: 'String', required: true, unique: true },
  status: { type: 'String', enum: ['active', 'inactive'], default: 'active' },
  rating: { type: 'Number', default: 4.5, min: 0, max: 5 },
  numReviews: { type: 'Number', default: 0 },
  brand: { type: 'String', default: 'AURA' },
  features: [{ type: 'String' }],
  timestamps: true,
};
