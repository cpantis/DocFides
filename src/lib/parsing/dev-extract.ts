/**
 * Lightweight text extraction for dev mode (no Tika/Tesseract/OCR).
 * Uses pdf-parse for PDFs and mammoth for DOCX.
 * Creates Extraction records in MongoDB so the real AI pipeline can find document texts.
 */

import { promises as fs } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), '.uploads');

/**
 * Extract text from a file stored in local uploads and create an Extraction record.
 * Returns the raw text extracted (empty string if format is unsupported).
 */
export async function extractAndStoreText(
  documentId: string,
  projectId: string,
  r2Key: string,
  originalFilename: string,
  mimeType: string,
  sha256: string
): Promise<string> {
  const { connectToDatabase, Extraction } = await import('@/lib/db');
  await connectToDatabase();

  // Check if extraction already exists
  const existing = await Extraction.findOne({ documentId });
  if (existing) {
    return existing.rawText ?? '';
  }

  const startTime = Date.now();
  const filePath = path.join(UPLOADS_DIR, r2Key);
  let rawText = '';
  let tables: Record<string, unknown>[] = [];
  let confidence = 0;

  try {
    const buffer = await fs.readFile(filePath);
    const result = await extractText(buffer, mimeType, originalFilename);
    rawText = result.text;
    tables = result.tables;
    confidence = result.confidence;
  } catch (error) {
    console.warn(`[DevExtract] Failed to extract text from ${originalFilename}:`, error);
    rawText = `[Unable to extract text from ${originalFilename}]`;
    confidence = 0;
  }

  const processingTimeMs = Date.now() - startTime;

  await Extraction.create({
    documentId,
    sha256,
    projectId,
    blocks: rawText
      ? [{ type: 'text', text: rawText, confidence, page: 1 }]
      : [],
    rawText,
    tables,
    overallConfidence: confidence,
    language: 'ro',
    processingTimeMs,
  });

  console.log(
    `[DevExtract] Extracted ${rawText.length} chars from ${originalFilename} in ${processingTimeMs}ms`
  );

  return rawText;
}

interface ExtractResult {
  text: string;
  tables: Record<string, unknown>[];
  confidence: number;
}

async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractResult> {
  const ext = path.extname(filename).toLowerCase();

  // PDF extraction
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return extractFromPdf(buffer);
  }

  // DOCX extraction
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return extractFromDocx(buffer);
  }

  // Plain text / CSV
  if (mimeType.startsWith('text/') || ext === '.txt' || ext === '.csv') {
    return {
      text: buffer.toString('utf-8'),
      tables: [],
      confidence: 95,
    };
  }

  // Images — no text extraction without OCR
  if (mimeType.startsWith('image/')) {
    return {
      text: `[Image file: ${filename} — OCR not available in dev mode]`,
      tables: [],
      confidence: 0,
    };
  }

  // XLSX / XLS — basic fallback
  if (ext === '.xlsx' || ext === '.xls') {
    return {
      text: `[Spreadsheet file: ${filename} — install xlsx package for full parsing]`,
      tables: [],
      confidence: 0,
    };
  }

  return {
    text: `[Unsupported format: ${filename}]`,
    tables: [],
    confidence: 0,
  };
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractResult> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = result.text || '';
    await parser.destroy();

    return {
      text,
      tables: [],
      confidence: text ? 85 : 0,
    };
  } catch (error) {
    console.warn('[DevExtract] pdf-parse failed:', error);
    return { text: '', tables: [], confidence: 0 };
  }
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractResult> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value || '',
      tables: [],
      confidence: result.value ? 90 : 0,
    };
  } catch (error) {
    console.warn('[DevExtract] mammoth failed:', error);
    return { text: '', tables: [], confidence: 0 };
  }
}
