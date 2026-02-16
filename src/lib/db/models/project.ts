import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';

export type ProjectStatus = 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';

export interface PipelineStageProgress {
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface IProject extends Document {
  userId: string;
  name: string;
  status: ProjectStatus;
  sourceDocuments: Types.ObjectId[];
  templateDocument?: Types.ObjectId;
  modelDocuments: Types.ObjectId[];
  pipelineJobId?: Types.ObjectId;
  pipelineProgress?: PipelineStageProgress[];
  projectData?: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema?: Record<string, unknown>;
  draftPlan?: Record<string, unknown>;
  fieldCompletions?: Record<string, unknown>;
  qualityReport?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'uploading', 'processing', 'ready', 'exported'],
      default: 'draft',
    },
    sourceDocuments: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    templateDocument: { type: Schema.Types.ObjectId, ref: 'Document' },
    modelDocuments: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    pipelineJobId: { type: Schema.Types.ObjectId, ref: 'PipelineJob' },
    pipelineProgress: [{
      stage: { type: String, required: true },
      status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
      startedAt: { type: Date },
      completedAt: { type: Date },
      error: { type: String },
    }],
    projectData: { type: Schema.Types.Mixed },
    modelMap: { type: Schema.Types.Mixed },
    templateSchema: { type: Schema.Types.Mixed },
    draftPlan: { type: Schema.Types.Mixed },
    fieldCompletions: { type: Schema.Types.Mixed },
    qualityReport: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Project = (models.Project || model<IProject>('Project', ProjectSchema)) as Model<IProject>;
