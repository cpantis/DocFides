/**
 * Intelligent document parsing pipeline — main orchestrator.
 *
 * Routing rules:
 * - PDF → hybrid per-page: native text → OCR → Vision fallback (per page)
 * - DOCX → mammoth → TEXT
 * - DOC → word-extractor → TEXT
 * - XLSX/XLS → SheetJS → JSON
 * - Image (PNG/JPG/TIFF) → Tesseract OCR → Vision fallback if OCR fails
 * - Text/CSV → direct read
 *
 * Claude API receives ONLY text and JSON, NEVER images.
 * The only exception: pages where OCR fails completely (< 50 chars).
 */

import path from 'path';
import type { ParseResponse, ExtractionBlock } from './types';
import type { MergedExtraction } from './merger';

export type DocumentCategory =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'xlsx'
  | 'image'
  | 'text'
  | 'unsupported';

/**
 * Detect document category from MIME type and filename.
 */
export function detectDocumentCategory(
  mimeType: string,
  filename: string
): DocumentCategory {
  const ext = path.extname(filename).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') return 'pdf';

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) return 'docx';

  if (mimeType === 'application/msword' || ext === '.doc') return 'doc';

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === '.xlsx' || ext === '.xls'
  ) return 'xlsx';

  if (
    mimeType.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp'].includes(ext)
  ) return 'image';

  if (mimeType.startsWith('text/') || ext === '.txt' || ext === '.csv') return 'text';

  return 'unsupported';
}

/**
 * Parse a document buffer through the intelligent pipeline.
 *
 * PDFs: hybrid per-page (native → OCR → Vision fallback)
 * Images: preprocessed OCR → Vision fallback
 * DOCX/XLSX: dedicated Node.js extractors
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const category = detectDocumentCategory(mimeType, filename);

  console.log(`[ParsePipeline] Parsing ${filename} (${category}, ${mimeType}, ${formatSize(buffer.length)})`);

  switch (category) {
    case 'pdf': {
      const { extractFromPdf } = await import('./pdf-extractor');
      return extractFromPdf(buffer, filename);
    }

    case 'image':
      return parseImage(buffer, filename, mimeType);

    case 'docx': {
      const { extractFromDocx } = await import('./docx-extractor');
      return extractFromDocx(buffer, filename);
    }

    case 'doc': {
      const { extractFromDoc } = await import('./doc-extractor');
      return extractFromDoc(buffer, filename);
    }

    case 'xlsx': {
      const { extractFromXlsx } = await import('./xlsx-extractor');
      return extractFromXlsx(buffer, filename);
    }

    case 'text':
      return parseText(buffer, filename);

    default:
      return {
        blocks: [],
        rawText: '',
        tables: [],
        overallConfidence: 0,
        language: null,
        pageCount: 0,
        processingTimeMs: 0,
      };
  }
}

/** Minimum text to consider extraction successful */
const MIN_TEXT_THRESHOLD = 50;

/**
 * Parse an image: TIFF conversion → preprocess → Tesseract OCR → Vision fallback.
 */
