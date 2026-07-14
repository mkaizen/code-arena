import { describe, it, expect } from "vitest";
import { botRoundPlan, personaFor, pickOpponents, type BotPersona } from "./bots.js";

/** Deterministic 0..1 RNG so behaviour is reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solveRate(botRating: number, problemRating: number, persona: BotPersona = "steady"): number {
  const rng = mulberry32(12345);
  let solved = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (botRoundPlan(botRating, problemRating, 300, persona, rng).solves) solved++;
  return solved / N;
}

describe("botRoundPlan", () => {
  it("a strong bot almost always solves an easy problem", () => {
    expect(solveRate(2000, 800)).toBeGreaterThan(0.9);
  });

  it("a weak bot rarely solves a hard problem", () => {
    expect(solveRate(1000, 1900)).toBeLessThan(0.25);
  });

  it("an even matchup is roughly a coin flip", () => {
    const r = solveRate(1500, 1500);
    expect(r).toBeGreaterThan(0.35);
    expect(r).toBeLessThan(0.65);
  });

  it("solve time always lands strictly inside the round", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const plan = botRoundPlan(1400 + i, 1200, 300, "steady", rng);
      if (plan.solves) {
        expect(plan.solveAtMs!).toBeGreaterThan(0);
        expect(plan.solveAtMs!).toBeLessThan(300_000);
      }
    }
  });

  it("wrong attempts precede the accepted solve", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const plan = botRoundPlan(1600, 1300, 300, "grinder", rng);
      if (plan.solves) {
        for (const w of plan.wrongAtMs) expect(w).toBeLessThanOrEqual(plan.solveAtMs!);
      }
    }
  });

  it("a comfortable margin solves faster on average than a stretch", () => {
    const rng = mulberry32(3);
    const avg = (bot: number, prob: number) => {
      let sum = 0, n = 0;
      for (let i = 0; i < 3000; i++) {
        const p = botRoundPlan(bot, prob, 300, "steady", rng);
        if (p.solves) { sum += p.solveAtMs!; n++; }
      }
      return sum / n;
    };
    const comfortable = avg(1800, 1000); // +800
    const stretch = avg(1200, 1000); // +200
    expect(comfortable).toBeLessThan(stretch);
  });

  it("persona is stable for a given identity", () => {
    expect(personaFor("bot_nova")).toBe(personaFor("bot_nova"));
  });
});

describe("pickOpponents", () => {
  it("picks the bots closest in rating to the human", () => {
    const bots = [{ rating: 900 }, { rating: 1450 }, { rating: 1520 }, { rating: 2100 }, { rating: 1600 }];
    const picked = pickOpponents(1500, bots, 3).map((b) => b.rating).sort((a, b) => a - b);
    expect(picked).toEqual([1450, 1520, 1600]);
  });
});
