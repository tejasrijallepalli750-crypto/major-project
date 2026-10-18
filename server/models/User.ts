/**
 * Mongoose Schema & Types for Academic Major Project
 * Compatible with MongoDB Atlas & local MongoDB deployments.
 */
export interface IUserDocument {
  _id?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'customer' | 'admin';
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchemaDefinition = {
  name: { type: 'String', required: true, trim: true },
  email: { type: 'String', required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: 'String', required: true },
  role: { type: 'String', enum: ['customer', 'admin'], default: 'customer' },
  phone: { type: 'String', default: '' },
  address: {
    street: { type: 'String', default: '' },
    city: { type: 'String', default: '' },
    state: { type: 'String', default: '' },
    postalCode: { type: 'String', default: '' },
    country: { type: 'String', default: 'India' },
  },
  timestamps: true,
};
