import { Schema, model, models, type Document, type Model } from 'mongoose';

export type DocumentRole = 'source' | 'template' | 'model';
export type DocumentStatus = 'uploaded' | 'processing' | 'extracted' | 'failed' | 'deleted';

export interface IDocument extends Document {
  projectId: string;
  userId: string;
  originalFilename: string;
  role: DocumentRole;
  format: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: DocumentStatus;
  mimeType: string;
  pageCount?: number;
  extractionBlocks?: Record<string, unknown>[];
  tagId?: string;
  parsingErrors?: string[];
  deleteAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    projectId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    originalFilename: { type: String, required: true },
    role: { type: String, enum: ['source', 'template', 'model'], required: true },
    format: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    storageKey: { type: String, required: true },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'extracted', 'failed', 'deleted'],
      default: 'uploaded',
    },
    mimeType: { type: String, required: true },
    pageCount: { type: Number },
    extractionBlocks: [{ type: Schema.Types.Mixed }],
    tagId: { type: String },
    parsingErrors: [{ type: String }],
    deleteAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const DocumentModel = (models.Document || model<IDocument>('Document', DocumentSchema)) as Model<IDocument>;
