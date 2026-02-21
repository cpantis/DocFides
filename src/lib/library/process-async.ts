/**
 * Async processing wrapper for library items.
 * Handles: parse document → AI extraction → save processedData.
 */

export async function processLibraryItemAsync(
  itemId: string,
  type: string,
  storageKey: string,
  filename: string,
  mimeType?: string
): Promise<void> {
  const { connectToDatabase, LibraryItem } = await import('@/lib/db');
  await connectToDatabase();

  // Get mimeType from the library item if not passed
  let resolvedMime = mimeType;
  if (!resolvedMime) {
    const item = await LibraryItem.findById(itemId);
    resolvedMime = item?.mimeType ?? 'application/octet-stream';
  }

  await LibraryItem.findByIdAndUpdate(itemId, { status: 'processing' });

  try {
    const { readTempFile } = await import('@/lib/storage/tmp-storage');
    const buffer = await readTempFile(storageKey);

    const { parseDocument } = await import('@/lib/parsing/parse-pipeline');
    const parseResult = await parseDocument(buffer, filename, resolvedMime);

    const { processLibraryItemData } = await import('@/lib/library/process');
    const processedData = await processLibraryItemData(type, parseResult.rawText, filename);

    await LibraryItem.findByIdAndUpdate(itemId, {
      status: 'ready',
      processedData,
    });

    console.log(`[LIBRARY] Processed ${type} item ${itemId} successfully`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LIBRARY] Processing failed for ${itemId}:`, errMsg);
    await LibraryItem.findByIdAndUpdate(itemId, {
      status: 'failed',
      processingError: errMsg,
    });
  }
}
