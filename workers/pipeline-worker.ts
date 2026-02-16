import { Worker, type Job } from 'bullmq';

interface PipelineJobData {
  projectId: string;
  userId: string;
}

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

const PIPELINE_STAGES = ['extractor', 'model', 'template', 'mapping', 'writing', 'verification'] as const;

export const pipelineWorker = new Worker<PipelineJobData>(
  'pipeline',
  async (job: Job<PipelineJobData>) => {
    const { projectId, userId } = job.data;
    console.log(`[Pipeline] Processing project ${projectId} for user ${userId}`);

    const { connectToDatabase, Project, DocumentModel, Audit } = await import('../src/lib/db');
    const { runPipeline } = await import('../src/lib/ai/pipeline');

    await connectToDatabase();

    const project = await Project.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Check source documents — allow partial extraction (at least one must be ready)
    const sourceDocs = await DocumentModel.find({
      projectId,
      role: 'source',
      status: { $ne: 'deleted' },
    });

    const extracted = sourceDocs.filter((d) => d.status === 'extracted');
    const failed = sourceDocs.filter((d) => d.status === 'failed');
    const pending = sourceDocs.filter((d) => d.status !== 'extracted' && d.status !== 'failed');

    if (extracted.length === 0) {
      const total = sourceDocs.length;
      if (total === 0) {
        throw new Error('No source documents uploaded. Upload at least one source document.');
      } else if (failed.length === total) {
        throw new Error(`All ${total} source documents failed extraction. Check the parsing service and re-upload.`);
      } else {
        throw new Error(
          `No source documents are ready yet (${pending.length} still processing, ${failed.length} failed). Wait for OCR to complete.`
        );
      }
    }

    // Log partial extraction warnings
    if (failed.length > 0) {
      console.warn(
        `[Pipeline] Proceeding with ${extracted.length}/${sourceDocs.length} extracted documents. ` +
        `${failed.length} document(s) failed and will be skipped: ` +
        failed.map((d) => d.originalFilename).join(', ')
      );
    }
    if (pending.length > 0) {
      console.warn(
        `[Pipeline] ${pending.length} document(s) still processing and will be skipped: ` +
        pending.map((d) => d.originalFilename).join(', ')
      );
    }

    // Run the 6-stage AI pipeline
    for (const stage of PIPELINE_STAGES) {
      await job.updateProgress({ stage, status: 'running' });
      console.log(`[Pipeline] Running ${stage} agent...`);

      try {
        await runPipeline(projectId, stage);
        await job.updateProgress({ stage, status: 'completed' });
        console.log(`[Pipeline] ${stage} completed`);
      } catch (error) {
        console.error(`[Pipeline] ${stage} failed:`, error);
        await job.updateProgress({ stage, status: 'failed' });

        // Update project status
        project.status = 'draft'; // Reset so user can retry
        await project.save();

        await Audit.create({
          userId,
          projectId,
          action: 'pipeline_failed',
          details: { stage, error: error instanceof Error ? error.message : String(error) },
        });

        throw error;
      }
    }

    // Mark project as ready
    project.status = 'ready';
    await project.save();

    await Audit.create({
      userId,
      projectId,
      action: 'pipeline_completed',
      details: { extractedDocs: extracted.length, totalDocs: sourceDocs.length },
    });

    console.log(`[Pipeline] Completed project ${projectId}`);
    return { status: 'completed', projectId };
  },
  {
    connection,
    concurrency: 2,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

pipelineWorker.on('completed', (job) => {
  console.log(`[Pipeline] Job ${job.id} completed`);
});

pipelineWorker.on('failed', (job, err) => {
  console.error(`[Pipeline] Job ${job?.id} failed:`, err.message);
});
