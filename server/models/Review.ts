import mongoose, { Schema } from 'mongoose';

export interface IReviewDocument {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

const reviewSchema = new Schema<IReviewDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const ReviewModel = (mongoose.models.AuraReview as mongoose.Model<IReviewDocument> | undefined)
  || mongoose.model<IReviewDocument>('AuraReview', reviewSchema);
