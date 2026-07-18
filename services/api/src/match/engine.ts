import { prisma } from "../db.js";
import { broadcast, sendToUsers, sendToSpectators } from "../ws.js";
import { recomputeRatings } from "../rating/elo.js";
import { winsToClinch, placementsByElimination, placementsByScore, humanRatingRanks } from "./rules.js";
import { pickLadder } from "./ladder.js";
import { isRecruiter } from "../referrals.js";
import { botRoundPlan, personaFor, pickOpponents, BOT_ROSTER, botEmail } from "./bots.js";
import { EFFORT, isAiDifficulty, type AiDifficulty, type AiFeedback, type AiProblem } from "../ai/opponent.js";
import { generateSolution, houseModel, modelByKey, aiModels } from "../ai/provider.js";
import type { AiModel } from "../ai/models.js";
import { env } from "../env.js";
import { judgeQueue } from "../queue.js";
import { sanitizeReaction } from "@arena/shared";
import type { MatchMode, MatchPlayerView, MatchProblemView, MatchStateView, MatchReactionEmoji, LiveMatchSummary } from "@arena/shared";

/**
 * Per-mode rules. ROYALE (6) and QUADS (4) are elimination ladders: miss a
 * round's timer and you're out, last one standing wins — same engine, different
 * lobby size. DUEL: 1v1 best-of-3 — the first accepted submission takes the
 * round (ending it immediately); most round wins takes the match.
 */
export const MODE_CONFIG: Record<
  MatchMode,
  { capacity: number; roundDurationSec: number; rounds: number; fillTimeoutSec: number }
> = {
  // fillTimeoutSec: how long a partial queue waits for more humans before
  // rating-matched bots backfill the empty seats so a match always starts.
  ROYALE: { capacity: 6, roundDurationSec: 300, rounds: 6, fillTimeoutSec: 45 },
  QUADS: { capacity: 4, roundDurationSec: 300, rounds: 4, fillTimeoutSec: 35 },
  DUEL: { capacity: 2, roundDurationSec: 600, rounds: 3, fillTimeoutSec: 20 },
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
// Practice matches schedule each bot's think/submit/solve actions as timers;
// they're tracked per match so a round change or finish can cancel the ones
// that haven't fired yet (a bot must never "solve" a round that already moved on).
const botTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
// Per-mode "fill" timer: once a queue is partially full, this fires at the
// oldest waiter's deadline and backfills the empty seats with bots so a match
// always starts. A DB-backed sweep (sweepStaleQueues) is the restart-safe
// fallback if the process dies with a timer pending.
const queueFillTimers = new Map<MatchMode, ReturnType<typeof setTimeout>>();

function clearBotTimers(matchId: string): void {
  for (const t of botTimers.get(matchId) ?? []) clearTimeout(t);
  botTimers.delete(matchId);
}

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
  // Round transitions cancel any of this round's bot actions that haven't
  // fired; the next round schedules its own (botSubmit also re-checks the round).
  clearBotTimers(matchId);
}

function forgetMatchSoon(matchId: string): void {
  clearBotTimers(matchId);
  setTimeout(() => {
    timers.delete(matchId);
    locks.delete(matchId);
  }, 60_000).unref?.();
}

// How many of a player's most recent matches to avoid repeating problems from.
const RECENT_MATCH_WINDOW = 4;

/** Problems these users saw across their last few matches — avoided when possible. */
async function recentlySeenProblemIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const recent = await prisma.match.findMany({
    where: { players: { some: { userId: { in: userIds } } } },
    orderBy: { createdAt: "desc" },
    take: RECENT_MATCH_WINDOW,
    select: { problems: { select: { problemId: true } } },
  });
  return new Set(recent.flatMap((m) => m.problems.map((p) => p.problemId)));
}

/**
 * Pick the problem ladder for a new match: a randomized, ascending-difficulty
 * set (see pickLadder) that avoids problems the players have recently seen — so
 * no two matches feel the same and Royale can't be won by pre-writing the same
 * six solutions. Falls back to the whole bank if avoiding repeats would leave
 * too few problems to build a full ladder.
 */
async function pickProblems(mode: MatchMode, avoidForUserIds: string[] = [], count?: number): Promise<{ id: string }[]> {
  const want = count ?? MODE_CONFIG[mode].rounds;
  const all = await prisma.problem.findMany({ select: { id: true, ratingValue: true } });

  const seen = await recentlySeenProblemIds(avoidForUserIds);
  const fresh = all.filter((p) => !seen.has(p.id));
  const pool = fresh.length > want ? fresh : all;

  return pickLadder(pool, want).map((id) => ({ id }));
}

/** Thrown (and swallowed) when a queue batch was partly claimed by a concurrent
 *  join/backfill, so the transaction rolls back instead of double-booking. */
class QueueClaimLost extends Error {}

/**
 * Atomically claim `claimIds` out of the queue and open a match with
 * `memberIds` (claimed humans, plus any backfill bots). The claim only
 * succeeds if every id was still queued — otherwise it rolls back and returns
 * null, leaving the survivors in the queue for the next attempt. This is what
 * keeps a fill timer firing at the same instant as a queue-filling join from
 * seating the same player in two matches.
 */
