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
 * Check if the real AI pipeline can be used (Anthropic API key is set).
 */
function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
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
        // Run real AI pipeline stage
        const { runPipeline } = await import('@/lib/ai/pipeline');
        await runPipeline(projectId, stage);
      } else {
        // Simulate with delay
        await sleep(SIMULATION_DELAYS[stage]);
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
