import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectToDatabase, DocumentModel, Audit } from '@/lib/db';
import { deleteFile } from '@/lib/storage/cleanup';

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

    return NextResponse.json({ data: doc });
  } catch (error) {
    console.error('[DOCUMENT_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    // Delete from R2
    await deleteFile(doc.r2Key);

    // Mark as deleted
    doc.status = 'deleted';
    await doc.save();

    // Audit log
    await Audit.create({
      userId,
      projectId: doc.projectId,
      action: 'file_deleted',
      details: { filename: doc.originalFilename, format: doc.format },
      fileHash: doc.sha256,
    });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error('[DOCUMENT_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
