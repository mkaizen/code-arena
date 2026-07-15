import { describe, it, expect } from "vitest";
import { pickLadder, type LadderProblem } from "./ladder.js";

// A pool of 12 problems with distinct, ascending ratings (p0=1000 … p11=2100).
const POOL: LadderProblem[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  ratingValue: 1000 + i * 100,
}));

// Deterministic rng that replays a fixed sequence of [0,1) values.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("pickLadder", () => {
  it("returns the whole pool (easy → hard) when it can't be banded", () => {
    const pool = POOL.slice(0, 4);
    expect(pickLadder(pool, 6, seq([0.5]))).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("picks exactly `want` problems, one per band", () => {
    const ids = pickLadder(POOL, 6, seq([0.5]));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6); // no dupes — bands don't overlap
  });

  it("always ramps easy → hard regardless of the draws", () => {
    const ids = pickLadder(POOL, 6, seq([0.99, 0, 0.99, 0, 0.99, 0]));
    const ratings = ids.map((id) => POOL.find((p) => p.id === id)!.ratingValue);
    for (let i = 1; i < ratings.length; i++) expect(ratings[i]).toBeGreaterThanOrEqual(ratings[i - 1]);
  });

  it("draws the low or high end of each band as the rng dictates", () => {
    // 12 problems, want 6 → bands of 2: [p0,p1],[p2,p3],…,[p10,p11].
    expect(pickLadder(POOL, 6, seq([0]))).toEqual(["p0", "p2", "p4", "p6", "p8", "p10"]);
    expect(pickLadder(POOL, 6, seq([0.99]))).toEqual(["p1", "p3", "p5", "p7", "p9", "p11"]);
  });

  it("gives different ladders for different rng streams (variety)", () => {
    const a = pickLadder(POOL, 6, seq([0]));
    const b = pickLadder(POOL, 6, seq([0.99]));
    expect(a).not.toEqual(b);
  });

  it("stays within bounds when want does not divide the pool evenly", () => {
    const ids = pickLadder(POOL, 5, seq([0.99])); // 12 / 5 → uneven bands
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids.every((id) => POOL.some((p) => p.id === id))).toBe(true);
  });
});
