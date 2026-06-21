import { Queue } from "bullmq";
import { redis } from "./redis.js";

export interface JudgeJob {
  submissionId: string;
}

// NFR-2/NFR-5: the queue decouples the contest-start spike from the worker pool.
export const judgeQueue = new Queue<JudgeJob>("judge", { connection: redis });
