/**
 * PDF text and table extraction — hybrid per-page strategy.
 *
 * For EACH page individually:
 * 1. Try pdf-parse (native text extraction)
 * 2. If < 50 chars → Sharp preprocessing → Tesseract OCR
 * 3. If OCR also < 50 chars → Vision API fallback on that single page
 * 4. Concatenate all page results in order
 *
 * Cost optimization: Vision API is used ONLY for pages where both
 * native text and OCR fail. A typical 17-page PDF with mixed
 * scanned/native content might use Vision on only 2 pages.
 */

import type { ExtractionBlock, TableData, ParseResponse } from './types';

/** Minimum text per page to consider extraction successful */
const MIN_TEXT_THRESHOLD = 50;

export type PageMethod = 'native_text' | 'ocr' | 'vision_fallback' | 'failed';

export interface PageResult {
  page: number;
  method: PageMethod;
  chars: number;
  text: string;
  blocks: ExtractionBlock[];
  tables: TableData[];
  confidence: number;
}

export interface PdfExtractionOptions {
  /** Force OCR even for native-text pages */
  forceOcr?: boolean;
  /** Skip Vision fallback (for cost control) */
  skipVision?: boolean;
}

/**
 * Extract text and tables from a PDF buffer using hybrid per-page strategy.
 */
export async function extractFromPdf(
  buffer: Buffer,
  filename: string,
  options?: PdfExtractionOptions
): Promise<ParseResponse> {
  const startTime = Date.now();

  // Step 1: Get page count and try native text extraction
  let pageCount = 1;
  let nativeTextPerPage: string[] = [];

  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    const fullText = textResult.text ?? '';

    try {
      const info = await parser.getInfo();
      pageCount = (info as { total?: number }).total ?? Math.max(1, Math.ceil(fullText.length / 3000));
    } catch {
      pageCount = Math.max(1, Math.ceil(fullText.length / 3000));
    }

    await parser.destroy();

    nativeTextPerPage = splitTextIntoPages(fullText, pageCount);
  } catch (error) {
    console.warn(`[PdfExtractor] pdf-parse failed for ${filename}:`, error);
    try {
      const { getPdfPageCount } = await import('./preprocessor');
      pageCount = await getPdfPageCount(buffer);
    } catch {
      // Default to 1
    }
  }

  // Step 2: Process each page with the hybrid strategy
  const pageResults: PageResult[] = [];

  for (let page = 0; page < pageCount; page++) {
    const pageNum = page + 1;
    const nativeText = (nativeTextPerPage[page] ?? '').trim();

    // 2a. Try native text first
    if (nativeText.length >= MIN_TEXT_THRESHOLD && !options?.forceOcr) {
      console.log(`[Parser] Page ${pageNum}: native_text (pdf-parse, ${nativeText.length} chars)`);
      pageResults.push({
        page: pageNum,
        method: 'native_text',
        chars: nativeText.length,
        text: nativeText,
        blocks: [{
          id: `pdf_p${pageNum}_text`,
          type: 'text',
          content: nativeText,
          source: 'pdf-parse',
          confidence: 92,
          page: pageNum,
          position: { x: 0, y: 0, w: 0, h: 0 },
          warnings: [],
        }],
        tables: extractTablesFromText(nativeText),
        confidence: 92,
      });
      continue;
    }

    // 2b. Native text insufficient — try OCR
    let ocrText = '';
    let ocrBlocks: ExtractionBlock[] = [];
    let ocrTables: TableData[] = [];
    let ocrConfidence = 0;

    try {
      const { pdfPageToImage } = await import('./preprocessor');
      const { recognizeImage } = await import('./ocr');

      const pageImage = await pdfPageToImage(buffer, page);
      const ocrResult = await recognizeImage(pageImage, {
        page: pageNum,
        source: 'sharp-tesseract',
      });

      ocrText = ocrResult.rawText.trim();
      ocrBlocks = ocrResult.blocks;
      ocrTables = ocrResult.tables;
      ocrConfidence = ocrResult.confidence;
    } catch (ocrError) {
      console.warn(`[Parser] Page ${pageNum}: OCR failed:`, ocrError);
    }

    if (ocrText.length >= MIN_TEXT_THRESHOLD) {
      console.log(`[Parser] Page ${pageNum}: ocr (Tesseract, ${ocrText.length} chars)`);
      pageResults.push({
        page: pageNum,
        method: 'ocr',
        chars: ocrText.length,
        text: ocrText,
        blocks: ocrBlocks,
        tables: ocrTables,
        confidence: ocrConfidence,
      });
      continue;
    }

    // 2c. OCR also insufficient — Vision API fallback on this single page
    if (!options?.skipVision && process.env.ANTHROPIC_API_KEY) {
      try {
        const { pdfPageToImage } = await import('./preprocessor');
        const pageImage = await pdfPageToImage(buffer, page);

        console.log(
          `[Parser] Page ${pageNum}: vision_fallback (OCR returned ${ocrText.length} chars, sent to Vision)`
        );

        const { extractPageWithVision } = await import('./vision-fallback');
        const visionResult = await extractPageWithVision(pageImage, pageNum, filename);

        if (visionResult.text.length > 0) {
          pageResults.push({
            page: pageNum,
            method: 'vision_fallback',
            chars: visionResult.text.length,
            text: visionResult.text,
            blocks: visionResult.blocks,
            tables: visionResult.tables,
            confidence: visionResult.confidence,
          });
          continue;
        }
      } catch (visionError) {
        console.warn(`[Parser] Page ${pageNum}: Vision fallback failed:`, visionError);
      }
    }

    // 2d. All methods failed — use whatever we got
    const bestText = ocrText || nativeText;
    console.log(`[Parser] Page ${pageNum}: failed (best effort: ${bestText.length} chars)`);

    if (bestText.length > 0) {
      pageResults.push({
        page: pageNum,
        method: 'failed',
        chars: bestText.length,
        text: bestText,
        blocks: [{
          id: `pdf_p${pageNum}_partial`,
          type: 'text',
          content: bestText,
          source: 'pdf-parse',
          confidence: 30,
          page: pageNum,
          position: { x: 0, y: 0, w: 0, h: 0 },
          warnings: [`Low quality extraction for page ${pageNum}`],
        }],
        tables: [],
        confidence: 30,
      });
    }
  }

  // Step 3: Aggregate results
  const allBlocks: ExtractionBlock[] = [];
  const allTables: TableData[] = [];
  const allText: string[] = [];

  for (const pr of pageResults) {
    allBlocks.push(...pr.blocks);
    allTables.push(...pr.tables);
    if (pr.text) allText.push(pr.text);
  }

  const rawText = allText.join('\n\n');
  const avgConfidence = pageResults.length > 0
    ? pageResults.reduce((sum, p) => sum + p.confidence, 0) / pageResults.length
    : 0;

  // Log summary
  const methodCounts = { native_text: 0, ocr: 0, vision_fallback: 0, failed: 0 };
  for (const pr of pageResults) methodCounts[pr.method]++;
  console.log(
    `[Parser] ${filename}: ${pageCount} pages — ` +
    `${methodCounts.native_text} native, ${methodCounts.ocr} OCR, ` +
    `${methodCounts.vision_fallback} vision, ${methodCounts.failed} failed`
  );

  return {
    blocks: allBlocks,
    rawText,
    tables: allTables,
    overallConfidence: avgConfidence,
    language: detectLanguage(rawText),
    pageCount,
    processingTimeMs: Date.now() - startTime,
  };
}

