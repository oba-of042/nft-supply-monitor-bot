// utils/redisQueue.js
import IORedis from 'ioredis';

export class RedisQueue {
  constructor(name = 'nft_monitors', url = process.env.REDIS_URL) {
    this.name = name;
    this.client = new IORedis(url);
  }

  async push(job) {
    await this.client.rpush(this.name, JSON.stringify(job));
  }

  async pop(block = true, timeout = 5) {
    if (block) {
      const res = await this.client.blpop(this.name, timeout);
      return res ? JSON.parse(res[1]) : null;
    } else {
      const res = await this.client.lpop(this.name);
      return res ? JSON.parse(res) : null;
    }
  }

  async length() {
    return this.client.llen(this.name);
  }

  async close() {
    await this.client.quit();
  }
}
