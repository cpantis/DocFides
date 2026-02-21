import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, DocumentModel, Audit } from '@/lib/db';
import { deleteTempFile } from '@/lib/storage/tmp-storage';

const patchDocumentSchema = z.object({
  tagId: z.string().nullable().optional(),
});

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

/** PATCH /api/documents/[id] — update tag assignment */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = patchDocumentSchema.parse(await req.json());

    await connectToDatabase();

    const update: Record<string, unknown> = {};
    if (body.tagId === null) {
      update.$unset = { tagId: '' };
    } else if (body.tagId) {
      update.tagId = body.tagId;
    }

    const doc = await DocumentModel.findOneAndUpdate(
      { _id: id, userId },
      update,
      { new: true }
    );

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ data: doc });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[DOCUMENT_PATCH]', error);
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

    // Delete from /tmp storage
    await deleteTempFile(doc.storageKey);

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
