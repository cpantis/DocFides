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

    // Check all source documents are extracted before running pipeline
    const sourceDocs = await DocumentModel.find({
      projectId,
      role: 'source',
      status: { $ne: 'deleted' },
    });

    const unextracted = sourceDocs.filter((d) => d.status !== 'extracted');
    if (unextracted.length > 0) {
      throw new Error(
        `${unextracted.length} source documents not yet extracted. Wait for OCR to complete.`
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
      details: {},
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