async function _claimAndOpenMatch(
  mode: MatchMode,
  claimIds: string[],
  memberIds: string[],
): Promise<string | null> {
  const cfg = MODE_CONFIG[mode];
  // Avoid repeating problems the queued humans have recently seen.
  const problems = await pickProblems(mode, claimIds);
  if (problems.length < 2) throw new Error("not enough problems available to start a match");
  const now = new Date();
  try {
    const match = await prisma.$transaction(async (tx) => {
      const del = await tx.matchQueueEntry.deleteMany({ where: { userId: { in: claimIds } } });
      if (del.count < claimIds.length) throw new QueueClaimLost();
      return tx.match.create({
        data: {
          mode,
          roundDurationSec: cfg.roundDurationSec,
          // Seed lastSeenAt so players get a full grace window to open the page
          // before the forfeit sweep can consider them absent.
          players: { create: memberIds.map((id) => ({ userId: id, lastSeenAt: now })) },
          problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
        },
      });
    });
    return match.id;
  } catch (err) {
    if (err instanceof QueueClaimLost) return null;
    throw err;
  }
}

/** When bots will backfill this mode's queue (oldest waiter + timeout), or null if empty. */
async function fillDeadlineFor(mode: MatchMode): Promise<Date | null> {
  const oldest = await prisma.matchQueueEntry.findFirst({ where: { mode }, orderBy: [{ queuedAt: "asc" }] });
  if (!oldest) return null;
  return new Date(oldest.queuedAt.getTime() + MODE_CONFIG[mode].fillTimeoutSec * 1000);
}

async function broadcastQueueCount(mode: MatchMode): Promise<void> {
  const count = await prisma.matchQueueEntry.count({ where: { mode } });
  const deadline = await fillDeadlineFor(mode);
  broadcast({ type: "queue_update", mode, count, capacity: MODE_CONFIG[mode].capacity, fillDeadline: deadline?.toISOString() ?? null });
}

function clearQueueFillTimer(mode: MatchMode): void {
  const t = queueFillTimers.get(mode);
  if (t) {
    clearTimeout(t);
    queueFillTimers.delete(mode);
  }
}

/**
 * (Re)arm the per-mode fill timer to fire at the current oldest waiter's
 * deadline. Idempotent — safe to call after any queue mutation; it re-anchors
 * to whoever is now oldest and clears itself when the queue drains.
 */
async function reconcileQueueFill(mode: MatchMode): Promise<void> {
  clearQueueFillTimer(mode);
  const deadline = await fillDeadlineFor(mode);
  if (!deadline) return;
  const delay = Math.max(0, deadline.getTime() - Date.now());
  const t = setTimeout(() => {
    runBackfill(mode).catch((err) => console.error("queue backfill error", err));
  }, delay);
  t.unref?.();
  queueFillTimers.set(mode, t);
}

/** Serialize backfills per mode so a timer and the sweep can't double-start. */
async function runBackfill(mode: MatchMode): Promise<void> {
  await withLock("queue:" + mode, () => _startBackfill(mode));
}

/**
 * Start a match for whoever's waiting, filling the empty seats with
 * rating-matched bots. Runs when a partial queue times out — so a player never
 * waits forever for a lobby that will never fill. Human placements are rated
 * among themselves at the end (bots are excluded), and a lone human plays an
 * effectively unrated match rather than being sat against a wall of bots.
 */
async function _startBackfill(mode: MatchMode): Promise<void> {
  clearQueueFillTimer(mode);
  const cfg = MODE_CONFIG[mode];
  const waiting = await prisma.matchQueueEntry.findMany({
    where: { mode },
    orderBy: [{ priority: "desc" }, { queuedAt: "asc" }],
  });
  if (waiting.length === 0) return;

  const humanIds = waiting.slice(0, cfg.capacity).map((c) => c.userId);

  const need = cfg.capacity - humanIds.length;
  let botIds: string[] = [];
  if (need > 0) {
    await ensureBotsProvisioned();
    const humans = await prisma.user.findMany({ where: { id: { in: humanIds } }, select: { rating: true } });
    const avg = Math.round(humans.reduce((s, h) => s + h.rating, 0) / Math.max(1, humans.length));
    const allBots = await prisma.user.findMany({ where: { isBot: true, botModel: null }, select: { id: true, rating: true } });
    botIds = pickOpponents(avg, allBots, need).map((b) => b.id);
  }

  const matchId = await _claimAndOpenMatch(mode, humanIds, [...humanIds, ...botIds]);
  if (!matchId) {
    // Someone left the queue or a join grabbed the batch first — try again for
    // whoever remains.
    await reconcileQueueFill(mode);
    return;
  }

  sendToUsers(humanIds, { type: "match_found", matchId, playerIds: humanIds });
  await broadcastQueueCount(mode);
  await reconcileQueueFill(mode); // re-arm for any waiters beyond this match's capacity
  await withLock(matchId, () => _beginRound(matchId, 0));
}

