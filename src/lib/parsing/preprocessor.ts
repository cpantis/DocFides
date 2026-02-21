/**
 * Image preprocessing with Sharp for OCR optimization.
 *
 * Applied before Tesseract OCR to improve accuracy:
 * - Grayscale conversion
 * - Contrast enhancement (normalize)
 * - Binarization (threshold)
 * - Noise reduction (median filter)
 * - DPI detection and upscaling for low-res images
 */

import sharp from 'sharp';

export interface PreprocessResult {
  buffer: Buffer;
  width: number;
  height: number;
  dpi: number;
  warnings: string[];
}

const MIN_OCR_DPI = 150;
const TARGET_DPI = 300;

/**
 * Preprocess an image buffer for optimal OCR quality.
 */
export async function preprocessForOcr(
  imageBuffer: Buffer,
  options?: { skipUpscale?: boolean }
): Promise<PreprocessResult> {
  const warnings: string[] = [];

  const metadata = await sharp(imageBuffer).metadata();
  const inputWidth = metadata.width ?? 0;
  const inputHeight = metadata.height ?? 0;

  // Estimate DPI from metadata (default to 72 if not available)
  let dpi = metadata.density ?? 72;

  let pipeline = sharp(imageBuffer);

  // Upscale low-DPI images to TARGET_DPI
  if (dpi < MIN_OCR_DPI && !options?.skipUpscale) {
    const scale = TARGET_DPI / dpi;
    pipeline = pipeline.resize({
      width: Math.round(inputWidth * scale),
      height: Math.round(inputHeight * scale),
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
    warnings.push(
      `Low resolution detected (${dpi} DPI). Upscaled to ~${TARGET_DPI} DPI. Re-scanning at higher resolution recommended.`
    );
    dpi = TARGET_DPI;
  }

  // Convert to grayscale
  pipeline = pipeline.grayscale();

  // Normalize contrast (stretches the histogram)
  pipeline = pipeline.normalize();

  // Apply median filter for noise reduction (3x3)
  pipeline = pipeline.median(3);

  // Binarize with threshold (Otsu-like: 128 midpoint)
  pipeline = pipeline.threshold(128);

  // Output as PNG (lossless, good for OCR)
  pipeline = pipeline.png();

  const processedBuffer = await pipeline.toBuffer();
  const processedMeta = await sharp(processedBuffer).metadata();

  return {
    buffer: processedBuffer,
    width: processedMeta.width ?? inputWidth,
    height: processedMeta.height ?? inputHeight,
    dpi,
    warnings,
  };
}

/**
 * Extract individual pages from a PDF as images for OCR processing.
 * Uses Sharp to convert PDF pages to PNG images.
 */
export async function pdfPageToImage(
  pdfBuffer: Buffer,
  page: number
): Promise<Buffer> {
  // Sharp can read PDFs page by page
  return sharp(pdfBuffer, { page, density: TARGET_DPI })
    .png()
    .toBuffer();
}

/**
 * Get the number of pages in a PDF using Sharp metadata.
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const metadata = await sharp(pdfBuffer).metadata();
  return metadata.pages ?? 1;
}

/**
 * Check if an image is too low quality for reliable OCR.
 */
export function isLowQuality(dpi: number): boolean {
  return dpi < MIN_OCR_DPI;
}
