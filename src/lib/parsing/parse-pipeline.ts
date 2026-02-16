/**
 * Intelligent document parsing pipeline — main orchestrator.
 *
 * Extraction priority:
 * 1. Claude AI Vision (primary) — for PDFs and images
 * 2. Node.js native extractors (fallback) — pdf-parse, mammoth, xlsx, tesseract.js
 * 3. Python parsing service (legacy) — if PARSING_SERVICE_URL is set
 *
 * DOCX and XLSX are always handled by Node.js extractors (mammoth, xlsx)
 * since they are structured formats that don't need vision capabilities.
 */

import path from 'path';
import type { ParseResponse, ExtractionBlock } from './types';
import type { MergedExtraction } from './merger';

export type DocumentCategory =
  | 'pdf'
  | 'docx'
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

  // PDF
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return 'pdf';
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return 'docx';
  }

  // XLSX / XLS
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === '.xlsx' ||
    ext === '.xls'
  ) {
    return 'xlsx';
  }

  // Images
  if (
    mimeType.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp'].includes(ext)
  ) {
    return 'image';
  }

  // Plain text / CSV
  if (mimeType.startsWith('text/') || ext === '.txt' || ext === '.csv') {
    return 'text';
  }

  return 'unsupported';
}

/**
 * Parse a document buffer through the intelligent pipeline.
 *
 * For PDFs and images: tries Claude AI Vision first, then Node.js fallback.
 * For DOCX/XLSX: uses dedicated Node.js extractors directly.
 * For text/CSV: reads directly.
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const category = detectDocumentCategory(mimeType, filename);

  console.log(`[ParsePipeline] Parsing ${filename} (${category}, ${mimeType}, ${formatSize(buffer.length)})`);

  switch (category) {
    case 'pdf':
    case 'image':
      return parseWithAiPrimary(buffer, filename, mimeType, category);

    case 'docx': {
      const { extractFromDocx } = await import('./docx-extractor');
      return extractFromDocx(buffer, filename);
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

/**
 * Parse PDFs and images with Claude AI Vision as primary, Node.js as fallback.
 *
 * Chain: AI Vision → Python service → Node.js native
 */
async function parseWithAiPrimary(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  category: 'pdf' | 'image'
): Promise<ParseResponse> {
  // For TIFF images: convert to PNG first (Claude doesn't support TIFF directly)
  let processedBuffer = buffer;
  let processedMimeType = mimeType;
  if (mimeType === 'image/tiff' || filename.toLowerCase().endsWith('.tiff') || filename.toLowerCase().endsWith('.tif')) {
    try {
      const sharp = (await import('sharp')).default;
      processedBuffer = await sharp(buffer).png().toBuffer();
      processedMimeType = 'image/png';
    } catch (error) {
      console.warn(`[ParsePipeline] TIFF conversion failed for ${filename}:`, error);
      // Fall through to other methods
    }
  }

  // 1. Try Claude AI Vision (primary method)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { extractWithAI, isAiExtractable } = await import('@/lib/ai/ocr-agent');

      if (isAiExtractable(processedMimeType, filename)) {
        console.log(`[ParsePipeline] Using Claude AI Vision for ${filename}...`);
        const result = await extractWithAI(processedBuffer, filename, processedMimeType);

        if (result.rawText.trim().length > 0) {
          console.log(`[ParsePipeline] AI Vision extracted ${result.rawText.length} chars from ${filename}`);
          return result;
        }

        console.warn(`[ParsePipeline] AI Vision returned empty text for ${filename} — trying fallback`);
      }
    } catch (error) {
      console.warn(`[ParsePipeline] AI Vision failed for ${filename}, falling back:`, error instanceof Error ? error.message : error);
    }
  }

  // 2. Try Python parsing service (if configured)
  const pythonResult = await tryPythonService(buffer, filename, mimeType);
  if (pythonResult) {
    console.log(`[ParsePipeline] Used Python service for ${filename} — ${pythonResult.rawText.length} chars`);
    return pythonResult;
  }

  // 3. Node.js native fallback
  console.log(`[ParsePipeline] Using Node.js native extractors for ${filename}...`);
  if (category === 'pdf') {
    const { extractFromPdf } = await import('./pdf-extractor');
    return extractFromPdf(buffer, filename);
  }

  return parseImage(buffer, filename);
}

