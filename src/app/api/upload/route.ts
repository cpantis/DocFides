import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { validateFileSize, validateMimeType, resolveMimeType } from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';

/**
 * Streaming file upload — saves to /tmp only. No database involved.
 *
 * The file is sent as raw body (not FormData) to bypass Next.js's
 * 1MB body parser limit on both Route Handlers and Server Actions.
 * Metadata (filename, projectId, role) is sent via headers.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Metadata from headers (client sends these alongside the raw body)
    const rawFilename = req.headers.get('x-filename');
    const filename = rawFilename ? decodeURIComponent(rawFilename) : null;
    const projectId = req.headers.get('x-project-id');
    const role = req.headers.get('x-role');
    const declaredMime = req.headers.get('content-type') || 'application/octet-stream';
    const tagId = req.headers.get('x-tag-id') || undefined;

    if (!filename || !projectId || !role) {
      return NextResponse.json(
        { error: 'Missing required headers: x-filename, x-project-id, x-role' },
        { status: 400 },
      );
    }

    if (!['source', 'template', 'model'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Resolve MIME type from declared type + filename extension
    const mimeType = resolveMimeType(declaredMime, filename);
    if (!validateMimeType(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    // Read the raw body stream — bypasses Next.js body parser limit
    if (!req.body) {
      return NextResponse.json({ error: 'No file body' }, { status: 400 });
    }

    const chunks: Uint8Array[] = [];
    const reader = req.body.getReader();
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      // Enforce size limit during streaming — don't buffer the whole file first
      if (!validateFileSize(totalSize)) {
        return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
      }
      chunks.push(value);
    }

    if (totalSize === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    const buffer = Buffer.concat(chunks);
    const sha256 = await hashFile(buffer);
    const storageKey = generateStorageKey(userId, projectId, filename);
    const format = filename.split('.').pop()?.toLowerCase() ?? 'unknown';

    // Save to /tmp — the only I/O operation
    await saveTempFile(storageKey, buffer);

    return NextResponse.json({
      data: {
        storageKey,
        sha256,
        originalFilename: filename,
        mimeType,
        format,
        sizeBytes: totalSize,
        role,
        projectId,
        ...(tagId ? { tagId } : {}),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[UPLOAD_STREAM]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
