import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface IDraft extends Document {
  projectId: string;
  userId: string;
  version: number;
  fields: Record<string, {
    value: string;
    status: 'ai_suggested' | 'accepted' | 'edited' | 'regenerated' | 'skipped';
    previousValue?: string;
    entityChoice?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const DraftSchema = new Schema<IDraft>(
  {
    projectId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    fields: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true }
);

DraftSchema.index({ projectId: 1, version: -1 });

export const Draft = (models.Draft || model<IDraft>('Draft', DraftSchema)) as Model<IDraft>;
