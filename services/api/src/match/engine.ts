import { prisma } from "../db.js";
import { broadcast } from "../ws.js";
import type { MatchPlayerView, MatchProblemView, MatchStateView } from "@arena/shared";

export const MATCH_CAPACITY = 6;
const ROUND_DURATION_SEC = 300; // 5 min per problem
const MAX_ROUNDS = 6;

// Per-match scheduled round-timeout timer and a serialization lock so a
// timer firing can never race a concurrent "everyone just solved it" advance
// (both paths funnel through transitionRound under the same lock).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(matchId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(matchId, next.then(() => {}, () => {}));
  return next;
}

function clearMatchTimer(matchId: string): void {
  const t = timers.get(matchId);
  if (t) {
    clearTimeout(t);
    timers.delete(matchId);
  }
}

function forgetMatchSoon(matchId: string): void {
  setTimeout(() => {
    timers.delete(matchId);
    locks.delete(matchId);
  }, 60_000).unref?.();
}

export async function joinQueue(
  userId: string,
): Promise<{ matched: true; matchId: string } | { matched: false; count: number; capacity: number }> {
  // Already mid-match (e.g. a duplicate click / reconnect) — send them back in.
  const live = await prisma.matchPlayer.findFirst({
    where: { userId, match: { status: "ACTIVE" } },
    select: { matchId: true },
  });
  if (live) return { matched: true, matchId: live.matchId };

  await prisma.matchQueueEntry.upsert({ where: { userId }, create: { userId }, update: {} });

  const waiting = await prisma.matchQueueEntry.findMany({ orderBy: { queuedAt: "asc" } });
  if (waiting.length < MATCH_CAPACITY) {
    broadcast({ type: "queue_update", count: waiting.length, capacity: MATCH_CAPACITY });
    return { matched: false, count: waiting.length, capacity: MATCH_CAPACITY };
  }

  const chosenIds = waiting.slice(0, MATCH_CAPACITY).map((c) => c.userId);
  const problems = await prisma.problem.findMany({
    orderBy: { ratingValue: "asc" },
    take: MAX_ROUNDS,
    select: { id: true },
  });
  if (problems.length < 2) {
    // Not enough problems seeded to run a real match — leave the queue as-is.
    throw new Error("not enough problems available to start a match");
  }

  const match = await prisma.$transaction(async (tx) => {
    await tx.matchQueueEntry.deleteMany({ where: { userId: { in: chosenIds } } });
    return tx.match.create({
      data: {
        roundDurationSec: ROUND_DURATION_SEC,
        players: { create: chosenIds.map((id) => ({ userId: id })) },
        problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
      },
    });
  });

  broadcast({ type: "match_found", matchId: match.id, playerIds: chosenIds });

  const remaining = await prisma.matchQueueEntry.count();
  broadcast({ type: "queue_update", count: remaining, capacity: MATCH_CAPACITY });

  await withLock(match.id, () => _beginRound(match.id, 0));
  return { matched: true, matchId: match.id };
}

export async function leaveQueue(userId: string): Promise<void> {
  await prisma.matchQueueEntry.deleteMany({ where: { userId } });
  const count = await prisma.matchQueueEntry.count();
  broadcast({ type: "queue_update", count, capacity: MATCH_CAPACITY });
}

export async function queueStatus(userId: string): Promise<{ queued: boolean; count: number; capacity: number }> {
  const [count, mine] = await Promise.all([
    prisma.matchQueueEntry.count(),
    prisma.matchQueueEntry.findUnique({ where: { userId } }),
  ]);
  return { queued: !!mine, count, capacity: MATCH_CAPACITY };
}

async function loadProblemForRound(matchId: string, round: number): Promise<MatchProblemView | null> {
  const mp = await prisma.matchProblem.findUnique({
    where: { matchId_round: { matchId, round } },
    include: { problem: { select: { id: true, slug: true, title: true, difficulty: true, ratingValue: true } } },
  });
  if (!mp) return null;
  return { ...mp.problem, difficulty: mp.problem.difficulty as MatchProblemView["difficulty"] };
}

/** Users with an accepted submission for the current round, since it started. */
async function solvedCurrentRoundSet(matchId: string, round: number, roundStartedAt: Date): Promise<Set<string>> {
  const mp = await prisma.matchProblem.findUnique({ where: { matchId_round: { matchId, round } } });
  if (!mp) return new Set();
  const acSubs = await prisma.submission.findMany({
    where: { matchId, problemId: mp.problemId, verdict: "ACCEPTED", createdAt: { gte: roundStartedAt } },
    select: { userId: true },
  });
  return new Set(acSubs.map((s) => s.userId));
}

