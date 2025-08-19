// utils/rateLimiter.js

export class TokenBucket {
  constructor({ tokensPerInterval = 60, intervalMs = 60_000, capacity = 60 } = {}) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.tokensPerInterval = tokensPerInterval;
    this.intervalMs = intervalMs;
    this.queue = [];
    setInterval(() => this._refill(), this.intervalMs);
  }

  _refill() {
    this.tokens = Math.min(this.capacity, this.tokens + this.tokensPerInterval);
    this._drainQueue();
  }

  _drainQueue() {
    while (this.queue.length && this.tokens > 0) {
      const { resolve, count } = this.queue.shift();
      this.tokens -= count;
      resolve();
    }
  }

  acquire(count = 1) {
    if (count > this.capacity) {
      return Promise.reject(new Error('Token request exceeds capacity'));
    }
    if (this.tokens >= count) {
      this.tokens -= count;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push({ count, resolve }));
  }
}

export class ConcurrencyLimiter {
  constructor(max = 5) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    if (this.running >= this.max) {
      await new Promise(res => this.queue.push(res));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length) this.queue.shift()();
    }
  }
}

// ✅ Single shared instance
export const tokenBucket = new TokenBucket({ tokensPerInterval: 60, intervalMs: 60_000, capacity: 60 });
export const concurrencyLimiter = new ConcurrencyLimiter(5);
