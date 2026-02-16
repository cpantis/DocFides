import { Worker, type Job } from 'bullmq';

interface OcrJobData {
  documentId: string;
  projectId: string;
  r2Key: string;
  filename: string;
  mimeType: string;
  sha256: string;
}

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

export const ocrWorker = new Worker<OcrJobData>(
  'ocr',
  async (job: Job<OcrJobData>) => {
    const { documentId, projectId, r2Key, filename, mimeType, sha256 } = job.data;
    console.log(`[OCR] Processing document ${documentId} (${filename})`);

    const { connectToDatabase, DocumentModel, Extraction, Audit } = await import('../src/lib/db');
    const { downloadFile } = await import('../src/lib/storage/download');
    // Use parse-pipeline which tries Python first, then falls back to Node.js
    // native extractors (pdf-parse, mammoth, xlsx, tesseract.js)
    const { parseDocument } = await import('../src/lib/parsing/parse-pipeline');
    const { calculateOverallConfidence } = await import('../src/lib/parsing/confidence');

    await connectToDatabase();

    // 1. Check SHA256 cache — skip parsing if already done
    const cachedExtraction = await Extraction.findOne({ sha256 });
    if (cachedExtraction) {
      console.log(`[OCR] Cache hit for ${sha256.substring(0, 12)}...`);
      await DocumentModel.findByIdAndUpdate(documentId, {
        status: 'extracted',
        extractionBlocks: cachedExtraction.blocks,
        pageCount: cachedExtraction.blocks.length > 0 ? 1 : 0,
      });

      await Audit.create({
        userId: projectId,
        projectId,
        action: 'document_extracted',
        details: { documentId, cached: true },
      });

      await job.updateProgress(100);
      return { status: 'completed', documentId, cached: true };
    }

    // 2. Mark as processing
    await DocumentModel.findByIdAndUpdate(documentId, { status: 'processing' });
    await job.updateProgress(10);

    // 3. Download from R2
    console.log(`[OCR] Downloading ${r2Key}...`);
    const fileBuffer = await downloadFile(r2Key);
    await job.updateProgress(25);

    // 4. Parse document (Python → Node.js fallback)
    console.log(`[OCR] Parsing ${filename}...`);
    const parseResult = await parseDocument(fileBuffer, filename, mimeType);
    await job.updateProgress(75);

    // 5. Evaluate confidence
    type BlockForConfidence = Parameters<typeof calculateOverallConfidence>[0][number];
    const blocksForConfidence = parseResult.blocks as BlockForConfidence[];
    const overall = calculateOverallConfidence(blocksForConfidence);

    // 6. Save extraction to MongoDB (sha256-indexed for cache)
    await Extraction.create({
      documentId,
      sha256,
      projectId,
      blocks: parseResult.blocks,
      rawText: parseResult.rawText,
      tables: parseResult.tables,
      overallConfidence: overall.score,
      language: parseResult.language,
      processingTimeMs: parseResult.processingTimeMs,
    });

    // 7. Update document status
    await DocumentModel.findByIdAndUpdate(documentId, {
      status: 'extracted',
      extractionBlocks: parseResult.blocks,
      pageCount: parseResult.pageCount,
      parsingErrors: overall.warnings.length > 0 ? overall.warnings : undefined,
    });
    await job.updateProgress(90);

    // 8. Audit
    await Audit.create({
      userId: projectId,
      projectId,
      action: 'document_extracted',
      details: {
        documentId,
        confidence: overall.score,
        level: overall.level,
        blocks: parseResult.blocks.length,
        tables: parseResult.tables.length,
        language: parseResult.language,
        timeMs: parseResult.processingTimeMs,
      },
    });

    await job.updateProgress(100);
    console.log(`[OCR] Done ${documentId} — ${overall.score}% (${overall.level})`);
    return { status: 'completed', documentId, confidence: overall.score };
  },
  {
    connection,
    concurrency: 4,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  }
);

ocrWorker.on('completed', (job) => {
  console.log(`[OCR] Job ${job.id} completed`);
});

ocrWorker.on('failed', (job, err) => {
  console.error(`[OCR] Job ${job?.id} failed:`, err.message);

  // Mark document as failed
  if (job?.data.documentId) {
    import('../src/lib/db').then(async ({ connectToDatabase, DocumentModel }) => {
      await connectToDatabase();
      await DocumentModel.findByIdAndUpdate(job.data.documentId, {
        status: 'failed',
        parsingErrors: [err.message],
      });
    }).catch(() => {});
  }
});
