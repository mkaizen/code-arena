import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { Verdict, type JudgeResult, type Language } from "@arena/shared";
import { RECIPES } from "./recipes.js";
import { runInSandbox } from "./sandbox.js";
import { loadTests } from "./storage.js";

const prisma = new PrismaClient();
const { hostname, port } = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = { host: hostname, port: Number(port) || 6379, maxRetriesPerRequest: null as null };

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
}

async function judge(submissionId: string): Promise<JudgeResult> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { problem: true },
  });
  const recipe = RECIPES[sub.language as Language];
  const tests = await loadTests(sub.problem.testsKey); // object-storage read
  const limits = { timeMs: sub.problem.timeMs, memoryKb: sub.problem.memoryKb };

  const result: JudgeResult = { verdict: Verdict.AC, maxTimeMs: 0, maxMemoryKb: 0, cases: [] };

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const out = await runInSandbox(recipe, sub.source, t.input, limits);
    result.maxTimeMs = Math.max(result.maxTimeMs, out.timeMs);
    result.maxMemoryKb = Math.max(result.maxMemoryKb, out.memoryKb);

    let v: Verdict;
    if (out.verdict === Verdict.CE) { result.compileLog = out.compileLog; v = Verdict.CE; }
    else if (out.verdict) v = out.verdict; // TLE / MLE / RE
    else v = normalize(out.stdout) === normalize(t.expected) ? Verdict.AC : Verdict.WA;

    result.cases.push({ index: i + 1, verdict: v, timeMs: out.timeMs, memoryKb: out.memoryKb });

    if (v !== Verdict.AC) { result.verdict = v; result.failedCase = i + 1; break; }
  }
  return result;
}

const worker = new Worker(
  "judge",
  async (job) => {
    const { submissionId } = job.data as { submissionId: string };
    await prisma.submission.update({ where: { id: submissionId }, data: { verdict: Verdict.JUDGING } });

    let result: JudgeResult;
    try {
      result = await judge(submissionId);
    } catch (err) {
      console.error("judge error", err);
      result = { verdict: Verdict.IE, maxTimeMs: 0, maxMemoryKb: 0, cases: [] };
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        verdict: result.verdict,
        failedCase: result.failedCase ?? null,
        timeMs: result.maxTimeMs,
        memoryKb: result.maxMemoryKb,
        judgedAt: new Date(),
      },
    });
    return result;
  },
  { connection, concurrency: Number(process.env.JUDGE_CONCURRENCY ?? 2) }, // NFR-2: scale via more workers
);

worker.on("ready", () => console.log("judge worker ready"));
worker.on("failed", (job, err) => console.error("job failed", job?.id, err));
