/**
 * Background pipeline runner that updates stage progress in MongoDB.
 * Requires ANTHROPIC_API_KEY to be set — fails clearly if AI is unavailable.
 */

import { PIPELINE_STAGES_ORDER } from '@/types/pipeline';

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

/**
 * Validate that ANTHROPIC_API_KEY is configured and not a placeholder.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateAnthropicKey(): { valid: boolean; reason?: string } {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key || key.trim().length === 0) {
    return { valid: false, reason: 'ANTHROPIC_API_KEY is not set in environment variables' };
  }

  if (key.length < 10) {
    return { valid: false, reason: 'ANTHROPIC_API_KEY appears to be too short — check your .env.local' };
  }

  const placeholders = ['LIPSESTE', 'MISSING', 'PLACEHOLDER', 'your-key', 'sk-ant-xxx'];
  const found = placeholders.find((p) => key.includes(p));
  if (found) {
    return { valid: false, reason: `ANTHROPIC_API_KEY contains placeholder value "${found}" — set a real API key in .env.local` };
  }

  return { valid: true };
}

/**
 * Fail the pipeline early with a clear error message.
 * Sets status to 'draft' so the user can retry after fixing the issue.
 */
async function failPipelineEarly(
  projectId: string,
  userId: string,
  errorMessage: string
): Promise<void> {
  const { Project, Audit } = await import('@/lib/db');

  console.error(`[Pipeline] Cannot start: ${errorMessage}`);

  // Update the first stage in existing pipelineProgress as 'failed',
  // keeping remaining stages as 'queued' so the UI shows the failure correctly.
  const project = await Project.findById(projectId).lean();
  const existing = (project?.pipelineProgress ?? []) as Array<{ stage: string; status: string }>;

  const updatedProgress = existing.length > 0
    ? existing.map((s, i) =>
        i === 0
          ? { ...s, status: 'failed', error: errorMessage, completedAt: new Date() }
          : s
      )
    : [{ stage: 'parser', status: 'failed', error: errorMessage, completedAt: new Date() }];

  await Project.findByIdAndUpdate(projectId, {
    $set: {
      status: 'draft',
      pipelineProgress: updatedProgress,
    },
  });

  const failedStage = existing[0]?.stage ?? 'parser';
  await Audit.create({
    userId,
    projectId,
    action: 'pipeline_failed',
    details: { stage: failedStage, error: errorMessage },
  });
}

/**
 * Run the pipeline for a project in the background.
 * Updates pipelineProgress on the project document as each stage runs.
 *
 * Pre-flight checks:
 * 1. Valid ANTHROPIC_API_KEY
 * 2. Parsing service is reachable
 * 3. At least one source document is extracted (partial extraction is OK)
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

  // Pre-flight check 1: Validate API key
  const keyCheck = validateAnthropicKey();
  if (!keyCheck.valid) {
    await failPipelineEarly(projectId, userId, keyCheck.reason!);
    return;
  }

  // Pre-flight check 2: At least one source document exists (parsing is handled by the parser agent stage)
  const sourceCount = await DocumentModel.countDocuments({
    projectId,
    role: 'source',
    status: { $ne: 'deleted' },
  });
  if (sourceCount === 0) {
    await failPipelineEarly(
      projectId,
      userId,
      'No source documents uploaded. Upload at least one source document before running the pipeline.'
    );
    return;
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

  // pipelineProgress is already initialized by the route handler.
  // Re-initialize as safety net if it's missing.
  if (!project.pipelineProgress || project.pipelineProgress.length === 0) {
    const pipelineProgress = stages.map((stage) => ({
      stage,
      status: 'queued' as const,
    }));
    await Project.findByIdAndUpdate(projectId, {
      $set: { pipelineProgress, status: 'processing' },
    });
  }

  console.log(`[Pipeline] Starting AI pipeline for project ${projectId} (${sourceCount} source docs)`);

  for (const stage of stages) {
    // Mark stage as running
    await updateStageProgress(projectId, stage, 'running');
    console.log(`[Pipeline] Running ${stage}...`);

    try {
      const { runPipeline } = await import('@/lib/ai/pipeline');
      await runPipeline(projectId, stage);

      // Mark stage as completed
      await updateStageProgress(projectId, stage, 'completed');
      console.log(`[Pipeline] ${stage} completed`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Provide user-friendly error messages
      let userMessage = errorMsg;
      const status = (error as { status?: number }).status;
      if (status === 401) {
        userMessage = 'ANTHROPIC_API_KEY is invalid or expired. Check your API key in .env.local';
      } else if (status === 429) {
        userMessage = 'Anthropic API rate limit exceeded. Please wait a few minutes and retry.';
      } else if (status === 529) {
        userMessage = 'Anthropic API is temporarily overloaded. Please retry later.';
      } else if (errorMsg.includes('fetch failed') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
        userMessage = 'Cannot connect to Anthropic API. Check your internet connection.';
      } else if (errorMsg.includes('No extracted')) {
        userMessage = `${errorMsg}. Make sure documents were uploaded and extracted successfully before processing.`;
      }

      console.error(`[Pipeline] ${stage} failed:`, error);
      await updateStageProgress(projectId, stage, 'failed', userMessage);

      // Reset project status so user can retry
      await Project.findByIdAndUpdate(projectId, { $set: { status: 'draft' } });

      await Audit.create({
        userId,
        projectId,
        action: 'pipeline_failed',
        details: { stage, error: errorMsg },
      });

      return;
    }
  }

  // Mark project as ready
  await Project.findByIdAndUpdate(projectId, { $set: { status: 'ready' } });

  // Cleanup /tmp files for this project (all extraction data is now in MongoDB)
  try {
    const { cleanupProjectFiles } = await import('@/lib/storage/tmp-storage');
    await cleanupProjectFiles(userId, projectId);
  } catch (cleanupErr) {
    console.warn('[Pipeline] Temp file cleanup failed (non-fatal):', cleanupErr);
  }

  await Audit.create({
    userId,
    projectId,
    action: 'pipeline_completed',
    details: {},
  });

  console.log(`[Pipeline] Completed project ${projectId}`);
}
