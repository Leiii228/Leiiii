/**
 * 滑動視窗速度限制：windowMs 內最多 limit 次。
 * 訊息：10 秒 5 則；表情回應：10 秒 20 次（docs/architecture.md 第 9.1 節）。
 */
export class RateLimiter {
  private stamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** 現在可以做嗎？可以的話記一次並回傳 0；不行的話回傳還要等幾毫秒 */
  take(now = Date.now()): number {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.limit) {
      return this.windowMs - (now - this.stamps[0]);
    }
    this.stamps.push(now);
    return 0;
  }
}

export const MESSAGE_LIMIT = { limit: 5, windowMs: 10_000 };
export const REACTION_LIMIT = { limit: 20, windowMs: 10_000 };
