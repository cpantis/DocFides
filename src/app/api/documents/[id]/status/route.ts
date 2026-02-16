import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, DocumentModel, Extraction } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const doc = await DocumentModel.findOne({ _id: id, userId });
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // If extracted, include extraction details
    let extraction = null;
    if (doc.status === 'extracted') {
      extraction = await Extraction.findOne({ documentId: id }).lean();
    }

    return NextResponse.json({
      data: {
        documentId: id,
        status: doc.status,
        filename: doc.originalFilename,
        role: doc.role,
        confidence: extraction?.overallConfidence ?? null,
        language: extraction?.language ?? null,
        blockCount: extraction?.blocks?.length ?? 0,
        tableCount: extraction?.tables?.length ?? 0,
        processingTimeMs: extraction?.processingTimeMs ?? null,
        errors: doc.parsingErrors ?? [],
      },
    });
  } catch (error) {
    console.error('[DOCUMENT_STATUS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
