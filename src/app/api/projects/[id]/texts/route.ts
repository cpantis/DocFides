import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, Project, DocumentModel, Extraction } from '@/lib/db';

/**
 * GET /api/projects/[id]/texts
 *
 * Returns extracted text for all documents in a project, grouped by role.
 * Used by the editor to render actual document content in preview panels.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch all non-deleted documents for this project
    const docs = await DocumentModel.find({
      projectId: id,
      status: { $ne: 'deleted' },
    }).lean();

    // Fetch extractions for all documents
    const docIds = docs.map((d) => String(d._id));
    const extractions = await Extraction.find({
      documentId: { $in: docIds },
    }).lean();

    const extractionMap = new Map(
      extractions.map((e) => [e.documentId, e])
    );

    // Build response grouped by role
    const template: { filename: string; text: string; tables: Record<string, unknown>[] }[] = [];
    const sources: { filename: string; text: string; tables: Record<string, unknown>[] }[] = [];
    const model: { filename: string; text: string; tables: Record<string, unknown>[] }[] = [];

    for (const doc of docs) {
      const extraction = extractionMap.get(String(doc._id));
      if (!extraction) continue;

      const text = extraction.rawText
        ?? (extraction.blocks ?? [])
            .map((b) => (b as Record<string, unknown>).text ?? '')
            .filter(Boolean)
            .join('\n\n');

      if (!text) continue;

      const entry = {
        filename: doc.originalFilename,
        text,
        tables: (extraction.tables ?? []) as Record<string, unknown>[],
      };

      if (doc.role === 'template') template.push(entry);
      else if (doc.role === 'source') sources.push(entry);
      else if (doc.role === 'model') model.push(entry);
    }

    return NextResponse.json({
      data: { template, sources, model },
    });
  } catch (error) {
    console.error('[PROJECT_TEXTS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
