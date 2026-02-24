/**
 * Intelligent document parsing pipeline — main orchestrator.
 *
 * Uses Google Gemini for native document understanding:
 * - PDF (native & scanned) → Gemini processes directly, no OCR needed
 * - DOCX → Gemini processes directly
 * - XLSX/XLS → SheetJS for structured table data (more reliable than AI)
 * - Images (PNG/JPG/TIFF) → Gemini Vision processes directly
 * - Text/CSV → direct read (no AI needed)
 *
 * Gemini handles OCR, table detection, and text extraction in a single API call.
 * This eliminates Tesseract, Sharp preprocessing, pdfjs-dist page rendering,
 * and all associated memory/timeout issues.
 */

import path from 'path';
import type { ParseResponse, ExtractionBlock, TableData } from './types';
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

/** MIME types that Gemini can process natively */
const GEMINI_SUPPORTED_MIME: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword': 'application/msword',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/tiff': 'image/tiff',
  'image/webp': 'image/webp',
  'image/bmp': 'image/bmp',
};

const GEMINI_EXTRACTION_PROMPT = `You are a document parsing engine. Extract ALL content from this document with perfect accuracy.

OUTPUT FORMAT — Return a JSON object with exactly these fields:

1. "text": The COMPLETE text content of the document, preserving:
   - All headings (prefixed with # for H1, ## for H2, etc.)
   - All paragraphs in order
   - All list items
   - All text from tables (as described below)
   - Romanian diacritics exactly as they appear (ș, ț, ă, â, î)

2. "tables": An array of tables found in the document. Each table:
   {
     "headers": ["col1", "col2", ...],
     "rows": [["val1", "val2", ...], ...],
     "confidence": 90
   }
   - Include ALL tables, even small ones
   - Preserve merged cell content (repeat in spanned cells)
   - For financial tables: keep exact number formatting (1.250.000,50)

3. "pages": Total number of pages (1 for images)

4. "language": Detected language code ("ro" for Romanian, "en" for English, etc.)

5. "headings": Array of heading strings found in the document

CRITICAL RULES:
- Extract EVERY piece of text. Do not summarize or skip anything.
- Preserve exact formatting of numbers, dates, codes (CUI, IBAN, CAEN)
- Preserve Romanian diacritics exactly: ș ț ă â î Ș Ț Ă Â Î
- For scanned/OCR documents: extract text as accurately as possible
- For tables in images: detect rows and columns precisely
- If text is unclear, extract your best reading and note uncertainty`;

/**
 * Parse a document buffer through the intelligent pipeline.
 *
 * PDF/DOCX/DOC/Images → Gemini native processing (one API call)
 * XLSX/XLS → SheetJS (structured data, no AI needed)
 * Text/CSV → direct read
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
    case 'docx':
    case 'doc':
    case 'image':
      return parseWithGemini(buffer, filename, mimeType, category);

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
 * Parse a document using Google Gemini's native document understanding.
 * Handles PDF (native & scanned), DOCX, DOC, and images in a single API call.
 */
