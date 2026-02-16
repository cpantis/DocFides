import { Schema, model, models, type Document, type Model } from 'mongoose';

export type AuditAction = 'file_uploaded' | 'file_deleted' | 'file_expired' | 'pipeline_started' | 'pipeline_completed' | 'pipeline_failed' | 'export_generated';

export interface IAudit extends Document {
  userId: string;
  projectId?: string;
  action: AuditAction;
  details: Record<string, unknown>;
  fileHash?: string;
  ipAddress?: string;
  createdAt: Date;
}

const AuditSchema = new Schema<IAudit>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: String, index: true },
    action: {
      type: String,
      enum: ['file_uploaded', 'file_deleted', 'file_expired', 'pipeline_started', 'pipeline_completed', 'pipeline_failed', 'export_generated'],
      required: true,
    },
    details: { type: Schema.Types.Mixed, default: {} },
    fileHash: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditSchema.index({ createdAt: -1 });

export const Audit = (models.Audit || model<IAudit>('Audit', AuditSchema)) as Model<IAudit>;
