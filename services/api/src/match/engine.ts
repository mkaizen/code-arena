import { prisma } from "../db.js";
import { broadcast } from "../ws.js";
import { recomputeRatings } from "../rating/elo.js";
import type { MatchMode, MatchPlayerView, MatchProblemView, MatchStateView } from "@arena/shared";

/**
 * Per-mode rules. ROYALE: 6 players, ascending ladder, miss a round's timer
 * and you're eliminated. DUEL: 1v1 best-of-3 — the first accepted submission
 * takes the round (ending it immediately); most round wins takes the match.
 */
export const MODE_CONFIG: Record<MatchMode, { capacity: number; roundDurationSec: number; rounds: number }> = {
  ROYALE: { capacity: 6, roundDurationSec: 300, rounds: 6 },
  DUEL: { capacity: 2, roundDurationSec: 600, rounds: 3 },
};

// A player with no heartbeat for this long is treated as having abandoned the
// match and is forfeited. Seeded at match start, refreshed by the client while
// the match page is open (see recordHeartbeat).
const FORFEIT_GRACE_MS = 30_000;

// Per-match scheduled round-timeout timer and a serialization lock so a
// timer firing can never race a concurrent AC-driven advance (both paths
// funnel through the transition functions under the same lock).
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

/** Pick the problem ladder for a new match of the given mode. */
async function pickProblems(mode: MatchMode): Promise<{ id: string }[]> {
  const want = MODE_CONFIG[mode].rounds;
  if (mode === "ROYALE") {
    // Deterministic ascending ladder of the easiest problems.
    return prisma.problem.findMany({ orderBy: { ratingValue: "asc" }, take: want, select: { id: true } });
  }
  // DUEL: random sample for variety, then ordered easiest → hardest.
  const all = await prisma.problem.findMany({ select: { id: true, ratingValue: true } });
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all
    .slice(0, want)
    .sort((a, b) => a.ratingValue - b.ratingValue)
    .map((p) => ({ id: p.id }));
}

async function broadcastQueueCount(mode: MatchMode): Promise<void> {
  const count = await prisma.matchQueueEntry.count({ where: { mode } });
  broadcast({ type: "queue_update", mode, count, capacity: MODE_CONFIG[mode].capacity });
}

export async function joinQueue(
  userId: string,
  mode: MatchMode,
): Promise<{ matched: true; matchId: string } | { matched: false; count: number; capacity: number }> {
  const cfg = MODE_CONFIG[mode];

  // Already mid-match (e.g. a duplicate click / reconnect) — send them back in.
  const live = await prisma.matchPlayer.findFirst({
    where: { userId, match: { status: "ACTIVE" } },
    select: { matchId: true },
  });
  if (live) return { matched: true, matchId: live.matchId };

  // One queue at a time: switching modes moves the entry.
  await prisma.matchQueueEntry.upsert({
    where: { userId },
    create: { userId, mode },
    update: { mode, queuedAt: new Date() },
  });

  const waiting = await prisma.matchQueueEntry.findMany({ where: { mode }, orderBy: { queuedAt: "asc" } });
  if (waiting.length < cfg.capacity) {
    broadcast({ type: "queue_update", mode, count: waiting.length, capacity: cfg.capacity });
    return { matched: false, count: waiting.length, capacity: cfg.capacity };
  }

  const chosenIds = waiting.slice(0, cfg.capacity).map((c) => c.userId);
  const problems = await pickProblems(mode);
  if (problems.length < 2) {
    // Not enough problems seeded to run a real match — leave the queue as-is.
    throw new Error("not enough problems available to start a match");
  }

  const match = await prisma.$transaction(async (tx) => {
    await tx.matchQueueEntry.deleteMany({ where: { userId: { in: chosenIds } } });
    return tx.match.create({
      data: {
        mode,
        roundDurationSec: cfg.roundDurationSec,
        // Seed lastSeenAt so players get a full grace window to open the page
        // before the forfeit sweep can consider them absent.
        players: { create: chosenIds.map((id) => ({ userId: id, lastSeenAt: new Date() })) },
        problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
      },
    });
  });

  broadcast({ type: "match_found", matchId: match.id, playerIds: chosenIds });
  await broadcastQueueCount(mode);

  await withLock(match.id, () => _beginRound(match.id, 0));
  return { matched: true, matchId: match.id };
}

