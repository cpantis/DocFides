import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, DocumentModel, Audit } from '@/lib/db';
import { PIPELINE_STAGES_ORDER } from '@/types/pipeline';
import { runPipelineBackground } from '@/lib/ai/pipeline-runner';

const startPipelineSchema = z.object({
  projectId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = startPipelineSchema.parse(await req.json());

    await connectToDatabase();
    const project = await Project.findOne({ _id: body.projectId, userId });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status === 'processing') {
      // Check if pipeline is genuinely active (has a stage currently running)
      const progress = (project.pipelineProgress ?? []) as Array<{ stage: string; status: string }>;
      const hasRunningStage = progress.some((s) => s.status === 'running');
      if (hasRunningStage) {
        return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 });
      }
      // Pipeline is stuck in 'processing' with no running stage — allow re-trigger
      console.warn('[PIPELINE] Project stuck in processing without active stage — allowing re-trigger');
    }

    // Determine which stages to run (skip model if no model documents)
    const modelDocs = await DocumentModel.countDocuments({
      projectId: body.projectId,
      role: 'model',
      status: { $ne: 'deleted' },
    });
    const stages = PIPELINE_STAGES_ORDER.filter(
      (stage) => stage !== 'model' || modelDocs > 0
    );

    // Initialize pipelineProgress NOW so the frontend status polling
    // immediately sees all stages as 'queued'.
    const pipelineProgress = stages.map((stage) => ({
      stage,
      status: 'queued' as const,
    }));
    await Project.findByIdAndUpdate(body.projectId, {
      $set: { pipelineProgress, status: 'processing' },
    });

    // Run pipeline inline (fire-and-forget — frontend polls /status for progress)
    runPipelineBackground(body.projectId, userId).catch(async (error) => {
      console.error('[PIPELINE_BACKGROUND]', error);
      // If the background runner crashes before updating any stage,
      // mark the first stage as failed so the user sees the error.
      try {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const proj = await Project.findById(body.projectId).lean();
        const progress = (proj?.pipelineProgress ?? []) as Array<{ stage: string; status: string }>;
        const allQueued = progress.every((s) => s.status === 'queued');
        if (allQueued && progress.length > 0) {
          await Project.findByIdAndUpdate(body.projectId, {
            $set: {
              status: 'draft',
              'pipelineProgress.0.status': 'failed',
              'pipelineProgress.0.error': errorMsg,
              'pipelineProgress.0.completedAt': new Date(),
            },
          });
        }
      } catch (dbErr) {
        console.error('[PIPELINE_BACKGROUND] Failed to update error state:', dbErr);
      }
    });

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'pipeline_started',
      details: {},
    });

    return NextResponse.json({ data: { status: 'started', projectId: body.projectId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PIPELINE_POST]', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
