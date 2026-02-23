import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';

export type LibraryItemType = 'template' | 'model' | 'entity';
export type LibraryItemStatus = 'draft' | 'processing' | 'ready' | 'error';

/**
 * A document attached to a library item (entity).
 * Entities can have multiple documents (e.g., CI, CUI extract, ONRC certificate).
 */
export interface ILibraryDocument {
  _id?: Types.ObjectId;
  originalFilename: string;
  format: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  mimeType: string;
  status: 'uploaded' | 'processing' | 'extracted' | 'failed';
  failureReason?: string;
  extractionBlocks?: Record<string, unknown>[];
  fileData?: Buffer;
  uploadedAt: Date;
}

export interface ILibraryItem extends Document {
  userId: string;
  type: LibraryItemType;
  name: string;
  description?: string;
  documents: ILibraryDocument[];
  processedData?: Record<string, unknown>;
  status: LibraryItemStatus;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  processingAttempts: number;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LibraryDocumentSchema = new Schema<ILibraryDocument>(
  {
    originalFilename: { type: String, required: true },
    format: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'extracted', 'failed'],
      default: 'uploaded',
    },
    failureReason: { type: String },
    extractionBlocks: [{ type: Schema.Types.Mixed }],
    fileData: { type: Buffer, select: false },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const LibraryItemSchema = new Schema<ILibraryItem>(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['template', 'model', 'entity'], required: true },
    name: { type: String, required: true },
    description: { type: String },
    documents: [LibraryDocumentSchema],
    processedData: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['draft', 'processing', 'ready', 'error'],
      default: 'draft',
    },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    processingAttempts: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

LibraryItemSchema.index({ userId: 1, type: 1 });
LibraryItemSchema.index({ userId: 1, type: 1, name: 1 });

export const LibraryItem = (models.LibraryItem || model<ILibraryItem>('LibraryItem', LibraryItemSchema)) as Model<ILibraryItem>;
