/**
 * Local filesystem storage for development when Cloudflare R2 is not configured.
 * Files are stored in .uploads/ directory at project root.
 */

import { promises as fs } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), '.uploads');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function uploadFileLocal(
  key: string,
  body: Buffer,
  _contentType: string
): Promise<void> {
  const filePath = path.join(UPLOADS_DIR, key);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, body);
}

export async function downloadFileLocal(key: string): Promise<Buffer> {
  const filePath = path.join(UPLOADS_DIR, key);
  return fs.readFile(filePath);
}

export async function deleteFileLocal(key: string): Promise<void> {
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be deleted
  }
}

/**
 * Check if R2 is properly configured (not just placeholder values).
 */
export function isR2Configured(): boolean {
  const secretKey = process.env.CLOUDFLARE_R2_SECRET_KEY;
  const accessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY;
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;

  if (!secretKey || !accessKey || !accountId) return false;

  // Detect placeholder values
  if (secretKey.includes('LIPSESTE') || secretKey.includes('MISSING') || secretKey.includes('PLACEHOLDER')) {
    return false;
  }

  return true;
}
