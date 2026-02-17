import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { auth } from '@/lib/auth/mock-auth';
import { validateMimeType, resolveMimeType, MAX_FILE_SIZE_BYTES } from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';

const CHUNK_DIR = path.join(os.tmpdir(), 'docfides-chunks');
const CHUNK_SIZE = 512 * 1024; // 512KB — well under the 1MB limit

/** Ensure the chunk directory exists. */
async function ensureChunkDir(uploadId: string): Promise<string> {
  const dir = path.join(CHUNK_DIR, uploadId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * POST /api/upload/chunk
 *
 * Chunked file upload — each chunk is <1MB, bypassing Next.js body parser limit.
 *
 * Headers:
 *   x-upload-id     — unique ID for this upload (client-generated UUID)
 *   x-chunk-index   — 0-based chunk index
 *   x-total-chunks  — total number of chunks
 *   x-filename      — URL-encoded original filename (sent with every chunk)
 *   x-project-id    — project ID
 *   x-role          — source | template | model
 *   x-tag-id        — optional tag ID (source files only)
 *
 * Body: raw chunk bytes (application/octet-stream)
 *
 * On last chunk (index === totalChunks - 1):
 *   Assembles all chunks → saves to /tmp → returns file metadata.
 *   Cleans up chunk directory.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const uploadId = req.headers.get('x-upload-id');
    const chunkIndexStr = req.headers.get('x-chunk-index');
    const totalChunksStr = req.headers.get('x-total-chunks');
    const rawFilename = req.headers.get('x-filename');
    const projectId = req.headers.get('x-project-id');
    const role = req.headers.get('x-role');
    const tagId = req.headers.get('x-tag-id') || undefined;

    if (!uploadId || !chunkIndexStr || !totalChunksStr || !rawFilename || !projectId || !role) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 },
      );
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const totalChunks = parseInt(totalChunksStr, 10);
    const filename = decodeURIComponent(rawFilename);

    if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || chunkIndex >= totalChunks) {
      return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 });
    }

    if (!['source', 'template', 'model'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Read chunk body via formData (small enough to pass the 1MB limit)
    const body = await req.arrayBuffer();
    if (body.byteLength === 0) {
      return NextResponse.json({ error: 'Empty chunk' }, { status: 400 });
    }

    if (body.byteLength > CHUNK_SIZE + 1024) { // small tolerance
      return NextResponse.json({ error: 'Chunk too large' }, { status: 400 });
    }

    // Save this chunk to the chunk staging directory
    const chunkDir = await ensureChunkDir(uploadId);
    const chunkPath = path.join(chunkDir, String(chunkIndex).padStart(6, '0'));
    await fs.writeFile(chunkPath, Buffer.from(body));

    // If this is NOT the last chunk, just acknowledge
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({ received: chunkIndex });
    }

    // ── Last chunk received — assemble the file ──

    const chunkFiles = await fs.readdir(chunkDir);
    chunkFiles.sort(); // lexicographic sort on zero-padded names = correct order

    if (chunkFiles.length !== totalChunks) {
      // Some chunks are missing — clean up and error
      await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json(
        { error: `Expected ${totalChunks} chunks, got ${chunkFiles.length}` },
        { status: 400 },
      );
    }

    // Read and concatenate all chunks
    const chunks: Buffer[] = [];
    let totalSize = 0;
    for (const file of chunkFiles) {
      const buf = await fs.readFile(path.join(chunkDir, file));
      totalSize += buf.byteLength;
      if (totalSize > MAX_FILE_SIZE_BYTES) {
        await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
        return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
      }
      chunks.push(buf);
    }

    const buffer = Buffer.concat(chunks);

    // Validate MIME type from filename extension
    const mimeType = resolveMimeType('application/octet-stream', filename);
    if (!validateMimeType(mimeType)) {
      await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    const sha256 = await hashFile(buffer);
    const storageKey = generateStorageKey(userId, projectId, filename);
    const format = filename.split('.').pop()?.toLowerCase() ?? 'unknown';

    // Save assembled file to /tmp
    await saveTempFile(storageKey, buffer);

    // Clean up chunk directory
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

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
    console.error('[UPLOAD_CHUNK]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
