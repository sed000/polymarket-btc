/**
 * Simple rate limiter to prevent API throttling
 * Uses token bucket algorithm with configurable rate
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxRequestsPerSecond: number = 5) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a request can be made
   * Returns immediately if tokens available, otherwise waits
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time until next token
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await new Promise(resolve => setTimeout(resolve, waitMs));

    this.refillTokens();
    this.tokens -= 1;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  setRate(maxRequestsPerSecond: number): void {
    const rate = Number.isFinite(maxRequestsPerSecond) ? maxRequestsPerSecond : 1;
    const safeRate = Math.max(1, Math.floor(rate));
    this.refillTokens();
    this.maxTokens = safeRate;
    this.refillRate = safeRate;
    this.tokens = Math.min(this.tokens, this.maxTokens);
  }
}

// Shared rate limiters for different APIs.
export const gammaLimiter = new RateLimiter(5);

// CLOB API is split into critical and background lanes so exits are not queued
// behind scans/polling.
export const clobCriticalLimiter = new RateLimiter(6);
export const clobBackgroundLimiter = new RateLimiter(4);

// Backward-compatible alias used by older call sites.
export const clobLimiter = clobBackgroundLimiter;

export function configureClobLimiters(criticalRps: number, backgroundRps: number): void {
  clobCriticalLimiter.setRate(criticalRps);
  clobBackgroundLimiter.setRate(backgroundRps);
}

/**
 * Wrapper to execute a function with rate limiting
 */
export async function withRateLimit<T>(
  limiter: RateLimiter,
  fn: () => Promise<T>
): Promise<T> {
  await limiter.acquire();
  return fn();
}
