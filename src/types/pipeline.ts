export type PipelineStage = 'parser' | 'extract_analyze' | 'write_verify';
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
  parser: 'claude-sonnet-4-5-20250929',
  extract_analyze: 'claude-sonnet-4-5-20250929',
  write_verify: 'claude-sonnet-4-5-20250929',
  // Keep old keys for backward compat with standalone agents
  extractor: 'claude-sonnet-4-5-20250929',
  model: 'claude-sonnet-4-5-20250929',
  template: 'claude-sonnet-4-5-20250929',
  mapping: 'claude-sonnet-4-5-20250929',
  writing: 'claude-sonnet-4-5-20250929',
  verification: 'claude-sonnet-4-5-20250929',
} as const;

export const PIPELINE_STAGES_ORDER: PipelineStage[] = [
  'parser',
  'extract_analyze',
  'write_verify',
];
