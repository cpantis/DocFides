import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import {
  validateFileSize,
  validateMimeType,
  resolveMimeType,
} from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile } from '@/lib/storage/tmp-storage';
import { processLibraryItemAsync } from '@/lib/library/process-async';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();
    const item = await LibraryItem.findOne({ _id: id, userId });

    if (!item) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }

    return NextResponse.json({ data: item });
  } catch (error) {
    console.error('[LIBRARY_ID_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const maxDuration = 60;

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const contentType = req.headers.get('content-type') ?? '';

    await connectToDatabase();

    const item = await LibraryItem.findOne({ _id: id, userId });
    if (!item) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }

    // If multipart form data — re-upload file
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const name = formData.get('name') as string | null;

      if (file) {
        const mimeType = resolveMimeType(file.type, file.name);

        if (!validateMimeType(mimeType)) {
          return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
        }

        if (!validateFileSize(file.size)) {
          return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileHash = await hashFile(buffer);

        const storageKey = `library/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await saveTempFile(storageKey, buffer);

        item.originalFilename = file.name;
        item.mimeType = mimeType;
        item.sizeBytes = file.size;
        item.fileHash = fileHash;
        item.storageKey = storageKey;
        item.status = 'uploaded';
        item.processedData = undefined;
        item.processingError = undefined;
      }

      if (name && name.trim().length > 0) {
        item.name = name.trim();
      }

      await item.save();

      // Re-process if file was re-uploaded
      if (file) {
        processLibraryItemAsync(id, item.type, item.storageKey, item.originalFilename).catch((err) => {
          console.error(`[LIBRARY] Re-processing failed for ${id}:`, err);
        });
      }

      return NextResponse.json({ data: item });
    }

    // JSON body — name update only
    const body = updateSchema.parse(await req.json());
    if (body.name) {
      item.name = body.name;
      await item.save();
    }

    return NextResponse.json({ data: item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_ID_PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const item = await LibraryItem.findOneAndDelete({ _id: id, userId });
    if (!item) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }

    // Clean up temp file
    try {
      const { deleteTempFile } = await import('@/lib/storage/tmp-storage');
      await deleteTempFile(item.storageKey);
    } catch {
      // Best-effort cleanup
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIBRARY_ID_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
