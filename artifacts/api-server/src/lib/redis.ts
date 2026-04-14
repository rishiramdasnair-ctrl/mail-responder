import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[cache] REDIS_URL not set, caching disabled");
    return null;
  }

  try {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (err) => {
      console.error("[cache] Redis client error:", err);
    });
    await redisClient.connect();
    console.log("[cache] Redis connected");
    return redisClient;
  } catch (err) {
    console.error("[cache] Failed to connect to Redis:", err);
    redisClient = null;
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}