/**
 * Restart-safe fallback: if a fill timer was lost (process restart), start the
 * backfill for any queue whose oldest waiter is past the deadline. The small
 * grace keeps the precise in-memory timer as the normal path.
 */
export async function sweepStaleQueues(): Promise<void> {
  for (const mode of Object.keys(MODE_CONFIG) as MatchMode[]) {
    const oldest = await prisma.matchQueueEntry.findFirst({ where: { mode }, orderBy: [{ queuedAt: "asc" }] });
    if (!oldest) continue;
    const overdueBy = Date.now() - oldest.queuedAt.getTime() - MODE_CONFIG[mode].fillTimeoutSec * 1000;
    if (overdueBy >= 5000) await runBackfill(mode);
  }
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

  // Referral perk: Recruiter-badge holders (3+ successful invites) cut the
  // queue — snapshotted at join time so ordering never needs a join per poll.
  const priority = await isRecruiter(userId);

  // One queue at a time: switching modes moves the entry.
  await prisma.matchQueueEntry.upsert({
    where: { userId },
    create: { userId, mode, priority },
    update: { mode, priority, queuedAt: new Date() },
  });

  const waiting = await prisma.matchQueueEntry.findMany({
    where: { mode },
    orderBy: [{ priority: "desc" }, { queuedAt: "asc" }],
  });
  if (waiting.length < cfg.capacity) {
    // Not full yet — arm (or re-anchor) the bot-backfill timer so this doesn't
    // wait forever, and broadcast the count plus when the fill will fire.
    await reconcileQueueFill(mode);
    await broadcastQueueCount(mode);
    return { matched: false, count: waiting.length, capacity: cfg.capacity };
  }

  const chosenIds = waiting.slice(0, cfg.capacity).map((c) => c.userId);
  const matchId = await _claimAndOpenMatch(mode, chosenIds, chosenIds);
  if (!matchId) {
    // Lost the race for part of this batch — stay queued and let the next
    // join, the fill timer, or the sweep form the match.
    await reconcileQueueFill(mode);
    await broadcastQueueCount(mode);
    const count = await prisma.matchQueueEntry.count({ where: { mode } });
    return { matched: false, count, capacity: cfg.capacity };
  }

  sendToUsers(chosenIds, { type: "match_found", matchId, playerIds: chosenIds });
  await broadcastQueueCount(mode);
  await reconcileQueueFill(mode); // re-anchor (or clear) the fill timer for anyone still waiting

  await withLock(matchId, () => _beginRound(matchId, 0));
  return { matched: true, matchId };
}

export async function leaveQueue(userId: string): Promise<void> {
  const entry = await prisma.matchQueueEntry.findUnique({ where: { userId } });
  await prisma.matchQueueEntry.deleteMany({ where: { userId } });
  if (entry) {
    await broadcastQueueCount(entry.mode as MatchMode);
    await reconcileQueueFill(entry.mode as MatchMode); // re-anchor to the new oldest, or clear if empty
  }
}

export async function queueStatus(userId: string): Promise<{
  queuedMode: MatchMode | null;
  counts: Record<MatchMode, number>;
  capacities: Record<MatchMode, number>;
  fillDeadlines: Record<MatchMode, string | null>;
}> {
  const modes = Object.keys(MODE_CONFIG) as MatchMode[];
  const [mine, perMode] = await Promise.all([
    prisma.matchQueueEntry.findUnique({ where: { userId } }),
    Promise.all(
      modes.map(async (mode) => ({
        mode,
        count: await prisma.matchQueueEntry.count({ where: { mode } }),
        fill: await fillDeadlineFor(mode),
      })),
    ),
  ]);

  const counts = {} as Record<MatchMode, number>;
  const capacities = {} as Record<MatchMode, number>;
  const fillDeadlines = {} as Record<MatchMode, string | null>;
  for (const { mode, count, fill } of perMode) {
    counts[mode] = count;
    capacities[mode] = MODE_CONFIG[mode].capacity;
    fillDeadlines[mode] = fill?.toISOString() ?? null;
  }

  return { queuedMode: (mine?.mode as MatchMode) ?? null, counts, capacities, fillDeadlines };
}

/**
 * Ensure the bot roster exists in the DB. Lazily provisions it on first use so
 * practice matches work even if the seed script was never run against this
 * database. Idempotent and race-safe: skipDuplicates keys off the unique email.
 */
async function ensureBotsProvisioned(): Promise<void> {
  const have = await prisma.user.count({ where: { isBot: true, botModel: null } });
  if (have >= BOT_ROSTER.length) return;
  await prisma.user.createMany({
    data: BOT_ROSTER.map((b) => ({ handle: b.handle, email: botEmail(b.handle), isBot: true, rating: b.rating })),
    skipDuplicates: true,
  });
}

/**
 * Start an unrated practice match: the human against seeded bots picked to
 * bracket their rating. No queue, no waiting — it begins immediately, and the
 * bots play the rounds out on their own timers.
 */
