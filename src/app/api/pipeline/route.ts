import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, Audit } from '@/lib/db';
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
      return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 });
    }

    // Try to queue via BullMQ (Redis). If Redis is unavailable, fall back to inline execution.
    let dispatched: 'queued' | 'inline' = 'inline';

    try {
      const { checkRedisHealth } = await import('@/lib/queue/connection');
      const redisAvailable = await checkRedisHealth();

      if (redisAvailable) {
        const { getPipelineQueue } = await import('@/lib/queue/queues');
        const queue = getPipelineQueue();
        await queue.add('pipeline', { projectId: body.projectId, userId }, {
          attempts: 1,
          removeOnComplete: true,
        });
        dispatched = 'queued';
        console.log(`[PIPELINE] Job queued via BullMQ for project ${body.projectId}`);
      } else {
        console.warn('[PIPELINE] Redis unavailable — falling back to inline execution');
      }
    } catch (queueError) {
      console.warn('[PIPELINE] Failed to queue via BullMQ, falling back to inline:', queueError);
    }

    // Fallback: run directly in background (fire-and-forget)
    if (dispatched === 'inline') {
      runPipelineBackground(body.projectId, userId).catch((error) => {
        console.error('[PIPELINE_BACKGROUND]', error);
      });
    }

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'pipeline_started',
      details: { dispatched },
    });

    return NextResponse.json({ data: { status: dispatched, projectId: body.projectId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PIPELINE_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
