/**
 * BullMQ queue instances for adding jobs from API routes.
 */

import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export interface OcrJobData {
  documentId: string;
  projectId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sha256: string;
}

export interface PipelineJobData {
  projectId: string;
  userId: string;
}

export interface CleanupJobData {
  type: 'expired_files' | 'project_files';
  projectId?: string;
  userId?: string;
}

let ocrQueue: Queue<OcrJobData> | null = null;
let pipelineQueue: Queue<PipelineJobData> | null = null;
let cleanupQueue: Queue<CleanupJobData> | null = null;

export function getOcrQueue(): Queue<OcrJobData> {
  if (!ocrQueue) {
    ocrQueue = new Queue<OcrJobData>('ocr', { connection: redisConnection });
  }
  return ocrQueue;
}

export function getPipelineQueue(): Queue<PipelineJobData> {
  if (!pipelineQueue) {
    pipelineQueue = new Queue<PipelineJobData>('pipeline', { connection: redisConnection });
  }
  return pipelineQueue;
}

export function getCleanupQueue(): Queue<CleanupJobData> {
  if (!cleanupQueue) {
    cleanupQueue = new Queue<CleanupJobData>('cleanup', { connection: redisConnection });
  }
  return cleanupQueue;
}
