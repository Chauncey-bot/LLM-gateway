import { createClient } from "redis";

// Protocol of the pinned, deployed Sub2API billing cache and L1 subscriber.
// Invalidating a cache is repeatable; it never rewrites database usage.
export function subscriptionInvalidator(url = process.env.SUB2API_REDIS_URL || "redis://redis:6379/0") {
  return async (userId, groupId) => {
    const client = createClient({ url, socket: { connectTimeout: 2000, reconnectStrategy: false }, disableOfflineQueue: true });
    client.on("error", () => {});
    let timer;
    try {
      await Promise.race([
        (async () => {
          await client.connect();
          const subscribers = await client.eval(`redis.call('DEL',KEYS[1]); return redis.call('PUBLISH',ARGV[1],ARGV[2])`, {
            keys: [`billing:sub:${userId}:${groupId}`],
            arguments: ["subscription:cache:invalidate", `sub:${userId}:${groupId}`],
          });
          if (Number(subscribers) < 1) throw new Error("Subscription cache subscriber is unavailable");
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Subscription cache invalidation timed out")), 5000); }),
      ]);
    } finally {
      clearTimeout(timer);
      if (client.isOpen) client.destroy();
    }
  };
}
