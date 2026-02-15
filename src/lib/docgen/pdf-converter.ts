/**
 * PDF conversion using LibreOffice headless.
 * Command: libreoffice --headless --convert-to pdf document.docx
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tempId = randomUUID();
  const tempDir = tmpdir();
  const docxPath = join(tempDir, `${tempId}.docx`);
  const pdfPath = join(tempDir, `${tempId}.pdf`);

  try {
    await writeFile(docxPath, docxBuffer);

    await execFileAsync('libreoffice', [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', tempDir,
      docxPath,
    ], { timeout: 30000 });

    const pdfBuffer = await readFile(pdfPath);
    return pdfBuffer;
  } finally {
    // Cleanup temp files
    await unlink(docxPath).catch(() => {});
    await unlink(pdfPath).catch(() => {});
  }
}
