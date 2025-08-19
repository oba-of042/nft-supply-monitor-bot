// utils/queue.js
import Redis from 'ioredis';
import { logInfo, logError } from './logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const DEFAULT_QUEUE_KEY = 'nft-monitor-queue';

/**
 * Add a task to the Redis queue
 * @param {Object} task - Any JSON-serializable object
 * @param {string} [queueKey=DEFAULT_QUEUE_KEY]
 */
export async function enqueue(task, queueKey = DEFAULT_QUEUE_KEY) {
  try {
    await redis.rpush(queueKey, JSON.stringify(task));
    logInfo(`Enqueued task to ${queueKey}`);
  } catch (err) {
    logError(`Queue enqueue error: ${err}`);
  }
}

/**
 * Pull a task from the Redis queue (blocking)
 * @param {string} [queueKey=DEFAULT_QUEUE_KEY]
 * @param {number} [timeout=0] - Seconds to block (0 = wait forever)
 */
export async function dequeue(queueKey = DEFAULT_QUEUE_KEY, timeout = 0) {
  try {
    const res = await redis.blpop(queueKey, timeout);
    if (!res) return null;
    const [, taskStr] = res;
    return JSON.parse(taskStr);
  } catch (err) {
    logError(`Queue dequeue error: ${err}`);
    return null;
  }
}

/**
 * Get queue length
 */
export async function getQueueLength(queueKey = DEFAULT_QUEUE_KEY) {
  try {
    return await redis.llen(queueKey);
  } catch (err) {
    logError(`Queue length error: ${err}`);
    return 0;
  }
}

/**
 * Gracefully close Redis connection
 */
export function closeQueue() {
  redis.disconnect();
}