/**
 * Parse an image file: preprocess → Tesseract.js OCR → extract tables.
 * Used as last-resort fallback when AI Vision is unavailable.
 */
async function parseImage(
  buffer: Buffer,
  filename: string
): Promise<ParseResponse> {
  const startTime = Date.now();

  try {
    const { preprocessForOcr, isLowQuality } = await import('./preprocessor');
    const { recognizeImage } = await import('./ocr');

    const preprocessed = await preprocessForOcr(buffer);
    const warnings: string[] = [...preprocessed.warnings];

    if (isLowQuality(preprocessed.dpi)) {
      warnings.push(
        `Low resolution detected (${preprocessed.dpi} DPI). Consider re-scanning at 300+ DPI for better accuracy.`
      );
    }

    const result = await recognizeImage(preprocessed.buffer, {
      page: 1,
      source: 'sharp-tesseract',
      skipPreprocess: true,
    });

    for (const block of result.blocks) {
      block.warnings.push(...warnings);
    }

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

/**
 * Parse plain text / CSV files.
 */
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

  const tables = ext === '.csv' ? parseCsv(text) : [];

  return {
    blocks,
    rawText: text,
    tables,
    overallConfidence: 98,
    language: detectLanguage(text),
    pageCount: 1,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Parse CSV text into a TableData structure.
 */
function parseCsv(text: string): Array<{ headers: string[]; rows: string[][]; confidence: number }> {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const firstLine = lines[0] ?? '';
  const delimiters = [',', ';', '\t'];
  let bestDelimiter = ',';
  let maxCols = 0;

  for (const d of delimiters) {
    const cols = firstLine.split(d).length;
    if (cols > maxCols) {
      maxCols = cols;
      bestDelimiter = d;
    }
  }

  if (maxCols < 2) return [];

  const rows = lines.map((line) =>
    line.split(bestDelimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );

  const headerRow = rows[0];
  if (!headerRow) return [];

  return [{
    headers: headerRow,
    rows: rows.slice(1),
    confidence: 95,
  }];
}

/**
 * Try the Python parsing service if available.
 * Returns null if the service is not running or not configured.
 */
async function tryPythonService(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse | null> {
  const serviceUrl = process.env.PARSING_SERVICE_URL;
  if (!serviceUrl) return null;

  try {
    const { checkParsingServiceHealth, parseDocument: pythonParse } = await import('./detector');
    const isHealthy = await checkParsingServiceHealth();
    if (!isHealthy) return null;

    return await pythonParse(buffer, filename, mimeType);
  } catch {
    return null;
  }
}

/**
 * Full extraction pipeline: parse → merge → confidence → store.
 * Creates Extraction record in MongoDB.
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

  // Check cache by SHA256
  const cached = await findCachedExtraction(sha256);
  if (cached) {
    console.log(`[ParsePipeline] Cache hit for ${filename} (SHA256: ${sha256.slice(0, 12)}...)`);

    const existing = await Extraction.findOne({ documentId });
    if (!existing) {
      await Extraction.create({
        documentId,
        sha256,
        projectId,
        blocks: cached.blocks,
        rawText: cached.rawText,
        tables: cached.tables,
        overallConfidence: cached.overallConfidence,
        language: cached.language,
        processingTimeMs: 0,
      });
    }

    return cached;
  }

  // Parse document
  const result = await parseDocument(buffer, filename, mimeType);

  // Merge into final structure
  const merged = mergeExtractions([result]);

  // Store in MongoDB
  await Extraction.create({
    documentId,
    sha256,
    projectId,
    blocks: merged.blocks,
    rawText: merged.rawText,
    tables: merged.tables,
    overallConfidence: merged.overallConfidence,
    language: merged.language,
    processingTimeMs: merged.processingTimeMs,
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
  const ratio = romanianChars / Math.max(1, text.length);
  return ratio > 0.005 ? 'ro' : 'en';
}
