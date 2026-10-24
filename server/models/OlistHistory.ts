import mongoose, { Schema } from 'mongoose';

export interface OlistHistoryDocument extends Record<string, unknown> {
  _id: string;
  source: 'olist';
  importedAt: Date;
}

const schema = new Schema<OlistHistoryDocument>(
  {
    _id: { type: String, required: true },
    source: { type: String, required: true, immutable: true, default: 'olist' },
    importedAt: { type: Date, required: true, immutable: true },
  },
  { strict: false, versionKey: false },
);

const collectionNames = {
  customers: 'aura_olist_history_customers',
  sellers: 'aura_olist_history_sellers',
  products: 'aura_olist_history_products',
  orders: 'aura_olist_history_orders',
  orderItems: 'aura_olist_history_order_items',
  payments: 'aura_olist_history_payments',
  reviews: 'aura_olist_history_reviews',
  geolocation: 'aura_olist_history_geolocation',
  categoryTranslations: 'aura_olist_history_category_translations',
} as const;

export type OlistHistoryTable = keyof typeof collectionNames;

const modelFor = (table: OlistHistoryTable): mongoose.Model<OlistHistoryDocument> => {
  const modelName = `AuraOlistHistory${table}`;
  return (mongoose.models[modelName] as mongoose.Model<OlistHistoryDocument> | undefined)
    || mongoose.model<OlistHistoryDocument>(modelName, schema, collectionNames[table]);
};

export const olistHistoryModels: Record<OlistHistoryTable, mongoose.Model<OlistHistoryDocument>> = {
  customers: modelFor('customers'),
  sellers: modelFor('sellers'),
  products: modelFor('products'),
  orders: modelFor('orders'),
  orderItems: modelFor('orderItems'),
  payments: modelFor('payments'),
  reviews: modelFor('reviews'),
  geolocation: modelFor('geolocation'),
  categoryTranslations: modelFor('categoryTranslations'),
};
