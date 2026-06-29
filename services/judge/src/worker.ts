import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { Verdict, type JudgeResult, type Language } from "@arena/shared";
import { RECIPES } from "./recipes.js";
import { runInSandbox } from "./sandbox.js";
import { loadTests } from "./storage.js";

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const { hostname, port } = new URL(redisUrl);
const connection = { host: hostname, port: Number(port) || 6379, maxRetriesPerRequest: null as null };
const pub = new IORedis({ host: hostname, port: Number(port) || 6379 });

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

  const result: JudgeResult = { verdict: Verdict.AC, maxTimeMs: 0, maxMemoryKb: 0, cases: [], totalCases: tests.length };

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const out = await runInSandbox(recipe, sub.source, t.input, limits);
    result.maxTimeMs = Math.max(result.maxTimeMs, out.timeMs);
    result.maxMemoryKb = Math.max(result.maxMemoryKb, out.memoryKb);

    let v: Verdict;
    if (out.verdict === Verdict.CE) { result.compileLog = out.compileLog; v = Verdict.CE; }
    else if (out.verdict === Verdict.RE) { result.runtimeLog = out.runtimeLog; v = Verdict.RE; }
    else if (out.verdict) v = out.verdict; // TLE / MLE
    else v = normalize(out.stdout) === normalize(t.expected) ? Verdict.AC : Verdict.WA;

    result.cases.push({ index: i + 1, verdict: v, timeMs: out.timeMs, memoryKb: out.memoryKb });

    if (v !== Verdict.AC) {
      result.verdict = v;
      result.failedCase = i + 1;
      result.message = explain(v, i + 1, tests.length, limits, out);
      break;
    }
  }

  if (result.verdict === Verdict.AC) {
    result.message = `Accepted — passed all ${tests.length} test${tests.length === 1 ? "" : "s"} in ${result.maxTimeMs}ms`;
  }
  return result;
}

/** Build a human-readable one-liner explaining a non-AC verdict. */
function explain(
  v: Verdict,
  caseNo: number,
  total: number,
  limits: { timeMs: number; memoryKb: number },
  out: { runtimeLog?: string },
): string {
  const where = `test ${caseNo} of ${total}`;
  switch (v) {
    case Verdict.WA:
      return `Wrong answer on ${where} — your output didn't match the expected output.`;
    case Verdict.TLE:
      return `Time limit exceeded on ${where} — exceeded the ${limits.timeMs}ms limit. Check for an inefficient algorithm or an infinite loop.`;
    case Verdict.MLE:
      return `Memory limit exceeded on ${where} — exceeded the ${Math.round(limits.memoryKb / 1024)}MB limit.`;
    case Verdict.RE: {
      const first = (out.runtimeLog ?? "").split("\n").filter(Boolean).pop();
      return `Runtime error on ${where}${first ? ` — ${first}` : " — your program crashed (non-zero exit)."}`;
    }
    case Verdict.CE:
      return "Compilation error — your code didn't compile. See the log below.";
    default:
      return `Failed on ${where}.`;
  }
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
      const reason = err instanceof Error ? err.message : String(err);
      result = {
        verdict: Verdict.IE,
        maxTimeMs: 0,
        maxMemoryKb: 0,
        cases: [],
        message: `Internal judge error — ${reason}. This is a server-side issue, not a problem with your code. Please retry; if it persists, contact an admin.`,
      };
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

    await pub.publish("arena:verdicts", JSON.stringify({ submissionId, result }));
    return result;
  },
  { connection, concurrency: Number(process.env.JUDGE_CONCURRENCY ?? 2) }, // NFR-2: scale via more workers
);

worker.on("ready", () => console.log("judge worker ready"));
worker.on("failed", (job, err) => console.error("job failed", job?.id, err));