export async function startPracticeMatch(
  userId: string,
  mode: MatchMode,
): Promise<{ matchId: string }> {
  // Already mid-match (duplicate click / reconnect) — send them back in.
  const live = await prisma.matchPlayer.findFirst({
    where: { userId, match: { status: "ACTIVE" } },
    select: { matchId: true },
  });
  if (live) return { matchId: live.matchId };

  const cfg = MODE_CONFIG[mode];
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { rating: true } });
  if (!me) throw new Error("user not found");

  await ensureBotsProvisioned();
  const allBots = await prisma.user.findMany({ where: { isBot: true, botModel: null }, select: { id: true, rating: true } });
  if (allBots.length === 0) throw new Error("no practice bots are available");
  const opponents = pickOpponents(me.rating, allBots, cfg.capacity - 1);

  const problems = await pickProblems(mode, [userId]);
  if (problems.length < 2) throw new Error("not enough problems available to start a match");

  const now = new Date();
  const match = await prisma.match.create({
    data: {
      mode,
      practice: true,
      roundDurationSec: cfg.roundDurationSec,
      players: {
        create: [
          { userId, lastSeenAt: now },
          ...opponents.map((b) => ({ userId: b.id, lastSeenAt: now })),
        ],
      },
      problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
    },
  });

  await withLock(match.id, () => _beginRound(match.id, 0));
  return { matchId: match.id };
}

/** Push the current rematch-offer state to both players of a finished duel. */
function broadcastRematch(matchId: string, participantIds: string[], offeredBy: string[], declined: boolean): void {
  sendToUsers(participantIds, { type: "rematch", matchId, offeredBy, declined });
}

/**
 * Offer — or accept — a rematch of a finished duel. Once both human players
 * have opted in, a fresh match with the exact same two players opens right
 * away. Scoped to DUELs between two humans: the "I'll get you this time"
 * rivalry loop, not a lobby-wide reset. Returns the new match id to the caller
 * once it starts, or `{ waiting: true }` while the opponent hasn't accepted.
 */
export async function offerRematch(matchId: string, userId: string): Promise<{ matchId?: string; waiting: boolean }> {
  return withLock("rematch:" + matchId, async () => {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: { select: { isBot: true } } } } },
    });
    if (!match || match.status !== "FINISHED" || match.mode !== "DUEL") return { waiting: false };
    const humanIds = match.players.filter((p) => !p.user.isBot).map((p) => p.userId);
    if (humanIds.length !== 2 || !humanIds.includes(userId)) return { waiting: false };

    await prisma.matchPlayer.update({
      where: { matchId_userId: { matchId, userId } },
      data: { wantsRematch: true },
    });

    const fresh = await prisma.matchPlayer.findMany({
      where: { matchId, userId: { in: humanIds } },
      select: { userId: true, wantsRematch: true },
    });
    const wanters = fresh.filter((p) => p.wantsRematch).map((p) => p.userId);
    if (wanters.length < humanIds.length) {
      broadcastRematch(matchId, humanIds, wanters, false);
      return { waiting: true };
    }

    // Both in — but neither can already be mid-match (e.g. someone hit Play
    // Again first). If so, hold: the offer stands, nothing double-books.
    const busy = await prisma.matchPlayer.findFirst({
      where: { userId: { in: humanIds }, match: { status: "ACTIVE" } },
      select: { matchId: true },
    });
    if (busy) return { waiting: true };

    // Claim the rematch atomically so two near-simultaneous accepts (possibly
    // on different nodes) can't open two matches — only the clear that flips
    // the flags proceeds.
    const cleared = await prisma.matchPlayer.updateMany({
      where: { matchId, wantsRematch: true },
      data: { wantsRematch: false },
    });
    if (cleared.count === 0) return { waiting: true };

    const problems = await pickProblems("DUEL", humanIds);
    if (problems.length < 2) throw new Error("not enough problems available to start a match");
    const now = new Date();
    const next = await prisma.match.create({
      data: {
        mode: "DUEL",
        practice: match.practice,
        roundDurationSec: MODE_CONFIG.DUEL.roundDurationSec,
        players: { create: humanIds.map((id) => ({ userId: id, lastSeenAt: now })) },
        problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
      },
    });

    sendToUsers(humanIds, { type: "match_found", matchId: next.id, playerIds: humanIds });
    await withLock(next.id, () => _beginRound(next.id, 0));
    return { matchId: next.id, waiting: false };
  });
}

/** Withdraw/decline a rematch: clears both players' intent and tells them. */
export async function declineRematch(matchId: string, userId: string): Promise<void> {
  await withLock("rematch:" + matchId, async () => {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: { select: { isBot: true } } } } },
    });
    if (!match || match.mode !== "DUEL") return;
    const humanIds = match.players.filter((p) => !p.user.isBot).map((p) => p.userId);
    if (!humanIds.includes(userId)) return;
    await prisma.matchPlayer.updateMany({ where: { matchId }, data: { wantsRematch: false } });
    broadcastRematch(matchId, humanIds, [], true);
  });
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