export async function leaveQueue(userId: string): Promise<void> {
  const entry = await prisma.matchQueueEntry.findUnique({ where: { userId } });
  await prisma.matchQueueEntry.deleteMany({ where: { userId } });
  if (entry) await broadcastQueueCount(entry.mode as MatchMode);
}

export async function queueStatus(userId: string): Promise<{
  queuedMode: MatchMode | null;
  counts: Record<MatchMode, number>;
  capacities: Record<MatchMode, number>;
}> {
  const [mine, royale, duel] = await Promise.all([
    prisma.matchQueueEntry.findUnique({ where: { userId } }),
    prisma.matchQueueEntry.count({ where: { mode: "ROYALE" } }),
    prisma.matchQueueEntry.count({ where: { mode: "DUEL" } }),
  ]);
  return {
    queuedMode: (mine?.mode as MatchMode) ?? null,
    counts: { ROYALE: royale, DUEL: duel },
    capacities: { ROYALE: MODE_CONFIG.ROYALE.capacity, DUEL: MODE_CONFIG.DUEL.capacity },
  };
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

/** DUEL: earliest accepted submitter this round, or null if nobody has solved it. */
async function earliestSolver(matchId: string, round: number, roundStartedAt: Date): Promise<string | null> {
  const mp = await prisma.matchProblem.findUnique({ where: { matchId_round: { matchId, round } } });
  if (!mp) return null;
  const first = await prisma.submission.findFirst({
    where: { matchId, problemId: mp.problemId, verdict: "ACCEPTED", createdAt: { gte: roundStartedAt } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return first?.userId ?? null;
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
      roundWins: p.roundWins,
      forfeited: p.forfeited,
      placement: p.placement,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingAfter,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "ALIVE" ? -1 : 1;
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      if (a.roundWins !== b.roundWins) return b.roundWins - a.roundWins;
      return a.handle.localeCompare(b.handle);
    });

  return {
    id: match.id,
    mode: match.mode as MatchMode,
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

/**
 * Rate a finished match: turn final placements into Elo deltas (reusing the
 * contest recompute) and persist them on both the player rows and User.rating.
 * Placement ties share a rank, so a duel draw is a no-op wash — as it should be.
 */
async function _applyMatchRatings(matchId: string): Promise<void> {
  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    include: { user: { select: { rating: true } } },
  });
  const participants = players
    .filter((p) => p.placement != null)
    .map((p) => ({ userId: p.userId, rating: p.user.rating, rank: p.placement! }));
  if (participants.length < 2) return;

  const deltas = recomputeRatings(participants);
  await prisma.$transaction([
    ...deltas.map((d) =>
      prisma.matchPlayer.update({
        where: { matchId_userId: { matchId, userId: d.userId } },
        data: { ratingBefore: d.before, ratingAfter: d.after },
      }),
    ),
    ...deltas.map((d) => prisma.user.update({ where: { id: d.userId }, data: { rating: d.after } })),
  ]);
}

/** Shared finish tail: rate, push final state, then release in-memory state. */
async function _settleFinished(matchId: string): Promise<void> {
  await _applyMatchRatings(matchId);
  await broadcastMatchState(matchId);
  forgetMatchSoon(matchId);
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

  await _settleFinished(matchId);
}

/** DUEL: rank by round wins — every player on the top score shares placement 1 (a draw). */
async function _finishDuel(matchId: string): Promise<void> {
  clearMatchTimer(matchId);
  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", endedAt: new Date() } });

  const players = await prisma.matchPlayer.findMany({ where: { matchId }, orderBy: { roundWins: "desc" } });
  let placement = 1;
  for (let i = 0; i < players.length; i++) {
    if (i > 0 && players[i].roundWins < players[i - 1].roundWins) placement = i + 1;
    await prisma.matchPlayer.update({
      where: { matchId_userId: { matchId, userId: players[i].userId } },
      data: { placement },
    });
  }

  await _settleFinished(matchId);
}

/**
 * DUEL round resolution. The round ends the moment someone solves the problem
 * (first AC takes it) or when the timer expires (drawn round, no point).
 * The match ends early once a player has clinched a majority of the rounds.
 */
async function _transitionDuelRound(matchId: string, opts: { force: boolean }): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "ACTIVE") return;

  const winnerId = await earliestSolver(matchId, match.round, match.roundStartedAt);

  // AC-driven check that raced a rejudge/rollback and found no solver: the
  // round isn't over — refresh views and let the timer keep running.
  if (!opts.force && !winnerId) {
    await broadcastMatchState(matchId);
    return;
  }

  clearMatchTimer(matchId);

  let wins = 0;
  if (winnerId) {
    const updated = await prisma.matchPlayer.update({
      where: { matchId_userId: { matchId, userId: winnerId } },
      data: { roundWins: { increment: 1 } },
    });
    wins = updated.roundWins;
  }

  const totalRounds = await prisma.matchProblem.count({ where: { matchId } });
  const winsToClinch = Math.floor(totalRounds / 2) + 1;
  const isLastRound = match.round + 1 >= totalRounds;

  if (wins >= winsToClinch || isLastRound) {
    await _finishDuel(matchId);
  } else {
    await _beginRound(matchId, match.round + 1);
  }
}

