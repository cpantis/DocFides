/**
 * Library item processor — runs full AI analysis on library documents at upload time.
 *
 * Processing flow per type:
 *   Template: parse (OCR/text/tables) → Template Agent → template_schema + rawText
 *   Model:    parse (OCR/text/tables) → Model Agent → style_guide + rawText
 *   Entity:   parse all docs (OCR/text/tables) → Extractor Agent → entity_data + rawTexts
 *
 * All parsed text (rawText) is stored in processedData so that when a project uses
 * a library item, the pipeline can skip parser + extract_analyze and go directly
 * to the write_verify stage using the cached results.
 *
 * Processing is async (non-blocking) — the upload returns immediately,
 * and the library item status transitions: draft → processing → ready | error.
 */

import type { ILibraryItem, ILibraryDocument } from '@/lib/db/models/library-item';

/**
 * Result from parsing a single document through the full pipeline
 * (OCR, text extraction, table detection, etc.)
 */
interface ParsedDocument {
  filename: string;
  rawText: string;
  tables: Array<{ headers: string[]; rows: string[][]; confidence: number }>;
  blocks: unknown[];
  pageCount: number;
  confidence: number;
  language: string | null;
}

/**
 * Process a library item in the background.
 * Reads the document(s), parses them through the full pipeline (OCR, text, tables),
 * runs the appropriate AI agent, and stores everything in processedData.
 */