/**
 * The public "Live now" list: in-progress ranked matches anyone can spectate.
 * Practice matches are excluded — they're a solo warm-up against bots, not a
 * competition worth watching, and it keeps the list to real head-to-heads.
 */
export async function getLiveMatches(limit = 20): Promise<LiveMatchSummary[]> {
  const matches = await prisma.match.findMany({
    where: { status: "ACTIVE", practice: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { players: { include: { user: { select: { handle: true, isBot: true } } } }, _count: { select: { problems: true } } },
  });
  return matches.map((m) => {
    const alive = m.players.filter((p) => p.status === "ALIVE");
    return {
      id: m.id,
      mode: m.mode as MatchMode,
      round: m.round,
      totalRounds: m._count.problems,
      players: alive.map((p) => ({ handle: p.user.handle, isBot: p.user.isBot })),
      aliveCount: alive.length,
    };
  });
}

export async function getMatchState(matchId: string): Promise<MatchStateView | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: { select: { handle: true, rating: true, isBot: true } } } } },
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
      isBot: p.user.isBot,
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
    practice: match.practice,
    aiDuel: match.aiDuel,
  };
}

async function broadcastMatchState(matchId: string): Promise<void> {
  const state = await getMatchState(matchId);
  if (!state) return;
  const event = { type: "match_state", match: state } as const;
  sendToUsers(state.players.map((p) => p.userId), event);
  sendToSpectators(matchId, event); // watchers see the same live state
}

/**
 * Push one line to every player's live match feed: who just submitted and the
 * verdict. Fires for wins and misses alike (never the code itself), so the
 * lobby can feel the competition — rivals racing, stumbling, and breaking through.
 */
export async function recordMatchSubmission(matchId: string, userId: string, verdict: string): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, round: true } });
  if (!match || match.status !== "ACTIVE") return;
  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId } },
    include: { user: { select: { handle: true, isBot: true } } },
  });
  if (!player) return;
  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true } });
  const activity = {
    type: "match_activity",
    matchId,
    event: { handle: player.user.handle, isBot: player.user.isBot, verdict, round: match.round, at: new Date().toISOString() },
  } as const;
  sendToUsers(players.map((p) => p.userId), activity);
  sendToSpectators(matchId, activity);
}

// Per-user cooldown on reactions so an emote-spammer can't flood the feed.
// In-memory is fine: reactions are ephemeral, and the worst a lost entry (on a
// restart or across replicas) does is briefly loosen the throttle for one user.
const REACTION_COOLDOWN_MS = 700;
const lastReactionAt = new Map<string, number>();

/**
 * Fire an emote into every participant's match view. Reactions are pure
 * presence — never stored, never rated, and only valid while the match is live
 * and coming from someone actually in it. Returns whether the reaction went out
 * (false = not a participant, match over, unknown emote, or still on cooldown).
 */
export async function recordMatchReaction(matchId: string, userId: string, emoji: unknown): Promise<boolean> {
  const clean = sanitizeReaction(emoji);
  if (!clean) return false;

  const now = Date.now();
  const last = lastReactionAt.get(userId) ?? 0;
  if (now - last < REACTION_COOLDOWN_MS) return false;

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!match || match.status !== "ACTIVE") return false;
  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId } },
    include: { user: { select: { handle: true, isBot: true } } },
  });
  if (!player) return false;

  lastReactionAt.set(userId, now);
  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true } });
  const reaction = {
    type: "match_reaction",
    matchId,
    reaction: { handle: player.user.handle, isBot: player.user.isBot, emoji: clean, at: new Date(now).toISOString() },
  } as const;
  sendToUsers(players.map((p) => p.userId), reaction);
  sendToSpectators(matchId, reaction);
  return true;
}

/** Fan a reaction out on a bot's behalf, skipping the human-facing cooldown. */
async function sendBotReaction(matchId: string, botId: string, handle: string, emoji: MatchReactionEmoji): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!match || match.status !== "ACTIVE") return;
  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true } });
  const reaction = {
    type: "match_reaction",
    matchId,
    reaction: { handle, isBot: true, emoji, at: new Date().toISOString() },
  } as const;
  sendToUsers(players.map((p) => p.userId), reaction);
  sendToSpectators(matchId, reaction);
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

  // Drive any bots in the match — practice matches, or a ranked queue that was
  // backfilled with bots. No-ops cheaply when the match is all humans.
  await scheduleBotsForRound(matchId, round, match.roundDurationSec);
}

/**
 * Schedule every alive bot's play for the round: some wrong attempts, then
 * (maybe) an accepted solve at a skill-appropriate time. Each action is a timer
 * that re-validates the match is still on this exact round before touching the
 * DB, so a bot can never act on a round that already advanced.
 */