async function parseWithGemini(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  category: DocumentCategory
): Promise<ParseResponse> {
  const startTime = Date.now();

  // Resolve MIME type for Gemini
  let geminiMime = GEMINI_SUPPORTED_MIME[mimeType];
  if (!geminiMime) {
    // Map by extension
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
    };
    geminiMime = mimeMap[ext] ?? mimeType;
  }

  const base64Data = buffer.toString('base64');

  console.log(`[ParsePipeline] Sending ${filename} to Gemini (${formatSize(buffer.length)}, ${geminiMime})`);

  try {
    const { getGeminiClient } = await import('@/lib/ai/gemini-client');
    const client = getGeminiClient();

    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: geminiMime,
          data: base64Data,
        },
      },
      { text: GEMINI_EXTRACTION_PROMPT },
    ]);

    const response = result.response;
    const usage = response.usageMetadata;
    const responseText = response.text();

    console.log(
      `[ParsePipeline] Gemini response for ${filename}: ` +
      `${usage?.promptTokenCount ?? 0} input tokens, ` +
      `${usage?.candidatesTokenCount ?? 0} output tokens`
    );

    // Parse the JSON response
    const parsed = parseGeminiResponse(responseText, filename);
    const processingTimeMs = Date.now() - startTime;

    // Build ExtractionBlocks from the parsed data
    const blocks: ExtractionBlock[] = [];
    let blockIndex = 0;

    // Main text block
    if (parsed.text) {
      blocks.push({
        id: `gemini_text_${sanitizeId(filename)}_${blockIndex++}`,
        type: 'text',
        content: parsed.text,
        source: 'gemini' as ExtractionBlock['source'],
        confidence: 95,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [],
      });
    }

    // Heading blocks
    if (parsed.headings && Array.isArray(parsed.headings)) {
      for (const heading of parsed.headings) {
        if (typeof heading === 'string' && heading.trim()) {
          blocks.push({
            id: `gemini_heading_${sanitizeId(filename)}_${blockIndex++}`,
            type: 'heading',
            content: heading,
            source: 'gemini' as ExtractionBlock['source'],
            confidence: 95,
            page: 1,
            position: { x: 0, y: 0, w: 0, h: 0 },
            warnings: [],
          });
        }
      }
    }

    // Table blocks
    const tables: TableData[] = [];
    if (parsed.tables && Array.isArray(parsed.tables)) {
      for (const rawTable of parsed.tables) {
        const table = rawTable as { headers?: unknown[]; rows?: unknown[][]; confidence?: number };
        const headers = Array.isArray(table.headers) ? table.headers.map(String) : [];
        const rows = Array.isArray(table.rows)
          ? table.rows.map((row) => Array.isArray(row) ? row.map(String) : [])
          : [];
        const confidence = typeof table.confidence === 'number' ? table.confidence : 90;

        if (headers.length > 0 || rows.length > 0) {
          tables.push({ headers, rows, confidence });

          blocks.push({
            id: `gemini_table_${sanitizeId(filename)}_${blockIndex++}`,
            type: 'table',
            content: { headers, rows },
            source: 'gemini' as ExtractionBlock['source'],
            confidence,
            page: 1,
            position: { x: 0, y: 0, w: 0, h: 0 },
            warnings: [],
          });
        }
      }
    }

    const rawText = parsed.text || '';
    const pageCount = typeof parsed.pages === 'number' ? parsed.pages : 1;
    const language = typeof parsed.language === 'string' ? parsed.language : detectLanguage(rawText);

    console.log(
      `[ParsePipeline] Extracted from ${filename}: ${rawText.length} chars, ` +
      `${tables.length} tables, ${pageCount} pages, lang=${language ?? 'unknown'}, ` +
      `${processingTimeMs}ms`
    );

    return {
      blocks,
      rawText,
      tables,
      overallConfidence: rawText.length > 50 ? 95 : rawText.length > 0 ? 70 : 0,
      language,
      pageCount,
      processingTimeMs,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ParsePipeline] Gemini parsing failed for ${filename}:`, errMsg);

    // Fallback: try local extractors for DOCX
    if (category === 'docx') {
      console.log(`[ParsePipeline] Falling back to local DOCX extractor for ${filename}`);
      try {
        const { extractFromDocx } = await import('./docx-extractor');
        return extractFromDocx(buffer, filename);
      } catch (fallbackError) {
        console.error(`[ParsePipeline] Local DOCX fallback also failed:`, fallbackError);
      }
    }

    return {
      blocks: [{
        id: `gemini_err_${sanitizeId(filename)}`,
        type: 'text',
        content: `[Extraction failed for ${filename}: ${errMsg}]`,
        source: 'gemini' as ExtractionBlock['source'],
        confidence: 0,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [`Gemini extraction failed: ${errMsg}`],
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
 * Parse Gemini's JSON response, handling potential formatting issues.
 */
function parseGeminiResponse(
  responseText: string,
  filename: string
): { text: string; tables: unknown[]; pages: number; language: string; headings: string[] } {
  const defaults = { text: '', tables: [], pages: 1, language: 'ro', headings: [] };

  if (!responseText || responseText.trim().length === 0) {
    console.warn(`[ParsePipeline] Empty Gemini response for ${filename}`);
    return defaults;
  }

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(responseText);
    return { ...defaults, ...parsed };
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return { ...defaults, ...parsed };
      } catch {
        // Fall through
      }
    }

    // Last resort: use the raw text as the extracted content
    console.warn(`[ParsePipeline] Could not parse Gemini JSON for ${filename}, using raw text`);
    return {
      ...defaults,
      text: responseText,
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
