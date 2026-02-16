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
    const project = await Project.findOne({ _id: projectId, userId });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        status: project.status,
        // TODO: include stage details from pipeline job
      },
    });
  } catch (error) {
    console.error('[PIPELINE_STATUS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