async function scheduleBotsForRound(matchId: string, round: number, roundDurationSec: number): Promise<void> {
  const problem = await loadProblemForRound(matchId, round);
  if (!problem) return;
  const bots = await prisma.matchPlayer.findMany({
    where: { matchId, status: "ALIVE", user: { isBot: true } },
    include: { user: { select: { id: true, handle: true, rating: true, botModel: true } } },
  });

  const scheduled: ReturnType<typeof setTimeout>[] = [];
  const arm = (delayMs: number, fn: () => Promise<void>) => {
    const t = setTimeout(() => {
      fn().catch((err) => console.error("bot action error", err));
    }, Math.max(0, delayMs));
    t.unref?.();
    scheduled.push(t);
  };

  for (const bot of bots) {
    // AI opponents don't fake a verdict — they write real code that the judge
    // grades. After an effort-appropriate "thinking" pause, kick the first
    // attempt; wrong verdicts drive retries via onAiSubmissionJudged.
    if (bot.user.botModel) {
      const difficulty = await aiDifficultyFor(matchId);
      arm(EFFORT[difficulty].thinkMsFloor, () => kickAiOpponent(matchId, round, bot.user.id, difficulty));
      continue;
    }
    const persona = personaFor(bot.user.id);
    const plan = botRoundPlan(bot.user.rating, problem.ratingValue, roundDurationSec, persona);
    for (const wrongAt of plan.wrongAtMs) {
      arm(wrongAt, () => botSubmit(matchId, round, bot.user.id, problem.id, "WRONG_ANSWER"));
    }
    if (plan.solves && plan.solveAtMs != null) {
      arm(plan.solveAtMs, () => botSubmit(matchId, round, bot.user.id, problem.id, "ACCEPTED"));
      // A little celebration a beat after landing the solve — presence, not spam.
      arm(plan.solveAtMs + 900, () => sendBotReaction(matchId, bot.user.id, bot.user.handle, "🎉"));
    } else if (plan.wrongAtMs.length >= 2) {
      // Been fighting this one for a while and it's not going well — an "oof".
      arm(plan.wrongAtMs[1] + 400, () => sendBotReaction(matchId, bot.user.id, bot.user.handle, "😅"));
    }
  }
  // Replace (not append) — the previous round's pending timers were cleared on transition.
  botTimers.set(matchId, scheduled);
}

/**
 * A bot "submits". Guarded: only writes if the match is still ACTIVE and on the
 * same round the action was scheduled for. An accepted submission then drives
 * the same round engine a human's solve would.
 */
async function botSubmit(
  matchId: string,
  round: number,
  botId: string,
  problemId: string,
  verdict: "ACCEPTED" | "WRONG_ANSWER",
): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, round: true } });
  if (!match || match.status !== "ACTIVE" || match.round !== round) return;
  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId: botId } },
    select: { status: true },
  });
  if (!player || player.status !== "ALIVE") return;

  await prisma.submission.create({
    data: {
      userId: botId,
      problemId,
      matchId,
      language: "cpp",
      source: "// practice bot",
      verdict,
      rated: false,
      // No real timing — leaves bots off the fastest-runtime board too.
      judgedAt: new Date(),
    },
  });
  await recordMatchSubmission(matchId, botId, verdict);
  if (verdict === "ACCEPTED") await onAccepted(matchId);
}

// ── AI opponent (real code, real judge) ─────────────────────────────────────

/** The AI opponent's effort setting for a match (defaults to medium). */
async function aiDifficultyFor(matchId: string): Promise<AiDifficulty> {
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { aiDifficulty: true } });
  return isAiDifficulty(m?.aiDifficulty) ? m!.aiDifficulty as AiDifficulty : "med";
}

/** Provision (once) the AI-opponent bot user for a given model. */
async function ensureAiOpponent(model: AiModel): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { isBot: true, botModel: model.key }, select: { id: true } });
  if (existing) return existing.id;
  const base = { email: `bot+ai+${model.key}@codearena.local`, isBot: true, botModel: model.key, rating: 1600 };
  try {
    const created = await prisma.user.create({ data: { handle: model.name, ...base }, select: { id: true } });
    return created.id;
  } catch {
    // Handle collision (two models sharing a display name) — disambiguate.
    const created = await prisma.user.create({
      data: { handle: `${model.name} ·${model.key.slice(-4)}`, ...base },
      select: { id: true },
    });
    return created.id;
  }
}

/** Load the full problem view (statement + samples) the model needs to solve. */
async function loadAiProblem(matchId: string, round: number): Promise<AiProblem | null> {
  const mp = await prisma.matchProblem.findUnique({
    where: { matchId_round: { matchId, round } },
    include: {
      problem: {
        select: {
          id: true, slug: true, title: true, statement: true,
          samples: { orderBy: { ordinal: "asc" }, select: { input: true, output: true } },
        },
      },
    },
  });
  if (!mp) return null;
  return {
    id: mp.problem.id,
    slug: mp.problem.slug,
    title: mp.problem.title,
    statement: mp.problem.statement,
    samples: mp.problem.samples.map((s) => ({ input: s.input, output: s.output })),
  };
}

/**
 * The AI opponent takes a turn: ask the model for a program, then submit that
 * real code through the same judge queue a human uses. The verdict comes back
 * asynchronously via the judge → verdict subscriber, which drives the match
 * exactly as a human solve would (and calls onAiSubmissionJudged for retries).
 * Re-validates the match/round/liveness both before and after the model call,
 * since generation can take seconds during which the round may have ended.
 */
