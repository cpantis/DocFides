import { pipelineWorker } from './pipeline-worker';
import { ocrWorker } from './ocr-worker';
import { cleanupWorker } from './cleanup-worker';

console.log('[Workers] Starting DocFides workers...');
console.log('[Workers] Pipeline worker:', pipelineWorker.name);
console.log('[Workers] OCR worker:', ocrWorker.name);
console.log('[Workers] Cleanup worker:', cleanupWorker.name);

async function shutdown() {
  console.log('[Workers] Shutting down...');
  await Promise.all([
    pipelineWorker.close(),
    ocrWorker.close(),
    cleanupWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
