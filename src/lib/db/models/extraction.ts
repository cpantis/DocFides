import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface IExtraction extends Document {
  documentId: string;
  sha256: string;
  projectId: string;
  blocks: Record<string, unknown>[];
  rawText?: string;
  tables?: Record<string, unknown>[];
  overallConfidence: number;
  language?: string;
  processingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractionSchema = new Schema<IExtraction>(
  {
    documentId: { type: String, required: true, index: true },
    sha256: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    blocks: [{ type: Schema.Types.Mixed }],
    rawText: { type: String },
    tables: [{ type: Schema.Types.Mixed }],
    overallConfidence: { type: Number, required: true },
    language: { type: String },
    processingTimeMs: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Extraction = (models.Extraction || model<IExtraction>('Extraction', ExtractionSchema)) as Model<IExtraction>;
