import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import {
  validateFileSize,
  validateMimeType,
  resolveMimeType,
} from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile } from '@/lib/storage/tmp-storage';
import { processLibraryItem } from '@/lib/ai/library-processor';

/** Fire-and-forget processing — logs errors but doesn't block the response */
function processLibraryItemAsync(itemId: string): void {
  processLibraryItem(itemId).catch((err) => {
    console.error(`[LIBRARY_ENTITY] Background processing failed for ${itemId}:`, err);
  });
}

const MAX_ENTITY_DOCUMENTS = 10;

function generateLibraryStorageKey(userId: string, entityId: string, filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/library/${entityId}/${timestamp}_${sanitized}`;
}

/** POST /api/library/entities/[id]/documents — add a document to an entity */
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

    const entity = await LibraryItem.findOne({ _id: id, userId, type: 'entity' });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (entity.documents.length >= MAX_ENTITY_DOCUMENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ENTITY_DOCUMENTS} documents per entity` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = await hashFile(buffer);
    const storageKey = generateLibraryStorageKey(userId, id, file.name);
    const format = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    await saveTempFile(storageKey, buffer);

    entity.documents.push({
      originalFilename: file.name,
      format,
      sizeBytes: file.size,
      sha256,
      storageKey,
      mimeType,
      status: 'uploaded',
      uploadedAt: new Date(),
    });

    // Store fileData in MongoDB for entity documents too (resilience)
    const lastDoc = entity.documents[entity.documents.length - 1]!;
    lastDoc.fileData = buffer;

    await entity.save();

    // Trigger AI processing in the background (re-processes all entity documents)
    processLibraryItemAsync(id);

    // Return entity without fileData
    const updated = await LibraryItem.findById(id)
      .select('-documents.fileData')
      .lean();

    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (error) {
    console.error('[LIBRARY_ENTITY_DOCUMENTS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
