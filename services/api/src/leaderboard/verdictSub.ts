import IORedis from "ioredis";
import { env } from "../env.js";
import { redis } from "../redis.js";
import { broadcast, sendToUser } from "../ws.js";
import { prisma } from "../db.js";
import { recordAccepted, getLeaderboard, isFrozen, ensureFreezeSnapshot } from "./freeze.js";
import { scoreStanding } from "./scoring.js";
import { onAccepted as onMatchAccepted, recordMatchSubmission } from "../match/engine.js";
import { recordDailySolve } from "../daily.js";
import type { JudgeResult, ScoringModel } from "@arena/shared";

interface VerdictMsg {
  submissionId: string;
  result: JudgeResult;
}

/**
 * Redis pub/sub delivers each judge message to EVERY subscribed api replica.
 * The DB side-effects here (rating standings, match resolution, daily streaks)
 * and the resulting WS publish must happen exactly once, so the first node to
 * claim a message processes it and the rest bail. TTL is a safety net: if the
 * claimant crashes mid-handler the key expires and a later retry can re-run.
 */
async function claim(key: string, ttlSec = 120): Promise<boolean> {
  const res = await redis.set(key, "1", "EX", ttlSec, "NX");
  return res === "OK";
}

async function computeStanding(userId: string, contestId: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return { solved: 0, penalty: 0 };

  const subs = await prisma.submission.findMany({
    where: { userId, contestId },
    orderBy: { createdAt: "asc" },
    select: { problemId: true, verdict: true, createdAt: true },
  });

  return scoreStanding(subs, contest.startsAt.getTime());
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
      // Run results (test-against-samples) go only to the user who ran them.
      if (ch === "arena:runs") {
        const { runId, userId, result } = JSON.parse(msg);
        if (userId && (await claim(`arena:run-done:${runId}`))) {
          sendToUser(userId, { type: "run_result", runId, result });
        }
        return;
      }

      const { submissionId, result } = JSON.parse(msg) as VerdictMsg;
      // One node owns each verdict's side-effects + fan-out; the others no-op.
      if (!(await claim(`arena:verdict-done:${submissionId}`))) return;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { userId: true, contestId: true, matchId: true, rated: true, problemId: true, createdAt: true },
      });

      // A verdict is private to its author — never fan it out to everyone.
      if (submission) sendToUser(submission.userId, { type: "verdict", submissionId, result });

      // The live match feed shows every submission (win or miss) to the whole
      // lobby — the verdict only, never the code.
      if (submission?.matchId) {
        await recordMatchSubmission(submission.matchId, submission.userId, result.verdict);
      }

      if (result.verdict !== "ACCEPTED") return;

      if (submission?.matchId) {
        await onMatchAccepted(submission.matchId);
        return;
      }

      // Daily-challenge streaks are earned on free practice solves (no contest,
      // no match). recordDailySolve no-ops unless it's actually today's problem.
      if (submission && !submission.contestId) {
        await recordDailySolve(submission.userId, submission.problemId, submission.createdAt);
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
