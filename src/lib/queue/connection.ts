/**
 * Shared BullMQ connection config for queues and workers.
 * Includes a Redis health check so callers can fall back to inline execution.
 */

export const redisConnection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

/**
 * Check whether Redis is reachable.
 * Returns true if a PING succeeds within 3 seconds, false otherwise.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisConnection.url, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });

    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
