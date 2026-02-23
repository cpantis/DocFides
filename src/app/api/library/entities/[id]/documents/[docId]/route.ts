import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import { deleteTempFile } from '@/lib/storage/tmp-storage';

/** DELETE /api/library/entities/[id]/documents/[docId] — remove a document from an entity */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, docId } = await params;

    await connectToDatabase();

    const entity = await LibraryItem.findOne({ _id: id, userId, type: 'entity' });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const docIndex = entity.documents.findIndex(
      (d) => d._id?.toString() === docId
    );

    if (docIndex === -1) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const removedDoc = entity.documents[docIndex]!;

    // Clean up temp file
    await deleteTempFile(removedDoc.storageKey);

    entity.documents.splice(docIndex, 1);

    // Reset status if all documents removed
    if (entity.documents.length === 0) {
      entity.status = 'draft';
    }

    await entity.save();

    const updated = await LibraryItem.findById(id)
      .select('-documents.fileData')
      .lean();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[LIBRARY_ENTITY_DOCUMENT_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
