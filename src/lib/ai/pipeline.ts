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

/**
 * Run the AI pipeline for a project.
 * If `singleStage` is provided, runs only that stage.
 * Otherwise runs all stages in order.
 */
export async function runPipeline(
  projectId: string,
  singleStage?: PipelineStage
): Promise<StageResult[]> {
  const context = await buildContextFromProject(projectId);

  const stages = singleStage
    ? [singleStage]
    : PIPELINE_STAGES_ORDER.filter(
        (stage) => stage !== 'model' || context.hasModelDocument
      );

  const results: StageResult[] = [];

  for (const stage of stages) {
    if (stage === 'model' && !context.hasModelDocument) {
      console.log(`[Pipeline] Skipping model stage — no model document`);
      continue;
    }

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

      // Update context for downstream agents
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

      // Persist stage output to project in MongoDB
      await saveStageOutput(projectId, stage, result.output);
    } catch (error) {
      console.error(`[Pipeline] Stage ${stage} failed:`, error);
      throw error;
    }
  }

  return results;
}

async function buildContextFromProject(projectId: string): Promise<PipelineContext> {
  const { connectToDatabase, Project, DocumentModel } = await import('@/lib/db');
  await connectToDatabase();

  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const modelDocs = await DocumentModel.countDocuments({
    projectId,
    role: 'model',
    status: { $ne: 'deleted' },
  });

  return {
    projectId,
    userId: project.userId,
    hasModelDocument: modelDocs > 0,
    projectData: project.projectData as Record<string, unknown> | undefined,
    modelMap: project.modelMap as Record<string, unknown> | undefined,
    templateSchema: project.templateSchema as Record<string, unknown> | undefined,
    draftPlan: project.draftPlan as Record<string, unknown> | undefined,
    fieldCompletions: undefined,
    qualityReport: project.qualityReport as Record<string, unknown> | undefined,
  };
}

async function saveStageOutput(
  projectId: string,
  stage: PipelineStage,
  output: Record<string, unknown>
): Promise<void> {
  const { connectToDatabase, Project } = await import('@/lib/db');
  await connectToDatabase();

  const update: Record<string, Record<string, unknown>> = {};
  switch (stage) {
    case 'extractor':
      update['projectData'] = output;
      break;
    case 'model':
      update['modelMap'] = output;
      break;
    case 'template':
      update['templateSchema'] = output;
      break;
    case 'mapping':
      update['draftPlan'] = output;
      break;
    case 'verification':
      update['qualityReport'] = output;
      break;
  }

  if (Object.keys(update).length > 0) {
    await Project.findByIdAndUpdate(projectId, { $set: update });
  }
}

async function runStage(
  stage: PipelineStage,
  _context: PipelineContext,
  _previousResults: StageResult[]
): Promise<{ output: Record<string, unknown>; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  // Agents are scaffolded in src/lib/ai/*-agent.ts
  // Full AI implementation will come in Phase 5
  console.log(`[Pipeline] Stage ${stage} — placeholder (AI implementation in Phase 5)`);
  return {
    output: { stage, status: 'placeholder', timestamp: new Date().toISOString() },
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}
