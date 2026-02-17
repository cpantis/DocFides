import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, DocumentModel, Project } from '@/lib/db';

/** GET /api/projects/[id]/documents?role=source — list documents for a project */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const role = req.nextUrl.searchParams.get('role');

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const query: Record<string, unknown> = {
      projectId: id,
      status: { $ne: 'deleted' },
    };
    if (role) {
      query.role = role;
    }

    const docs = await DocumentModel.find(query)
      .select('originalFilename status format sizeBytes tagId role mimeType')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ data: docs });
  } catch (error) {
    console.error('[PROJECT_DOCUMENTS_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
