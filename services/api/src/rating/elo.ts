/**
 * Implemented (was TODO): rating recompute after a rated contest (FR-21).
 *
 * Codeforces-style approach: each participant's "seed" is their expected rank
 * given everyone's pre-contest rating (sum of pairwise Elo win probabilities).
 * The target rating is found by matching the geometric mean of seed and actual
 * rank, then the delta is halved for stability. Deterministic & reproducible
 * from the standings (NFR-6).
 */
export interface Participant {
  userId: string;
  rating: number;
  /** 1-based final rank in the contest (ties share the lower rank). */
  rank: number;
}

export interface RatingDelta {
  userId: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * Ratings never fall below this floor. Matches the lowest tier ("Newbie", min 0)
 * in packages/shared/tiers.ts — a negative rating maps to no tier and is
 * meaningless. Without this, a bot that keeps losing (plus the zero-sum
 * correction applied to the whole field) can be dragged below zero.
 */
export const RATING_FLOOR = 0;

function winProb(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function seed(rating: number, others: Participant[], selfId: string): number {
  // Expected rank = 1 + sum of win probabilities of every *other* player over self.
  let s = 1;
  for (const o of others) if (o.userId !== selfId) s += winProb(o.rating, rating);
  return s;
}

/** Rating that would make `seed` equal to the target rank `m`, via binary search. */
function ratingForSeed(m: number, others: Participant[], selfId: string): number {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (seed(mid, others, selfId) < m) hi = mid;
    else lo = mid;
  }
  return lo;
}

export function recomputeRatings(participants: Participant[]): RatingDelta[] {
  const n = participants.length;
  if (n === 0) return [];

  const deltas = participants.map((p) => {
    const s = seed(p.rating, participants, p.userId);
    const mid = Math.sqrt(s * p.rank); // geometric mean of seed and actual rank
    const target = ratingForSeed(mid, participants, p.userId);
    return { p, delta: Math.round((target - p.rating) / 2) };
  });

  // Zero-sum correction: keep the aggregate roughly conserved.
  const totalShift = deltas.reduce((acc, d) => acc + d.delta, 0);
  const correction = -Math.trunc(totalShift / n);

  return deltas.map(({ p, delta }) => {
    const adjusted = delta + correction;
    // Clamp to the floor and derive the reported delta from the applied value so
    // `before + delta === after` always holds even when the floor bites.
    const after = Math.max(RATING_FLOOR, p.rating + adjusted);
    return { userId: p.userId, before: p.rating, after, delta: after - p.rating };
  });
}
