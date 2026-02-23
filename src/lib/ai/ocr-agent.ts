/**
 * AI-powered document extraction using Claude Vision.
 *
 * Sends images and PDFs directly to Claude for text extraction, table detection,
 * and structural analysis. Replaces Tesseract/Python parsing service as the
 * primary extraction method.
 *
 * Supported inputs:
 * - Images (PNG, JPG, TIFF, WebP, GIF) → sent as image content blocks
 * - PDFs → sent as document content blocks (Claude reads PDFs natively)
 *
 * For DOCX/XLSX, use the dedicated Node.js extractors (mammoth, xlsx) instead.
 */

import { AGENT_MODELS } from '@/types/pipeline';
import { callAgentWithRetry } from './client';
import type { ParseResponse, ExtractionBlock, TableData } from '@/lib/parsing/types';
import type {
  ContentBlockParam,
  ImageBlockParam,
  DocumentBlockParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const OCR_SYSTEM_PROMPT = `You are a document extraction specialist. Your task is to extract ALL text and tables from the provided document with perfect accuracy.

## Instructions

1. Extract ALL text from the document, preserving the original structure (headings, paragraphs, lists).
2. Identify and extract ALL tables, preserving headers and row data.
3. Detect the document language (Romanian "ro" or English "en").
4. Assign a confidence score (0-100) based on text clarity and readability.

## Romanian Documents
- Preserve correct diacritics: ș ț ă â î (never cedilla forms ş ţ)
- Dates are in DD.MM.YYYY format
- Amounts use dot for thousands, comma for decimals: 1.250.000,50 lei
- CUI numbers may have RO prefix for VAT payers
- IBAN format: RO + 2 check digits + 4 letters (bank) + 16 alphanumeric

## Output Requirements
- rawText: Complete text of the document, preserving paragraph breaks
- For tables: extract headers and all rows as arrays of strings
- For headings: mark them clearly in the output
- Never invent or hallucinate text — only extract what is visible in the document
- If text is partially illegible, extract what you can and note low confidence`;

/**
 * Extract text and tables from an image or PDF using Claude Vision.
 */
export async function extractWithAI(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const startTime = Date.now();

  const contentBlocks = buildContentBlocks(buffer, filename, mimeType);

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.extractor,
      max_tokens: 16384,
      temperature: 0.3,
      system: OCR_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_extraction',
          description: 'Save the extracted text, tables, and metadata from the document',
          input_schema: {
            type: 'object' as const,
            properties: {
              raw_text: {
                type: 'string' as const,
                description: 'Complete extracted text preserving structure and paragraph breaks',
              },
              blocks: {
                type: 'array' as const,
                description: 'Structural blocks found in the document',
                items: {
                  type: 'object' as const,
                  properties: {
                    type: {
                      type: 'string' as const,
                      enum: ['heading', 'text', 'list'],
                      description: 'Block type',
                    },
                    content: {
                      type: 'string' as const,
                      description: 'Text content of this block',
                    },
                    page: {
                      type: 'number' as const,
                      description: 'Page number (1-based)',
                    },
                  },
                  required: ['type', 'content'],
                },
              },
              tables: {
                type: 'array' as const,
                description: 'Tables found in the document',
                items: {
                  type: 'object' as const,
                  properties: {
                    headers: {
                      type: 'array' as const,
                      items: { type: 'string' as const },
                      description: 'Column headers',
                    },
                    rows: {
                      type: 'array' as const,
                      items: {
                        type: 'array' as const,
                        items: { type: 'string' as const },
                      },
                      description: 'Data rows (arrays of cell values)',
                    },
                  },
                  required: ['headers', 'rows'],
                },
              },
              language: {
                type: 'string' as const,
                enum: ['ro', 'en'],
                description: 'Detected document language',
              },
              confidence: {
                type: 'number' as const,
                description: 'Overall extraction confidence (0-100)',
              },
              page_count: {
                type: 'number' as const,
                description: 'Number of pages in the document',
              },
            },
            required: ['raw_text', 'blocks', 'tables', 'language', 'confidence', 'page_count'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            ...contentBlocks,
            {
              type: 'text',
              text: `Extract ALL text and tables from this document (${filename}). Use the save_extraction tool to return the structured results.`,
            } satisfies TextBlockParam,
          ],
        },
      ],
    },
    'save_extraction'
  );

  return convertToParseResponse(result.output, filename, Date.now() - startTime);
}

