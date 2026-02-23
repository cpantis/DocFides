/**
 * Background pipeline runner that updates stage progress in MongoDB.
 * Requires ANTHROPIC_API_KEY to be set — fails clearly if AI is unavailable.
 */

import { PIPELINE_STAGES_ORDER, type PipelineStage } from '@/types/pipeline';

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

  // Determine which stages to run based on pre-processed library data.
  // If all documents are from library (already parsed + analyzed), skip to write_verify.
  const stages = await determineRequiredStages(project);

  // Initialize pipelineProgress for all pipeline stages, marking skipped ones as completed
  const allStages = PIPELINE_STAGES_ORDER;
  const stagesToRun = new Set(stages);
  const pipelineProgress = allStages.map((stage) => ({
    stage,
    status: stagesToRun.has(stage) ? ('queued' as const) : ('completed' as const),
    ...(stagesToRun.has(stage) ? {} : { completedAt: new Date(), startedAt: new Date() }),
  }));
  await Project.findByIdAndUpdate(projectId, {
    $set: { pipelineProgress, status: 'processing' },
  });

  const skippedStages = allStages.filter((s) => !stagesToRun.has(s));
  if (skippedStages.length > 0) {
    console.log(`[Pipeline] Skipping pre-processed stages: ${skippedStages.join(', ')}`);
  }
  console.log(`[Pipeline] Starting AI pipeline for project ${projectId} (stages: ${stages.join(' → ')})`);

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

  // NOTE: Do NOT cleanup /tmp files here — the template file is still needed
  // for DOCX/PDF export. Stale files are cleaned by cleanupStaleFiles (24h TTL).

  await Audit.create({
    userId,
    projectId,
    action: 'pipeline_completed',
    details: {},
  });

  console.log(`[Pipeline] Completed project ${projectId}`);
}

/**
 * Determine which pipeline stages need to run based on pre-processed library data.
 *
 * Logic:
 * - If the project already has projectData + templateSchema (from library linking),
 *   skip 'parser' and 'extract_analyze' and go directly to 'write_verify'.
 * - If there are non-library (directly uploaded) documents that haven't been parsed,
 *   run all stages.
 * - Otherwise, run all 3 stages as before.
 */
async function determineRequiredStages(
  project: { _id: unknown; projectData?: unknown; templateSchema?: unknown; draftPlan?: unknown }
): Promise<PipelineStage[]> {
  const { DocumentModel, Extraction } = await import('@/lib/db');
  const projectId = String(project._id);

  // Check if there are unparsed documents that need the parser.
  // BUT: documents with status 'uploaded' that already have Extraction records
  // (from library linking) should be auto-promoted to 'extracted' first.
  const unparsedDocs = await DocumentModel.find({
    projectId,
    status: { $in: ['uploaded', 'processing', 'failed'] },
  });

  let trueUnparsedCount = 0;
  for (const doc of unparsedDocs) {
    const docId = String(doc._id);
    const hasExtraction = await Extraction.exists({ documentId: docId });
    if (hasExtraction) {
      // This document has a pre-existing Extraction record (from library linking)
      // Promote it to 'extracted' so the pipeline can use it directly
      await DocumentModel.findByIdAndUpdate(docId, { status: 'extracted' });
      console.log(`[Pipeline] Auto-promoted ${doc.originalFilename} to 'extracted' (has Extraction record)`);
    } else {
      trueUnparsedCount++;
    }
  }

  if (trueUnparsedCount > 0) {
    // Some documents haven't been parsed yet — run full pipeline
    console.log(`[Pipeline] ${trueUnparsedCount} unparsed documents found — running full pipeline`);
    return [...PIPELINE_STAGES_ORDER];
  }

  // All documents are already parsed (status: 'extracted').
  // Check if we have pre-processed extract_analyze data from library.
  const hasProjectData = project.projectData && Object.keys(project.projectData as Record<string, unknown>).length > 0;
  const hasTemplateSchema = project.templateSchema && Object.keys(project.templateSchema as Record<string, unknown>).length > 0;
  const hasDraftPlan = project.draftPlan && Object.keys(project.draftPlan as Record<string, unknown>).length > 0;

  console.log(`[Pipeline] Pre-processed data check: projectData=${!!hasProjectData}, templateSchema=${!!hasTemplateSchema}, draftPlan=${!!hasDraftPlan}`);

  if (hasProjectData && hasTemplateSchema && hasDraftPlan) {
    // All data is pre-populated from library — skip directly to write_verify
    console.log('[Pipeline] All data pre-processed from library — skipping to write_verify');
    return ['write_verify'];
  }

  if (hasTemplateSchema) {
    // Template is pre-processed but source data needs extraction — skip parser only
    console.log('[Pipeline] Template pre-processed, running extract_analyze + write_verify');
    return ['extract_analyze', 'write_verify'];
  }

  // No pre-processed data — run full pipeline
  console.log('[Pipeline] No pre-processed data detected — running full pipeline');
  return [...PIPELINE_STAGES_ORDER];
}
