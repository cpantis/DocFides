import { PIPELINE_STAGES_ORDER, type PipelineStage } from '@/types/pipeline';

export interface PipelineContext {
  projectId: string;
  userId: string;
  hasModelDocument: boolean;
  projectData?: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema?: Record<string, unknown>;
  draftPlan?: Record<string, unknown>;
  fieldCompletions?: Record<string, unknown>;
  qualityReport?: Record<string, unknown>;
}

export interface StageResult {
  stage: PipelineStage;
  output: Record<string, unknown>;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

export async function runPipeline(context: PipelineContext): Promise<StageResult[]> {
  const results: StageResult[] = [];
  const stages = PIPELINE_STAGES_ORDER.filter(
    (stage) => stage !== 'model' || context.hasModelDocument
  );

  for (const stage of stages) {
    const startTime = Date.now();
    console.log(`[Pipeline] Running stage: ${stage}`);

    try {
      const result = await runStage(stage, context, results);
      const stageResult: StageResult = {
        stage,
        output: result.output,
        tokenUsage: result.tokenUsage,
        durationMs: Date.now() - startTime,
      };
      results.push(stageResult);

      // Update context with stage output for downstream agents
      switch (stage) {
        case 'extractor':
          context.projectData = result.output;
          break;
        case 'model':
          context.modelMap = result.output;
          break;
        case 'template':
          context.templateSchema = result.output;
          break;
        case 'mapping':
          context.draftPlan = result.output;
          break;
        case 'writing':
          context.fieldCompletions = result.output;
          break;
        case 'verification':
          context.qualityReport = result.output;
          break;
      }
    } catch (error) {
      console.error(`[Pipeline] Stage ${stage} failed:`, error);
      throw error;
    }
  }

  return results;
}

async function runStage(
  stage: PipelineStage,
  _context: PipelineContext,
  _previousResults: StageResult[]
): Promise<{ output: Record<string, unknown>; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  // TODO: Import and call the actual agent for each stage
  // For now, return placeholder
  console.log(`[Pipeline] Stage ${stage} — not yet implemented`);
  return {
    output: { stage, status: 'not_implemented' },
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}