export async function getMatchState(matchId: string): Promise<MatchStateView | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: { select: { handle: true, rating: true } } } } },
  });
  if (!match) return null;

  const totalRounds = await prisma.matchProblem.count({ where: { matchId } });
  const isActive = match.status === "ACTIVE";
  const [problem, solved] = await Promise.all([
    isActive ? loadProblemForRound(matchId, match.round) : Promise.resolve(null),
    isActive ? solvedCurrentRoundSet(matchId, match.round, match.roundStartedAt) : Promise.resolve(new Set<string>()),
  ]);

  const players: MatchPlayerView[] = match.players
    .map((p) => ({
      userId: p.userId,
      handle: p.user.handle,
      rating: p.user.rating,
      status: p.status as MatchPlayerView["status"],
      solvedCurrentRound: solved.has(p.userId),
      eliminatedRound: p.eliminatedRound,
      placement: p.placement,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "ALIVE" ? -1 : 1;
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return a.handle.localeCompare(b.handle);
    });

  return {
    id: match.id,
    status: match.status as MatchStateView["status"],
    round: match.round,
    totalRounds,
    roundEndsAt: isActive ? new Date(match.roundStartedAt.getTime() + match.roundDurationSec * 1000).toISOString() : null,
    problem,
    players,
  };
}

async function broadcastMatchState(matchId: string): Promise<void> {
  const state = await getMatchState(matchId);
  if (state) broadcast({ type: "match_state", match: state });
}

// ── Internal, lock-free transitions (callers must already hold the lock) ────

async function _beginRound(matchId: string, round: number): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "ACTIVE") return;

  await prisma.match.update({ where: { id: matchId }, data: { round, roundStartedAt: new Date() } });
  await broadcastMatchState(matchId);

  const timer = setTimeout(() => {
    onRoundTimeout(matchId).catch((err) => console.error("match round timeout error", err));
  }, match.roundDurationSec * 1000);
  timer.unref?.();
  timers.set(matchId, timer);
}

async function _finishMatch(matchId: string, winnerIds: string[]): Promise<void> {
  clearMatchTimer(matchId);
  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", endedAt: new Date() } });

  if (winnerIds.length > 0) {
    await prisma.matchPlayer.updateMany({ where: { matchId, userId: { in: winnerIds } }, data: { placement: 1 } });
  }

  // Standard competition ranking: later elimination = better placement, ties share a rank.
  const eliminated = await prisma.matchPlayer.findMany({ where: { matchId, userId: { notIn: winnerIds } } });
  const byRound = new Map<number, string[]>();
  for (const p of eliminated) {
    const r = p.eliminatedRound ?? -1;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(p.userId);
  }
  let placement = winnerIds.length + 1;
  for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
    const ids = byRound.get(round)!;
    await prisma.matchPlayer.updateMany({ where: { matchId, userId: { in: ids } }, data: { placement } });
    placement += ids.length;
  }

  await broadcastMatchState(matchId);
  forgetMatchSoon(matchId);
}

async function _transitionRound(matchId: string, opts: { force: boolean }): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "ACTIVE") return;

  const alive = await prisma.matchPlayer.findMany({ where: { matchId, status: "ALIVE" } });
  if (alive.length === 0) return; // defensive — shouldn't happen

  const solved = await solvedCurrentRoundSet(matchId, match.round, match.roundStartedAt);
  const allSolved = alive.every((p) => solved.has(p.userId));

  // Not forced (a post-AC check) and the round isn't over yet — just refresh
  // everyone's view of who's solved so far; the timer keeps running.
  if (!opts.force && !allSolved) {
    await broadcastMatchState(matchId);
    return;
  }

  clearMatchTimer(matchId);

  const survivors = alive.filter((p) => solved.has(p.userId));
  const failed = alive.filter((p) => !solved.has(p.userId));
  // A "wipe": nobody currently alive solved it. Eliminate no one rather than
  // ending the match with zero winners — give the field another round.
  const wipe = survivors.length === 0;

  if (!wipe && failed.length > 0) {
    await prisma.matchPlayer.updateMany({
      where: { matchId, userId: { in: failed.map((p) => p.userId) } },
      data: { status: "ELIMINATED", eliminatedRound: match.round },
    });
  }

  const remainingAlive = wipe ? alive : survivors;
  const totalRounds = await prisma.matchProblem.count({ where: { matchId } });
  const isLastRound = match.round + 1 >= totalRounds;

  if (remainingAlive.length <= 1 || isLastRound) {
    await _finishMatch(matchId, remainingAlive.map((p) => p.userId));
  } else {
    await _beginRound(matchId, match.round + 1);
  }
}

// ── Public entry points (each acquires the per-match lock once) ────────────

/** Call after a submission tied to a match resolves ACCEPTED. */
export async function onAccepted(matchId: string): Promise<void> {
  await withLock(matchId, () => _transitionRound(matchId, { force: false }));
}

async function onRoundTimeout(matchId: string): Promise<void> {
  await withLock(matchId, () => _transitionRound(matchId, { force: true }));
}

/**
 * Self-healing sweep in case a setTimeout was lost (process restart). Cheap
 * to run frequently — only ACTIVE matches past their deadline do any work.
 */
export async function sweepOverdueMatches(): Promise<void> {
  const active = await prisma.match.findMany({ where: { status: "ACTIVE" } });
  const now = Date.now();
  for (const m of active) {
    const deadline = m.roundStartedAt.getTime() + m.roundDurationSec * 1000;
    if (now >= deadline + 2000) {
      await onRoundTimeout(m.id);
    }
  }
}
