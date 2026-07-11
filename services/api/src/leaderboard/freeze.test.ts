import { describe, it, expect, vi } from "vitest";

// isFrozen and packScore are pure, but freeze.ts imports the Prisma + Redis
// clients at load (used by the I/O helpers), which parse required env. Stub them
// so the pure functions can be tested without a database or broker.
vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../redis.js", () => ({ redis: {} }));

const { isFrozen, packScore } = await import("./freeze.js");

// Contest: starts at t0, runs 120 min, freezes for the final 30.
const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const contest = { startsAt: new Date(t0), durationSec: 120 * 60, freezeSec: 30 * 60 };
const at = (min: number): Date => new Date(t0 + min * 60_000);

describe("isFrozen — freeze-window boundaries", () => {
  it("is not frozen before the freeze window opens", () => {
    expect(isFrozen(contest, at(89))).toBe(false); // freeze opens at minute 90
  });

  it("is frozen at the instant the window opens (inclusive)", () => {
    expect(isFrozen(contest, at(90))).toBe(true);
  });

  it("is frozen inside the window", () => {
    expect(isFrozen(contest, at(105))).toBe(true);
  });

  it("is not frozen once the contest ends (end is exclusive)", () => {
    expect(isFrozen(contest, at(120))).toBe(false);
  });

  it("is not frozen after the contest ends", () => {
    expect(isFrozen(contest, at(200))).toBe(false);
  });

  it("is not frozen before it starts", () => {
    expect(isFrozen(contest, at(-5))).toBe(false);
  });
});

describe("packScore — sorted-set ordering", () => {
  it("ranks more solved above fewer, regardless of penalty", () => {
    // 1 solve with a huge penalty must still outrank 0 solves.
    expect(packScore(1, 999)).toBeGreaterThan(packScore(0, 0));
    expect(packScore(3, 500)).toBeGreaterThan(packScore(2, 0));
  });

  it("ranks lower penalty above higher at equal solves", () => {
    expect(packScore(2, 40)).toBeGreaterThan(packScore(2, 100));
  });

  it("round-trips: solved and penalty are recoverable from the packed score", () => {
    for (const [solved, penalty] of [[0, 0], [1, 5], [3, 240], [5, 999]] as const) {
      const score = packScore(solved, penalty);
      expect(Math.round(score / 1e7)).toBe(solved);
      expect(solved * 1e7 - score).toBe(penalty);
    }
  });
});
