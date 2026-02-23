/**
 * DOCX text and table extraction using mammoth.
 *
 * Extracts:
 * - Full text content with structural hints (headings, lists)
 * - Tables preserved with headers and rows
 */

import type { ExtractionBlock, TableData, ParseResponse } from './types';

/**
 * Extract text and tables from a DOCX buffer.
 */
export async function extractFromDocx(
  buffer: Buffer,
  filename: string
): Promise<ParseResponse> {
  const startTime = Date.now();
  const blocks: ExtractionBlock[] = [];
  const tables: TableData[] = [];

  const mammoth = await import('mammoth');

  // Single mammoth pass: extract HTML for both structure and raw text.
  // Avoids parsing the DOCX twice (extractRawText + convertToHtml were redundant).
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value ?? '';

  // Derive rawText by stripping HTML tags (faster than a second mammoth pass)
  const rawText = stripHtml(html).replace(/\n{3,}/g, '\n\n').trim();

  // Parse HTML for structural blocks
  const structuralBlocks = parseHtmlStructure(html, filename);
  blocks.push(...structuralBlocks);

  // Extract tables from HTML
  const htmlTables = extractTablesFromHtml(html);
  tables.push(...htmlTables);

  // If no structural blocks were found, create a single text block
  if (blocks.length === 0 && rawText.trim()) {
    blocks.push({
      id: `docx_${sanitizeId(filename)}_text`,
      type: 'text',
      content: rawText,
      source: 'mammoth',
      confidence: 92,
      page: 1,
      position: { x: 0, y: 0, w: 0, h: 0 },
      warnings: [],
    });
  }

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
    pageCount: 1, // mammoth doesn't provide page count
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Parse mammoth HTML output to extract structural blocks.
 */
function parseHtmlStructure(html: string, filename: string): ExtractionBlock[] {
  const blocks: ExtractionBlock[] = [];
  let blockIndex = 0;
  const baseId = sanitizeId(filename);

  // Extract headings
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const text = stripHtml(headingMatch[2] ?? '');
    if (text.trim()) {
      blocks.push({
        id: `docx_${baseId}_h${blockIndex++}`,
        type: 'heading',
        content: text.trim(),
        source: 'mammoth',
        confidence: 95,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [],
      });
    }
  }

  // Extract paragraphs (not inside tables)
  const cleanHtml = html.replace(/<table[\s\S]*?<\/table>/gi, '');
  const paraRegex = /<p[^>]*>(.*?)<\/p>/gi;
  let paraMatch: RegExpExecArray | null;
  while ((paraMatch = paraRegex.exec(cleanHtml)) !== null) {
    const text = stripHtml(paraMatch[1] ?? '');
    if (text.trim() && text.trim().length > 5) {
      blocks.push({
        id: `docx_${baseId}_p${blockIndex++}`,
        type: 'text',
        content: text.trim(),
        source: 'mammoth',
        confidence: 92,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [],
      });
    }
  }

  // Extract lists
  const listRegex = /<(?:ol|ul)[^>]*>([\s\S]*?)<\/(?:ol|ul)>/gi;
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listRegex.exec(cleanHtml)) !== null) {
    const itemRegex = /<li[^>]*>(.*?)<\/li>/gi;
    const items: string[] = [];
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(listMatch[1] ?? '')) !== null) {
      const text = stripHtml(itemMatch[1] ?? '').trim();
      if (text) items.push(text);
    }
    if (items.length > 0) {
      blocks.push({
        id: `docx_${baseId}_l${blockIndex++}`,
        type: 'list',
        content: items.join('\n'),
        source: 'mammoth',
        confidence: 92,
        page: 1,
        position: { x: 0, y: 0, w: 0, h: 0 },
        warnings: [],
      });
    }
  }

  return blocks;
}

/**
 * Extract tables from mammoth HTML output.
 */
function extractTablesFromHtml(html: string): TableData[] {
  const tables: TableData[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1] ?? '';
    const rows: string[][] = [];

    // Extract rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowMatch[1] ?? '')) !== null) {
        cells.push(stripHtml(cellMatch[1] ?? '').trim());
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length >= 2) {
      // Normalize column count
      const maxCols = Math.max(...rows.map((r) => r.length));
      const normalized = rows.map((row) => {
        while (row.length < maxCols) row.push('');
        return row;
      });

      const headerRow = normalized[0];
      if (headerRow) {
        tables.push({
          headers: headerRow,
          rows: normalized.slice(1),
          confidence: 90,
        });
      }
    }
  }

  return tables;
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Create a safe ID from a filename.
 */
function sanitizeId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
}

function detectLanguage(text: string): string | null {
  if (!text) return null;
  const romanianChars = (text.match(/[șțăâîȘȚĂÂÎ]/g) ?? []).length;
  const ratio = romanianChars / Math.max(1, text.length);
  return ratio > 0.005 ? 'ro' : 'en';
}
