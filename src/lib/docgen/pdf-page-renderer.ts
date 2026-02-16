/**
 * Render PDF pages as PNG images for Claude Vision analysis.
 * Used for flat PDF templates where AI needs to visually identify field positions.
 *
 * Uses pdftoppm (poppler-utils) for rendering + Sharp for resizing.
 */

import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp, rmdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export interface PdfPageImage {
  page: number;
  base64: string;
  mimeType: string;
}

/**
 * Render PDF pages as PNG images (base64) for Claude Vision.
 * Caps at 20 pages. Each image resized to fit within 1568px (Vision API optimal).
 */
export async function renderPdfPagesAsImages(
  pdfBuffer: Buffer,
  pageCount: number
): Promise<PdfPageImage[]> {
  const images: PdfPageImage[] = [];

  // Use pdftoppm (from poppler-utils) to render PDF pages as PNG
  const tempDir = await mkdtemp(join(tmpdir(), 'docfides-pdf-'));
  const pdfPath = join(tempDir, 'template.pdf');
  await writeFile(pdfPath, pdfBuffer);

  const maxPages = Math.min(pageCount, 20); // Cap at 20 pages for Vision API limits

  try {
    // Render all pages at 150 DPI (good balance of quality vs size)
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', '150',
      '-l', String(maxPages),
      pdfPath,
      join(tempDir, 'page'),
    ]);

    for (let i = 0; i < maxPages; i++) {
      // pdftoppm names files as page-01.png, page-02.png, etc.
      const pageNum = String(i + 1).padStart(String(maxPages).length, '0');
      const imagePath = join(tempDir, `page-${pageNum}.png`);

      try {
        const rawBuffer = await readFile(imagePath);
        let imageBuffer: Buffer = Buffer.from(rawBuffer);

        // Resize if too large (Claude Vision works best with <1568px on longest side)
        const metadata = await sharp(imageBuffer).metadata();
        const maxDimension = Math.max(metadata.width ?? 0, metadata.height ?? 0);
        if (maxDimension > 1568) {
          imageBuffer = Buffer.from(
            await sharp(imageBuffer)
              .resize({ width: 1568, height: 1568, fit: 'inside' })
              .png()
              .toBuffer()
          );
        }

        images.push({
          page: i,
          base64: imageBuffer.toString('base64'),
          mimeType: 'image/png',
        });

        await unlink(imagePath).catch(() => {});
      } catch {
        console.warn(`[PdfRenderer] Could not read rendered page ${i + 1}`);
      }
    }
  } finally {
    // Cleanup temp files
    await unlink(pdfPath).catch(() => {});
    await rmdir(tempDir).catch(() => {});
  }

  console.log(`[PdfRenderer] Rendered ${images.length}/${pageCount} PDF pages as images for Vision`);
  return images;
}
