/**
 * Shared types for the parsing pipeline — mirrors Python ParseResponse.
 */

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MergedCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  mergedCells?: MergedCell[];
  confidence: number;
}

export type BlockType = 'text' | 'table' | 'heading' | 'list';
export type BlockSource = 'tika' | 'tesseract' | 'easyocr' | 'img2table' | 'camelot' | 'openpyxl';

export interface ExtractionBlock {
  id: string;
  type: BlockType;
  content: string | Record<string, unknown>;
  source: BlockSource;
  confidence: number;
  page: number;
  position: BoundingBox;
  warnings: string[];
}

export interface ParseResponse {
  blocks: ExtractionBlock[];
  rawText: string;
  tables: TableData[];
  overallConfidence: number;
  language: string | null;
  pageCount: number;
  processingTimeMs: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  warnings: string[];
}
