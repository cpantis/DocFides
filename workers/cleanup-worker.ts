import { Worker, type Job } from 'bullmq';

interface CleanupJobData {
  type: 'expired_files' | 'project_files';
  projectId?: string;
  userId?: string;
}

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

export const cleanupWorker = new Worker<CleanupJobData>(
  'cleanup',
  async (job: Job<CleanupJobData>) => {
    const { type } = job.data;
    console.log(`[Cleanup] Running ${type} cleanup`);

    if (type === 'expired_files') {
      // TODO: Query documents with deleteAt < now, delete from R2, update status
      console.log('[Cleanup] Checking for expired files...');
    } else if (type === 'project_files') {
      // TODO: Delete all files for a specific project
      console.log(`[Cleanup] Cleaning up project ${job.data.projectId}`);
    }

    return { status: 'completed', type };
  },
  {
    connection,
    concurrency: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  }
);

cleanupWorker.on('completed', (job) => {
  console.log(`[Cleanup] Job ${job.id} completed`);
});

cleanupWorker.on('failed', (job, err) => {
  console.error(`[Cleanup] Job ${job?.id} failed:`, err.message);
});
