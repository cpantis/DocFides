import { Worker, type Job } from 'bullmq';

interface PipelineJobData {
  projectId: string;
  userId: string;
}

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

export const pipelineWorker = new Worker<PipelineJobData>(
  'pipeline',
  async (job: Job<PipelineJobData>) => {
    const { projectId, userId } = job.data;
    console.log(`[Pipeline] Processing project ${projectId} for user ${userId}`);

    const stages = ['extractor', 'model', 'template', 'mapping', 'writing', 'verification'] as const;

    for (const stage of stages) {
      await job.updateProgress({ stage, status: 'running' });
      console.log(`[Pipeline] Running ${stage} agent...`);

      // TODO: Call the actual agent implementation
      // const agent = agents[stage];
      // const result = await agent.run(projectId);

      await job.updateProgress({ stage, status: 'completed' });
    }

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
