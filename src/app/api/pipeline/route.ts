import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { connectToDatabase, Project, Audit } from '@/lib/db';

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

    // TODO: Add job to BullMQ queue
    project.status = 'processing';
    await project.save();

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'pipeline_started',
      details: {},
    });

    return NextResponse.json({ data: { status: 'queued', projectId: body.projectId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PIPELINE_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
