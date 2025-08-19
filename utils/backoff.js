// utils/backoff.js
export async function withBackoff(fn, {
  retries = 5,
  minDelay = 500,
  maxDelay = 10000,
  factor = 2,
  jitter = true,
  signal
} = {}) {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new Error('Aborted');
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      let delay = Math.min(minDelay * Math.pow(factor, attempt - 1), maxDelay);
      if (jitter) delay = Math.random() * delay;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener?.('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        });
      });
    }
  }
}