export async function processLibraryItem(itemId: string): Promise<void> {
  const { connectToDatabase, LibraryItem } = await import('@/lib/db');
  await connectToDatabase();

  const item = await LibraryItem.findById(itemId).select('+documents.fileData');
  if (!item) {
    console.error(`[LibraryProcessor] Item not found: ${itemId}`);
    return;
  }

  if (item.documents.length === 0) {
    console.warn(`[LibraryProcessor] No documents to process for ${item.type} "${item.name}"`);
    return;
  }

  // Mark as processing
  item.status = 'processing';
  for (const doc of item.documents) {
    if (doc.status === 'uploaded') {
      doc.status = 'processing';
    }
  }
  await item.save();

  try {
    switch (item.type) {
      case 'template':
        await processTemplate(item);
        break;
      case 'model':
        await processModel(item);
        break;
      case 'entity':
        await processEntity(item);
        break;
    }

    // Mark as ready
    item.status = 'ready';
    for (const doc of item.documents) {
      if (doc.status === 'processing') {
        doc.status = 'extracted';
      }
    }
    await item.save();

    console.log(`[LibraryProcessor] Successfully processed ${item.type} "${item.name}"`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LibraryProcessor] Failed to process ${item.type} "${item.name}":`, errMsg);

    item.status = 'error';
    item.processedData = { error: errMsg } as Record<string, unknown>;
    for (const doc of item.documents) {
      if (doc.status === 'processing') {
        doc.status = 'failed';
      }
    }
    await item.save();
  }
}

/**
 * Parse a library document through the full pipeline (OCR, text extraction, tables).
 * Tries /tmp first, then falls back to fileData stored in MongoDB.
 * Returns structured parsed data including rawText, tables, blocks.
 */
async function parseLibraryDocument(doc: ILibraryDocument): Promise<ParsedDocument> {
  const { readTempFile } = await import('@/lib/storage/tmp-storage');
  const { parseDocument } = await import('@/lib/parsing/parse-pipeline');

  let buffer: Buffer;
  try {
    buffer = await readTempFile(doc.storageKey);
  } catch {
    // Fallback to MongoDB fileData
    if (doc.fileData) {
      buffer = Buffer.isBuffer(doc.fileData)
        ? doc.fileData
        : Buffer.from(doc.fileData as ArrayBuffer);
    } else {
      throw new Error(`File not found in /tmp or MongoDB for ${doc.originalFilename}`);
    }
  }

  console.log(`[LibraryProcessor] Parsing ${doc.originalFilename} (${doc.mimeType}, ${(buffer.length / 1024).toFixed(0)} KB)`);

  const parseResult = await parseDocument(buffer, doc.originalFilename, doc.mimeType);

  // Store extraction blocks on the document for reference
  doc.extractionBlocks = parseResult.blocks as unknown as Record<string, unknown>[];

  console.log(
    `[LibraryProcessor] Parsed ${doc.originalFilename}: ` +
    `${parseResult.rawText.length} chars, ${parseResult.tables.length} tables, ` +
    `${parseResult.overallConfidence}% confidence, lang=${parseResult.language ?? 'unknown'}`
  );

  return {
    filename: doc.originalFilename,
    rawText: parseResult.rawText,
    tables: parseResult.tables,
    blocks: parseResult.blocks,
    pageCount: parseResult.pageCount,
    confidence: parseResult.overallConfidence,
    language: parseResult.language,
  };
}

/**
 * Process a template — parse + Template Agent → template_schema + rawText.
 * Stores everything needed so the pipeline can skip parser + extract_analyze.
 */
async function processTemplate(item: ILibraryItem): Promise<void> {
  const parsed = await parseLibraryDocument(item.documents[0]!);

  if (!parsed.rawText || parsed.rawText.length < 10) {
    throw new Error('Template document has no extractable text content');
  }

  const { runTemplateAgent } = await import('@/lib/ai/template-agent');

  const format = item.documents[0]!.format.toLowerCase();
  const templateType = format === 'pdf' ? 'flat_pdf' as const : 'docx' as const;

  const result = await runTemplateAgent({
    content: parsed.rawText,
    templateType,
  });

  item.processedData = {
    type: 'template_schema',
    templateSchema: result.output,
    // Store parsed text so pipeline can use it without re-parsing
    rawText: parsed.rawText,
    tables: parsed.tables,
    textLength: parsed.rawText.length,
    pageCount: parsed.pageCount,
    confidence: parsed.confidence,
    language: parsed.language,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Process a model — parse + Model Agent → style_guide + rawText.
 * Stores parsed text and AI-extracted style patterns.
 */
async function processModel(item: ILibraryItem): Promise<void> {
  const parsed = await parseLibraryDocument(item.documents[0]!);

  if (!parsed.rawText || parsed.rawText.length < 10) {
    throw new Error('Model document has no extractable text content');
  }

  const { runModelAgent } = await import('@/lib/ai/model-agent');

  const result = await runModelAgent({
    documents: [{
      filename: parsed.filename,
      content: parsed.rawText,
    }],
  });

  item.processedData = {
    type: 'style_guide',
    styleGuide: result.output,
    // Store parsed text so pipeline can use it without re-parsing
    rawText: parsed.rawText,
    textLength: parsed.rawText.length,
    confidence: parsed.confidence,
    language: parsed.language,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Process an entity — parse all docs + Extractor Agent → entity_data + rawTexts.
 * Stores all parsed document texts and the AI-extracted entity data.
 */
async function processEntity(item: ILibraryItem): Promise<void> {
  const parsedDocs: ParsedDocument[] = [];

  for (const doc of item.documents) {
    if (doc.status === 'failed') continue;

    try {
      const parsed = await parseLibraryDocument(doc);
      if (parsed.rawText && parsed.rawText.length >= 10) {
        parsedDocs.push(parsed);
      }
    } catch (err) {
      console.warn(
        `[LibraryProcessor] Failed to parse entity document ${doc.originalFilename}:`,
        err instanceof Error ? err.message : err
      );
      doc.status = 'failed';
    }
  }

  if (parsedDocs.length === 0) {
    throw new Error('No entity documents could be parsed');
  }

  const { runExtractorAgent } = await import('@/lib/ai/extractor-agent');

  const result = await runExtractorAgent({
    documents: parsedDocs.map((d) => ({
      filename: d.filename,
      content: d.rawText,
      role: 'source' as const,
    })),
  });

  item.processedData = {
    type: 'entity_data',
    entityData: result.output,
    // Store all parsed document texts so pipeline can use them without re-parsing
    documents: parsedDocs.map((d) => ({
      filename: d.filename,
      rawText: d.rawText,
      tables: d.tables,
      confidence: d.confidence,
      language: d.language,
    })),
    documentCount: parsedDocs.length,
    processedAt: new Date().toISOString(),
  };
}
