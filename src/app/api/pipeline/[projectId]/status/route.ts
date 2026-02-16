import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, Project } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await params;
    await connectToDatabase();
    const project = await Project.findOne({ _id: projectId, userId }).lean();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const stages = (project.pipelineProgress ?? []) as Array<{
      stage: string;
      status: string;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    }>;

    const currentStage = stages.find((s) => s.status === 'running')?.stage ?? null;

    return NextResponse.json({
      data: {
        status: project.status,
        currentStage,
        stages,
      },
    });
  } catch (error) {
    console.error('[PIPELINE_STATUS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
