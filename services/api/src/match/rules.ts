/**
 * Pure match-outcome rules, factored out of the DB-coupled engine so they can
 * be unit-tested in isolation. No prisma, no timers, no side effects.
 */

/** DUEL: round wins needed to clinch a best-of-N (majority). */
export function winsToClinch(totalRounds: number): number {
  return Math.floor(totalRounds / 2) + 1;
}

/**
 * ROYALE final ranking. Winners share placement 1; everyone else is ranked by
 * how far they got — a later elimination round is a better placement, and
 * players knocked out in the same round share a rank (standard competition
 * ranking, so the next rank skips by the size of the tie group).
 */
export function placementsByElimination(
  players: { userId: string; eliminatedRound: number | null }[],
  winnerIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const winners = new Set(winnerIds);
  for (const id of winnerIds) out[id] = 1;

  const byRound = new Map<number, string[]>();
  for (const p of players) {
    if (winners.has(p.userId)) continue;
    const r = p.eliminatedRound ?? -1;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(p.userId);
  }

  let placement = winnerIds.length + 1;
  for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
    const ids = byRound.get(round)!;
    for (const id of ids) out[id] = placement;
    placement += ids.length;
  }
  return out;
}

/**
 * Rating inputs for a match that may include practice bots as seat-fillers
 * (a ranked queue that timed out and was backfilled). Bots never move on the
 * ladder and a human should never gain or lose rating to one, so they're
 * dropped here; the remaining humans are re-ranked contiguously among
 * themselves (standard competition ranking, ties preserved) so the Elo math
 * sees a clean human-only field. A single human left over has nobody to be
 * rated against, so the caller treats fewer than two as unrated.
 */
export function humanRatingRanks(
  players: { userId: string; isBot: boolean; placement: number | null }[],
): { userId: string; rank: number }[] {
  const humans = players.filter(
    (p): p is { userId: string; isBot: boolean; placement: number } => !p.isBot && p.placement != null,
  );
  return humans.map((p) => ({
    userId: p.userId,
    rank: 1 + humans.filter((q) => q.placement < p.placement).length,
  }));
}

/**
 * Score an AI-vs-AI round on correctness, not submission speed: a model wins the
 * round only when it is the *sole* solver. If both models solve (both capable)
 * or neither does, the round is a draw — so a couple of seconds of API latency
 * can't decide who's the better coder.
 */
export function aiVsAiRoundWinner(solvedBotIds: string[]): string | null {
  return solvedBotIds.length === 1 ? solvedBotIds[0] : null;
}

/**
 * Rating ranks over *every* placed player (bots included) — used to rate the
 * two models in an AI-vs-AI exhibition against each other. Ties share the lower
 * rank, so a drawn exhibition is a rating wash.
 */
export function placementRanks(
  players: { userId: string; placement: number | null }[],
): { userId: string; rank: number }[] {
  const placed = players.filter(
    (p): p is { userId: string; placement: number } => p.placement != null,
  );
  return placed.map((p) => ({
    userId: p.userId,
    rank: 1 + placed.filter((q) => q.placement < p.placement).length,
  }));
}

/**
 * DUEL final ranking by round wins (most wins first). Equal wins share a rank,
 * so two players on the same score both get placement 1 — a draw.
 */
export function placementsByScore(players: { userId: string; roundWins: number }[]): Record<string, number> {
  const sorted = [...players].sort((a, b) => b.roundWins - a.roundWins);
  const out: Record<string, number> = {};
  let placement = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].roundWins < sorted[i - 1].roundWins) placement = i + 1;
    out[sorted[i].userId] = placement;
  }
  return out;
}
