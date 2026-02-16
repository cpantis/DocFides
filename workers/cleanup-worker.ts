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

    const { connectToDatabase, DocumentModel, Audit } = await import('../src/lib/db');
    const { deleteFile } = await import('../src/lib/storage/cleanup');

    await connectToDatabase();

    if (type === 'expired_files') {
      // Find documents past their TTL that haven't been cleaned up
      const expiredDocs = await DocumentModel.find({
        deleteAt: { $lt: new Date() },
        status: { $ne: 'deleted' },
      }).limit(100);

      console.log(`[Cleanup] Found ${expiredDocs.length} expired documents`);

      let cleaned = 0;
      for (const doc of expiredDocs) {
        try {
          await deleteFile(doc.r2Key);
          doc.status = 'deleted';
          await doc.save();
          cleaned++;

          await Audit.create({
            userId: doc.userId,
            projectId: doc.projectId,
            action: 'file_deleted',
            details: {
              documentId: doc._id,
              reason: 'ttl_expired',
              filename: doc.originalFilename,
            },
          });
        } catch (error) {
          console.error(`[Cleanup] Failed to delete ${doc.r2Key}:`, error);
        }
      }

      console.log(`[Cleanup] Cleaned ${cleaned}/${expiredDocs.length} expired files`);
      return { status: 'completed', type, cleaned };

    } else if (type === 'project_files') {
      const { projectId, userId } = job.data;
      if (!projectId) {
        throw new Error('projectId required for project_files cleanup');
      }

      const docs = await DocumentModel.find({
        projectId,
        status: { $ne: 'deleted' },
      });

      console.log(`[Cleanup] Deleting ${docs.length} files for project ${projectId}`);

      let cleaned = 0;
      for (const doc of docs) {
        try {
          await deleteFile(doc.r2Key);
          doc.status = 'deleted';
          await doc.save();
          cleaned++;
        } catch (error) {
          console.error(`[Cleanup] Failed to delete ${doc.r2Key}:`, error);
        }
      }

      await Audit.create({
        userId: userId ?? 'system',
        projectId,
        action: 'project_files_deleted',
        details: { cleaned, total: docs.length },
      });

      return { status: 'completed', type, cleaned };
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