async function kickAiOpponent(
  matchId: string,
  round: number,
  botId: string,
  difficulty: AiDifficulty,
  feedback?: AiFeedback,
): Promise<void> {
  if (!(await stillAiTurn(matchId, round, botId))) return;
  const bot = await prisma.user.findUnique({ where: { id: botId }, select: { botModel: true } });
  const model = bot?.botModel ? modelByKey(bot.botModel) : undefined;
  if (!model) return; // this opponent's model is no longer configured
  const problem = await loadAiProblem(matchId, round);
  if (!problem) return;

  const solution = await generateSolution(model, problem, difficulty, feedback);
  if (!solution) return; // couldn't get a runnable answer this attempt — sit the turn out
  if (!(await stillAiTurn(matchId, round, botId))) return; // round moved on while thinking

  const submission = await prisma.submission.create({
    data: { userId: botId, problemId: problem.id, matchId, language: solution.language, source: solution.source, rated: false },
  });
  await judgeQueue.add("judge", { submissionId: submission.id }, { removeOnComplete: 1000, removeOnFail: 1000 });
}

/** True only while it's still this AI bot's live round to act on. */
async function stillAiTurn(matchId: string, round: number, botId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, round: true } });
  if (!match || match.status !== "ACTIVE" || match.round !== round) return false;
  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId: botId } },
    select: { status: true },
  });
  return player?.status === "ALIVE";
}

/**
 * Called when an AI opponent's submission is judged (from the verdict
 * subscriber). On a non-accepted verdict it spends a retry from the effort
 * budget — feeding the failure back so the model iterates — up to the tier's
 * cap. Stale verdicts (from a round that already ended) are ignored.
 */
export async function onAiSubmissionJudged(
  matchId: string,
  botId: string,
  verdict: string,
  submittedAt: Date,
): Promise<void> {
  if (verdict === "ACCEPTED") return; // the accept path already advanced the round
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true, round: true, roundStartedAt: true, aiDifficulty: true },
  });
  if (!match || match.status !== "ACTIVE") return;
  if (submittedAt < match.roundStartedAt) return; // belongs to a round that already ended

  const difficulty: AiDifficulty = isAiDifficulty(match.aiDifficulty) ? match.aiDifficulty : "med";
  const problem = await loadAiProblem(matchId, match.round);
  if (!problem) return;

  // Attempts already spent this round = this bot's submissions since it started.
  const attempts = await prisma.submission.count({
    where: { matchId, userId: botId, createdAt: { gte: match.roundStartedAt } },
  });
  if (attempts > EFFORT[difficulty].retryBudget) return; // budget exhausted — concede the round

  const sample = problem.samples[0];
  const feedback: AiFeedback = { verdict, sample: sample ? { input: sample.input, expected: sample.output } : undefined };
  await kickAiOpponent(matchId, match.round, botId, difficulty, feedback);
}

/**
 * Start an unrated "Challenge the AI" duel: the human vs one LLM opponent that
 * writes real, judged code. Unrated for the human ladder (like practice);
 * tracked separately via the aiDuel flag.
 */
export async function startAiMatch(
  userId: string,
  difficulty: AiDifficulty,
): Promise<{ matchId: string }> {
  const model = houseModel();
  if (!model) throw new Error("AI opponent is not configured");

  const live = await prisma.matchPlayer.findFirst({
    where: { userId, match: { status: "ACTIVE" } },
    select: { matchId: true },
  });
  if (live) return { matchId: live.matchId };

  const cfg = MODE_CONFIG.DUEL;
  const opponentId = await ensureAiOpponent(model);
  // A "Challenge the AI" duel is a single problem — first to solve it wins.
  // (The clinch/finish logic keys off the actual problem count, so one problem
  // means the first accepted solution takes the match.)
  const problems = await pickProblems("DUEL", [userId], 1);
  if (problems.length < 1) throw new Error("not enough problems available to start a match");

  const now = new Date();
  const match = await prisma.match.create({
    data: {
      mode: "DUEL",
      practice: true, // unrated for the human ladder
      aiDuel: true,
      aiDifficulty: difficulty,
      roundDurationSec: cfg.roundDurationSec,
      players: {
        create: [
          { userId, lastSeenAt: now },
          { userId: opponentId, lastSeenAt: now },
        ],
      },
      problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
    },
  });

  await withLock(match.id, () => _beginRound(match.id, 0));
  return { matchId: match.id };
}

/**
 * Start a model-vs-model exhibition duel: two AI opponents, no human, both at
 * full effort. Feeds the AI-vs-AI board. Reuses the same engine as any duel —
 * each bot writes real code that the judge grades, first accepted takes the round.
 */
