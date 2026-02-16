/**
 * Background pipeline runner that updates stage progress in MongoDB.
 * Falls back to simulation mode when ANTHROPIC_API_KEY is not set.
 */

import { PIPELINE_STAGES_ORDER, type PipelineStage } from '@/types/pipeline';

const SIMULATION_DELAYS: Record<PipelineStage, number> = {
  extractor: 4000,
  model: 3000,
  template: 3000,
  mapping: 3500,
  writing: 5000,
  verification: 3500,
};

async function updateStageProgress(
  projectId: string,
  stage: string,
  status: 'queued' | 'running' | 'completed' | 'failed',
  error?: string
): Promise<void> {
  const { connectToDatabase, Project } = await import('@/lib/db');
  await connectToDatabase();

  const update: Record<string, unknown> = {
    'pipelineProgress.$.status': status,
  };

  if (status === 'running') {
    update['pipelineProgress.$.startedAt'] = new Date();
  }
  if (status === 'completed' || status === 'failed') {
    update['pipelineProgress.$.completedAt'] = new Date();
  }
  if (error) {
    update['pipelineProgress.$.error'] = error;
  }

  await Project.updateOne(
    { _id: projectId, 'pipelineProgress.stage': stage },
    { $set: update }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the real AI pipeline can be used.
 * Returns false if key is missing, empty, or a placeholder value.
 */
function hasAnthropicKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.length < 10) return false;
  // Detect placeholder values
  const placeholders = ['LIPSESTE', 'MISSING', 'PLACEHOLDER', 'your-key', 'sk-ant-xxx'];
  return !placeholders.some((p) => key.includes(p));
}

/**
 * Run the pipeline for a project in the background.
 * Updates pipelineProgress on the project document as each stage runs.
 * Falls back to simulation if ANTHROPIC_API_KEY is not available.
 */
export async function runPipelineBackground(
  projectId: string,
  userId: string
): Promise<void> {
  const { connectToDatabase, Project, DocumentModel, Audit } = await import('@/lib/db');
  await connectToDatabase();

  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Determine which stages to run (skip model if no model documents)
  const modelDocs = await DocumentModel.countDocuments({
    projectId,
    role: 'model',
    status: { $ne: 'deleted' },
  });
  const hasModel = modelDocs > 0;

  const stages = PIPELINE_STAGES_ORDER.filter(
    (stage) => stage !== 'model' || hasModel
  );

  // Initialize all stages as queued
  const pipelineProgress = stages.map((stage) => ({
    stage,
    status: 'queued' as const,
  }));
  await Project.findByIdAndUpdate(projectId, {
    $set: { pipelineProgress, status: 'processing' },
  });

  const useRealPipeline = hasAnthropicKey();
  console.log(
    `[Pipeline] Starting ${useRealPipeline ? 'real' : 'simulated'} pipeline for project ${projectId}`
  );

  for (const stage of stages) {
    // Mark stage as running
    await updateStageProgress(projectId, stage, 'running');
    console.log(`[Pipeline] Running ${stage}...`);

    try {
      if (useRealPipeline) {
        // Try real AI pipeline stage, fallback to mock on failure
        try {
          const { runPipeline } = await import('@/lib/ai/pipeline');
          await runPipeline(projectId, stage);
        } catch (aiError) {
          console.warn(`[Pipeline] Real AI failed for ${stage}, falling back to mock:`, aiError);
          await runMockStage(stage, projectId, Project);
        }
      } else {
        // Simulate with delay + save mock data
        await runMockStage(stage, projectId, Project);
      }

      // Mark stage as completed
      await updateStageProgress(projectId, stage, 'completed');
      console.log(`[Pipeline] ${stage} completed`);
    } catch (error) {
      console.error(`[Pipeline] ${stage} failed:`, error);
      await updateStageProgress(
        projectId,
        stage,
        'failed',
        error instanceof Error ? error.message : String(error)
      );

      // Reset project status so user can retry
      await Project.findByIdAndUpdate(projectId, { $set: { status: 'draft' } });

      await Audit.create({
        userId,
        projectId,
        action: 'pipeline_failed',
        details: { stage, error: error instanceof Error ? error.message : String(error) },
      });

      return;
    }
  }

  // Mark project as ready
  await Project.findByIdAndUpdate(projectId, { $set: { status: 'ready' } });

  await Audit.create({
    userId,
    projectId,
    action: 'pipeline_completed',
    details: { simulated: !useRealPipeline },
  });

  console.log(`[Pipeline] Completed project ${projectId}`);
}

/**
 * Run a mock/simulated stage with delay and save mock data.
 */
async function runMockStage(
  stage: PipelineStage,
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Project: any
): Promise<void> {
  await sleep(SIMULATION_DELAYS[stage]);

  const { getMockStageOutput, getStageOutputField } = await import('@/lib/ai/mock-pipeline-data');
  const outputField = getStageOutputField(stage);
  if (outputField) {
    const mockOutput = getMockStageOutput(stage);
    await Project.findByIdAndUpdate(projectId, {
      $set: { [outputField]: mockOutput },
    });
  }
}
