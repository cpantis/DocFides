/**
 * Shared BullMQ connection config for queues and workers.
 */

export const redisConnection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