export async function startAiVsAiMatch(a: AiModel, b: AiModel): Promise<{ matchId: string }> {
  const [idA, idB] = await Promise.all([ensureAiOpponent(a), ensureAiOpponent(b)]);
  const cfg = MODE_CONFIG.DUEL;
  const problems = await pickProblems("DUEL");
  if (problems.length < 2) throw new Error("not enough problems available to start a match");

  const now = new Date();
  const match = await prisma.match.create({
    data: {
      mode: "DUEL",
      practice: true,
      aiVsAi: true,
      aiDifficulty: "hard", // both models at full effort — a fair comparison
      roundDurationSec: cfg.roundDurationSec,
      players: {
        create: [
          { userId: idA, lastSeenAt: now },
          { userId: idB, lastSeenAt: now },
        ],
      },
      problems: { create: problems.map((p, i) => ({ problemId: p.id, round: i })) },
    },
  });

  await withLock(match.id, () => _beginRound(match.id, 0));
  return { matchId: match.id };
}

/**
 * Periodic driver for AI-vs-AI exhibition matches. Env-gated (off by default,
 * since it spends model budget) and needs at least two configured models. Runs
 * at most one exhibition at a time so cost stays bounded: it no-ops while one is
 * still live, and otherwise pairs the two least-recently-played models.
 */
export async function sweepAiVsAi(): Promise<void> {
  if (!env.AI_VS_AI_ENABLED) return;
  const models = houseModel() ? aiModels() : [];
  if (models.length < 2) return;

  // At most one exhibition in flight.
  const live = await prisma.match.count({ where: { aiVsAi: true, status: "ACTIVE" } });
  if (live > 0) return;

  // Pair the two models whose opponent bots have gone longest without a match
  // (fresh models, never provisioned, sort first), for even coverage.
  const bots = await prisma.user.findMany({
    where: { isBot: true, botModel: { in: models.map((m) => m.key) } },
    select: { id: true, botModel: true },
  });
  const lastPlayedByKey = new Map<string, number>();
  for (const bot of bots) {
    const last = await prisma.matchPlayer.findFirst({
      where: { userId: bot.id, match: { aiVsAi: true } },
      orderBy: { match: { createdAt: "desc" } },
      select: { match: { select: { createdAt: true } } },
    });
    if (bot.botModel) lastPlayedByKey.set(bot.botModel, last?.match.createdAt.getTime() ?? 0);
  }
  const ranked = [...models].sort(
    (m1, m2) => (lastPlayedByKey.get(m1.key) ?? 0) - (lastPlayedByKey.get(m2.key) ?? 0),
  );
  await startAiVsAiMatch(ranked[0], ranked[1]).catch((err) => console.error("ai-vs-ai start failed", err));
}

/**
 * Rate a finished match: turn final placements into Elo deltas (reusing the
 * contest recompute) and persist them on both the player rows and User.rating.
 * Placement ties share a rank, so a duel draw is a no-op wash — as it should be.
 */
async function _applyMatchRatings(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { practice: true } });
  if (match?.practice) return; // practice matches are unrated — nobody's ladder moves
  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    include: { user: { select: { rating: true, isBot: true } } },
  });
  // Bots (present only when a ranked queue was backfilled) are excluded and the
  // humans are re-ranked among themselves — you can't win or lose rating to a
  // seat-filler, and a lone human is left unrated.
  const ratingById = new Map(players.map((p) => [p.userId, p.user.rating]));
  const ranks = humanRatingRanks(players.map((p) => ({ userId: p.userId, isBot: p.user.isBot, placement: p.placement })));
  if (ranks.length < 2) return;
  const participants = ranks.map((r) => ({ userId: r.userId, rating: ratingById.get(r.userId)!, rank: r.rank }));

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

  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true, eliminatedRound: true } });
  const placements = placementsByElimination(players, winnerIds);
  await prisma.$transaction(
    Object.entries(placements).map(([userId, placement]) =>
      prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId } }, data: { placement } }),
    ),
  );

  await _settleFinished(matchId);
}

/** DUEL: rank by round wins — every player on the top score shares placement 1 (a draw). */
async function _finishDuel(matchId: string): Promise<void> {
  clearMatchTimer(matchId);
  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", endedAt: new Date() } });

  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true, roundWins: true } });
  const placements = placementsByScore(players);
  await prisma.$transaction(
    Object.entries(placements).map(([userId, placement]) =>
      prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId } }, data: { placement } }),
    ),
  );

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
  const isLastRound = match.round + 1 >= totalRounds;

  if (wins >= winsToClinch(totalRounds) || isLastRound) {
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
  const alive = await prisma.matchPlayer.findMany({
    where: { matchId, status: "ALIVE" },
    include: { user: { select: { isBot: true } } },
  });
  // Bots have no heartbeat — they never forfeit.
  const stale = alive.filter((p) => !p.user.isBot && (p.lastSeenAt?.getTime() ?? 0) < cutoff);
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
      const all = await prisma.matchPlayer.findMany({ where: { matchId }, select: { userId: true, roundWins: true } });
      const placements = placementsByScore(all);
      await prisma.$transaction(
        Object.entries(placements).map(([userId, placement]) =>
          prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId } }, data: { placement } }),
        ),
      );
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
