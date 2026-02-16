/**
 * PDF conversion using LibreOffice headless.
 *
 * Handles:
 * - LibreOffice availability check before conversion
 * - Per-conversion user profile to avoid single-instance lock
 * - Retry with exponential backoff (3 attempts)
 * - Temp file cleanup (including profile directory)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;
const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * Convert a DOCX buffer to PDF using LibreOffice headless.
 *
 * Each conversion uses an isolated user profile directory so multiple
 * conversions can run concurrently without LibreOffice's single-instance lock.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  await assertLibreOfficeAvailable();

  const tempId = randomUUID();
  const tempDir = join(tmpdir(), `docfides-pdf-${tempId}`);
  const profileDir = join(tempDir, 'profile');
  const docxPath = join(tempDir, `${tempId}.docx`);
  const pdfPath = join(tempDir, `${tempId}.pdf`);

  try {
    // Create isolated temp + profile directories
    await mkdir(profileDir, { recursive: true });
    await writeFile(docxPath, docxBuffer);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await execFileAsync('libreoffice', [
          '--headless',
          '--norestore',
          '--nolockcheck',
          `-env:UserInstallation=file://${profileDir}`,
          '--convert-to', 'pdf',
          '--outdir', tempDir,
          docxPath,
        ], { timeout: CONVERSION_TIMEOUT_MS });

        const pdfBuffer = await readFile(pdfPath);

        if (pdfBuffer.length === 0) {
          throw new Error('LibreOffice produced an empty PDF file');
        }

        console.log(
          `[PDF] Conversion successful (attempt ${attempt}, ${pdfBuffer.length} bytes)`
        );
        return pdfBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `[PDF] Conversion attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
        );

        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          await sleep(backoff);
        }
      }
    }

    throw new Error(
      `PDF conversion failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message ?? 'unknown'}`
    );
  } finally {
    // Cleanup: remove entire temp directory (docx, pdf, profile)
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Verify LibreOffice is installed and accessible.
 * Throws a descriptive error if not found.
 */
async function assertLibreOfficeAvailable(): Promise<void> {
  try {
    await execFileAsync('libreoffice', ['--version'], { timeout: 10_000 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      throw new Error(
        'LibreOffice is not installed or not in PATH. ' +
        'Install with: apt-get install -y libreoffice-writer-nogui. ' +
        'PDF export requires LibreOffice for DOCX→PDF conversion.'
      );
    }
    // LibreOffice exists but --version failed for other reasons — acceptable
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
