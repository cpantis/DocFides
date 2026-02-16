const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  interval: number; // ms
  maxRequests: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.interval;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

export const API_RATE_LIMITS = {
  upload: { interval: 60_000, maxRequests: 20 },
  pipeline: { interval: 60_000, maxRequests: 5 },
  export: { interval: 60_000, maxRequests: 10 },
  regenerate: { interval: 60_000, maxRequests: 15 },
} as const;
