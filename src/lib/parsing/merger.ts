/**
 * Merges parsing results into a unified extraction structure
 * suitable for storage in MongoDB and consumption by AI agents.
 */

import type { ParseResponse, ExtractionBlock, TableData } from './types';
import { evaluateBlockConfidence, calculateOverallConfidence } from './confidence';

export interface MergedExtraction {
  blocks: ExtractionBlock[];
  rawText: string;
  tables: TableData[];
  overallConfidence: number;
  language: string | null;
  pageCount: number;
  processingTimeMs: number;
  warnings: string[];
  blockConfidences: { blockId: string; score: number; level: string }[];
}

/**
 * Convert snake_case keys from Python response to camelCase.
 */
export function normalizeParseResponse(raw: Record<string, unknown>): ParseResponse {
  return {
    blocks: (raw['blocks'] as ExtractionBlock[]) ?? [],
    rawText: (raw['raw_text'] as string) ?? '',
    tables: (raw['tables'] as TableData[]) ?? [],
    overallConfidence: (raw['overall_confidence'] as number) ?? 0,
    language: (raw['language'] as string | null) ?? null,
    pageCount: (raw['page_count'] as number) ?? 1,
    processingTimeMs: (raw['processing_time_ms'] as number) ?? 0,
  };
}

/**
 * Merge multiple parsing results (e.g., from multiple documents)
 * into a single combined extraction.
 */
export function mergeExtractions(results: ParseResponse[]): MergedExtraction {
  const allBlocks: ExtractionBlock[] = [];
  const allTables: TableData[] = [];
  const allTexts: string[] = [];
  let totalTime = 0;
  let totalPages = 0;
  let language: string | null = null;

  for (const result of results) {
    allBlocks.push(...result.blocks);
    allTables.push(...result.tables);
    if (result.rawText.trim()) {
      allTexts.push(result.rawText);
    }
    totalTime += result.processingTimeMs;
    totalPages += result.pageCount;

    // Use first detected language
    if (!language && result.language) {
      language = result.language;
    }
  }

  // Evaluate confidence for each block
  const blockConfidences = allBlocks.map((block) => {
    const result = evaluateBlockConfidence(block);
    return {
      blockId: block.id,
      score: result.score,
      level: result.level,
    };
  });

  const overall = calculateOverallConfidence(allBlocks);

  return {
    blocks: allBlocks,
    rawText: allTexts.join('\n\n---\n\n'),
    tables: allTables,
    overallConfidence: overall.score,
    language,
    pageCount: totalPages,
    processingTimeMs: totalTime,
    warnings: overall.warnings,
    blockConfidences,
  };
}

/**
 * Check if a document has already been parsed by comparing SHA256.
 * Returns cached extraction if found.
 */
export async function findCachedExtraction(
  sha256: string
): Promise<MergedExtraction | null> {
  // Dynamically import to avoid circular dependencies
  const { connectToDatabase, Extraction } = await import('@/lib/db');
  await connectToDatabase();

  const cached = await Extraction.findOne({ sha256 }).lean();
  if (!cached) return null;

  const blocks = cached.blocks as unknown as ExtractionBlock[];
  const tables = (cached.tables ?? []) as unknown as TableData[];

  return {
    blocks,
    rawText: cached.rawText ?? '',
    tables,
    overallConfidence: cached.overallConfidence,
    language: cached.language ?? null,
    pageCount: 1,
    processingTimeMs: cached.processingTimeMs,
    warnings: [],
    blockConfidences: blocks.map((b) => ({
      blockId: b.id,
      score: b.confidence,
      level: b.confidence >= 90 ? 'high' : b.confidence >= 70 ? 'medium' : 'low',
    })),
  };
}
