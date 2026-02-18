/**
 * Temporary file storage using /tmp with automatic cleanup.
 * Zero external dependencies — no cloud storage, no persistent disk.
 *
 * Files are stored in /tmp/docfides/{projectId}/ and cleaned up
 * after extraction or when the project pipeline completes.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const TMP_ROOT = path.join(os.tmpdir(), 'docfides');

function filePath(key: string): string {
  return path.join(TMP_ROOT, key);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Save a buffer to /tmp. Key is typically {userId}/{projectId}/{timestamp}_{filename}.
 */
export async function saveTempFile(key: string, buffer: Buffer): Promise<string> {
  const dest = filePath(key);
  await ensureDir(path.dirname(dest));
  await fs.writeFile(dest, buffer);
  return dest;
}

/**
 * Read a file from /tmp by its key.
 */
export async function readTempFile(key: string): Promise<Buffer> {
  return fs.readFile(filePath(key));
}

/**
 * Delete a single file from /tmp (non-throwing).
 */
export async function deleteTempFile(key: string): Promise<void> {
  try {
    await fs.unlink(filePath(key));
  } catch {
    // File may already be deleted — ignore
  }
}

/**
 * Delete all temp files for a project (cleanup after pipeline completes).
 */
export async function cleanupProjectFiles(userId: string, projectId: string): Promise<void> {
  const projectDir = path.join(TMP_ROOT, userId, projectId);
  try {
    await fs.rm(projectDir, { recursive: true, force: true });
    console.log(`[TmpStorage] Cleaned up ${projectDir}`);
  } catch {
    // Directory may not exist — ignore
  }
}

/**
 * Cleanup stale temp files older than maxAgeMs (default 24h).
 * Call periodically or on server start.
 */
export async function cleanupStaleFiles(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  let cleaned = 0;
  const now = Date.now();

  try {
    const userDirs = await fs.readdir(TMP_ROOT).catch(() => [] as string[]);
    for (const userDir of userDirs) {
      const userPath = path.join(TMP_ROOT, userDir);
      const stat = await fs.stat(userPath).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const projectDirs = await fs.readdir(userPath).catch(() => [] as string[]);
      for (const projectDir of projectDirs) {
        const projectPath = path.join(userPath, projectDir);
        const pStat = await fs.stat(projectPath).catch(() => null);
        if (!pStat?.isDirectory()) continue;

        if (now - pStat.mtimeMs > maxAgeMs) {
          await fs.rm(projectPath, { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  } catch {
    // Best-effort cleanup
  }

  if (cleaned > 0) {
    console.log(`[TmpStorage] Cleaned ${cleaned} stale project directories`);
  }

  return cleaned;
}

/**
 * Read a document file with fallback to MongoDB fileData.
 * Tries /tmp first (fast), falls back to the Document model's fileData field
 * which survives container restarts on Railway.
 */
export async function readDocumentFileWithFallback(
  storageKey: string,
  documentId: string
): Promise<Buffer> {
  try {
    return await readTempFile(storageKey);
  } catch {
    // /tmp miss — try MongoDB
    const { DocumentModel } = await import('@/lib/db/models/document');
    const doc = await DocumentModel.findById(documentId).select('+fileData').lean();
    if (doc?.fileData) {
      const buf = Buffer.isBuffer(doc.fileData)
        ? doc.fileData
        : Buffer.from(doc.fileData as ArrayBuffer);
      // Re-populate /tmp for subsequent reads
      await saveTempFile(storageKey, buf).catch(() => {});
      return buf;
    }
    throw new Error(`File not found in /tmp or MongoDB for document ${documentId}`);
  }
}

/**
 * Generate a storage key for a document.
 */
export function generateStorageKey(
  userId: string,
  projectId: string,
  filename: string
): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${projectId}/${timestamp}_${sanitized}`;
}
