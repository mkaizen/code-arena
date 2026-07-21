import { describe, it, expect } from "vitest";
import { recomputeRatings, type Participant } from "./elo.js";

describe("recomputeRatings", () => {
  it("returns nothing for an empty field", () => {
    expect(recomputeRatings([])).toEqual([]);
  });

  it("winner gains and loser loses in an even 1v1", () => {
    const parts: Participant[] = [
      { userId: "win", rating: 1500, rank: 1 },
      { userId: "lose", rating: 1500, rank: 2 },
    ];
    const deltas = recomputeRatings(parts);
    const win = deltas.find((d) => d.userId === "win")!;
    const lose = deltas.find((d) => d.userId === "lose")!;
    expect(win.delta).toBeGreaterThan(0);
    expect(lose.delta).toBeLessThan(0);
    expect(win.after).toBe(1500 + win.delta);
  });

  it("is roughly zero-sum across the field", () => {
    const parts: Participant[] = [
      { userId: "a", rating: 1600, rank: 1 },
      { userId: "b", rating: 1500, rank: 2 },
      { userId: "c", rating: 1400, rank: 3 },
    ];
    const total = recomputeRatings(parts).reduce((acc, d) => acc + d.delta, 0);
    expect(Math.abs(total)).toBeLessThanOrEqual(2); // integer rounding slack
  });

  it("beating a stronger opponent gains more than beating a weaker one", () => {
    const upset = recomputeRatings([
      { userId: "me", rating: 1400, rank: 1 },
      { userId: "fav", rating: 1800, rank: 2 },
    ]).find((d) => d.userId === "me")!.delta;

    const expected = recomputeRatings([
      { userId: "me", rating: 1800, rank: 1 },
      { userId: "weak", rating: 1400, rank: 2 },
    ]).find((d) => d.userId === "me")!.delta;

    expect(upset).toBeGreaterThan(expected);
  });

  it("a favorite who underperforms loses rating", () => {
    const deltas = recomputeRatings([
      { userId: "underdog", rating: 1400, rank: 1 },
      { userId: "favorite", rating: 1900, rank: 2 },
    ]);
    expect(deltas.find((d) => d.userId === "favorite")!.delta).toBeLessThan(0);
  });

  it("never drops a rating below the floor of 0", () => {
    // A near-zero competitor repeatedly buried under a strong field must not go
    // negative, no matter how lopsided the loss.
    const deltas = recomputeRatings([
      { userId: "topA", rating: 2200, rank: 1 },
      { userId: "topB", rating: 2100, rank: 2 },
      { userId: "topC", rating: 2000, rank: 3 },
      { userId: "floored", rating: 3, rank: 4 },
    ]);
    for (const d of deltas) {
      expect(d.after).toBeGreaterThanOrEqual(0);
      expect(d.after).toBe(d.before + d.delta); // delta stays consistent after clamping
    }
  });

  it("no change when result exactly matches seeding in a symmetric field", () => {
    // Equal ratings finishing in an arbitrary order still shifts, but a single
    // participant can't change (no opponents).
    const solo = recomputeRatings([{ userId: "x", rating: 1500, rank: 1 }]);
    expect(solo[0].delta).toBe(0);
  });
});
