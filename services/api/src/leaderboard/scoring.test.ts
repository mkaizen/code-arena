import { describe, it, expect } from "vitest";
import { scoreStanding, type StandingSubmission } from "./scoring.js";

const START = Date.UTC(2026, 0, 1, 12, 0, 0); // contest start
// Build a submission `min` minutes (+ optional seconds) after the start.
const at = (min: number, sec = 0): Date => new Date(START + min * 60_000 + sec * 1000);
const sub = (problemId: string, verdict: string, min: number, sec = 0): StandingSubmission => ({
  problemId,
  verdict,
  createdAt: at(min, sec),
});

describe("scoreStanding — ICPC penalty math", () => {
  it("scores nothing for no submissions", () => {
    expect(scoreStanding([], START)).toEqual({ solved: 0, penalty: 0 });
  });

  it("a clean solve costs only the minutes from start", () => {
    expect(scoreStanding([sub("A", "ACCEPTED", 5)], START)).toEqual({ solved: 1, penalty: 5 });
  });

  it("adds 20 penalty per wrong attempt made before the solve", () => {
    const subs = [
      sub("A", "WRONG_ANSWER", 2),
      sub("A", "RUNTIME_ERROR", 3),
      sub("A", "ACCEPTED", 10),
    ];
    // 10 minutes + 2 wrong * 20
    expect(scoreStanding(subs, START)).toEqual({ solved: 1, penalty: 50 });
  });

  it("ignores submissions after the first accept (no double-count, no extra penalty)", () => {
    const subs = [
      sub("A", "ACCEPTED", 5),
      sub("A", "WRONG_ANSWER", 6), // a stray later sub must not add penalty
      sub("A", "ACCEPTED", 7),
    ];
    expect(scoreStanding(subs, START)).toEqual({ solved: 1, penalty: 5 });
  });

  it("charges nothing for wrong attempts on a problem that is never solved", () => {
    const subs = [
      sub("A", "WRONG_ANSWER", 4),
      sub("A", "TIME_LIMIT_EXCEEDED", 8),
    ];
    expect(scoreStanding(subs, START)).toEqual({ solved: 0, penalty: 0 });
  });

  it("sums independent problems", () => {
    const subs = [
      sub("A", "WRONG_ANSWER", 1),
      sub("A", "ACCEPTED", 3), // 3 + 20 = 23
      sub("B", "ACCEPTED", 12), // 12
    ];
    expect(scoreStanding(subs, START)).toEqual({ solved: 2, penalty: 35 });
  });

  it("floors the solve time to whole minutes", () => {
    // 5m59s after start still counts as 5 minutes of penalty.
    expect(scoreStanding([sub("A", "ACCEPTED", 5, 59)], START)).toEqual({ solved: 1, penalty: 5 });
  });
});
