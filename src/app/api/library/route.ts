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

const libraryTypeSchema = z.enum(['template', 'model', 'entity']);

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const type = req.nextUrl.searchParams.get('type');

    await connectToDatabase();

    const filter: Record<string, unknown> = { userId };
    if (type) {
      libraryTypeSchema.parse(type);
      filter.type = type;
    }

    const items = await LibraryItem.find(filter)
      .sort({ updatedAt: -1 })
      .select('-processedData');

    return NextResponse.json({ data: items });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string;
    const name = formData.get('name') as string;

    libraryTypeSchema.parse(type);

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = await hashFile(buffer);

    await connectToDatabase();

    // Check for duplicate by hash + type for same user
    const existing = await LibraryItem.findOne({ userId, type, fileHash });
    if (existing) {
      return NextResponse.json(
        { error: 'This file already exists in your library', existingId: existing._id },
        { status: 409 }
      );
    }

    const storageKey = `library/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await saveTempFile(storageKey, buffer);

    const item = await LibraryItem.create({
      userId,
      type,
      name: name.trim(),
      originalFilename: file.name,
      mimeType,
      sizeBytes: file.size,
      fileHash,
      storageKey,
      status: 'uploaded',
    });

    // Trigger async processing
    processLibraryItemAsync(item._id.toString(), type, storageKey, file.name).catch((err) => {
      console.error(`[LIBRARY] Processing failed for ${item._id}:`, err);
    });

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
