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

/**
 * Google Gemini model IDs used by each pipeline stage.
 *
 * - Parser: Gemini 2.5 Flash (fast, cheap — document parsing)
 * - Extract & Analyze: Gemini 2.5 Pro (best quality for data extraction + field mapping)
 * - Write & Verify: Gemini 2.5 Pro (best quality for text generation + verification)
 * - Template/Model agents: Gemini 2.5 Flash (structural analysis)
 */
export const AGENT_MODELS = {
  parser: 'gemini-2.5-flash',
  extract_analyze: 'gemini-2.5-pro',
  write_verify: 'gemini-2.5-pro',
  // Library processing agents
  template: 'gemini-2.5-flash',
  model: 'gemini-2.5-flash',
  // Legacy keys for backward compatibility
  extractor: 'gemini-2.5-flash',
  mapping: 'gemini-2.5-flash',
  writing: 'gemini-2.5-pro',
  verification: 'gemini-2.5-pro',
} as const;

export const PIPELINE_STAGES_ORDER: PipelineStage[] = [
  'parser',
  'extract_analyze',
  'write_verify',
];
