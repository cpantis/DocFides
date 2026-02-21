/**
 * Document extraction entry point — reads from /tmp storage.
 *
 * Delegates to the full parsing pipeline (parse-pipeline.ts) which uses:
 * - Claude AI Vision (primary)
 * - pdf-parse for native PDFs
 * - Sharp + Tesseract.js for scanned PDFs and images
 * - mammoth for DOCX, word-extractor for DOC
 * - SheetJS for XLSX/XLS
 *
 * Creates Extraction records in MongoDB so the AI pipeline can find document texts.
 */

import { readTempFile } from '@/lib/storage/tmp-storage';

/**
 * Extract text from a file stored in /tmp and create an Extraction record.
 *
 * @returns The raw text extracted (empty string if format is unsupported).
 */
export async function extractAndStoreText(
  documentId: string,
  projectId: string,
  storageKey: string,
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

  const buffer = await readTempFile(storageKey);

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
