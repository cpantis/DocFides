export type PipelineStage = 'extractor' | 'model' | 'template' | 'mapping' | 'writing' | 'verification';
export type PipelineStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface PipelineJob {
  _id: string;
  projectId: string;
  userId: string;
  status: PipelineStatus;
  currentStage?: PipelineStage;
  stages: PipelineStageResult[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStageResult {
  stage: PipelineStage;
  status: PipelineStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

export const AGENT_MODELS = {
  extractor: 'claude-sonnet-4-5-20250929',
  model: 'claude-sonnet-4-5-20250929',
  template: 'claude-sonnet-4-5-20250929',
  mapping: 'claude-sonnet-4-5-20250929',
  writing: 'claude-opus-4-6',
  verification: 'claude-opus-4-6',
} as const;

export const PIPELINE_STAGES_ORDER: PipelineStage[] = [
  'extractor',
  'model',
  'template',
  'mapping',
  'writing',
  'verification',
];
