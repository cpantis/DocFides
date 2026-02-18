/**
 * Vision API fallback for single pages where OCR fails.
 *
 * This is the LAST resort — only called when both pdf-parse native text
 * and Tesseract OCR return < 50 characters for a page.
 * Sends a single page image (not the entire PDF) to minimize cost.
 */

import { callAgentWithRetry } from '@/lib/ai/client';
import type { ExtractionBlock, TableData } from './types';
import type { ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';

const VISION_MODEL = 'claude-sonnet-4-5-20250929';

const VISION_SYSTEM = `Extract ALL text from this single document page image.
Preserve structure (headings, paragraphs, lists). Extract tables with headers and rows.
Romanian diacritics: ș ț ă â î (never cedilla ş ţ).
Only extract visible text — never invent content.`;

/**
 * Send a single page image to Claude Vision for text extraction.
 * Returns extracted text, blocks, and tables.
 */
export async function extractPageWithVision(
  pageImageBuffer: Buffer,
  pageNumber: number,
  filename: string
): Promise<{
  text: string;
  blocks: ExtractionBlock[];
  tables: TableData[];
  confidence: number;
}> {
  const base64Data = pageImageBuffer.toString('base64');

  const imageBlock: ImageBlockParam = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: base64Data,
    },
  };

  const textBlock: TextBlockParam = {
    type: 'text',
    text: `Extract all text and tables from page ${pageNumber} of ${filename}. Use save_page_extraction to return results.`,
  };

  const result = await callAgentWithRetry(
    {
      model: VISION_MODEL,
      max_tokens: 4096,
      system: VISION_SYSTEM,
      tools: [
        {
          name: 'save_page_extraction',
          description: 'Save extracted text and tables from a single page',
          input_schema: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' as const, description: 'All text from the page' },
              tables: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    headers: { type: 'array' as const, items: { type: 'string' as const } },
                    rows: { type: 'array' as const, items: { type: 'array' as const, items: { type: 'string' as const } } },
                  },
                  required: ['headers', 'rows'],
                },
              },
              confidence: { type: 'number' as const, description: '0-100' },
            },
            required: ['text', 'confidence'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [imageBlock, textBlock],
        },
      ],
    },
    'save_page_extraction'
  );

  const rawText = (result.output.text as string) ?? '';
  const confidence = (result.output.confidence as number) ?? 75;
  const aiTables = (result.output.tables as Array<{ headers: string[]; rows: string[][] }>) ?? [];

  const blocks: ExtractionBlock[] = rawText.trim() ? [{
    id: `vision_p${pageNumber}`,
    type: 'text',
    content: rawText,
    source: 'pdf-parse', // Compatible with existing type system
    confidence,
    page: pageNumber,
    position: { x: 0, y: 0, w: 0, h: 0 },
    warnings: ['Extracted via Vision API fallback (OCR failed)'],
  }] : [];

  const tables: TableData[] = aiTables.map((t) => ({
    headers: t.headers,
    rows: t.rows,
    confidence,
  }));

  return { text: rawText, blocks, tables, confidence };
}
