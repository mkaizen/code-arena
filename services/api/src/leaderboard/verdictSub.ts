import IORedis from "ioredis";
import { env } from "../env.js";
import { broadcast } from "../ws.js";
import { prisma } from "../db.js";
import { recordAccepted, getLeaderboard, isFrozen, ensureFreezeSnapshot } from "./freeze.js";
import { onAccepted as onMatchAccepted } from "../match/engine.js";
import type { JudgeResult, ScoringModel } from "@arena/shared";

interface VerdictMsg {
  submissionId: string;
  result: JudgeResult;
}

async function computeStanding(userId: string, contestId: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return { solved: 0, penalty: 0 };
  const startMs = contest.startsAt.getTime();

  const subs = await prisma.submission.findMany({
    where: { userId, contestId },
    orderBy: { createdAt: "asc" },
    select: { problemId: true, verdict: true, createdAt: true },
  });

  const perProblem = new Map<string, { tries: number; solvedAt: number | null }>();
  for (const s of subs) {
    if (!perProblem.has(s.problemId)) perProblem.set(s.problemId, { tries: 0, solvedAt: null });
    const p = perProblem.get(s.problemId)!;
    if (p.solvedAt !== null) continue;
    if (s.verdict === "ACCEPTED") p.solvedAt = s.createdAt.getTime();
    else p.tries++;
  }

  let solved = 0;
  let penalty = 0;
  for (const p of perProblem.values()) {
    if (p.solvedAt !== null) {
      solved++;
      penalty += Math.floor((p.solvedAt - startMs) / 60_000) + p.tries * 20;
    }
  }
  return { solved, penalty };
}

export function startVerdictSubscriber(): void {
  const u = new URL(env.REDIS_URL);
  const sub = new IORedis({ host: u.hostname, port: Number(u.port) || 6379 });

  sub.subscribe("arena:verdicts", "arena:runs", (err) => {
    if (err) console.error("verdict sub failed", err);
    else console.log("verdict subscriber ready");
  });

  sub.on("message", async (ch: string, msg: string) => {
    try {
      // Run results (test-against-samples) just fan straight out to the client.
      if (ch === "arena:runs") {
        const { runId, result } = JSON.parse(msg);
        broadcast({ type: "run_result", runId, result });
        return;
      }

      const { submissionId, result } = JSON.parse(msg) as VerdictMsg;

      broadcast({ type: "verdict", submissionId, result });

      if (result.verdict !== "ACCEPTED") return;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { userId: true, contestId: true, matchId: true, rated: true },
      });

      if (submission?.matchId) {
        await onMatchAccepted(submission.matchId);
        return;
      }

      if (!submission?.contestId || !submission.rated) return;

      const { solved, penalty } = await computeStanding(submission.userId, submission.contestId);
      await recordAccepted(submission.contestId, submission.userId, solved, penalty);

      const contest = await prisma.contest.findUnique({ where: { id: submission.contestId } });
      if (!contest) return;
      const frozen = isFrozen(contest);
      if (frozen) await ensureFreezeSnapshot(submission.contestId);
      const rows = await getLeaderboard(submission.contestId, contest.scoring as ScoringModel, frozen);
      broadcast({ type: "leaderboard", contestId: submission.contestId, frozen, rows });
    } catch (err) {
      console.error("verdict handler error", err);
    }
  });
}
