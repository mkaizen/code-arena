import { Queue } from "bullmq";
import { env } from "./env.js";

export interface JudgeJob {
  submissionId: string;
}

export interface RunJob {
  runId: string;
  /** Undefined for anonymous (logged-out) runs, which poll for their result. */
  userId?: string;
  problemId: string;
  language: string;
  source: string;
  customInput?: string;
}

const { hostname, port } = new URL(env.REDIS_URL);
const connection = { host: hostname, port: Number(port) || 6379, maxRetriesPerRequest: null as null };

// NFR-2/NFR-5: the queue decouples the contest-start spike from the worker pool.
export const judgeQueue = new Queue<JudgeJob>("judge", { connection });

// Interactive "Run against samples / custom input" — separate queue so debug
// runs don't sit behind a backlog of contest submissions.
export const runQueue = new Queue<RunJob>("run", { connection });
