import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface ITag extends Document {
  userId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const TagSchema = new Schema<ITag>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    color: { type: String, required: true, default: '#6366f1' },
  },
  { timestamps: true }
);

// Unique tag name per user
TagSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Tag = (models.Tag || model<ITag>('Tag', TagSchema)) as Model<ITag>;
