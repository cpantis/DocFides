import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface IGeneration extends Document {
  projectId: string;
  userId: string;
  type: 'docx' | 'pdf' | 'regeneration';
  creditsUsed: number;
  aiCostUsd?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  storageKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GenerationSchema = new Schema<IGeneration>(
  {
    projectId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['docx', 'pdf', 'regeneration'], required: true },
    creditsUsed: { type: Number, required: true },
    aiCostUsd: { type: Number },
    tokenUsage: {
      inputTokens: { type: Number },
      outputTokens: { type: Number },
    },
    storageKey: { type: String },
  },
  { timestamps: true }
);

export const Generation = (models.Generation || model<IGeneration>('Generation', GenerationSchema)) as Model<IGeneration>;