/**
 * Build the appropriate content blocks for the Claude API based on file type.
 */
function buildContentBlocks(
  buffer: Buffer,
  filename: string,
  mimeType: string
): ContentBlockParam[] {
  const base64Data = buffer.toString('base64');

  // PDF → document content block
  if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    const block: DocumentBlockParam = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64Data,
      },
    };
    return [block];
  }

  // Images → image content block
  const imageMediaType = toImageMediaType(mimeType, filename);
  if (imageMediaType) {
    const block: ImageBlockParam = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMediaType,
        data: base64Data,
      },
    };
    return [block];
  }

  // Unsupported — shouldn't reach here, but handle gracefully
  throw new Error(`Unsupported file type for AI extraction: ${mimeType} (${filename})`);
}

/**
 * Map MIME types to Claude-supported image media types.
 */
function toImageMediaType(mimeType: string, filename: string): ImageMediaType | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  const map: Record<string, ImageMediaType> = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
    'image/tiff': 'image/png', // TIFF not directly supported — will need conversion
  };

  if (map[mimeType]) return map[mimeType];

  // Fallback by extension
  const extMap: Record<string, ImageMediaType> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };

  return extMap[ext] ?? null;
}

/**
 * Convert AI agent output to the standard ParseResponse format.
 */
function convertToParseResponse(
  output: Record<string, unknown>,
  filename: string,
  processingTimeMs: number
): ParseResponse {
  const rawText = (output.raw_text as string) ?? '';
  const language = (output.language as string) ?? null;
  const confidence = (output.confidence as number) ?? 85;
  const pageCount = (output.page_count as number) ?? 1;
  const baseId = filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);

  // Convert blocks
  const aiBlocks = (output.blocks as Array<Record<string, unknown>>) ?? [];
  const blocks: ExtractionBlock[] = aiBlocks.map((block, idx) => ({
    id: `ai_${baseId}_b${idx}`,
    type: (block.type as ExtractionBlock['type']) ?? 'text',
    content: (block.content as string) ?? '',
    source: 'pdf-parse' as const, // Compatible with existing type system
    confidence,
    page: (block.page as number) ?? 1,
    position: { x: 0, y: 0, w: 0, h: 0 },
    warnings: [],
  }));

  // If no blocks but we have raw text, create a single text block
  if (blocks.length === 0 && rawText.trim()) {
    blocks.push({
      id: `ai_${baseId}_b0`,
      type: 'text',
      content: rawText,
      source: 'pdf-parse',
      confidence,
      page: 1,
      position: { x: 0, y: 0, w: 0, h: 0 },
      warnings: [],
    });
  }

  // Convert tables
  const aiTables = (output.tables as Array<Record<string, unknown>>) ?? [];
  const tables: TableData[] = aiTables.map((table) => ({
    headers: (table.headers as string[]) ?? [],
    rows: (table.rows as string[][]) ?? [],
    confidence,
  }));

  return {
    blocks,
    rawText,
    tables,
    overallConfidence: confidence,
    language,
    pageCount,
    processingTimeMs,
  };
}

/**
 * Check if a file type can be processed by the AI OCR agent.
 */
export function isAiExtractable(mimeType: string, filename: string): boolean {
  if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) return true;
  if (toImageMediaType(mimeType, filename) !== null) return true;
  // TIFF needs Sharp conversion first
  if (mimeType === 'image/tiff' || filename.toLowerCase().endsWith('.tiff') || filename.toLowerCase().endsWith('.tif')) return true;
  return false;
}
