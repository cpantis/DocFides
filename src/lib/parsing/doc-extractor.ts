/**
 * Extract text from legacy .doc (Word 97-2003) files using word-extractor.
 *
 * word-extractor is a pure-JS parser — no system dependencies needed.
 */

import type { ParseResponse, ExtractionBlock } from './types';

export async function extractFromDoc(
  buffer: Buffer,
  filename: string
): Promise<ParseResponse> {
  const startTime = Date.now();

  const WordExtractor = (await import('word-extractor')).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);

  const body = doc.getBody()?.trim() ?? '';
  const headers = doc.getHeaders()?.trim() ?? '';
  const footers = doc.getFooters()?.trim() ?? '';

  // Build full text: headers + body + footers
  const parts = [headers, body, footers].filter(Boolean);
  const rawText = parts.join('\n\n');

  if (!rawText) {
    return {
      blocks: [],
      rawText: '',
      tables: [],
      overallConfidence: 0,
      language: null,
      pageCount: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Split body into paragraphs for block-level extraction
  const paragraphs = body.split(/\n{2,}/).filter((p: string) => p.trim());
  const blocks: ExtractionBlock[] = paragraphs.map((text: string, i: number) => {
    const trimmed = text.trim();
    const isHeading = trimmed.length < 120 && !trimmed.endsWith('.') && /^[A-ZĂÂÎȘȚa-zăâîșț0-9]/.test(trimmed);

    return {
      id: `doc_${sanitizeId(filename)}_${i}`,
      type: isHeading ? 'heading' : 'text',
      content: trimmed,
      source: 'word-extractor',
      confidence: 90,
      page: 1,
      position: { x: 0, y: 0, w: 0, h: 0 },
      warnings: [],
    };
  });

  // Detect language from content
  const romanianChars = (rawText.match(/[șțăâîȘȚĂÂÎ]/g) ?? []).length;
  const language = romanianChars / Math.max(1, rawText.length) > 0.005 ? 'ro' : 'en';

  // Estimate page count (rough: ~3000 chars per page)
  const pageCount = Math.max(1, Math.ceil(rawText.length / 3000));

  return {
    blocks,
    rawText,
    tables: [],
    overallConfidence: 90,
    language,
    pageCount,
    processingTimeMs: Date.now() - startTime,
  };
}

function sanitizeId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
}
