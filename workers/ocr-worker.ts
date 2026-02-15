import { Worker, type Job } from 'bullmq';

interface OcrJobData {
  documentId: string;
  projectId: string;
  r2Key: string;
}

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

export const ocrWorker = new Worker<OcrJobData>(
  'ocr',
  async (job: Job<OcrJobData>) => {
    const { documentId, r2Key } = job.data;
    console.log(`[OCR] Processing document ${documentId} (${r2Key})`);

    // TODO: Download file from R2, send to parsing service, save results
    // 1. Download from R2
    // 2. POST to parsing-service /parse
    // 3. Save ExtractionBlocks to MongoDB
    // 4. Update document status

    await job.updateProgress(100);
    console.log(`[OCR] Completed document ${documentId}`);
    return { status: 'completed', documentId };
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
});
