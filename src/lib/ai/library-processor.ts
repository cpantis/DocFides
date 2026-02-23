/**
 * Library item processor — runs AI analysis on library documents at upload time.
 *
 * - Template: parses document → runs Template Agent → saves template_schema as processedData
 * - Model: parses document → runs Model Agent → saves model_map (style/tone) as processedData
 * - Entity: parses all documents → runs Extractor Agent → saves entity_data as processedData
 *
 * Processing is async (non-blocking) — the upload returns immediately,
 * and the library item status transitions: draft → processing → ready | error.
 */

import type { ILibraryItem } from '@/lib/db/models/library-item';

/**
 * Process a library item in the background.
 * Reads the document(s), parses them, runs the appropriate AI agent,
 * and stores the result in processedData.
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
 * Parse a library document to extract text content.
 * Tries /tmp first, then falls back to fileData stored in MongoDB.
 */
async function getDocumentText(item: ILibraryItem, docIndex: number): Promise<string> {
  const doc = item.documents[docIndex];
  if (!doc) throw new Error(`Document at index ${docIndex} not found`);

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

  const parseResult = await parseDocument(buffer, doc.originalFilename, doc.mimeType);

  // Store extraction blocks on the document for reference
  doc.extractionBlocks = parseResult.blocks as unknown as Record<string, unknown>[];

  return parseResult.rawText;
}

/**
 * Process a template — extract field schema using Template Agent.
 */
async function processTemplate(item: ILibraryItem): Promise<void> {
  const content = await getDocumentText(item, 0);

  if (!content || content.length < 10) {
    throw new Error('Template document has no extractable text content');
  }

  const { runTemplateAgent } = await import('@/lib/ai/template-agent');

  const doc = item.documents[0]!;
  const format = doc.format.toLowerCase();
  const templateType = format === 'pdf' ? 'flat_pdf' as const : 'docx' as const;

  const result = await runTemplateAgent({
    content,
    templateType,
  });

  item.processedData = {
    type: 'template_schema',
    templateSchema: result.output,
    textLength: content.length,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Process a model — extract style/tone using Model Agent.
 */
async function processModel(item: ILibraryItem): Promise<void> {
  const content = await getDocumentText(item, 0);

  if (!content || content.length < 10) {
    throw new Error('Model document has no extractable text content');
  }

  const { runModelAgent } = await import('@/lib/ai/model-agent');

  const result = await runModelAgent({
    documents: [{
      filename: item.documents[0]!.originalFilename,
      content,
    }],
  });

  item.processedData = {
    type: 'style_guide',
    styleGuide: result.output,
    textLength: content.length,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Process an entity — extract factual data using Extractor Agent.
 */
async function processEntity(item: ILibraryItem): Promise<void> {
  const documents: { filename: string; content: string }[] = [];

  for (let i = 0; i < item.documents.length; i++) {
    const doc = item.documents[i]!;
    if (doc.status === 'failed') continue;

    try {
      const content = await getDocumentText(item, i);
      if (content && content.length >= 10) {
        documents.push({
          filename: doc.originalFilename,
          content,
        });
      }
    } catch (err) {
      console.warn(
        `[LibraryProcessor] Failed to parse entity document ${doc.originalFilename}:`,
        err instanceof Error ? err.message : err
      );
      doc.status = 'failed';
    }
  }

  if (documents.length === 0) {
    throw new Error('No entity documents could be parsed');
  }

  const { runExtractorAgent } = await import('@/lib/ai/extractor-agent');

  const result = await runExtractorAgent({
    documents: documents.map((d) => ({
      filename: d.filename,
      content: d.content,
      role: 'source' as const,
    })),
  });

  item.processedData = {
    type: 'entity_data',
    entityData: result.output,
    documentCount: documents.length,
    processedAt: new Date().toISOString(),
  };
}
