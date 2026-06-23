import { Queue } from "bullmq";
import { env } from "./env.js";

export interface JudgeJob {
  submissionId: string;
}

const { hostname, port } = new URL(env.REDIS_URL);
const connection = { host: hostname, port: Number(port) || 6379, maxRetriesPerRequest: null as null };

// NFR-2/NFR-5: the queue decouples the contest-start spike from the worker pool.
export const judgeQueue = new Queue<JudgeJob>("judge", { connection });
