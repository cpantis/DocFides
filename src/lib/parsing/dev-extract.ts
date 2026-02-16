/**
 * Document extraction entry point for dev mode (local file storage).
 *
 * Delegates to the full parsing pipeline (parse-pipeline.ts) which uses:
 * - pdf-parse for native PDFs
 * - Sharp + Tesseract.js for scanned PDFs and images
 * - mammoth for DOCX
 * - SheetJS for XLSX/XLS
 *
 * Creates Extraction records in MongoDB so the AI pipeline can find document texts.
 */

import { promises as fs } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), '.uploads');

/**
 * Extract text from a file stored in local uploads and create an Extraction record.
 * Uses the full parsing pipeline with OCR, table extraction, and confidence scoring.
 *
 * @returns The raw text extracted (empty string if format is unsupported).
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

  const filePath = path.join(UPLOADS_DIR, r2Key);
  const buffer = await fs.readFile(filePath);

  // Use the full parsing pipeline
  const { parseAndStore } = await import('./parse-pipeline');
  const merged = await parseAndStore(
    documentId,
    projectId,
    buffer,
    originalFilename,
    mimeType,
    sha256
  );

  return merged.rawText;
}
