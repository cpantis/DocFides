import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import {
  validateFileSize,
  validateMimeType,
  resolveMimeType,
} from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile, deleteTempFile } from '@/lib/storage/tmp-storage';

function generateLibraryStorageKey(userId: string, itemId: string, filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/library/${itemId}/${timestamp}_${sanitized}`;
}

/** POST /api/library/models/[id]/document — upload or replace the model document */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = resolveMimeType(file.type, file.name);

    if (!validateMimeType(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    if (!validateFileSize(file.size)) {
      return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
    }

    await connectToDatabase();

    const modelItem = await LibraryItem.findOne({ _id: id, userId, type: 'model' });
    if (!modelItem) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = await hashFile(buffer);
    const storageKey = generateLibraryStorageKey(userId, id, file.name);
    const format = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    await saveTempFile(storageKey, buffer);

    // Models have exactly one document — replace if exists
    if (modelItem.documents.length > 0) {
      const oldDoc = modelItem.documents[0]!;
      await deleteTempFile(oldDoc.storageKey);
      modelItem.documents = [];
    }

    modelItem.documents.push({
      originalFilename: file.name,
      format,
      sizeBytes: file.size,
      sha256,
      storageKey,
      mimeType,
      status: 'uploaded',
      uploadedAt: new Date(),
    });

    // Store fileData in MongoDB for resilience
    modelItem.documents[0]!.fileData = buffer;

    await modelItem.save();

    const updated = await LibraryItem.findById(id)
      .select('-documents.fileData')
      .lean();

    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (error) {
    console.error('[LIBRARY_MODEL_DOCUMENT_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/library/models/[id]/document — remove the model document */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const modelItem = await LibraryItem.findOne({ _id: id, userId, type: 'model' });
    if (!modelItem) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    if (modelItem.documents.length > 0) {
      await deleteTempFile(modelItem.documents[0]!.storageKey);
      modelItem.documents = [];
      modelItem.status = 'draft';
      modelItem.processedData = undefined;
      await modelItem.save();
    }

    const updated = await LibraryItem.findById(id)
      .select('-documents.fileData')
      .lean();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[LIBRARY_MODEL_DOCUMENT_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
