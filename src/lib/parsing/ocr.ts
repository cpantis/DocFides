/**
 * Tesseract.js OCR engine wrapper.
 *
 * Supports Romanian (ron) and English (eng) with automatic language detection.
 * Uses Sharp preprocessing for optimal accuracy.
 */

import { createWorker, type Worker } from 'tesseract.js';
import type { ExtractionBlock, BlockSource, TableData } from './types';
import { preprocessForOcr } from './preprocessor';

let workerInstance: Worker | null = null;

/**
 * Get or create a reusable Tesseract worker.
 * Loads Romanian + English language data.
 */
async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;

  workerInstance = await createWorker('ron+eng', undefined, {
    // tesseract.js auto-downloads language data on first use
  });

  return workerInstance;
}

/**
 * Run OCR on an image buffer with preprocessing.
 * Returns extraction blocks with confidence scores.
 */
export async function recognizeImage(
  imageBuffer: Buffer,
  options?: {
    page?: number;
    source?: BlockSource;
    skipPreprocess?: boolean;
  }
): Promise<{
  blocks: ExtractionBlock[];
  rawText: string;
  tables: TableData[];
  confidence: number;
  language: string;
}> {
  const page = options?.page ?? 1;
  const source: BlockSource = options?.source ?? 'tesseract';

  // Preprocess unless explicitly skipped
  let processedBuffer = imageBuffer;
  const warnings: string[] = [];

  if (!options?.skipPreprocess) {
    const preprocessed = await preprocessForOcr(imageBuffer);
    processedBuffer = preprocessed.buffer;
    warnings.push(...preprocessed.warnings);
  }

  const worker = await getWorker();
  const result = await worker.recognize(processedBuffer);

  const blocks: ExtractionBlock[] = [];
  let blockIndex = 0;

  // Process blocks → paragraphs into extraction blocks
  const pageBlocks = result.data.blocks;
  if (pageBlocks) {
    for (const block of pageBlocks) {
      for (const paragraph of block.paragraphs) {
        const text = paragraph.text?.trim();
        if (!text) continue;

        const confidence = paragraph.confidence ?? 0;
        const bbox = paragraph.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };

        // Detect if this looks like a heading (short, high confidence)
        const isHeading = text.length < 100 && !text.includes('\n') && confidence > 80;

        blocks.push({
          id: `ocr_p${page}_b${blockIndex++}`,
          type: isHeading ? 'heading' : 'text',
          content: text,
          source,
          confidence,
          page,
          position: {
            x: bbox.x0,
            y: bbox.y0,
            w: bbox.x1 - bbox.x0,
            h: bbox.y1 - bbox.y0,
          },
          warnings: [...warnings],
        });
      }
    }
  }

  // If no blocks parsed, use the full text
  if (blocks.length === 0 && result.data.text?.trim()) {
    blocks.push({
      id: `ocr_p${page}_b0`,
      type: 'text',
      content: result.data.text.trim(),
      source,
      confidence: result.data.confidence ?? 0,
      page,
      position: { x: 0, y: 0, w: 0, h: 0 },
      warnings: [...warnings],
    });
  }

  // Try to detect tables from OCR output (grid-like text patterns)
  const tables = detectTablesFromOcrText(result.data.text ?? '');

  const avgConfidence =
    blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
      : 0;

  return {
    blocks,
    rawText: result.data.text ?? '',
    tables,
    confidence: avgConfidence,
    language: 'ro',
  };
}

/**
 * Simple table detection from OCR text.
 * Looks for rows with consistent column separators (tabs, pipes, multiple spaces).
 */
function detectTablesFromOcrText(text: string): TableData[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const tables: TableData[] = [];
  let tableLines: string[] = [];

  for (const line of lines) {
    // Detect table-like lines: contain tabs or multiple spaces or pipes
    const isTableLine =
      line.includes('\t') ||
      line.includes('|') ||
      /\s{3,}/.test(line);

    if (isTableLine) {
      tableLines.push(line);
    } else {
      if (tableLines.length >= 2) {
        const table = parseTableLines(tableLines);
        if (table) tables.push(table);
      }
      tableLines = [];
    }
  }

  // Handle trailing table
  if (tableLines.length >= 2) {
    const table = parseTableLines(tableLines);
    if (table) tables.push(table);
  }

  return tables;
}

function parseTableLines(lines: string[]): TableData | null {
  // Split by tabs, pipes, or multiple spaces
  const splitLine = (line: string): string[] => {
    if (line.includes('|')) {
      return line.split('|').map((c) => c.trim()).filter(Boolean);
    }
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.trim()).filter(Boolean);
    }
    return line.split(/\s{3,}/).map((c) => c.trim()).filter(Boolean);
  };

  const allCells = lines.map(splitLine);

  // Verify consistent column count (allow ±1 variation)
  const columnCounts = allCells.map((row) => row.length);
  const sorted = [...columnCounts].sort((a, b) => a - b);
  const medianCols = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (medianCols < 2) return null;

  // Filter rows with approximately correct column count
  const validRows = allCells.filter(
    (row) => Math.abs(row.length - medianCols) <= 1
  );

  if (validRows.length < 2) return null;

  // Pad rows to match column count
  const padded = validRows.map((row) => {
    while (row.length < medianCols) row.push('');
    return row.slice(0, medianCols);
  });

  const firstRow = padded[0];
  if (!firstRow) return null;

  return {
    headers: firstRow,
    rows: padded.slice(1),
    confidence: 65, // OCR-detected tables have lower confidence
  };
}

/**
 * Terminate the Tesseract worker (cleanup).
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}
