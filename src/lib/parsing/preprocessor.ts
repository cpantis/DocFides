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

  // Upscale low-DPI images to TARGET_DPI (with memory guard)
  const MAX_UPSCALE_PIXELS = 100_000_000; // ~400MB RGBA — safe for most containers
  if (dpi < MIN_OCR_DPI && !options?.skipUpscale) {
    const scale = TARGET_DPI / dpi;
    const outWidth = Math.round(inputWidth * scale);
    const outHeight = Math.round(inputHeight * scale);
    const estimatedPixels = outWidth * outHeight;

    if (estimatedPixels > MAX_UPSCALE_PIXELS) {
      warnings.push(
        `Low resolution (${dpi} DPI) but image too large to upscale safely ` +
        `(${inputWidth}x${inputHeight} → ${outWidth}x${outHeight}). Skipping upscale.`
      );
    } else {
      pipeline = pipeline.resize({
        width: outWidth,
        height: outHeight,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      });
      warnings.push(
        `Low resolution detected (${dpi} DPI). Upscaled to ~${TARGET_DPI} DPI. Re-scanning at higher resolution recommended.`
      );
      dpi = TARGET_DPI;
    }
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

  // Calculate output dimensions from the upscale factor instead of re-reading metadata
  const scale = (dpi > (metadata.density ?? 72) && !options?.skipUpscale) ? TARGET_DPI / (metadata.density ?? 72) : 1;
  return {
    buffer: processedBuffer,
    width: Math.round(inputWidth * scale),
    height: Math.round(inputHeight * scale),
    dpi,
    warnings,
  };
}

// ---- PDF rendering via pdfjs-dist + @napi-rs/canvas ----
// Sharp's libvips lacks poppler, so we use pdfjs-dist for PDF→image rendering.

let pdfjsInitialized = false;

async function ensurePdfjs() {
  if (pdfjsInitialized) return;

  const { DOMMatrix: CanvasDOMMatrix } = await import('@napi-rs/canvas');
  if (typeof globalThis.DOMMatrix === 'undefined') {
    (globalThis as Record<string, unknown>).DOMMatrix = CanvasDOMMatrix;
  }

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const path = await import('path');

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
  }

  pdfjsInitialized = true;
}

async function loadPdfDocument(pdfBuffer: Buffer) {
  await ensurePdfjs();
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return loadingTask.promise;
}

/**
 * Extract a single page from a PDF as a PNG image for OCR processing.
 * Uses pdfjs-dist for rendering + @napi-rs/canvas for image output.
 * @param page 0-based page index
 */
export async function pdfPageToImage(
  pdfBuffer: Buffer,
  page: number
): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas');

  const doc = await loadPdfDocument(pdfBuffer);
  try {
    const pdfPage = await doc.getPage(page + 1); // pdfjs uses 1-based
    const scale = TARGET_DPI / 72;
    const viewport = pdfPage.getViewport({ scale });

    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );
    const ctx = canvas.getContext('2d');

    // @napi-rs/canvas context is compatible at runtime but types don't match
    const renderParams = { canvasContext: ctx, viewport } as unknown;
    await (pdfPage.render(renderParams as Parameters<typeof pdfPage.render>[0])).promise;

    return canvas.toBuffer('image/png');
  } finally {
    doc.destroy();
  }
}

/**
 * Get the number of pages in a PDF using pdfjs-dist.
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await loadPdfDocument(pdfBuffer);
  const count = doc.numPages;
  doc.destroy();
  return count;
}

/**
 * Extract text content from a specific PDF page using pdfjs-dist.
 * More accurate than splitting the full-text dump by character count.
 * @param page 0-based page index
 */
export async function getPdfPageText(
  pdfBuffer: Buffer,
  page: number
): Promise<string> {
  const doc = await loadPdfDocument(pdfBuffer);
  try {
    const pdfPage = await doc.getPage(page + 1);
    const textContent = await pdfPage.getTextContent();

    let lastY: number | null = null;
    const parts: string[] = [];

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const textItem = item as { str: string; transform: number[] };
      const y = textItem.transform[5];

      if (lastY !== null && Math.abs((y ?? 0) - lastY) > 5) {
        parts.push('\n');
      } else if (parts.length > 0) {
        parts.push(' ');
      }

      parts.push(textItem.str);
      lastY = y ?? null;
    }

    return parts.join('').trim();
  } finally {
    doc.destroy();
  }
}

/**
 * Check if an image is too low quality for reliable OCR.
 */
export function isLowQuality(dpi: number): boolean {
  return dpi < MIN_OCR_DPI;
}
