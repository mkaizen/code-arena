import { prisma } from "../db.js";
import { redis } from "../redis.js";
import type { LeaderboardRow, ScoringModel } from "@arena/shared";

/**
 * Live leaderboard with freeze enforcement (FR-12, FR-19).
 *
 * Redis holds a sorted set per contest for O(log n) ranking. When a contest is
 * inside its freeze window, the *public* board stops reflecting new accepted
 * submissions: we serve the snapshot captured at freeze time instead.
 */

export function isFrozen(contest: { startsAt: Date; durationSec: number; freezeSec: number }, now = new Date()): boolean {
  const endMs = contest.startsAt.getTime() + contest.durationSec * 1000;
  const freezeStartMs = endMs - contest.freezeSec * 1000;
  const t = now.getTime();
  return t >= freezeStartMs && t < endMs;
}

const liveKey = (contestId: string) => `lb:${contestId}:live`;
const frozenKey = (contestId: string) => `lb:${contestId}:frozen`;

/** Capture the public snapshot exactly once, when the freeze window opens. */
export async function ensureFreezeSnapshot(contestId: string): Promise<void> {
  const exists = await redis.exists(frozenKey(contestId));
  if (!exists) {
    const dump = await redis.zrange(liveKey(contestId), 0, -1, "WITHSCORES");
    if (dump.length) await redis.zadd(frozenKey(contestId), ...dump);
  }
}

/**
 * Score packing: we want fewer-solved to rank lower and higher penalty to rank
 * lower. Encode as solved * 1e7 - penalty so a single sorted-set score orders both.
 */
export function packScore(solved: number, penalty: number): number {
  return solved * 1e7 - penalty;
}

export async function recordAccepted(
  contestId: string,
  userId: string,
  solved: number,
  penalty: number,
): Promise<void> {
  await redis.zadd(liveKey(contestId), packScore(solved, penalty), userId);
}

export async function getLeaderboard(
  contestId: string,
  scoring: ScoringModel,
  frozen: boolean,
): Promise<LeaderboardRow[]> {
  const key = frozen ? frozenKey(contestId) : liveKey(contestId);
  const ranked = await redis.zrevrange(key, 0, -1, "WITHSCORES");

  const userIds = ranked.filter((_, i) => i % 2 === 0);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: LeaderboardRow[] = [];
  for (let i = 0; i < ranked.length; i += 2) {
    const userId = ranked[i];
    const score = Number(ranked[i + 1]);
    const solved = Math.round(score / 1e7);
    const penalty = solved * 1e7 - score;
    const u = byId.get(userId);
    rows.push({
      rank: rows.length + 1,
      userId,
      handle: u?.handle ?? userId,
      rating: u?.rating ?? 1500,
      solved,
      penalty,
      perProblem: {}, // hydrated by the route from submissions when detail is requested
    });
  }
  return rows;
}
