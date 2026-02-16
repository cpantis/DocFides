/**
 * PDF text and table extraction.
 *
 * Implements intelligent routing:
 * 1. Try native text extraction with pdf-parse
 * 2. If text is sparse (scanned PDF), fallback to OCR via Sharp + Tesseract
 * 3. Detect and extract tables from text structure
 */

import type { ExtractionBlock, TableData, ParseResponse } from './types';

/** Minimum text-per-page ratio to consider PDF as "native text" */
const NATIVE_TEXT_THRESHOLD = 50; // chars per page

export interface PdfExtractionOptions {
  /** Force OCR even for native-text PDFs */
  forceOcr?: boolean;
  /** Skip OCR for scanned PDFs (fast mode) */
  skipOcr?: boolean;
}

/**
 * Extract text and tables from a PDF buffer.
 * Automatically detects native vs scanned PDFs.
 */
export async function extractFromPdf(
  buffer: Buffer,
  filename: string,
  options?: PdfExtractionOptions
): Promise<ParseResponse> {
  const startTime = Date.now();
  const blocks: ExtractionBlock[] = [];
  const tables: TableData[] = [];
  const allText: string[] = [];
  let pageCount = 1;

  // Step 1: Try native text extraction with pdf-parse
  let nativeText = '';
  let isNative = false;

  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    nativeText = textResult.text ?? '';

    // Get page count from info
    try {
      const info = await parser.getInfo();
      // numPages is available in the info object
      const infoObj = info as unknown as Record<string, unknown>;
      pageCount = (infoObj['numPages'] as number) ?? 1;
    } catch {
      // Fallback page count estimation
      pageCount = Math.max(1, Math.ceil(nativeText.length / 3000));
    }

    await parser.destroy();

    // Determine if the PDF has real text or is scanned
    const charsPerPage = nativeText.length / Math.max(1, pageCount);
    isNative = charsPerPage > NATIVE_TEXT_THRESHOLD && !options?.forceOcr;
  } catch (error) {
    console.warn(`[PdfExtractor] pdf-parse failed for ${filename}:`, error);
  }

  if (isNative && nativeText) {
    // Native PDF: use extracted text directly
    const pages = splitTextIntoPages(nativeText, pageCount);

    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i] ?? '';
      if (!pageText.trim()) continue;

      blocks.push({
        id: `pdf_p${i + 1}_text`,
        type: 'text',
        content: pageText,
        source: 'pdf-parse',
        confidence: 92,
        page: i + 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [],
      });

      allText.push(pageText);
    }

    // Extract tables from the native text
    const textTables = extractTablesFromText(nativeText);
    tables.push(...textTables);

  } else if (!options?.skipOcr) {
    // Scanned PDF: use Sharp + Tesseract OCR per page
    try {
      const { pdfPageToImage, getPdfPageCount } = await import('./preprocessor');
      const { recognizeImage } = await import('./ocr');

      try {
        pageCount = await getPdfPageCount(buffer);
      } catch {
        // Use previously detected count or default
      }

      for (let page = 0; page < pageCount; page++) {
        try {
          const pageImage = await pdfPageToImage(buffer, page);
          const ocrResult = await recognizeImage(pageImage, {
            page: page + 1,
            source: 'sharp-tesseract',
          });

          blocks.push(...ocrResult.blocks);
          tables.push(...ocrResult.tables);
          allText.push(ocrResult.rawText);
        } catch (pageError) {
          console.warn(`[PdfExtractor] OCR failed for page ${page + 1} of ${filename}:`, pageError);
          blocks.push({
            id: `pdf_p${page + 1}_err`,
            type: 'text',
            content: `[OCR failed for page ${page + 1}]`,
            source: 'tesseract',
            confidence: 0,
            page: page + 1,
            position: { x: 0, y: 0, w: 0, h: 0 },
            warnings: [`OCR processing failed for page ${page + 1}`],
          });
        }
      }
    } catch (ocrError) {
      console.warn(`[PdfExtractor] OCR pipeline unavailable for ${filename}:`, ocrError);
      // Fallback: use whatever native text we got
      if (nativeText) {
        blocks.push({
          id: 'pdf_fallback_text',
          type: 'text',
          content: nativeText,
          source: 'pdf-parse',
          confidence: 40, // Low confidence for scanned PDF without OCR
          page: 1,
          position: { x: 0, y: 0, w: 0, h: 0 },
          warnings: ['Scanned PDF detected but OCR unavailable — text may be incomplete'],
        });
        allText.push(nativeText);
      }
    }
  }

  const rawText = allText.join('\n\n');
  const avgConfidence =
    blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
      : 0;

  return {
    blocks,
    rawText,
    tables,
    overallConfidence: avgConfidence,
    language: detectLanguage(rawText),
    pageCount,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Split concatenated text into approximate page chunks.
 */
function splitTextIntoPages(text: string, pageCount: number): string[] {
  if (pageCount <= 1) return [text];

  // Try to split by form-feed characters (common in PDF text)
  const ffSplit = text.split('\f');
  if (ffSplit.length >= pageCount) {
    return ffSplit.slice(0, pageCount);
  }

  // Approximate split by even character distribution
  const charsPerPage = Math.ceil(text.length / pageCount);
  const pages: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const start = i * charsPerPage;
    const end = Math.min(start + charsPerPage, text.length);
    pages.push(text.slice(start, end));
  }

  return pages;
}

/**
 * Detect tables from structured text patterns.
 * Looks for rows with consistent separators (tabs, pipes, repeated dashes).
 */
function extractTablesFromText(text: string): TableData[] {
  const lines = text.split('\n');
  const tables: TableData[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect separator lines (----, ====, +---+)
    const isSeparator = /^[-=+|]+$/.test(trimmed.replace(/\s/g, ''));

    // Detect data rows with consistent columns
    const hasTabs = trimmed.includes('\t');
    const hasPipes = (trimmed.match(/\|/g) ?? []).length >= 2;
    const hasMultiSpace = /\s{4,}/.test(trimmed);

    const isTableRow = hasTabs || hasPipes || hasMultiSpace || isSeparator;

    if (isTableRow && trimmed.length > 0) {
      if (!inTable) inTable = true;
      if (!isSeparator) {
        tableBuffer.push(trimmed);
      }
    } else {
      if (inTable && tableBuffer.length >= 2) {
        const table = parseTextTable(tableBuffer);
        if (table) tables.push(table);
      }
      tableBuffer = [];
      inTable = false;
    }
  }

  // Handle trailing table
  if (inTable && tableBuffer.length >= 2) {
    const table = parseTextTable(tableBuffer);
    if (table) tables.push(table);
  }

  return tables;
}

function parseTextTable(lines: string[]): TableData | null {
  const splitRow = (line: string): string[] => {
    if (line.includes('|')) {
      return line.split('|').map((c) => c.trim()).filter(Boolean);
    }
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.trim()).filter(Boolean);
    }
    return line.split(/\s{4,}/).map((c) => c.trim()).filter(Boolean);
  };

  const rows = lines.map(splitRow).filter((r) => r.length >= 2);
  if (rows.length < 2) return null;

  const firstRow = rows[0];
  if (!firstRow) return null;

  return {
    headers: firstRow,
    rows: rows.slice(1),
    confidence: 78,
  };
}

/**
 * Simple language detection based on Romanian diacritics.
 */
function detectLanguage(text: string): string | null {
  if (!text) return null;
  const romanianChars = (text.match(/[șțăâîȘȚĂÂÎ]/g) ?? []).length;
  const ratio = romanianChars / Math.max(1, text.length);
  return ratio > 0.005 ? 'ro' : 'en';
}
