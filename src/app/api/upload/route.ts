import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { validateFileSize, validateMimeType, resolveMimeType } from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';

/**
 * POST /api/upload
 *
 * Direct file upload via FormData. Body size limit is 25MB
 * (configured in next.config.ts via serverActions.bodySizeLimit).
 *
 * FormData fields:
 *   file      — the file blob
 *   projectId — project ID
 *   role      — source | template | model
 *   tagId     — optional tag ID (source files only)
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const projectId = formData.get('projectId');
    const role = formData.get('role');
    const tagId = formData.get('tagId') || undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    if (!role || typeof role !== 'string' || !['source', 'template', 'model'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const filename = file.name;

    if (!validateFileSize(file.size)) {
      return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    const mimeType = resolveMimeType(file.type || 'application/octet-stream', filename);
    if (!validateMimeType(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = await hashFile(buffer);
    const storageKey = generateStorageKey(userId, projectId, filename);
    const format = filename.split('.').pop()?.toLowerCase() ?? 'unknown';

    await saveTempFile(storageKey, buffer);

    return NextResponse.json({
      data: {
        storageKey,
        sha256,
        originalFilename: filename,
        mimeType,
        format,
        sizeBytes: file.size,
        role,
        projectId,
        ...(typeof tagId === 'string' && tagId ? { tagId } : {}),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[UPLOAD]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
