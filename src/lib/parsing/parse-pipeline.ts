/**
 * Intelligent document parsing pipeline — main orchestrator.
 *
 * Routes documents to the optimal parsing engine based on file type:
 *
 * | Format        | Engine                               |
 * |---------------|--------------------------------------|
 * | PDF (native)  | pdf-parse → text + table extraction  |
 * | PDF (scanned) | Sharp preprocessing → Tesseract OCR  |
 * | DOCX          | mammoth → text + HTML → tables       |
 * | XLSX/XLS      | SheetJS → structured tables          |
 * | Image         | Sharp preprocessing → Tesseract OCR  |
 * | Text/CSV      | Direct read                          |
 *
 * Falls back to Python parsing service (PARSING_SERVICE_URL) if available.
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
 * Automatically detects document type and routes to the optimal engine.
 *
 * @param buffer     - Raw file content
 * @param filename   - Original filename (used for type detection and IDs)
 * @param mimeType   - MIME type of the file
 * @returns Parsed document data ready for storage in Extraction collection
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const category = detectDocumentCategory(mimeType, filename);

  console.log(`[ParsePipeline] Parsing ${filename} (${category}, ${mimeType}, ${formatSize(buffer.length)})`);

  // Try Python parsing service first if available
  const pythonResult = await tryPythonService(buffer, filename, mimeType);
  if (pythonResult) {
    console.log(`[ParsePipeline] Used Python service for ${filename} — ${pythonResult.rawText.length} chars`);
    return pythonResult;
  }

  // Route to Node.js native extractors
  switch (category) {
    case 'pdf': {
      const { extractFromPdf } = await import('./pdf-extractor');
      return extractFromPdf(buffer, filename);
    }

    case 'docx': {
      const { extractFromDocx } = await import('./docx-extractor');
      return extractFromDocx(buffer, filename);
    }

    case 'xlsx': {
      const { extractFromXlsx } = await import('./xlsx-extractor');
      return extractFromXlsx(buffer, filename);
    }

    case 'image': {
      return parseImage(buffer, filename);
    }

    case 'text': {
      return parseText(buffer, filename);
    }

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
 * Parse an image file: preprocess → OCR → extract tables.
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
      skipPreprocess: true, // Already preprocessed
    });

    // Add DPI warning to all blocks
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
    source: 'pdf-parse', // Closest match in type system
    confidence: 98,
    page: 1,
    position: { x: 0, y: 0, w: 0, h: 0 },
    warnings: [],
  }];

  // CSV: also extract as a table
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

  // Detect delimiter (comma, semicolon, tab)
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
 * Returns null if the service is not running.
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
    // Python service not available — fall through to Node.js extractors
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

    // Ensure Extraction record exists for this documentId
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
