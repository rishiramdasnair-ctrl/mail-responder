import { getRedisClient } from "./redis";
import { CONSTANTS } from "./constants";
import { logger } from "./logger";

interface CacheOptions {
  ttlMs?: number;
  prefix?: string;
}

export class CacheService {
  private prefix: string;

  constructor(prefix: string = "app") {
    this.prefix = prefix;
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = await getRedisClient();
    if (!client) return null;

    try {
      const data = await client.get(this.key(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      logger.warn({ err, key }, "[cache] get failed");
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    const ttlMs = options?.ttlMs ?? CONSTANTS.LABEL_CACHE_TTL;

    try {
      await client.setEx(
        this.key(key),
        Math.ceil(ttlMs / 1000),
        JSON.stringify(value),
      );
    } catch (err) {
      logger.warn({ err, key }, "[cache] set failed");
    }
  }

  async delete(key: string): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    try {
      await client.del(this.key(key));
    } catch (err) {
      logger.warn({ err, key }, "[cache] delete failed");
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    try {
      const keys = await client.keys(this.key(pattern));
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (err) {
      logger.warn({ err, pattern }, "[cache] deletePattern failed");
    }
  }

  async clear(): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    try {
      await this.deletePattern("*");
    } catch (err) {
      logger.warn({ err }, "[cache] clear failed");
    }
  }
}

export const labelCache = new CacheService("labels");
export const contactCache = new CacheService("contacts");
export const userCache = new CacheService("users");
export const agentCache = new CacheService("agent");
