/**
 * Pure match problem-ladder selection, factored out of the DB-coupled engine so
 * it can be unit-tested in isolation. No prisma, no randomness beyond an
 * injectable rng.
 */

export interface LadderProblem {
  id: string;
  ratingValue: number;
}

/**
 * Build an ascending-difficulty ladder of `want` problems, with variety. The
 * pool is sorted by rating and split into `want` contiguous difficulty bands,
 * and one problem is drawn at random from each band. Consecutive bands never
 * overlap in rating, so the ladder always ramps easy → hard while differing
 * from match to match (unlike picking the flat `want` easiest every time).
 *
 * When the pool is too small to band (`<= want` problems), every problem is
 * used, sorted easy → hard — there's nothing to randomize.
 */
export function pickLadder(
  pool: LadderProblem[],
  want: number,
  rng: () => number = Math.random,
): string[] {
  const sorted = [...pool].sort((a, b) => a.ratingValue - b.ratingValue);
  if (sorted.length <= want) return sorted.map((p) => p.id);

  const out: string[] = [];
  for (let i = 0; i < want; i++) {
    // Half-open band [start, end) of the rating-sorted pool. With
    // sorted.length > want, every band holds at least one problem.
    const start = Math.floor((i * sorted.length) / want);
    const end = Math.floor(((i + 1) * sorted.length) / want);
    const idx = start + Math.floor(rng() * (end - start));
    out.push(sorted[idx].id);
  }
  return out;
}
