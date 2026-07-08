import { prisma } from "../db.js";
import type {
  Difficulty,
  MatchMode,
  MatchReplay,
  ReplayEvent,
  ReplayPlayer,
  ReplayRound,
  ReplayRoundEntry,
} from "@arena/shared";

/**
 * Reconstructs a finished match as a post-match "game review": the round ladder,
 * each player's outcome, and a chronological submission feed — all derived from
 * the Submission timestamps we already store. Returns null for a missing or
 * still-active match (in-progress state stays private to its players over the WS).
 */
export async function getMatchReplay(matchId: string): Promise<MatchReplay | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: { select: { handle: true, rating: true } } } } },
  });
  if (!match || match.status !== "FINISHED") return null;

  const [problems, submissions] = await Promise.all([
    prisma.matchProblem.findMany({
      where: { matchId },
      orderBy: { round: "asc" },
      include: { problem: { select: { slug: true, title: true, difficulty: true, ratingValue: true } } },
    }),
    prisma.submission.findMany({
      where: { matchId },
      orderBy: { createdAt: "asc" },
      select: { userId: true, problemId: true, verdict: true, createdAt: true },
    }),
  ]);

  const startMs = match.createdAt.getTime();
  const handleOf = new Map(match.players.map((p) => [p.userId, p.user.handle]));
  const roundOfProblem = new Map(problems.map((mp) => [mp.problemId, mp.round]));

  // Chronological feed of every submission.
  const timeline: ReplayEvent[] = submissions.map((s) => ({
    atMs: s.createdAt.getTime() - startMs,
    userId: s.userId,
    handle: handleOf.get(s.userId) ?? "unknown",
    round: roundOfProblem.get(s.problemId) ?? 0,
    verdict: s.verdict,
    accepted: s.verdict === "ACCEPTED",
  }));

  // Per-round, per-player breakdown.
  const rounds: ReplayRound[] = problems.map((mp) => {
    const roundSubs = submissions.filter((s) => s.problemId === mp.problemId);
    const byUser = new Map<string, { attempts: number; solvedAtMs: number | null }>();
    for (const s of roundSubs) {
      const cur = byUser.get(s.userId) ?? { attempts: 0, solvedAtMs: null };
      cur.attempts += 1;
      if (s.verdict === "ACCEPTED" && cur.solvedAtMs === null) {
        cur.solvedAtMs = s.createdAt.getTime() - startMs;
      }
      byUser.set(s.userId, cur);
    }

    // Earliest accepted solve is the round's first solver.
    let firstSolverId: string | null = null;
    let firstMs = Infinity;
    for (const [userId, v] of byUser) {
      if (v.solvedAtMs !== null && v.solvedAtMs < firstMs) { firstMs = v.solvedAtMs; firstSolverId = userId; }
    }

    const entries: ReplayRoundEntry[] = [...byUser.entries()]
      .map(([userId, v]) => ({
        userId,
        handle: handleOf.get(userId) ?? "unknown",
        attempts: v.attempts,
        solved: v.solvedAtMs !== null,
        solvedAtMs: v.solvedAtMs,
        firstSolver: userId === firstSolverId,
      }))
      .sort((a, b) => {
        if (a.solved !== b.solved) return a.solved ? -1 : 1;
        if (a.solved && b.solved) return (a.solvedAtMs ?? 0) - (b.solvedAtMs ?? 0);
        return b.attempts - a.attempts;
      });

    return {
      round: mp.round,
      problem: {
        slug: mp.problem.slug,
        title: mp.problem.title,
        difficulty: mp.problem.difficulty as Difficulty,
        ratingValue: mp.problem.ratingValue,
      },
      entries,
    };
  });

  const players: ReplayPlayer[] = match.players
    .map((p) => ({
      userId: p.userId,
      handle: p.user.handle,
      rating: p.user.rating,
      placement: p.placement,
      roundWins: p.roundWins,
      eliminatedRound: p.eliminatedRound,
      forfeited: p.forfeited,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingAfter,
    }))
    .sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return b.roundWins - a.roundWins;
    });

  return {
    id: match.id,
    mode: match.mode as MatchMode,
    totalRounds: problems.length,
    startedAt: match.createdAt.toISOString(),
    endedAt: match.endedAt?.toISOString() ?? null,
    durationMs: match.endedAt ? match.endedAt.getTime() - startMs : null,
    players,
    rounds,
    timeline,
  };
}