/** ROYALE round resolution: timer-based elimination of everyone unsolved. */
async function _transitionRound(matchId: string, opts: { force: boolean }): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "ACTIVE") return;

  if (match.mode === "DUEL") return _transitionDuelRound(matchId, opts);

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

/** The match page pings this while open so the player isn't judged absent. */
export async function recordHeartbeat(matchId: string, userId: string): Promise<void> {
  await prisma.matchPlayer.updateMany({
    where: { matchId, userId },
    data: { lastSeenAt: new Date() },
  });
}

/** Forfeit still-in players whose heartbeat has gone stale (they left). */
async function _forfeitStale(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "ACTIVE") return;

  const cutoff = Date.now() - FORFEIT_GRACE_MS;
  const alive = await prisma.matchPlayer.findMany({ where: { matchId, status: "ALIVE" } });
  const stale = alive.filter((p) => (p.lastSeenAt?.getTime() ?? 0) < cutoff);
  if (stale.length === 0) return;

  const staleIds = stale.map((p) => p.userId);
  await prisma.matchPlayer.updateMany({
    where: { matchId, userId: { in: staleIds } },
    data: { status: "ELIMINATED", forfeited: true, eliminatedRound: match.round },
  });
  const survivors = alive.filter((p) => !staleIds.includes(p.userId));

  if (match.mode === "DUEL") {
    // A forfeit hands the win to whoever's still here, regardless of round score.
    clearMatchTimer(matchId);
    await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", endedAt: new Date() } });
    if (survivors.length === 1) {
      await prisma.matchPlayer.update({
        where: { matchId_userId: { matchId, userId: survivors[0].userId } },
        data: { placement: 1 },
      });
      await prisma.matchPlayer.updateMany({ where: { matchId, userId: { in: staleIds } }, data: { placement: 2 } });
    } else {
      // Both gone — rank by whatever round wins stand.
      const all = await prisma.matchPlayer.findMany({ where: { matchId }, orderBy: { roundWins: "desc" } });
      let placement = 1;
      for (let i = 0; i < all.length; i++) {
        if (i > 0 && all[i].roundWins < all[i - 1].roundWins) placement = i + 1;
        await prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId: all[i].userId } }, data: { placement } });
      }
    }
    await _settleFinished(matchId);
    return;
  }

  // ROYALE: a forfeit is just an elimination. End if it thins the field to one.
  if (survivors.length <= 1) {
    await _finishMatch(matchId, survivors.map((p) => p.userId));
  } else {
    await broadcastMatchState(matchId);
  }
}

/** Periodic: forfeit absent players across all active matches. */
export async function sweepForfeits(): Promise<void> {
  const active = await prisma.match.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const m of active) {
    await withLock(m.id, () => _forfeitStale(m.id));
  }
}
