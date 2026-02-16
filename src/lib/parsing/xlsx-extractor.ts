/**
 * Excel file extraction using SheetJS (xlsx).
 *
 * Features:
 * - Parse all sheets into structured tables
 * - Evaluate formulas to final values
 * - Expand merged cells
 * - Detect headers vs data rows
 */

import type { ExtractionBlock, TableData, MergedCell, ParseResponse } from './types';

/**
 * Extract data from an XLSX/XLS buffer.
 */
export async function extractFromXlsx(
  buffer: Buffer,
  filename: string
): Promise<ParseResponse> {
  const startTime = Date.now();
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false, // Evaluate formulas to values
    cellDates: true,
    cellNF: true,
  });

  const blocks: ExtractionBlock[] = [];
  const tables: TableData[] = [];
  const allText: string[] = [];
  let blockIndex = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Convert to JSON (array of arrays)
    const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false, // Format numbers as strings
    });

    if (rawData.length === 0) continue;

    // Filter out completely empty rows
    const data = rawData.filter((row) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );

    if (data.length === 0) continue;

    // Convert all cells to strings
    const stringData = data.map((row) =>
      row.map((cell) => formatCell(cell))
    );

    // Normalize column count
    const maxCols = Math.max(...stringData.map((r) => r.length));
    const normalized = stringData.map((row) => {
      while (row.length < maxCols) row.push('');
      return row;
    });

    // Detect merged cells
    const mergedCells = extractMergedCells(sheet, XLSX);

    // First row is headers
    const headerRow = normalized[0];
    if (!headerRow) continue;

    const rows = normalized.slice(1);

    tables.push({
      headers: headerRow,
      rows,
      mergedCells: mergedCells.length > 0 ? mergedCells : undefined,
      confidence: 95,
    });

    // Create text representation for AI pipeline
    const textLines: string[] = [];
    textLines.push(`=== Sheet: ${sheetName} ===`);
    textLines.push(headerRow.join(' | '));
    textLines.push('-'.repeat(60));
    for (const row of rows) {
      textLines.push(row.join(' | '));
    }
    const sheetText = textLines.join('\n');
    allText.push(sheetText);

    // Create extraction block
    blocks.push({
      id: `xlsx_${sanitizeId(filename)}_s${blockIndex++}`,
      type: 'table',
      content: {
        sheetName,
        headers: headerRow,
        rowCount: rows.length,
        preview: rows.slice(0, 3),
      },
      source: 'xlsx',
      confidence: 95,
      page: blockIndex,
      position: { x: 0, y: 0, w: 0, h: 0 },
      warnings: [],
    });
  }

  return {
    blocks,
    rawText: allText.join('\n\n'),
    tables,
    overallConfidence: 95,
    language: null,
    pageCount: workbook.SheetNames.length,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Extract merged cell information from a sheet.
 */
function extractMergedCells(
  sheet: Record<string, unknown>,
  XLSX: typeof import('xlsx')
): MergedCell[] {
  const merges = sheet['!merges'] as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> | undefined;
  if (!merges) return [];

  return merges.map((merge) => {
    // Expand merged cell value to all covered cells
    const startCell = XLSX.utils.encode_cell(merge.s);
    const cellValue = (sheet as Record<string, { v?: unknown }>)[startCell]?.v ?? '';

    // Store value in all merged positions (for correct extraction)
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!(addr in (sheet as Record<string, unknown>))) {
          (sheet as Record<string, { v: unknown; t: string }>)[addr] = {
            v: cellValue,
            t: 's',
          };
        }
      }
    }

    return {
      row: merge.s.r,
      col: merge.s.c,
      rowSpan: merge.e.r - merge.s.r + 1,
      colSpan: merge.e.c - merge.s.c + 1,
    };
  });
}

/**
 * Format a cell value for text output.
 */
function formatCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    return formatDate(cell);
  }
  return String(cell).trim();
}

/**
 * Format dates in Romanian style (DD.MM.YYYY).
 */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function sanitizeId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
}
