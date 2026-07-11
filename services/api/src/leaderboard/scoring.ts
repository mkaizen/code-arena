/**
 * Pure ICPC-style contest scoring — no I/O — so the penalty arithmetic can be
 * unit-tested in isolation and reused apart from the verdict pipeline.
 *
 * Rules: a problem scores once, on its first ACCEPTED submission. A solved
 * problem's penalty is the whole minutes from contest start to that solve, plus
 * 20 for each wrong attempt *before* the solve. Wrong attempts on problems that
 * are never solved cost nothing (standard ICPC convention).
 */
export interface StandingSubmission {
  problemId: string;
  verdict: string;
  createdAt: Date;
}

/**
 * @param subs Submissions for one user in one contest, in chronological order
 *             (the DB query that feeds this sorts by `createdAt` ascending).
 * @param startMs Contest start, epoch millis.
 */
export function scoreStanding(
  subs: StandingSubmission[],
  startMs: number,
): { solved: number; penalty: number } {
  const perProblem = new Map<string, { tries: number; solvedAt: number | null }>();
  for (const s of subs) {
    let p = perProblem.get(s.problemId);
    if (!p) {
      p = { tries: 0, solvedAt: null };
      perProblem.set(s.problemId, p);
    }
    if (p.solvedAt !== null) continue; // already solved — later subs don't count
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
