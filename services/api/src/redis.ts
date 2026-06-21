import IORedis from "ioredis";
import { env } from "./env.js";

// maxRetriesPerRequest must be null for BullMQ connections.
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