async function parseImage(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const startTime = Date.now();

  // Convert TIFF to PNG (Tesseract handles PNG better)
  let processedBuffer = buffer;
  if (mimeType === 'image/tiff' || /\.tiff?$/i.test(filename)) {
    try {
      const sharp = (await import('sharp')).default;
      processedBuffer = await sharp(buffer).png().toBuffer();
    } catch (error) {
      console.warn(`[ParsePipeline] TIFF conversion failed for ${filename}:`, error);
    }
  }

  try {
    const { preprocessForOcr, isLowQuality } = await import('./preprocessor');
    const { recognizeImage } = await import('./ocr');

    const preprocessed = await preprocessForOcr(processedBuffer);
    const warnings: string[] = [...preprocessed.warnings];

    if (isLowQuality(preprocessed.dpi)) {
      warnings.push(`Low resolution (${preprocessed.dpi} DPI). Re-scan at 300+ DPI recommended.`);
    }

    const result = await recognizeImage(preprocessed.buffer, {
      page: 1,
      source: 'sharp-tesseract',
      skipPreprocess: true,
    });

    const ocrText = result.rawText.trim();
    console.log(`[Parser] Image ${filename}: ocr (Tesseract, ${ocrText.length} chars)`);

    // If OCR returned enough text, use it
    if (ocrText.length >= MIN_TEXT_THRESHOLD) {
      for (const block of result.blocks) block.warnings.push(...warnings);
      return {
        blocks: result.blocks,
        rawText: result.rawText,
        tables: result.tables,
        overallConfidence: result.confidence,
        language: result.language,
        pageCount: 1,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // OCR insufficient — try Vision fallback
    if (process.env.ANTHROPIC_API_KEY) {
      console.log(
        `[Parser] Image ${filename}: vision_fallback (OCR returned ${ocrText.length} chars, sent to Vision)`
      );
      const { extractPageWithVision } = await import('./vision-fallback');
      const visionResult = await extractPageWithVision(processedBuffer, 1, filename);

      if (visionResult.text.length > 0) {
        return {
          blocks: visionResult.blocks,
          rawText: visionResult.text,
          tables: visionResult.tables,
          overallConfidence: visionResult.confidence,
          language: detectLanguage(visionResult.text),
          pageCount: 1,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Use whatever OCR gave us
    for (const block of result.blocks) block.warnings.push(...warnings);
    return {
      blocks: result.blocks,
      rawText: result.rawText,
      tables: result.tables,
      overallConfidence: result.confidence,
      language: result.language,
      pageCount: 1,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[ParsePipeline] Image parsing failed for ${filename}:`, error);
    return {
      blocks: [{
        id: `img_err_${sanitizeId(filename)}`,
        type: 'text',
        content: `[Image OCR failed for ${filename}]`,
        source: 'tesseract',
        confidence: 0,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      }],
      rawText: '',
      tables: [],
      overallConfidence: 0,
      language: null,
      pageCount: 1,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

function parseText(buffer: Buffer, filename: string): ParseResponse {
  const startTime = Date.now();
  const text = buffer.toString('utf-8');
  const ext = path.extname(filename).toLowerCase();

  const blocks: ExtractionBlock[] = [{
    id: `txt_${sanitizeId(filename)}`,
    type: 'text',
    content: text,
    source: 'pdf-parse',
    confidence: 98,
    page: 1,
    position: { x: 0, y: 0, w: 0, h: 0 },
    warnings: [],
  }];

  return {
    blocks,
    rawText: text,
    tables: ext === '.csv' ? parseCsv(text) : [],
    overallConfidence: 98,
    language: detectLanguage(text),
    pageCount: 1,
    processingTimeMs: Date.now() - startTime,
  };
}

function parseCsv(text: string): Array<{ headers: string[]; rows: string[][]; confidence: number }> {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const firstLine = lines[0] ?? '';
  let bestDelimiter = ',';
  let maxCols = 0;
  for (const d of [',', ';', '\t']) {
    const cols = firstLine.split(d).length;
    if (cols > maxCols) { maxCols = cols; bestDelimiter = d; }
  }
  if (maxCols < 2) return [];
  const rows = lines.map((line) =>
    line.split(bestDelimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );
  const headerRow = rows[0];
  if (!headerRow) return [];
  return [{ headers: headerRow, rows: rows.slice(1), confidence: 95 }];
}

/**
 * Full extraction pipeline: parse → merge → confidence → store.
 */
export async function parseAndStore(
  documentId: string,
  projectId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  sha256: string
): Promise<MergedExtraction> {
  const { connectToDatabase, Extraction } = await import('@/lib/db');
  const { findCachedExtraction, mergeExtractions } = await import('./merger');
  await connectToDatabase();

  const cached = await findCachedExtraction(sha256);
  if (cached) {
    console.log(`[ParsePipeline] Cache hit for ${filename} (SHA256: ${sha256.slice(0, 12)}...)`);
    const existing = await Extraction.findOne({ documentId });
    if (!existing) {
      await Extraction.create({
        documentId, sha256, projectId,
        blocks: cached.blocks, rawText: cached.rawText,
        tables: cached.tables, overallConfidence: cached.overallConfidence,
        language: cached.language, processingTimeMs: 0,
      });
    }
    return cached;
  }

  const result = await parseDocument(buffer, filename, mimeType);
  const merged = mergeExtractions([result]);

  await Extraction.create({
    documentId, sha256, projectId,
    blocks: merged.blocks, rawText: merged.rawText,
    tables: merged.tables, overallConfidence: merged.overallConfidence,
    language: merged.language, processingTimeMs: merged.processingTimeMs,
  });

  console.log(
    `[ParsePipeline] Stored extraction for ${filename}: ${merged.rawText.length} chars, ` +
    `${merged.tables.length} tables, confidence ${merged.overallConfidence}%`
  );

  return merged;
}

function sanitizeId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectLanguage(text: string): string | null {
  if (!text) return null;
  const romanianChars = (text.match(/[șțăâîȘȚĂÂÎ]/g) ?? []).length;
  return romanianChars / Math.max(1, text.length) > 0.005 ? 'ro' : 'en';
}