function splitTextIntoPages(text: string, pageCount: number): string[] {
  if (pageCount <= 1) return [text];
  const ffSplit = text.split('\f');
  if (ffSplit.length >= pageCount) return ffSplit.slice(0, pageCount);
  const charsPerPage = Math.ceil(text.length / pageCount);
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(text.slice(i * charsPerPage, Math.min((i + 1) * charsPerPage, text.length)));
  }
  return pages;
}

function extractTablesFromText(text: string): TableData[] {
  const lines = text.split('\n');
  const tables: TableData[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSeparator = /^[-=+|]+$/.test(trimmed.replace(/\s/g, ''));
    const hasTabs = trimmed.includes('\t');
    const hasPipes = (trimmed.match(/\|/g) ?? []).length >= 2;
    const hasMultiSpace = /\s{4,}/.test(trimmed);
    const isTableRow = hasTabs || hasPipes || hasMultiSpace || isSeparator;

    if (isTableRow && trimmed.length > 0) {
      if (!inTable) inTable = true;
      if (!isSeparator) tableBuffer.push(trimmed);
    } else {
      if (inTable && tableBuffer.length >= 2) {
        const table = parseTextTable(tableBuffer);
        if (table) tables.push(table);
      }
      tableBuffer = [];
      inTable = false;
    }
  }
  if (inTable && tableBuffer.length >= 2) {
    const table = parseTextTable(tableBuffer);
    if (table) tables.push(table);
  }
  return tables;
}

function parseTextTable(lines: string[]): TableData | null {
  const splitRow = (line: string): string[] => {
    if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter(Boolean);
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim()).filter(Boolean);
    return line.split(/\s{4,}/).map((c) => c.trim()).filter(Boolean);
  };
  const rows = lines.map(splitRow).filter((r) => r.length >= 2);
  if (rows.length < 2) return null;
  const firstRow = rows[0];
  if (!firstRow) return null;
  return { headers: firstRow, rows: rows.slice(1), confidence: 78 };
}

function detectLanguage(text: string): string | null {
  if (!text) return null;
  const romanianChars = (text.match(/[șțăâîȘȚĂÂÎ]/g) ?? []).length;
  return romanianChars / Math.max(1, text.length) > 0.005 ? 'ro' : 'en';
}
