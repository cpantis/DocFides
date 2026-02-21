import { Schema, model, models, type Document, type Model } from 'mongoose';

export type LibraryItemType = 'template' | 'model' | 'entity';
export type LibraryItemStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface ILibraryItem extends Document {
  userId: string;
  type: LibraryItemType;
  name: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  storageKey: string;
  status: LibraryItemStatus;
  processedData?: Record<string, unknown>;
  processingError?: string;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LibraryItemSchema = new Schema<ILibraryItem>(
  {
    userId: { type: String, required: true },
    type: { type: String, enum: ['template', 'model', 'entity'], required: true },
    name: { type: String, required: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    fileHash: { type: String, required: true },
    storageKey: { type: String, required: true },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      default: 'uploaded',
    },
    processedData: { type: Schema.Types.Mixed },
    processingError: { type: String },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

LibraryItemSchema.index({ userId: 1, type: 1 });

export const LibraryItem = (models.LibraryItem || model<ILibraryItem>('LibraryItem', LibraryItemSchema)) as Model<ILibraryItem>;
